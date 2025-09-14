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
  if (list.length > 0) ghRepoSelect.selectedIndex = 0;
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
        if (perm.state === 'granted' || perm.state === 'prompt') {
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
      exportPickers.style.opacity = '0.5';
    } else {
      exportPickers.style.opacity = '1';
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
      break;
    }
  }
  setDisabledStates();
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
  log('GitHub: Logged out.');
}

/* -------------------------------------------------------
 * Message pump
 * ----------------------------------------------------- */
window.addEventListener('message', async (event: MessageEvent) => {
  const data: unknown = (event as unknown as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return;

  let msg: PluginToUi | any | null = null;
  if ((data as any).pluginMessage && typeof (data as any).pluginMessage === 'object') {
    const maybe = (data as any).pluginMessage;
    if (maybe && typeof maybe.type === 'string') msg = maybe;
  }
  if (!msg) return;

  if (msg.type === 'ERROR') { log('ERROR: ' + msg.payload.message); return; }
  if (msg.type === 'INFO') { log(msg.payload.message); return; }

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

  // Request a size that fits current content
  autoFitOnce();
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
