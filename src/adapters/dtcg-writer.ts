// src/adapters/dtcg-writer.ts
// IR -> DTCG object (grouped), including aliases and color values.

import { type TokenGraph, type TokenNode } from '../core/ir';
import { toAliasString } from '../core/normalize';

export interface SerializeResult {
  json: unknown;
}
export interface ExportOpts {
  // reserved for future (e.g., filename templates, grouping strategy)
}

export function serialize(graph: TokenGraph, _opts?: ExportOpts): SerializeResult {
  var root: { [k: string]: unknown } = {};

  var i = 0;
  for (i = 0; i < graph.tokens.length; i++) {
    var t = graph.tokens[i];
    writeTokenInto(root, t);
  }

  return { json: root };
}

function writeTokenInto(root: { [k: string]: unknown }, t: TokenNode): void {
  // Build groups
  var obj = root;
  var i = 0;
  for (i = 0; i < t.path.length - 1; i++) {
    var seg = t.path[i];
    var next = obj[seg];
    if (!next || typeof next !== 'object') {
      next = {};
      obj[seg] = next;
    }
    obj = next as { [k: string]: unknown };
  }

  var leaf = t.path[t.path.length - 1];
  var tokenObj: { [k: string]: unknown } = {};
  tokenObj['$type'] = t.type;

  // Choose a single context to emit; DTCG doesn't encode "modes".
  // We pick the first defined value.
  var ctxKeys = keysOf(t.byContext);
  var chosen = ctxKeys.length > 0 ? t.byContext[ctxKeys[0]] : null;

  if (chosen) {
    if (chosen.kind === 'alias') {
      tokenObj['$value'] = toAliasString(chosen.path);
    } else if (chosen.kind === 'color') {
      var cv = chosen.value;
      var out: { [k: string]: unknown } = {};
      out['colorSpace'] = cv.colorSpace;
      out['components'] = [cv.components[0], cv.components[1], cv.components[2]];
      if (typeof cv.alpha === 'number') out['alpha'] = cv.alpha;
      if (typeof cv.hex === 'string') out['hex'] = cv.hex;
      tokenObj['$value'] = out;
    } else if (chosen.kind === 'number') {
      tokenObj['$value'] = chosen.value;
    } else if (chosen.kind === 'string') {
      tokenObj['$value'] = chosen.value;
    } else if (chosen.kind === 'boolean') {
      tokenObj['$value'] = chosen.value;
    }
  }

  if (t.description) tokenObj['$description'] = t.description;
  if (t.extensions) tokenObj['$extensions'] = t.extensions;

  obj[leaf] = tokenObj;
}

function keysOf<T>(o: { [k: string]: T }): string[] {
  var out: string[] = [];
  var k: string;
  for (k in o) if (Object.prototype.hasOwnProperty.call(o, k)) out.push(k);
  return out;
}
