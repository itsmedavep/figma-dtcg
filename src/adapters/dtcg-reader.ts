// src/adapters/dtcg-reader.ts
// DTCG JSON -> IR TokenGraph (handles aliases, simple $type inheritance)

import { type TokenGraph, type TokenNode, type PrimitiveType, type ValueOrAlias, ctxKey, type ColorValue } from '../core/ir';
import { parseAliasString, slugSegment, canonicalPath } from '../core/normalize';
import { hexToDtcgColor } from '../core/color';

// Extract minimal Figma metadata from $extensions.com.figma (if present)
function readComFigma(o: unknown): { collectionName?: string; modeName?: string; variableName?: string } | null {
  if (!o || typeof o !== 'object') return null;
  const ext = (o as any)['$extensions'];
  if (!ext || typeof ext !== 'object') return null;
  const org = (ext as any)['com.figma'];
  if (!org || typeof org !== 'object') return null;

  const out: any = {};
  if (typeof org.collectionName === 'string') out.collectionName = org.collectionName;
  if (typeof org.modeName === 'string') out.modeName = org.modeName;
  if (typeof org.variableName === 'string') out.variableName = org.variableName;
  return out;
}

/**
 * Compute IR path and ctx for a token based on:
 *  - $extensions.com.figma.collectionName / modeName / variableName (if present)
 *  - otherwise W3C group path (first segment = collection, rest join to variable)
 *  - flat tokens (single segment) go under "tokens" collection by default
 *  - default Figma mode when missing = "Mode 1"
 */
function computePathAndCtx(currentPath: string[], rawNode: unknown): { irPath: string[]; ctx: string } {
  const meta = readComFigma(rawNode) || {};
  const leaf = currentPath[currentPath.length - 1] || 'token';

  let collection: string;
  let varName: string;

  if (meta.collectionName) {
    collection = meta.collectionName;
    if (meta.variableName && meta.variableName.trim().length > 0) {
      varName = meta.variableName;
    } else if (currentPath.length > 1) {
      varName = currentPath.slice(1).join('/');
    } else {
      varName = leaf;
    }
  } else {
    if (currentPath.length > 1) {
      collection = currentPath[0];
      varName = currentPath.slice(1).join('/');
    } else {
      // flat token → put into a safe default collection
      collection = 'tokens';
      varName = leaf;
    }
  }

  let irPath: string[];
  if (meta.collectionName) {
    // Preserve exact collection + variable names from metadata (no slugging)
    const segs = (meta.variableName && meta.variableName.trim().length > 0
      ? meta.variableName
      : varName
    ).split('/').map(s => s.trim()).filter(s => s.length > 0);
    irPath = [collection, ...segs];
  } else {
    // No metadata → fall back to canonical/slugged path from group keys
    irPath = canonicalPath(collection, varName);
  }

  const mode = meta.modeName || 'Mode 1';
  const ctx = ctxKey(collection, mode);
  return { irPath, ctx };
}


function guessTypeFromValue(v: unknown): PrimitiveType {
  if (typeof v === 'number') return 'number';
  if (typeof v === 'string') return 'string';
  if (typeof v === 'boolean') return 'boolean';
  return 'string';
}

function isColorObject(obj: unknown): obj is { colorSpace?: string; components?: number[]; alpha?: number; hex?: string } {
  return !!obj && typeof obj === 'object' && (
    typeof (obj as { colorSpace?: unknown }).colorSpace === 'string' ||
    (obj as { components?: unknown }).components instanceof Array ||
    typeof (obj as { hex?: unknown }).hex === 'string'
  );
}

function hasKey(o: unknown, k: string): boolean {
  return !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
}

function toNumber(x: unknown, def: number): number {
  return typeof x === 'number' ? x : def;
}

function parseColorSpaceUnion(x: unknown): 'srgb' | 'display-p3' {
  if (x === 'srgb') return 'srgb';
  if (x === 'display-p3') return 'display-p3';
  return 'srgb';
}



function readColorValue(raw: unknown): ColorValue {
  // Allow either hex string or object form
  if (typeof raw === 'string') {
    return hexToDtcgColor(raw);
  }
  var obj = raw as { colorSpace?: string; components?: number[]; alpha?: number; hex?: string };

  var cs = parseColorSpaceUnion(obj.colorSpace);
  var comps: [number, number, number] = [0, 0, 0];
  if (obj.components && obj.components.length >= 3) {
    comps = [toNumber(obj.components[0], 0), toNumber(obj.components[1], 0), toNumber(obj.components[2], 0)];
  }
  var alpha = typeof obj.alpha === 'number' ? obj.alpha : undefined;
  var hex = typeof obj.hex === 'string' ? obj.hex : undefined;

  return { colorSpace: cs, components: comps, alpha: alpha, hex: hex };
}

export function readDtcgToIR(root: unknown): TokenGraph {
  var tokens: TokenNode[] = [];
  var defaultCtx = ctxKey('tokens', 'default');

  function visit(obj: unknown, path: string[], inheritedType: PrimitiveType | null): void {
    if (!obj || typeof obj !== 'object') return;

    var groupType: PrimitiveType | null = inheritedType;
    if (hasKey(obj, '$type') && typeof (obj as { $type: unknown }).$type === 'string') {
      var t = String((obj as { $type: unknown }).$type);
      if (t === 'color' || t === 'number' || t === 'string' || t === 'boolean') groupType = t;
    }

    if (hasKey(obj, '$value')) {
      var rawVal = (obj as { $value: unknown }).$value;

      function readExtensions(obj: unknown): Record<string, unknown> | undefined {
        if (!obj || typeof obj !== 'object') return undefined;
        const ext = (obj as { $extensions?: unknown }).$extensions;
        return ext && typeof ext === 'object' ? (ext as Record<string, unknown>) : undefined;
      }


      // alias?
      if (typeof rawVal === 'string') {
        const ref = parseAliasString(rawVal);
        if (ref && ref.length > 0) {
          const { irPath, ctx } = computePathAndCtx(path, obj);
          const byCtx: { [k: string]: ValueOrAlias } = {};
          byCtx[ctx] = { kind: 'alias', path: ref };

          tokens.push({
            path: irPath,
            type: groupType ? groupType : 'string',
            byContext: byCtx,
            // keep original $extensions if present (round-trip friendly)
            ...(hasKey(obj, '$extensions') ? { extensions: (obj as any)['$extensions'] as Record<string, unknown> } : {})
          });
          return;
        }
      }


      // color object or hex
      if (isColorObject(rawVal) || typeof rawVal === 'string') {
        const value = readColorValue(rawVal);
        const { irPath, ctx } = computePathAndCtx(path, obj);
        const byCtx: { [k: string]: ValueOrAlias } = {};
        byCtx[ctx] = { kind: 'color', value };

        tokens.push({
          path: irPath,
          type: 'color',
          byContext: byCtx,
          ...(hasKey(obj, '$extensions') ? { extensions: (obj as any)['$extensions'] as Record<string, unknown> } : {})
        });
        return;
      }


      // primitives
      const t2 = groupType ? groupType : guessTypeFromValue(rawVal);
      let valObj: ValueOrAlias | null = null;
      if (t2 === 'number' && typeof rawVal === 'number') valObj = { kind: 'number', value: rawVal };
      else if (t2 === 'boolean' && typeof rawVal === 'boolean') valObj = { kind: 'boolean', value: rawVal };
      else if (t2 === 'string' && typeof rawVal === 'string') valObj = { kind: 'string', value: rawVal };
      else if (typeof rawVal === 'string') valObj = { kind: 'string', value: rawVal };
      else if (typeof rawVal === 'number') valObj = { kind: 'number', value: rawVal };
      else if (typeof rawVal === 'boolean') valObj = { kind: 'boolean', value: rawVal };

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

    // groups
    var k: string;
    for (k in obj) {
      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
      if (k.length > 0 && k.charAt(0) === '$') continue;
      var child = (obj as { [key: string]: unknown })[k];
      var newPath = path.concat([slugSegment(k)]);
      visit(child, newPath, groupType);
    }
  }

  visit(root, [], null);
  return { tokens: tokens };
}
