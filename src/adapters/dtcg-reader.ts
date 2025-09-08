
import type { TokenGraph, TokenNode, PrimitiveType, ValueOrAlias } from '../core/ir';
import { ctxKey } from '../core/ir';

interface ParseOpts { collectionName: string; modeName: string }

type Dict = Record<string, unknown>;
function isDict(o: unknown): o is Dict { return typeof o === 'object' && o !== null; }

export function parse(root: any, opts: ParseOpts): TokenGraph {
  if (typeof root !== 'object' || root == null) {
    throw new Error('DTCG: root must be an object');
  }
  const tokens: TokenNode[] = [];
  walkGroup(root, [], undefined, tokens, opts);
  return { tokens };
}

function walkGroup(node: Dict, path: string[], inheritedType: PrimitiveType|undefined, out: TokenNode[], opts: ParseOpts) {
  // Group-level $type is the default for children
  const groupType = (typeof node['$type'] === 'string' ? node['$type'] as PrimitiveType : inheritedType);
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('$')) continue; // skip meta keys at this level
    if (typeof value === 'object' && value != null && ('$value' in value || '$type' in value || '$description' in value || '$extensions' in value)) {
      const t = tokenFromEntry(path.concat(key), value, groupType, opts);
      out.push(t);
    } else if (typeof value === 'object' && value != null) {
      // nested group
      walkGroup(value, path.concat(key), groupType, out, opts);
    }
  }
}

function tokenFromEntry(path: string[], entry: Dict, inheritedType: PrimitiveType|undefined, opts: ParseOpts): TokenNode {
  const typeRaw = typeof entry['$type'] === 'string' ? entry['$type'] : undefined;
const type = typeRaw ? (typeRaw as any) : (inheritedType ? inheritedType : guessType(entry));
  if (!type) throw new Error(`Token ${path.join('/')} is missing $type and cannot be inferred`);

  const raw = entry['$value'];
  const valOrAlias: ValueOrAlias = parseValueOrAlias(raw, type);
  const description = (typeof entry['$description'] === 'string') ? (entry['$description'] as string) : undefined;
  const extensions = (typeof entry['$extensions'] === 'object' && entry['$extensions'] !== null) ? (entry['$extensions'] as Record<string, unknown>) : undefined;
  const byContext = { [ctxKey(opts.collectionName, opts.modeName)]: valOrAlias };

  return { path, type, byContext, description, extensions };
}

function guessType(entry: Dict): PrimitiveType|undefined {
  if ('$value' in entry) {
    const v = entry['$value'];
    if (typeof v === 'string') {
      if (/^\{[^}]+\}$/.test(v)) return 'string'; // alias string form; type unknown
      if (/^#?[0-9a-f]{3,8}$/i.test(v)) return 'color';
      return 'string';
    } else if (typeof v === 'number') return 'number';
    else if (typeof v === 'boolean') return 'boolean';
    else if (typeof v === 'object' && v && 'colorSpace' in v) return 'color';
  }
  return undefined;
}

function parseValueOrAlias(raw: any, type: PrimitiveType): ValueOrAlias {
  if (typeof raw === 'string' && /^\{[^}]+\}$/.test(raw)) {
    return { kind: 'alias', path: raw.slice(1, -1) };
  }
  switch (type) {
    case 'color': {
      if (typeof raw === 'string') {
        // Accept #rrggbb or #rrggbbaa
        const hex = raw.replace(/^#/, '');
        const rgb = hex.length === 3 ? hex.split('').map(c => parseInt(c+c, 16)/255)
                : hex.length === 6 || hex.length === 8 ? [0,1,2].map(i => parseInt(hex.slice(i*2, i*2+2),16)/255)
                : null;
        const alpha = hex.length === 8 ? parseInt(hex.slice(6,8),16)/255 : undefined;
        if (!rgb) throw new Error('Unsupported hex color: ' + raw);
        return { kind: 'color', value: { colorSpace: 'srgb', components: [rgb[0], rgb[1], rgb[2]], alpha: alpha, hex: '#' + hex } };
      } else if (typeof raw === 'object' && raw && 'colorSpace' in raw) {
        return { kind: 'color', value: raw };
      }
      throw new Error('Color token requires hex or srgb object');
    }
    case 'number': return { kind: 'number', value: Number(raw) };
    case 'boolean': return { kind: 'boolean', value: Boolean(raw) };
    case 'string': return { kind: 'string', value: String(raw) };
    case 'dimension': {
      if (typeof raw === 'object' && raw && 'value' in raw && 'unit' in raw) {
        return { kind: 'dimension', value: raw };
      }
      throw new Error('Dimension token requires {value, unit}');
    }
    default:
      return { kind: 'string', value: String(raw) };
  }
}
