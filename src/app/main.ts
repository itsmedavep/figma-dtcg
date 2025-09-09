// src/app/main.ts
import type { UiToPlugin, PluginToUi } from './messages';
import { importDtcg, exportDtcg } from '../core/pipeline';

// __html__ is injected by your build (esbuild) from dist/ui.html with ui.js inlined.
declare const __html__: string;

// Use saved size if available; fall back to 960×540.
(async function initUI() {
  var w = 960, h = 540;
  try {
    var saved = await figma.clientStorage.getAsync('uiSize');
    if (saved && typeof saved.width === 'number' && typeof saved.height === 'number') {
      var sw = Math.floor(saved.width);
      var sh = Math.floor(saved.height);
      w = Math.max(720, Math.min(1600, sw));
      h = Math.max(420, Math.min(1200, sh));
    }
  } catch (_e) { /* ignore */ }
  figma.showUI(__html__, { width: w, height: h });
})();


function send(msg: PluginToUi): void {
  figma.ui.postMessage(msg);
}

async function snapshotCollectionsForUi(): Promise<{
  collections: Array<{
    id: string;
    name: string;
    modes: Array<{ id: string; name: string }>;
    variables: Array<{ id: string; name: string; type: string }>;
  }>;
  rawText: string;
}> {
  if (typeof figma.editorType !== 'string' || figma.editorType !== 'figma') {
    return {
      collections: [],
      rawText:
        'Variables API is not available in this editor.\n' +
        'Open a Figma Design file (not FigJam) and try again.'
    };
  }
  if (
    typeof figma.variables === 'undefined' ||
    typeof figma.variables.getLocalVariableCollectionsAsync !== 'function' ||
    typeof figma.variables.getVariableByIdAsync !== 'function'
  ) {
    return {
      collections: [],
      rawText:
        'Variables API methods not found. Ensure your Figma version supports Variables and try again.'
    };
  }

  const locals: VariableCollection[] = await figma.variables.getLocalVariableCollectionsAsync();

  const out: Array<{
    id: string;
    name: string;
    modes: Array<{ id: string; name: string }>;
    variables: Array<{ id: string; name: string; type: string }>;
  }> = [];
  const rawLines: string[] = [];

  let i = 0;
  for (i = 0; i < locals.length; i++) {
    const c = locals[i];
    if (!c) continue;

    const modes: Array<{ id: string; name: string }> = [];
    let mi = 0;
    for (mi = 0; mi < c.modes.length; mi++) {
      const m = c.modes[mi];
      modes.push({ id: m.modeId, name: m.name });
    }

    const varsList: Array<{ id: string; name: string; type: string }> = [];
    let vi = 0;
    for (vi = 0; vi < c.variableIds.length; vi++) {
      const varId = c.variableIds[vi];
      const v = await figma.variables.getVariableByIdAsync(varId);
      if (!v) continue;
      varsList.push({ id: v.id, name: v.name, type: v.resolvedType });
    }

    out.push({ id: c.id, name: c.name, modes: modes, variables: varsList });

    rawLines.push('Collection: ' + c.name + ' (' + c.id + ')');
    const modeNames: string[] = [];
    let zi = 0; for (zi = 0; zi < modes.length; zi++) modeNames.push(modes[zi].name);
    rawLines.push('  Modes: ' + (modeNames.length > 0 ? modeNames.join(', ') : '(none)'));
    rawLines.push('  Variables (' + String(varsList.length) + '):');
    let qi = 0; for (qi = 0; qi < varsList.length; qi++) rawLines.push('    - ' + varsList[qi].name + ' [' + varsList[qi].type + ']');
    rawLines.push('');
  }

  if (out.length === 0) {
    rawLines.push('No local Variable Collections found.');
    rawLines.push('Create one in the Variables panel, then press Refresh.');
  }

  return { collections: out, rawText: rawLines.join('\n') };
}

function safeKeyFromCollectionAndMode(collectionName: string, modeName: string): string {
  const base = collectionName + '/mode=' + modeName;
  let i = 0, out = '';
  for (i = 0; i < base.length; i++) {
    const ch = base.charAt(i);
    if (ch === '/' || ch === '\\' || ch === ':') out += '_'; else out += ch;
  }
  return out;
}

figma.ui.onmessage = async (msg: UiToPlugin) => {
  try {
    if (msg.type === 'UI_READY') {
      const snap = await snapshotCollectionsForUi();
      // Load prefs
      const last = await figma.clientStorage.getAsync('lastSelection').catch(function () { return null; });
      const exportAllPrefVal = await figma.clientStorage.getAsync('exportAllPref').catch(function () { return false; });
      const lastOrNull = last && typeof last.collection === 'string' && typeof last.mode === 'string'
        ? last
        : null;

      send({ type: 'INFO', payload: { message: 'Fetched ' + String(snap.collections.length) + ' collections (initial)' } });
      send({ type: 'COLLECTIONS_DATA', payload: { collections: snap.collections, last: lastOrNull, exportAllPref: !!exportAllPrefVal } });
      send({ type: 'RAW_COLLECTIONS_TEXT', payload: { text: snap.rawText } });
      return;
    }

    if (msg.type === 'FETCH_COLLECTIONS') {
      const snapshot = await snapshotCollectionsForUi();
      const last = await figma.clientStorage.getAsync('lastSelection').catch(function () { return null; });
      const exportAllPrefVal = await figma.clientStorage.getAsync('exportAllPref').catch(function () { return false; });
      const lastOrNull = last && typeof last.collection === 'string' && typeof last.mode === 'string'
        ? last
        : null;

      send({ type: 'INFO', payload: { message: 'Fetched ' + String(snapshot.collections.length) + ' collections' } });
      send({ type: 'COLLECTIONS_DATA', payload: { collections: snapshot.collections, last: lastOrNull, exportAllPref: !!exportAllPrefVal } });
      send({ type: 'RAW_COLLECTIONS_TEXT', payload: { text: snapshot.rawText } });
      return;
    }

    if (msg.type === 'IMPORT_DTCG') {
      await importDtcg(msg.payload.json);
      send({ type: 'INFO', payload: { message: 'Import completed.' } });
      const snap2 = await snapshotCollectionsForUi();
      const last = await figma.clientStorage.getAsync('lastSelection').catch(function () { return null; });
      const exportAllPrefVal = await figma.clientStorage.getAsync('exportAllPref').catch(function () { return false; });
      const lastOrNull = last && typeof last.collection === 'string' && typeof last.mode === 'string'
        ? last
        : null;

      send({ type: 'COLLECTIONS_DATA', payload: { collections: snap2.collections, last: lastOrNull, exportAllPref: !!exportAllPrefVal } });
      send({ type: 'RAW_COLLECTIONS_TEXT', payload: { text: snap2.rawText } });
      return;
    }

    if (msg.type === 'EXPORT_DTCG') {
      const exportAll = !!msg.payload.exportAll;
      if (exportAll) {
        const all = await exportDtcg({ format: 'single' });
        send({ type: 'EXPORT_RESULT', payload: { files: all.files } });
        return;
      }

      const collectionName = msg.payload.collection ? msg.payload.collection : '';
      const modeName = msg.payload.mode ? msg.payload.mode : '';
      const per = await exportDtcg({ format: 'perMode' });

      const key = safeKeyFromCollectionAndMode(collectionName, modeName);
      const picked: Array<{ name: string; json: unknown }> = [];
      let i2 = 0; for (i2 = 0; i2 < per.files.length; i2++) if (per.files[i2].name.indexOf(key) !== -1) picked.push(per.files[i2]);
      send({ type: 'EXPORT_RESULT', payload: { files: picked.length > 0 ? picked : per.files } });
      return;
    }

    if (msg.type === 'SAVE_LAST') {
      // Persist selection
      if (msg.payload && typeof msg.payload.collection === 'string' && typeof msg.payload.mode === 'string') {
        await figma.clientStorage.setAsync('lastSelection', { collection: msg.payload.collection, mode: msg.payload.mode });
      }
      return;
    }

    if (msg.type === 'SAVE_PREFS') {
      await figma.clientStorage.setAsync('exportAllPref', !!msg.payload.exportAll);
      return;
    }

    if (msg.type === 'UI_RESIZE') {
      var w = Math.max(720, Math.min(1600, Math.floor(msg.payload.width)));
      var h = Math.max(420, Math.min(1200, Math.floor(msg.payload.height)));
      figma.ui.resize(w, h);
      try { await figma.clientStorage.setAsync('uiSize', { width: w, height: h }); } catch (_err) { }
      // send({ type: 'INFO', payload: { message: 'Resized UI to ' + w + '×' + h } }); // <— add this single line
      return;
    }


  } catch (e) {
    var message = 'Unknown error';
    if (e && (e as Error).message) message = (e as Error).message;
    figma.notify('Plugin error: ' + message, { timeout: 4000 });
    send({ type: 'ERROR', payload: { message: message } });
    // eslint-disable-next-line no-console
    console.error(e);
  }
};
