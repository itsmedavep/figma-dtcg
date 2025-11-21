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

let lastRawText = '';

async function broadcastLocalCollections(opts: { force?: boolean; silent?: boolean } = {}): Promise<void> {
  const snap = await snapshotCollectionsForUi();
  
  // If not forced, check if meaningful change occurred
  if (!opts.force && snap.rawText === lastRawText) {
    return;
  }
  
  lastRawText = snap.rawText;

  const last = await figma.clientStorage.getAsync('lastSelection').catch(() => null);
  const exportAllPrefVal = await figma.clientStorage.getAsync('exportAllPref').catch(() => false);
  const styleDictionaryPrefVal = await figma.clientStorage.getAsync('styleDictionaryPref').catch(() => false);
  const flatTokensPrefVal = await figma.clientStorage.getAsync('flatTokensPref').catch(() => false);
  const allowHexPrefStored = await figma.clientStorage.getAsync('allowHexPref').catch(() => null);
  const githubRememberPrefStored = await figma.clientStorage.getAsync('githubRememberPref').catch(() => null);
  const allowHexPrefVal = typeof allowHexPrefStored === 'boolean' ? allowHexPrefStored : true;
  const githubRememberPrefVal = typeof githubRememberPrefStored === 'boolean' ? githubRememberPrefStored : true;
  const lastOrNull = last && typeof last.collection === 'string' && typeof last.mode === 'string'
    ? last
    : null;

  if (!opts.silent) {
    send({ type: 'INFO', payload: { message: 'Fetched ' + String(snap.collections.length) + ' collections' + (opts.force ? '' : ' (auto)') } });
  }

  send({
    type: 'COLLECTIONS_DATA',
    payload: {
      collections: snap.collections,
      last: lastOrNull,
      exportAllPref: !!exportAllPrefVal,
      styleDictionaryPref: !!styleDictionaryPrefVal,
      flatTokensPref: !!flatTokensPrefVal,
      allowHexPref: allowHexPrefVal,
      githubRememberPref: githubRememberPrefVal,
    }
  });
  send({ type: 'RAW_COLLECTIONS_TEXT', payload: { text: snap.rawText } });
}

let pollInterval: number | undefined;

function startPolling() {
  if (pollInterval) return;
  
  // Poll every 500ms for variable changes
  pollInterval = setInterval(() => {
    broadcastLocalCollections({ force: false, silent: true }).catch(err => console.error(err));
  }, 500);

  // Listen for style changes (immediate)
  figma.on('documentchange', (event) => {
    const styleChanges = event.documentChanges.filter(c => 
      c.type === 'STYLE_CREATE' || 
      c.type === 'STYLE_DELETE' || 
      c.type === 'STYLE_PROPERTY_CHANGE'
    );
    if (styleChanges.length > 0) {
      const createdIds = new Set(styleChanges.filter(c => c.type === 'STYLE_CREATE').map(c => c.id));
      const deletedIds = new Set(styleChanges.filter(c => c.type === 'STYLE_DELETE').map(c => c.id));
      
      // Ignore styles that were created and deleted in the same batch (ghosts)
      const ghostIds = new Set([...createdIds].filter(id => deletedIds.has(id)));

      for (const change of styleChanges) {
        if (ghostIds.has(change.id)) continue;

        if (change.type === 'STYLE_CREATE') {
          const style = figma.getStyleById(change.id);
          // If style is null, it might be a ghost that wasn't caught or an internal error. Skip it.
          if (style) {
            send({ type: 'INFO', payload: { message: `Style Created: ${style.name}` } });
          }
        } else if (change.type === 'STYLE_DELETE') {
          // We can't get the name of a deleted style, so just log a generic message.
          send({ type: 'INFO', payload: { message: 'Style Deleted' } });
        } else if (change.type === 'STYLE_PROPERTY_CHANGE') {
          // If the style was created in this batch, the CREATE event (with final state) is sufficient.
          // Suppress the update to avoid "Updated then Created" noise.
          if (createdIds.has(change.id)) continue;

          const style = figma.getStyleById(change.id);
          if (style) {
            send({ type: 'INFO', payload: { message: `Style Updated: ${style.name} (Properties: ${change.properties.join(', ')})` } });
          }
        }
      }
      broadcastLocalCollections({ force: true, silent: true }).catch(err => console.error(err));
    }
  });

  // Also check on selection/page change as a heuristic
  figma.on('selectionchange', () => {
    broadcastLocalCollections({ force: false, silent: true }).catch(err => console.error(err));
  });
  figma.on('currentpagechange', () => {
    broadcastLocalCollections({ force: false, silent: true }).catch(err => console.error(err));
  });
}

const github = createGithubDispatcher({
  send,
  snapshotCollectionsForUi,
  analyzeSelectionState,
  safeKeyFromCollectionAndMode,
  importDtcg,
  exportDtcg,
  broadcastLocalCollections,
});

type MessageOfType<T extends UiToPlugin['type']> = Extract<UiToPlugin, { type: T }>;
type Handler = (msg: UiToPlugin) => Promise<void> | void;

// Prime the UI with cached state and fresh collections so the iframe can render immediately.
async function handleUiReady(_msg: UiToPlugin): Promise<void> {
  await broadcastLocalCollections({ force: true, silent: false });
  await github.onUiReady();
  startPolling();
}

// Refresh the collection snapshot on demand, mirroring the bootstrap payload.
async function handleFetchCollections(_msg: UiToPlugin): Promise<void> {
  await broadcastLocalCollections({ force: true, silent: false });
}

// Apply an uploaded DTCG payload to the document and broadcast the resulting summary back to the UI.
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

  await broadcastLocalCollections({ force: true, silent: true });
}

// Export tokens either per mode or as a single bundle, matching the UI's requested scope.
async function handleExportDtcg(msg: UiToPlugin): Promise<void> {
  const payload = (msg as MessageOfType<'EXPORT_DTCG'>).payload;
  const exportAll = !!payload.exportAll;
  const styleDictionary = !!payload.styleDictionary;
  const flatTokens = !!payload.flatTokens;
  if (exportAll) {
    const all = await exportDtcg({ format: 'single', styleDictionary, flatTokens });
    send({ type: 'EXPORT_RESULT', payload: { files: all.files } });
    return;
  }

  const collectionName = payload.collection ? payload.collection : '';
  const modeName = payload.mode ? payload.mode : '';
  const per = await exportDtcg({ format: 'perMode', styleDictionary, flatTokens });

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

// Convert local text styles into typography tokens and surface the preview payload to the UI.
async function handleExportTypography(_msg: UiToPlugin): Promise<void> {
  const result = await exportDtcg({ format: 'typography' });
  send({ type: 'EXPORT_RESULT', payload: { files: result.files } });
  if (result.files.length > 0) {
    const first = result.files[0];
    send({ type: 'W3C_PREVIEW', payload: { name: first.name, json: first.json } });
  }
}

// Persist the last selected collection/mode pair so the UI can restore the user's focus.
async function handleSaveLast(msg: UiToPlugin): Promise<void> {
  const payload = (msg as MessageOfType<'SAVE_LAST'>).payload;
  if (typeof payload.collection === 'string' && typeof payload.mode === 'string') {
    await figma.clientStorage.setAsync('lastSelection', { collection: payload.collection, mode: payload.mode });
  }
}

// Store persistent export preferences (currently the "export all" toggle).
async function handleSavePrefs(msg: UiToPlugin): Promise<void> {
  const payload = (msg as MessageOfType<'SAVE_PREFS'>).payload;
  if (typeof payload.exportAll === 'boolean') {
    await figma.clientStorage.setAsync('exportAllPref', !!payload.exportAll);
  }
  if (typeof payload.styleDictionary === 'boolean') {
    await figma.clientStorage.setAsync('styleDictionaryPref', !!payload.styleDictionary);
  }
  if (typeof payload.flatTokens === 'boolean') {
    await figma.clientStorage.setAsync('flatTokensPref', !!payload.flatTokens);
  }
  if (typeof payload.allowHexStrings === 'boolean') {
    await figma.clientStorage.setAsync('allowHexPref', !!payload.allowHexStrings);
  }
  if (typeof payload.githubRememberToken === 'boolean') {
    const rememberPref = !!payload.githubRememberToken;
    await figma.clientStorage.setAsync('githubRememberPref', rememberPref);
    if (!rememberPref) {
      await figma.clientStorage.deleteAsync('github_token_b64').catch(() => { });
    }
  }
}

// Remember the iframe size so subsequent launches reopen with the user's preferred bounds.
async function handleUiResize(msg: UiToPlugin): Promise<void> {
  const payload = (msg as MessageOfType<'UI_RESIZE'>).payload;
  const w = Math.max(720, Math.min(1600, Math.floor(payload.width)));
  const h = Math.max(420, Math.min(1200, Math.floor(payload.height)));
  figma.ui.resize(w, h);
  try { await figma.clientStorage.setAsync('uiSize', { width: w, height: h }); } catch { }
}

// Respond to preview requests by exporting the closest match and pushing it to the W3C preview pane.
async function handlePreviewRequest(msg: UiToPlugin): Promise<void> {
  const payload = (msg as MessageOfType<'PREVIEW_REQUEST'>).payload;
  const collectionName = payload.collection ? String(payload.collection) : '';
  const modeName = payload.mode ? String(payload.mode) : '';
  const styleDictionary = !!payload.styleDictionary;
  const flatTokens = !!payload.flatTokens;

  const per = await exportDtcg({ format: 'perMode', styleDictionary, flatTokens });

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
  ['EXPORT_TYPOGRAPHY', handleExportTypography],
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
