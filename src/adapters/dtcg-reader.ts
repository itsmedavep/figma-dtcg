// src/adapters/dtcg-reader.ts
// DTCG JSON -> IR TokenGraph (handles aliases, strict $type, preserves names)

import {
  type TokenGraph,
  type TokenNode,
  type PrimitiveType,
  type ValueOrAlias,
  ctxKey,
  type ColorValue
} from '../core/ir';
import { hexToDtcgColor, isDtcgColorInUnitRange } from '../core/color';

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

function toNumber(x: unknown, def: number): number {
  return typeof x === 'number' ? x : def;
}

function parseColorSpaceUnion(x: unknown): 'srgb' | 'display-p3' {
  if (x === 'display-p3') return 'display-p3';
  return 'srgb';
}

function isColorObject(obj: unknown): obj is { colorSpace?: string; components?: number[]; alpha?: number; hex?: string } {
  if (!obj || typeof obj !== 'object') return false;
  const o = obj as any;
  return (
    typeof o.colorSpace === 'string' ||
    (Array.isArray(o.components) && o.components.length >= 3) ||
    typeof o.hex === 'string'
  );
}

function readColorValue(raw: unknown): ColorValue | null {
  // Only call this after we've decided it *should* be a color.
  if (typeof raw === 'string') {
    if (!isLikelyHexString(raw)) return null;
    try {
      return hexToDtcgColor(raw);
    } catch {
      return null;
    }
  }
  const obj = raw as { colorSpace?: string; components?: number[]; alpha?: number; hex?: string };
  const cs = parseColorSpaceUnion(obj?.colorSpace);
  let comps: [number, number, number] = [0, 0, 0];
  if (Array.isArray(obj?.components) && obj!.components.length >= 3) {
    comps = [
      toNumber(obj!.components[0], 0),
      toNumber(obj!.components[1], 0),
      toNumber(obj!.components[2], 0),
    ];
  }
  const alpha = typeof obj?.alpha === 'number' ? obj!.alpha : undefined;
  const hex = typeof obj?.hex === 'string' ? obj!.hex : undefined;

  return { colorSpace: cs, components: comps, alpha, hex };
}

// Extract minimal Figma metadata from $extensions.com.figma (if present)
function readComFigma(o: unknown): { collectionName?: string; modeName?: string; variableName?: string } | null {
  if (!o || typeof o !== 'object') return null;
  const ext = (o as any)['$extensions'];
  if (!ext || typeof ext !== 'object') return null;
  const com = (ext as any)['com.figma'];
  if (!com || typeof com !== 'object') return null;

  const out: { collectionName?: string; modeName?: string; variableName?: string } = {};
  if (typeof com.collectionName === 'string') out.collectionName = com.collectionName;
  if (typeof com.modeName === 'string') out.modeName = com.modeName;
  if (typeof com.variableName === 'string') out.variableName = com.variableName;
  return out;
}

/**
 * Compute IR path and ctx for a token based on:
 *  - $extensions.com.figma.collectionName / modeName / variableName (if present, use EXACT strings)
 *  - otherwise the JSON group path literally (no normalization)
 *  - flat tokens (single segment) go under "tokens" collection by default
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

        // after you build `byCtx` and before pushing:
        // (this is inside the "$value is an alias" branch — repeat the same in the color & primitive branches)
        const ext: Record<string, unknown> | undefined =
          hasKey(obj, '$extensions') ? (obj as any)['$extensions'] as Record<string, unknown> : undefined;
        const comFigma: Record<string, unknown> =
          ext && typeof ext === 'object' && ext['com.figma'] && typeof (ext as any)['com.figma'] === 'object'
            ? (ext as any)['com.figma'] as Record<string, unknown>
            : (ext ? ((ext['com.figma'] = {}), (ext as any)['com.figma'] as Record<string, unknown>) : {});

        // NEW: capture the *raw* JSON identifiers for strict checks in the writer
        (comFigma as any).__jsonCollection = (path[0] ?? '');
        (comFigma as any).__jsonKey = path.slice(1).join('/');

        // ← keep EXACT JSON keys (no normalization)
        // tokens.push({
        //   path: path.slice(),                 
        //   type: groupType ?? 'string',
        //   byContext: byCtx,
        //   ...(ext ? { extensions: { ...ext, 'com.figma': comFigma } } : {})
        // });


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
        const parsed = readColorValue(rawVal);
        const { irPath, ctx } = computePathAndCtx(path, obj);

        if (!parsed) {
          logWarn(`Skipped invalid color for “${irPath.join('/')}” — expected hex or color object.`);
          return;
        }

        // STRICT: components/alpha must be within [0..1]; do not clamp during import
        const range = isDtcgColorInUnitRange(parsed);
        if (!range.ok) {
          logWarn(`Skipped invalid color for “${irPath.join('/')}” — ${range.reason}; components/alpha must be within [0..1].`);
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
