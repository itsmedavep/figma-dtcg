// src/app/ui.ts
// In-panel UI logic for the plugin: dom wiring, GitHub workflows, and export helpers.
// - Mirrors plugin state via postMessage so the UI can function offline
// - Provides guarded DOM helpers to survive partial renders or optional features

import type { PluginToUi, UiToPlugin } from './messages';
import { createGithubUi } from './github/ui';

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
let resizeHandleEl: HTMLElement | null = null;

let w3cPreviewEl: HTMLElement | null = null;

let copyRawBtn: HTMLButtonElement | null = null;
let copyW3cBtn: HTMLButtonElement | null = null;
let copyLogBtn: HTMLButtonElement | null = null;

let allowHexChk: HTMLInputElement | null = null;


/* -------------------------------------------------------
 * Shared helpers
 * ----------------------------------------------------- */

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

let pendingSave: { writable: FileSystemWritableFileStream, name: string } | null = null;

function supportsFilePicker(): boolean {
  return typeof (window as any).showSaveFilePicker === 'function';
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
    pendingSave = null;
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
  } catch { /* ignore */ }
}

function copyElText(el: HTMLElement | null, label: string): void {
  if (!el) return;
  try {
    const text = el.textContent ?? '';
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).then(() => {
        log(`Copied ${label} to clipboard.`);
      }).catch(() => {
        throw new Error('clipboard write failed');
      });
      return;
    }

    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);

    const ok = document.execCommand('copy');
    document.body.removeChild(ta);

    if (ok) log(`Copied ${label} to clipboard (${text.length} chars).`);
    else throw new Error('execCommand(copy) returned false');
  } catch {
    log(`Could not copy ${label}.`);
  }
}

function postResize(width: number, height: number): void {
  const w = Math.max(720, Math.min(1600, Math.floor(width)));
  const h = Math.max(420, Math.min(1200, Math.floor(height)));
  postToPlugin({ type: 'UI_RESIZE', payload: { width: w, height: h } });
}

type ResizeTrackingState = {
  pointerId: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
};

let resizeTracking: ResizeTrackingState | null = null;
let resizeQueued: { width: number; height: number } | null = null;
let resizeRaf = 0;

function queueResize(width: number, height: number): void {
  resizeQueued = { width, height };
  if (resizeRaf !== 0) return;
  resizeRaf = window.requestAnimationFrame(() => {
    resizeRaf = 0;
    if (!resizeQueued) return;
    postResize(resizeQueued.width, resizeQueued.height);
    resizeQueued = null;
  });
}

function applyResizeDelta(ev: PointerEvent): void {
  if (!resizeTracking || ev.pointerId !== resizeTracking.pointerId) return;
  const dx = ev.clientX - resizeTracking.startX;
  const dy = ev.clientY - resizeTracking.startY;
  const nextW = resizeTracking.startWidth + dx;
  const nextH = resizeTracking.startHeight + dy;
  queueResize(nextW, nextH);
  ev.preventDefault();
}

function endResize(ev: PointerEvent): void {
  if (!resizeTracking || ev.pointerId !== resizeTracking.pointerId) return;
  applyResizeDelta(ev);
  window.removeEventListener('pointermove', handleResizeMove, true);
  window.removeEventListener('pointerup', endResize, true);
  window.removeEventListener('pointercancel', cancelResize, true);
  if (resizeHandleEl) {
    try { resizeHandleEl.releasePointerCapture(resizeTracking.pointerId); } catch { /* ignore */ }
  }
  resizeTracking = null;
}

function cancelResize(ev: PointerEvent): void {
  if (!resizeTracking || ev.pointerId !== resizeTracking.pointerId) return;
  window.removeEventListener('pointermove', handleResizeMove, true);
  window.removeEventListener('pointerup', endResize, true);
  window.removeEventListener('pointercancel', cancelResize, true);
  if (resizeHandleEl) {
    try { resizeHandleEl.releasePointerCapture(resizeTracking.pointerId); } catch { /* ignore */ }
  }
  resizeTracking = null;
}

function handleResizeMove(ev: PointerEvent): void {
  applyResizeDelta(ev);
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
 * Collections / logging
 * ----------------------------------------------------- */
let currentCollections: Array<{
  id: string;
  name: string;
  modes: Array<{ id: string; name: string }>;
  variables: Array<{ id: string; name: string; type: string }>;
}> = [];

/** Append a message to the log panel and console. */
function log(msg: string): void {
  const t = new Date().toLocaleTimeString();
  const line = document.createElement('div');
  line.textContent = '[' + t + '] ' + msg;
  if (logEl) {
    logEl.appendChild(line);
    (logEl as HTMLElement).scrollTop = (logEl as HTMLElement).scrollHeight;
  }
}

/** Send a typed message to the plugin controller. */
function postToPlugin(message: UiToPlugin): void {
  (parent as unknown as { postMessage: (m: unknown, t: string) => void })
    .postMessage({ pluginMessage: message }, '*');
}

const githubUi = createGithubUi({
  postToPlugin: (message) => postToPlugin(message),
  log: (message) => log(message),
  getLogElement: () => logEl,
  getCollectionSelect: () => collectionSelect,
  getModeSelect: () => modeSelect,
  getAllowHexCheckbox: () => allowHexChk
});

/** Remove every option from a select without replacing the node. */
function clearSelect(sel: HTMLSelectElement): void {
  while (sel.options.length > 0) sel.remove(0);
}

/** Update button/checkbox disabled states based on current selections. */
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

}

/** Render the collections/modes dropdowns from plugin-provided data. */
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

/** Update mode selection and preview when the collection dropdown changes. */
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
  githubUi.onSelectionChange();

  // If we auto-set a mode (firstModeSet), update the preview as well
  if (firstModeSet) requestPreviewForCurrent();
}


/** Restore the most recently used collection/mode pair. */
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

/** Format JSON with indentation while collapsing undefined/null gracefully. */
function prettyJson(obj: unknown): string {
  try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
}

/** Ask the plugin for a preview of the currently selected token scope. */
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
/** Toggle the branch select and associated placeholders. */


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

  // Keep generic INFO/ERROR logs visible
  if (msg.type === 'ERROR') { log('ERROR: ' + (msg.payload?.message ?? '')); return; }
  if (msg.type === 'INFO') { log(msg.payload?.message ?? ''); return; }

  if (githubUi.handleMessage(msg)) return;

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

});

/* -------------------------------------------------------
 * DOM wiring (runs when document exists)
 * ----------------------------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  if (typeof document === 'undefined') return;

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
  resizeHandleEl = document.getElementById('resizeHandle');

  w3cPreviewEl = document.getElementById('w3cPreview') as HTMLElement | null;

  copyRawBtn = document.getElementById('copyRawBtn') as HTMLButtonElement | null;
  copyW3cBtn = document.getElementById('copyW3cBtn') as HTMLButtonElement | null;
  copyLogBtn = document.getElementById('copyLogBtn') as HTMLButtonElement | null;

  allowHexChk = document.getElementById('allowHexChk') as HTMLInputElement | null;

  if (resizeHandleEl) {
    resizeHandleEl.addEventListener('pointerdown', (event: PointerEvent) => {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      if (resizeTracking) return;
      event.preventDefault();
      resizeTracking = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startWidth: window.innerWidth,
        startHeight: window.innerHeight
      };
      try { resizeHandleEl!.setPointerCapture(event.pointerId); } catch { /* ignore */ }
      window.addEventListener('pointermove', handleResizeMove, true);
      window.addEventListener('pointerup', endResize, true);
      window.addEventListener('pointercancel', cancelResize, true);
    });
  }

  githubUi.attach({ document, window });

  if (fileInput) fileInput.addEventListener('change', setDisabledStates);

  if (exportAllChk) {
    exportAllChk.addEventListener('change', () => {
      setDisabledStates();
      postToPlugin({ type: 'SAVE_PREFS', payload: { exportAll: !!exportAllChk!.checked } });
      githubUi.onSelectionChange();
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      postToPlugin({ type: 'FETCH_COLLECTIONS' });
    });
  }

  if (importBtn && fileInput) {
    importBtn.addEventListener('click', () => {
      if (!fileInput!.files || fileInput!.files.length === 0) { log('Select a JSON file first.'); return; }
      const reader = new FileReader();
      reader.onload = function () {
        try {
          const text = String(reader.result);
          const json = JSON.parse(text);
          if (json && typeof json === 'object' && !(json instanceof Array)) {
            postToPlugin({
              type: 'IMPORT_DTCG',
              payload: { json, allowHexStrings: !!(allowHexChk && allowHexChk.checked) }
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
    exportBtn.addEventListener('click', async () => {
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
    drawerToggleBtn.addEventListener('click', () => {
      const current = drawerToggleBtn!.getAttribute('aria-expanded') === 'true';
      setDrawerOpen(!current);
    });
  }

  if (collectionSelect) {
    collectionSelect.addEventListener('change', () => {
      onCollectionChange();
      if (collectionSelect && modeSelect) {
        postToPlugin({ type: 'SAVE_LAST', payload: { collection: collectionSelect.value, mode: modeSelect.value } });
        requestPreviewForCurrent();
      }
      githubUi.onSelectionChange();
    });
  }

  if (modeSelect) {
    modeSelect.addEventListener('change', () => {
      if (collectionSelect && modeSelect) {
        postToPlugin({ type: 'SAVE_LAST', payload: { collection: collectionSelect.value, mode: modeSelect.value } });
      }
      setDisabledStates();
      requestPreviewForCurrent();
      githubUi.onSelectionChange();
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

  githubUi.onSelectionChange();
  autoFitOnce();

  if (rawEl) rawEl.textContent = 'Loading variable collections…';
  setDisabledStates();
  setDrawerOpen(getSavedDrawerOpen());
  postToPlugin({ type: 'UI_READY' });
});

/* -------------------------------------------------------
 * Drawer helpers
 * ----------------------------------------------------- */
/** Persist drawer state and adjust CSS hooks so the UI animates correctly. */
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

/** Load the saved drawer state flag from local storage. */
function getSavedDrawerOpen(): boolean {
  try {
    const v = window.localStorage.getItem('drawerOpen');
    if (v === '0') return false;
    if (v === '1') return true;
  } catch { /* ignore */ }
  return true;
}
