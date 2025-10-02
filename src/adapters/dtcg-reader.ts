// src/adapters/dtcg-reader.ts
// Parse raw DTCG token JSON into our IR without losing metadata or alias structure.
// - Validates values strictly so we fail fast on malformed input
// - Preserves $extensions fields to keep Figma round-trips intact

import {
  type TokenGraph,
  type TokenNode,
  type PrimitiveType,
  type ValueOrAlias,
} from '../core/ir';
import { parseTypographyValue } from '../core/typography';

// ---------- color parsing (strict) ----------
import { hexToDtcgColor, isDtcgColorShapeValid } from '../core/color';

// ---------- lightweight logging (console fallback outside Figma) ----------
function postInfoToUi(msg: string): boolean {
  try {
    if (typeof figma !== 'undefined' && figma.ui?.postMessage) {
      figma.ui.postMessage({ type: 'INFO', payload: { message: msg } });
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

function logInfo(msg: string) {
  if (postInfoToUi(msg)) return;
  try { globalThis.console?.log?.(msg); } catch { /* ignore */ }
}

function logWarn(msg: string) {
  const payload = 'Warning: ' + msg;
  if (postInfoToUi(payload)) return;
  try { globalThis.console?.warn?.(payload); }
  catch {
    try { globalThis.console?.log?.(payload); } catch { /* ignore */ }
  }
}

// ---------- helpers ----------
/** Guard for plain-object own keys without letting sneaky prototypes through. */
function hasKey(o: unknown, k: string): boolean {
  return !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
}

/** True when the value looks like an alias string: "{collection.group.token}". */
function isAliasString(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith('{') && v.endsWith('}') && v.length > 2;
}

/** Split an alias string into raw segments while keeping user formatting intact. */
function parseAliasToSegments(v: string): string[] {
  // exact segments, keep spacing/punctuation as-is (only trim around the dot delimiter)
  return v.slice(1, -1).split('.').map(s => s.trim());
}

/** Quick heuristic for hex strings so we only attempt conversions on plausible inputs. */
function isLikelyHexString(v: unknown): v is string {
  return typeof v === 'string'
    && /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v.trim());
}

/** Extract a trimmed $description if present; avoids emitting empty strings. */
function readDescription(obj: unknown): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  const d = (obj as any)['$description'];
  if (typeof d === 'string') {
    const s = d.trim();
    if (s.length > 0) return s;
  }
  return undefined;
}


/**
 * Flexible color parser:
 * - Strict by default (reject all string forms).
 * - When allowHexStrings = true, accept hex strings -> DTCG object via hexToDtcgColor (srgb).
 * - Always accept objects only if shape is valid (supported colorSpace, 3 numeric components, alpha number in [0..1] or undefined).
 * - Do NOT coerce object member types (alpha:"1" stays string -> rejected by validator).
 */
function readColorValueFlexible(
  raw: unknown,
  allowHexStrings: boolean
): { value: any; coercedFromHex: boolean } | null {
  // String form
  if (typeof raw === 'string') {
    if (!allowHexStrings) return null;
    if (!isLikelyHexString(raw)) return null;
    try {
      return { value: hexToDtcgColor(raw), coercedFromHex: true };
    } catch {
      return null;
    }
  }

  // Object form (no coercion)
  if (raw && typeof raw === 'object') {
    const obj = raw as any;
    const candidate: any = {
      // keep as-is; validator will check allowed spaces (srgb/display-p3)
      ...(typeof obj.colorSpace === 'string' ? { colorSpace: obj.colorSpace } : {}),
      ...(Array.isArray(obj.components) ? { components: obj.components.slice(0, 3) } : {}),
      // preserve provided alpha *as-is*; validator will reject non-number/out-of-range
      ...(('alpha' in obj) ? { alpha: obj.alpha } : {}),
      ...(typeof obj.hex === 'string' ? { hex: obj.hex } : {})
    };

    const shape = isDtcgColorShapeValid(candidate);
    if (!shape.ok) return null;
    return { value: candidate, coercedFromHex: false };
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

export interface DtcgReaderOptions {
  /** When true, accept hex strings like "#RRGGBB[AA]" and coerce to a DTCG color object (srgb). Default: false (strict). */
  allowHexStrings?: boolean;
}

export function readDtcgToIR(root: unknown, opts: DtcgReaderOptions = {}): TokenGraph {
  const allowHexStrings = !!opts.allowHexStrings;
  const tokens: TokenNode[] = [];
  const tokensByPath = new Map<string, TokenNode>();
  const aliasTokens: Array<{ token: TokenNode; declaredType: PrimitiveType | null }> = [];

  function registerToken(token: TokenNode): void {
    tokens.push(token);
    tokensByPath.set(token.path.join('/'), token);
  }

  function visit(obj: unknown, path: string[], inheritedType: PrimitiveType | null): void {
    if (!obj || typeof obj !== 'object') return;

    // group-level $type inheritance (DTCG)
    let groupType: PrimitiveType | null = inheritedType;
    if (hasKey(obj, '$type') && typeof (obj as any).$type === 'string') {
      const t = String((obj as any).$type);
      if (t === 'color' || t === 'number' || t === 'string' || t === 'boolean' || t === 'typography') {
        groupType = t as PrimitiveType;
      }
    }

    // Token node?
    if (hasKey(obj, '$value')) {
      const rawVal = (obj as any).$value;

      // Optional $description (DTCG)
      const desc = readDescription(obj);


      // Aliases are always strings of the form {a.b.c}
      if (isAliasString(rawVal)) {
        const segs = parseAliasToSegments(rawVal);
        const { irPath, ctx } = computePathAndCtx(path, obj);
        const byCtx: { [k: string]: ValueOrAlias } = {};
        byCtx[ctx] = { kind: 'alias', path: segs };

        const token: TokenNode = {
          path: irPath,
          type: groupType ?? 'string',
          byContext: byCtx,
          ...(desc ? { description: desc } : {}),
          ...(hasKey(obj, '$extensions') ? { extensions: (obj as any)['$extensions'] as Record<string, unknown> } : {})
        };
        registerToken(token);
        aliasTokens.push({ token, declaredType: groupType ?? null });
        return;
      }

      // Colors: ONLY when $type (inherited or local) is 'color'
      if (groupType === 'color') {
        const { irPath, ctx } = computePathAndCtx(path, obj);
        const parsed = readColorValueFlexible(rawVal, allowHexStrings);

        if (!parsed) {
          if (typeof rawVal === 'string') {
            if (allowHexStrings) {
              logWarn(`Skipped invalid color for “${irPath.join('/')}” — expected hex string or a valid DTCG color object (srgb/display-p3, 3 numeric components, alpha in [0..1]).`);
            } else {
              logWarn(`Skipped invalid color for “${irPath.join('/')}” — expected a DTCG color object (srgb/display-p3, 3 numeric components, optional numeric alpha in [0..1]); strings like "#RRGGBB" are not accepted.`);
            }
          } else {
            logWarn(`Skipped invalid color for “${irPath.join('/')}” — expected a valid DTCG color object (srgb/display-p3, 3 numeric components, alpha in [0..1]).`);
          }
          return;
        }

      if (parsed.coercedFromHex) {
        logInfo(`Coerced string hex to DTCG color object for “${irPath.join('/')}”.`);
      }

        const byCtx: { [k: string]: ValueOrAlias } = {};
        byCtx[ctx] = { kind: 'color', value: parsed.value };

        registerToken({
          path: irPath,
          type: 'color',
          byContext: byCtx,
          ...(desc ? { description: desc } : {}),
          ...(hasKey(obj, '$extensions') ? { extensions: (obj as any)['$extensions'] as Record<string, unknown> } : {})
        });
        return;
      }

      // Primitives (respect declared type; only fall back when no type was declared)
      const declaredType = groupType;
      if (!declaredType) {
        logWarn(`Skipped token “${path.join('/')}” — no $type found in token or parent groups.`);
        return;
      }

      let effectiveType: PrimitiveType = declaredType;
      let valObj: ValueOrAlias | null = null;

      if (declaredType === 'number' && typeof rawVal === 'number') {
        valObj = { kind: 'number', value: rawVal };
      } else if (declaredType === 'boolean' && typeof rawVal === 'boolean') {
        valObj = { kind: 'boolean', value: rawVal };
      } else if (declaredType === 'string' && typeof rawVal === 'string') {
        valObj = { kind: 'string', value: rawVal };
      }
      // DTCG-compliant boolean round-trip:
      // If $type is (or resolves to) "string" and $extensions.com.figma.variableType == "BOOLEAN"
      // and $value is "true"/"false", coerce back to boolean with a mild note.
      if (!valObj && (declaredType === 'string') && typeof rawVal === 'string') {
        const ext = hasKey(obj, '$extensions') ? (obj as any)['$extensions'] as Record<string, unknown> : undefined;
        const com = ext && typeof ext === 'object' ? (ext as any)['com.figma'] : undefined;
        const varType = com && typeof com === 'object' ? (com as any)['variableType'] : undefined;
        if (varType === 'BOOLEAN') {
          const raw = rawVal.trim().toLowerCase();
          if (raw === 'true' || raw === 'false') {
            valObj = { kind: 'boolean', value: (raw === 'true') };
            // mild note in the plugin log
            logInfo(`Note: coerced string “${rawVal}” to boolean due to $extensions.com.figma.variableType=BOOLEAN at “${path.join('/')}”.`);
            effectiveType = 'boolean';
          }
        }
      }

      if (!valObj && declaredType === 'typography') {
        const parsedTypography = parseTypographyValue(rawVal);
        if (!parsedTypography) {
          logWarn(`Skipped token “${path.join('/')}” — expected a valid typography object.`);
          return;
        }

        const { irPath, ctx } = computePathAndCtx(path, obj);
        const byCtx: { [k: string]: ValueOrAlias } = {};
        byCtx[ctx] = { kind: 'typography', value: parsedTypography };

        registerToken({
          path: irPath,
          type: 'typography',
          byContext: byCtx,
          ...(desc ? { description: desc } : {}),
          ...(hasKey(obj, '$extensions') ? { extensions: (obj as any)['$extensions'] as Record<string, unknown> } : {})
        });
        return;
      }

      if (!valObj) {
        const observed = typeof rawVal;
        logWarn(`Skipped token “${path.join('/')}” — declared $type ${declaredType} but found ${observed}.`);
        return;
      }

      const { irPath, ctx } = computePathAndCtx(path, obj);
      const byCtx: { [k: string]: ValueOrAlias } = {};
      byCtx[ctx] = valObj;

      registerToken({
        path: irPath,
        type: effectiveType,
        byContext: byCtx,
        ...(desc ? { description: desc } : {}),
        ...(hasKey(obj, '$extensions') ? { extensions: (obj as any)['$extensions'] as Record<string, unknown> } : {})
      });
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

  const aliasTokenSet = new Set(aliasTokens.map(a => a.token));
  const resolvedTypeCache = new Map<string, PrimitiveType | null>();
  const invalidTokens = new Set<TokenNode>();

  function resolveTypeForPath(pathSegs: string[], stack: Set<string>): PrimitiveType | null {
    const key = pathSegs.join('/');
    if (resolvedTypeCache.has(key)) return resolvedTypeCache.get(key)!;
    if (stack.has(key)) {
      resolvedTypeCache.set(key, null);
      return null;
    }

    const target = tokensByPath.get(key);
    if (!target) {
      resolvedTypeCache.set(key, null);
      return null;
    }

    if (!aliasTokenSet.has(target)) {
      resolvedTypeCache.set(key, target.type);
      return target.type;
    }

    stack.add(key);
    let detected: PrimitiveType | null = null;
    const ctxValues = Object.values(target.byContext);
    for (const ctxVal of ctxValues) {
      if (!ctxVal || ctxVal.kind !== 'alias') {
        detected = null;
        break;
      }
      const nested = resolveTypeForPath(ctxVal.path, stack);
      if (!nested) {
        detected = null;
        break;
      }
      if (!detected) detected = nested;
      else if (detected !== nested) {
        detected = null;
        break;
      }
    }
    stack.delete(key);
    resolvedTypeCache.set(key, detected);
    return detected;
  }

  for (const { token, declaredType } of aliasTokens) {
    const tokenKey = token.path.join('/');
    let resolvedType: PrimitiveType | null = null;
    let unresolved = false;

    for (const ctxVal of Object.values(token.byContext)) {
      if (!ctxVal || ctxVal.kind !== 'alias') {
        unresolved = true;
        break;
      }
      const stack = new Set<string>([tokenKey]);
      const nestedType = resolveTypeForPath(ctxVal.path, stack);
      if (!nestedType) {
        unresolved = true;
        break;
      }
      if (!resolvedType) resolvedType = nestedType;
      else if (resolvedType !== nestedType) {
        unresolved = true;
        break;
      }
    }

    if (!resolvedType || unresolved) {
      logWarn(`Skipped token “${token.path.join('/')}” — could not resolve alias type.`);
      invalidTokens.add(token);
      continue;
    }

    if (declaredType && declaredType !== resolvedType) {
      logWarn(`Token “${token.path.join('/')}” declared $type ${declaredType} but resolves to ${resolvedType}; using resolved type.`);
    }

    token.type = resolvedType;
    tokensByPath.set(tokenKey, token);
  }

  const finalTokens = tokens.filter(t => !invalidTokens.has(t));
  return { tokens: finalTokens };
}
