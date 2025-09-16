import type { PluginToUi, UiToPlugin } from './messages';

/* -------------------------------------------------------
 * Globals (assigned after DOMContentLoaded)
 * ----------------------------------------------------- */
let logEl: HTMLElement | null = null;
let rawEl: HTMLElement | null = null;

let exportAllChk: HTMLInputElement | null = null;
let collectionSelect: HTMLSelectElement | null = null;
let modeSelect: HTMLSelectElement | null = null;

let fileInput: HTMLInputElement | null = null;
let importBtn: HTMLButtonElement | null = null;
let exportBtn: HTMLButtonElement | null = null;
let exportPickers: HTMLElement | null = null;

let refreshBtn: HTMLButtonElement | null = null;

let shellEl: HTMLElement | null = null;
let drawerToggleBtn: HTMLButtonElement | null = null;

let w3cPreviewEl: HTMLElement | null = null;

let copyRawBtn: HTMLButtonElement | null = null;
let copyW3cBtn: HTMLButtonElement | null = null;
let copyLogBtn: HTMLButtonElement | null = null;

let allowHexChk: HTMLInputElement | null = null;

/* -------- GitHub controls (robust, optional) -------- */
let ghTokenInput: HTMLInputElement | null = null;
let ghRememberChk: HTMLInputElement | null = null;
let ghConnectBtn: HTMLButtonElement | null = null;
let ghVerifyBtn: HTMLButtonElement | null = null; // optional if present
let ghRepoSelect: HTMLSelectElement | null = null;

// --- Branch controls (optional if present) ---
let ghBranchSearch: HTMLInputElement | null = null;
let ghBranchSelect: HTMLSelectElement | null = null;
let ghBranchCountEl: HTMLElement | null = null;

// New-branch composer (optional)
let ghNewBranchBtn: HTMLButtonElement | null = null;
let ghNewBranchRow: HTMLElement | null = null;
let ghNewBranchName: HTMLInputElement | null = null;
let ghCreateBranchConfirmBtn: HTMLButtonElement | null = null;

let ghBranchRefreshBtn: HTMLButtonElement | null = null;

// NEW: Folder picker DOM refs
let ghFolderInput: HTMLInputElement | null = null;
let ghPickFolderBtn: HTMLButtonElement | null = null;

let ghCommitMsgInput: HTMLInputElement | null = null;
let ghExportAndCommitBtn: HTMLButtonElement | null = null;
let ghScopeSelected: HTMLInputElement | null = null;
let ghScopeAll: HTMLInputElement | null = null;


// ---- Folder list/create waiters (match replies from plugin) ----
type FolderListEntry = { type: 'dir' | 'file'; name: string; path: string };

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

// --- TTL for page data (stale-while-revalidate) ---
const BRANCH_TTL_MS = 60_000; // 60s
let lastBranchesFetchedAtMs = 0; // updated when any GITHUB_BRANCHES page arrives

// Inserted if missing:
let ghAuthStatusEl: HTMLElement | null = null; // “Authenticated as …”
let ghTokenMetaEl: HTMLElement | null = null;  // “Expires in …”
let ghLogoutBtn: HTMLButtonElement | null = null;

// Simple state
let ghIsAuthed = false;
let ghTokenExpiresAt: string | null = null; // ISO string if provided
let ghRememberPref: boolean = false;

const GH_REMEMBER_PREF_KEY = 'ghRememberPref';
const GH_MASK = '••••••••••';

/* --------- Branch local state (search + virtualization + paging) --------- */
let currentOwner = '';
let currentRepo = '';
let desiredBranch: string | null = null;       // from restore or user choice
let defaultBranchFromApi: string | undefined = undefined;

let loadedPages = 0;
let hasMorePages = false;
let isFetchingBranches = false;

let allBranches: string[] = [];         // merged across pages
let filteredBranches: string[] = [];    // result of search filter
let renderCount = 0;
const RENDER_STEP = 200;                // how many options to render per chunk

/* -------------------------------------------------------
 * Utilities
 * ----------------------------------------------------- */

// Turn "Collection 1_mode=Mode 1.tokens.json" → "Collection 1 - Mode 1.json"
function prettyExportName(original: string | undefined | null): string {
  const name = (original && typeof original === 'string') ? original : 'tokens.json';
  const m = name.match(/^(.*)_mode=(.*)\.tokens\.json$/);
  if (m) {
    const collection = m[1].trim();
    const mode = m[2].trim();
    return `${collection} - ${mode}.json`;
  }
  return name.endsWith('.json') ? name : (name + '.json');
}

// ---- File save helpers (native picker + fallback) ----
let pendingSave: { writable: FileSystemWritableFileStream, name: string } | null = null;

function supportsFilePicker(): boolean {
  return typeof (window as any).showSaveFilePicker === 'function';
}

function populateGhRepos(list: Array<{ full_name: string; default_branch: string; private: boolean }>): void {
  if (!ghRepoSelect) return;
  while (ghRepoSelect.options.length) ghRepoSelect.remove(0);
  for (const r of list) {
    const opt = document.createElement('option');
    opt.value = r.full_name;
    opt.textContent = r.full_name; // "org/repo"
    ghRepoSelect.appendChild(opt);
  }
  ghRepoSelect.disabled = list.length === 0;

  // Auto-select restored repo if we have one
  if (list.length > 0) {
    if (restoreOwner && restoreRepo) {
      const want = `${restoreOwner}/${restoreRepo}`;
      let matched = false;
      for (let i = 0; i < ghRepoSelect.options.length; i++) {
        if (ghRepoSelect.options[i].value === want) {
          ghRepoSelect.selectedIndex = i;
          matched = true;
          break;
        }
      }
      if (matched) {
        const ev = new Event('change', { bubbles: true });
        ghRepoSelect.dispatchEvent(ev);
      } else {
        ghRepoSelect.selectedIndex = 0;
        // 🔧 ensure owner/repo + branches populate
        const ev = new Event('change', { bubbles: true });
        ghRepoSelect.dispatchEvent(ev);
      }
    } else {
      ghRepoSelect.selectedIndex = 0;
      // 🔧 ensure owner/repo + branches populate
      const ev = new Event('change', { bubbles: true });
      ghRepoSelect.dispatchEvent(ev);
    }
  }

}

async function beginPendingSave(suggestedName: string): Promise<boolean> {
  try {
    if (!supportsFilePicker()) return false;
    const handle = await (window as any).showSaveFilePicker({
      suggestedName,
      types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
    });
    const writable: FileSystemWritableFileStream = await handle.createWritable();
    pendingSave = { writable, name: suggestedName };
    return true;
  } catch {
    pendingSave = null; // canceled or blocked
    return false;
  }
}

async function finishPendingSave(text: string): Promise<boolean> {
  if (!pendingSave) return false;
  try {
    await pendingSave.writable.write(new Blob([text], { type: 'application/json' }));
    await pendingSave.writable.close();
    return true;
  } catch {
    try { await pendingSave.writable.close(); } catch { /* ignore */ }
    return false;
  } finally {
    pendingSave = null;
  }
}

function triggerJsonDownload(filename: string, text: string): void {
  try {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.position = 'absolute';
    a.style.left = '-9999px';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
  } catch { /* no-throw */ }
}

function postResize(width: number, height: number): void {
  const w = Math.max(720, Math.min(1600, Math.floor(width)));
  const h = Math.max(420, Math.min(1200, Math.floor(height)));
  postToPlugin({ type: 'UI_RESIZE', payload: { width: w, height: h } });
}

async function copyElText(el: HTMLElement | null, label: string): Promise<void> {
  try {
    const text = el ? (el.textContent ?? '') : '';
    if (!text) { log(`Nothing to copy for ${label}.`); return; }

    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      await navigator.clipboard.writeText(text);
      log(`Copied ${label} to clipboard (${text.length} chars).`);
      return;
    }

    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);

    const ok = document.execCommand('copy');
    document.body.removeChild(ta);

    if (ok) log(`Copied ${label} to clipboard (${text.length} chars).`);
    else throw new Error('execCommand(copy) returned false');
  } catch {
    try {
      const anyNavigator = navigator as any;
      if (anyNavigator.permissions && anyNavigator.permissions.query) {
        const perm = await anyNavigator.permissions.query({ name: 'clipboard-write' as PermissionName });
        if (perm.state === 'granted' || 'prompt') {
          await navigator.clipboard.writeText((el?.textContent) ?? '');
          log(`Copied ${label} to clipboard.`);
          return;
        }
      }
    } catch { /* ignore */ }
    log(`Could not copy ${label}.`);
  }
}

function autoFitOnce(): void {
  if (typeof document === 'undefined') return;
  const contentW = Math.max(
    document.documentElement.scrollWidth,
    document.body ? document.body.scrollWidth : 0
  );
  const contentH = Math.max(
    document.documentElement.scrollHeight,
    document.body ? document.body.scrollHeight : 0
  );
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const needsW = contentW > vw ? contentW : vw;
  const needsH = contentH > vh ? contentH : vh;
  if (needsW > vw || needsH > vh) postResize(needsW, needsH);
}

/* -------------------------------------------------------
 * GitHub helpers (UI only; token never stored in UI)
 * ----------------------------------------------------- */
function findTokenInput(): HTMLInputElement | null {
  const byId =
    (document.getElementById('githubTokenInput') as HTMLInputElement | null) ||
    (document.getElementById('ghTokenInput') as HTMLInputElement | null) ||
    (document.getElementById('githubPatInput') as HTMLInputElement | null) ||
    (document.querySelector('input[name="githubToken"]') as HTMLInputElement | null);
  if (byId) return byId;
  // Fallback: guess
  const guess = document.querySelector('input[type="password"], input[type="text"]') as HTMLInputElement | null;
  return guess || null;
}

function readPatFromUi(): string {
  if (!ghTokenInput) ghTokenInput = findTokenInput();
  return (ghTokenInput?.value || '').trim();
}

function saveRememberPref(checked: boolean): void {
  try { window.localStorage.setItem(GH_REMEMBER_PREF_KEY, checked ? '1' : '0'); } catch { /* ignore */ }
}

function loadRememberPref(): boolean {
  try {
    const v = window.localStorage.getItem(GH_REMEMBER_PREF_KEY);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch { /* ignore */ }
  return false; // default
}

function ensureGhStatusElements(): void {
  ghAuthStatusEl = document.getElementById('ghAuthStatus');
  ghTokenMetaEl = document.getElementById('ghTokenMeta');
  ghLogoutBtn = document.getElementById('ghLogoutBtn') as HTMLButtonElement | null;

  const anchor = ghConnectBtn || ghVerifyBtn;
  if (!anchor || !anchor.parentElement) return;

  if (!ghAuthStatusEl) {
    ghAuthStatusEl = document.createElement('div');
    ghAuthStatusEl.id = 'ghAuthStatus';
    ghAuthStatusEl.className = 'muted';
    ghAuthStatusEl.style.marginTop = '6px';
    anchor.parentElement.appendChild(ghAuthStatusEl);
  }
  if (!ghTokenMetaEl) {
    ghTokenMetaEl = document.createElement('div');
    ghTokenMetaEl.id = 'ghTokenMeta';
    ghTokenMetaEl.className = 'muted';
    ghTokenMetaEl.style.marginTop = '2px';
    anchor.parentElement.appendChild(ghTokenMetaEl);
  }
  if (!ghLogoutBtn) {
    ghLogoutBtn = document.createElement('button');
    ghLogoutBtn.id = 'ghLogoutBtn';
    ghLogoutBtn.textContent = 'Log out';
    ghLogoutBtn.className = 'tab-btn';
    ghLogoutBtn.style.marginTop = '6px';
    ghLogoutBtn.addEventListener('click', onGitHubLogoutClick);
    anchor.parentElement.appendChild(ghLogoutBtn);
  }
}

function formatTimeLeft(expIso: string): string {
  const exp = Date.parse(expIso);
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
  ghTokenInput.type = 'password'; // keep masked even when user types
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
      if (ghTokenInput!.getAttribute('data-filled') === '1') {
        ghTokenInput!.removeAttribute('data-filled');
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

function validateBranchName(name: string): string | null {
  const n = name.trim();
  if (!n) return 'Enter a branch name.';
  if (/\s/.test(n)) return 'Branch name cannot contain spaces.';
  if (n.startsWith('refs/')) return 'Do not include "refs/heads/"; just the branch name.';
  if (n.endsWith('/') || n.startsWith('/')) return 'Branch name cannot start or end with "/".';
  if (n.includes('..') || n.includes('~') || n.includes('^') || n.includes(':') || n.includes('?') || n.includes('*') || n.includes('[')) {
    return 'Branch name contains invalid characters.';
  }
  return null;
}

function revalidateBranchesIfStale(forceLog: boolean = false): void {
  if (!ghRepoSelect || !ghBranchSelect) return;
  if (!currentOwner || !currentRepo) return;

  const stale = (Date.now() - lastBranchesFetchedAtMs) > BRANCH_TTL_MS;
  if (!stale) {
    if (forceLog) log('Branches are up to date (no refresh needed).');
    return;
  }

  desiredBranch = restoreBranch || desiredBranch || null; // keep preference if possible
  defaultBranchFromApi = undefined;
  loadedPages = 0; hasMorePages = false; isFetchingBranches = true;
  allBranches = []; filteredBranches = [];
  renderCount = 0;

  setBranchDisabled(true, 'Refreshing branches…');
  updateBranchCount();
  log('Refreshing branches…');

  (postToPlugin as any)({
    type: 'GITHUB_FETCH_BRANCHES',
    payload: { owner: currentOwner, repo: currentRepo, page: 1 }
  });
}

/* -------------------------------------------------------
 * Collections / logging
 * ----------------------------------------------------- */
let currentCollections: Array<{
  id: string;
  name: string;
  modes: Array<{ id: string; name: string }>;
  variables: Array<{ id: string; name: string; type: string }>;
}> = [];

function log(msg: string): void {
  const t = new Date().toLocaleTimeString();
  const line = document.createElement('div');
  line.textContent = '[' + t + '] ' + msg;
  if (logEl) {
    logEl.appendChild(line);
    (logEl as HTMLElement).scrollTop = (logEl as HTMLElement).scrollHeight;
  }
}

function postToPlugin(message: UiToPlugin | any): void {
  (parent as unknown as { postMessage: (m: unknown, t: string) => void })
    .postMessage({ pluginMessage: message }, '*');
}

function clearSelect(sel: HTMLSelectElement): void {
  while (sel.options.length > 0) sel.remove(0);
}

function setDisabledStates(): void {
  if (importBtn && fileInput) {
    const hasFile = !!(fileInput.files && fileInput.files.length > 0);
    importBtn.disabled = !hasFile;
  }

  if (exportBtn && exportAllChk && collectionSelect && modeSelect && exportPickers) {
    const exportAll = !!exportAllChk.checked;
    if (exportAll) {
      exportBtn.disabled = false;
      (exportPickers as HTMLElement).style.opacity = '0.5';
    } else {
      (exportPickers as HTMLElement).style.opacity = '1';
      const hasSelection = !!collectionSelect.value && !!modeSelect.value;
      exportBtn.disabled = !hasSelection;
    }
  }

  setGitHubDisabledStates();
}

function populateCollections(data: {
  collections: Array<{
    id: string; name: string;
    modes: Array<{ id: string; name: string }>;
    variables: Array<{ id: string; name: string; type: string }>;
  }>;
}): void {
  currentCollections = data.collections;
  if (!(collectionSelect && modeSelect)) return;

  clearSelect(collectionSelect);
  for (let i = 0; i < data.collections.length; i++) {
    const c = data.collections[i];
    const opt = document.createElement('option');
    opt.value = c.name;
    opt.textContent = c.name;
    collectionSelect.appendChild(opt);
  }
  onCollectionChange();
}

function onCollectionChange(): void {
  if (!(collectionSelect && modeSelect)) return;

  const selected = collectionSelect.value;
  clearSelect(modeSelect);

  let firstModeSet = false;
  for (let i = 0; i < currentCollections.length; i++) {
    const c = currentCollections[i];
    if (c.name === selected) {
      for (let j = 0; j < c.modes.length; j++) {
        const m = c.modes[j];
        const opt = document.createElement('option');
        opt.value = m.name;
        opt.textContent = m.name;
        modeSelect.appendChild(opt);
      }
      // ensure a default mode is selected for enablement logic
      if (modeSelect.options.length > 0 && modeSelect.selectedIndex === -1) {
        modeSelect.selectedIndex = 0;
        firstModeSet = true;
      }
      break;
    }
  }

  setDisabledStates();
  // make sure Export & Commit enablement reacts immediately
  updateExportCommitEnabled();

  // If we auto-set a mode (firstModeSet), update the preview as well
  if (firstModeSet) requestPreviewForCurrent();
}


function applyLastSelection(last: { collection: string; mode: string } | null): void {
  if (!last || !(collectionSelect && modeSelect)) return;

  let found = false;
  for (let i = 0; i < collectionSelect.options.length; i++) {
    if (collectionSelect.options[i].value === last.collection) {
      collectionSelect.selectedIndex = i;
      found = true;
      break;
    }
  }

  onCollectionChange();

  if (found) {
    for (let j = 0; j < modeSelect.options.length; j++) {
      if (modeSelect.options[j].value === last.mode) {
        modeSelect.selectedIndex = j;
        break;
      }
    }
  }

  setDisabledStates();
}

function prettyJson(obj: unknown): string {
  try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
}

function requestPreviewForCurrent(): void {
  if (!(collectionSelect && modeSelect)) return;
  const collection = collectionSelect.value || '';
  const mode = modeSelect.value || '';
  if (!collection || !mode) {
    if (w3cPreviewEl) w3cPreviewEl.textContent = '{ /* select a collection & mode to preview */ }';
    return;
  }
  postToPlugin({ type: 'PREVIEW_REQUEST', payload: { collection, mode } });
}

/* -------------------------------------------------------
 * GitHub: Branch helpers (Variant 4)
 * ----------------------------------------------------- */
function setBranchDisabled(disabled: boolean, placeholder?: string): void {
  if (!ghBranchSelect) return;
  ghBranchSelect.disabled = disabled;
  if (placeholder !== undefined) {
    clearSelect(ghBranchSelect);
    const opt = document.createElement('option');
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

function renderOptions(): void {
  if (!ghBranchSelect) return;
  const prev = ghBranchSelect.value;
  clearSelect(ghBranchSelect);

  const slice = filteredBranches.slice(0, renderCount);
  for (const name of slice) {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    ghBranchSelect.appendChild(opt);
  }

  if (filteredBranches.length > renderCount) {
    const opt = document.createElement('option');
    opt.value = '__more__';
    opt.textContent = `Load more… (${filteredBranches.length - renderCount} more)`;
    ghBranchSelect.appendChild(opt);
  } else if (hasMorePages) {
    const opt = document.createElement('option');
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
  (postToPlugin as any)({
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
  (postToPlugin as any)({
    type: 'GITHUB_SELECT_BRANCH',
    payload: { owner: currentOwner, repo: currentRepo, branch: v }
  });

  updateFolderControlsEnabled();
  // NEW: make sure CTA reflects the new branch choice
  updateExportCommitEnabled();
}



/* -------------------------------------------------------
 * GitHub button handlers
 * ----------------------------------------------------- */
function onGitHubConnectClick() {
  const tokenRaw = readPatFromUi();
  const isMasked = ghTokenInput?.getAttribute('data-filled') === '1';
  if (ghIsAuthed && isMasked) return; // already authenticated with stored token
  if (!tokenRaw) { log('GitHub: Paste a Personal Access Token first.'); return; }
  const remember = !!(ghRememberChk && ghRememberChk.checked);
  log('GitHub: Verifying token…');
  postToPlugin({ type: 'GITHUB_SET_TOKEN', payload: { token: tokenRaw, remember } } as any);
}

function onGitHubVerifyClick() {
  onGitHubConnectClick();
}

function onGitHubLogoutClick() {
  postToPlugin({ type: 'GITHUB_FORGET_TOKEN' } as any);
  ghIsAuthed = false;
  ghTokenExpiresAt = null;
  setPatFieldObfuscated(false);
  populateGhRepos([]);
  updateGhStatusUi();
  // Clear branch UI
  currentOwner = ''; currentRepo = '';
  allBranches = []; filteredBranches = [];
  desiredBranch = null; defaultBranchFromApi = undefined;
  loadedPages = 0; hasMorePages = false; isFetchingBranches = false;
  if (ghBranchSearch) ghBranchSearch.value = '';
  if (ghBranchSelect) setBranchDisabled(true, 'Pick a repository first…');
  updateBranchCount();
  updateFolderControlsEnabled();
  if (ghFolderInput) ghFolderInput.value = '';
  log('GitHub: Logged out.');
}

/* -------------------------------------------------------
 * Folder picker helpers (UI-only; lists from plugin)
 * ----------------------------------------------------- */

function getCurrentBranch(): string {
  const v = (ghBranchSelect && !ghBranchSelect.disabled &&
    ghBranchSelect.value && ghBranchSelect.value !== '__more__' && ghBranchSelect.value !== '__fetch__')
    ? ghBranchSelect.value
    : (desiredBranch || defaultBranchFromApi || '');
  return v || '';
}

function updateExportCommitEnabled(): void {
  const hasRepo = !!(currentOwner && currentRepo);
  const br = getCurrentBranch();
  const folder = (ghFolderInput?.value || '').trim();
  const commitMsg = (ghCommitMsgInput?.value || '').trim();
  const scopeAll = !!(ghScopeAll && ghScopeAll.checked);

  // If using “selected” scope, require collection+mode selected.
  const hasSelection = scopeAll
    ? true
    : !!(collectionSelect && collectionSelect.value && modeSelect && modeSelect.value);

  const ready = !!(ghIsAuthed && hasRepo && br && folder && commitMsg && hasSelection);

  if (ghExportAndCommitBtn) ghExportAndCommitBtn.disabled = !ready;
}


function updateFolderControlsEnabled(): void {
  const br = getCurrentBranch();
  const enable = !!(currentOwner && currentRepo && br);
  if (ghPickFolderBtn) ghPickFolderBtn.disabled = !enable;

  // NEW: also re-evaluate primary CTA readiness whenever folder controls change
  updateExportCommitEnabled();
}



function listDir(path: string): Promise<{ ok: true; entries: FolderListEntry[] } | { ok: false; message: string }> {
  return new Promise((resolve, _reject) => {
    const req = { path: path.replace(/^\/+|\/+$/g, '') };
    folderListWaiters.push({
      path: req.path,
      resolve: (v) => resolve(v),
      reject: (v) => resolve(v) // resolve with { ok:false } to keep caller simple
    });
    (postToPlugin as any)({
      type: 'GITHUB_FOLDER_LIST',
      payload: { owner: currentOwner, repo: currentRepo, branch: getCurrentBranch(), path: req.path }
    });
  });
}

function ensureFolder(folderPath: string): Promise<{ ok: true } | { ok: false; message: string; status?: number }> {
  return new Promise((resolve) => {
    const fp = folderPath.replace(/^\/+|\/+$/g, '');
    folderCreateWaiters.push({
      folderPath: fp,
      resolve: (v) => resolve(v),
      reject: (v) => resolve(v)
    });
    (postToPlugin as any)({
      type: 'GITHUB_CREATE_FOLDER',
      payload: { owner: currentOwner, repo: currentRepo, branch: getCurrentBranch(), folderPath: fp }
    });
  });
}

function openFolderPicker(): void {
  if (!currentOwner || !currentRepo) { log('Pick a repository first.'); return; }
  const ref = getCurrentBranch();
  if (!ref) { log('Pick a branch first.'); return; }

  const startPath = ghFolderInput?.value?.trim() || '';

  // Build a tiny modal
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.background = 'rgba(0,0,0,0.25)';
  overlay.style.zIndex = '99999';
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const modal = document.createElement('div');
  modal.style.position = 'absolute';
  modal.style.left = '50%';
  modal.style.top = '50%';
  modal.style.transform = 'translate(-50%, -50%)';
  modal.style.width = 'min(560px, 92vw)';
  modal.style.maxHeight = '80vh';
  modal.style.display = 'flex';
  modal.style.flexDirection = 'column';
  modal.style.background = '#fff';
  modal.style.border = '1px solid var(--border)';
  modal.style.borderRadius = '10px';
  modal.style.boxShadow = '0 10px 30px rgba(0,0,0,.12)';
  modal.style.padding = '12px';
  modal.style.gap = '10px';

  const title = document.createElement('div');
  title.innerHTML = `<div class="eyebrow">Pick destination</div>
    <div class="title" style="font-size:14px;">${currentOwner}/${currentRepo} @ ${ref}</div>`;

  const pathRow = document.createElement('div');
  pathRow.style.display = 'flex';
  pathRow.style.gap = '8px';
  const pathInput = document.createElement('input');
  pathInput.type = 'text';
  pathInput.value = startPath;
  pathInput.placeholder = 'tokens/ (optional)';
  pathInput.style.flex = '1';
  pathInput.readOnly = false;
  const chooseHereBtn = document.createElement('button');
  chooseHereBtn.textContent = 'Use this folder';
  chooseHereBtn.className = 'tab-btn';
  chooseHereBtn.style.flex = '0 0 auto';

  const list = document.createElement('div');
  list.style.border = '1px solid var(--border)';
  list.style.borderRadius = '8px';
  list.style.background = '#fff';
  list.style.minHeight = '160px';
  list.style.maxHeight = '50vh';
  list.style.overflow = 'auto';
  list.style.padding = '6px';

  const actionsRow = document.createElement('div');
  actionsRow.style.display = 'flex';
  actionsRow.style.gap = '8px';
  actionsRow.style.justifyContent = 'space-between';

  const newBtn = document.createElement('button');
  newBtn.textContent = 'New folder…';
  newBtn.className = 'tab-btn';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.className = 'tab-btn';

  pathRow.appendChild(pathInput);
  pathRow.appendChild(chooseHereBtn);
  actionsRow.appendChild(newBtn);
  actionsRow.appendChild(cancelBtn);
  modal.appendChild(title);
  modal.appendChild(pathRow);
  modal.appendChild(list);
  modal.appendChild(actionsRow);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  let currentPath = startPath.replace(/^\/+|\/+$/g, '');

  function close() {
    try { document.body.removeChild(overlay); } catch { /* noop */ }
  }

  function setPath(p: string) {
    currentPath = p.replace(/^\/+/, '').replace(/\/+$/, '');
    pathInput.value = currentPath;
    refreshListing();
  }

  function item(label: string, click: () => void, muted = false) {
    const row = document.createElement('div');
    row.textContent = label;
    row.style.padding = '6px 8px';
    row.style.cursor = 'pointer';
    row.style.borderRadius = '6px';
    row.style.userSelect = 'none';
    row.style.color = muted ? 'var(--ink-muted)' : 'inherit';
    row.addEventListener('click', click);
    row.addEventListener('mouseenter', () => { row.style.background = '#f3f4f6'; });
    row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });
    return row;
  }

  async function refreshListing() {
    list.innerHTML = '';
    const p = currentPath;
    const parent = p.split('/').filter(Boolean);
    parent.pop();
    if (p) list.appendChild(item('.. (up one level)', () => setPath(parent.join('/')), true));

    const res = await listDir(currentPath);
    if (!(res as any).ok) {
      list.appendChild(item(`Error: ${(res as any).message || 'failed to fetch'}`, () => { }, true));
      return;
    }
    const entries = (res as any).entries as FolderListEntry[];
    const dirs = (entries || []).filter(e => e.type === 'dir').sort((a, b) => a.name.localeCompare(b.name));
    if (dirs.length === 0) {
      list.appendChild(item('(no subfolders)', () => { }, true));
    } else {
      for (const d of dirs) {
        list.appendChild(item(d.name + '/', () => {
          const next = currentPath ? (currentPath + '/' + d.name) : d.name;
          setPath(next);
        }));
      }
    }
  }

  // allow typing path directly
  pathInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); setPath(pathInput.value || ''); }
  });
  pathInput.addEventListener('blur', () => setPath(pathInput.value || ''));

  chooseHereBtn.addEventListener('click', () => {
    const normalized = currentPath ? (currentPath.endsWith('/') ? currentPath : currentPath + '/') : '';
    if (ghFolderInput) ghFolderInput.value = normalized;
    (postToPlugin as any)({
      type: 'GITHUB_SET_FOLDER',
      payload: { owner: currentOwner, repo: currentRepo, folder: normalized }
    });
    close();
    log(`Folder selected: ${normalized || '(repo root)'}`);

    // NEW:
    updateExportCommitEnabled();
  });

  // NO COMMIT here: virtual create; actual creation will happen with the first write on export/PR.
  newBtn.addEventListener('click', () => {
    const name = prompt('New folder name (no spaces; use "-" or "_")', 'tokens');
    if (!name) return;
    const n = name.trim().replace(/^\/+/, '').replace(/\/+$/, '');
    if (!n || /\s/.test(n) || /[~^:?*[\]\\]/.test(n)) { alert('Invalid folder name.'); return; }
    const next = currentPath ? (currentPath + '/' + n) : n;
    setPath(next);
    const normalized = next.endsWith('/') ? next : next + '/';
    if (ghFolderInput) ghFolderInput.value = normalized;
    (postToPlugin as any)({
      type: 'GITHUB_SET_FOLDER',
      payload: { owner: currentOwner, repo: currentRepo, folder: normalized }
    });
    close();
    log(`Folder selected (will be created on export): ${normalized}`);

    // NEW:
    updateExportCommitEnabled();
  });


  cancelBtn.addEventListener('click', close);

  // initial
  setPath(currentPath);
}

/* -------------------------------------------------------
 * Message pump
 * ----------------------------------------------------- */
let restoreOwner: string | null = null;
let restoreRepo: string | null = null;
let restoreBranch: string | null = null;

window.addEventListener('message', async (event: MessageEvent) => {
  const data: unknown = (event as unknown as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return;

  let msg: PluginToUi | any | null = null;
  if ((data as any).pluginMessage && typeof (data as any).pluginMessage === 'object') {
    const maybe = (data as any).pluginMessage;
    if (maybe && typeof maybe.type === 'string') msg = maybe;
  }
  if (!msg) return;

  // Keep generic INFO/ERROR logs visible
  if (msg.type === 'ERROR') { log('ERROR: ' + (msg.payload?.message ?? '')); return; }
  if (msg.type === 'INFO') { log(msg.payload?.message ?? ''); return; }

  // GitHub auth state from plugin
  if (msg.type === 'GITHUB_AUTH_RESULT') {
    const p = msg.payload || {};
    ghIsAuthed = !!p.ok;
    ghTokenExpiresAt = p.exp || p.tokenExpiration || null;

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
      log(`GitHub: Authenticated as ${who}${name}.`);
    } else {
      setPatFieldObfuscated(false);
      const why = p.error ? `: ${p.error}` : '.';
      log(`GitHub: Authentication failed${why}`);
    }

    updateGhStatusUi();
    updateExportCommitEnabled(); // 🔧 make the CTA reconsider readiness
    return;
  }



  if (msg.type === 'EXPORT_RESULT') {
    const files = Array.isArray(msg.payload?.files) ? msg.payload.files : [];
    if (files.length === 0) { log('Nothing to export.'); return; }

    if (pendingSave && files.length === 1) {
      const only = files[0];
      const fname = prettyExportName(only?.name);
      const text = prettyJson(only?.json);

      const ok = await finishPendingSave(text);
      if (ok) {
        log('Saved ' + fname + ' via file picker.');
        const div = document.createElement('div');
        const link = document.createElement('a');
        link.href = '#';
        link.textContent = 'Download ' + fname + ' again';
        link.addEventListener('click', (e) => { e.preventDefault(); triggerJsonDownload(fname, text); });
        if (logEl) {
          div.appendChild(link);
          logEl.appendChild(div);
          (logEl as HTMLElement).scrollTop = (logEl as HTMLElement).scrollHeight;
        }
        log('Export ready.');
        return;
      }
      log('Could not write via file picker; falling back to download links.');
    }

    setDrawerOpen(true);
    for (let k = 0; k < files.length; k++) {
      const f = files[k];
      const fname = prettyExportName(f?.name);
      const text = prettyJson(f?.json);
      triggerJsonDownload(fname, text);

      const div = document.createElement('div');
      const link = document.createElement('a');
      link.href = '#';
      link.textContent = 'Download ' + fname;
      link.addEventListener('click', (e) => { e.preventDefault(); triggerJsonDownload(fname, text); });
      if (logEl) {
        div.appendChild(link);
        logEl.appendChild(div);
        (logEl as HTMLElement).scrollTop = (logEl as HTMLElement).scrollHeight;
      }
    }
    log('Export ready.');
    return;
  }

  if (msg.type === 'W3C_PREVIEW') {
    const displayName = prettyExportName(msg.payload.name);
    const header = `/* ${displayName} */\n`;
    if (w3cPreviewEl) w3cPreviewEl.textContent = header + prettyJson(msg.payload.json);
    return;
  }

  if (msg.type === 'COLLECTIONS_DATA') {
    populateCollections({ collections: msg.payload.collections });
    if (exportAllChk) exportAllChk.checked = !!msg.payload.exportAllPref;
    const last = (msg.payload as any).last as { collection: string; mode: string } | null;
    applyLastSelection(last);
    setDisabledStates();
    requestPreviewForCurrent();
    return;
  }

  if (msg.type === 'RAW_COLLECTIONS_TEXT') {
    if (rawEl) rawEl.textContent = msg.payload.text;
    return;
  }

  if ((msg as any).type === 'GITHUB_REPOS') {
    const repos = ((msg as any).payload?.repos ?? []) as Array<{ full_name: string; default_branch: string; private: boolean }>;
    populateGhRepos(repos);
    log(`GitHub: Repository list updated (${repos.length}).`);
    return;
  }

  // Restore selected repo/branch/folder (from plugin storage)
  if ((msg as any).type === 'GITHUB_RESTORE_SELECTED') {
    const p = (msg as any).payload || {};
    restoreOwner = typeof p.owner === 'string' ? p.owner : null;
    restoreRepo = typeof p.repo === 'string' ? p.repo : null;
    restoreBranch = typeof p.branch === 'string' ? p.branch : null;

    if (typeof p.folder === 'string' && ghFolderInput) {
      const f = p.folder.replace(/^\/+|\/+$/g, '');
      ghFolderInput.value = f ? (f.endsWith('/') ? f : f + '/') : '';
      // NEW:
      updateExportCommitEnabled();
    }


    desiredBranch = restoreBranch;
    // If repos already loaded, try to select now
    if (ghRepoSelect && restoreOwner && restoreRepo) {
      const want = `${restoreOwner}/${restoreRepo}`;
      let matched = false;
      for (let i = 0; i < ghRepoSelect.options.length; i++) {
        if (ghRepoSelect.options[i].value === want) {
          ghRepoSelect.selectedIndex = i;
          matched = true;
          break;
        }
      }
      if (matched) {
        const ev = new Event('change', { bubbles: true });
        ghRepoSelect.dispatchEvent(ev);
      }
    }
    return;
  }

  // Branches page arrived
  if ((msg as any).type === 'GITHUB_BRANCHES') {
    const pl = (msg as any).payload || {};
    const owner = String(pl.owner || '');
    const repo = String(pl.repo || '');
    if (owner !== currentOwner || repo !== currentRepo) return; // stale

    lastBranchesFetchedAtMs = Date.now();

    loadedPages = Number(pl.page || 1);
    hasMorePages = !!pl.hasMore;
    isFetchingBranches = false;

    if (typeof pl.defaultBranch === 'string' && !defaultBranchFromApi) {
      defaultBranchFromApi = pl.defaultBranch;
    }

    const btn = document.getElementById('ghNewBranchBtn') as HTMLButtonElement | null;
    if (btn) btn.disabled = false;

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
      log(`GitHub: near rate limit; resets ~${t}`);
    }

    log(`Loaded ${names.length} branches (page ${loadedPages}) for ${repo}${hasMorePages ? '…' : ''}`);
    return;
  }

  // Branch load error
  if ((msg as any).type === 'GITHUB_BRANCHES_ERROR') {
    const pl = (msg as any).payload || {};
    const owner = String(pl.owner || '');
    const repo = String(pl.repo || '');
    if (owner !== currentOwner || repo !== currentRepo) return; // stale
    isFetchingBranches = false;
    setBranchDisabled(false);
    updateFolderControlsEnabled();
    log(`Branch load failed (status ${pl.status}): ${pl.message || 'unknown error'}`);
    if (pl.samlRequired) log('This org requires SSO. Open the repo in your browser and authorize SSO for your token.');
    if (pl.rate && typeof pl.rate.resetEpochSec === 'number') {
      const t = new Date(pl.rate.resetEpochSec * 1000).toLocaleTimeString();
      log(`Rate limit issue; resets ~${t}`);
    }
    return;
  }

  if ((msg as any).type === 'GITHUB_CREATE_BRANCH_RESULT') {
    const pl = (msg as any).payload || {};
    if (ghCreateBranchConfirmBtn) ghCreateBranchConfirmBtn.disabled = false;

    if (!pl || typeof pl.ok !== 'boolean') return;

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
        log(`Branch created: ${newBranch} (from ${baseBranch})`);
        const a = document.createElement('a');
        a.href = url;
        a.textContent = 'View on GitHub';
        a.target = '_blank';
        const wrap = document.createElement('div');
        wrap.appendChild(a);
        if (logEl) {
          logEl.appendChild(wrap);
          (logEl as HTMLElement).scrollTop = (logEl as HTMLElement).scrollHeight;
        }
      } else {
        log(`Branch created: ${newBranch} (from ${baseBranch})`);
      }
      return;
    }

    const status = pl.status ?? 0;
    const message = pl.message || 'unknown error';
    log(`Create branch failed (status ${status}): ${message}`);
    if (pl.samlRequired) {
      log('This org requires SSO. Open the repo in your browser and authorize SSO for your token.');
    } else if (status === 403) {
      if (pl.noPushPermission) {
        log('You do not have push permission to this repository. Ask a maintainer for write access.');
      } else {
        log('Likely a token permission issue:');
        log('• Classic PAT: add the "repo" scope (or "public_repo" for public repos).');
        log('• Fine-grained PAT: grant this repository and set "Contents: Read and write".');
      }
    }
    if (pl.rate && typeof pl.rate.resetEpochSec === 'number') {
      const t = new Date(pl.rate.resetEpochSec * 1000).toLocaleTimeString();
      log(`Rate limit issue; resets ~${t}`);
    }
    return;
  }

  // Folder list result (echoed by plugin)
  if ((msg as any).type === 'GITHUB_FOLDER_LIST_RESULT') {
    const pl = (msg as any).payload || {};
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
    return;
  }

  // Create folder result (kept for future – UI does not call it by default)
  if ((msg as any).type === 'GITHUB_CREATE_FOLDER_RESULT') {
    const pl = (msg as any).payload || {};
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
    return;
  }

  if ((msg as any).type === 'GITHUB_EXPORT_AND_COMMIT_RESULT') {
    const p = (msg as any).payload || {};
    if (p.ok) {
      const url = String(p.commitUrl || '');
      log(`Commit succeeded: ${url || '(no URL)'} (${p.branch || ''})`);
      if (url && logEl) {
        const wrap = document.createElement('div');
        const a = document.createElement('a');
        a.href = url;
        a.target = '_blank';
        a.textContent = 'View commit';
        wrap.appendChild(a);
        logEl.appendChild(wrap);
        (logEl as HTMLElement).scrollTop = (logEl as HTMLElement).scrollHeight;
      }
    } else {
      log(`Commit failed (${p.status || 0}): ${p.message || 'unknown error'}`);
    }
    return;
  }


});

/* -------------------------------------------------------
 * DOM wiring (runs when document exists)
 * ----------------------------------------------------- */
document.addEventListener('DOMContentLoaded', function () {
  if (typeof document === 'undefined') return;

  // Assign elements
  logEl = document.getElementById('log');
  rawEl = document.getElementById('raw');

  exportAllChk = document.getElementById('exportAllChk') as HTMLInputElement | null;
  collectionSelect = document.getElementById('collectionSelect') as HTMLSelectElement | null;
  modeSelect = document.getElementById('modeSelect') as HTMLSelectElement | null;

  fileInput = document.getElementById('file') as HTMLInputElement | null;
  importBtn = document.getElementById('importBtn') as HTMLButtonElement | null;
  exportBtn = document.getElementById('exportBtn') as HTMLButtonElement | null;
  exportPickers = document.getElementById('exportPickers');

  refreshBtn = document.getElementById('refreshBtn') as HTMLButtonElement | null;

  shellEl = document.querySelector('.shell') as HTMLElement | null;
  drawerToggleBtn = document.getElementById('drawerToggleBtn') as HTMLButtonElement | null;

  w3cPreviewEl = document.getElementById('w3cPreview') as HTMLElement | null;

  copyRawBtn = document.getElementById('copyRawBtn') as HTMLButtonElement | null;
  copyW3cBtn = document.getElementById('copyW3cBtn') as HTMLButtonElement | null;
  copyLogBtn = document.getElementById('copyLogBtn') as HTMLButtonElement | null;

  allowHexChk = document.getElementById('allowHexChk') as HTMLInputElement | null;

  // GitHub controls (robust lookups)
  ghTokenInput = findTokenInput();
  ghRememberChk = (document.getElementById('githubRememberChk') as HTMLInputElement | null)
    || (document.getElementById('ghRememberChk') as HTMLInputElement | null);
  ghConnectBtn = (document.getElementById('githubConnectBtn') as HTMLButtonElement | null)
    || (document.getElementById('ghConnectBtn') as HTMLButtonElement | null);
  ghVerifyBtn = (document.getElementById('githubVerifyBtn') as HTMLButtonElement | null)
    || (document.getElementById('ghVerifyBtn') as HTMLButtonElement | null);
  ghRepoSelect = document.getElementById('ghRepoSelect') as HTMLSelectElement | null;

  // Optional Branch controls
  ghBranchSearch = document.getElementById('ghBranchSearch') as HTMLInputElement | null;
  ghBranchSelect = document.getElementById('ghBranchSelect') as HTMLSelectElement | null;
  ghBranchCountEl = document.getElementById('ghBranchCount') as HTMLElement | null;

  // Folder picker controls
  ghFolderInput = document.getElementById('ghFolderInput') as HTMLInputElement | null;
  ghPickFolderBtn = document.getElementById('ghPickFolderBtn') as HTMLButtonElement | null;

  ghCommitMsgInput = document.getElementById('ghCommitMsgInput') as HTMLInputElement | null;
  ghExportAndCommitBtn = document.getElementById('ghExportAndCommitBtn') as HTMLButtonElement | null;
  ghScopeSelected = document.getElementById('ghScopeSelected') as HTMLInputElement | null;
  ghScopeAll = document.getElementById('ghScopeAll') as HTMLInputElement | null;


  // Load saved “remember me” preference immediately (UI-level persistence)
  ghRememberPref = loadRememberPref();
  if (ghRememberChk) ghRememberChk.checked = ghRememberPref;
  if (ghRememberChk) ghRememberChk.addEventListener('change', () => {
    ghRememberPref = !!ghRememberChk!.checked;
    saveRememberPref(ghRememberPref);
    updateGhStatusUi();
  });

  // Ensure status/meta/logout exist next to Connect
  ensureGhStatusElements();

  // Wire GitHub buttons
  if (ghConnectBtn) ghConnectBtn.addEventListener('click', onGitHubConnectClick);
  if (ghVerifyBtn) ghVerifyBtn.addEventListener('click', onGitHubVerifyClick);

  // Repo → branch load
  if (ghRepoSelect && ghBranchSelect) {
    let lastRepoKey = ''; // 🔧 new: de-dupe identical selections

    ghRepoSelect.addEventListener('change', function () {
      const value = ghRepoSelect!.value; // "owner/repo"
      if (!value) return;
      if (value === lastRepoKey) return; // 🔧 avoid duplicate loads on same value
      lastRepoKey = value;

      const parts = value.split('/');
      currentOwner = parts[0] || '';
      currentRepo = parts[1] || '';

      updateExportCommitEnabled();

      // reset branch cache freshness
      lastBranchesFetchedAtMs = 0;

      (postToPlugin as any)({ type: 'GITHUB_SELECT_REPO', payload: { owner: currentOwner, repo: currentRepo } });

      desiredBranch = restoreBranch || null;
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
        log(`GitHub: loading branches for ${currentOwner}/${currentRepo}…`);
        isFetchingBranches = true;
        (postToPlugin as any)({
          type: 'GITHUB_FETCH_BRANCHES',
          payload: { owner: currentOwner, repo: currentRepo, page: 1 }
        });
      }

      updateExportCommitEnabled();
    });
  }



  // Branch search and list listeners
  if (ghBranchSearch) {
    let t: number | undefined;
    ghBranchSearch.addEventListener('input', () => {
      if (t) window.clearTimeout(t);
      t = window.setTimeout(() => {
        applyBranchFilter();
      }, 120);
    });
  }
  if (ghBranchSelect) {
    ghBranchSelect.addEventListener('change', onBranchChange);
    ghBranchSelect.addEventListener('scroll', onBranchScroll);
  }

  if (ghBranchSearch) {
    ghBranchSearch.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        revalidateBranchesIfStale(true);
      }
    });
  }

  ghBranchRefreshBtn = document.getElementById('ghBranchRefreshBtn') as HTMLButtonElement | null;
  if (ghBranchRefreshBtn) {
    ghBranchRefreshBtn.addEventListener('click', () => {
      lastBranchesFetchedAtMs = 0;
      revalidateBranchesIfStale(true);
    });
  }

  // Folder picker button wiring
  if (ghPickFolderBtn) {
    ghPickFolderBtn.addEventListener('click', openFolderPicker);
  }

  if (ghCommitMsgInput) ghCommitMsgInput.addEventListener('input', updateExportCommitEnabled);

  // Let users type a folder directly
  if (ghFolderInput) {
    ghFolderInput.addEventListener('input', updateExportCommitEnabled);
    ghFolderInput.addEventListener('blur', () => {
      const raw = ghFolderInput!.value.trim();
      const normalized = raw.replace(/^\/+|\/+$/g, ''); // trim both sides
      ghFolderInput!.value = normalized ? (normalized.endsWith('/') ? normalized : normalized + '/') : '';
      (postToPlugin as any)({
        type: 'GITHUB_SET_FOLDER',
        payload: { owner: currentOwner, repo: currentRepo, folder: ghFolderInput!.value }
      });
      updateExportCommitEnabled();
    });
  }

  // Scope radios influence readiness
  if (ghScopeSelected) ghScopeSelected.addEventListener('change', updateExportCommitEnabled);
  if (ghScopeAll) ghScopeAll.addEventListener('change', updateExportCommitEnabled);

  // When the left pickers change, also re-evaluate readiness (if using “selected”)
  if (collectionSelect) collectionSelect.addEventListener('change', updateExportCommitEnabled);
  if (modeSelect) modeSelect.addEventListener('change', updateExportCommitEnabled);

  // Primary action
  if (ghExportAndCommitBtn) {
    ghExportAndCommitBtn.addEventListener('click', () => {
      const scope = ghScopeAll && ghScopeAll.checked ? 'all' : 'selected';
      const commitMessage = (ghCommitMsgInput?.value || 'Update tokens from Figma').trim();
      const folder = (ghFolderInput?.value || '').trim().replace(/^\/+|\/+$/g, ''); // no slashes at ends

      const payload: any = {
        owner: currentOwner,
        repo: currentRepo,
        branch: getCurrentBranch(),
        folder,
        commitMessage,
        scope
      };

      if (scope === 'selected' && collectionSelect && modeSelect) {
        payload.collection = collectionSelect.value || '';
        payload.mode = modeSelect.value || '';
      }

      log('Export & Commit requested…');
      (postToPlugin as any)({ type: 'GITHUB_EXPORT_AND_COMMIT', payload });
    });
  }


  // Other UI events
  if (fileInput) fileInput.addEventListener('change', setDisabledStates);

  if (exportAllChk) {
    exportAllChk.addEventListener('change', function () {
      setDisabledStates();
      postToPlugin({ type: 'SAVE_PREFS', payload: { exportAll: !!exportAllChk!.checked } });
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', function () {
      postToPlugin({ type: 'FETCH_COLLECTIONS' });
    });
  }

  if (importBtn && fileInput) {
    importBtn.addEventListener('click', function () {
      if (!fileInput!.files || fileInput!.files.length === 0) { log('Select a JSON file first.'); return; }
      const reader = new FileReader();
      reader.onload = function () {
        try {
          const text = String(reader.result);
          const json = JSON.parse(text);
          if (json && typeof json === 'object' && !(json instanceof Array)) {
            postToPlugin({
              type: 'IMPORT_DTCG',
              payload: { json: json, allowHexStrings: !!(allowHexChk && allowHexChk.checked) }
            });
            log('Import requested.');
          } else {
            log('Invalid JSON structure for tokens (expected an object).');
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          log('Failed to parse JSON: ' + msg);
        }
      };
      reader.readAsText(fileInput!.files[0]);
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener('click', async function () {
      let exportAll = false;
      if (exportAllChk) exportAll = !!exportAllChk.checked;

      const payload: { exportAll: boolean; collection?: string; mode?: string } = { exportAll };
      if (!exportAll && collectionSelect && modeSelect) {
        payload.collection = collectionSelect.value;
        payload.mode = modeSelect.value;
        if (!(payload.collection && payload.mode)) { log('Pick collection and mode or use "Export all".'); return; }
      }

      const suggestedName = exportAll
        ? 'tokens.json'
        : prettyExportName(`${payload.collection ?? 'Tokens'}_mode=${payload.mode ?? 'Mode 1'}.tokens.json`);

      await beginPendingSave(suggestedName);

      postToPlugin({ type: 'EXPORT_DTCG', payload });
      if (exportAll) log('Export all requested.');
      else log(`Export requested for "${payload.collection || ''}" / "${payload.mode || ''}".`);
    });
  }

  if (drawerToggleBtn) {
    drawerToggleBtn.addEventListener('click', function () {
      const current = drawerToggleBtn!.getAttribute('aria-expanded') === 'true';
      setDrawerOpen(!current);
    });
  }

  if (collectionSelect) {
    collectionSelect.addEventListener('change', function () {
      onCollectionChange();
      if (collectionSelect && modeSelect) {
        postToPlugin({ type: 'SAVE_LAST', payload: { collection: collectionSelect.value, mode: modeSelect.value } });
        requestPreviewForCurrent();
      }
    });
  }

  if (modeSelect) {
    modeSelect.addEventListener('change', function () {
      if (collectionSelect && modeSelect) {
        postToPlugin({ type: 'SAVE_LAST', payload: { collection: collectionSelect.value, mode: modeSelect.value } });
      }
      setDisabledStates();
      requestPreviewForCurrent();
      updateExportCommitEnabled();   // <— add this line
    });
  }


  if (copyRawBtn) copyRawBtn.addEventListener('click', () =>
    copyElText(document.getElementById('raw') as HTMLElement, 'Raw Figma Collections')
  );
  if (copyW3cBtn) copyW3cBtn.addEventListener('click', () =>
    copyElText(document.getElementById('w3cPreview') as HTMLElement, 'W3C Preview')
  );
  if (copyLogBtn) copyLogBtn.addEventListener('click', () =>
    copyElText(document.getElementById('log') as HTMLElement, 'Log')
  );

  // Initial UI state + announce ready
  if (rawEl) rawEl.textContent = 'Loading variable collections…';
  setDisabledStates();
  setDrawerOpen(getSavedDrawerOpen());
  postToPlugin({ type: 'UI_READY' });

  if (ghBranchSelect) setBranchDisabled(true, 'Pick a repository first…');
  updateBranchCount();
  autoFitOnce();

  // NEW: ensure initial enabled/disabled state is correct on load
  updateFolderControlsEnabled();
  updateExportCommitEnabled();


  // New-branch composer DOM
  ghNewBranchBtn = document.getElementById('ghNewBranchBtn') as HTMLButtonElement | null;
  ghNewBranchRow = document.getElementById('ghNewBranchRow') as HTMLElement | null;
  ghNewBranchName = document.getElementById('ghNewBranchName') as HTMLInputElement | null;
  ghCreateBranchConfirmBtn = document.getElementById('ghCreateBranchConfirmBtn') as HTMLButtonElement | null;

  if (ghNewBranchBtn) {
    ghNewBranchBtn.addEventListener('click', () => {
      if (!currentOwner || !currentRepo) { log('Pick a repository first.'); return; }
      showNewBranchRow(true);
    });
  }
  if (ghCreateBranchConfirmBtn) {
    ghCreateBranchConfirmBtn.addEventListener('click', () => {
      if (!ghNewBranchName) return;
      const name = ghNewBranchName.value || '';
      const err = validateBranchName(name);
      if (err) { log(`New branch: ${err}`); return; }

      const base =
        (ghBranchSelect && ghBranchSelect.value && !ghBranchSelect.disabled && ghBranchSelect.value !== '__more__' && ghBranchSelect.value !== '__fetch__')
          ? ghBranchSelect.value
          : (defaultBranchFromApi || '');

      if (!base) { log('Cannot determine base branch; select a branch first.'); return; }

      log(`Creating branch "${name}" from "${base}"…`);
      (postToPlugin as any)({
        type: 'GITHUB_CREATE_BRANCH',
        payload: { owner: currentOwner, repo: currentRepo, baseBranch: base, newBranch: name }
      });
      ghCreateBranchConfirmBtn!.disabled = true;
    });
  }

});

/* -------------------------------------------------------
 * Drawer helpers
 * ----------------------------------------------------- */
function setDrawerOpen(open: boolean): void {
  if (shellEl) {
    if (open) shellEl.classList.remove('drawer-collapsed');
    else shellEl.classList.add('drawer-collapsed');
  }
  if (drawerToggleBtn) {
    drawerToggleBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    drawerToggleBtn.textContent = open ? 'Hide' : 'Show';
    drawerToggleBtn.title = open ? 'Hide log' : 'Show log';
  }
  try { window.localStorage.setItem('drawerOpen', open ? '1' : '0'); } catch { /* ignore */ }
}

function getSavedDrawerOpen(): boolean {
  try {
    const v = window.localStorage.getItem('drawerOpen');
    if (v === '0') return false;
    if (v === '1') return true;
  } catch { /* ignore */ }
  return true;
}
