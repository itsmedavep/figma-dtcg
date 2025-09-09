// src/adapters/dtcg-reader.ts
// DTCG JSON -> IR TokenGraph (handles aliases, simple $type inheritance)

import { type TokenGraph, type TokenNode, type PrimitiveType, type ValueOrAlias, ctxKey, type ColorValue } from '../core/ir';
import { parseAliasString, slugSegment } from '../core/normalize';
import { hexToDtcgColor } from '../core/color';

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

      // alias?
      if (typeof rawVal === 'string') {
        var ref = parseAliasString(rawVal);
        if (ref && ref.length > 0) {
          tokens.push({
            path: path.slice(0),
            type: groupType ? groupType : 'string',
            byContext: (function () {
              var o: { [k: string]: ValueOrAlias } = {};
              o[defaultCtx] = { kind: 'alias', path: ref };
              return o;
            })()
          });
          return;
        }
      }

      // color object or hex
      if (isColorObject(rawVal) || typeof rawVal === 'string') {
        var value = readColorValue(rawVal);
        tokens.push({
          path: path.slice(0),
          type: 'color',
          byContext: (function () {
            var o: { [k: string]: ValueOrAlias } = {};
            o[defaultCtx] = { kind: 'color', value: value };
            return o;
          })()
        });
        return;
      }

      // primitives
      var t2 = groupType ? groupType : guessTypeFromValue(rawVal);
      var valObj: ValueOrAlias | null = null;
      if (t2 === 'number' && typeof rawVal === 'number') valObj = { kind: 'number', value: rawVal };
      else if (t2 === 'boolean' && typeof rawVal === 'boolean') valObj = { kind: 'boolean', value: rawVal };
      else if (t2 === 'string' && typeof rawVal === 'string') valObj = { kind: 'string', value: rawVal };
      else if (typeof rawVal === 'string') valObj = { kind: 'string', value: rawVal };
      else if (typeof rawVal === 'number') valObj = { kind: 'number', value: rawVal };
      else if (typeof rawVal === 'boolean') valObj = { kind: 'boolean', value: rawVal };

      if (valObj) {
        tokens.push({
          path: path.slice(0),
          type: t2,
          byContext: (function () {
            var o: { [k: string]: ValueOrAlias } = {};
            o[defaultCtx] = valObj as ValueOrAlias;
            return o;
          })()
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
