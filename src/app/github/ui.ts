import type { PluginToUi, UiToPlugin, GithubScope } from '../messages';

type FolderListEntry = { type: 'dir' | 'file'; name: string; path?: string };

type GithubUiDependencies = {
  postToPlugin(message: UiToPlugin): void;
  log(message: string): void;
  getLogElement(): HTMLElement | null;
  getCollectionSelect(): HTMLSelectElement | null;
  getModeSelect(): HTMLSelectElement | null;
  getAllowHexCheckbox(): HTMLInputElement | null;
};

type AttachContext = {
  document: Document;
  window: Window;
};

type GithubUiApi = {
  attach(context: AttachContext): void;
  handleMessage(message: PluginToUi): boolean;
  onSelectionChange(): void;
};

const GH_REMEMBER_PREF_KEY = 'ghRememberPref';
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
  let ghLogoutBtn: HTMLButtonElement | null = null;

  let ghBranchSearch: HTMLInputElement | null = null;
  let ghBranchSelect: HTMLSelectElement | null = null;
  let ghBranchCountEl: HTMLElement | null = null;
  let ghBranchRefreshBtn: HTMLButtonElement | null = null;

  let ghNewBranchBtn: HTMLButtonElement | null = null;
  let ghNewBranchRow: HTMLElement | null = null;
  let ghNewBranchName: HTMLInputElement | null = null;
  let ghCreateBranchConfirmBtn: HTMLButtonElement | null = null;

  let ghFolderInput: HTMLInputElement | null = null;
  let ghPickFolderBtn: HTMLButtonElement | null = null;
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

  let ghAuthStatusEl: HTMLElement | null = null;
  let ghTokenMetaEl: HTMLElement | null = null;

  let folderPickerOverlay: HTMLElement | null = null;
  let folderPickerTitleEl: HTMLElement | null = null;
  let folderPickerPathInput: HTMLInputElement | null = null;
  let folderPickerUseBtn: HTMLButtonElement | null = null;
  let folderPickerListEl: HTMLElement | null = null;
  let folderPickerNewBtn: HTMLButtonElement | null = null;
  let folderPickerCancelBtn: HTMLButtonElement | null = null;

  let folderPickerIsOpen = false;
  let folderPickerCurrentPath = '';
  let folderPickerLastFocus: HTMLElement | null = null;
  let folderPickerRefreshNonce = 0;

  const folderListWaiters: Array<{
    path: string;
    resolve: (v: { ok: true; entries: FolderListEntry[] }) => void;
    reject: (v: { ok: false; message: string }) => void;
  }> = [];

  const folderCreateWaiters: Array<{
    folderPath: string;
    resolve: (v: { ok: true }) => void;
    reject: (v: { ok: false; message: string; status?: number }) => void;
  }> = [];

  let ghIsAuthed = false;
  let ghTokenExpiresAt: string | number | null = null;
  let ghRememberPref = false;

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
  const RENDER_STEP = 200;

  function pickCollectionSelect(): HTMLSelectElement | null {
    return deps.getCollectionSelect();
  }

  function pickModeSelect(): HTMLSelectElement | null {
    return deps.getModeSelect();
  }

  function pickAllowHexCheckbox(): HTMLInputElement | null {
    return deps.getAllowHexCheckbox();
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

  function saveRememberPref(checked: boolean): void {
    try { win?.localStorage.setItem(GH_REMEMBER_PREF_KEY, checked ? '1' : '0'); } catch { /* ignore */ }
  }

  function loadRememberPref(): boolean {
    try {
      const v = win?.localStorage.getItem(GH_REMEMBER_PREF_KEY);
      if (v === '1') return true;
      if (v === '0') return false;
    } catch { /* ignore */ }
    return false;
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
    if (!ghRepoSelect || !ghBranchSelect) return;
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
    deps.log('Refreshing branches…');

    deps.postToPlugin({
      type: 'GITHUB_FETCH_BRANCHES',
      payload: { owner: currentOwner, repo: currentRepo, page: 1 }
    });
  }

  function setBranchDisabled(disabled: boolean, placeholder?: string): void {
    if (!ghBranchSelect) return;
    ghBranchSelect.disabled = disabled;
    if (placeholder !== undefined) {
      clearSelect(ghBranchSelect);
      const opt = doc!.createElement('option');
      opt.value = '';
      opt.textContent = placeholder;
      ghBranchSelect.appendChild(opt);
    }
  }

  function updateBranchCount(): void {
    if (!ghBranchCountEl) return;
    const total = allBranches.length;
    const showing = filteredBranches.length;
    ghBranchCountEl.textContent = `${showing} / ${total}${hasMorePages ? ' +' : ''}`;
  }

  function clearSelect(sel: HTMLSelectElement): void {
    while (sel.options.length > 0) sel.remove(0);
  }

  function renderOptions(): void {
    if (!ghBranchSelect) return;
    const prev = ghBranchSelect.value;
    clearSelect(ghBranchSelect);

    const slice = filteredBranches.slice(0, renderCount);
    for (const name of slice) {
      const opt = doc!.createElement('option');
      opt.value = name;
      opt.textContent = name;
      ghBranchSelect.appendChild(opt);
    }

    if (filteredBranches.length > renderCount) {
      const opt = doc!.createElement('option');
      opt.value = '__more__';
      opt.textContent = `Load more… (${filteredBranches.length - renderCount} more)`;
      ghBranchSelect.appendChild(opt);
    } else if (hasMorePages) {
      const opt = doc!.createElement('option');
      opt.value = '__fetch__';
      opt.textContent = 'Load next page…';
      ghBranchSelect.appendChild(opt);
    }

    const want = desiredBranch || defaultBranchFromApi || prev;
    if (want && slice.includes(want)) {
      ghBranchSelect.value = want;
    } else if (ghBranchSelect.options.length) {
      ghBranchSelect.selectedIndex = 0;
    }
  }

  function applyBranchFilter(): void {
    const q = (ghBranchSearch?.value || '').toLowerCase().trim();
    filteredBranches = q
      ? allBranches.filter(n => n.toLowerCase().includes(q))
      : [...allBranches];

    renderCount = Math.min(RENDER_STEP, filteredBranches.length);
    renderOptions();
    updateBranchCount();
  }

  function ensureNextPageIfNeeded(): void {
    if (!ghBranchSelect || !ghRepoSelect) return;
    if (!hasMorePages || isFetchingBranches) return;
    if (!currentOwner || !currentRepo) return;

    isFetchingBranches = true;
    deps.postToPlugin({
      type: 'GITHUB_FETCH_BRANCHES',
      payload: { owner: currentOwner, repo: currentRepo, page: loadedPages + 1 }
    });
  }

  function onBranchScroll(): void {
    if (!ghBranchSelect) return;
    const el = ghBranchSelect;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
    if (nearBottom && filteredBranches.length === allBranches.length && hasMorePages && !isFetchingBranches) {
      ensureNextPageIfNeeded();
    }
  }

  function onBranchChange(): void {
    if (!ghBranchSelect) return;
    const v = ghBranchSelect.value;
    if (v === '__more__') {
      renderCount = Math.min(renderCount + RENDER_STEP, filteredBranches.length);
      renderOptions();
      return;
    }
    if (v === '__fetch__') {
      ensureNextPageIfNeeded();
      return;
    }
    if (!v) return;

    desiredBranch = v;
    deps.postToPlugin({
      type: 'GITHUB_SELECT_BRANCH',
      payload: { owner: currentOwner, repo: currentRepo, branch: v }
    });

    updateFolderControlsEnabled();
    updateExportCommitEnabled();
    updateFetchButtonEnabled();
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

  function listDir(path: string): Promise<{ ok: true; entries: FolderListEntry[] } | { ok: false; message: string }> {
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

  function ensureFolder(folderPath: string): Promise<{ ok: true } | { ok: false; message: string; status?: number }> {
    return new Promise(resolve => {
      const fp = folderPath.replace(/^\/+|\/+$/g, '');
      folderCreateWaiters.push({
        folderPath: fp,
        resolve: v => resolve(v),
        reject: v => resolve(v)
      });
      deps.postToPlugin({
        type: 'GITHUB_CREATE_FOLDER',
        payload: { owner: currentOwner, repo: currentRepo, branch: getCurrentBranch(), folderPath: fp }
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

  function setFolderPickerPath(raw: string, refresh = true): void {
    const normalized = normalizeFolderPickerPath(raw);
    folderPickerCurrentPath = normalized;
    if (folderPickerPathInput) folderPickerPathInput.value = normalized;
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

    if (!('ok' in res) || !res.ok) {
      const message = 'message' in res && res.message ? res.message : 'failed to fetch';
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
    const v = (ghBranchSelect && !ghBranchSelect.disabled &&
      ghBranchSelect.value && ghBranchSelect.value !== '__more__' && ghBranchSelect.value !== '__fetch__')
      ? ghBranchSelect.value
      : (desiredBranch || defaultBranchFromApi || '');
    return v || '';
  }

  function getPrBaseBranch(): string {
    return defaultBranchFromApi || '';
  }

  function persistGhState(partial: Partial<{
    owner: string;
    repo: string;
    branch: string;
    folder: string;
    commitMessage: string;
    scope: GithubScope;
    collection: string;
    mode: string;
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
    const folderRaw = ghFolderInput ? ghFolderInput.value.trim() : '';
    const hasFolder = normalizeFolderInput(folderRaw).display.length > 0;

    const hasSelection = scopeAll
      ? true
      : !!(collectionSelect && collectionSelect.value && modeSelect && modeSelect.value);

    let ready = !!(ghIsAuthed && hasRepo && br && commitMsg && hasSelection && hasFolder);

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
    if (ghFetchTokensBtn) ghFetchTokensBtn.disabled = !(hasRepo && branch && path);
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

    ghBranchSearch = doc.getElementById('ghBranchSearch') as HTMLInputElement | null;
    ghBranchSelect = doc.getElementById('ghBranchSelect') as HTMLSelectElement | null;
    ghBranchCountEl = doc.getElementById('ghBranchCount');
    ghBranchRefreshBtn = doc.getElementById('ghBranchRefreshBtn') as HTMLButtonElement | null;

    ghNewBranchBtn = doc.getElementById('ghNewBranchBtn') as HTMLButtonElement | null;
    ghNewBranchRow = doc.getElementById('ghNewBranchRow');
    ghNewBranchName = doc.getElementById('ghNewBranchName') as HTMLInputElement | null;
    ghCreateBranchConfirmBtn = doc.getElementById('ghCreateBranchConfirmBtn') as HTMLButtonElement | null;

    ghFolderInput = doc.getElementById('ghFolderInput') as HTMLInputElement | null;
    ghPickFolderBtn = doc.getElementById('ghPickFolderBtn') as HTMLButtonElement | null;
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

    folderPickerOverlay = doc.getElementById('folderPickerOverlay');
    folderPickerTitleEl = doc.getElementById('folderPickerTitle');
    folderPickerPathInput = doc.getElementById('folderPickerPath') as HTMLInputElement | null;
    folderPickerUseBtn = doc.getElementById('folderPickerUseBtn') as HTMLButtonElement | null;
    folderPickerListEl = doc.getElementById('folderPickerList');
    folderPickerNewBtn = doc.getElementById('folderPickerNewBtn') as HTMLButtonElement | null;
    folderPickerCancelBtn = doc.getElementById('folderPickerCancelBtn') as HTMLButtonElement | null;

    ghRememberPref = loadRememberPref();
    if (ghRememberChk) {
      ghRememberChk.checked = ghRememberPref;
      ghRememberChk.addEventListener('change', () => {
        ghRememberPref = !!ghRememberChk!.checked;
        saveRememberPref(ghRememberPref);
        updateGhStatusUi();
      });
    }

    ensureGhStatusElements();

    if (ghConnectBtn) ghConnectBtn.addEventListener('click', onGitHubConnectClick);
    if (ghVerifyBtn) ghVerifyBtn.addEventListener('click', onGitHubVerifyClick);
    if (ghLogoutBtn) ghLogoutBtn.addEventListener('click', onGitHubLogoutClick);

    if (ghRepoSelect && ghBranchSelect) {
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
        if (ghBranchSearch) ghBranchSearch.value = '';

        setBranchDisabled(true, 'Loading branches…');
        updateBranchCount();
        updateFolderControlsEnabled();

        if (ghFolderInput) ghFolderInput.value = '';

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

    if (ghBranchSearch) {
      let timeout: number | undefined;
      ghBranchSearch.addEventListener('input', () => {
        if (timeout) win?.clearTimeout(timeout);
        timeout = win?.setTimeout(() => {
          applyBranchFilter();
        }, 120) as number | undefined;
      });
      ghBranchSearch.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Enter') revalidateBranchesIfStale(true);
      });
    }

    if (ghBranchSelect) {
      ghBranchSelect.addEventListener('change', onBranchChange);
      ghBranchSelect.addEventListener('scroll', onBranchScroll);
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

    if (folderPickerPathInput) {
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
        const selectionRaw = folderPickerCurrentPath ? `${folderPickerCurrentPath}/` : '/';
        const normalized = normalizeFolderInput(selectionRaw);
        if (ghFolderInput) ghFolderInput.value = normalized.display;
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

    if (folderPickerNewBtn) {
      folderPickerNewBtn.addEventListener('click', () => {
        const name = win?.prompt('New folder name (no spaces; use "-" or "_")', 'tokens');
        if (!name) return;
        const trimmed = name.trim().replace(/^\/+/, '').replace(/\/+$/, '');
        if (!trimmed || /\s/.test(trimmed) || /[~^:?*[\]\\]/.test(trimmed)) {
          win?.alert('Invalid folder name.');
          return;
        }
        const next = folderPickerCurrentPath ? `${folderPickerCurrentPath}/${trimmed}` : trimmed;
        const normalizedPath = normalizeFolderPickerPath(next);
        const normalized = normalizeFolderInput(normalizedPath ? `${normalizedPath}/` : '/');
        if (ghFolderInput) ghFolderInput.value = normalized.display;
        deps.postToPlugin({
          type: 'GITHUB_SET_FOLDER',
          payload: { owner: currentOwner, repo: currentRepo, folder: normalized.payload }
        });
        persistGhState({ folder: normalized.payload });
        closeFolderPicker();
        deps.log(`Folder selected (will be created on export): ${normalized.display}`);
        updateExportCommitEnabled();
        updateFetchButtonEnabled();
      });
    }

    if (ghFolderInput) {
      ghFolderInput.addEventListener('input', () => {
        updateExportCommitEnabled();
        updateFetchButtonEnabled();
      });
      ghFolderInput.addEventListener('blur', () => {
        const normalized = normalizeFolderInput(ghFolderInput!.value);
        ghFolderInput!.value = normalized.display;
        deps.postToPlugin({
          type: 'GITHUB_SET_FOLDER',
          payload: { owner: currentOwner, repo: currentRepo, folder: normalized.payload }
        });
        persistGhState({ folder: normalized.payload });
        updateExportCommitEnabled();
        updateFetchButtonEnabled();
      });
    }

    if (ghCommitMsgInput) {
      ghCommitMsgInput.addEventListener('input', () => {
        updateExportCommitEnabled();
        persistGhState({ commitMessage: ghCommitMsgInput!.value || '' });
      });
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
        deps.log(`GitHub: fetching ${path} from ${currentOwner}/${currentRepo}@${branch}…`);
        const allowHex = !!pickAllowHexCheckbox()?.checked;
        deps.postToPlugin({
          type: 'GITHUB_FETCH_TOKENS',
          payload: { owner: currentOwner, repo: currentRepo, branch, path, allowHexStrings: allowHex }
        });
      });
    }

    if (ghExportAndCommitBtn) {
      ghExportAndCommitBtn.addEventListener('click', () => {
        const collectionSelect = pickCollectionSelect();
        const modeSelect = pickModeSelect();

        const scope: GithubScope = ghScopeAll && ghScopeAll.checked ? 'all' : 'selected';
        const commitMessage = (ghCommitMsgInput?.value || 'Update tokens from Figma').trim();
        const normalizedFolder = normalizeFolderInput(ghFolderInput?.value || '');

        if (!normalizedFolder.display) {
          deps.log('Pick a destination folder (e.g., tokens/).');
          ghFolderInput?.focus();
          updateExportCommitEnabled();
          return;
        }

        if (ghFolderInput) ghFolderInput.value = normalizedFolder.display;
        deps.postToPlugin({
          type: 'GITHUB_SET_FOLDER',
          payload: { owner: currentOwner, repo: currentRepo, folder: normalizedFolder.payload }
        });
        persistGhState({ folder: normalizedFolder.payload });

        const createPr = !!(ghCreatePrChk && ghCreatePrChk.checked);
        const payload: UiToPlugin = {
          type: 'GITHUB_EXPORT_AND_COMMIT',
          payload: {
            owner: currentOwner,
            repo: currentRepo,
            branch: getCurrentBranch(),
            folder: normalizedFolder.payload,
            commitMessage,
            scope,
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
    if (ghBranchSearch) ghBranchSearch.value = '';
    if (ghBranchSelect) setBranchDisabled(true, 'Pick a repository first…');
    updateBranchCount();
    updateFolderControlsEnabled();
    if (ghFolderInput) ghFolderInput.value = '';
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
        ghRememberPref = p.remember;
        saveRememberPref(ghRememberPref);
      } else {
        ghRememberPref = loadRememberPref();
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

    if (msg.type === 'GITHUB_RESTORE_SELECTED') {
      const p = msg.payload || {};
      currentOwner = typeof p.owner === 'string' ? p.owner : '';
      currentRepo = typeof p.repo === 'string' ? p.repo : '';
      desiredBranch = typeof p.branch === 'string' ? p.branch : null;

      if (typeof p.folder === 'string' && ghFolderInput) {
        const normalized = normalizeFolderInput(p.folder);
        ghFolderInput.value = normalized.display;
      }
      if (typeof p.commitMessage === 'string' && ghCommitMsgInput) {
        ghCommitMsgInput.value = p.commitMessage;
      }
      if (typeof p.scope === 'string') {
        if (p.scope === 'all' && ghScopeAll) ghScopeAll.checked = true;
        if (p.scope === 'selected' && ghScopeSelected) ghScopeSelected.checked = true;
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
          applyBranchFilter();
          if (ghBranchSelect) ghBranchSelect.value = newBranch;
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
          else waiter.reject({ ok: false, message: message || `HTTP ${pl.status || 0}` });
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
        deps.log(`Commit succeeded: ${url || '(no URL)'} (${branch})`);
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
        deps.log(`Commit failed (${msg.payload.status || 0}): ${msg.payload.message || 'unknown error'}`);
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
      if (msg.payload.ok) {
        deps.log(`Imported tokens from ${msg.payload.path} (${msg.payload.branch})`);
      } else {
        deps.log(`GitHub fetch failed (${msg.payload.status || 0}): ${msg.payload.message || 'unknown error'}`);
      }
      return true;
    }

    return false;
  }

  function onSelectionChange(): void {
    updateExportCommitEnabled();
  }

  return {
    attach,
    handleMessage,
    onSelectionChange
  };
}
