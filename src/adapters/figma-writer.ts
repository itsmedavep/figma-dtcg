// src/adapters/figma-writer.ts
// Apply IR TokenGraph -> Figma variables (create/update, then set per-mode values)

import { slugSegment } from '../core/normalize';
import { type TokenGraph, type TokenNode, type PrimitiveType } from '../core/ir';

import {
  dtcgToFigmaRGBA,
  type DocumentProfile,
  isValidDtcgColorValueObject, // kept for bucketing parity
  normalizeDtcgColorValue,
  isDtcgColorInUnitRange,       // kept because tokenHasDirectValue already uses it; harmless to retain
  isDtcgColorShapeValid,
  isColorSpaceRepresentableInDocument
} from '../core/color';

// ---------- logging to UI (no toasts) ----------
function logInfo(msg: string) {
  try { figma.ui?.postMessage({ type: 'INFO', payload: { message: msg } }); } catch { /* ignore */ }
}
function logWarn(msg: string) { logInfo('Warning: ' + msg); }
function logError(msg: string) { logInfo('Error: ' + msg); }

// ---------- helpers ----------

// Token has at least one non-alias, correctly-typed value in any context
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

// True if token has at least one *settable* direct value in any context.
// (Color requires strict shape + document representability; other primitives just need correct kind.)
function tokenHasAtLeastOneValidDirectValue(t: TokenNode, profile: DocumentProfile): boolean {
  const byCtx = t.byContext || {};
  for (const ctx in byCtx) {
    const v = (byCtx as any)[ctx];
    if (!v || v.kind === 'alias') continue;

    if (t.type === 'color') {
      if (v.kind !== 'color') continue;

      // STRICT 1: shape (supported colorSpace; 3 numeric components; alpha number in [0..1] or undefined)
      const shape = isDtcgColorShapeValid(v.value);
      if (!shape.ok) continue;

      // STRICT 2: representable in this document profile (sRGB doc: only 'srgb'; P3 doc: 'srgb' and 'display-p3')
      const cs = (v.value.colorSpace || 'srgb').toLowerCase();
      if (!isColorSpaceRepresentableInDocument(cs, profile)) continue;

      return true;
    } else if (t.type === 'number' || t.type === 'string' || t.type === 'boolean') {
      if (v.kind === t.type) return true;
    }
  }
  return false;
}


function resolvedTypeFor(t: PrimitiveType): VariableResolvedDataType {
  if (t === 'color') return 'COLOR';
  if (t === 'number') return 'FLOAT';
  if (t === 'string') return 'STRING';
  return 'BOOLEAN';
}
function forEachKey<T>(obj: { [k: string]: T } | undefined): string[] {
  const out: string[] = [];
  if (!obj) return out;
  for (const k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) out.push(k);
  return out;
}

// Token has at least one alias among its contexts
function tokenHasAlias(t: TokenNode): boolean {
  const byCtx = t.byContext || {};
  for (const k in byCtx) {
    const v = byCtx[k] as any;
    if (v && v.kind === 'alias') return true;
  }
  return false;
}

// Compare value-hex vs extensions-hex and warn (but prefer $value)
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

// Normalize alias path segments (array or string) and adjust first segment:
// - If first segment matches a known collection, keep it.
// - Else if it matches a slug of a known collection, replace with the display name.
// - Else treat as relative to the current token’s collection and prefix it.
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

// ---- strict name check helper (extensions vs JSON path)
function namesMatchExtensions(t: TokenNode): { ok: boolean; reason?: string } {
  // Only care about com.figma
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

  // Per your note: you only use com.figma; still, if top-level absent but perContext exists, be lenient
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

export async function writeIRToFigma(graph: TokenGraph): Promise<void> {
  const profile = figma.root.documentColorProfile as DocumentProfile;
  const variablesApi = figma.variables;

  // ---- snapshot existing collections + variables
  const existingCollections = await variablesApi.getLocalVariableCollectionsAsync();
  const colByName: { [name: string]: VariableCollection } = {};
  for (const c of existingCollections) colByName[c.name] = c;

  // Build existing variables map keyed by display/slug *for collection and variable segments*
  const existing = await variablesApi.getLocalVariableCollectionsAsync();
  const existingVarIdByPathDot: { [dot: string]: string } = {};
  for (const c of existing) {
    const cDisplay = c.name;
    for (const vid of c.variableIds) {
      const v = await variablesApi.getVariableByIdAsync(vid);
      if (!v) continue;
      const varSegs = v.name.split('/'); // keep exact segs as Figma stores them
      indexVarKeys(existingVarIdByPathDot, cDisplay, varSegs, v.id);
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

  for (const t of graph.tokens) {
    const hasDirect = tokenHasDirectValue(t);
    const hasAlias = tokenHasAlias(t);

    if (hasDirect) {
      directTokens.push(t);
    } else if (hasAlias) {
      aliasOnlyTokens.push(t);
    } else {
      logWarn(`Skipped ${t.type} token “${t.path.join('/')}” — needs a ${t.type} $value or an alias reference.`);
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
    }
    return col;
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
    if (!tokenHasAtLeastOneValidDirectValue(t, profile)) {

      logWarn(`Skipped creating direct ${t.type} token “${t.path.join('/')}” — no valid direct values in any context; not creating variable or collection.`);
      continue;
    }

    const col = ensureCollection(collectionName);

    // find existing
    let existingVarId: string | null = null;
    for (const vid of col.variableIds) {
      const cand = await variablesApi.getVariableByIdAsync(vid);
      if (cand && cand.name === varName) { existingVarId = cand.id; break; }
    }

    let v: Variable;
    if (existingVarId) {
      const got = await variablesApi.getVariableByIdAsync(existingVarId);
      if (!got) continue;
      v = got;
    } else {
      v = variablesApi.createVariable(varName, col, resolvedTypeFor(t.type));
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
        const cand = await variablesApi.getVariableByIdAsync(vid);
        if (cand && cand.name === varName) { existingVarId = cand.id; break; }
      }

      let v: Variable;
      if (existingVarId) {
        const got = await variablesApi.getVariableByIdAsync(existingVarId);
        if (!got) continue;
        v = got;
      } else {
        v = variablesApi.createVariable(varName, col, resolvedTypeFor(t.type));
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

  // ---- Build mode id lookup (collectionName/modeName → modeId)
  const modeIdByKey: { [key: string]: string } = {};
  const colsPost = await variablesApi.getLocalVariableCollectionsAsync();
  for (const c of colsPost) {
    for (const m of c.modes) {
      modeIdByKey[c.name + '/' + m.name] = m.modeId;
    }
  }

  // ---- Pass 2: set values (including aliases)
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

    const targetVar = await variablesApi.getVariableByIdAsync(varId);
    if (!targetVar) continue;

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
          modeId = found ? found.modeId : col.addMode(mName);
          modeIdByKey[ctx] = modeId;
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
        if (!isColorSpaceRepresentableInDocument(cs, profile)) {
          logWarn(`Skipped setting color for “${node.path.join('/')}” in ${ctx} — colorSpace “${cs}” isn’t representable in this document (${profile}).`);
          continue;
        }

        // Safe normalization (no destructive clamping before checks)
        const norm = normalizeDtcgColorValue(val.value);
        maybeWarnColorMismatch(node, ctx, typeof norm.hex === 'string' ? norm.hex : null);
        const rgba = dtcgToFigmaRGBA(norm, profile);
        targetVar.setValueForMode(modeId, { r: rgba.r, g: rgba.g, b: rgba.b, a: rgba.a });

      } else if (val.kind === 'number' || val.kind === 'string' || val.kind === 'boolean') {
        targetVar.setValueForMode(modeId, val.value);
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
}
