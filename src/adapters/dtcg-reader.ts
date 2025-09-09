import type { TokenGraph, TokenNode, PrimitiveType, ValueOrAlias } from '../core/ir';
import { ctxKey } from '../core/ir';

type Dict = { [key: string]: unknown };
function isDict(o: unknown): o is Dict { return typeof o === 'object' && o !== null; }

export function parse(root: unknown): TokenGraph {
  if (!isDict(root)) throw new Error('DTCG: root must be an object');
  var tokens: Array<TokenNode> = [];
  walkGroup(root, [], undefined, tokens);
  return { tokens: tokens };
}

function walkGroup(node: unknown, path: Array<string>, inheritedType: PrimitiveType | undefined, out: Array<TokenNode>) {
  if (!isDict(node)) return;
  var groupType: PrimitiveType | undefined = inheritedType;
  if (typeof node['$type'] === 'string') groupType = node['$type'] as PrimitiveType;

  var key: string;
  for (key in node) {
    if (!Object.prototype.hasOwnProperty.call(node, key)) continue;
    if (key.length > 0 && key.charAt(0) === '$') continue;

    var value = (node as Dict)[key];

    if (isDict(value)) {
      if (hasTokenShape(value)) {
        var t = tokenFromEntry(path.concat(key), value, groupType);
        out.push(t);
      } else {
        walkGroup(value, path.concat(key), groupType, out);
      }
    }
  }
}

function hasTokenShape(o: Dict): boolean {
  if (Object.prototype.hasOwnProperty.call(o, '$value')) return true;
  if (Object.prototype.hasOwnProperty.call(o, '$type')) return true;
  if (Object.prototype.hasOwnProperty.call(o, '$description')) return true;
  if (Object.prototype.hasOwnProperty.call(o, '$extensions')) return true;
  return false;
}

function tokenFromEntry(path: Array<string>, entry: Dict, inheritedType: PrimitiveType | undefined): TokenNode {
  var explicitType: PrimitiveType | undefined = undefined;
  if (typeof entry['$type'] === 'string') explicitType = entry['$type'] as PrimitiveType;
  var type: PrimitiveType | undefined = explicitType ? explicitType : inheritedType;
  if (!type) {
    type = guessType(entry);
    if (!type) throw new Error('Token ' + path.join('/') + ' missing $type and cannot be inferred');
  }

  var description: string | undefined = undefined;
  if (typeof entry['$description'] === 'string') description = String(entry['$description']);

  var extensions: Record<string, unknown> | undefined = undefined;
  if (isDict(entry['$extensions'])) extensions = entry['$extensions'] as Record<string, unknown>;

  // Prefer contexts from $extensions.org.figma.valuesByContext
  var byContext: Record<string, ValueOrAlias> = {};
  var ctxMap = contextsFromExtensions(entry, type);
  if (ctxMap) {
    byContext = ctxMap;
  } else {
    var raw = (entry as any)['$value'];
    var coll = 'Imported';
    var mode = 'Default';
    var extOrg = safeGet(entry, ['$extensions', 'org', 'figma']);
    if (isDict(extOrg)) {
      var cName = (extOrg as any)['collectionName'];
      var mName = (extOrg as any)['modeName'];
      if (typeof cName === 'string') coll = cName;
      if (typeof mName === 'string') mode = mName;
    }
    byContext[ctxKey(coll, mode)] = parseValueOrAlias(raw, type);
  }

  return { path: path, type: type, byContext: byContext, description: description, extensions: extensions };
}

function safeGet(obj: unknown, path: Array<string>): unknown {
  var cur: unknown = obj;
  var i: number;
  for (i = 0; i < path.length; i++) {
    if (!isDict(cur)) return undefined;
    var k = path[i];
    if (!Object.prototype.hasOwnProperty.call(cur, k)) return undefined;
    cur = (cur as Dict)[k];
  }
  return cur;
}

function contextsFromExtensions(entry: Dict, type: PrimitiveType): Record<string, ValueOrAlias> | null {
  var valuesByCtx = safeGet(entry, ['$extensions', 'org', 'figma', 'valuesByContext']);
  if (!isDict(valuesByCtx)) return null;

  var byContext: Record<string, ValueOrAlias> = {};
  var k: string;
  for (k in valuesByCtx as Dict) {
    if (!Object.prototype.hasOwnProperty.call(valuesByCtx, k)) continue;
    var raw = (valuesByCtx as Dict)[k];
    byContext[k] = parseValueOrAlias(raw, type);
  }
  return byContext;
}

function guessType(entry: Dict): PrimitiveType | undefined {
  if (Object.prototype.hasOwnProperty.call(entry, '$value')) {
    var v = (entry as any)['$value'];
    if (typeof v === 'string') {
      if (/^\{[^}]+\}$/.test(v)) return 'string';
      if (/^#?[0-9a-f]{3,8}$/i.test(v)) return 'color';
      return 'string';
    } else if (typeof v === 'number') return 'number';
    else if (typeof v === 'boolean') return 'boolean';
    else if (isDict(v) && Object.prototype.hasOwnProperty.call(v, 'colorSpace')) return 'color';
  }
  return undefined;
}

function parseValueOrAlias(raw: unknown, type: PrimitiveType): ValueOrAlias {
  if (typeof raw === 'string' && /^\{[^}]+\}$/.test(raw)) {
    return { kind: 'alias', path: raw.slice(1, raw.length - 1) };
  }
  if (type === 'color') {
    if (typeof raw === 'string') {
      var hex = raw.replace(/^#/, '');
      var rgb: Array<number> | null = null;
      if (hex.length === 3) {
        rgb = [0, 1, 2].map(function (i) { var c = hex.charAt(i); return parseInt(c + c, 16) / 255; });
      } else if (hex.length === 6 || hex.length === 8) {
        rgb = [0, 1, 2].map(function (i) { return parseInt(hex.slice(i * 2, i * 2 + 2), 16) / 255; });
      }
      var alpha: number | undefined = undefined;
      if (hex.length === 8) alpha = parseInt(hex.slice(6, 8), 16) / 255;
      if (!rgb) throw new Error('Unsupported hex color: ' + String(raw));
      return { kind: 'color', value: { colorSpace: 'srgb', components: [rgb[0], rgb[1], rgb[2]], alpha: alpha, hex: '#' + hex } };
    } else if (isDict(raw) && Object.prototype.hasOwnProperty.call(raw, 'colorSpace')) {
      return { kind: 'color', value: raw as any };
    }
    throw new Error('Color token requires hex or srgb object');
  }
  if (type === 'number') return { kind: 'number', value: Number(raw) };
  if (type === 'boolean') return { kind: 'boolean', value: Boolean(raw) };
  if (type === 'string') return { kind: 'string', value: String(raw) };
  return { kind: 'string', value: String(raw) };
}
