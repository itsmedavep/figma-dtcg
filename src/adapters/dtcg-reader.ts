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
import { hexToDtcgColor } from '../core/color';

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
function computePathAndCtx(currentPath: string[], rawNode: unknown): { irPath: string[]; ctx: string } {
  const meta = readComFigma(rawNode) || {};
  const leaf = currentPath[currentPath.length - 1] || 'token';

  let collection: string;
  let variableName: string;

  if (meta.collectionName) {
    collection = meta.collectionName;
    if (meta.variableName && meta.variableName.length > 0) {
      variableName = meta.variableName;
    } else if (currentPath.length > 1) {
      variableName = currentPath.slice(1).join('/');
    } else {
      variableName = leaf;
    }
  } else {
    if (currentPath.length > 1) {
      collection = currentPath[0];
      variableName = currentPath.slice(1).join('/');
    } else {
      // flat token → put into a safe default collection
      collection = 'tokens';
      variableName = leaf;
    }
  }

  // Never slug/trim/mutate; split literal variableName by '/'
  const irPath: string[] = [collection, ...variableName.split('/')];

  const mode = meta.modeName || 'Mode 1';
  const ctx = ctxKey(collection, mode);
  return { irPath, ctx };
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
        const parsed = readColorValue(rawVal);
        if (!parsed) {
          const { irPath } = computePathAndCtx(path, obj);
          logWarn(`Skipped invalid color for “${irPath.join('/')}” — expected hex or color object.`);
          return;
        }
        const { irPath, ctx } = computePathAndCtx(path, obj);
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
