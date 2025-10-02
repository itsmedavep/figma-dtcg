// src/adapters/figma-writer.ts
// Apply TokenGraph changes back into Figma's variables API safely and predictably.
// - Buckets tokens so we only mutate what the document can represent
// - Preserves figma-specific metadata hints to keep round trips stable

import { slugSegment } from '../core/normalize';
import { type TokenGraph, type TokenNode, type PrimitiveType } from '../core/ir';
import { loadCollectionsSnapshot } from '../core/figma-cache';

import {
  dtcgToFigmaRGBA,
  normalizeDocumentProfile,
  type DocumentProfile,
  isValidDtcgColorValueObject, // kept for bucketing parity
  normalizeDtcgColorValue,
  isDtcgColorInUnitRange,       // kept because tokenHasDirectValue already uses it; harmless to retain
  isDtcgColorShapeValid,
  isColorSpaceRepresentableInDocument
} from '../core/color';
import { applyTypographyValueToTextStyle, typographyFontNameFromValue, type TypographyValue } from '../core/typography';

export interface WriteResult {
  createdTextStyles: number;
}

// ---------- logging to UI (no toasts) ----------
/** Post a quiet log line to the UI without risking plugin runtime errors. */
function logInfo(msg: string) {
  try { figma.ui?.postMessage({ type: 'INFO', payload: { message: msg } }); } catch { /* ignore */ }
}
function logWarn(msg: string) { logInfo('Warning: ' + msg); }
function logError(msg: string) { logInfo('Error: ' + msg); }

// ---------- helpers ----------

// ---------- boolean import helpers (hint + mild note) ----------

/** Read the explicit figma type hint from $extensions.com.figma.variableType. */
function readFigmaVariableTypeHint(t: TokenNode): 'BOOLEAN' | undefined {
  try {
    const ext = t.extensions && typeof t.extensions === 'object'
      ? (t.extensions as any)['com.figma']
      : undefined;
    const vt = ext && typeof ext === 'object' ? (ext as any).variableType : undefined;
    return vt === 'BOOLEAN' ? 'BOOLEAN' : undefined;
  } catch { return undefined; }
}

/** Detect string payloads that look like boolean literals so we can warn users. */
function looksBooleanString(s: unknown): s is string {
  return typeof s === 'string' && /^(true|false)$/i.test(s.trim());
}

/** Identify tokens that store booleans-as-strings so we can hint at safer conversion. */
function tokenHasBooleanLikeString(t: TokenNode): boolean {
  const byCtx = t.byContext || {};
  for (const k in byCtx) {
    const v = (byCtx as any)[k];
    if (!v || v.kind === 'alias') continue;
    if (v.kind === 'string' && looksBooleanString(v.value)) return true;
  }
  return false;
}

/** Token has at least one non-alias, correctly-typed value in any context. */
function tokenHasDirectValue(t: TokenNode): boolean {
  const byCtx = t.byContext || {};
  for (const k in byCtx) {
    const v = byCtx[k] as any;
    if (!v) continue;

    if (t.type === 'color') {
      // Bucketing heuristic only — Pass 1a will do the strict checks.
      if (v.kind === 'color' && isValidDtcgColorValueObject(v.value)) return true;
    } else {
      // number/string/boolean must match kind exactly
      if (v.kind === t.type) return true;
    }
  }
  return false;
}

/**
 * True if the token has a direct value that we can safely write for at least one context.
 * Colors require strict validation and profile checks; other primitives just need correct kind.
 */
type DirectValueCheck = { ok: true } | { ok: false; reason?: string; suppressWarn?: boolean };

function tokenHasAtLeastOneValidDirectValue(t: TokenNode, profile: DocumentProfile | string): DirectValueCheck {
  const canonicalProfile = normalizeDocumentProfile(profile);
  const byCtx = t.byContext || {};
  let lastReason: string | undefined;
  let reasonAlreadyLogged = false;
  for (const ctx in byCtx) {
    const v = (byCtx as any)[ctx];
    if (!v || v.kind === 'alias') continue;

    if (t.type === 'color') {
      if (v.kind !== 'color') continue;

      // STRICT 1: shape (supported colorSpace; 3 numeric components; alpha number in [0..1] or undefined)
      const shape = isDtcgColorShapeValid(v.value);
      if (!shape.ok) {
        lastReason = `color in ${ctx} is invalid: ${shape.reason}`;
        continue;
      }

      // STRICT 2: representable in this document profile (sRGB doc: only 'srgb'; P3 doc: 'srgb' and 'display-p3')
      const cs = (v.value.colorSpace || 'srgb').toLowerCase();
      if (!isColorSpaceRepresentableInDocument(cs, canonicalProfile)) {
        lastReason = `colorSpace “${cs}” isn’t representable in this document (${canonicalProfile}).`;
        if (!reasonAlreadyLogged) {
          logWarn(`Skipped creating direct color at “${t.path.join('/')}” in ${ctx} — ${lastReason}`);
          reasonAlreadyLogged = true;
        }
        continue;
      }

      return { ok: true };
    } else if (t.type === 'number' || t.type === 'string' || t.type === 'boolean') {
      if (v.kind === t.type) return { ok: true };
    }
  }
  if (t.type === 'number' || t.type === 'string' || t.type === 'boolean') {
    return { ok: false };
  }
  if (reasonAlreadyLogged) {
    return { ok: false, suppressWarn: true };
  }
  return { ok: false, reason: lastReason || 'no valid color values in any context; not creating variable or collection.' };
}

/** Convert our primitive type into the Figma enum that createVariable expects. */
function resolvedTypeFor(t: PrimitiveType): VariableResolvedDataType {
  if (t === 'color') return 'COLOR';
  if (t === 'number') return 'FLOAT';
  if (t === 'string') return 'STRING';
  return 'BOOLEAN';
}
/** Enumerate own-string keys without trusting prototype state. */
function forEachKey<T>(obj: { [k: string]: T } | undefined): string[] {
  const out: string[] = [];
  if (!obj) return out;
  for (const k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) out.push(k);
  return out;
}

/** Token has at least one alias among its contexts. */
function tokenHasAlias(t: TokenNode): boolean {
  const byCtx = t.byContext || {};
  for (const k in byCtx) {
    const v = byCtx[k] as any;
    if (v && v.kind === 'alias') return true;
  }
  return false;
}

/** Compare imported hex values against stored metadata and raise a gentle warning if they diverge. */
function maybeWarnColorMismatch(t: TokenNode, ctx: string, importedHexOrNull: string | null): void {
  try {
    const extAll = t.extensions && typeof t.extensions === 'object' ? (t.extensions as any)['com.figma'] : undefined;
    if (!extAll || typeof extAll !== 'object') return;

    let hintHex: string | undefined;
    if (typeof extAll.hex === 'string') hintHex = extAll.hex;
    const pc = extAll.perContext && typeof extAll.perContext === 'object' ? extAll.perContext : undefined;
    if (!hintHex && pc && pc[ctx] && typeof pc[ctx].hex === 'string') hintHex = pc[ctx].hex;

    if (!hintHex || !importedHexOrNull) return;
    const a = hintHex.trim().toLowerCase();
    const b = importedHexOrNull.trim().toLowerCase();
    if (a !== b) logWarn(`color mismatch for “${t.path.join('/')}” in ${ctx}. Using $value over $extensions.`);
  } catch { /* never throw from logging */ }
}

/** Normalize alias path segments and map collection slugs back to display names when possible. */
function normalizeAliasSegments(
  rawPath: string[] | string,
  currentCollection: string,
  displayBySlug: { [slug: string]: string },
  knownCollections: Set<string>
): string[] {
  const segs = Array.isArray(rawPath)
    ? rawPath.slice()
    : String(rawPath).split('.').map(s => s.trim()).filter(Boolean);

  if (segs.length === 0) return [currentCollection];

  const first = segs[0];
  if (knownCollections.has(first)) return segs;

  const mapped = displayBySlug[first];
  if (mapped && knownCollections.has(mapped)) {
    segs[0] = mapped;
    return segs;
  }

  // relative → prefix current collection
  return [currentCollection, ...segs];
}

/**
 * Ensure $extensions name hints line up with the JSON path we are about to write.
 * Helps catch renamed variables that could otherwise split into duplicate nodes.
 */
function namesMatchExtensions(t: TokenNode): { ok: boolean; reason?: string } {
  const ext = t.extensions && typeof t.extensions === 'object'
    ? (t.extensions as any)['com.figma']
    : undefined;

  if (!ext || typeof ext !== 'object') return { ok: true };

  const pathCollection = t.path[0];
  const pathVariable = t.path.slice(1).join('/'); // exact JSON key

  let expectedCollection: string | undefined =
    typeof (ext as any).collectionName === 'string' ? (ext as any).collectionName : undefined;
  let expectedVariable: string | undefined =
    typeof (ext as any).variableName === 'string' ? (ext as any).variableName : undefined;

  // If top-level missing, try perContext (lenient)
  if (!expectedCollection || !expectedVariable) {
    const per = (ext as any).perContext;
    if (per && typeof per === 'object') {
      const ctxKeys = forEachKey(t.byContext);
      let ctxToUse: string | undefined;

      for (const k of ctxKeys) {
        if (per[k] && typeof per[k] === 'object') { ctxToUse = k; break; }
      }
      if (!ctxToUse) {
        for (const k in per) {
          if (Object.prototype.hasOwnProperty.call(per, k) && per[k] && typeof per[k] === 'object') {
            ctxToUse = k; break;
          }
        }
      }

      if (ctxToUse) {
        const ctxData = per[ctxToUse] as any;
        if (!expectedCollection && typeof ctxData.collectionName === 'string') expectedCollection = ctxData.collectionName;
        if (!expectedVariable && typeof ctxData.variableName === 'string') expectedVariable = ctxData.variableName;
      }
    }
  }

  if (typeof expectedCollection === 'string' && expectedCollection !== pathCollection) {
    return {
      ok: false,
      reason:
        `Skipping “${t.path.join('/')}” — $extensions.com.figma.collectionName (“${expectedCollection}”) ` +
        `doesn’t match JSON group (“${pathCollection}”).`
    };
  }

  if (typeof expectedVariable === 'string' && expectedVariable !== pathVariable) {
    return {
      ok: false,
      reason:
        `Skipping “${t.path.join('/')}” — $extensions.com.figma.variableName (“${expectedVariable}”) ` +
        `doesn’t match JSON key (“${pathVariable}”).`
    };
  }

  return { ok: true };
}

function typographyNamesMatchExtensions(t: TokenNode, styleName: string): { ok: boolean; reason?: string } {
  const ext = t.extensions && typeof t.extensions === 'object'
    ? (t.extensions as any)['com.figma']
    : undefined;

  if (!ext || typeof ext !== 'object') return { ok: true };

  const expected = typeof (ext as any).styleName === 'string' ? (ext as any).styleName : undefined;
  if (expected && expected !== styleName) {
    return {
      ok: false,
      reason: `Skipping “${t.path.join('/')}” — $extensions.com.figma.styleName (“${expected}”) doesn’t match JSON key (“${styleName}”).`
    };
  }

  return { ok: true };
}

// --- Key indexing helpers: index display + slug for BOTH collection and variable segments
function dot(segs: string[]): string { return segs.join('.'); }

function indexVarKeys(
  map: { [k: string]: string },
  collectionDisplay: string,
  varSegsRaw: string[],
  varId: string
): void {
  const colDisp = collectionDisplay;
  const colSlug = slugSegment(collectionDisplay);
  const varRaw = varSegsRaw;
  const varSlug = varSegsRaw.map(s => slugSegment(s));

  // 1) Display collection + Raw variable segs
  map[dot([colDisp, ...varRaw])] = varId;
  // 2) Display collection + Slugged variable segs
  map[dot([colDisp, ...varSlug])] = varId;
  // 3) Slugged collection + Raw variable segs
  map[dot([colSlug, ...varRaw])] = varId;
  // 4) Slugged collection + Slugged variable segs
  map[dot([colSlug, ...varSlug])] = varId;
}

export async function writeIRToFigma(graph: TokenGraph): Promise<WriteResult> {
  const profile = figma.root.documentColorProfile as DocumentProfile;
  const canonicalProfile = normalizeDocumentProfile(profile);
  const variablesApi = figma.variables;

  logInfo(`Import: document color profile ${String(profile)} (canonical ${canonicalProfile}).`);

  const {
    collections: existingCollections,
    variablesById,
    collectionNameById
  } = await loadCollectionsSnapshot(variablesApi);

  const colByName: { [name: string]: VariableCollection } = {};
  for (const c of existingCollections) colByName[c.name] = c;

  const existingVarIdByPathDot: { [dot: string]: string } = {};
  for (const c of existingCollections) {
    const cDisplay = c.name;
    for (const vid of c.variableIds) {
      const variable = variablesById.get(vid);
      if (!variable) continue;
      const varSegs = variable.name.split('/');
      indexVarKeys(existingVarIdByPathDot, cDisplay, varSegs, variable.id);
    }
  }

  // ---- build slug→display mapping for collections (existing + incoming)
  const knownCollections = new Set<string>(Object.keys(colByName));
  const displayBySlug: { [slug: string]: string } = {};
  for (const name of knownCollections) displayBySlug[slugSegment(name)] = name;
  for (const t of graph.tokens) {
    const name = t.path[0];
    knownCollections.add(name);
    displayBySlug[slugSegment(name)] = name;
  }

  // ---- buckets for Pass 1a (direct values) and 1b (alias-only)
  const directTokens: TokenNode[] = [];
  const aliasOnlyTokens: TokenNode[] = [];
  const typographyTokens: TokenNode[] = [];

  for (const t of graph.tokens) {
    if (t.type === 'typography') {
      typographyTokens.push(t);
      continue;
    }
    const hasDirect = tokenHasDirectValue(t);
    const hasAlias = tokenHasAlias(t);

    if (hasDirect) {
      directTokens.push(t);
    } else if (hasAlias) {
      aliasOnlyTokens.push(t);
    } else {
      logWarn(`Skipped ${t.type} token “${t.path.join('/')}” — needs a ${t.type} $value or an alias reference.`);
    }

    // Mild note: string tokens that look boolean but have no explicit hint
    if (t.type === 'string' && !readFigmaVariableTypeHint(t) && tokenHasBooleanLikeString(t)) {
      logInfo(`Note: “${t.path.join('/')}” has string values "true"/"false" but no $extensions.com.figma.variableType hint; keeping STRING in Figma.`);
    }
  }


  // helper to ensure collection exists (only when we actually create a var)
  function ensureCollection(name: string): VariableCollection {
    let col = colByName[name];
    if (!col) {
      col = variablesApi.createVariableCollection(name);
      colByName[name] = col;
      knownCollections.add(name);
      displayBySlug[slugSegment(name)] = name;
      collectionNameById.set(col.id, name);
    }
    return col;
  }

  let createdTextStyles = 0;

  async function importTypographyTokens(tokens: TokenNode[]): Promise<void> {
    if (tokens.length === 0) return;

    const canReadStyles = typeof figma.getLocalTextStyles === 'function';
    const canCreateStyles = typeof figma.createTextStyle === 'function';
    if (!canReadStyles || !canCreateStyles) {
      logWarn('Typography tokens present but text style APIs are unavailable in this version of Figma. Skipping typography import.');
      return;
    }

    const stylesById = new Map<string, TextStyle>();
    const stylesByName = new Map<string, TextStyle>();
    const localStyles = figma.getLocalTextStyles();
    for (const style of localStyles) {
      stylesById.set(style.id, style);
      stylesByName.set(style.name, style);
    }

    const loadedFonts = new Set<string>();

    for (const token of tokens) {
      const styleSegments = token.path.slice(1);
      const styleName = styleSegments.join('/');
      if (!styleName) {
        logWarn(`Skipped typography token “${token.path.join('/')}” — requires a style name after the collection.`);
        continue;
      }

      const nameCheck = typographyNamesMatchExtensions(token, styleName);
      if (!nameCheck.ok) {
        logWarn(nameCheck.reason!);
        continue;
      }

      const ctxKeys = forEachKey(token.byContext);
      let typographyValue: TypographyValue | null = null;
      let typographyContexts = 0;
      for (const ctx of ctxKeys) {
        const val = token.byContext[ctx];
        if (!val) continue;
        if (val.kind === 'typography') {
          typographyContexts++;
          if (!typographyValue) typographyValue = val.value;
        } else if (val.kind === 'alias') {
          logWarn(`Skipped typography alias at “${token.path.join('/')}” in ${ctx} — text styles do not support aliases.`);
        } else {
          logWarn(`Skipped unsupported value for “${token.path.join('/')}” in ${ctx} — expected a typography $value.`);
        }
      }

      if (!typographyValue) {
        logWarn(`Skipped typography token “${token.path.join('/')}” — needs a typography $value.`);
        continue;
      }
      if (typographyContexts > 1) {
        logWarn(`Typography token “${token.path.join('/')}” has multiple contexts. Using the first typography value.`);
      }

      const ext = token.extensions && typeof token.extensions === 'object'
        ? (token.extensions as any)['com.figma']
        : undefined;
      const extStyleId = ext && typeof ext === 'object' && typeof (ext as any).styleID === 'string'
        ? String((ext as any).styleID)
        : undefined;

      let style: TextStyle | null = null;
      let createdStyle = false;
      if (extStyleId) {
        style = stylesById.get(extStyleId) || null;
      }
      if (!style) {
        style = stylesByName.get(styleName) || null;
      }
      if (!style) {
        style = figma.createTextStyle();
        createdStyle = true;
      }
      const { fontName, usedFallback } = typographyFontNameFromValue(typographyValue);
      let appliedFont: FontName | null = null;
      let skipToken = false;
      const tokenPath = token.path.join('/');
      if (fontName) {
        const key = fontName.family + ':::' + fontName.style;
        if (!loadedFonts.has(key)) {
          try {
            await figma.loadFontAsync(fontName);
            loadedFonts.add(key);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logWarn(`Skipped typography token “${tokenPath}” — failed to load font “${fontName.family} ${fontName.style}”. ${msg}`);
            skipToken = true;
          }
        }
        if (!skipToken && loadedFonts.has(key)) {
          appliedFont = fontName;
          if (usedFallback) {
            logInfo(`Typography token “${token.path.join('/')}” is missing a font style. Defaulted to “${fontName.style}”.`);
          }
        }
      } else {
        logWarn(`Skipped typography token “${tokenPath}” — typography token is missing fontFamily.`);
        skipToken = true;
      }

      if (skipToken || !appliedFont) {
        if (createdStyle) {
          try { style.remove(); } catch { /* ignore */ }
        }
        continue;
      }

      const prevName = style.name;
      if (style.name !== styleName) {
        style.name = styleName;
      }
      stylesById.set(style.id, style);
      if (prevName && stylesByName.get(prevName) === style) {
        stylesByName.delete(prevName);
      }
      stylesByName.set(styleName, style);

      if (typeof token.description === 'string' && token.description.trim().length > 0 && style.description !== token.description) {
        try { style.description = token.description; } catch { /* ignore */ }
      }

      if (createdStyle) {
        createdTextStyles++;
      }

      const warnings = applyTypographyValueToTextStyle(style, typographyValue, { fontName: appliedFont });
      for (const warning of warnings) {
        logWarn(`Text style “${styleName}”: ${warning}`);
      }
    }
  }

  // ---- Pass 1a: create direct-value variables, collect ids
  const idByPath: { [dot: string]: string } = {};

  function varNameFromPath(path: string[]): string {
    // everything after the collection joined with '/'
    return path.slice(1).join('/') || (path[0] || 'token');
  }

  for (const t of directTokens) {
    if (t.path.length < 1) continue;

    // enforce strict name match vs $extensions (when present)
    const nameChk = namesMatchExtensions(t);
    if (!nameChk.ok) { logWarn(nameChk.reason!); continue; }

    const collectionName = t.path[0];
    const varName = varNameFromPath(t.path);

    // Do NOT create a collection or variable unless we have at least one *valid* direct value.
    const directCheck = tokenHasAtLeastOneValidDirectValue(t, profile);
    if (!directCheck.ok) {
      if (directCheck.reason) {
        logWarn(`Skipped creating direct ${t.type} token “${t.path.join('/')}” — ${directCheck.reason}`);
      } else if (!directCheck.suppressWarn) {
        logWarn(`Skipped creating direct ${t.type} token “${t.path.join('/')}” — no valid direct values in any context; not creating variable or collection.`);
      }
      continue;
    }

    const col = ensureCollection(collectionName);

    // find existing
    let existingVarId: string | null = null;
    for (const vid of col.variableIds) {
      const cand = variablesById.get(vid) || await variablesApi.getVariableByIdAsync(vid);
      if (cand && !variablesById.has(vid) && cand) variablesById.set(vid, cand);
      if (cand && cand.name === varName) { existingVarId = cand.id; break; }
    }

    let v: Variable | null = null;
    if (existingVarId) {
      v = variablesById.get(existingVarId) || await variablesApi.getVariableByIdAsync(existingVarId);
      if (v && !variablesById.has(existingVarId)) variablesById.set(existingVarId, v);
      if (!v) continue;
    } else {
      const hint = readFigmaVariableTypeHint(t);
      // Strict rule: only honor BOOLEAN hint when DTCG $type is "string".
      const createAs: VariableResolvedDataType =
        (hint === 'BOOLEAN' && t.type === 'string') ? 'BOOLEAN' : resolvedTypeFor(t.type);

      v = variablesApi.createVariable(varName, col, createAs);
      variablesById.set(v.id, v);
    }


    // --- set description if provided (safe & idempotent)
    if (typeof t.description === 'string' && t.description.trim().length > 0 && v.description !== t.description) {
      try { v.description = t.description; } catch { /* ignore */ }
    }

    // Index display & slug for BOTH collection and variable segments
    const varSegs = varName.split('/');
    indexVarKeys(idByPath, collectionName, varSegs, v.id);
  }

  // ---- Pass 1b: create alias-only variables in ROUNDS so intra-collection chains work
  const pending: TokenNode[] = aliasOnlyTokens.slice();
  while (pending.length) {
    let progress = false;
    const nextRound: TokenNode[] = [];

    for (const t of pending) {
      // enforce strict name match vs $extensions (when present)
      const nameChk = namesMatchExtensions(t);
      if (!nameChk.ok) { logWarn(nameChk.reason!); continue; }

      const collectionName = t.path[0];
      const varName = varNameFromPath(t.path);

      // Self keys (display + slug) for skipping self-alias resolvability
      const selfVarSegs = varName.split('/');
      const selfKeys = new Set<string>();
      (function addSelfKeys() {
        const colDisp = collectionName;
        const colSlug = slugSegment(collectionName);
        const varRaw = selfVarSegs;
        const varSlug = selfVarSegs.map(s => slugSegment(s));
        selfKeys.add(dot([colDisp, ...varRaw]));
        selfKeys.add(dot([colDisp, ...varSlug]));
        selfKeys.add(dot([colSlug, ...varRaw]));
        selfKeys.add(dot([colSlug, ...varSlug]));
      })();

      // Is ANY alias context resolvable now? (newly created, direct, or existing doc) — excluding self
      let resolvable = false;
      const ctxKeys = forEachKey(t.byContext);
      for (const ctx of ctxKeys) {
        const val = (t.byContext as any)[ctx];
        if (!val || val.kind !== 'alias') continue;

        const segs = normalizeAliasSegments(val.path, collectionName, displayBySlug, knownCollections);
        const aliasDot = dot(segs);

        if (selfKeys.has(aliasDot)) continue; // ignore self-alias

        if (idByPath[aliasDot] || existingVarIdByPathDot[aliasDot]) {
          resolvable = true;
          break;
        }
      }

      if (!resolvable) {
        // hold for next round
        nextRound.push(t);
        continue;
      }

      // Create the variable now (even if its value will be set in Pass 2)
      const col = ensureCollection(collectionName);

      // find existing
      let existingVarId: string | null = null;
    for (const vid of col.variableIds) {
      const cand = variablesById.get(vid) || await variablesApi.getVariableByIdAsync(vid);
      if (cand && !variablesById.has(vid)) variablesById.set(vid, cand);
      if (cand && cand.name === varName) { existingVarId = cand.id; break; }
    }

    let v: Variable | null = null;
    if (existingVarId) {
      v = variablesById.get(existingVarId) || await variablesApi.getVariableByIdAsync(existingVarId);
      if (v && !variablesById.has(existingVarId)) variablesById.set(existingVarId, v);
      if (!v) continue;
    } else {
      const hint = readFigmaVariableTypeHint(t);
      const createAs: VariableResolvedDataType =
        (hint === 'BOOLEAN' && t.type === 'string') ? 'BOOLEAN' : resolvedTypeFor(t.type);

      v = variablesApi.createVariable(varName, col, createAs);
      variablesById.set(v.id, v);
    }


      // --- set description if provided (safe & idempotent)
      if (typeof t.description === 'string' && t.description.trim().length > 0 && v.description !== t.description) {
        try { v.description = t.description; } catch { /* ignore */ }
      }

      // Index display & slug for BOTH collection and variable segments
      const varSegs = varName.split('/');
      indexVarKeys(idByPath, collectionName, varSegs, v.id);

      progress = true;
    }

    if (!progress) {
      // Nothing more could be created; warn & drop what’s left
      for (const t of nextRound) {
        logWarn(`Alias target not found for “${t.path.join('/')}”. Variable not created.`);
      }
      break;
    }

    // Continue with whatever is still pending
    pending.length = 0;
    Array.prototype.push.apply(pending, nextRound);
  }

  await importTypographyTokens(typographyTokens);

  // ---- Build mode id lookup (collectionName/modeName → modeId)
  const modeIdByKey: { [key: string]: string } = {};
  const colsPost = await variablesApi.getLocalVariableCollectionsAsync();
  for (const c of colsPost) {
    for (const m of c.modes) {
      modeIdByKey[c.name + '/' + m.name] = m.modeId;
    }
  }

  // ---- Pass 2: set values (including aliases) + optional description sync
  for (const node of graph.tokens) {
    // resolve our variable id via any of the 4 keys we indexed
    const collectionName = node.path[0];
    const varName = node.path.slice(1).join('/');
    const varSegs = varName.split('/');
    const possibleSelfKeys: string[] = [];
    (function addSelfKeys() {
      const colDisp = collectionName;
      const colSlug = slugSegment(collectionName);
      const varRaw = varSegs;
      const varSlug = varSegs.map(s => slugSegment(s));
      possibleSelfKeys.push(
        dot([colDisp, ...varRaw]),
        dot([colDisp, ...varSlug]),
        dot([colSlug, ...varRaw]),
        dot([colSlug, ...varSlug]),
      );
    })();
    let varId: string | undefined;
    for (const k of possibleSelfKeys) { varId = idByPath[k]; if (varId) break; }
    if (!varId) continue; // not created (e.g., unresolved alias or name mismatch)

    const targetVar = variablesById.get(varId) || await variablesApi.getVariableByIdAsync(varId);
    if (targetVar && !variablesById.has(varId)) variablesById.set(varId, targetVar);
    if (!targetVar) continue;

    // Optional: keep existing variables' descriptions in sync with incoming IR
    if (typeof node.description === 'string' && node.description.trim().length > 0 && targetVar.description !== node.description) {
      try { targetVar.description = node.description; } catch { /* ignore */ }
    }

    const ctxKeys = forEachKey(node.byContext);
    for (const ctx of ctxKeys) {
      const val = node.byContext[ctx] as any;

      // ensure mode exists (default "Mode 1" when missing)
      let modeId = modeIdByKey[ctx];
      if (!modeId) {
        const parts = ctx.split('/');
        const cName = parts[0];
        const mName = parts.slice(1).join('/') || 'Mode 1';
        const col = colByName[cName];
        if (col) {
          const found = col.modes.find(m => m.name === mName);
          if (found) {
            modeId = found.modeId;
            modeIdByKey[cName + '/' + mName] = modeId;
            modeIdByKey[ctx] = modeId;
          }
          else if (col.modes.length === 1) {
            const loneMode = col.modes[0];
            const prevName = loneMode.name;
            if (prevName !== mName) {
              logWarn(`Collection “${cName}” is limited to a single mode. Renaming “${prevName}” to “${mName}”.`);
              try {
                col.renameMode(loneMode.modeId, mName);
                loneMode.name = mName;
                const keyOld = cName + '/' + prevName;
                delete modeIdByKey[keyOld];
                modeId = loneMode.modeId;
                const keyNew = cName + '/' + mName;
                modeIdByKey[keyNew] = modeId;
                modeIdByKey[ctx] = modeId;
                logInfo(`Renamed mode “${prevName}” → “${mName}” in collection “${cName}”.`);
              } catch (err) {
                const errMsg = err instanceof Error ? err.message : String(err);
                logError(`Failed to rename mode “${prevName}” to “${mName}” in collection “${cName}”. ${errMsg}`);
              }
            } else {
              modeId = loneMode.modeId;
              modeIdByKey[cName + '/' + mName] = modeId;
              modeIdByKey[ctx] = modeId;
            }
          }
          else {
            try {
              modeId = col.addMode(mName);
              modeIdByKey[cName + '/' + mName] = modeId;
              modeIdByKey[ctx] = modeId;
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              if (message && message.includes('Limited to 1')) {
                const loneMode = col.modes[0];
                const prevName = loneMode?.name || 'Mode 1';
                logWarn(`Unable to add mode “${mName}” to collection “${cName}” because only a single mode is allowed. Renaming existing mode “${prevName}”.`);
                try {
                  if (loneMode) {
                    col.renameMode(loneMode.modeId, mName);
                    loneMode.name = mName;
                    const keyOld = cName + '/' + prevName;
                    delete modeIdByKey[keyOld];
                    modeId = loneMode.modeId;
                    const keyNew = cName + '/' + mName;
                    modeIdByKey[keyNew] = modeId;
                    modeIdByKey[ctx] = modeId;
                    logInfo(`Renamed mode “${prevName}” → “${mName}” in collection “${cName}”.`);
                  }
                  else {
                    logError(`Unable to rename mode in collection “${cName}” because it has no modes.`);
                  }
                } catch (renameErr) {
                  const renameMsg = renameErr instanceof Error ? renameErr.message : String(renameErr);
                  logError(`Failed to rename mode “${prevName}” to “${mName}” in collection “${cName}”. ${renameMsg}`);
                }
              } else {
                logError(`Error while adding mode “${mName}” to collection “${cName}”. ${message}`);
              }
            }
          }
        }
      }
      if (!modeId) continue;

      if (val.kind === 'alias') {
        const currentCollection = collectionName;

        // Build candidates (as-written, relative, slug→display for first seg).
        const rawSegs = Array.isArray(val.path)
          ? (val.path as string[]).slice()
          : String(val.path).split('.').map(s => s.trim()).filter(Boolean);

        const candidates: string[][] = [];
        if (rawSegs.length > 0) candidates.push(rawSegs);
        candidates.push([currentCollection, ...rawSegs]);
        if (rawSegs.length > 0 && displayBySlug[rawSegs[0]]) {
          candidates.push([displayBySlug[rawSegs[0]], ...rawSegs.slice(1)]);
        }

        let targetId: string | undefined;
        for (const cand of candidates) {
          // Try exact, and also a fully-slugged form (for non-color types referencing other collections)
          const exact = dot(cand);
          const fullySlugged = dot([slugSegment(cand[0] || ''), ...cand.slice(1).map(s => slugSegment(s))]);

          targetId =
            idByPath[exact] ||
            idByPath[fullySlugged] ||
            existingVarIdByPathDot[exact] ||
            existingVarIdByPathDot[fullySlugged];

          if (targetId) break;
        }

        if (!targetId) {
          logWarn(`Alias target not found while setting “${node.path.join('/')}” in ${ctx}. Skipped this context.`);
          continue;
        }

        // prevent self-alias even if resolvable
        if (targetId === targetVar.id) {
          logWarn(`Self-alias is not allowed for “${node.path.join('/')}” in ${ctx}. Skipped this context.`);
          continue;
        }

        const aliasObj = await variablesApi.createVariableAliasByIdAsync(targetId);
        targetVar.setValueForMode(modeId, aliasObj);
        continue;
      }
      else if (val.kind === 'color') {
        // STRICT: validate DTCG color object shape first
        const shape = isDtcgColorShapeValid(val.value);
        if (!shape.ok) {
          logWarn(`Skipped setting color for “${node.path.join('/')}” in ${ctx} — ${shape.reason}.`);
          continue;
        }

        // STRICT: check representability in this document profile
        const cs = (val.value.colorSpace || 'srgb').toLowerCase();
        if (!isColorSpaceRepresentableInDocument(cs, canonicalProfile)) {
          if (cs === 'display-p3' && canonicalProfile === 'SRGB') {
            logWarn(
              `Skipped “${node.path.join('/')}” in ${ctx}: the token is display-p3 but this file is set to sRGB. ` +
              'Open File → File Settings → Color Space and switch to Display P3, or convert the token to sRGB.'
            );
          } else {
            logWarn(`Skipped setting color for “${node.path.join('/')}” in ${ctx} — colorSpace “${cs}” isn’t representable in this document (${canonicalProfile}).`);
          }
          continue;
        }

        // Safe normalization (no destructive clamping before checks)
        const norm = normalizeDtcgColorValue(val.value);
        maybeWarnColorMismatch(node, ctx, typeof norm.hex === 'string' ? norm.hex : null);
        const rgba = dtcgToFigmaRGBA(norm, profile);
        targetVar.setValueForMode(modeId, { r: rgba.r, g: rgba.g, b: rgba.b, a: rgba.a });

      } else if (val.kind === 'number' || val.kind === 'string' || val.kind === 'boolean') {
        // BOOLEAN round-trip:
        // - If the Figma variable was created as BOOLEAN (by hint), accept true/false safely.
        // - If it's STRING but IR provides a boolean, downgrade to "true"/"false".
        if (targetVar.resolvedType === 'BOOLEAN') {
          if (val.kind === 'boolean') {
            targetVar.setValueForMode(modeId, !!val.value);
          } else if (val.kind === 'string' && looksBooleanString(val.value)) {
            targetVar.setValueForMode(modeId, /^true$/i.test(val.value.trim()));
          } else {
            logWarn(`Skipped setting non-boolean value for BOOLEAN variable “${node.path.join('/')}” in ${ctx}.`);
          }
        } else if (val.kind === 'boolean') {
          // Figma var is not BOOLEAN → set as string "true"/"false" (non-breaking)
          targetVar.setValueForMode(modeId, val.value ? 'true' : 'false');
        } else {
          targetVar.setValueForMode(modeId, val.value);
        }
      }
    }
  }

  // After Pass 2 and after setting values
  for (const name of Object.keys(colByName)) {
    const col = colByName[name];
    if (col && col.variableIds.length === 0) {
      try { col.remove(); } catch { /* ignore */ }
      knownCollections.delete(name);
      delete colByName[name];
    }
  }
  return { createdTextStyles };
}
