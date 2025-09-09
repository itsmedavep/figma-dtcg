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
  const profile = (figma.root.documentColorProfile as DocumentProfile);
  const variablesApi = figma.variables;

  // Load collections
  const collections = await variablesApi.getLocalVariableCollectionsAsync();

  // Build a map variableId -> { name, collectionId }
  const varMeta: { [id: string]: { name: string; collectionId: string } } = {};
  for (let ci = 0; ci < collections.length; ci++) {
    const col = collections[ci];
    for (let vi = 0; vi < col.variableIds.length; vi++) {
      const id = col.variableIds[vi];
      const v = await variablesApi.getVariableByIdAsync(id);
      if (v) varMeta[v.id] = { name: v.name, collectionId: col.id };
    }
  }

  const tokens: TokenNode[] = [];

  for (let ci = 0; ci < collections.length; ci++) {
    const c = collections[ci];

    // Mode name lookup
    const modeNameById: { [id: string]: string } = {};
    for (let mi = 0; mi < c.modes.length; mi++) modeNameById[c.modes[mi].modeId] = c.modes[mi].name;

    for (let vi2 = 0; vi2 < c.variableIds.length; vi2++) {
      const vid = c.variableIds[vi2];
      const v2 = await variablesApi.getVariableByIdAsync(vid);
      if (!v2) continue;

      const path = canonicalPath(c.name, v2.name);
      const type = mapType(v2.resolvedType);
      const byContext: { [ctx: string]: ValueOrAlias } = {};

      // NEW: collect per-context figma metadata we’ll store under $extensions.org.figma.perContext
      const perContext: {
        [ctx: string]: {
          collectionName: string; collectionID: string;
          modeName: string; modeID: string;
          variableName: string; variableID: string;
        }
      } = {};

      // For each mode, collect value
      for (let mi2 = 0; mi2 < c.modes.length; mi2++) {
        const md = c.modes[mi2];
        const ctx = ctxKey(c.name, md.name);
        const mv = v2.valuesByMode[md.modeId];

        // Always record per-context figma metadata
        perContext[ctx] = {
          collectionName: c.name,
          collectionID: c.id,
          modeName: md.name,
          modeID: md.modeId,
          variableName: v2.name,
          variableID: v2.id,
        };

        if (isAliasValue(mv)) {
          const target = await variablesApi.getVariableByIdAsync(mv.id);
          if (target) {
            // resolve collection name for target
            const meta = varMeta[target.id];
            const collName =
              meta
                ? collections.find(cc => cc.id === meta.collectionId)?.name || c.name
                : c.name;
            const aPath = canonicalPath(collName, target.name);
            byContext[ctx] = { kind: 'alias', path: aPath };
          }
          continue;
        }

        if (type === 'color' && isRGBA(mv)) {
          const cv = figmaRGBAToDtcg({ r: mv.r, g: mv.g, b: mv.b, a: mv.a }, profile);
          byContext[ctx] = { kind: 'color', value: cv };
          continue;
        }

        if (typeof mv === 'number') { byContext[ctx] = { kind: 'number', value: mv }; continue; }
        if (typeof mv === 'boolean') { byContext[ctx] = { kind: 'boolean', value: mv }; continue; }
        if (typeof mv === 'string') { byContext[ctx] = { kind: 'string', value: mv }; continue; }
        // else unhandled null/undefined -> skip
      }

      const token: TokenNode = {
        path,
        type,
        byContext,
        // NEW: attach $extensions payload so it shows in preview and exports
        extensions: {
          'com.figma': { perContext }
        }
      };

      tokens.push(token);
    }
  }

  return { tokens };
}
