// src/adapters/figma-reader.ts
// Convert live Figma variables into the IR token graph shape used everywhere else.
// - Preserves canonical path splitting for consistent lookups
// - Captures per-mode metadata so exports can round-trip Figma specifics

import { figmaRGBAToDtcg, type DocumentProfile } from '../core/color';
import { canonicalPath } from '../core/normalize';
import { loadCollectionsSnapshot } from '../core/figma-cache';
import { ctxKey, type TokenGraph, type TokenNode, type PrimitiveType, type ValueOrAlias } from '../core/ir';

/** Translate Figma's resolved type into the primitive kinds our IR expects. */
function mapType(t: VariableResolvedDataType): PrimitiveType {
  if (t === 'COLOR') return 'color';
  if (t === 'FLOAT') return 'number';
  if (t === 'STRING') return 'string';
  return 'boolean';
}

/** Guard for Figma alias payloads so we can branch without optional chaining chains. */
function isAliasValue(v: unknown): v is { type: 'VARIABLE_ALIAS'; id: string } {
  return !!v && typeof v === 'object' && (v as { type?: string }).type === 'VARIABLE_ALIAS' && typeof (v as { id?: unknown }).id === 'string';
}

/** Guard raw color values while staying defensive about nullish placeholders. */
function isRGBA(v: unknown): v is { r: number; g: number; b: number; a: number } {
  return !!v && typeof v === 'object' &&
    typeof (v as { r?: unknown }).r === 'number' &&
    typeof (v as { g?: unknown }).g === 'number' &&
    typeof (v as { b?: unknown }).b === 'number' &&
    typeof (v as { a?: unknown }).a === 'number';
}

/**
 * Snapshot every local variable into TokenGraph form while annotating per-mode metadata.
 * We favor direct reads from figma.variables so the IR mirrors whatever is live in the document.
 */
export async function readFigmaToIR(): Promise<TokenGraph> {
  const profile = figma.root.documentColorProfile as DocumentProfile;
  const variablesApi = figma.variables;

  const { collections, variablesById, collectionNameById } = await loadCollectionsSnapshot(variablesApi);

  const tokens: TokenNode[] = [];

  for (const c of collections) {
    // Mode name lookup
    const modeNameById: { [id: string]: string } = {};
    for (const m of c.modes) modeNameById[m.modeId] = m.name;

    for (const vid of c.variableIds) {
      const v2 = variablesById.get(vid) || await variablesApi.getVariableByIdAsync(vid);
      if (v2 && !variablesById.has(vid)) variablesById.set(vid, v2);
      if (!v2) continue;

      // ***** CRITICAL: always split variable name by '/' into path segments *****
      const path = canonicalPath(c.name, v2.name);

      const type = mapType(v2.resolvedType);
      const byContext: { [ctx: string]: ValueOrAlias } = {};

      // Collect per-context figma metadata (stored under $extensions.com.figma.perContext)
      const perContext: {
        [ctx: string]: {
          collectionName: string; collectionID: string;
          modeName: string; modeID: string;
          variableName: string; variableID: string;
        }
      } = {};

      // For each mode, collect value
      for (const md of c.modes) {
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
          const target = variablesById.get(mv.id) || await variablesApi.getVariableByIdAsync(mv.id);
          if (target && !variablesById.has(target.id)) variablesById.set(target.id, target);
          if (target) {
            const collName = collectionNameById.get(target.variableCollectionId) || c.name;
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

      const figmaExt: Record<string, unknown> = { perContext };
      if (type === 'boolean') {
        // Hint for round-tripping booleans while staying DTCG-compliant ("string" on write)
        figmaExt['variableType'] = 'BOOLEAN';
      }

      const token: TokenNode = {
        path,
        type,
        byContext,
        ...(v2.description && v2.description.length > 0 ? { description: v2.description } : {}),
        extensions: {
          'com.figma': figmaExt
        }
      };

      tokens.push(token);
    }
  }

  return { tokens };
}
