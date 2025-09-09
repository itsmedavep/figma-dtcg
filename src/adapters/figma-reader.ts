// src/adapters/figma-reader.ts
// Read Figma variables -> IR TokenGraph

import { figmaRGBAToDtcg, type DocumentProfile } from '../core/color';
import { canonicalPath } from '../core/normalize';
import { ctxKey, type TokenGraph, type TokenNode, type PrimitiveType, type ValueOrAlias } from '../core/ir';

function mapType(t: VariableResolvedDataType): PrimitiveType {
  if (t === 'COLOR') return 'color';
  if (t === 'FLOAT') return 'number';
  if (t === 'STRING') return 'string';
  return 'boolean';
}

function isAliasValue(v: unknown): v is { type: 'VARIABLE_ALIAS'; id: string } {
  return !!v && typeof v === 'object' && (v as { type?: string }).type === 'VARIABLE_ALIAS' && typeof (v as { id?: unknown }).id === 'string';
}

function isRGBA(v: unknown): v is { r: number; g: number; b: number; a: number } {
  return !!v && typeof v === 'object' &&
    typeof (v as { r?: unknown }).r === 'number' &&
    typeof (v as { g?: unknown }).g === 'number' &&
    typeof (v as { b?: unknown }).b === 'number' &&
    typeof (v as { a?: unknown }).a === 'number';
}

export async function readFigmaToIR(): Promise<TokenGraph> {
  var profile = (figma.root.documentColorProfile as DocumentProfile);
  var variablesApi = figma.variables;

  // Load collections
  var collections = await variablesApi.getLocalVariableCollectionsAsync();

  // Build a map variableId -> { name, collectionId }
  var varMeta: { [id: string]: { name: string; collectionId: string } } = {};
  var ci = 0;
  for (ci = 0; ci < collections.length; ci++) {
    var col = collections[ci];
    var vi = 0;
    for (vi = 0; vi < col.variableIds.length; vi++) {
      var id = col.variableIds[vi];
      var v = await variablesApi.getVariableByIdAsync(id);
      if (v) varMeta[v.id] = { name: v.name, collectionId: col.id };
    }
  }

  var tokens: TokenNode[] = [];

  for (ci = 0; ci < collections.length; ci++) {
    var c = collections[ci];
    var mi = 0;
    // Mode name lookup
    var modeNameById: { [id: string]: string } = {};
    for (mi = 0; mi < c.modes.length; mi++) modeNameById[c.modes[mi].modeId] = c.modes[mi].name;

    var vi2 = 0;
    for (vi2 = 0; vi2 < c.variableIds.length; vi2++) {
      var vid = c.variableIds[vi2];
      var v2 = await variablesApi.getVariableByIdAsync(vid);
      if (!v2) continue;

      var path = canonicalPath(c.name, v2.name);
      var type = mapType(v2.resolvedType);
      var byContext: { [ctx: string]: ValueOrAlias } = {};

      // For each mode, collect value
      var mi2 = 0;
      for (mi2 = 0; mi2 < c.modes.length; mi2++) {
        var md = c.modes[mi2];
        var ctx = ctxKey(c.name, md.name);
        var mv = v2.valuesByMode[md.modeId];

        if (isAliasValue(mv)) {
          var target = await variablesApi.getVariableByIdAsync(mv.id);
          if (target) {
            // resolve collection name for target
            var meta = varMeta[target.id];
            var collName = meta ? collections.filter(function (cc) { return cc.id === meta.collectionId; }).map(function (cc) { return cc.name; })[0] : c.name;
            var aPath = canonicalPath(collName, target.name);
            byContext[ctx] = { kind: 'alias', path: aPath };
          }
          continue;
        }

        if (type === 'color' && isRGBA(mv)) {
          var cv = figmaRGBAToDtcg({ r: mv.r, g: mv.g, b: mv.b, a: mv.a }, profile);
          byContext[ctx] = { kind: 'color', value: cv };
          continue;
        }

        if (typeof mv === 'number') { byContext[ctx] = { kind: 'number', value: mv }; continue; }
        if (typeof mv === 'boolean') { byContext[ctx] = { kind: 'boolean', value: mv }; continue; }
        if (typeof mv === 'string') { byContext[ctx] = { kind: 'string', value: mv }; continue; }
        // else unhandled null/undefined -> skip
      }

      tokens.push({ path: path, type: type, byContext: byContext });
    }
  }

  return { tokens: tokens };
}
