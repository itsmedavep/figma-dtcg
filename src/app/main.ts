import type { UiToPlugin, PluginToUi } from './messages';
import { importDtcg, exportDtcg } from '../core/pipeline';

import {
  ghGetUser,
  ghListRepos,
  ghListBranches,
  ghCreateBranch,
  ghListDirs,
  ghEnsureFolder,
  ghCommitFiles
} from '../core/github/api';

// __html__ is injected by your build (esbuild) from dist/ui.html with ui.js inlined.
declare const __html__: string;

// ---------------- GitHub (minimal) ----------------
let ghToken: string | null = null;

// Persisted selection (owner/repo/branch)
const GH_SELECTED_KEY = 'gh.selected';
type GhSelected = { owner?: string; repo?: string; branch?: string; folder?: string };

async function getSelected(): Promise<GhSelected> {
  try { return (await figma.clientStorage.getAsync(GH_SELECTED_KEY)) ?? {}; } catch { return {}; }
}
async function setSelected(sel: GhSelected): Promise<void> {
  try { await figma.clientStorage.setAsync(GH_SELECTED_KEY, sel); } catch { /* ignore */ }
}

// Base64 helpers (btoa/atob exist in Figma plugin iframe)
function encodeToken(s: string): string {
  try { return btoa(s); } catch { return s; }
}
function decodeToken(s: string): string {
  try { return atob(s); } catch { return s; }
}

function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)); }

async function listAndSendRepos(token: string): Promise<void> {
  await sleep(75); // pre-warm
  let repos = await ghListRepos(token);
  if (!repos.ok && /Failed to fetch|network error/i.test(repos.error || '')) {
    await sleep(200);
    repos = await ghListRepos(token);
  }
  if (repos.ok) {
    (figma.ui as any).postMessage({ type: 'GITHUB_REPOS', payload: { repos: repos.repos } });
  } else {
    figma.ui.postMessage({ type: 'ERROR', payload: { message: `GitHub: Could not list repos: ${repos.error}` } });
    (figma.ui as any).postMessage({ type: 'GITHUB_REPOS', payload: { repos: [] } });
  }
}

async function restoreGithubTokenAndVerify(): Promise<void> {
  try {
    const stored = await figma.clientStorage.getAsync('github_token_b64').catch(() => null);
    if (!stored || typeof stored !== 'string' || stored.length === 0) return;

    const decoded = decodeToken(stored);
    ghToken = decoded;

    const who = await ghGetUser(decoded);
    if (who.ok) {
      (figma.ui as any).postMessage({
        type: 'GITHUB_AUTH_RESULT',
        payload: { ok: true, login: who.user.login, name: who.user.name, remember: true }
      });
      await listAndSendRepos(decoded);
    } else {
      send({ type: 'ERROR', payload: { message: `GitHub: Authentication failed (stored token): ${who.error}.` } });
      (figma.ui as any).postMessage({
        type: 'GITHUB_AUTH_RESULT',
        payload: { ok: false, error: who.error, remember: false }
      });
    }
  } catch {
    // ignore; user can paste a token
  }
}
// ---------------- /GitHub (minimal) ----------------

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

async function analyzeSelectionState(collectionName: string, modeName: string): Promise<{
  ok: boolean;
  message?: string;
  variableCount?: number;
  variablesWithValues?: number;
}> {
  try {
    const snap = await snapshotCollectionsForUi();
    const col = snap.collections.find(c => c.name === collectionName);
    if (!col) return { ok: false, message: `Collection "${collectionName}" not found in this file.` };
    if (!col.variables || col.variables.length === 0) {
      return { ok: false, message: `Collection "${collectionName}" has no local variables.` };
    }
    const mode = col.modes.find(m => m.name === modeName);
    if (!mode) return { ok: false, message: `Mode "${modeName}" not found in collection "${collectionName}".` };

    let withValues = 0;
    for (const v of col.variables) {
      const full = await figma.variables.getVariableByIdAsync(v.id);
      // value exists if valuesByMode has an entry (including aliases) for this mode
      if (full && full.valuesByMode && (mode.id in full.valuesByMode)) withValues++;
    }
    return { ok: true, variableCount: col.variables.length, variablesWithValues: withValues };
  } catch (e) {
    return { ok: false, message: (e as Error)?.message || 'Analysis failed' };
  }
}


figma.ui.onmessage = async (msg: UiToPlugin) => {
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

      // Optionally notify UI about previously saved repo/branch (UI may choose to restore)
      const sel = await getSelected();
      if (sel.owner && sel.repo) {
        (figma.ui as any).postMessage({ type: 'GITHUB_RESTORE_SELECTED', payload: sel });
      }

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

      // Prefer pretty: "Collection - Mode.json"
      const prettyExact = `${collectionName} - ${modeName}.json`;
      const prettyLoose = `${collectionName} - ${modeName}`; // fallback if extension missing

      // Legacy keys used by older builds
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

      // Pretty-first match
      const prettyExact = `${collectionName} - ${modeName}.json`;
      const prettyLoose = `${collectionName} - ${modeName}`;
      const legacy1 = `${collectionName}_mode=${modeName}`;
      const legacy2 = `${collectionName}/mode=${modeName}`;
      const legacy3 = safeKeyFromCollectionAndMode(collectionName, modeName);

      let picked = per.files.find(f => {
        const n = String(f?.name || '');
        return n === prettyExact || n === prettyLoose || n.includes(`${collectionName} - ${modeName}`);
      }) || per.files.find(f => {
        const n = String(f?.name || '');
        return n.includes(legacy1) || n.includes(legacy2) || n.includes(legacy3);
      }) || per.files[0] || { name: 'tokens-empty.json', json: {} };

      send({ type: 'W3C_PREVIEW', payload: { name: picked.name, json: picked.json } });
      return;
    }


    // ---------------- GitHub: set/forget token ----------------
    if ((msg as any).type === 'GITHUB_SET_TOKEN') {
      const payload = (msg as any).payload || {};
      const token = String(payload.token || '').trim();
      const remember = !!payload.remember;

      if (!token) {
        send({ type: 'ERROR', payload: { message: 'GitHub: Empty token.' } });
        (figma.ui as any).postMessage({ type: 'GITHUB_AUTH_RESULT', payload: { ok: false, error: 'empty token', remember: false } });
        return;
      }

      ghToken = token;
      if (remember) {
        await figma.clientStorage.setAsync('github_token_b64', encodeToken(token)).catch(() => { });
      } else {
        await figma.clientStorage.deleteAsync('github_token_b64').catch(() => { });
      }

      const who = await ghGetUser(token);
      if (who.ok) {
        (figma.ui as any).postMessage({
          type: 'GITHUB_AUTH_RESULT',
          payload: { ok: true, login: who.user.login, name: who.user.name, remember }
        });
        await listAndSendRepos(token);
      } else {
        send({ type: 'ERROR', payload: { message: `GitHub: Authentication failed: ${who.error}.` } });
        (figma.ui as any).postMessage({
          type: 'GITHUB_AUTH_RESULT',
          payload: { ok: false, error: who.error, remember: false }
        });
        (figma.ui as any).postMessage({ type: 'GITHUB_REPOS', payload: { repos: [] } });
      }
      return;
    }

    if ((msg as any).type === 'GITHUB_FORGET_TOKEN') {
      ghToken = null;
      await figma.clientStorage.deleteAsync('github_token_b64').catch(() => { /* ignore */ });
      send({ type: 'INFO', payload: { message: 'GitHub: Token cleared.' } });
      (figma.ui as any).postMessage({ type: 'GITHUB_AUTH_RESULT', payload: { ok: false, remember: false } });
      (figma.ui as any).postMessage({ type: 'GITHUB_REPOS', payload: { repos: [] } });
      return;
    }

    // ---------------- GitHub: selection persistence ----------------

    if ((msg as any).type === 'GITHUB_SELECT_REPO') {
      const { owner, repo } = (msg as any).payload || {};
      const sel = await getSelected();
      await setSelected({ owner, repo, branch: sel.branch, folder: undefined });
      return;
    }

    if ((msg as any).type === 'GITHUB_SELECT_BRANCH') {
      const p = (msg as any).payload || {};
      const owner = String(p.owner || '');
      const repo = String(p.repo || '');
      const branch = String(p.branch || '');
      const sel = await getSelected();
      // Clear folder when branch changes
      await setSelected({ owner: owner || sel.owner, repo: repo || sel.repo, branch, folder: undefined });
      return;
    }

    if ((msg as any).type === 'GITHUB_SET_FOLDER') {
      const p = (msg as any).payload || {};
      const owner = String(p.owner || '');
      const repo = String(p.repo || '');
      const folder = String(p.folder || '').replace(/^\/+|\/+$/g, '');
      const sel = await getSelected();
      await setSelected({
        owner: owner || sel.owner,
        repo: repo || sel.repo,
        branch: sel.branch,
        folder
      });
      return;
    }

    // ---------------- GitHub: branches (paging) ----------------
    if ((msg as any).type === 'GITHUB_FETCH_BRANCHES') {
      const p = (msg as any).payload || {};
      const owner = String(p.owner || '');
      const repo = String(p.repo || '');
      const page = Number.isFinite(p.page) ? Number(p.page) : 1;
      const force = !!p.force;

      if (!ghToken) {
        (figma.ui as any).postMessage({
          type: 'GITHUB_BRANCHES_ERROR',
          payload: { owner, repo, status: 401, message: 'No token' }
        });
        return;
      }

      const res = await ghListBranches(ghToken, owner, repo, page, force);
      if (res.ok) {
        (figma.ui as any).postMessage({
          type: 'GITHUB_BRANCHES',
          payload: {
            owner: res.owner,
            repo: res.repo,
            page: res.page,
            branches: res.branches,
            defaultBranch: res.defaultBranch,
            hasMore: res.hasMore,
            rate: res.rate
          }
        });

        if (page === 1) {
          await setSelected({ owner, repo, branch: res.defaultBranch });
        }
      } else {
        (figma.ui as any).postMessage({
          type: 'GITHUB_BRANCHES_ERROR',
          payload: {
            owner: res.owner,
            repo: res.repo,
            status: res.status,
            message: res.message,
            samlRequired: (res as any).samlRequired,
            rate: (res as any).rate
          }
        });
      }
      return;
    }

    // ---------------- GitHub: folder list / ensure (TOP-LEVEL) ----------------

    if ((msg as any).type === 'GITHUB_FOLDER_LIST') {
      const p = (msg as any).payload || {};
      const owner = String(p.owner || '');
      const repo = String(p.repo || '');
      const branch = String(p.branch || '');
      const path = String(p.path || '');

      if (!ghToken) {
        (figma.ui as any).postMessage({
          type: 'GITHUB_FOLDER_LIST_RESULT',
          payload: { ok: false, owner, repo, branch, path, status: 401, message: 'No token' }
        });
        return;
      }

      const res = await ghListDirs(ghToken, owner, repo, branch, path);
      if (res.ok) {
        // Map dirs -> entries (UI expects 'entries')
        (figma.ui as any).postMessage({
          type: 'GITHUB_FOLDER_LIST_RESULT',
          payload: {
            ok: true,
            owner, repo,
            branch,
            path: res.path,
            entries: res.dirs.map(d => ({ type: 'dir', name: d.name, path: d.path })),
            rate: res.rate
          }
        });
      } else {
        (figma.ui as any).postMessage({
          type: 'GITHUB_FOLDER_LIST_RESULT',
          payload: { ok: false, owner, repo, branch, path: res.path, status: res.status, message: res.message, rate: res.rate }
        });
      }
      return;
    }

    // NOTE: We keep this available but the UI does not call it to avoid extra commits.
    if ((msg as any).type === 'GITHUB_CREATE_FOLDER') {
      const p = (msg as any).payload || {};
      const owner = String(p.owner || '');
      const repo = String(p.repo || '');
      const branch = String(p.branch || '');
      const folderPath = String(p.folderPath || '');

      if (!ghToken) {
        (figma.ui as any).postMessage({
          type: 'GITHUB_CREATE_FOLDER_RESULT',
          payload: { ok: false, owner, repo, branch, folderPath, status: 401, message: 'No token' }
        });
        return;
      }

      const res = await ghEnsureFolder(ghToken, owner, repo, branch, folderPath);
      (figma.ui as any).postMessage({ type: 'GITHUB_CREATE_FOLDER_RESULT', payload: res });
      return;
    }

    // ---------------- GitHub: create branch ----------------
    if ((msg as any).type === 'GITHUB_CREATE_BRANCH') {
      const p = (msg as any).payload || {};
      const owner = String(p.owner || '');
      const repo = String(p.repo || '');
      const baseBranch = String(p.baseBranch || '');
      const newBranch = String(p.newBranch || '');

      if (!ghToken) {
        (figma.ui as any).postMessage({
          type: 'GITHUB_CREATE_BRANCH_RESULT',
          payload: { ok: false, owner, repo, baseBranch, newBranch, status: 401, message: 'No token' }
        });
        return;
      }
      if (!owner || !repo || !baseBranch || !newBranch) {
        (figma.ui as any).postMessage({
          type: 'GITHUB_CREATE_BRANCH_RESULT',
          payload: { ok: false, owner, repo, baseBranch, newBranch, status: 400, message: 'Missing owner/repo/base/new' }
        });
        return;
      }

      const res = await ghCreateBranch(ghToken, owner, repo, newBranch, baseBranch);
      if (res.ok) {
        await setSelected({ owner, repo, branch: newBranch });
        (figma.ui as any).postMessage({
          type: 'GITHUB_CREATE_BRANCH_RESULT',
          payload: {
            ok: true,
            owner: res.owner,
            repo: res.repo,
            baseBranch: res.baseBranch,
            newBranch: res.newBranch,
            sha: res.sha,
            html_url: res.html_url,
            rate: res.rate
          }
        });
      } else {
        (figma.ui as any).postMessage({
          type: 'GITHUB_CREATE_BRANCH_RESULT',
          payload: {
            ok: false,
            owner: res.owner,
            repo: res.repo,
            baseBranch: res.baseBranch,
            newBranch: res.newBranch,
            status: res.status,
            message: res.message,
            samlRequired: res.samlRequired,
            rate: res.rate
          }
        });
      }
      return;
    }

  } catch (e) {
    let message = 'Unknown error';
    if (e && (e as Error).message) message = (e as Error).message;
    figma.notify('Plugin error: ' + message, { timeout: 4000 });
    send({ type: 'ERROR', payload: { message } });
    // eslint-disable-next-line no-console
    console.error(e);
  }

  if ((msg as any).type === 'GITHUB_EXPORT_AND_COMMIT') {
    const p = (msg as any).payload || {};
    const owner = String(p.owner || '');
    const repo = String(p.repo || '');
    const branch = String(p.branch || '');
    const folder = String(p.folder || '').replace(/^\/+|\/+$/g, '');
    const commitMessage = (String(p.commitMessage || '') || 'Update tokens from Figma').trim();
    const scope = (String(p.scope || 'selected') === 'all') ? 'all' : 'selected';
    const collection = String(p.collection || '');
    const mode = String(p.mode || '');

    if (!ghToken) {
      (figma.ui as any).postMessage({
        type: 'GITHUB_EXPORT_AND_COMMIT_RESULT',
        payload: { ok: false, owner, repo, branch, status: 401, message: 'No token' }
      });
      return;
    }
    if (!owner || !repo || !branch) {
      (figma.ui as any).postMessage({
        type: 'GITHUB_EXPORT_AND_COMMIT_RESULT',
        payload: { ok: false, owner, repo, branch, status: 400, message: 'Missing owner/repo/branch' }
      });
      return;
    }
    if (!commitMessage) {
      (figma.ui as any).postMessage({
        type: 'GITHUB_EXPORT_AND_COMMIT_RESULT',
        payload: { ok: false, owner, repo, branch, status: 400, message: 'Empty commit message' }
      });
      return;
    }

    try {
      // 1) Generate the export payload we're about to commit
      const files: Array<{ name: string; json: unknown }> = [];

      if (scope === 'all') {
        const all = await exportDtcg({ format: 'single' });
        for (const f of all.files) files.push({ name: f.name, json: f.json });
      } else {
        if (!collection || !mode) {
          (figma.ui as any).postMessage({
            type: 'GITHUB_EXPORT_AND_COMMIT_RESULT',
            payload: { ok: false, owner, repo, branch, status: 400, message: 'Pick a collection and a mode.' }
          });
          return;
        }
        const per = await exportDtcg({ format: 'perMode' });

        // Prefer pretty file name first: "Collection - Mode.json"
        const prettyExact = `${collection} - ${mode}.json`;
        const prettyLoose = `${collection} - ${mode}`;

        const legacy1 = `${collection}_mode=${mode}`;
        const legacy2 = `${collection}/mode=${mode}`;
        const legacy3 = safeKeyFromCollectionAndMode(collection, mode);

        let picked = per.files.find(f => {
          const n = String(f?.name || '');
          return n === prettyExact || n === prettyLoose || n.includes(`${collection} - ${mode}`);
        });
        if (!picked) {
          picked = per.files.find(f => {
            const n = String(f?.name || '');
            return n.includes(legacy1) || n.includes(legacy2) || n.includes(legacy3);
          });
        }
        if (!picked) {
          const available = per.files.map(f => f.name).join(', ');
          (figma.ui as any).postMessage({
            type: 'GITHUB_EXPORT_AND_COMMIT_RESULT',
            payload: { ok: false, owner, repo, branch, status: 404, message: `No export found for "${collection}" / "${mode}". Available: [${available}]` }
          });
          return;
        }

        files.push({ name: picked.name, json: picked.json });

      }

      // 2) Abort if the export JSON is an empty object (avoid committing `{}`)
      const isPlainEmptyObject = (v: any) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0;
      const exportLooksEmpty = files.length === 0 || files.every(f => isPlainEmptyObject(f.json));

      if (exportLooksEmpty) {
        if (scope === 'selected') {
          const diag = await analyzeSelectionState(collection, mode);
          const tail = diag.ok
            ? `Found ${diag.variableCount} variable(s) in "${collection}", but ${diag.variablesWithValues ?? 0} with a value in "${mode}".`
            : (diag.message || 'No values present.');
          (figma.ui as any).postMessage({
            type: 'GITHUB_EXPORT_AND_COMMIT_RESULT',
            payload: {
              ok: false, owner, repo, branch, status: 412,
              message: `Export for "${collection}" / "${mode}" produced an empty tokens file. ${tail}`
            }
          });
        } else {
          (figma.ui as any).postMessage({
            type: 'GITHUB_EXPORT_AND_COMMIT_RESULT',
            payload: {
              ok: false, owner, repo, branch, status: 412,
              message: 'Export produced an empty tokens file. Ensure this file contains local Variables with values.'
            }
          });
        }
        return;
      }

      // 3) Build paths & pretty names
      function prettyExportName(original: string | undefined | null): string {
        const name = (original && typeof original === 'string') ? original : 'tokens.json';
        const m = name.match(/^(.*)_mode=(.*)\.tokens\.json$/);
        if (m) return `${m[1].trim()} - ${m[2].trim()}.json`;
        return name.endsWith('.json') ? name : (name + '.json');
      }
      const prefix = folder ? (folder.endsWith('/') ? folder : folder + '/') : '';
      const commitFiles = files.map(f => ({
        path: prefix + prettyExportName(f.name),
        content: JSON.stringify(f.json, null, 2) + '\n'
      }));

      // 4) Commit in one go
      const res = await ghCommitFiles(ghToken, owner, repo, branch, commitMessage, commitFiles);

      (figma.ui as any).postMessage({
        type: 'GITHUB_EXPORT_AND_COMMIT_RESULT',
        payload: res
      });

      if (res.ok) {
        send({ type: 'INFO', payload: { message: `Committed ${commitFiles.length} file(s) to ${owner}/${repo}@${branch}` } });
      } else {
        send({ type: 'ERROR', payload: { message: `GitHub: Commit failed (${res.status}): ${res.message}` } });
      }
    } catch (e) {
      const msgText = (e as Error)?.message || 'unknown error';
      (figma.ui as any).postMessage({
        type: 'GITHUB_EXPORT_AND_COMMIT_RESULT',
        payload: { ok: false, owner, repo, branch, status: 0, message: msgText }
      });
    }
    return;
  }


};
