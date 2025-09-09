// src/app/ui.ts
import type { PluginToUi, UiToPlugin } from './messages';

const logEl = document.getElementById('log');
const rawEl = document.getElementById('raw');

const exportAllChk = document.getElementById('exportAllChk');
const collectionSelect = document.getElementById('collectionSelect');
const modeSelect = document.getElementById('modeSelect');

const fileInput = document.getElementById('file');
const importBtn = document.getElementById('importBtn');
const exportBtn = document.getElementById('exportBtn');
const exportPickers = document.getElementById('exportPickers');

const refreshBtn = document.getElementById('refreshBtn');

// Keep last payload for repopulating mode list on collection change
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
  if (logEl && logEl instanceof HTMLElement) {
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }
}

function postToPlugin(message: UiToPlugin): void {
  (parent as unknown as { postMessage: (m: unknown, t: string) => void }).postMessage({ pluginMessage: message }, '*');
}

function clearSelect(sel: HTMLSelectElement): void {
  while (sel.options.length > 0) sel.remove(0);
}

function setDisabledStates(): void {
  // Import enabled only when a file is chosen
  if (importBtn && fileInput && importBtn instanceof HTMLButtonElement && fileInput instanceof HTMLInputElement) {
    const hasFile = !!(fileInput.files && fileInput.files.length > 0);
    importBtn.disabled = !hasFile;
  }

  // Export enabled when "all" checked, otherwise when both pickers have values
  if (
    exportBtn && exportAllChk && collectionSelect && modeSelect && exportPickers &&
    exportBtn instanceof HTMLButtonElement &&
    exportAllChk instanceof HTMLInputElement &&
    collectionSelect instanceof HTMLSelectElement &&
    modeSelect instanceof HTMLSelectElement &&
    exportPickers instanceof HTMLElement
  ) {
    const exportAll = !!exportAllChk.checked;
    if (exportAll) {
      exportBtn.disabled = false;
      exportPickers.style.opacity = '0.5';
    } else {
      exportPickers.style.opacity = '1';
      const hasSelection = collectionSelect.value.length > 0 && modeSelect.value.length > 0;
      exportBtn.disabled = !hasSelection;
    }
  }
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
  if (!(collectionSelect instanceof HTMLSelectElement && modeSelect instanceof HTMLSelectElement)) return;

  clearSelect(collectionSelect);

  let i = 0;
  for (i = 0; i < data.collections.length; i++) {
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
  if (!(collectionSelect instanceof HTMLSelectElement && modeSelect instanceof HTMLSelectElement)) return;

  const selected = collectionSelect.value;
  clearSelect(modeSelect);

  let i = 0;
  for (i = 0; i < currentCollections.length; i++) {
    const c = currentCollections[i];
    if (c.name === selected) {
      let j = 0;
      for (j = 0; j < c.modes.length; j++) {
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
  if (!last) return;
  if (!(collectionSelect && modeSelect)) return;
  if (!(collectionSelect instanceof HTMLSelectElement && modeSelect instanceof HTMLSelectElement)) return;

  // Collection
  let i = 0; let found = false;
  for (i = 0; i < collectionSelect.options.length; i++) {
    if (collectionSelect.options[i].value === last.collection) {
      collectionSelect.selectedIndex = i;
      found = true;
      break;
    }
  }

  onCollectionChange();

  // Mode
  if (found) {
    let j = 0;
    for (j = 0; j < modeSelect.options.length; j++) {
      if (modeSelect.options[j].value === last.mode) {
        modeSelect.selectedIndex = j;
        break;
      }
    }
  }

  setDisabledStates();
}

function prettyJson(obj: unknown): string {
  try { return JSON.stringify(obj, null, 2); } catch (_e) { return String(obj); }
}

/* ---------- Wire UI events ---------- */

if (collectionSelect && collectionSelect instanceof HTMLSelectElement) {
  collectionSelect.addEventListener('change', function () {
    onCollectionChange();
    if (collectionSelect && modeSelect && collectionSelect instanceof HTMLSelectElement && modeSelect instanceof HTMLSelectElement) {
      postToPlugin({ type: 'SAVE_LAST', payload: { collection: collectionSelect.value, mode: modeSelect.value } });
    }
  });
}

if (modeSelect && modeSelect instanceof HTMLSelectElement) {
  modeSelect.addEventListener('change', function () {
    if (collectionSelect && modeSelect && collectionSelect instanceof HTMLSelectElement && modeSelect instanceof HTMLSelectElement) {
      postToPlugin({ type: 'SAVE_LAST', payload: { collection: collectionSelect.value, mode: modeSelect.value } });
    }
    setDisabledStates();
  });
}

if (fileInput && fileInput instanceof HTMLInputElement) {
  fileInput.addEventListener('change', setDisabledStates);
}

if (exportAllChk && exportAllChk instanceof HTMLInputElement) {
  exportAllChk.addEventListener('change', function () {
    setDisabledStates();
    postToPlugin({ type: 'SAVE_PREFS', payload: { exportAll: !!exportAllChk.checked } });
  });
}

if (refreshBtn && refreshBtn instanceof HTMLButtonElement) {
  refreshBtn.addEventListener('click', function () {
    postToPlugin({ type: 'FETCH_COLLECTIONS' });
  });
}

if (importBtn && importBtn instanceof HTMLButtonElement && fileInput && fileInput instanceof HTMLInputElement) {
  importBtn.addEventListener('click', function () {
    if (!fileInput.files || fileInput.files.length === 0) { log('Select a JSON file first.'); return; }
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const text = String(reader.result);
        const json = JSON.parse(text);
        // Minimal sanity check (object, not array)
        if (json && typeof json === 'object' && !(json instanceof Array)) {
          postToPlugin({ type: 'IMPORT_DTCG', payload: { json: json } });
          log('Import requested.');
        } else {
          log('Invalid JSON structure for tokens (expected an object).');
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log('Failed to parse JSON: ' + msg);
      }
    };
    reader.readAsText(fileInput.files[0]);
  });
}

if (exportBtn && exportBtn instanceof HTMLButtonElement) {
  exportBtn.addEventListener('click', function () {
    let exportAll = false;
    if (exportAllChk && exportAllChk instanceof HTMLInputElement) exportAll = !!exportAllChk.checked;

    const payload: { exportAll: boolean; collection?: string; mode?: string } = { exportAll: exportAll };
    if (!exportAll && collectionSelect && modeSelect && collectionSelect instanceof HTMLSelectElement && modeSelect instanceof HTMLSelectElement) {
      payload.collection = collectionSelect.value;
      payload.mode = modeSelect.value;
      if (!(payload.collection && payload.mode)) { log('Pick collection and mode or use "Export all".'); return; }
    }
    postToPlugin({ type: 'EXPORT_DTCG', payload: payload });
    if (exportAll) log('Export all requested.'); else log('Export requested for "' + (payload.collection || '') + '" / "' + (payload.mode || '') + '".');
  });
}

/* ---------- Receive from plugin ---------- */
window.onmessage = function (event: MessageEvent) {
  const data: unknown = (event as unknown as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return;

  let msg: PluginToUi | null = null;
  if ((data as { pluginMessage?: unknown }).pluginMessage && typeof (data as { pluginMessage?: unknown }).pluginMessage === 'object') {
    const maybe = (data as { pluginMessage?: unknown }).pluginMessage as { type?: string };
    if (maybe && typeof maybe.type === 'string') {
      msg = (data as { pluginMessage: PluginToUi }).pluginMessage;
    }
  }
  if (!msg) return;

  if (msg.type === 'ERROR') { log('ERROR: ' + msg.payload.message); return; }
  if (msg.type === 'INFO') { log(msg.payload.message); return; }

  if (msg.type === 'EXPORT_RESULT') {
    let k = 0;
    for (k = 0; k < msg.payload.files.length; k++) {
      const f = msg.payload.files[k];
      const a = document.createElement('a');
      const blob = new Blob([prettyJson(f.json)], { type: 'application/json' });
      a.href = URL.createObjectURL(blob);
      a.download = f.name;
      a.textContent = 'Download ' + f.name;
      const div = document.createElement('div');
      div.appendChild(a);
      if (logEl && logEl instanceof HTMLElement) logEl.appendChild(div);
    }
    log('Export ready.');
    return;
  }

  if (msg.type === 'COLLECTIONS_DATA') {
    populateCollections({ collections: msg.payload.collections });
    if (exportAllChk && exportAllChk instanceof HTMLInputElement) {
      exportAllChk.checked = !!msg.payload.exportAllPref;
    }
    applyLastSelection(msg.payload.last);
    setDisabledStates();
    return;
  }

  if (msg.type === 'RAW_COLLECTIONS_TEXT') {
    if (rawEl && rawEl instanceof HTMLElement) rawEl.textContent = msg.payload.text;
    return;
  }
};

/* ---------- Announce ready ---------- */
document.addEventListener('DOMContentLoaded', function () {
  if (rawEl && rawEl instanceof HTMLElement) rawEl.textContent = 'Loading variable collections…';
  setDisabledStates();
  postToPlugin({ type: 'UI_READY' });
});
