// src/adapters/figma-reader.ts
import type { TokenGraph, TokenNode, ValueOrAlias } from '../core/ir';
import { ctxKey } from '../core/ir';

type VariablesAPI = typeof figma.variables & {
  getLocalVariableCollectionsAsync?: () => Promise<VariableCollection[]>;
  getVariableCollectionByIdAsync?: (id: string) => Promise<VariableCollection | null>;
  getVariableByIdAsync?: (id: string) => Promise<Variable | null>;
};

function mapType(rt: string): 'color' | 'number' | 'boolean' | 'string' {
  // Figma Variable.resolvedType is one of: 'COLOR' | 'FLOAT' | 'BOOLEAN' | 'STRING'
  if (rt === 'COLOR') return 'color';
  if (rt === 'FLOAT') return 'number';
  if (rt === 'BOOLEAN') return 'boolean';
  return 'string';
}

function isAliasValue(v: unknown): v is { type: string; id: string } {
  return typeof v === 'object' && v !== null &&
    (v as any).type === 'VARIABLE_ALIAS' &&
    typeof (v as any).id === 'string';
}

function isRGBA(v: unknown): v is { r: number; g: number; b: number; a: number } {
  if (typeof v !== 'object' || v === null) return false;
  var o: any = v;
  return typeof o.r === 'number' && typeof o.g === 'number' &&
    typeof o.b === 'number' && typeof o.a === 'number';
}

// Keep this near the top of the file, with the other helpers.
type SrgbComponents = [number, number, number];
type SrgbColorValue = { colorSpace: 'srgb'; components: SrgbComponents; alpha: number };

function figmaColorToIR(c: { r: number; g: number; b: number; a: number }): SrgbColorValue {
  const comps: SrgbComponents = [c.r, c.g, c.b];
  // SRGB typed as the string literal 'srgb' (no "as" needed)
  const SRGB: 'srgb' = 'srgb';
  return { colorSpace: SRGB, components: comps, alpha: c.a };
}

export async function snapshot(): Promise<TokenGraph> {
  const tokens: TokenNode[] = [];

  const vars = figma.variables as VariablesAPI;

  // 1) Get collections (async preferred)
  let collections: VariableCollection[] = [];
  if (typeof vars.getLocalVariableCollectionsAsync === 'function' && vars.getLocalVariableCollectionsAsync) {
    collections = await vars.getLocalVariableCollectionsAsync();
  } else {
    // Fallback to deprecated sync API
    collections = vars.getLocalVariableCollections();
    // If you want to re-hydrate via async by id, you could do it here,
    // but most data we need is already on the collection object.
  }

  // 2) Walk collections, variables, modes
  let ci: number;
  for (ci = 0; ci < collections.length; ci++) {
    const c = collections[ci];
    if (!c) continue;

    let vi: number;
    for (vi = 0; vi < c.variableIds.length; vi++) {
      const vid = c.variableIds[vi];

      // Get variable (async preferred)
      let v: Variable | null = null;
      if (typeof vars.getVariableByIdAsync === 'function' && vars.getVariableByIdAsync) {
        v = await vars.getVariableByIdAsync(vid);
      } else {
        v = vars.getVariableById(vid);
      }
      if (!v) continue;

      const path = v.name.split('/');
      const type = mapType(v.resolvedType);

      const byContext: Record<string, ValueOrAlias> = {};
      let mi: number;
      for (mi = 0; mi < c.modes.length; mi++) {
        const m = c.modes[mi];
        const ctx = ctxKey(c.name, m.name);
        const mv = v.valuesByMode[m.modeId];

        // Alias
        if (isAliasValue(mv)) {
          // Resolve the alias's target to build a stable path string
          let target: Variable | null = null;
          if (typeof vars.getVariableByIdAsync === 'function' && vars.getVariableByIdAsync) {
            target = await vars.getVariableByIdAsync(mv.id);
          } else {
            target = vars.getVariableById(mv.id);
          }
          if (target) {
            byContext[ctx] = {
              kind: 'alias',
              // Use the canonical slash-separated variable name as path
              path: target.name
            };
          }
          continue;
        }

        // Color
        if (isRGBA(mv)) {
          byContext[ctx] = { kind: 'color', value: figmaColorToIR({ r: mv.r, g: mv.g, b: mv.b, a: mv.a }) };
          continue;
        }

        // Number / Boolean / String
        if (typeof mv === 'number') { byContext[ctx] = { kind: 'number', value: mv }; continue; }
        if (typeof mv === 'boolean') { byContext[ctx] = { kind: 'boolean', value: mv }; continue; }
        if (typeof mv === 'string') { byContext[ctx] = { kind: 'string', value: mv }; continue; }

        // Unhandled: leave empty for this mode
      }

      tokens.push({ path: path, type: type, byContext: byContext });
    }
  }

  return { tokens: tokens };
}
