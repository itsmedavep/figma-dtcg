// src/core/pipeline.ts
// Pipeline glue between adapters and the UI.
// - importDtcg: DTCG JSON -> IR -> write to Figma
// - exportDtcg: read IR from Figma -> serialize to DTCG; package as files

import { normalize } from './normalize';
import { toDot } from './normalize';
import { readDtcgToIR } from '../adapters/dtcg-reader';
import { serialize } from '../adapters/dtcg-writer';
import { readFigmaToIR } from '../adapters/figma-reader';
import { writeIRToFigma } from '../adapters/figma-writer';
import type { TokenGraph, TokenNode, ValueOrAlias } from './ir';

export interface ExportOpts { format: 'single' | 'perMode' }
export interface ExportResult { files: Array<{ name: string; json: unknown }> }

// ---------- helpers ----------

function keysOf<T>(obj: { [k: string]: T }): string[] {
  var out: string[] = [];
  var k: string;
  for (k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) out.push(k);
  return out;
}

function sanitizeForFile(s: string): string {
  var out = '';
  var i = 0;
  for (i = 0; i < s.length; i++) {
    var ch = s.charAt(i);
    if (ch === '/' || ch === '\\' || ch === ':') out += '_';
    else out += ch;
  }
  return out;
}

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

// ---------- API ----------

export async function importDtcg(json: unknown): Promise<void> {
  // Build desired graph from DTCG, then write directly to Figma.
  // (Diffing/plan is optional; we keep a single code path for now.)
  var desired = normalize(readDtcgToIR(json));
  await writeIRToFigma(desired);
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
