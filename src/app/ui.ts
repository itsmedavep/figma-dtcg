// src/app/ui.ts
// In-panel UI logic for the plugin: dom wiring, GitHub workflows, and export helpers.
// - Mirrors plugin state via postMessage so the UI can function offline
// - Provides guarded DOM helpers to survive partial renders or optional features

import type { PluginToUi, UiToPlugin, ImportSummary } from './messages';
import './ui.css';
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
let exportTypographyBtn: HTMLButtonElement | null = null;
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
let styleDictionaryChk: HTMLInputElement | null = null;
let flatTokensChk: HTMLInputElement | null = null;
let githubRememberChk: HTMLInputElement | null = null;

let importScopeOverlay: HTMLElement | null = null;
let importScopeBody: HTMLElement | null = null;
let importScopeConfirmBtn: HTMLButtonElement | null = null;
let importScopeCancelBtn: HTMLButtonElement | null = null;
let importScopeRememberChk: HTMLInputElement | null = null;
let importScopeMissingEl: HTMLElement | null = null;

let importScopeSummaryEl: HTMLElement | null = null;
let importScopeSummaryTextEl: HTMLElement | null = null;
let importScopeClearBtn: HTMLButtonElement | null = null;

let importSkipLogListEl: HTMLElement | null = null;
let importSkipLogEmptyEl: HTMLElement | null = null;


/* -------------------------------------------------------
 * Shared helpers
 * ----------------------------------------------------- */

const IMPORT_PREF_KEY = 'dtcg.importPreference.v1';
const IMPORT_LOG_KEY = 'dtcg.importLog.v1';

type ImportContextOption = { context: string; collection: string; mode: string };
type ImportPreference = { contexts: string[]; updatedAt: number };
type ImportLogEntry = { timestamp: number; source?: 'local' | 'github'; summary: ImportSummary };
type ImportScopeModalState = {
  options: ImportContextOption[];
  collections: string[];
  inputs: HTMLInputElement[];
  inputsByCollection: Map<string, HTMLInputElement[]>;
  onConfirm: (selected: string[], remember: boolean) => void;
};

let importPreference: ImportPreference | null = null;
let importLogEntries: ImportLogEntry[] = [];
let importScopeModalState: ImportScopeModalState | null = null;
let lastImportSelection: string[] = [];

type ThemePref = 'auto' | 'light' | 'dark';
let systemDarkMode = false;

function applyTheme(): void {
  const effective = systemDarkMode ? 'dark' : 'light';
  if (effective === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

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

/* -------------------------------------------------------
 * Partial import helpers
 * ----------------------------------------------------- */

function normalizeContextList(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (let i = 0; i < list.length; i++) {
    const raw = String(list[i] ?? '').trim();
    if (!raw) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return out;
}

function contextsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function saveImportPreference(): void {
  if (!importPreference || importPreference.contexts.length === 0) {
    try { window.localStorage?.removeItem(IMPORT_PREF_KEY); } catch { /* ignore */ }
    return;
  }
  try { window.localStorage?.setItem(IMPORT_PREF_KEY, JSON.stringify(importPreference)); } catch { /* ignore */ }
}

function loadImportPreference(): void {
  importPreference = null;
  try {
    const raw = window.localStorage?.getItem(IMPORT_PREF_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    const ctxs = Array.isArray((parsed as any).contexts) ? normalizeContextList((parsed as any).contexts as string[]) : [];
    const ts = typeof (parsed as any).updatedAt === 'number' ? Number((parsed as any).updatedAt) : Date.now();
    if (ctxs.length > 0) importPreference = { contexts: ctxs, updatedAt: ts };
  } catch { importPreference = null; }
}

function setImportPreference(contexts: string[]): void {
  const normalized = normalizeContextList(contexts);
  if (normalized.length === 0) {
    clearImportPreference(false);
    return;
  }
  const same = importPreference && contextsEqual(importPreference.contexts, normalized);
  importPreference = { contexts: normalized, updatedAt: Date.now() };
  saveImportPreference();
  renderImportPreferenceSummary();
  if (!same) log('Remembered import selection for future imports.');
}

function clearImportPreference(logChange: boolean): void {
  if (!importPreference) return;
  importPreference = null;
  try { window.localStorage?.removeItem(IMPORT_PREF_KEY); } catch { /* ignore */ }
  renderImportPreferenceSummary();
  if (logChange) log('Cleared remembered import selection. Next import will prompt for modes.');
}

function formatContextList(contexts: string[]): string {
  const normalized = normalizeContextList(contexts);
  if (normalized.length === 0) return 'All contexts';
  const grouped = new Map<string, string[]>();
  for (let i = 0; i < normalized.length; i++) {
    const ctx = normalized[i];
    const slash = ctx.indexOf('/');
    const collection = slash >= 0 ? ctx.slice(0, slash) : ctx;
    const mode = slash >= 0 ? ctx.slice(slash + 1) : 'Mode 1';
    const coll = collection ? collection : 'Tokens';
    const modes = grouped.get(coll) || [];
    if (!grouped.has(coll)) grouped.set(coll, modes);
    if (!modes.includes(mode)) modes.push(mode);
  }
  const parts: string[] = [];
  const collections = Array.from(grouped.keys()).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (let i = 0; i < collections.length; i++) {
    const coll = collections[i];
    const modes = grouped.get(coll) || [];
    modes.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    parts.push(`${coll} (${modes.join(', ')})`);
  }
  return parts.join('; ');
}

function renderImportPreferenceSummary(): void {
  if (!importScopeSummaryEl || !importScopeSummaryTextEl) return;
  const hasPref = !!importPreference && importPreference.contexts.length > 0;
  if (importScopeClearBtn) importScopeClearBtn.disabled = !hasPref;
  if (!hasPref) {
    importScopeSummaryEl.hidden = true;
    return;
  }
  importScopeSummaryEl.hidden = false;
  const when = new Date(importPreference!.updatedAt).toLocaleString();
  importScopeSummaryTextEl.textContent = `Remembered import scope (${when}): ${formatContextList(importPreference!.contexts)}.`;
}

function saveImportLog(): void {
  try { window.localStorage?.setItem(IMPORT_LOG_KEY, JSON.stringify(importLogEntries)); } catch { /* ignore */ }
}

function loadImportLog(): void {
  importLogEntries = [];
  try {
    const raw = window.localStorage?.getItem(IMPORT_LOG_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    for (let i = 0; i < parsed.length; i++) {
      const entry = parsed[i];
      if (!entry || typeof entry !== 'object') continue;
      const timestamp = typeof (entry as any).timestamp === 'number' ? Number((entry as any).timestamp) : null;
      const summary = (entry as any).summary as ImportSummary | undefined;
      const source = (entry as any).source === 'github' ? 'github' : (entry as any).source === 'local' ? 'local' : undefined;
      if (!timestamp || !summary || typeof summary !== 'object') continue;
      if (!Array.isArray(summary.appliedContexts) || !Array.isArray(summary.availableContexts)) continue;
      if (!Array.isArray(summary.tokensWithRemovedContexts)) {
        (summary as any).tokensWithRemovedContexts = [];
      }
      if (!Array.isArray(summary.skippedContexts)) {
        (summary as any).skippedContexts = [];
      }
      if (!Array.isArray(summary.missingRequestedContexts)) {
        (summary as any).missingRequestedContexts = [];
      }
      if (typeof summary.createdStyles !== 'number' || !isFinite(summary.createdStyles)) {
        (summary as any).createdStyles = 0;
      }
      importLogEntries.push({ timestamp, summary, source });
    }
    importLogEntries.sort((a, b) => a.timestamp - b.timestamp);
  } catch { importLogEntries = []; }
}

function renderImportLog(): void {
  if (!(importSkipLogListEl && importSkipLogEmptyEl)) return;
  importSkipLogListEl.innerHTML = '';
  if (!importLogEntries || importLogEntries.length === 0) {
    importSkipLogEmptyEl.hidden = false;
    return;
  }
  importSkipLogEmptyEl.hidden = true;

  for (let idx = importLogEntries.length - 1; idx >= 0; idx--) {
    const entry = importLogEntries[idx];
    const container = document.createElement('div');
    container.className = 'import-skip-log-entry';

    const header = document.createElement('div');
    header.className = 'import-skip-log-entry-header';
    const label = entry.source === 'github' ? 'GitHub import' : 'Manual import';
    header.textContent = `${label} • ${new Date(entry.timestamp).toLocaleString()}`;
    container.appendChild(header);

    const stats = document.createElement('div');
    stats.className = 'import-skip-log-entry-stats';
    const tokensText = `Imported ${entry.summary.importedTokens} of ${entry.summary.totalTokens} tokens.`;
    const stylesCreated = typeof entry.summary.createdStyles === 'number'
      ? entry.summary.createdStyles
      : undefined;
    if (typeof stylesCreated === 'number') {
      const stylesLabel = stylesCreated === 1 ? 'style' : 'styles';
      stats.textContent = `${tokensText} ${stylesCreated} ${stylesLabel} created.`;
    } else {
      stats.textContent = tokensText;
    }
    container.appendChild(stats);

    const contextsLine = document.createElement('div');
    contextsLine.className = 'import-skip-log-entry-contexts';
    contextsLine.textContent = 'Applied: ' + formatContextList(entry.summary.appliedContexts);
    container.appendChild(contextsLine);

    if (entry.summary.skippedContexts.length > 0) {
      const skippedLine = document.createElement('div');
      skippedLine.className = 'import-skip-log-entry-contexts';
      skippedLine.textContent = 'Skipped modes: ' + formatContextList(entry.summary.skippedContexts.map(s => s.context));
      container.appendChild(skippedLine);
    }

    if (entry.summary.missingRequestedContexts.length > 0) {
      const missingLine = document.createElement('div');
      missingLine.className = 'import-skip-log-entry-note';
      missingLine.textContent = 'Not found in file: ' + formatContextList(entry.summary.missingRequestedContexts);
      container.appendChild(missingLine);
    }

    if (entry.summary.selectionFallbackToAll) {
      const fallbackLine = document.createElement('div');
      fallbackLine.className = 'import-skip-log-entry-note';
      fallbackLine.textContent = 'Requested modes were missing; imported all contexts instead.';
      container.appendChild(fallbackLine);
    }

    if (entry.summary.tokensWithRemovedContexts.length > 0) {
      const tokenList = document.createElement('ul');
      tokenList.className = 'import-skip-log-token-list';
      const maxTokens = Math.min(entry.summary.tokensWithRemovedContexts.length, 10);
      for (let t = 0; t < maxTokens; t++) {
        const tok = entry.summary.tokensWithRemovedContexts[t];
        const li = document.createElement('li');
        const removedLabel = tok.removedContexts.length > 0 ? formatContextList(tok.removedContexts) : 'none';
        const keptLabel = tok.keptContexts.length > 0 ? formatContextList(tok.keptContexts) : '';
        li.textContent = `${tok.path} — skipped ${removedLabel}${keptLabel ? '; kept ' + keptLabel : ''}`;
        tokenList.appendChild(li);
      }
      if (entry.summary.tokensWithRemovedContexts.length > maxTokens) {
        const more = document.createElement('li');
        more.textContent = `…and ${entry.summary.tokensWithRemovedContexts.length - maxTokens} more token(s).`;
        tokenList.appendChild(more);
      }
      container.appendChild(tokenList);
    }

    if (entry.summary.skippedContexts.length > 0 && importPreference && importPreference.contexts.length > 0) {
      const tip = document.createElement('div');
      tip.className = 'import-skip-log-entry-note';
      tip.textContent = 'Tip: Clear the remembered import selection to restore skipped modes.';
      container.appendChild(tip);
    }

    importSkipLogListEl.appendChild(container);
  }
}

function addImportLogEntry(entry: ImportLogEntry): void {
  importLogEntries.push(entry);
  if (importLogEntries.length > 10) {
    importLogEntries = importLogEntries.slice(importLogEntries.length - 10);
  }
  saveImportLog();
  renderImportLog();
}

function collectContextsFromJson(root: unknown): ImportContextOption[] {
  const grouped = new Map<string, Set<string>>();

  function visit(node: unknown, path: string[]): void {
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) visit(node[i], path);
      return;
    }
    if (!node || typeof node !== 'object') return;

    const obj = node as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(obj, '$value')) {
      const rawCollection = path[0] ? String(path[0]).trim() : 'Tokens';
      let mode = 'Mode 1';
      try {
        const ext = obj['$extensions'];
        if (ext && typeof ext === 'object') {
          const cf = (ext as any)['com.figma'];
          if (cf && typeof cf === 'object' && typeof (cf as any).modeName === 'string') {
            const candidate = String((cf as any).modeName).trim();
            if (candidate) mode = candidate;
          }
        }
      } catch { /* ignore */ }
      const collection = rawCollection ? rawCollection : 'Tokens';
      const set = grouped.get(collection) || new Set<string>();
      if (!grouped.has(collection)) grouped.set(collection, set);
      set.add(mode);
      return;
    }

    for (const key in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
      if (key.startsWith('$')) continue;
      visit((obj as any)[key], path.concat(String(key)));
    }
  }

  visit(root, []);

  const options: ImportContextOption[] = [];
  const collections = Array.from(grouped.keys()).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (let i = 0; i < collections.length; i++) {
    const collection = collections[i];
    const modes = Array.from(grouped.get(collection) || []).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    for (let j = 0; j < modes.length; j++) {
      const mode = modes[j];
      options.push({ context: `${collection}/${mode}`, collection, mode });
    }
  }
  return options;
}

function updateImportScopeConfirmState(): void {
  if (!importScopeModalState) return;
  const state = importScopeModalState;
  let allCollectionsSelected = true;
  for (let i = 0; i < state.collections.length; i++) {
    const collection = state.collections[i];
    const inputs = state.inputsByCollection.get(collection) || [];
    if (!inputs.some(input => input.checked)) {
      allCollectionsSelected = false;
      break;
    }
  }
  if (importScopeConfirmBtn) {
    importScopeConfirmBtn.disabled = !allCollectionsSelected;
    const label = state.collections.length > 1 ? 'Import selected modes' : 'Import selected mode';
    importScopeConfirmBtn.textContent = label;
  }
}

let importScopeKeyListenerAttached = false;

function handleImportScopeKeydown(ev: KeyboardEvent): void {
  if (ev.key === 'Escape') {
    ev.preventDefault();
    closeImportScopeModal();
  }
}

function openImportScopeModal(opts: {
  options: ImportContextOption[];
  initialSelection: string[];
  rememberInitially: boolean;
  missingPreferred: string[];
  onConfirm: (selected: string[], remember: boolean) => void;
}): void {
  if (!importScopeOverlay || !importScopeBody || !importScopeConfirmBtn || !importScopeCancelBtn) {
    opts.onConfirm(opts.initialSelection, opts.rememberInitially);
    return;
  }

  importScopeBody.innerHTML = '';

  const grouped = new Map<string, ImportContextOption[]>();
  for (let i = 0; i < opts.options.length; i++) {
    const option = opts.options[i];
    const list = grouped.get(option.collection) || [];
    if (!grouped.has(option.collection)) grouped.set(option.collection, list);
    list.push(option);
  }

  const collections = Array.from(grouped.keys()).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  importScopeModalState = {
    options: opts.options,
    collections,
    inputs: [],
    inputsByCollection: new Map(),
    onConfirm: opts.onConfirm
  };

  const initialSelectionsByCollection = new Map<string, string>();
  for (let i = 0; i < opts.initialSelection.length; i++) {
    const ctx = opts.initialSelection[i];
    const match = opts.options.find(opt => opt.context === ctx);
    if (match) initialSelectionsByCollection.set(match.collection, match.context);
  }

  for (let i = 0; i < collections.length; i++) {
    const collection = collections[i];
    const groupEl = document.createElement('div');
    groupEl.className = 'import-scope-group';
    const heading = document.createElement('h3');
    heading.textContent = collection;
    groupEl.appendChild(heading);

    const modes = (grouped.get(collection) || []).sort((a, b) => (a.mode < b.mode ? -1 : a.mode > b.mode ? 1 : 0));
    const defaultContext = initialSelectionsByCollection.get(collection) || modes[0]?.context || null;
    const radioName = `importScopeMode_${i}`;
    for (let j = 0; j < modes.length; j++) {
      const opt = modes[j];
      const label = document.createElement('label');
      label.className = 'import-scope-mode';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = radioName;
      radio.value = opt.context;
      radio.checked = defaultContext === opt.context;
      radio.addEventListener('change', updateImportScopeConfirmState);
      importScopeModalState.inputs.push(radio);
      const list = importScopeModalState.inputsByCollection.get(collection) || [];
      if (!importScopeModalState.inputsByCollection.has(collection)) {
        importScopeModalState.inputsByCollection.set(collection, list);
      }
      list.push(radio);

      const span = document.createElement('span');
      span.textContent = opt.mode;

      label.appendChild(radio);
      label.appendChild(span);
      groupEl.appendChild(label);
    }

    importScopeBody.appendChild(groupEl);
  }

  if (importScopeRememberChk) importScopeRememberChk.checked = opts.rememberInitially;
  if (importScopeMissingEl) {
    if (opts.missingPreferred.length > 0) {
      importScopeMissingEl.hidden = false;
      importScopeMissingEl.textContent = 'Previously remembered modes not present in this file: ' + formatContextList(opts.missingPreferred);
    } else {
      importScopeMissingEl.hidden = true;
      importScopeMissingEl.textContent = '';
    }
  }

  updateImportScopeConfirmState();

  importScopeOverlay.hidden = false;
  importScopeOverlay.classList.add('is-open');
  importScopeOverlay.setAttribute('aria-hidden', 'false');
  if (!importScopeKeyListenerAttached) {
    window.addEventListener('keydown', handleImportScopeKeydown, true);
    importScopeKeyListenerAttached = true;
  }
  if (importScopeConfirmBtn) importScopeConfirmBtn.focus();
}

function closeImportScopeModal(): void {
  if (!importScopeOverlay) return;
  importScopeOverlay.classList.remove('is-open');
  importScopeOverlay.hidden = true;
  importScopeOverlay.setAttribute('aria-hidden', 'true');
  if (importScopeKeyListenerAttached) {
    window.removeEventListener('keydown', handleImportScopeKeydown, true);
    importScopeKeyListenerAttached = false;
  }
  importScopeModalState = null;
}

function performImport(json: unknown, allowHex: boolean, contexts: string[]): void {
  const normalized = normalizeContextList(contexts);
  const payload: UiToPlugin = normalized.length > 0
    ? { type: 'IMPORT_DTCG', payload: { json, allowHexStrings: allowHex, contexts: normalized } }
    : { type: 'IMPORT_DTCG', payload: { json, allowHexStrings: allowHex } };
  postToPlugin(payload);
  lastImportSelection = normalized.slice();
  const label = normalized.length > 0 ? formatContextList(normalized) : 'all contexts';
  log(`Import requested (${label}).`);
}

function startImportFlow(json: unknown, allowHex: boolean): void {
  const options = collectContextsFromJson(json);
  if (options.length === 0) {
    performImport(json, allowHex, []);
    return;
  }

  const grouped = new Map<string, ImportContextOption[]>();
  for (let i = 0; i < options.length; i++) {
    const option = options[i];
    const list = grouped.get(option.collection) || [];
    if (!grouped.has(option.collection)) grouped.set(option.collection, list);
    list.push(option);
  }

  const availableSet = new Set(options.map(opt => opt.context));
  const missingPreferred: string[] = [];
  let rememberInitially = false;
  const initialSelectionsByCollection = new Map<string, string>();

  if (importPreference && importPreference.contexts.length > 0) {
    for (let i = 0; i < importPreference.contexts.length; i++) {
      const ctx = importPreference.contexts[i];
      if (availableSet.has(ctx)) {
        const match = options.find(opt => opt.context === ctx);
        if (match) {
          initialSelectionsByCollection.set(match.collection, match.context);
          rememberInitially = true;
        }
      } else {
        missingPreferred.push(ctx);
      }
    }
  }

  const collections = Array.from(grouped.keys()).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (let i = 0; i < collections.length; i++) {
    const collection = collections[i];
    if (!initialSelectionsByCollection.has(collection)) {
      const modes = (grouped.get(collection) || []).sort((a, b) => (a.mode < b.mode ? -1 : a.mode > b.mode ? 1 : 0));
      if (modes.length > 0) initialSelectionsByCollection.set(collection, modes[0].context);
    }
  }

  const initialSelection = collections
    .map(collection => initialSelectionsByCollection.get(collection))
    .filter((ctx): ctx is string => typeof ctx === 'string');

  const requiresChoice = collections.some(collection => {
    const list = grouped.get(collection) || [];
    return list.length > 1;
  });

  if (!requiresChoice) {
    performImport(json, allowHex, initialSelection);
    return;
  }

  openImportScopeModal({
    options,
    initialSelection,
    rememberInitially,
    missingPreferred,
    onConfirm: (selected, remember) => {
      if (remember) setImportPreference(selected);
      else if (importPreference) clearImportPreference(true);
      performImport(json, allowHex, selected);
    }
  });
}

function getPreferredImportContexts(): string[] {
  if (importPreference && importPreference.contexts.length > 0) return importPreference.contexts.slice();
  if (lastImportSelection.length > 0) return lastImportSelection.slice();
  return [];
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
  getAllowHexCheckbox: () => allowHexChk,
  getStyleDictionaryCheckbox: () => styleDictionaryChk,
  getFlatTokensCheckbox: () => flatTokensChk,
  getImportContexts: () => getPreferredImportContexts()
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

  if (exportTypographyBtn) {
    exportTypographyBtn.disabled = false;
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
  const styleDictionary = !!(styleDictionaryChk && styleDictionaryChk.checked);
  const flatTokens = !!(flatTokensChk && flatTokensChk.checked);
  postToPlugin({
    type: 'PREVIEW_REQUEST',
    payload: { collection, mode, styleDictionary, flatTokens }
  });
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

  if (msg.type === 'IMPORT_SUMMARY') {
    const summary = msg.payload.summary;
    if (summary && Array.isArray(summary.appliedContexts)) {
      lastImportSelection = summary.appliedContexts.slice();
    } else {
      lastImportSelection = [];
    }
    addImportLogEntry({ timestamp: msg.payload.timestamp, source: msg.payload.source, summary });
    renderImportPreferenceSummary();
    return;
  }

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
    if (styleDictionaryChk && typeof msg.payload.styleDictionaryPref === 'boolean') {
      styleDictionaryChk.checked = !!msg.payload.styleDictionaryPref;
    }
    if (flatTokensChk && typeof msg.payload.flatTokensPref === 'boolean') {
      flatTokensChk.checked = !!msg.payload.flatTokensPref;
    }
    if (allowHexChk && typeof msg.payload.allowHexPref === 'boolean') {
      allowHexChk.checked = !!msg.payload.allowHexPref;
    }
    if (typeof msg.payload.githubRememberPref === 'boolean') {
      if (githubRememberChk) githubRememberChk.checked = msg.payload.githubRememberPref;
    }
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
  exportTypographyBtn = document.getElementById('exportTypographyBtn') as HTMLButtonElement | null;
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
  styleDictionaryChk = document.getElementById('styleDictionaryChk') as HTMLInputElement | null;
  flatTokensChk = document.getElementById('flatTokensChk') as HTMLInputElement | null;
  githubRememberChk = document.getElementById('githubRememberChk') as HTMLInputElement | null;

  if (allowHexChk) {
    allowHexChk.checked = true;
    allowHexChk.addEventListener('change', () => {
      postToPlugin({ type: 'SAVE_PREFS', payload: { allowHexStrings: !!allowHexChk!.checked } });
    });
  }

  importScopeOverlay = document.getElementById('importScopeOverlay');
  importScopeBody = document.getElementById('importScopeBody');
  importScopeConfirmBtn = document.getElementById('importScopeConfirmBtn') as HTMLButtonElement | null;
  importScopeCancelBtn = document.getElementById('importScopeCancelBtn') as HTMLButtonElement | null;
  importScopeRememberChk = document.getElementById('importScopeRememberChk') as HTMLInputElement | null;
  importScopeMissingEl = document.getElementById('importScopeMissingNotice');

  importScopeSummaryEl = document.getElementById('importScopeSummary');
  importScopeSummaryTextEl = document.getElementById('importScopeSummaryText');
  importScopeClearBtn = document.getElementById('importScopeClearBtn') as HTMLButtonElement | null;

  importSkipLogListEl = document.getElementById('importSkipLogList');
  importSkipLogEmptyEl = document.getElementById('importSkipLogEmpty');

  // System theme listener
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  systemDarkMode = mediaQuery.matches;
  mediaQuery.addEventListener('change', (e) => {
    systemDarkMode = e.matches;
    applyTheme();
  });
  // Initial apply (defaults to auto/system until we get prefs)
  applyTheme();

  loadImportPreference();
  loadImportLog();
  renderImportPreferenceSummary();
  renderImportLog();

  if (importScopeClearBtn) {
    importScopeClearBtn.addEventListener('click', () => clearImportPreference(true));
  }

  if (importScopeConfirmBtn) {
    importScopeConfirmBtn.addEventListener('click', () => {
      if (!importScopeModalState) { closeImportScopeModal(); return; }
      const state = importScopeModalState;
      const selections: string[] = [];
      for (let i = 0; i < state.collections.length; i++) {
        const collection = state.collections[i];
        const inputs = state.inputsByCollection.get(collection) || [];
        const selected = inputs.find(input => input.checked);
        if (!selected) return;
        selections.push(selected.value);
      }
      const remember = importScopeRememberChk ? !!importScopeRememberChk.checked : false;
      closeImportScopeModal();
      state.onConfirm(selections, remember);
    });
  }

  if (importScopeCancelBtn) {
    importScopeCancelBtn.addEventListener('click', () => closeImportScopeModal());
  }

  if (importScopeOverlay) {
    importScopeOverlay.addEventListener('click', (ev) => {
      if (ev.target === importScopeOverlay) closeImportScopeModal();
    });
  }

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

  if (styleDictionaryChk) {
    styleDictionaryChk.addEventListener('change', () => {
      postToPlugin({ type: 'SAVE_PREFS', payload: { styleDictionary: !!styleDictionaryChk!.checked } });
      requestPreviewForCurrent();
      githubUi.onSelectionChange();
    });
  }

  if (flatTokensChk) {
    flatTokensChk.addEventListener('change', () => {
      postToPlugin({ type: 'SAVE_PREFS', payload: { flatTokens: !!flatTokensChk!.checked } });
      requestPreviewForCurrent();
      githubUi.onSelectionChange();
    });
  }

  if (githubRememberChk) {
    githubRememberChk.addEventListener('change', () => {
      postToPlugin({ type: 'SAVE_PREFS', payload: { githubRememberToken: !!githubRememberChk!.checked } });
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
          if (!json || typeof json !== 'object' || (json instanceof Array)) {
            log('Invalid JSON structure for tokens (expected an object).');
            return;
          }
          const allowHex = !!(allowHexChk && allowHexChk.checked);
          startImportFlow(json, allowHex);
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

      const styleDictionary = !!(styleDictionaryChk && styleDictionaryChk.checked);
      const flatTokens = !!(flatTokensChk && flatTokensChk.checked);

      const payload: {
        exportAll: boolean;
        collection?: string;
        mode?: string;
        styleDictionary?: boolean;
        flatTokens?: boolean;
      } = { exportAll, styleDictionary, flatTokens };
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

  if (exportTypographyBtn) {
    exportTypographyBtn.addEventListener('click', async () => {
      await beginPendingSave('typography.json');
      postToPlugin({ type: 'EXPORT_TYPOGRAPHY' });
      log('Typography export requested.');
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
      requestPreviewForCurrent();
      githubUi.onSelectionChange();
    });
  }

  if (modeSelect) {
    modeSelect.addEventListener('change', () => {
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
