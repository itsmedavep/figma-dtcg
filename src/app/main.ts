// src/app/main.ts
import type { UiToPlugin, PluginToUi } from './messages';
import { importDtcg, exportDtcg } from '../core/pipeline';
import { ghGetUser } from '../core/github/api'; // only import ghGetUser

// __html__ is injected by your build (esbuild) from dist/ui.html with ui.js inlined.
declare const __html__: string;

/* ---------------- GitHub (minimal) ---------------- */
let ghToken: string | null = null;

// Base64 helpers (btoa/atob exist in Figma plugin iframe)
function encodeToken(s: string): string {
  try { return btoa(s); } catch { return s; }
}
function decodeToken(s: string): string {
  try { return atob(s); } catch { return s; }
}

/**
 * On plugin boot, if a token is remembered in clientStorage, verify it and
 * notify the UI with GITHUB_AUTH_RESULT. We set remember: true so the UI
 * keeps the checkbox checked and masks the PAT field.
 */
async function restoreGithubTokenAndVerify(): Promise<void> {
  try {
    const stored = await figma.clientStorage.getAsync('github_token_b64').catch(() => null);
    if (!stored || typeof stored !== 'string' || stored.length === 0) return;

    const decoded = decodeToken(stored);
    ghToken = decoded;

    const who = await ghGetUser(decoded);
    if (who.ok) {
      // No INFO log here; UI will log once when it receives GITHUB_AUTH_RESULT.
      send({
        // messages.ts untouched → cast to any
        ...(undefined as any),
        type: 'GITHUB_AUTH_RESULT',
        payload: {
          ok: true,
          login: who.user.login,
          name: who.user.name,
          remember: true,          // <— persist Remember UI state
          exp: (who as any).exp ?? undefined // <— if your api returns an expiration
        }
      } as any);
    } else {
      send({ type: 'ERROR', payload: { message: `GitHub: Authentication failed (stored token): ${who.error}.` } });
      send({ ...(undefined as any), type: 'GITHUB_AUTH_RESULT', payload: { ok: false, error: who.error } } as any);
    }
  } catch {
    // ignore; user can paste a token
  }
}
/* ---------------- /GitHub (minimal) ---------------- */

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

  for (let i = 0; i < locals.length; i++) {
    const c = locals[i];
    if (!c) continue;

    const modes: Array<{ id: string; name: string }> = [];
    for (let mi = 0; mi < c.modes.length; mi++) {
      const m = c.modes[mi];
      modes.push({ id: m.modeId, name: m.name });
    }

    const varsList: Array<{ id: string; name: string; type: string }> = [];
    for (let vi = 0; vi < c.variableIds.length; vi++) {
      const varId = c.variableIds[vi];
      const v = await figma.variables.getVariableByIdAsync(varId);
      if (!v) continue;
      varsList.push({ id: v.id, name: v.name, type: v.resolvedType });
    }

    out.push({ id: c.id, name: c.name, modes: modes, variables: varsList });

    rawLines.push('Collection: ' + c.name + ' (' + c.id + ')');
    const modeNames: string[] = modes.map(m => m.name);
    rawLines.push('  Modes: ' + (modeNames.length > 0 ? modeNames.join(', ') : '(none)'));
    rawLines.push('  Variables (' + String(varsList.length) + '):');
    for (let qi = 0; qi < varsList.length; qi++) {
      rawLines.push('    - ' + varsList[qi].name + ' [' + varsList[qi].type + ']');
    }
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
  let out = '';
  for (let i = 0; i < base.length; i++) {
    const ch = base.charAt(i);
    out += (ch === '/' || ch === '\\' || ch === ':') ? '_' : ch;
  }
  return out;
}

figma.ui.onmessage = async (msg: UiToPlugin | any) => {
  try {
    if (msg.type === 'UI_READY') {
      const snap = await snapshotCollectionsForUi();
      const last = await figma.clientStorage.getAsync('lastSelection').catch(() => null);
      const exportAllPrefVal = await figma.clientStorage.getAsync('exportAllPref').catch(() => false);
      const lastOrNull = last && typeof last.collection === 'string' && typeof last.mode === 'string'
        ? last
        : null;

      send({ type: 'INFO', payload: { message: 'Fetched ' + String(snap.collections.length) + ' collections (initial)' } });
      send({ type: 'COLLECTIONS_DATA', payload: { collections: snap.collections, last: lastOrNull, exportAllPref: !!exportAllPrefVal } });
      send({ type: 'RAW_COLLECTIONS_TEXT', payload: { text: snap.rawText } });

      // Try to restore a remembered GitHub token and verify it.
      await restoreGithubTokenAndVerify();
      return;
    }

    if (msg.type === 'FETCH_COLLECTIONS') {
      const snapshot = await snapshotCollectionsForUi();
      const last = await figma.clientStorage.getAsync('lastSelection').catch(() => null);
      const exportAllPrefVal = await figma.clientStorage.getAsync('exportAllPref').catch(() => false);
      const lastOrNull = last && typeof last.collection === 'string' && typeof last.mode === 'string'
        ? last
        : null;

      send({ type: 'INFO', payload: { message: 'Fetched ' + String(snapshot.collections.length) + ' collections' } });
      send({ type: 'COLLECTIONS_DATA', payload: { collections: snapshot.collections, last: lastOrNull, exportAllPref: !!exportAllPrefVal } });
      send({ type: 'RAW_COLLECTIONS_TEXT', payload: { text: snapshot.rawText } });
      return;
    }

    if (msg.type === 'IMPORT_DTCG') {
      await importDtcg(msg.payload.json, { allowHexStrings: !!msg.payload.allowHexStrings });
      send({ type: 'INFO', payload: { message: 'Import completed.' } });

      const snap2 = await snapshotCollectionsForUi();
      const last = await figma.clientStorage.getAsync('lastSelection').catch(() => null);
      const exportAllPrefVal = await figma.clientStorage.getAsync('exportAllPref').catch(() => false);
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
      for (let i2 = 0; i2 < per.files.length; i2++) {
        if (per.files[i2].name.indexOf(key) !== -1) picked.push(per.files[i2]);
      }
      send({ type: 'EXPORT_RESULT', payload: { files: picked.length > 0 ? picked : per.files } });
      return;
    }

    if (msg.type === 'SAVE_LAST') {
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
      const w = Math.max(720, Math.min(1600, Math.floor(msg.payload.width)));
      const h = Math.max(420, Math.min(1200, Math.floor(msg.payload.height)));
      figma.ui.resize(w, h);
      try { await figma.clientStorage.setAsync('uiSize', { width: w, height: h }); } catch { }
      return;
    }

    if (msg.type === 'PREVIEW_REQUEST') {
      const collectionName = msg.payload.collection ? String(msg.payload.collection) : '';
      const modeName = msg.payload.mode ? String(msg.payload.mode) : '';

      const per = await exportDtcg({ format: 'perMode' });

      const key = safeKeyFromCollectionAndMode(collectionName, modeName);
      let picked = per.files.find(f => f.name.indexOf(key) !== -1);
      if (!picked) picked = per.files[0];
      if (!picked) picked = { name: 'tokens-empty.json', json: {} };

      send({ type: 'W3C_PREVIEW', payload: { name: picked.name, json: picked.json } });
      return;
    }

    /* ---------------- GitHub: set/forget token ---------------- */
    if (msg.type === 'GITHUB_SET_TOKEN') {
      const payload = (msg as any).payload || {};
      const token = String(payload.token || '').trim();
      const remember = !!payload.remember;

      if (!token) {
        send({ type: 'ERROR', payload: { message: 'GitHub: Empty token.' } });
        send({ ...(undefined as any), type: 'GITHUB_AUTH_RESULT', payload: { ok: false, error: 'empty token' } } as any);
        return;
      }

      ghToken = token;
      if (remember) {
        await figma.clientStorage.setAsync('github_token_b64', encodeToken(token)).catch(() => { });
      } else {
        await figma.clientStorage.deleteAsync('github_token_b64').catch(() => { });
      }

      // No INFO log here (UI already logs “Verifying…” before sending this)
      const who = await ghGetUser(token);
      if (who.ok) {
        send({
          ...(undefined as any),
          type: 'GITHUB_AUTH_RESULT',
          payload: {
            ok: true,
            login: who.user.login,
            name: who.user.name,
            remember,                   // reflect UI choice
            exp: (who as any).exp ?? undefined
          }
        } as any);
      } else {
        send({ type: 'ERROR', payload: { message: `GitHub: Authentication failed: ${who.error}.` } });
        send({ ...(undefined as any), type: 'GITHUB_AUTH_RESULT', payload: { ok: false, error: who.error } } as any);
      }
      return;
    }

    if (msg.type === 'GITHUB_FORGET_TOKEN') {
      ghToken = null;
      await figma.clientStorage.deleteAsync('github_token_b64').catch(() => { /* ignore */ });
      send({ type: 'INFO', payload: { message: 'GitHub: Token cleared.' } });
      send({ ...(undefined as any), type: 'GITHUB_AUTH_RESULT', payload: { ok: false } } as any);
      return;
    }
    /* ---------------- /GitHub ---------------- */

  } catch (e) {
    let message = 'Unknown error';
    if (e && (e as Error).message) message = (e as Error).message;
    figma.notify('Plugin error: ' + message, { timeout: 4000 });
    send({ type: 'ERROR', payload: { message } });
    // eslint-disable-next-line no-console
    console.error(e);
  }
};
