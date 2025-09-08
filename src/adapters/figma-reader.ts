import type { TokenGraph, TokenNode, ValueOrAlias } from '../core/ir';
import { ctxKey, tokenNameFromPath } from '../core/ir';
import { figmaColorToIR } from '../figma/variables';

export async function snapshot(): Promise<TokenGraph> {
  const tokens: TokenNode[] = [];
  const collections = figma.variables.getLocalVariableCollections();

  for (let ci = 0; ci < collections.length; ci++) {
    const c = collections[ci];

    for (let vi = 0; vi < c.variableIds.length; vi++) {
      const vid = c.variableIds[vi];
      const v = figma.variables.getVariableById(vid);
      if (!v) continue;

      const path = v.name.split('/');
      const type = mapType(v.resolvedType);

      const byContext: Record<string, ValueOrAlias> = {};
      for (let mi = 0; mi < c.modes.length; mi++) {
        const m = c.modes[mi];
        const ctx = ctxKey(c.name, m.name);
        const mv = v.valuesByMode[m.modeId];

        // Alias
        if (isAliasValue(mv)) {
          const target = figma.variables.getVariableById(mv.id);
          if (target) {
            byContext[ctx] = {
              kind: 'alias',
              path: tokenNameFromPath(target.name.split('/')),
            };
          }
          continue;
        }

        // Color (RGBA object)
        if (isRGBA(mv)) {
          byContext[ctx] = { kind: 'color', value: figmaColorToIR({ r: mv.r, g: mv.g, b: mv.b, a: mv.a }) };
          continue;
        }

        // Number / Boolean / String
        if (typeof mv === 'number') {
          byContext[ctx] = { kind: 'number', value: mv };
          continue;
        }
        if (typeof mv === 'boolean') {
          byContext[ctx] = { kind: 'boolean', value: mv };
          continue;
        }
        if (typeof mv === 'string') {
          byContext[ctx] = { kind: 'string', value: mv };
          continue;
        }

        // Unhandled: leave empty for this mode
      }

      tokens.push({ path, type, byContext });
    }
  }

  return { tokens };
}

function mapType(t: VariableResolvedDataType): 'color' | 'number' | 'string' | 'boolean' {
  switch (t) {
    case 'COLOR': return 'color';
    case 'STRING': return 'string';
    case 'BOOLEAN': return 'boolean';
    case 'FLOAT': return 'number';
    default: return 'string';
  }
}

/** Narrow to a plain object (no arrays/functions) */
function isObject(o: unknown): o is Record<string, unknown> {
  return typeof o === 'object' && o !== null;
}

/** Figma alias value: { type: 'VARIABLE_ALIAS', id: string } */
function isAliasValue(v: unknown): v is { type: 'VARIABLE_ALIAS'; id: string } {
  if (!isObject(v)) return false;
  if (!('type' in v) || !('id' in v)) return false;
  const t = (v as Record<string, unknown>)['type'];
  const id = (v as Record<string, unknown>)['id'];
  return typeof t === 'string' && t === 'VARIABLE_ALIAS' && typeof id === 'string';
}

/** RGBA value stored by Variables: { r:number, g:number, b:number, a:number } */
function isRGBA(v: unknown): v is { r: number; g: number; b: number; a: number } {
  if (!isObject(v)) return false;
  const r = (v as Record<string, unknown>)['r'];
  const g = (v as Record<string, unknown>)['g'];
  const b = (v as Record<string, unknown>)['b'];
  const a = (v as Record<string, unknown>)['a'];
  return typeof r === 'number' && typeof g === 'number' && typeof b === 'number' && typeof a === 'number';
}
