// src/app/main.ts
// Main-thread controller: wires UI messages into Figma APIs and GitHub helpers.
// - Handles persistence so the iframe can reload without losing settings
// - Wraps GitHub flows with retries and gentle error surfaces

import type { UiToPlugin, PluginToUi, GithubScope } from './messages';
import { importDtcg, exportDtcg } from '../core/pipeline';

import {
  ghGetUser,
  ghListRepos,
  ghListBranches,
  ghCreateBranch,
  ghListDirs,
  ghEnsureFolder,
  ghCommitFiles,
  ghGetFileContents,
  ghCreatePullRequest
} from '../core/github/api';

// __html__ is injected by your build (esbuild) from dist/ui.html with ui.js inlined.
declare const __html__: string;

// ---------------- GitHub (minimal) ----------------
let ghToken: string | null = null;

// Persisted selection (owner/repo/branch)
const GH_SELECTED_KEY = 'gh.selected';
type GhSelected = {
  owner?: string;
  repo?: string;
  branch?: string;
  folder?: string;
  commitMessage?: string;
  scope?: GithubScope;
  collection?: string;
  mode?: string;
  createPr?: boolean;
  prBase?: string;
  prTitle?: string;
  prBody?: string;
};

/** Load the last chosen GitHub target from client storage. */
async function getSelected(): Promise<GhSelected> {
  try { return (await figma.clientStorage.getAsync(GH_SELECTED_KEY)) ?? {}; } catch { return {}; }
}
/** Persist the full selection object so the UI can restore it on load. */
async function setSelected(sel: GhSelected): Promise<void> {
  try { await figma.clientStorage.setAsync(GH_SELECTED_KEY, sel); } catch { /* ignore */ }
}

/** Merge partial changes into the stored selection atomically. */
async function mergeSelected(partial: Partial<GhSelected>): Promise<GhSelected> {
  const current = await getSelected();
  const merged = { ...current, ...partial };
  await setSelected(merged);
  return merged;
}

// Base64 helpers (btoa/atob exist in Figma plugin iframe)
/** Store GitHub tokens obfuscated with base64 (good enough for local prefs). */
function encodeToken(s: string): string {
  try { return btoa(s); } catch { return s; }
}
/** Decode the stored GitHub token, falling back gracefully if decoding fails. */
function decodeToken(s: string): string {
  try { return atob(s); } catch { return s; }
}

/** Tiny sleep helper for rate limiting and retries. */
function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)); }

/** Canonicalize folder input so stored prefs stay consistent across platforms. */
const INVALID_FOLDER_SEGMENT = /[<>:"\\|?*\u0000-\u001F]/;

type FolderNormalization =
  | { ok: true; storage: string }
  | { ok: false; message: string };

type FolderCommitPath =
  | { ok: true; path: string }
  | { ok: false; message: string };

function validateFolderSegments(segments: string[]): string | null {
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg) return 'GitHub: Folder path has an empty segment.';
    if (seg === '.' || seg === '..') {
      return 'GitHub: Folder path cannot include "." or ".." segments.';
    }
    if (INVALID_FOLDER_SEGMENT.test(seg)) {
      return `GitHub: Folder segment "${seg}" contains invalid characters.`;
    }
  }
  return null;
}

function normalizeFolderForStorage(raw: string): FolderNormalization {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return { ok: true, storage: '' };
  if (trimmed === '/' || trimmed === './' || trimmed === '.') return { ok: true, storage: '/' };

  const collapsed = trimmed.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  const stripped = collapsed.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!stripped) return { ok: true, storage: '/' };

  const segments = stripped.split('/').filter(Boolean);
  const err = validateFolderSegments(segments);
  if (err) return { ok: false, message: err };
  return { ok: true, storage: segments.join('/') };
}

/** Convert stored folder values back into repo-relative commit paths. */
function folderStorageToCommitPath(stored: string): FolderCommitPath {
  if (!stored) return { ok: true, path: '' };
  if (stored === '/' || stored === './' || stored === '.') return { ok: true, path: '' };

  const collapsed = stored.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  const stripped = collapsed.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!stripped) return { ok: true, path: '' };

  const segments = stripped.split('/').filter(Boolean);
  const err = validateFolderSegments(segments);
  if (err) return { ok: false, message: err };
  return { ok: true, path: segments.join('/') };
}

/** Fetch repos with a quick retry and mirror the minimal data back to the UI. */
async function listAndSendRepos(token: string): Promise<void> {
  await sleep(75); // pre-warm
  let repos = await ghListRepos(token);
  if (!repos.ok && /Failed to fetch|network error/i.test(repos.error || '')) {
    await sleep(200);
    repos = await ghListRepos(token);
  }
  if (repos.ok) {
    const minimal = repos.repos.map(r => ({
      full_name: r.full_name,
      default_branch: r.default_branch,
      private: !!r.private
    }));
    send({ type: 'GITHUB_REPOS', payload: { repos: minimal } });
  } else {
    send({ type: 'ERROR', payload: { message: `GitHub: Could not list repos: ${repos.error}` } });
    send({ type: 'GITHUB_REPOS', payload: { repos: [] } });
  }
}

/** Restore a remembered token (if any) and ping GitHub so the UI reflects reality. */
async function restoreGithubTokenAndVerify(): Promise<void> {
  try {
    const stored = await figma.clientStorage.getAsync('github_token_b64').catch(() => null);
    if (!stored || typeof stored !== 'string' || stored.length === 0) return;

    const decoded = decodeToken(stored);
    ghToken = decoded;

    const who = await ghGetUser(decoded);
    if (who.ok) {
      send({
        type: 'GITHUB_AUTH_RESULT',
        payload: { ok: true, login: who.user.login, name: who.user.name, remember: true }
      });
      await listAndSendRepos(decoded);
    } else {
      send({ type: 'ERROR', payload: { message: `GitHub: Authentication failed (stored token): ${who.error}.` } });
      send({
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
    if (msg.type === 'GITHUB_SET_TOKEN') {
      const token = String(msg.payload.token || '').trim();
      const remember = !!msg.payload.remember;

      if (!token) {
        send({ type: 'ERROR', payload: { message: 'GitHub: Empty token.' } });
        send({ type: 'GITHUB_AUTH_RESULT', payload: { ok: false, error: 'empty token', remember: false } });
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
        send({
          type: 'GITHUB_AUTH_RESULT',
          payload: { ok: true, login: who.user.login, name: who.user.name, remember }
        });
        await listAndSendRepos(token);
      } else {
        send({ type: 'ERROR', payload: { message: `GitHub: Authentication failed: ${who.error}.` } });
        send({
          type: 'GITHUB_AUTH_RESULT',
          payload: { ok: false, error: who.error, remember: false }
        });
        send({ type: 'GITHUB_REPOS', payload: { repos: [] } });
      }
      return;
    }

    if (msg.type === 'GITHUB_FORGET_TOKEN') {
      ghToken = null;
      await figma.clientStorage.deleteAsync('github_token_b64').catch(() => { /* ignore */ });
      send({ type: 'INFO', payload: { message: 'GitHub: Token cleared.' } });
      send({ type: 'GITHUB_AUTH_RESULT', payload: { ok: false, remember: false } });
      send({ type: 'GITHUB_REPOS', payload: { repos: [] } });
      return;
    }

    // ---------------- GitHub: selection persistence ----------------

    if (msg.type === 'GITHUB_SELECT_REPO') {
      const sel = await getSelected();
      await setSelected({
        owner: msg.payload.owner,
        repo: msg.payload.repo,
        branch: sel.branch,
        folder: undefined,
        commitMessage: sel.commitMessage,
        scope: sel.scope,
        collection: sel.collection,
        mode: sel.mode,
        createPr: sel.createPr,
        prBase: sel.prBase,
        prTitle: sel.prTitle,
        prBody: sel.prBody
      });
      return;
    }

    if (msg.type === 'GITHUB_SELECT_BRANCH') {
      const sel = await getSelected();
      // Clear folder when branch changes
      await setSelected({
        owner: msg.payload.owner || sel.owner,
        repo: msg.payload.repo || sel.repo,
        branch: msg.payload.branch,
        folder: undefined,
        commitMessage: sel.commitMessage,
        scope: sel.scope,
        collection: sel.collection,
        mode: sel.mode,
        createPr: sel.createPr,
        prBase: sel.prBase,
        prTitle: sel.prTitle,
        prBody: sel.prBody
      });
      return;
    }

    if (msg.type === 'GITHUB_SET_FOLDER') {
      const folderResult = normalizeFolderForStorage(String(msg.payload.folder ?? ''));
      if (!folderResult.ok) {
        send({ type: 'ERROR', payload: { message: folderResult.message } });
        return;
      }
      const folder = folderResult.storage;
      const sel = await getSelected();
      await setSelected({
        owner: msg.payload.owner || sel.owner,
        repo: msg.payload.repo || sel.repo,
        branch: sel.branch,
        folder,
        commitMessage: sel.commitMessage,
        scope: sel.scope,
        collection: sel.collection,
        mode: sel.mode,
        createPr: sel.createPr,
        prBase: sel.prBase,
        prTitle: sel.prTitle,
        prBody: sel.prBody
      });
      return;
    }

    if (msg.type === 'GITHUB_SAVE_STATE') {
      const update: Partial<GhSelected> = {};
      if (typeof msg.payload.owner === 'string') update.owner = msg.payload.owner;
      if (typeof msg.payload.repo === 'string') update.repo = msg.payload.repo;
      if (typeof msg.payload.branch === 'string') update.branch = msg.payload.branch;
      if (typeof msg.payload.folder === 'string') {
        const folderResult = normalizeFolderForStorage(msg.payload.folder);
        if (folderResult.ok) update.folder = folderResult.storage;
        else send({ type: 'ERROR', payload: { message: folderResult.message } });
      }
      if (typeof msg.payload.commitMessage === 'string') update.commitMessage = msg.payload.commitMessage;
      if (msg.payload.scope === 'all' || msg.payload.scope === 'selected') update.scope = msg.payload.scope;
      if (typeof msg.payload.collection === 'string') update.collection = msg.payload.collection;
      if (typeof msg.payload.mode === 'string') update.mode = msg.payload.mode;
      if (typeof msg.payload.createPr === 'boolean') update.createPr = msg.payload.createPr;
      if (typeof msg.payload.prBase === 'string') update.prBase = msg.payload.prBase;
      if (typeof msg.payload.prTitle === 'string') update.prTitle = msg.payload.prTitle;
      if (typeof msg.payload.prBody === 'string') update.prBody = msg.payload.prBody;
      await mergeSelected(update);
      return;
    }

    // ---------------- GitHub: branches (paging) ----------------
    if (msg.type === 'GITHUB_FETCH_BRANCHES') {
      const owner = String(msg.payload.owner || '');
      const repo = String(msg.payload.repo || '');
      const page = Number.isFinite(msg.payload.page) ? Number(msg.payload.page) : 1;
      const force = !!msg.payload.force;

      if (!ghToken) {
        send({ type: 'GITHUB_BRANCHES_ERROR', payload: { owner, repo, status: 401, message: 'No token' } });
        return;
      }

      const res = await ghListBranches(ghToken, owner, repo, page, force);
      if (res.ok) {
        send({ type: 'GITHUB_BRANCHES', payload: res });
        if (page === 1 && res.defaultBranch) {
          await mergeSelected({ owner, repo, branch: res.defaultBranch, prBase: res.defaultBranch });
        }
      } else {
        send({ type: 'GITHUB_BRANCHES_ERROR', payload: res });
      }
      return;
    }

    // ---------------- GitHub: folder list / ensure (TOP-LEVEL) ----------------

    if (msg.type === 'GITHUB_FOLDER_LIST') {
      const owner = String(msg.payload.owner || '');
      const repo = String(msg.payload.repo || '');
      const branch = String(msg.payload.branch || '');
      const pathRaw = String(msg.payload.path || '');

      if (!ghToken) {
        send({ type: 'GITHUB_FOLDER_LIST_RESULT', payload: { ok: false, owner, repo, branch, path: pathRaw, status: 401, message: 'No token' } });
        return;
      }

      const normalizedPath = normalizeFolderForStorage(pathRaw);
      if (!normalizedPath.ok) {
        send({ type: 'GITHUB_FOLDER_LIST_RESULT', payload: { ok: false, owner, repo, branch, path: pathRaw, status: 400, message: normalizedPath.message } });
        return;
      }
      const commitPathResult = folderStorageToCommitPath(normalizedPath.storage);
      if (!commitPathResult.ok) {
        send({ type: 'GITHUB_FOLDER_LIST_RESULT', payload: { ok: false, owner, repo, branch, path: pathRaw, status: 400, message: commitPathResult.message } });
        return;
      }

      const res = await ghListDirs(ghToken, owner, repo, branch, commitPathResult.path);
      if (res.ok) {
        send({
          type: 'GITHUB_FOLDER_LIST_RESULT',
          payload: {
            ok: true,
            owner,
            repo,
            branch,
            path: res.path,
            entries: res.dirs.map(d => ({ type: 'dir', name: d.name, path: d.path })),
            rate: res.rate
          }
        });
      } else {
        send({
          type: 'GITHUB_FOLDER_LIST_RESULT',
          payload: { ok: false, owner, repo, branch, path: res.path, status: res.status, message: res.message, rate: res.rate }
        });
      }
      return;
    }

    // NOTE: We keep this available but the UI does not call it to avoid extra commits.
    if (msg.type === 'GITHUB_CREATE_FOLDER') {
      const owner = String(msg.payload.owner || '');
      const repo = String(msg.payload.repo || '');
      const branch = String(msg.payload.branch || '');
      const folderPathRaw = String((msg.payload as any).folderPath || msg.payload.path || '').trim();

      if (!ghToken) {
        send({ type: 'GITHUB_CREATE_FOLDER_RESULT', payload: { ok: false, owner, repo, branch, folderPath: folderPathRaw, status: 401, message: 'No token' } });
        return;
      }

      const folderNormalized = normalizeFolderForStorage(folderPathRaw);
      if (!folderNormalized.ok) {
        send({ type: 'GITHUB_CREATE_FOLDER_RESULT', payload: { ok: false, owner, repo, branch, folderPath: folderPathRaw, status: 400, message: folderNormalized.message } });
        return;
      }

      const folderCommit = folderStorageToCommitPath(folderNormalized.storage);
      if (!folderCommit.ok) {
        send({ type: 'GITHUB_CREATE_FOLDER_RESULT', payload: { ok: false, owner, repo, branch, folderPath: folderPathRaw, status: 400, message: folderCommit.message } });
        return;
      }
      if (!folderCommit.path) {
        send({ type: 'GITHUB_CREATE_FOLDER_RESULT', payload: { ok: false, owner, repo, branch, folderPath: folderPathRaw, status: 400, message: 'GitHub: Choose a subfolder name.' } });
        return;
      }

      const res = await ghEnsureFolder(ghToken, owner, repo, branch, folderCommit.path);
      send({ type: 'GITHUB_CREATE_FOLDER_RESULT', payload: res });
      return;
    }

    // ---------------- GitHub: create branch ----------------
    if (msg.type === 'GITHUB_CREATE_BRANCH') {
      const owner = String(msg.payload.owner || '');
      const repo = String(msg.payload.repo || '');
      const baseBranch = String(msg.payload.baseBranch || '');
      const newBranch = String(msg.payload.newBranch || '');

      if (!ghToken) {
        send({ type: 'GITHUB_CREATE_BRANCH_RESULT', payload: { ok: false, owner, repo, baseBranch, newBranch, status: 401, message: 'No token' } });
        return;
      }
      if (!owner || !repo || !baseBranch || !newBranch) {
        send({ type: 'GITHUB_CREATE_BRANCH_RESULT', payload: { ok: false, owner, repo, baseBranch, newBranch, status: 400, message: 'Missing owner/repo/base/new' } });
        return;
      }

      const res = await ghCreateBranch(ghToken, owner, repo, newBranch, baseBranch);
      if (res.ok) {
        await mergeSelected({ owner, repo, branch: newBranch });
      }
      send({ type: 'GITHUB_CREATE_BRANCH_RESULT', payload: res });
      return;
    }

    if (msg.type === 'GITHUB_FETCH_TOKENS') {
      const owner = String(msg.payload.owner || '');
      const repo = String(msg.payload.repo || '');
      const branch = String(msg.payload.branch || '');
      const pathRaw = String(msg.payload.path || '');
      const allowHex = !!msg.payload.allowHexStrings;

      if (!ghToken) {
        send({ type: 'GITHUB_FETCH_TOKENS_RESULT', payload: { ok: false, owner, repo, branch, path: pathRaw, status: 401, message: 'No token' } });
        return;
      }
      if (!owner || !repo || !branch || !pathRaw.trim()) {
        send({ type: 'GITHUB_FETCH_TOKENS_RESULT', payload: { ok: false, owner, repo, branch, path: pathRaw, status: 400, message: 'Missing owner/repo/branch/path' } });
        return;
      }

      const normalizedPath = normalizeFolderForStorage(pathRaw);
      if (!normalizedPath.ok) {
        send({ type: 'GITHUB_FETCH_TOKENS_RESULT', payload: { ok: false, owner, repo, branch, path: pathRaw, status: 400, message: normalizedPath.message } });
        return;
      }
      const commitPathResult = folderStorageToCommitPath(normalizedPath.storage);
      if (!commitPathResult.ok) {
        send({ type: 'GITHUB_FETCH_TOKENS_RESULT', payload: { ok: false, owner, repo, branch, path: pathRaw, status: 400, message: commitPathResult.message } });
        return;
      }
      const path = commitPathResult.path;

      const res = await ghGetFileContents(ghToken, owner, repo, branch, path);
      if (!res.ok) {
        send({ type: 'GITHUB_FETCH_TOKENS_RESULT', payload: res });
        if (res.samlRequired) {
          send({ type: 'ERROR', payload: { message: 'GitHub: SSO required for this repository. Authorize your PAT and try again.' } });
        }
        return;
      }

      try {
        const json = JSON.parse(res.contentText || '{}');
        await importDtcg(json, { allowHexStrings: allowHex });
        send({ type: 'GITHUB_FETCH_TOKENS_RESULT', payload: { ok: true, owner, repo, branch, path, json } });
        send({ type: 'INFO', payload: { message: `Imported tokens from ${owner}/${repo}@${branch}:${path}` } });

        const snap = await snapshotCollectionsForUi();
        const last = await figma.clientStorage.getAsync('lastSelection').catch(() => null);
        const exportAllPrefVal = await figma.clientStorage.getAsync('exportAllPref').catch(() => false);
        const lastOrNull = last && typeof last.collection === 'string' && typeof last.mode === 'string' ? last : null;
        send({ type: 'COLLECTIONS_DATA', payload: { collections: snap.collections, last: lastOrNull, exportAllPref: !!exportAllPrefVal } });
        send({ type: 'RAW_COLLECTIONS_TEXT', payload: { text: snap.rawText } });
      } catch (err) {
        const msgText = (err as Error)?.message || 'Invalid JSON';
        send({ type: 'GITHUB_FETCH_TOKENS_RESULT', payload: { ok: false, owner, repo, branch, path, status: 422, message: msgText } });
        send({ type: 'ERROR', payload: { message: `GitHub import failed: ${msgText}` } });
      }
      return;
    }

    if (msg.type === 'GITHUB_EXPORT_FILES') {
      const scope: GithubScope = msg.payload.scope === 'all' ? 'all' : 'selected';
      const collection = String(msg.payload.collection || '');
      const mode = String(msg.payload.mode || '');

      try {
        if (scope === 'all') {
          const all = await exportDtcg({ format: 'single' });
          send({ type: 'GITHUB_EXPORT_FILES_RESULT', payload: { files: all.files } });
        } else {
          if (!collection || !mode) {
            send({ type: 'GITHUB_EXPORT_FILES_RESULT', payload: { files: [] } });
            send({ type: 'ERROR', payload: { message: 'GitHub: choose collection and mode before exporting.' } });
            return;
          }
          const per = await exportDtcg({ format: 'perMode' });
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
          const files = picked ? [picked] : per.files;
          send({ type: 'GITHUB_EXPORT_FILES_RESULT', payload: { files } });
        }
      } catch (err) {
        const msgText = (err as Error)?.message || 'Failed to export';
        send({ type: 'ERROR', payload: { message: `GitHub export failed: ${msgText}` } });
        send({ type: 'GITHUB_EXPORT_FILES_RESULT', payload: { files: [] } });
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

  if (msg.type === 'GITHUB_EXPORT_AND_COMMIT') {
    const owner = String(msg.payload.owner || '');
    const repo = String(msg.payload.repo || '');
    const baseBranch = String(msg.payload.branch || '');
    const folderRaw = typeof msg.payload.folder === 'string' ? msg.payload.folder : '';
    const folderTrimmed = folderRaw.trim();
    const commitMessage = (String(msg.payload.commitMessage || '') || 'Update tokens from Figma').trim();
    const scope: GithubScope = msg.payload.scope === 'all' ? 'all' : 'selected';
    const collection = String(msg.payload.collection || '');
    const mode = String(msg.payload.mode || '');
    const createPr = !!msg.payload.createPr;
    const prBaseBranch = createPr ? String(msg.payload.prBase || '') : '';
    const prTitle = String(msg.payload.prTitle || commitMessage).trim() || commitMessage;
    const prBody = typeof msg.payload.prBody === 'string' ? msg.payload.prBody : undefined;

    if (!ghToken) {
      send({ type: 'GITHUB_COMMIT_RESULT', payload: { ok: false, owner, repo, branch: baseBranch, status: 401, message: 'No token' } });
      return;
    }
    if (!owner || !repo || !baseBranch) {
      send({ type: 'GITHUB_COMMIT_RESULT', payload: { ok: false, owner, repo, branch: baseBranch, status: 400, message: 'Missing owner/repo/branch' } });
      return;
    }
    if (!commitMessage) {
      send({ type: 'GITHUB_COMMIT_RESULT', payload: { ok: false, owner, repo, branch: baseBranch, status: 400, message: 'Empty commit message' } });
      return;
    }
    if (!folderTrimmed) {
      send({ type: 'GITHUB_COMMIT_RESULT', payload: { ok: false, owner, repo, branch: baseBranch, status: 400, message: 'Pick a destination folder before exporting.' } });
      return;
    }

    const folderStoredResult = normalizeFolderForStorage(folderRaw);
    if (!folderStoredResult.ok) {
      send({ type: 'GITHUB_COMMIT_RESULT', payload: { ok: false, owner, repo, branch: baseBranch, status: 400, message: folderStoredResult.message } });
      return;
    }
    const folderStored = folderStoredResult.storage;
    const folderCommitResult = folderStorageToCommitPath(folderStored);
    if (!folderCommitResult.ok) {
      send({ type: 'GITHUB_COMMIT_RESULT', payload: { ok: false, owner, repo, branch: baseBranch, status: 400, message: folderCommitResult.message } });
      return;
    }
    const folderForCommit = folderCommitResult.path;
    if (createPr && !prBaseBranch) {
      send({ type: 'GITHUB_COMMIT_RESULT', payload: { ok: false, owner, repo, branch: baseBranch, status: 400, message: 'Unable to determine target branch for pull request.' } });
      return;
    }
    if (createPr && prBaseBranch === baseBranch) {
      send({ type: 'GITHUB_COMMIT_RESULT', payload: { ok: false, owner, repo, branch: baseBranch, status: 400, message: 'Selected branch matches PR target branch. Choose a different branch before creating a PR.' } });
      return;
    }

    await mergeSelected({
      owner,
      repo,
      branch: baseBranch,
      folder: folderStored,
      commitMessage,
      scope,
      collection: scope === 'selected' ? collection : undefined,
      mode: scope === 'selected' ? mode : undefined,
      createPr,
      prBase: createPr ? prBaseBranch : undefined,
      prTitle: createPr ? prTitle : undefined,
      prBody: createPr ? prBody : undefined
    });
    const branchForCommit = baseBranch;

    try {
      const files: Array<{ name: string; json: unknown }> = [];

      if (scope === 'all') {
        const all = await exportDtcg({ format: 'single' });
        for (const f of all.files) files.push({ name: f.name, json: f.json });
      } else {
        if (!collection || !mode) {
          send({ type: 'GITHUB_COMMIT_RESULT', payload: { ok: false, owner, repo, branch: baseBranch, status: 400, message: 'Pick a collection and a mode.' } });
          return;
        }
        const per = await exportDtcg({ format: 'perMode' });
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
          send({ type: 'GITHUB_COMMIT_RESULT', payload: { ok: false, owner, repo, branch: baseBranch, status: 404, message: `No export found for "${collection}" / "${mode}". Available: [${available}]` } });
          return;
        }
        files.push({ name: picked.name, json: picked.json });
      }

      const isPlainEmptyObject = (v: any) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0;
      const exportLooksEmpty = files.length === 0 || files.every(f => isPlainEmptyObject(f.json));

      if (exportLooksEmpty) {
        if (scope === 'selected') {
          const diag = await analyzeSelectionState(collection, mode);
          const tail = diag.ok
            ? `Found ${diag.variableCount} variable(s) in "${collection}", but ${diag.variablesWithValues ?? 0} with a value in "${mode}".`
            : (diag.message || 'No values present.');
          send({ type: 'GITHUB_COMMIT_RESULT', payload: { ok: false, owner, repo, branch: baseBranch, status: 412, message: `Export for "${collection}" / "${mode}" produced an empty tokens file. ${tail}` } });
        } else {
          send({ type: 'GITHUB_COMMIT_RESULT', payload: { ok: false, owner, repo, branch: baseBranch, status: 412, message: 'Export produced an empty tokens file. Ensure this file contains local Variables with values.' } });
        }
        return;
      }

      const prettyExportName = (original: string | undefined | null): string => {
        const name = (original && typeof original === 'string') ? original : 'tokens.json';
        const m = name.match(/^(.*)_mode=(.*)\.tokens\.json$/);
        if (m) return `${m[1].trim()} - ${m[2].trim()}.json`;
        return name.endsWith('.json') ? name : (name + '.json');
      };
      const prefix = folderForCommit ? (folderForCommit + '/') : '';
      const commitFiles = files.map(f => ({
        path: prefix + prettyExportName(f.name),
        content: JSON.stringify(f.json, null, 2) + '\n'
      }));

      const commitRes = await ghCommitFiles(ghToken, owner, repo, branchForCommit, commitMessage, commitFiles);
      if (!commitRes.ok) {
        send({ type: 'GITHUB_COMMIT_RESULT', payload: commitRes });
        send({ type: 'ERROR', payload: { message: `GitHub: Commit failed (${commitRes.status}): ${commitRes.message}` } });
        return;
      }

      let prResult: Awaited<ReturnType<typeof ghCreatePullRequest>> | undefined;
      if (createPr) {
        prResult = await ghCreatePullRequest(ghToken, owner, repo, {
          title: prTitle,
          head: branchForCommit,
          base: prBaseBranch,
          body: prBody
        });
      }

      const commitOkPayload = {
        ok: true as const,
        owner,
        repo,
        branch: branchForCommit,
        commitSha: commitRes.commitSha,
        commitUrl: commitRes.commitUrl,
        treeUrl: commitRes.treeUrl,
        rate: commitRes.rate,
        createdPr: (prResult && prResult.ok)
          ? { number: prResult.number, url: prResult.url, base: prResult.base, head: prResult.head }
          : undefined
      };
      send({ type: 'GITHUB_COMMIT_RESULT', payload: commitOkPayload });

      send({ type: 'INFO', payload: { message: `Committed ${commitFiles.length} file(s) to ${owner}/${repo}@${branchForCommit}` } });
      if (createPr) {
        if (prResult && prResult.ok) {
          send({ type: 'GITHUB_PR_RESULT', payload: prResult });
          send({ type: 'INFO', payload: { message: `PR created: ${prResult.url}` } });
        } else if (prResult) {
          send({ type: 'GITHUB_PR_RESULT', payload: prResult });
          send({ type: 'ERROR', payload: { message: `GitHub: PR creation failed (${prResult.status}): ${prResult.message}` } });
        }
      }
    } catch (e) {
      const msgText = (e as Error)?.message || 'unknown error';
      send({ type: 'GITHUB_COMMIT_RESULT', payload: { ok: false, owner, repo, branch: baseBranch, status: 0, message: msgText } });
    }
    return;
  }


};
