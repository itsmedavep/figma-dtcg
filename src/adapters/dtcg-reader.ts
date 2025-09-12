// src/adapters/dtcg-reader.ts
// DTCG JSON -> IR TokenGraph (handles aliases, strict $type, preserves names)

import {
  type TokenGraph,
  type TokenNode,
  type PrimitiveType,
  type ValueOrAlias,
} from '../core/ir';

// ---------- color parsing (strict) ----------
import { hexToDtcgColor, isDtcgColorShapeValid } from '../core/color';

// ---------- lightweight logging (no toasts) ----------
function logInfo(msg: string) {
  try { figma.ui?.postMessage({ type: 'INFO', payload: { message: msg } }); } catch { /* ignore */ }
}
function logWarn(msg: string) { logInfo('Warning: ' + msg); }

// ---------- helpers ----------
function hasKey(o: unknown, k: string): boolean {
  return !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
}

function isAliasString(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith('{') && v.endsWith('}') && v.length > 2;
}

function parseAliasToSegments(v: string): string[] {
  // exact segments, keep spacing/punctuation as-is (only trim around the dot delimiter)
  return v.slice(1, -1).split('.').map(s => s.trim());
}

function isLikelyHexString(v: unknown): v is string {
  return typeof v === 'string'
    && /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v.trim());
}

/**
 * Strict color parser:
 * - Accept objects only if shape is valid (supported colorSpace, 3 numeric components, alpha number in [0..1] or undefined).
 * - Do NOT accept strings (e.g., "#112233"): those are rejected to enforce DTCG color object shape.
 * - Do NOT coerce types (e.g., alpha:"1" stays string -> rejected by validator).
 */
function readColorValueStrict(raw: unknown): any | null {
  // Reject all string forms (including hex); require color OBJECT per policy.
  if (typeof raw === 'string') {
    return null;
  }

  // Object form (no coercion)
  if (raw && typeof raw === 'object') {
    const obj = raw as any;
    const candidate: any = {
      ...(typeof obj.colorSpace === 'string' ? { colorSpace: obj.colorSpace } : {}),
      ...(Array.isArray(obj.components) ? { components: obj.components.slice(0, 3) } : {}),
      ...(('alpha' in obj) ? { alpha: obj.alpha } : {}),
      ...(typeof obj.hex === 'string' ? { hex: obj.hex } : {})
    };

    const shape = isDtcgColorShapeValid(candidate);
    if (!shape.ok) return null;
    return candidate;
  }

  return null;
}

/**
 * Compute IR path and ctx for a token based on:
 *  - $extensions.com.figma.modeName (if present, use EXACT string)
 *  - otherwise the JSON group path literally (no normalization)
 *  - default Figma mode when missing = "Mode 1"
 */
function computePathAndCtx(path: string[], obj: unknown): { irPath: string[]; ctx: string } {
  const irPath = path.slice(); // EXACT JSON path
  let mode = 'Mode 1';
  const ext = hasKey(obj, '$extensions') ? (obj as any)['$extensions'] as Record<string, unknown> : undefined;
  const cf = ext && typeof ext === 'object' ? (ext as any)['com.figma'] : undefined;
  if (cf && typeof cf === 'object' && typeof (cf as any).modeName === 'string') {
    mode = (cf as any).modeName as string;
  }
  const collection = irPath[0] ?? 'Tokens';
  return { irPath, ctx: `${collection}/${mode}` };
}

function guessTypeFromValue(v: unknown): PrimitiveType {
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'string') return 'string';
  return 'string';
}

export function readDtcgToIR(root: unknown): TokenGraph {
  const tokens: TokenNode[] = [];

  function visit(obj: unknown, path: string[], inheritedType: PrimitiveType | null): void {
    if (!obj || typeof obj !== 'object') return;

    // group-level $type inheritance (DTCG)
    let groupType: PrimitiveType | null = inheritedType;
    if (hasKey(obj, '$type') && typeof (obj as any).$type === 'string') {
      const t = String((obj as any).$type);
      if (t === 'color' || t === 'number' || t === 'string' || t === 'boolean') {
        groupType = t as PrimitiveType;
      }
    }

    // Token node?
    if (hasKey(obj, '$value')) {
      const rawVal = (obj as any).$value;

      // Aliases are always strings of the form {a.b.c}
      if (isAliasString(rawVal)) {
        const segs = parseAliasToSegments(rawVal);
        const { irPath, ctx } = computePathAndCtx(path, obj);
        const byCtx: { [k: string]: ValueOrAlias } = {};
        byCtx[ctx] = { kind: 'alias', path: segs };

        tokens.push({
          path: irPath,
          type: groupType ?? 'string',
          byContext: byCtx,
          ...(hasKey(obj, '$extensions') ? { extensions: (obj as any)['$extensions'] as Record<string, unknown> } : {})
        });
        return;
      }

      // Colors: ONLY when $type (inherited or local) is 'color'
      if (groupType === 'color') {
        const parsed = readColorValueStrict(rawVal);
        const { irPath, ctx } = computePathAndCtx(path, obj);

        if (!parsed) {
          logWarn(
            `Skipped invalid color for “${irPath.join('/')}” — expected a DTCG color object ` +
            `(srgb/display-p3, 3 numeric components, optional numeric alpha in [0..1]); strings like "#RRGGBB" are not accepted.`
          );
          return;
        }


        const byCtx: { [k: string]: ValueOrAlias } = {};
        byCtx[ctx] = { kind: 'color', value: parsed };

        tokens.push({
          path: irPath,
          type: 'color',
          byContext: byCtx,
          ...(hasKey(obj, '$extensions') ? { extensions: (obj as any)['$extensions'] as Record<string, unknown> } : {})
        });
        return;
      }

      // Primitives (respect declared type; no color coercion here)
      const t2: PrimitiveType = groupType ?? guessTypeFromValue(rawVal);
      let valObj: ValueOrAlias | null = null;

      if (t2 === 'number' && typeof rawVal === 'number') {
        valObj = { kind: 'number', value: rawVal };
      } else if (t2 === 'boolean' && typeof rawVal === 'boolean') {
        valObj = { kind: 'boolean', value: rawVal };
      } else if (t2 === 'string' && typeof rawVal === 'string') {
        valObj = { kind: 'string', value: rawVal };
      } else {
        // Fallback: minimally coerce by JS type (but still never to color)
        if (typeof rawVal === 'string') valObj = { kind: 'string', value: rawVal };
        else if (typeof rawVal === 'number') valObj = { kind: 'number', value: rawVal };
        else if (typeof rawVal === 'boolean') valObj = { kind: 'boolean', value: rawVal };
      }

      if (valObj) {
        const { irPath, ctx } = computePathAndCtx(path, obj);
        const byCtx: { [k: string]: ValueOrAlias } = {};
        byCtx[ctx] = valObj;

        tokens.push({
          path: irPath,
          type: t2,
          byContext: byCtx,
          ...(hasKey(obj, '$extensions') ? { extensions: (obj as any)['$extensions'] as Record<string, unknown> } : {})
        });
      }
      return;
    }

    // Group: recurse children with *exact* key names (no slugging/canonicalization)
    for (const k in obj as Record<string, unknown>) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      if (k.startsWith('$')) continue; // skip metadata keys
      const child = (obj as Record<string, unknown>)[k];
      const newPath = path.concat([k]); // preserve key *exactly*
      visit(child, newPath, groupType);
    }
  }

  visit(root, [], null);
  return { tokens };
}
