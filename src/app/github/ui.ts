// src/app/github/ui.ts
// GitHub panel orchestration: token auth, repo/branch pickers, folder browser, and commit flows.
// - Bridges GitHub interactions with plugin storage and export preferences
// - Keeps DOM event wiring resilient across optional UI states

import type { PluginToUi, UiToPlugin, GithubScope, GithubRepoListErrorReason } from '../messages';
import type { GithubFilenameValidation } from './filenames';
import { DEFAULT_GITHUB_FILENAME, validateGithubFilename } from './filenames';

type FolderListEntry = { type: 'dir' | 'file'; name: string; path?: string };

type GithubUiDependencies = {
  postToPlugin(message: UiToPlugin): void;
  log(message: string): void;
  getLogElement(): HTMLElement | null;
  getCollectionSelect(): HTMLSelectElement | null;
  getModeSelect(): HTMLSelectElement | null;
  getAllowHexCheckbox(): HTMLInputElement | null;
  getStyleDictionaryCheckbox(): HTMLInputElement | null;
  getFlatTokensCheckbox(): HTMLInputElement | null;
  getImportContexts(): string[];
};

type AttachContext = {
  document: Document;
  window: Window;
};

type GithubUiApi = {
  attach(context: AttachContext): void;
  handleMessage(message: PluginToUi): boolean;
  onSelectionChange(): void;
  setRememberPref(pref: boolean): void;
};

const GH_MASK = '••••••••••';
const BRANCH_TTL_MS = 60_000;

export function createGithubUi(deps: GithubUiDependencies): GithubUiApi {
  let doc: Document | null = null;
  let win: Window | null = null;

  let ghTokenInput: HTMLInputElement | null = null;
  let ghRememberChk: HTMLInputElement | null = null;
  let ghConnectBtn: HTMLButtonElement | null = null;
  let ghVerifyBtn: HTMLButtonElement | null = null;
  let ghRepoSelect: HTMLSelectElement | null = null;
  let ghRepoErrorEl: HTMLElement | null = null;
  let ghLogoutBtn: HTMLButtonElement | null = null;

  let ghBranchInput: HTMLInputElement | null = null;
  let ghBranchToggleBtn: HTMLButtonElement | null = null;
  let ghBranchMenu: HTMLUListElement | null = null;
  let ghBranchCountEl: HTMLElement | null = null;
  let ghBranchRefreshBtn: HTMLButtonElement | null = null;

  let ghNewBranchBtn: HTMLButtonElement | null = null;
  let ghNewBranchRow: HTMLElement | null = null;
  let ghNewBranchName: HTMLInputElement | null = null;
  let ghCreateBranchConfirmBtn: HTMLButtonElement | null = null;

  let ghFolderInput: HTMLInputElement | null = null;
  let ghFolderDisplay: HTMLElement | null = null;
  let ghPickFolderBtn: HTMLButtonElement | null = null;
  let ghFilenameInput: HTMLInputElement | null = null;
  let ghFilenameErrorEl: HTMLElement | null = null;
  let ghCommitMsgInput: HTMLInputElement | null = null;
  let ghExportAndCommitBtn: HTMLButtonElement | null = null;
  let ghCreatePrChk: HTMLInputElement | null = null;
  let ghPrOptionsEl: HTMLElement | null = null;
  let ghPrTitleInput: HTMLInputElement | null = null;
  let ghPrBodyInput: HTMLTextAreaElement | null = null;
  let ghFetchPathInput: HTMLInputElement | null = null;
  let ghFetchTokensBtn: HTMLButtonElement | null = null;
  let ghScopeSelected: HTMLInputElement | null = null;
  let ghScopeAll: HTMLInputElement | null = null;
  let ghScopeTypography: HTMLInputElement | null = null;
  let styleDictionaryCheckbox: HTMLInputElement | null = null;
  let flatTokensCheckbox: HTMLInputElement | null = null;
  let ghImportStatusEl: HTMLElement | null = null;

  let ghAuthStatusEl: HTMLElement | null = null;
  let ghTokenMetaEl: HTMLElement | null = null;

  let folderPickerOverlay: HTMLElement | null = null;
  let folderPickerTitleEl: HTMLElement | null = null;
  let folderPickerPathInput: HTMLInputElement | null = null;
  let folderPickerUseBtn: HTMLButtonElement | null = null;
  let folderPickerListEl: HTMLElement | null = null;
  let folderPickerCancelBtn: HTMLButtonElement | null = null;

  let folderPickerIsOpen = false;
  let folderPickerCurrentPath = '';
  let folderPickerLastFocus: HTMLElement | null = null;
  let folderPickerRefreshNonce = 0;

  const folderListWaiters: Array<{
    path: string;
    resolve: (v: { ok: true; entries: FolderListEntry[] }) => void;
    reject: (v: { ok: false; message: string; status?: number }) => void;
  }> = [];

  const folderCreateWaiters: Array<{
    folderPath: string;
    resolve: (v: { ok: true }) => void;
    reject: (v: { ok: false; message: string; status?: number }) => void;
  }> = [];

  let ghIsAuthed = false;
  let ghTokenExpiresAt: string | number | null = null;
  let ghRememberPref = true;
  let filenameValidation: GithubFilenameValidation = validateGithubFilename(DEFAULT_GITHUB_FILENAME);

  let currentOwner = '';
  let currentRepo = '';
  let desiredBranch: string | null = null;
  let defaultBranchFromApi: string | undefined = undefined;
  let loadedPages = 0;
  let hasMorePages = false;
  let isFetchingBranches = false;
  let lastBranchesFetchedAtMs = 0;

  let allBranches: string[] = [];
  let filteredBranches: string[] = [];
  let renderCount = 0;
  let branchMenuVisible = false;
  let branchHighlightIndex = -1;
  const RENDER_STEP = 200;
  const BRANCH_INPUT_PLACEHOLDER = 'Search branches… (press Enter to refresh)';
  const GH_FOLDER_PLACEHOLDER = 'Path in repository…';
  let branchLastQuery = '';
  let branchInputPristine = true;
  type BranchSelectionResult = 'selected' | 'more' | 'fetch' | 'noop';
  let ghImportInFlight = false;
  let lastImportTarget: { branch: string; path: string } | null = null;

  const IMPORT_PROMPT_SELECT = 'Select a repository and branch to enable imports.';
  const IMPORT_PROMPT_BRANCH = 'Pick a branch to import from.';
  const IMPORT_PROMPT_PATH = 'Enter the path to a DTCG token file, then press Import.';

  type ImportStatusKind = 'idle' | 'ready' | 'progress' | 'success' | 'error';
  let currentImportStatus: ImportStatusKind = 'idle';

  function setImportStatus(kind: ImportStatusKind, message: string): void {
    if (!ghImportStatusEl) return;
    currentImportStatus = kind;
    ghImportStatusEl.textContent = message;
    ghImportStatusEl.classList.remove(
      'gh-import-status--ready',
      'gh-import-status--progress',
      'gh-import-status--success',
      'gh-import-status--error'
    );
    if (kind === 'ready') ghImportStatusEl.classList.add('gh-import-status--ready');
    else if (kind === 'progress') ghImportStatusEl.classList.add('gh-import-status--progress');
    else if (kind === 'success') ghImportStatusEl.classList.add('gh-import-status--success');
    else if (kind === 'error') ghImportStatusEl.classList.add('gh-import-status--error');
  }

  function setGhRepoError(message: string, reason: GithubRepoListErrorReason): void {
    if (!ghRepoErrorEl && doc) ghRepoErrorEl = doc.getElementById('ghRepoError');
    if (!ghRepoErrorEl) return;
    if (!message) {
      ghRepoErrorEl.hidden = true;
      ghRepoErrorEl.textContent = '';
      ghRepoErrorEl.removeAttribute('data-reason');
      return;
    }
    ghRepoErrorEl.hidden = false;
    ghRepoErrorEl.textContent = message;
    ghRepoErrorEl.setAttribute('data-reason', reason);
  }

  function pickCollectionSelect(): HTMLSelectElement | null {
    return deps.getCollectionSelect();
  }

  function pickModeSelect(): HTMLSelectElement | null {
    return deps.getModeSelect();
  }

  function pickAllowHexCheckbox(): HTMLInputElement | null {
    return deps.getAllowHexCheckbox();
  }

  function pickStyleDictionaryCheckbox(): HTMLInputElement | null {
    if (!styleDictionaryCheckbox) styleDictionaryCheckbox = deps.getStyleDictionaryCheckbox();
    return styleDictionaryCheckbox;
  }

  function pickFlatTokensCheckbox(): HTMLInputElement | null {
    if (!flatTokensCheckbox) flatTokensCheckbox = deps.getFlatTokensCheckbox();
    return flatTokensCheckbox;
  }

  function findTokenInput(): HTMLInputElement | null {
    if (!doc) return null;
    return (
      (doc.getElementById('githubTokenInput') as HTMLInputElement | null) ||
      (doc.getElementById('ghTokenInput') as HTMLInputElement | null) ||
      (doc.getElementById('githubPatInput') as HTMLInputElement | null) ||
      (doc.querySelector('input[name="githubToken"]') as HTMLInputElement | null) ||
      (doc.querySelector('input[type="password"]') as HTMLInputElement | null)
    );
  }

  function readPatFromUi(): string {
    if (!ghTokenInput) ghTokenInput = findTokenInput();
    if (!ghTokenInput) return '';
    if (ghTokenInput.getAttribute('data-filled') === '1') return GH_MASK;
    return (ghTokenInput.value || '').trim();
  }

  function updateRememberPref(pref: boolean, persist = false): void {
    const next = !!pref;
    ghRememberPref = next;
    if (ghRememberChk) {
      ghRememberChk.checked = ghRememberPref;
    }
    updateGhStatusUi();
    if (persist) {
      deps.postToPlugin({ type: 'SAVE_PREFS', payload: { githubRememberToken: ghRememberPref } });
    }
  }

  function ensureGhStatusElements(): void {
    if (!doc) return;
    if (!ghAuthStatusEl) ghAuthStatusEl = doc.getElementById('ghAuthStatus');
    if (!ghTokenMetaEl) ghTokenMetaEl = doc.getElementById('ghTokenMeta');
    if (!ghLogoutBtn) ghLogoutBtn = doc.getElementById('ghLogoutBtn') as HTMLButtonElement | null;
  }

  function formatTimeLeft(expInput: string | number): string {
    const exp = typeof expInput === 'number' ? expInput : Date.parse(expInput);
    if (!isFinite(exp)) return 'expiration: unknown';
    const now = Date.now();
    const ms = exp - now;
    if (ms <= 0) return 'expired';
    const days = Math.floor(ms / (24 * 60 * 60 * 1000));
    const hours = Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
    if (days > 0) return `${days}d ${hours}h left`;
    const mins = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
    if (hours > 0) return `${hours}h ${mins}m left`;
    const secs = Math.floor((ms % (60 * 1000)) / 1000);
    if (mins > 0) return `${mins}m ${secs}s left`;
    return `${secs}s left`;
  }

  function setPatFieldObfuscated(filled: boolean): void {
    if (!ghTokenInput) ghTokenInput = findTokenInput();
    if (!ghTokenInput) return;
    ghTokenInput.type = 'password';
    if (filled) {
      ghTokenInput.value = GH_MASK;
      ghTokenInput.setAttribute('data-filled', '1');
    } else {
      ghTokenInput.value = '';
      ghTokenInput.removeAttribute('data-filled');
    }
  }

  function updateGhStatusUi(): void {
    ensureGhStatusElements();

    if (ghAuthStatusEl) {
      ghAuthStatusEl.textContent = ghIsAuthed ? 'GitHub: authenticated.' : 'GitHub: not authenticated.';
    }

    if (ghTokenMetaEl) {
      const rememberTxt = ghRememberPref ? 'Remember me: on' : 'Remember me: off';
      const expTxt = ghTokenExpiresAt ? `Token ${formatTimeLeft(ghTokenExpiresAt)}` : 'Token expiration: unknown';
      ghTokenMetaEl.textContent = `${expTxt} • ${rememberTxt}`;
    }

    if (ghTokenInput) {
      ghTokenInput.oninput = () => {
        if (ghTokenInput && ghTokenInput.getAttribute('data-filled') === '1') {
          ghTokenInput.removeAttribute('data-filled');
        }
        if (ghConnectBtn) ghConnectBtn.disabled = false;
      };
    }

    if (ghConnectBtn && ghTokenInput) {
      const isMasked = ghTokenInput.getAttribute('data-filled') === '1';
      ghConnectBtn.disabled = ghIsAuthed && isMasked;
    }

    if (ghLogoutBtn) {
      ghLogoutBtn.disabled = !ghIsAuthed;
    }

    if (ghRememberChk) {
      ghRememberChk.checked = ghRememberPref;
    }
  }

  function setGitHubDisabledStates(): void {
    updateGhStatusUi();
  }

  function showNewBranchRow(show: boolean): void {
    if (!ghNewBranchRow) return;
    ghNewBranchRow.style.display = show ? 'flex' : 'none';
    if (show && ghNewBranchName) {
      if (!ghNewBranchName.value) {
        ghNewBranchName.value = `tokens/update-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
      }
      ghNewBranchName.focus();
      ghNewBranchName.select();
    }
  }

  function revalidateBranchesIfStale(forceLog = false): void {
    if (!ghRepoSelect || !ghBranchInput) return;
    if (!currentOwner || !currentRepo) return;

    const stale = (Date.now() - lastBranchesFetchedAtMs) > BRANCH_TTL_MS;
    if (!stale) {
      if (forceLog) deps.log('Branches are up to date (no refresh needed).');
      return;
    }

    desiredBranch = desiredBranch || null;
    defaultBranchFromApi = undefined;
    loadedPages = 0; hasMorePages = false; isFetchingBranches = true;
    allBranches = []; filteredBranches = [];
    renderCount = 0;

    setBranchDisabled(true, 'Refreshing branches…');
    updateBranchCount();
    if (ghBranchInput) {
      ghBranchInput.value = '';
      branchLastQuery = '';
      branchInputPristine = true;
    }
    deps.log('Refreshing branches…');

    deps.postToPlugin({
      type: 'GITHUB_FETCH_BRANCHES',
      payload: { owner: currentOwner, repo: currentRepo, page: 1 }
    });
  }

  function setBranchDisabled(disabled: boolean, placeholder?: string): void {
    const nextPlaceholder = placeholder !== undefined ? placeholder : BRANCH_INPUT_PLACEHOLDER;
    if (ghBranchInput) {
      ghBranchInput.disabled = disabled;
      ghBranchInput.placeholder = nextPlaceholder;
      if (disabled) {
        ghBranchInput.value = '';
        branchLastQuery = '';
        branchInputPristine = true;
      }
    }
    if (ghBranchToggleBtn) {
      ghBranchToggleBtn.disabled = disabled;
      ghBranchToggleBtn.setAttribute('aria-expanded', 'false');
    }
    if (disabled) closeBranchMenu();
  }

  function updateBranchCount(): void {
    if (!ghBranchCountEl) return;
    const total = allBranches.length;
    const showing = filteredBranches.length;
    ghBranchCountEl.textContent = `${showing} / ${total}${hasMorePages ? ' +' : ''}`;
  }

  function getBranchMenuItems(): HTMLLIElement[] {
    if (!ghBranchMenu) return [];
    const items: HTMLLIElement[] = [];
    let node = ghBranchMenu.firstElementChild;
    while (node) {
      if (node instanceof HTMLLIElement) items.push(node);
      node = node.nextElementSibling;
    }
    return items;
  }

  function setBranchHighlight(index: number, scrollIntoView: boolean): void {
    const items = getBranchMenuItems();
    branchHighlightIndex = index;
    for (let i = 0; i < items.length; i++) {
      if (i === branchHighlightIndex) items[i].setAttribute('data-active', '1');
      else items[i].removeAttribute('data-active');
    }
    if (scrollIntoView && branchHighlightIndex >= 0 && branchHighlightIndex < items.length) {
      try {
        items[branchHighlightIndex].scrollIntoView({ block: 'nearest' });
      } catch { /* ignore */ }
    }
  }

  function findNextSelectable(startIndex: number, delta: number, items: HTMLLIElement[]): number {
    if (!items.length) return -1;
    let index = startIndex;
    for (let i = 0; i < items.length; i++) {
      index += delta;
      if (index < 0) index = items.length - 1;
      else if (index >= items.length) index = 0;
      const item = items[index];
      if (!item) continue;
      if (item.dataset.selectable === '1' && item.getAttribute('aria-disabled') !== 'true') return index;
    }
    return -1;
  }

  function moveBranchHighlight(delta: number): void {
    const items = getBranchMenuItems();
    if (!items.length) {
      setBranchHighlight(-1, false);
      return;
    }
    const next = findNextSelectable(branchHighlightIndex, delta, items);
    if (next >= 0) setBranchHighlight(next, true);
  }

  function syncBranchHighlightAfterRender(): void {
    const items = getBranchMenuItems();
    if (!branchMenuVisible) {
      setBranchHighlight(-1, false);
      return;
    }
    if (!items.length) {
      setBranchHighlight(-1, false);
      return;
    }
    if (branchHighlightIndex >= 0 && branchHighlightIndex < items.length) {
      const current = items[branchHighlightIndex];
      if (current && current.dataset.selectable === '1' && current.getAttribute('aria-disabled') !== 'true') {
        setBranchHighlight(branchHighlightIndex, false);
        return;
      }
    }
    const first = findNextSelectable(-1, 1, items);
    setBranchHighlight(first, false);
  }

  function setBranchMenuVisible(show: boolean): void {
    if (!ghBranchMenu) {
      branchMenuVisible = false;
      branchHighlightIndex = -1;
      return;
    }
    if (show && ghBranchInput && ghBranchInput.disabled) show = false;
    branchMenuVisible = show;
    if (branchMenuVisible) {
      ghBranchMenu.hidden = false;
      ghBranchMenu.setAttribute('data-open', '1');
      if (ghBranchToggleBtn) ghBranchToggleBtn.setAttribute('aria-expanded', 'true');
      if (ghBranchInput) ghBranchInput.setAttribute('aria-expanded', 'true');
    } else {
      ghBranchMenu.hidden = true;
      ghBranchMenu.removeAttribute('data-open');
      if (ghBranchToggleBtn) ghBranchToggleBtn.setAttribute('aria-expanded', 'false');
      if (ghBranchInput) ghBranchInput.setAttribute('aria-expanded', 'false');
      setBranchHighlight(-1, false);
    }
  }

  function openBranchMenu(): void {
    if (!ghBranchMenu) return;
    if (!branchMenuVisible) {
      if (!ghBranchMenu.childElementCount) renderOptions();
      setBranchMenuVisible(true);
    }
    syncBranchHighlightAfterRender();
  }

  function closeBranchMenu(): void {
    setBranchMenuVisible(false);
  }

  function renderOptions(): void {
    if (!ghBranchMenu) return;

    while (ghBranchMenu.firstChild) ghBranchMenu.removeChild(ghBranchMenu.firstChild);

    const slice = filteredBranches.slice(0, renderCount);
    if (slice.length > 0) {
      for (let i = 0; i < slice.length; i++) {
        const name = slice[i];
        const item = doc!.createElement('li');
        item.className = 'gh-branch-item';
        item.dataset.value = name;
        item.dataset.selectable = '1';
        item.setAttribute('role', 'option');
        item.textContent = name;
        if (i === branchHighlightIndex) item.setAttribute('data-active', '1');
        ghBranchMenu.appendChild(item);
      }
    } else {
      const empty = doc!.createElement('li');
      empty.className = 'gh-branch-item gh-branch-item-empty';
      empty.setAttribute('aria-disabled', 'true');
      empty.dataset.selectable = '0';
      empty.textContent = allBranches.length ? 'No matching branches' : 'No branches loaded yet';
      ghBranchMenu.appendChild(empty);
    }

    if (filteredBranches.length > renderCount) {
      const more = doc!.createElement('li');
      more.className = 'gh-branch-item gh-branch-item-action';
      more.dataset.value = '__more__';
      more.dataset.selectable = '1';
      more.textContent = `Load more… (${filteredBranches.length - renderCount} more)`;
      ghBranchMenu.appendChild(more);
    } else if (hasMorePages) {
      const fetch = doc!.createElement('li');
      fetch.className = 'gh-branch-item gh-branch-item-action';
      fetch.dataset.value = '__fetch__';
      fetch.dataset.selectable = '1';
      fetch.textContent = 'Load next page…';
      ghBranchMenu.appendChild(fetch);
    }

    if (ghBranchInput) {
      const want = desiredBranch || defaultBranchFromApi || '';
      if (!ghBranchInput.value && want && branchInputPristine) {
        ghBranchInput.value = want;
        branchLastQuery = want;
      }
    }

    if (branchMenuVisible) {
      syncBranchHighlightAfterRender();
    }
  }

  function applyBranchFilter(): void {
    const rawInput = (ghBranchInput?.value || '').trim();
    const raw = (rawInput === '__more__' || rawInput === '__fetch__')
      ? branchLastQuery.trim()
      : rawInput;
    const q = raw.toLowerCase();
    const isSelected = !!desiredBranch && raw === desiredBranch;
    const isDefaultShown = !desiredBranch && !!defaultBranchFromApi && raw === defaultBranchFromApi;
    const effectiveQuery = (isSelected || isDefaultShown) ? '' : q;
    filteredBranches = effectiveQuery
      ? allBranches.filter(n => n.toLowerCase().includes(effectiveQuery))
      : [...allBranches];

    renderCount = Math.min(RENDER_STEP, filteredBranches.length);
    renderOptions();
    updateBranchCount();

    if (!branchMenuVisible && ghBranchInput && !ghBranchInput.disabled) {
      const isFocused = !!doc && doc.activeElement === ghBranchInput;
      if (isFocused) {
        setBranchMenuVisible(true);
        syncBranchHighlightAfterRender();
      }
    }
  }

  function processBranchSelection(rawValue: string, fromMenu: boolean): BranchSelectionResult {
    const value = (rawValue || '').trim();
    if (!ghBranchInput) return 'noop';

    if (value === '__more__') {
      renderCount = Math.min(renderCount + RENDER_STEP, filteredBranches.length);
      renderOptions();
      updateBranchCount();
      ghBranchInput.value = branchLastQuery;
      if (fromMenu && !branchMenuVisible) setBranchMenuVisible(true);
      return 'more';
    }

    if (value === '__fetch__') {
      ensureNextPageIfNeeded();
      ghBranchInput.value = branchLastQuery;
      return 'fetch';
    }

    if (!value) return 'noop';

    desiredBranch = value;
    branchLastQuery = value;
    ghBranchInput.value = value;
    branchInputPristine = false;
    deps.postToPlugin({
      type: 'GITHUB_SELECT_BRANCH',
      payload: { owner: currentOwner, repo: currentRepo, branch: value }
    });

    applyBranchFilter();
    updateFolderControlsEnabled();
    updateExportCommitEnabled();
    updateFetchButtonEnabled();
    return 'selected';
  }

  function ensureNextPageIfNeeded(): void {
    if (!ghBranchInput || !ghRepoSelect) return;
    if (!hasMorePages || isFetchingBranches) return;
    if (!currentOwner || !currentRepo) return;

    isFetchingBranches = true;
    deps.postToPlugin({
      type: 'GITHUB_FETCH_BRANCHES',
      payload: { owner: currentOwner, repo: currentRepo, page: loadedPages + 1 }
    });
  }

  function onBranchChange(): void {
    if (!ghBranchInput) return;
    const result = processBranchSelection(ghBranchInput.value, false);
    if (result === 'selected') closeBranchMenu();
    else if (result === 'more' || result === 'fetch') syncBranchHighlightAfterRender();
  }

  function normalizeFolderInput(raw: string): { display: string; payload: string } {
    const trimmed = raw.trim();
    if (!trimmed) return { display: '', payload: '' };

    if (trimmed === '/' || trimmed === './' || trimmed === '.') {
      return { display: '/', payload: '/' };
    }

    const collapsed = trimmed.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
    const stripped = collapsed.replace(/^\/+/, '').replace(/\/+$/, '');
    if (!stripped) return { display: '/', payload: '/' };
    return { display: stripped + '/', payload: stripped };
  }

  function normalizeFolderPickerPath(raw: string): string {
    const trimmed = (raw || '').trim();
    if (!trimmed || trimmed === '/' || trimmed === './' || trimmed === '.') return '';
    const collapsed = trimmed.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
    return collapsed.replace(/^\/+/, '').replace(/\/+$/, '');
  }

  function setGhFolderDisplay(display: string): void {
    if (ghFolderInput) ghFolderInput.value = display || '';
    if (!ghFolderDisplay) return;
    if (display) {
      ghFolderDisplay.textContent = display;
      ghFolderDisplay.classList.remove('is-placeholder');
    } else {
      ghFolderDisplay.textContent = GH_FOLDER_PLACEHOLDER;
      ghFolderDisplay.classList.add('is-placeholder');
    }
  }

  function setFilenameError(message: string | null): void {
    if (!ghFilenameErrorEl) return;
    if (message) {
      ghFilenameErrorEl.textContent = message;
      ghFilenameErrorEl.hidden = false;
    } else {
      ghFilenameErrorEl.textContent = '';
      ghFilenameErrorEl.hidden = true;
    }
  }

  function refreshFilenameValidation(): void {
    const raw = ghFilenameInput ? ghFilenameInput.value : '';
    const result = validateGithubFilename(raw || DEFAULT_GITHUB_FILENAME);
    filenameValidation = result;
    if (result.ok) setFilenameError(null);
    else setFilenameError(result.message);
  }

  function getCurrentFilename(): string {
    if (filenameValidation.ok) return filenameValidation.filename;
    const raw = ghFilenameInput ? ghFilenameInput.value : '';
    return raw.trim() || DEFAULT_GITHUB_FILENAME;
  }

  function formatDestinationForLog(folderRaw: string | undefined, filename: string | undefined): string {
    const normalized = normalizeFolderInput(folderRaw || '');
    const folderDisplay = normalized.display || '/';
    const base = folderDisplay || '/';
    const name = filename && filename.trim() ? filename.trim() : '(file)';
    const joiner = base.endsWith('/') ? '' : '/';
    return `${base}${joiner}${name}`;
  }

  function listDir(path: string): Promise<{ ok: true; entries: FolderListEntry[] } | { ok: false; message: string; status?: number }> {
    return new Promise(resolve => {
      const req = { path: path.replace(/^\/+|\/+$/g, '') };
      folderListWaiters.push({
        path: req.path,
        resolve: v => resolve(v),
        reject: v => resolve(v)
      });
      deps.postToPlugin({
        type: 'GITHUB_FOLDER_LIST',
        payload: { owner: currentOwner, repo: currentRepo, branch: getCurrentBranch(), path: req.path }
      });
    });
  }

  function openFolderPicker(): void {
    if (!currentOwner || !currentRepo) { deps.log('Pick a repository first.'); return; }
    const ref = getCurrentBranch();
    if (!ref) { deps.log('Pick a branch first.'); return; }
    if (!(folderPickerOverlay && folderPickerTitleEl && folderPickerPathInput && folderPickerListEl)) {
      deps.log('Folder picker UI is unavailable.');
      return;
    }

    folderPickerLastFocus = (doc && doc.activeElement instanceof HTMLElement) ? doc.activeElement : null;

    folderPickerOverlay.hidden = false;
    folderPickerOverlay.classList.add('is-open');
    folderPickerOverlay.setAttribute('aria-hidden', 'false');
    folderPickerIsOpen = true;

    updateFolderPickerTitle(ref);

    const startNormalized = normalizeFolderInput(ghFolderInput?.value || '');
    const startPath = startNormalized.payload === '/' ? '' : startNormalized.payload;
    setFolderPickerPath(startPath, true);

    win?.setTimeout(() => {
      folderPickerPathInput?.focus();
      folderPickerPathInput?.select();
    }, 0);
  }

  function closeFolderPicker(): void {
    if (!folderPickerOverlay) return;
    folderPickerOverlay.classList.remove('is-open');
    folderPickerOverlay.setAttribute('aria-hidden', 'true');
    folderPickerOverlay.hidden = true;
    folderPickerIsOpen = false;
    folderPickerCurrentPath = '';
    folderPickerRefreshNonce++;
    if (folderPickerListEl) {
      folderPickerListEl.replaceChildren(createFolderPickerRow('Loading…', { muted: true, disabled: true }));
    }
    if (folderPickerLastFocus && doc?.contains(folderPickerLastFocus)) {
      folderPickerLastFocus.focus();
    }
    folderPickerLastFocus = null;
  }

  function createFolderPickerRow(label: string, options?: {
    onClick?: () => void;
    muted?: boolean;
    disabled?: boolean;
  }): HTMLButtonElement {
    if (!doc) throw new Error('GitHub UI not attached');
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'folder-picker-row';
    btn.textContent = label;
    if (options?.muted) btn.classList.add('is-muted');
    if (options?.disabled) btn.disabled = true;
    if (options?.onClick) {
      btn.addEventListener('click', event => {
        event.preventDefault();
        options.onClick?.();
      });
    }
    return btn;
  }

  function updateFolderPickerTitle(branch: string): void {
    if (!folderPickerTitleEl) return;
    if (currentOwner && currentRepo) {
      folderPickerTitleEl.textContent = `${currentOwner}/${currentRepo} @ ${branch}`;
    } else {
      folderPickerTitleEl.textContent = 'Select a repository first';
    }
  }

  function setFolderPickerPath(raw: string, refresh = true, syncInput = true): void {
    const normalized = normalizeFolderPickerPath(raw);
    folderPickerCurrentPath = normalized;
    if (syncInput && folderPickerPathInput) folderPickerPathInput.value = normalized;
    if (refresh && folderPickerIsOpen) {
      void refreshFolderPickerList();
    }
  }

  async function refreshFolderPickerList(): Promise<void> {
    if (!(folderPickerListEl && folderPickerIsOpen)) return;
    const listEl = folderPickerListEl;
    const requestId = ++folderPickerRefreshNonce;

    listEl.replaceChildren(createFolderPickerRow('Loading…', { muted: true, disabled: true }));

    const path = folderPickerCurrentPath;
    const res = await listDir(path);
    if (requestId !== folderPickerRefreshNonce) return;

    if (!res.ok) {
      const status = typeof res.status === 'number' ? res.status : 0;
      if (status === 404) {
        listEl.replaceChildren(
          createFolderPickerRow('Folder not found. It will be created during export.', { muted: true, disabled: true })
        );
        return;
      }
      if (status === 409) {
        listEl.replaceChildren(
          createFolderPickerRow('Cannot open this path: an existing file blocks the folder.', { muted: true, disabled: true })
        );
        return;
      }
      const message = res.message ? res.message : 'failed to fetch';
      listEl.replaceChildren(createFolderPickerRow(`Error: ${message}`, { muted: true, disabled: true }));
      return;
    }

    const nodes: HTMLElement[] = [];
    if (path) {
      nodes.push(createFolderPickerRow('.. (up one level)', {
        muted: true,
        onClick: () => {
          const parentParts = folderPickerCurrentPath.split('/').filter(Boolean);
          parentParts.pop();
          setFolderPickerPath(parentParts.join('/'));
        }
      }));
    }

    const entries = Array.isArray(res.entries) ? res.entries : [];
    const dirs = entries.filter(e => e.type === 'dir').sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    if (dirs.length === 0) {
      nodes.push(createFolderPickerRow('(no subfolders)', { muted: true, disabled: true }));
    } else {
      for (const d of dirs) {
        const name = d.name || '';
        nodes.push(createFolderPickerRow(`${name}/`, {
          onClick: () => {
            const next = folderPickerCurrentPath ? `${folderPickerCurrentPath}/${name}` : name;
            setFolderPickerPath(next);
          }
        }));
      }
    }

    listEl.replaceChildren(...nodes);
  }

  function handleFolderPickerKeydown(event: KeyboardEvent): void {
    if (!folderPickerIsOpen) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      closeFolderPicker();
    }
  }

  function populateGhRepos(list: Array<{ full_name: string; default_branch: string; private: boolean }>): void {
    if (!ghRepoSelect) return;
    while (ghRepoSelect.options.length) ghRepoSelect.remove(0);
    for (const r of list) {
      const opt = doc!.createElement('option');
      opt.value = r.full_name;
      opt.textContent = r.full_name;
      ghRepoSelect.appendChild(opt);
    }
    ghRepoSelect.disabled = list.length === 0;

    if (list.length > 0) {
      if (currentOwner && currentRepo) {
        const want = `${currentOwner}/${currentRepo}`;
        let matched = false;
        for (let i = 0; i < ghRepoSelect.options.length; i++) {
          if (ghRepoSelect.options[i].value === want) {
            ghRepoSelect.selectedIndex = i;
            matched = true;
            break;
          }
        }
        if (matched) {
          ghRepoSelect.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else {
        ghRepoSelect.selectedIndex = 0;
        ghRepoSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  function getCurrentBranch(): string {
    if (desiredBranch) return desiredBranch;
    if (ghBranchInput && !ghBranchInput.disabled) {
      const raw = ghBranchInput.value.trim();
      if (raw && raw !== '__more__' && raw !== '__fetch__') {
        if (allBranches.includes(raw) || raw === defaultBranchFromApi) return raw;
      }
    }
    return defaultBranchFromApi || '';
  }

  function getPrBaseBranch(): string {
    return defaultBranchFromApi || '';
  }

  function persistGhState(partial: Partial<{
    owner: string;
    repo: string;
    branch: string;
    folder: string;
    filename: string;
    commitMessage: string;
    scope: GithubScope;
    collection: string;
    mode: string;
    styleDictionary: boolean;
    flatTokens: boolean;
    createPr: boolean;
    prBase: string;
    prTitle: string;
    prBody: string;
  }>): void {
    deps.postToPlugin({ type: 'GITHUB_SAVE_STATE', payload: partial });
  }

  function updateExportCommitEnabled(): void {
    const collectionSelect = pickCollectionSelect();
    const modeSelect = pickModeSelect();

    const hasRepo = !!(currentOwner && currentRepo);
    const br = getCurrentBranch();
    const commitMsg = (ghCommitMsgInput?.value || '').trim();
    const scopeAll = !!(ghScopeAll && ghScopeAll.checked);
    const scopeTypography = !!(ghScopeTypography && ghScopeTypography.checked);
    const folderRaw = ghFolderInput ? ghFolderInput.value.trim() : '';
    const hasFolder = normalizeFolderInput(folderRaw).display.length > 0;
    const hasFilename = filenameValidation.ok;

    const hasSelection = (scopeAll || scopeTypography)
      ? true
      : !!(collectionSelect && collectionSelect.value && modeSelect && modeSelect.value);

    let ready = !!(ghIsAuthed && hasRepo && br && commitMsg && hasSelection && hasFolder && hasFilename);

    if (ghCreatePrChk && ghCreatePrChk.checked) {
      const prBase = getPrBaseBranch();
      if (!prBase || prBase === br) {
        ready = false;
      }
    }

    if (ghExportAndCommitBtn) ghExportAndCommitBtn.disabled = !ready;
  }

  function updateFolderControlsEnabled(): void {
    const br = getCurrentBranch();
    const enable = !!(currentOwner && currentRepo && br);
    if (ghPickFolderBtn) ghPickFolderBtn.disabled = !enable;
    updateExportCommitEnabled();
    updateFetchButtonEnabled();
  }

  function updateFetchButtonEnabled(): void {
    const hasRepo = !!(ghIsAuthed && currentOwner && currentRepo);
    const branch = getCurrentBranch();
    const path = (ghFetchPathInput?.value || '').trim();
    if (ghFetchPathInput) ghFetchPathInput.disabled = !(hasRepo && branch) || ghImportInFlight;
    if (ghFetchTokensBtn) ghFetchTokensBtn.disabled = ghImportInFlight || !(hasRepo && branch && path);

    if (ghImportInFlight) return;

    if (!hasRepo) {
      lastImportTarget = null;
      setImportStatus('idle', IMPORT_PROMPT_SELECT);
      return;
    }
    if (!branch) {
      lastImportTarget = null;
      setImportStatus('idle', IMPORT_PROMPT_BRANCH);
      return;
    }
    if (!path) {
      lastImportTarget = null;
      setImportStatus('idle', IMPORT_PROMPT_PATH);
      return;
    }

    if (currentImportStatus === 'success' || currentImportStatus === 'error') {
      if (!lastImportTarget || lastImportTarget.branch !== branch || lastImportTarget.path !== path) {
        currentImportStatus = 'idle';
      }
    }

    if (currentImportStatus !== 'success' && currentImportStatus !== 'error') {
      setImportStatus('ready', `Ready to import from ${branch}.`);
    }
  }

  function attach(context: AttachContext): void {
    doc = context.document;
    win = context.window;

    ghTokenInput = findTokenInput();
    ghRememberChk = (doc.getElementById('githubRememberChk') as HTMLInputElement | null)
      || (doc.getElementById('ghRememberChk') as HTMLInputElement | null);
    ghConnectBtn = (doc.getElementById('githubConnectBtn') as HTMLButtonElement | null)
      || (doc.getElementById('ghConnectBtn') as HTMLButtonElement | null);
    ghVerifyBtn = (doc.getElementById('githubVerifyBtn') as HTMLButtonElement | null)
      || (doc.getElementById('ghVerifyBtn') as HTMLButtonElement | null);
    ghLogoutBtn = doc.getElementById('ghLogoutBtn') as HTMLButtonElement | null;
    ghRepoSelect = doc.getElementById('ghRepoSelect') as HTMLSelectElement | null;
    ghRepoErrorEl = doc.getElementById('ghRepoError');
    setGhRepoError('', 'none');

    ghBranchInput = doc.getElementById('ghBranchInput') as HTMLInputElement | null;
    ghBranchToggleBtn = doc.getElementById('ghBranchToggleBtn') as HTMLButtonElement | null;
    ghBranchMenu = doc.getElementById('ghBranchMenu') as HTMLUListElement | null;
    ghBranchCountEl = doc.getElementById('ghBranchCount');
    ghBranchRefreshBtn = doc.getElementById('ghBranchRefreshBtn') as HTMLButtonElement | null;

    ghNewBranchBtn = doc.getElementById('ghNewBranchBtn') as HTMLButtonElement | null;
    ghNewBranchRow = doc.getElementById('ghNewBranchRow');
    ghNewBranchName = doc.getElementById('ghNewBranchName') as HTMLInputElement | null;
    ghCreateBranchConfirmBtn = doc.getElementById('ghCreateBranchConfirmBtn') as HTMLButtonElement | null;

    ghFolderInput = doc.getElementById('ghFolderInput') as HTMLInputElement | null;
    ghFolderDisplay = doc.getElementById('ghFolderDisplay');
    setGhFolderDisplay(ghFolderInput?.value || '');
    ghPickFolderBtn = doc.getElementById('ghPickFolderBtn') as HTMLButtonElement | null;
    ghFilenameInput = doc.getElementById('ghFilenameInput') as HTMLInputElement | null;
    ghFilenameErrorEl = doc.getElementById('ghFilenameError');
    if (ghFilenameInput && !ghFilenameInput.value) {
      ghFilenameInput.value = DEFAULT_GITHUB_FILENAME;
    }
    refreshFilenameValidation();
    ghCommitMsgInput = doc.getElementById('ghCommitMsgInput') as HTMLInputElement | null;
    ghExportAndCommitBtn = doc.getElementById('ghExportAndCommitBtn') as HTMLButtonElement | null;
    ghCreatePrChk = doc.getElementById('ghCreatePrChk') as HTMLInputElement | null;
    ghPrOptionsEl = doc.getElementById('ghPrOptions');
    ghPrTitleInput = doc.getElementById('ghPrTitleInput') as HTMLInputElement | null;
    ghPrBodyInput = doc.getElementById('ghPrBodyInput') as HTMLTextAreaElement | null;
    ghFetchPathInput = doc.getElementById('ghFetchPathInput') as HTMLInputElement | null;
    ghFetchTokensBtn = doc.getElementById('ghFetchTokensBtn') as HTMLButtonElement | null;
    ghScopeSelected = doc.getElementById('ghScopeSelected') as HTMLInputElement | null;
    ghScopeAll = doc.getElementById('ghScopeAll') as HTMLInputElement | null;
    ghScopeTypography = doc.getElementById('ghScopeTypography') as HTMLInputElement | null;
    ghImportStatusEl = doc.getElementById('ghImportStatus');

    if (ghBranchInput) {
      ghBranchInput.setAttribute('role', 'combobox');
      ghBranchInput.setAttribute('aria-autocomplete', 'list');
      ghBranchInput.setAttribute('aria-expanded', 'false');
      ghBranchInput.setAttribute('aria-controls', 'ghBranchMenu');
    }
    if (ghBranchToggleBtn) ghBranchToggleBtn.setAttribute('aria-expanded', 'false');

    folderPickerOverlay = doc.getElementById('folderPickerOverlay');
    folderPickerTitleEl = doc.getElementById('folderPickerTitle');
    folderPickerPathInput = doc.getElementById('folderPickerPath') as HTMLInputElement | null;
    folderPickerUseBtn = doc.getElementById('folderPickerUseBtn') as HTMLButtonElement | null;
    folderPickerListEl = doc.getElementById('folderPickerList');
    folderPickerCancelBtn = doc.getElementById('folderPickerCancelBtn') as HTMLButtonElement | null;

    if (ghRememberChk) {
      ghRememberChk.checked = ghRememberPref;
      ghRememberChk.addEventListener('change', () => {
        updateRememberPref(!!ghRememberChk!.checked, true);
      });
    }

    ensureGhStatusElements();

    if (ghConnectBtn) ghConnectBtn.addEventListener('click', onGitHubConnectClick);
    if (ghVerifyBtn) ghVerifyBtn.addEventListener('click', onGitHubVerifyClick);
    if (ghLogoutBtn) ghLogoutBtn.addEventListener('click', onGitHubLogoutClick);

    if (ghRepoSelect && ghBranchInput) {
      let lastRepoKey = '';
      ghRepoSelect.addEventListener('change', () => {
        const value = ghRepoSelect!.value;
        if (!value) return;
        if (value === lastRepoKey) return;
        lastRepoKey = value;

        const parts = value.split('/');
        currentOwner = parts[0] || '';
        currentRepo = parts[1] || '';

        updateExportCommitEnabled();
        updateFetchButtonEnabled();

        lastBranchesFetchedAtMs = 0;

        deps.postToPlugin({ type: 'GITHUB_SELECT_REPO', payload: { owner: currentOwner, repo: currentRepo } });

        desiredBranch = null;
        defaultBranchFromApi = undefined;
        loadedPages = 0; hasMorePages = false; isFetchingBranches = false;
        allBranches = []; filteredBranches = [];
        renderCount = 0;
        if (ghBranchInput) {
          ghBranchInput.value = '';
          branchLastQuery = '';
          branchInputPristine = true;
        }
        if (ghBranchMenu) while (ghBranchMenu.firstChild) ghBranchMenu.removeChild(ghBranchMenu.firstChild);
        closeBranchMenu();

        setBranchDisabled(true, 'Loading branches…');
        updateBranchCount();
        updateFolderControlsEnabled();

        setGhFolderDisplay('');

        if (currentOwner && currentRepo) {
          deps.log(`GitHub: loading branches for ${currentOwner}/${currentRepo}…`);
          isFetchingBranches = true;
          deps.postToPlugin({
            type: 'GITHUB_FETCH_BRANCHES',
            payload: { owner: currentOwner, repo: currentRepo, page: 1 }
          });
        }

        updateExportCommitEnabled();
      });
    }

    if (ghBranchInput) {
      let timeout: number | undefined;
      ghBranchInput.addEventListener('focus', () => {
        if (ghBranchInput!.disabled) return;
        applyBranchFilter();
        openBranchMenu();
      });
      ghBranchInput.addEventListener('input', () => {
        if (timeout) win?.clearTimeout(timeout);
        const value = ghBranchInput!.value;
        if (value !== '__more__' && value !== '__fetch__') {
          branchLastQuery = value;
        }
        branchInputPristine = false;
        if (!branchMenuVisible) openBranchMenu();
        timeout = win?.setTimeout(() => {
          applyBranchFilter();
        }, 120) as number | undefined;
      });
      ghBranchInput.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'ArrowDown') {
          openBranchMenu();
          moveBranchHighlight(1);
          e.preventDefault();
          return;
        }
        if (e.key === 'ArrowUp') {
          openBranchMenu();
          moveBranchHighlight(-1);
          e.preventDefault();
          return;
        }
        if (e.key === 'Enter') {
          if (branchMenuVisible && branchHighlightIndex >= 0) {
            const items = getBranchMenuItems();
            const item = items[branchHighlightIndex];
            if (item && item.dataset.selectable === '1') {
              const value = item.getAttribute('data-value') || '';
              if (value) {
                const result = processBranchSelection(value, true);
                if (result === 'selected') closeBranchMenu();
                else if (result === 'more' || result === 'fetch') {
                  syncBranchHighlightAfterRender();
                  openBranchMenu();
                }
              }
            }
          } else {
            const result = processBranchSelection(ghBranchInput!.value, false);
            if (result === 'selected') closeBranchMenu();
            else if (result === 'more' || result === 'fetch') syncBranchHighlightAfterRender();
          }
          revalidateBranchesIfStale(true);
          e.preventDefault();
          return;
        }
        if (e.key === 'Escape') {
          if (branchMenuVisible) {
            closeBranchMenu();
            e.preventDefault();
          }
        }
      });
      ghBranchInput.addEventListener('change', () => {
        const result = processBranchSelection(ghBranchInput!.value, false);
        if (result === 'selected') closeBranchMenu();
        else if (result === 'more' || result === 'fetch') syncBranchHighlightAfterRender();
      });
    }

    if (ghBranchToggleBtn) {
      ghBranchToggleBtn.addEventListener('click', () => {
        if (ghBranchToggleBtn!.disabled) return;
        if (branchMenuVisible) {
          closeBranchMenu();
          return;
        }
        if (!ghBranchMenu || !ghBranchMenu.childElementCount) renderOptions();
        openBranchMenu();
        if (ghBranchInput && doc?.activeElement !== ghBranchInput) ghBranchInput.focus();
      });
    }

    if (ghBranchMenu) {
      ghBranchMenu.addEventListener('mousedown', event => {
        event.preventDefault();
      });
      ghBranchMenu.addEventListener('click', event => {
        const target = event.target as HTMLElement | null;
        if (!target) return;
        const item = target.closest('li');
        if (!item || !(item instanceof HTMLLIElement)) return;
        if (item.getAttribute('aria-disabled') === 'true') return;
        const value = item.getAttribute('data-value') || '';
        if (!value) return;
        const result = processBranchSelection(value, true);
        if (result === 'selected') closeBranchMenu();
        else if (result === 'more' || result === 'fetch') {
          syncBranchHighlightAfterRender();
          openBranchMenu();
        }
        if (ghBranchInput) ghBranchInput.focus();
      });
    }

    if (doc) {
      doc.addEventListener('mousedown', event => {
        if (!branchMenuVisible) return;
        const target = event.target as Node | null;
        if (!target) return;
        if (ghBranchMenu && ghBranchMenu.contains(target)) return;
        if (ghBranchInput && target === ghBranchInput) return;
        if (ghBranchToggleBtn && ghBranchToggleBtn.contains(target)) return;
        closeBranchMenu();
      });
      doc.addEventListener('focusin', event => {
        if (!branchMenuVisible) return;
        const target = event.target as Node | null;
        if (!target) { closeBranchMenu(); return; }
        if (ghBranchMenu && ghBranchMenu.contains(target)) return;
        if (ghBranchInput && target === ghBranchInput) return;
        if (ghBranchToggleBtn && ghBranchToggleBtn.contains(target)) return;
        closeBranchMenu();
      });
    }

    if (ghBranchRefreshBtn) {
      ghBranchRefreshBtn.addEventListener('click', () => {
        lastBranchesFetchedAtMs = 0;
        revalidateBranchesIfStale(true);
      });
    }

    if (ghPickFolderBtn) {
      ghPickFolderBtn.addEventListener('click', openFolderPicker);
    }

    if (folderPickerOverlay) {
      folderPickerOverlay.addEventListener('click', event => {
        if (event.target === folderPickerOverlay) closeFolderPicker();
      });
    }

    if (folderPickerCancelBtn) {
      folderPickerCancelBtn.addEventListener('click', () => closeFolderPicker());
    }

    let folderPickerPathDebounce: number | undefined;
    if (folderPickerPathInput) {
      folderPickerPathInput.addEventListener('input', () => {
        if (folderPickerPathDebounce) win?.clearTimeout(folderPickerPathDebounce);
        const value = folderPickerPathInput!.value;
        folderPickerPathDebounce = win?.setTimeout(() => {
          setFolderPickerPath(value, true, false);
        }, 120) as number | undefined;
      });
      folderPickerPathInput.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          setFolderPickerPath(folderPickerPathInput!.value);
        }
      });
      folderPickerPathInput.addEventListener('blur', () => {
        setFolderPickerPath(folderPickerPathInput!.value);
      });
    }

    if (folderPickerUseBtn) {
      folderPickerUseBtn.addEventListener('click', () => {
        if (folderPickerPathInput) {
          setFolderPickerPath(folderPickerPathInput.value, false);
        }
        const selectionRaw = folderPickerCurrentPath ? `${folderPickerCurrentPath}/` : '/';
        const normalized = normalizeFolderInput(selectionRaw);
        setGhFolderDisplay(normalized.display);
        deps.postToPlugin({
          type: 'GITHUB_SET_FOLDER',
          payload: { owner: currentOwner, repo: currentRepo, folder: normalized.payload }
        });
        persistGhState({ folder: normalized.payload });
        closeFolderPicker();
        deps.log(`Folder selected: ${normalized.display === '/' ? '(repo root)' : normalized.display}`);
        updateExportCommitEnabled();
        updateFetchButtonEnabled();
      });
    }

    // ghFolderInput is read-only; picker interactions keep it in sync.

    if (ghCommitMsgInput) {
      ghCommitMsgInput.addEventListener('input', () => {
        updateExportCommitEnabled();
        persistGhState({ commitMessage: ghCommitMsgInput!.value || '' });
      });
    }

    if (ghFilenameInput) {
      ghFilenameInput.addEventListener('input', () => {
        refreshFilenameValidation();
        persistGhState({ filename: (ghFilenameInput!.value || '').trim() });
        updateExportCommitEnabled();
      });
      ghFilenameInput.addEventListener('blur', () => refreshFilenameValidation());
    }

    if (ghScopeSelected) {
      ghScopeSelected.addEventListener('change', () => {
        if (ghScopeSelected?.checked && ghPrOptionsEl) {
          ghPrOptionsEl.style.display = ghCreatePrChk?.checked ? 'flex' : 'none';
        }
        if (ghScopeSelected!.checked) persistGhState({ scope: 'selected' });
        updateExportCommitEnabled();
      });
    }

    if (ghScopeAll) {
      ghScopeAll.addEventListener('change', () => {
        if (ghScopeAll!.checked) persistGhState({ scope: 'all' });
        updateExportCommitEnabled();
      });
    }

    if (ghScopeTypography) {
      ghScopeTypography.addEventListener('change', () => {
        if (ghScopeTypography!.checked) persistGhState({ scope: 'typography' });
        if (ghPrOptionsEl) ghPrOptionsEl.style.display = ghCreatePrChk?.checked ? 'flex' : 'none';
        updateExportCommitEnabled();
      });
    }

    if (ghCreatePrChk) {
      ghCreatePrChk.addEventListener('change', () => {
        const on = !!ghCreatePrChk!.checked;
        if (ghPrOptionsEl) ghPrOptionsEl.style.display = on ? 'flex' : 'none';
        const save: Partial<{ createPr: boolean; prBase: string }> = { createPr: on };
        if (on) save.prBase = getPrBaseBranch();
        persistGhState(save);
        updateExportCommitEnabled();
      });
    }

    if (ghPrTitleInput) {
      ghPrTitleInput.addEventListener('input', () => {
        persistGhState({ prTitle: ghPrTitleInput!.value });
      });
    }

    if (ghPrBodyInput) {
      ghPrBodyInput.addEventListener('input', () => {
        persistGhState({ prBody: ghPrBodyInput!.value });
      });
    }

    if (ghFetchPathInput) ghFetchPathInput.addEventListener('input', updateFetchButtonEnabled);

    if (ghFetchTokensBtn) {
      ghFetchTokensBtn.addEventListener('click', () => {
        const branch = getCurrentBranch();
        const path = (ghFetchPathInput?.value || '').trim().replace(/^\/+/, '');
        if (!currentOwner || !currentRepo) { deps.log('Pick a repository first.'); return; }
        if (!branch) { deps.log('Pick a branch first.'); return; }
        if (!path) { deps.log('Enter a path to fetch (e.g., tokens/tokens.json).'); return; }
        ghImportInFlight = true;
        lastImportTarget = { branch, path };
        setImportStatus('progress', `Fetching ${path} from ${branch}…`);
        updateFetchButtonEnabled();
        deps.log(`GitHub: fetching ${path} from ${currentOwner}/${currentRepo}@${branch}…`);
        const allowHex = !!pickAllowHexCheckbox()?.checked;
        const contexts = deps.getImportContexts();
        const payload: UiToPlugin = {
          type: 'GITHUB_FETCH_TOKENS',
          payload: {
            owner: currentOwner,
            repo: currentRepo,
            branch,
            path,
            allowHexStrings: allowHex,
            ...(contexts.length > 0 ? { contexts } : {})
          }
        };
        deps.postToPlugin(payload);
        if (contexts.length > 0) {
          deps.log(`GitHub: importing ${contexts.length} selected mode(s) based on current scope.`);
        }
      });
    }

    if (ghExportAndCommitBtn) {
      ghExportAndCommitBtn.addEventListener('click', () => {
        const collectionSelect = pickCollectionSelect();
        const modeSelect = pickModeSelect();

        const scope: GithubScope = ghScopeAll && ghScopeAll.checked
          ? 'all'
          : (ghScopeTypography && ghScopeTypography.checked ? 'typography' : 'selected');
        const commitMessage = (ghCommitMsgInput?.value || 'Update tokens from Figma').trim();
        const normalizedFolder = normalizeFolderInput(ghFolderInput?.value || '');
        refreshFilenameValidation();

        if (!normalizedFolder.display) {
          deps.log('Pick a destination folder (e.g., tokens/).');
          ghPickFolderBtn?.focus();
          updateExportCommitEnabled();
          return;
        }
        if (!filenameValidation.ok) {
          deps.log(filenameValidation.message);
          ghFilenameInput?.focus();
          updateExportCommitEnabled();
          return;
        }

        const filenameToUse = filenameValidation.filename;

        setGhFolderDisplay(normalizedFolder.display);
        deps.postToPlugin({
          type: 'GITHUB_SET_FOLDER',
          payload: { owner: currentOwner, repo: currentRepo, folder: normalizedFolder.payload }
        });
        persistGhState({ folder: normalizedFolder.payload, filename: filenameToUse });

        const createPr = !!(ghCreatePrChk && ghCreatePrChk.checked);
        const payload: UiToPlugin = {
          type: 'GITHUB_EXPORT_AND_COMMIT',
          payload: {
            owner: currentOwner,
            repo: currentRepo,
            branch: getCurrentBranch(),
            folder: normalizedFolder.payload,
            filename: filenameToUse,
            commitMessage,
            scope,
            styleDictionary: !!(pickStyleDictionaryCheckbox()?.checked),
            flatTokens: !!(pickFlatTokensCheckbox()?.checked),
            createPr
          }
        };

        if (scope === 'selected' && collectionSelect && modeSelect) {
          payload.payload.collection = collectionSelect.value || '';
          payload.payload.mode = modeSelect.value || '';
        }

        if (createPr) {
          payload.payload.prBase = getPrBaseBranch();
          payload.payload.prTitle = (ghPrTitleInput?.value || '').trim();
          payload.payload.prBody = ghPrBodyInput?.value || '';
        }

        const scopeLabel = scope === 'all'
          ? 'all collections'
          : (scope === 'typography' ? 'typography' : 'selected mode');
        const summaryTarget = formatDestinationForLog(normalizedFolder.payload, filenameToUse);
        deps.log(`GitHub: Export summary → ${summaryTarget} (${scopeLabel})`);
        deps.log(createPr ? 'Export, Commit & PR requested…' : 'Export & Commit requested…');
        deps.postToPlugin(payload);
      });
    }

    doc.addEventListener('keydown', handleFolderPickerKeydown);

    updateGhStatusUi();
    updateFolderControlsEnabled();
    updateExportCommitEnabled();
    updateFetchButtonEnabled();
  }

  function onGitHubConnectClick(): void {
    const tokenRaw = readPatFromUi();
    const isMasked = ghTokenInput?.getAttribute('data-filled') === '1';
    if (ghIsAuthed && isMasked) return;
    if (!tokenRaw) { deps.log('GitHub: Paste a Personal Access Token first.'); return; }
    const remember = !!(ghRememberChk && ghRememberChk.checked);
    deps.log('GitHub: Verifying token…');
    deps.postToPlugin({ type: 'GITHUB_SET_TOKEN', payload: { token: tokenRaw, remember } });
  }

  function onGitHubVerifyClick(): void {
    onGitHubConnectClick();
  }

  function onGitHubLogoutClick(): void {
    deps.postToPlugin({ type: 'GITHUB_FORGET_TOKEN' });
    ghIsAuthed = false;
    ghTokenExpiresAt = null;
    setPatFieldObfuscated(false);
    populateGhRepos([]);
    updateGhStatusUi();
    currentOwner = ''; currentRepo = '';
    allBranches = []; filteredBranches = [];
    desiredBranch = null; defaultBranchFromApi = undefined;
    loadedPages = 0; hasMorePages = false; isFetchingBranches = false;
    if (ghBranchInput) {
      ghBranchInput.value = '';
      branchLastQuery = '';
      branchInputPristine = true;
    }
    if (ghBranchMenu) while (ghBranchMenu.firstChild) ghBranchMenu.removeChild(ghBranchMenu.firstChild);
    closeBranchMenu();
    setBranchDisabled(true, 'Pick a repository first…');
    updateBranchCount();
    updateFolderControlsEnabled();
    setGhFolderDisplay('');
    deps.log('GitHub: Logged out.');
  }

  function handleMessage(msg: PluginToUi): boolean {
    if (msg.type === 'GITHUB_AUTH_RESULT') {
      const p = msg.payload || {} as any;
      ghIsAuthed = !!p.ok;
      ghTokenExpiresAt =
        (typeof p.exp !== 'undefined' && p.exp !== null)
          ? p.exp
          : ((typeof p.tokenExpiration !== 'undefined' && p.tokenExpiration !== null) ? p.tokenExpiration : null);

      if (typeof p.remember === 'boolean') {
        updateRememberPref(p.remember, false);
      }

      if (ghIsAuthed) {
        setPatFieldObfuscated(true);
        const who = p.login || 'unknown';
        const name = p.name ? ` (${p.name})` : '';
        deps.log(`GitHub: Authenticated as ${who}${name}.`);
      } else {
        setPatFieldObfuscated(false);
        const why = p.error ? `: ${p.error}` : '.';
        deps.log(`GitHub: Authentication failed${why}`);
      }

      updateGhStatusUi();
      updateExportCommitEnabled();
      updateFetchButtonEnabled();
      return true;
    }

    if (msg.type === 'GITHUB_REPOS') {
      const repos = (msg.payload?.repos ?? []) as Array<{ full_name: string; default_branch: string; private: boolean }>;
      populateGhRepos(repos);
      deps.log(`GitHub: Repository list updated (${repos.length}).`);
      return true;
    }

    if (msg.type === 'GITHUB_REPO_LIST_ERROR') {
      setGhRepoError(msg.payload.message, msg.payload.reason);
      if (msg.payload.message) {
        deps.log(msg.payload.message);
      }
      return true;
    }

    if (msg.type === 'GITHUB_RESTORE_SELECTED') {
      const p = msg.payload || {};
      currentOwner = typeof p.owner === 'string' ? p.owner : '';
      currentRepo = typeof p.repo === 'string' ? p.repo : '';
      desiredBranch = typeof p.branch === 'string' ? p.branch : null;

      if (typeof p.folder === 'string') {
        const normalized = normalizeFolderInput(p.folder);
        setGhFolderDisplay(normalized.display);
      }
      if (ghFilenameInput) {
        if (typeof p.filename === 'string' && p.filename.trim()) {
          ghFilenameInput.value = p.filename;
        } else if (!ghFilenameInput.value) {
          ghFilenameInput.value = DEFAULT_GITHUB_FILENAME;
        }
      }
      refreshFilenameValidation();
      if (typeof p.commitMessage === 'string' && ghCommitMsgInput) {
        ghCommitMsgInput.value = p.commitMessage;
      }
      if (typeof p.scope === 'string') {
        if (p.scope === 'all' && ghScopeAll) ghScopeAll.checked = true;
        if (p.scope === 'selected' && ghScopeSelected) ghScopeSelected.checked = true;
        if (p.scope === 'typography' && ghScopeTypography) ghScopeTypography.checked = true;
      }
      const styleDictChk = pickStyleDictionaryCheckbox();
      if (styleDictChk && typeof p.styleDictionary === 'boolean') {
        styleDictChk.checked = p.styleDictionary;
      }
      const flatChk = pickFlatTokensCheckbox();
      if (flatChk && typeof p.flatTokens === 'boolean') {
        flatChk.checked = p.flatTokens;
      }
      if (typeof p.createPr === 'boolean' && ghCreatePrChk) {
        ghCreatePrChk.checked = p.createPr;
        if (ghPrOptionsEl) ghPrOptionsEl.style.display = p.createPr ? 'flex' : 'none';
      }
      if (typeof p.prTitle === 'string' && ghPrTitleInput) ghPrTitleInput.value = p.prTitle;
      if (typeof p.prBody === 'string' && ghPrBodyInput) ghPrBodyInput.value = p.prBody;

      updateExportCommitEnabled();
      updateFetchButtonEnabled();
      return true;
    }

    if (msg.type === 'GITHUB_BRANCHES') {
      const pl = (msg.payload || {}) as any;
      const owner = String(pl.owner || '');
      const repo = String(pl.repo || '');
      if (owner !== currentOwner || repo !== currentRepo) return true;

      lastBranchesFetchedAtMs = Date.now();

      loadedPages = Number(pl.page || 1);
      hasMorePages = !!pl.hasMore;
      isFetchingBranches = false;

      if (typeof pl.defaultBranch === 'string' && !defaultBranchFromApi) {
        defaultBranchFromApi = pl.defaultBranch;
      }

      if (ghNewBranchBtn) ghNewBranchBtn.disabled = false;

      const names = Array.isArray(pl.branches) ? (pl.branches as Array<{ name: string }>).map(b => b.name) : [];
      const set = new Set(allBranches);
      for (const n of names) if (n) set.add(n);
      allBranches = Array.from(set).sort((a, b) => a.localeCompare(b));

      applyBranchFilter();
      setBranchDisabled(false);
      updateFolderControlsEnabled();

      const rate = pl.rate as { remaining?: number; resetEpochSec?: number } | undefined;
      if (rate && typeof rate.remaining === 'number' && rate.remaining <= 3 && typeof rate.resetEpochSec === 'number') {
        const t = new Date(rate.resetEpochSec * 1000).toLocaleTimeString();
        deps.log(`GitHub: near rate limit; resets ~${t}`);
      }

      deps.log(`Loaded ${names.length} branches (page ${loadedPages}) for ${repo}${hasMorePages ? '…' : ''}`);
      return true;
    }

    if (msg.type === 'GITHUB_BRANCHES_ERROR') {
      const pl = (msg.payload || {}) as any;
      const owner = String(pl.owner || '');
      const repo = String(pl.repo || '');
      if (owner !== currentOwner || repo !== currentRepo) return true;
      isFetchingBranches = false;
      setBranchDisabled(false);
      updateFolderControlsEnabled();
      deps.log(`Branch load failed (status ${pl.status}): ${pl.message || 'unknown error'}`);
      if (pl.samlRequired) deps.log('This org requires SSO. Open the repo in your browser and authorize SSO for your token.');
      if (pl.rate && typeof pl.rate.resetEpochSec === 'number') {
        const t = new Date(pl.rate.resetEpochSec * 1000).toLocaleTimeString();
        deps.log(`Rate limit issue; resets ~${t}`);
      }
      return true;
    }

    if (msg.type === 'GITHUB_CREATE_BRANCH_RESULT') {
      const pl = (msg.payload || {}) as any;
      if (ghCreateBranchConfirmBtn) ghCreateBranchConfirmBtn.disabled = false;
      if (typeof pl.ok !== 'boolean') return true;

      if (pl.ok) {
        const baseBranch = String(pl.baseBranch || '');
        const newBranch = String(pl.newBranch || '');
        const url = String(pl.html_url || '');

        if (newBranch) {
          const s = new Set(allBranches);
          if (!s.has(newBranch)) {
            s.add(newBranch);
            allBranches = Array.from(s).sort((a, b) => a.localeCompare(b));
          }
          desiredBranch = newBranch;
          if (ghBranchInput) {
            ghBranchInput.value = newBranch;
            branchLastQuery = newBranch;
            branchInputPristine = false;
          }
          applyBranchFilter();
        }

        updateFolderControlsEnabled();
        showNewBranchRow(false);
        if (ghNewBranchName) ghNewBranchName.value = '';

        if (url) {
          deps.log(`Branch created: ${newBranch} (from ${baseBranch})`);
          const logEl = deps.getLogElement();
          if (logEl && doc) {
            const wrap = doc.createElement('div');
            const a = doc.createElement('a');
            a.href = url;
            a.target = '_blank';
            a.textContent = 'View on GitHub';
            wrap.appendChild(a);
            logEl.appendChild(wrap);
            (logEl as HTMLElement).scrollTop = (logEl as HTMLElement).scrollHeight;
          }
        } else {
          deps.log(`Branch created: ${newBranch} (from ${baseBranch})`);
        }
        return true;
      }

      const status = pl.status ?? 0;
      const message = pl.message || 'unknown error';
      deps.log(`Create branch failed (status ${status}): ${message}`);
      if (pl.samlRequired) {
        deps.log('This org requires SSO. Open the repo in your browser and authorize SSO for your token.');
      } else if (status === 403) {
        if (pl.noPushPermission) {
          deps.log('You do not have push permission to this repository. Ask a maintainer for write access.');
        } else {
          deps.log('Likely a token permission issue:');
          deps.log('• Classic PAT: add the "repo" scope (or "public_repo" for public repos).');
          deps.log('• Fine-grained PAT: grant this repository and set "Contents: Read and write".');
        }
      }
      if (pl.rate && typeof pl.rate.resetEpochSec === 'number') {
        const t = new Date(pl.rate.resetEpochSec * 1000).toLocaleTimeString();
        deps.log(`Rate limit issue; resets ~${t}`);
      }
      return true;
    }

    if (msg.type === 'GITHUB_FOLDER_LIST_RESULT') {
      const pl = (msg.payload || {}) as any;
      const path = String(pl.path || '').replace(/^\/+|\/+$/g, '');
      const ok = !!pl.ok;
      const entries = Array.isArray(pl.entries) ? pl.entries : [];
      const message = String(pl.message || '');

      for (let i = 0; i < folderListWaiters.length; i++) {
        if (folderListWaiters[i].path === path) {
          const waiter = folderListWaiters.splice(i, 1)[0];
          if (ok) waiter.resolve({ ok: true, entries });
          else waiter.reject({
            ok: false,
            message: message || `HTTP ${pl.status || 0}`,
            status: typeof pl.status === 'number' ? pl.status : undefined
          });
          break;
        }
      }
      return true;
    }

    if (msg.type === 'GITHUB_CREATE_FOLDER_RESULT') {
      const pl = (msg.payload || {}) as any;
      const fp = String(pl.folderPath || '').replace(/^\/+|\/+$/g, '');
      const ok = !!pl.ok;
      const message = String(pl.message || '');

      for (let i = 0; i < folderCreateWaiters.length; i++) {
        if (folderCreateWaiters[i].folderPath === fp) {
          const waiter = folderCreateWaiters.splice(i, 1)[0];
          if (ok) waiter.resolve({ ok: true });
          else waiter.reject({ ok: false, message: message || `HTTP ${pl.status || 0}`, status: pl.status });
          break;
        }
      }
      return true;
    }

    if (msg.type === 'GITHUB_COMMIT_RESULT') {
      if (msg.payload.ok) {
        const url = String(msg.payload.commitUrl || '');
        const branch = msg.payload.branch || '';
        const destination = formatDestinationForLog(msg.payload.folder, msg.payload.filename);
        const committedPath = msg.payload.fullPath || destination;
        deps.log(`Commit succeeded (${branch}): ${url || '(no URL)'}`);
        deps.log(`Committed ${committedPath}`);
        if (url) {
          const logEl = deps.getLogElement();
          if (logEl && doc) {
            const wrap = doc.createElement('div');
            const a = doc.createElement('a');
            a.href = url;
            a.target = '_blank';
            a.textContent = 'View commit';
            wrap.appendChild(a);
            logEl.appendChild(wrap);
            (logEl as HTMLElement).scrollTop = (logEl as HTMLElement).scrollHeight;
          }
        }
        if (msg.payload.createdPr) {
          const pr = msg.payload.createdPr;
          deps.log(`PR prepared (#${pr.number}) from ${pr.head} → ${pr.base}`);
        }
      } else {
        const status = typeof msg.payload.status === 'number' ? msg.payload.status : 0;
        const message = msg.payload.message || 'unknown error';
        const destination = formatDestinationForLog(msg.payload.folder, msg.payload.filename);
        const committedPath = msg.payload.fullPath || destination;
        if (status === 304) {
          deps.log(`Commit skipped: ${message} (${committedPath})`);
        } else {
          deps.log(`Commit failed (${status}): ${message} (${committedPath})`);
        }
      }
      return true;
    }

    if (msg.type === 'GITHUB_PR_RESULT') {
      if (msg.payload.ok) {
        deps.log(`PR created: #${msg.payload.number} (${msg.payload.head} → ${msg.payload.base})`);
        const url = msg.payload.url;
        if (url) {
          const logEl = deps.getLogElement();
          if (logEl && doc) {
            const wrap = doc.createElement('div');
            const a = doc.createElement('a');
            a.href = url;
            a.target = '_blank';
            a.textContent = 'View PR';
            wrap.appendChild(a);
            logEl.appendChild(wrap);
            (logEl as HTMLElement).scrollTop = (logEl as HTMLElement).scrollHeight;
          }
        }
      } else {
        deps.log(`PR creation failed (${msg.payload.status || 0}): ${msg.payload.message || 'unknown error'}`);
      }
      return true;
    }

    if (msg.type === 'GITHUB_FETCH_TOKENS_RESULT') {
      ghImportInFlight = false;
      if (msg.payload.ok) {
        deps.log(`Imported tokens from ${msg.payload.path} (${msg.payload.branch})`);
        const branch = String(msg.payload.branch || '');
        const path = String(msg.payload.path || '');
        lastImportTarget = { branch, path };
        setImportStatus('success', `Imported tokens from ${branch}:${path}.`);
      } else {
        deps.log(`GitHub fetch failed (${msg.payload.status || 0}): ${msg.payload.message || 'unknown error'}`);
        const status = typeof msg.payload.status === 'number' ? msg.payload.status : 0;
        const message = msg.payload.message || 'Unknown error';
        const branch = String(msg.payload.branch || '');
        const path = String(msg.payload.path || '');
        lastImportTarget = { branch, path };
        setImportStatus('error', `GitHub import failed (${status}): ${message}`);
      }
      updateFetchButtonEnabled();
      return true;
    }

    return false;
  }

  function onSelectionChange(): void {
    updateExportCommitEnabled();
  }

  function applyRememberPrefFromPlugin(pref: boolean): void {
    updateRememberPref(pref, false);
  }

  return {
    attach,
    handleMessage,
    onSelectionChange,
    setRememberPref: applyRememberPrefFromPlugin,
  };
}
