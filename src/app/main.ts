// src/app/main.ts
// Main-thread controller: wires UI messages into Figma APIs and GitHub helpers.
// - Handles persistence so the iframe can reload without losing settings
// - Wraps GitHub flows with retries and gentle error surfaces

import type { UiToPlugin, PluginToUi, GithubScope } from './messages';
import { snapshotCollectionsForUi, analyzeSelectionState, safeKeyFromCollectionAndMode } from './collections';
import { importDtcg, exportDtcg } from '../core/pipeline';

import { createGithubDispatcher } from './github/dispatcher';

// __html__ is injected by your build (esbuild) from dist/ui.html with ui.js inlined.
declare const __html__: string;


// Use saved size if available; fall back to 960×540.
(async function initUI() {
  let w = 960, h = 540;
  try {
    const saved = await figma.clientStorage.getAsync('uiSize');
    if (saved && typeof saved.width === 'number' && typeof saved.height === 'number') {
      const sw = Math.floor(saved.width);
      const sh = Math.floor(saved.height);
      w = Math.max(720, Math.min(1600, sw));
      h = Math.max(420, Math.min(1200, sh));
    }
  } catch { /* ignore */ }
  figma.showUI(__html__, { width: w, height: h });
})();

function send(msg: PluginToUi): void {
  figma.ui.postMessage(msg);
}

const github = createGithubDispatcher({
  send,
  snapshotCollectionsForUi,
  analyzeSelectionState,
  safeKeyFromCollectionAndMode,
  importDtcg,
  exportDtcg,
});

type MessageOfType<T extends UiToPlugin['type']> = Extract<UiToPlugin, { type: T }>;
type Handler = (msg: UiToPlugin) => Promise<void> | void;

async function handleUiReady(_msg: UiToPlugin): Promise<void> {
  const snap = await snapshotCollectionsForUi();
  const last = await figma.clientStorage.getAsync('lastSelection').catch(() => null);
  const exportAllPrefVal = await figma.clientStorage.getAsync('exportAllPref').catch(() => false);
  const lastOrNull = last && typeof last.collection === 'string' && typeof last.mode === 'string'
    ? last
    : null;

  send({ type: 'INFO', payload: { message: 'Fetched ' + String(snap.collections.length) + ' collections (initial)' } });
  send({ type: 'COLLECTIONS_DATA', payload: { collections: snap.collections, last: lastOrNull, exportAllPref: !!exportAllPrefVal } });
  send({ type: 'RAW_COLLECTIONS_TEXT', payload: { text: snap.rawText } });

  await github.onUiReady();
}

async function handleFetchCollections(_msg: UiToPlugin): Promise<void> {
  const snapshot = await snapshotCollectionsForUi();
  const last = await figma.clientStorage.getAsync('lastSelection').catch(() => null);
  const exportAllPrefVal = await figma.clientStorage.getAsync('exportAllPref').catch(() => false);
  const lastOrNull = last && typeof last.collection === 'string' && typeof last.mode === 'string'
    ? last
    : null;

  send({ type: 'INFO', payload: { message: 'Fetched ' + String(snapshot.collections.length) + ' collections' } });
  send({ type: 'COLLECTIONS_DATA', payload: { collections: snapshot.collections, last: lastOrNull, exportAllPref: !!exportAllPrefVal } });
  send({ type: 'RAW_COLLECTIONS_TEXT', payload: { text: snapshot.rawText } });
}

async function handleImportDtcg(msg: UiToPlugin): Promise<void> {
  const payload = (msg as MessageOfType<'IMPORT_DTCG'>).payload;
  const contexts = Array.isArray(payload.contexts) ? payload.contexts.map(c => String(c)) : [];
  const summary = await importDtcg(payload.json, {
    allowHexStrings: !!payload.allowHexStrings,
    contexts
  });

  const skippedCount = summary.skippedContexts.length;
  if (skippedCount > 0) {
    send({
      type: 'INFO',
      payload: {
        message: `Import completed. Applied ${summary.appliedContexts.length} context(s); skipped ${skippedCount}.`
      }
    });
  } else {
    send({ type: 'INFO', payload: { message: 'Import completed.' } });
  }

  send({ type: 'IMPORT_SUMMARY', payload: { summary, timestamp: Date.now(), source: 'local' } });

  const snap = await snapshotCollectionsForUi();
  const last = await figma.clientStorage.getAsync('lastSelection').catch(() => null);
  const exportAllPrefVal = await figma.clientStorage.getAsync('exportAllPref').catch(() => false);
  const lastOrNull = last && typeof last.collection === 'string' && typeof last.mode === 'string'
    ? last
    : null;

  send({ type: 'COLLECTIONS_DATA', payload: { collections: snap.collections, last: lastOrNull, exportAllPref: !!exportAllPrefVal } });
  send({ type: 'RAW_COLLECTIONS_TEXT', payload: { text: snap.rawText } });
}

async function handleExportDtcg(msg: UiToPlugin): Promise<void> {
  const payload = (msg as MessageOfType<'EXPORT_DTCG'>).payload;
  const exportAll = !!payload.exportAll;
  if (exportAll) {
    const all = await exportDtcg({ format: 'single' });
    send({ type: 'EXPORT_RESULT', payload: { files: all.files } });
    return;
  }

  const collectionName = payload.collection ? payload.collection : '';
  const modeName = payload.mode ? payload.mode : '';
  const per = await exportDtcg({ format: 'perMode' });

  const prettyExact = `${collectionName} - ${modeName}.json`;
  const prettyLoose = `${collectionName} - ${modeName}`;
  const legacy1 = `${collectionName}_mode=${modeName}`;
  const legacy2 = `${collectionName}/mode=${modeName}`;
  const legacy3 = safeKeyFromCollectionAndMode(collectionName, modeName);

  let picked = per.files.find(f => {
    const n = String(f?.name || '');
    return n === prettyExact || n === prettyLoose || n.includes(`${collectionName} - ${modeName}`);
  });
  if (!picked) {
    picked = per.files.find(f => {
      const n = String(f?.name || '');
      return n.includes(legacy1) || n.includes(legacy2) || n.includes(legacy3);
    });
  }

  const filesToSend = picked ? [picked] : per.files;
  if (!picked) {
    send({ type: 'INFO', payload: { message: `Export: pretty file not found for "${collectionName}" / "${modeName}". Falling back to all per-mode files.` } });
  }
  send({ type: 'EXPORT_RESULT', payload: { files: filesToSend } });
}

async function handleSaveLast(msg: UiToPlugin): Promise<void> {
  const payload = (msg as MessageOfType<'SAVE_LAST'>).payload;
  if (typeof payload.collection === 'string' && typeof payload.mode === 'string') {
    await figma.clientStorage.setAsync('lastSelection', { collection: payload.collection, mode: payload.mode });
  }
}

async function handleSavePrefs(msg: UiToPlugin): Promise<void> {
  const payload = (msg as MessageOfType<'SAVE_PREFS'>).payload;
  await figma.clientStorage.setAsync('exportAllPref', !!payload.exportAll);
}

async function handleUiResize(msg: UiToPlugin): Promise<void> {
  const payload = (msg as MessageOfType<'UI_RESIZE'>).payload;
  const w = Math.max(720, Math.min(1600, Math.floor(payload.width)));
  const h = Math.max(420, Math.min(1200, Math.floor(payload.height)));
  figma.ui.resize(w, h);
  try { await figma.clientStorage.setAsync('uiSize', { width: w, height: h }); } catch { }
}

async function handlePreviewRequest(msg: UiToPlugin): Promise<void> {
  const payload = (msg as MessageOfType<'PREVIEW_REQUEST'>).payload;
  const collectionName = payload.collection ? String(payload.collection) : '';
  const modeName = payload.mode ? String(payload.mode) : '';

  const per = await exportDtcg({ format: 'perMode' });

  const prettyExact = `${collectionName} - ${modeName}.json`;
  const prettyLoose = `${collectionName} - ${modeName}`;
  const legacy1 = `${collectionName}_mode=${modeName}`;
  const legacy2 = `${collectionName}/mode=${modeName}`;
  const legacy3 = safeKeyFromCollectionAndMode(collectionName, modeName);

  const picked = per.files.find(f => {
    const n = String(f?.name || '');
    return n === prettyExact || n === prettyLoose || n.includes(`${collectionName} - ${modeName}`);
  }) || per.files.find(f => {
    const n = String(f?.name || '');
    return n.includes(legacy1) || n.includes(legacy2) || n.includes(legacy3);
  }) || per.files[0] || { name: 'tokens-empty.json', json: {} };

  send({ type: 'W3C_PREVIEW', payload: { name: picked.name, json: picked.json } });
}

const coreHandlers = new Map<UiToPlugin['type'], Handler>([
  ['UI_READY', handleUiReady],
  ['FETCH_COLLECTIONS', handleFetchCollections],
  ['IMPORT_DTCG', handleImportDtcg],
  ['EXPORT_DTCG', handleExportDtcg],
  ['SAVE_LAST', handleSaveLast],
  ['SAVE_PREFS', handleSavePrefs],
  ['UI_RESIZE', handleUiResize],
  ['PREVIEW_REQUEST', handlePreviewRequest],
]);

figma.ui.onmessage = async (msg: UiToPlugin) => {
  try {
    const handler = coreHandlers.get(msg.type as UiToPlugin['type']);
    if (handler) {
      await handler(msg);
      return;
    }

    if (await github.handle(msg)) return;
  } catch (e) {
    let message = 'Unknown error';
    if (e && (e as Error).message) message = (e as Error).message;
    figma.notify('Plugin error: ' + message, { timeout: 4000 });
    send({ type: 'ERROR', payload: { message } });
    // eslint-disable-next-line no-console
    console.error(e);
  }
};;
