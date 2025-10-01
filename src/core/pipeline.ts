// src/core/pipeline.ts
// Pipeline glue between adapters and the UI.
// - importDtcg: DTCG JSON -> IR -> write to Figma
// - exportDtcg: read IR from Figma -> serialize to DTCG; package as files

import { normalize } from './normalize';
import { readDtcgToIR } from '../adapters/dtcg-reader';
import { serialize } from '../adapters/dtcg-writer';
import { readFigmaToIR } from '../adapters/figma-reader';
import { writeIRToFigma } from '../adapters/figma-writer';
import type { TokenGraph, TokenNode, ValueOrAlias } from './ir';

export interface ExportOpts { format: 'single' | 'perMode' }
export interface ExportResult { files: Array<{ name: string; json: unknown }> }

export interface ImportSummary {
  /** Total tokens parsed from the incoming file. */
  totalTokens: number;
  /** Tokens that remained after applying the selected contexts. */
  importedTokens: number;
  /** Every context discovered in the incoming file (Collection/Mode). */
  availableContexts: string[];
  /** Contexts actually written to the document after filtering. */
  appliedContexts: string[];
  /** Contexts that were intentionally skipped because they weren't selected. */
  skippedContexts: Array<{ context: string; reason: string }>;
  /** Contexts requested by the UI that did not exist in the incoming file. */
  missingRequestedContexts: string[];
  /** Raw contexts requested by the UI (before intersecting with available contexts). */
  selectionRequested: string[];
  /** True when the requested selection had no overlap and we fell back to all contexts. */
  selectionFallbackToAll?: boolean;
  /** Tokens that lost one or more contexts during filtering. */
  tokensWithRemovedContexts: Array<{
    path: string;
    removedContexts: string[];
    keptContexts: string[];
    reason: 'partial' | 'removed';
  }>;
}

// ---------- helpers ----------

export interface ImportOpts {
  allowHexStrings?: boolean;
  contexts?: string[];
}


/**
 * Capture the enumerable keys on a plain object without trusting prototype mutation.
 * We keep this helper local so the export path never depends on a broader utility module.
 */
function keysOf<T>(obj: { [k: string]: T }): string[] {
  var out: string[] = [];
  var k: string;
  for (k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) out.push(k);
  return out;
}

/**
 * Replace file-hostile characters so each export path is safe for Git commits on every OS.
 * Using a narrow allow list keeps legacy file names stable while preventing accidental nesting.
 */
const INVALID_FILE_CHARS = /[<>:"/\\|?*\u0000-\u001F]/g;

function sanitizeForFile(s: string): string {
  var cleaned = String(s);
  cleaned = cleaned.replace(INVALID_FILE_CHARS, '_');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  cleaned = cleaned.replace(/[. ]+$/g, '');
  return cleaned;
}

/**
 * Build a copy of a token that only contains the requested context so per-mode exports stay minimal.
 * Returning null when the context is absent lets the caller drop empty files entirely.
 */
function cloneTokenWithSingleContext(t: TokenNode, ctx: string): TokenNode | null {
  var val = t.byContext[ctx];
  if (!val) return null;

  // shallow clone without spreads
  var copyByCtx: { [k: string]: ValueOrAlias } = {};
  copyByCtx[ctx] = val;

  return {
    path: (function () { var arr: string[] = []; var i = 0; for (i = 0; i < t.path.length; i++) arr.push(t.path[i]); return arr; })(),
    type: t.type,
    byContext: copyByCtx,
    description: t.description,
    extensions: t.extensions
  };
}

function collectContextsFromGraph(graph: TokenGraph): string[] {
  var seen: string[] = [];
  var i = 0;
  for (i = 0; i < graph.tokens.length; i++) {
    var t = graph.tokens[i];
    var ks = keysOf(t.byContext);
    var j = 0;
    for (j = 0; j < ks.length; j++) {
      var ctx = ks[j];
      var already = false;
      var k = 0;
      for (k = 0; k < seen.length; k++) if (seen[k] === ctx) { already = true; break; }
      if (!already) seen.push(ctx);
    }
  }
  return seen;
}

function sanitizeContexts(list: string[] | undefined): string[] {
  if (!list) return [];
  var out: string[] = [];
  for (var i = 0; i < list.length; i++) {
    var raw = list[i];
    if (typeof raw !== 'string') continue;
    var trimmed = raw.trim();
    if (!trimmed) continue;
    var exists = false;
    for (var j = 0; j < out.length; j++) if (out[j] === trimmed) { exists = true; break; }
    if (!exists) out.push(trimmed);
  }
  return out;
}

function filterGraphByContexts(graph: TokenGraph, requested: string[]): { graph: TokenGraph; summary: ImportSummary } {
  var available = collectContextsFromGraph(graph);
  var requestedList = sanitizeContexts(requested);

  var availableSet: { [k: string]: true } = {};
  for (var ai = 0; ai < available.length; ai++) availableSet[available[ai]] = true;

  var appliedSet: { [k: string]: true } = {};
  var missingRequested: string[] = [];
  var fallbackToAll = false;

  if (requestedList.length > 0) {
    for (var ri = 0; ri < requestedList.length; ri++) {
      var ctx = requestedList[ri];
      if (availableSet[ctx]) appliedSet[ctx] = true;
      else missingRequested.push(ctx);
    }
    if (Object.keys(appliedSet).length === 0 && available.length > 0) {
      fallbackToAll = true;
      for (var ai2 = 0; ai2 < available.length; ai2++) appliedSet[available[ai2]] = true;
    }
  } else {
    for (var ai3 = 0; ai3 < available.length; ai3++) appliedSet[available[ai3]] = true;
  }

  var appliedList: string[] = [];
  for (var ctxKey in appliedSet) if (Object.prototype.hasOwnProperty.call(appliedSet, ctxKey)) appliedList.push(ctxKey);
  appliedList.sort();

  var skippedList: Array<{ context: string; reason: string }> = [];
  for (var si = 0; si < available.length; si++) {
    var ctxAvailable = available[si];
    if (!appliedSet[ctxAvailable]) {
      skippedList.push({ context: ctxAvailable, reason: 'Excluded by partial import selection' });
    }
  }
  skippedList.sort(function (a, b) {
    if (a.context === b.context) return 0;
    return a.context < b.context ? -1 : 1;
  });

  var filteredTokens: TokenNode[] = [];
  var removedTokens: Array<{ path: string; removedContexts: string[]; keptContexts: string[]; reason: 'partial' | 'removed' }> = [];

  for (var ti = 0; ti < graph.tokens.length; ti++) {
    var tok = graph.tokens[ti];
    var ctxs = keysOf(tok.byContext);
    if (ctxs.length === 0) {
      // Nothing to filter; keep token as-is (clone for safety).
      var cloneEmpty: TokenNode = {
        path: tok.path.slice(),
        type: tok.type,
        byContext: {}
      };
      if (typeof tok.description !== 'undefined') cloneEmpty.description = tok.description;
      if (typeof tok.extensions !== 'undefined') cloneEmpty.extensions = tok.extensions;
      filteredTokens.push(cloneEmpty);
      continue;
    }

    var kept: string[] = [];
    var removed: string[] = [];
    var newCtx: { [k: string]: ValueOrAlias } = {};

    for (var ci = 0; ci < ctxs.length; ci++) {
      var ctx = ctxs[ci];
      if (appliedSet[ctx]) {
        kept.push(ctx);
        newCtx[ctx] = tok.byContext[ctx];
      } else {
        removed.push(ctx);
      }
    }

    if (kept.length === 0) {
      removedTokens.push({
        path: tok.path.join('/'),
        removedContexts: removed.slice(),
        keptContexts: [],
        reason: 'removed'
      });
      continue;
    }

    if (removed.length > 0) {
      removedTokens.push({
        path: tok.path.join('/'),
        removedContexts: removed.slice(),
        keptContexts: kept.slice(),
        reason: 'partial'
      });
    }

    var clone: TokenNode = {
      path: tok.path.slice(),
      type: tok.type,
      byContext: newCtx
    };
    if (typeof tok.description !== 'undefined') clone.description = tok.description;
    if (typeof tok.extensions !== 'undefined') clone.extensions = tok.extensions;
    filteredTokens.push(clone);
  }

  removedTokens.sort(function (a, b) {
    if (a.path === b.path) return 0;
    return a.path < b.path ? -1 : 1;
  });

  return {
    graph: { tokens: filteredTokens },
    summary: {
      totalTokens: graph.tokens.length,
      importedTokens: filteredTokens.length,
      availableContexts: available.slice().sort(),
      appliedContexts: appliedList,
      skippedContexts: skippedList,
      missingRequestedContexts: missingRequested,
      selectionRequested: requestedList,
      selectionFallbackToAll: fallbackToAll ? true : undefined,
      tokensWithRemovedContexts: removedTokens
    }
  };
}

// ---------- API ----------

export async function importDtcg(json: unknown, opts: ImportOpts = {}): Promise<ImportSummary> {
  // Build desired graph from DTCG, then write directly to Figma.
  // We previously shipped an unused "plan" module that tried to diff the desired
  // graph against the live document. Nothing in the plugin ever called it, and
  // the write path already overwrites the full state, so keeping the unused
  // module only increased bundle size and maintenance cost. Keeping a single
  // happy-path write keeps the observable behavior identical to the versions
  // that shipped before the cleanup.
  const desired = normalize(readDtcgToIR(json, { allowHexStrings: !!opts.allowHexStrings }));
  const filtered = filterGraphByContexts(desired, opts.contexts || []);
  await writeIRToFigma(filtered.graph);
  return filtered.summary;
}


export async function exportDtcg(opts: ExportOpts): Promise<ExportResult> {
  var current = await readFigmaToIR();
  var graph = normalize(current);

  if (opts.format === 'single') {
    // One file with whatever contexts exist; writer will emit the first available per token.
    var single = serialize(graph);
    return { files: [{ name: 'tokens.json', json: single.json }] };
  }

  // Per mode: split graph by context "Collection/Mode", one file each.
  var contexts: string[] = [];
  var i = 0;
  for (i = 0; i < graph.tokens.length; i++) {
    var t = graph.tokens[i];
    var ks = keysOf(t.byContext);
    var j = 0;
    for (j = 0; j < ks.length; j++) {
      var c = ks[j];
      // push if unique
      var found = false;
      var k = 0;
      for (k = 0; k < contexts.length; k++) if (contexts[k] === c) { found = true; break; }
      if (!found) contexts.push(c);
    }
  }

  // Build a file per context
  var files: Array<{ name: string; json: unknown }> = [];
  var ci = 0;
  for (ci = 0; ci < contexts.length; ci++) {
    var ctx = contexts[ci];

    // Create a filtered graph where each token only carries this ctx (if present)
    var filtered: TokenGraph = { tokens: [] };
    var ii = 0;
    for (ii = 0; ii < graph.tokens.length; ii++) {
      var tok = graph.tokens[ii];
      var one = cloneTokenWithSingleContext(tok, ctx);
      if (one) filtered.tokens.push(one);
    }

    // If nothing in this context, skip
    if (filtered.tokens.length === 0) continue;

    var out = serialize(filtered);

    // ctx format is "Collection/Mode"
    var slash = ctx.indexOf('/');
    var collection = slash >= 0 ? ctx.substring(0, slash) : ctx;
    var mode = slash >= 0 ? ctx.substring(slash + 1) : 'default';

    var fname = sanitizeForFile(collection) + '_mode=' + sanitizeForFile(mode) + '.tokens.json';
    files.push({ name: fname, json: out.json });
  }

  // Fallback: if no contexts were found, still emit a single file
  if (files.length === 0) {
    var fallback = serialize(graph);
    files.push({ name: 'tokens.json', json: fallback.json });
  }

  return { files: files };
}

export { sanitizeForFile };
