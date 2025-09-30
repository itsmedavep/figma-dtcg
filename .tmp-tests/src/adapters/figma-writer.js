"use strict";
// src/adapters/figma-writer.ts
// Apply TokenGraph changes back into Figma's variables API safely and predictably.
// - Buckets tokens so we only mutate what the document can represent
// - Preserves figma-specific metadata hints to keep round trips stable
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeIRToFigma = writeIRToFigma;
const normalize_1 = require("../core/normalize");
const figma_cache_1 = require("../core/figma-cache");
const color_1 = require("../core/color");
// ---------- logging to UI (no toasts) ----------
/** Post a quiet log line to the UI without risking plugin runtime errors. */
function logInfo(msg) {
    try {
        figma.ui?.postMessage({ type: 'INFO', payload: { message: msg } });
    }
    catch { /* ignore */ }
}
function logWarn(msg) { logInfo('Warning: ' + msg); }
function logError(msg) { logInfo('Error: ' + msg); }
// ---------- helpers ----------
// ---------- boolean import helpers (hint + mild note) ----------
/** Read the explicit figma type hint from $extensions.com.figma.variableType. */
function readFigmaVariableTypeHint(t) {
    try {
        const ext = t.extensions && typeof t.extensions === 'object'
            ? t.extensions['com.figma']
            : undefined;
        const vt = ext && typeof ext === 'object' ? ext.variableType : undefined;
        return vt === 'BOOLEAN' ? 'BOOLEAN' : undefined;
    }
    catch {
        return undefined;
    }
}
/** Detect string payloads that look like boolean literals so we can warn users. */
function looksBooleanString(s) {
    return typeof s === 'string' && /^(true|false)$/i.test(s.trim());
}
/** Identify tokens that store booleans-as-strings so we can hint at safer conversion. */
function tokenHasBooleanLikeString(t) {
    const byCtx = t.byContext || {};
    for (const k in byCtx) {
        const v = byCtx[k];
        if (!v || v.kind === 'alias')
            continue;
        if (v.kind === 'string' && looksBooleanString(v.value))
            return true;
    }
    return false;
}
/** Token has at least one non-alias, correctly-typed value in any context. */
function tokenHasDirectValue(t) {
    const byCtx = t.byContext || {};
    for (const k in byCtx) {
        const v = byCtx[k];
        if (!v)
            continue;
        if (t.type === 'color') {
            // Bucketing heuristic only — Pass 1a will do the strict checks.
            if (v.kind === 'color' && (0, color_1.isValidDtcgColorValueObject)(v.value))
                return true;
        }
        else {
            // number/string/boolean must match kind exactly
            if (v.kind === t.type)
                return true;
        }
    }
    return false;
}
function tokenHasAtLeastOneValidDirectValue(t, profile) {
    const canonicalProfile = (0, color_1.normalizeDocumentProfile)(profile);
    const byCtx = t.byContext || {};
    let lastReason;
    let reasonAlreadyLogged = false;
    for (const ctx in byCtx) {
        const v = byCtx[ctx];
        if (!v || v.kind === 'alias')
            continue;
        if (t.type === 'color') {
            if (v.kind !== 'color')
                continue;
            // STRICT 1: shape (supported colorSpace; 3 numeric components; alpha number in [0..1] or undefined)
            const shape = (0, color_1.isDtcgColorShapeValid)(v.value);
            if (!shape.ok) {
                lastReason = `color in ${ctx} is invalid: ${shape.reason}`;
                continue;
            }
            // STRICT 2: representable in this document profile (sRGB doc: only 'srgb'; P3 doc: 'srgb' and 'display-p3')
            const cs = (v.value.colorSpace || 'srgb').toLowerCase();
            if (!(0, color_1.isColorSpaceRepresentableInDocument)(cs, canonicalProfile)) {
                lastReason = `colorSpace “${cs}” isn’t representable in this document (${canonicalProfile}).`;
                if (!reasonAlreadyLogged) {
                    logWarn(`Skipped creating direct color at “${t.path.join('/')}” in ${ctx} — ${lastReason}`);
                    reasonAlreadyLogged = true;
                }
                continue;
            }
            return { ok: true };
        }
        else if (t.type === 'number' || t.type === 'string' || t.type === 'boolean') {
            if (v.kind === t.type)
                return { ok: true };
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
function resolvedTypeFor(t) {
    if (t === 'color')
        return 'COLOR';
    if (t === 'number')
        return 'FLOAT';
    if (t === 'string')
        return 'STRING';
    return 'BOOLEAN';
}
/** Enumerate own-string keys without trusting prototype state. */
function forEachKey(obj) {
    const out = [];
    if (!obj)
        return out;
    for (const k in obj)
        if (Object.prototype.hasOwnProperty.call(obj, k))
            out.push(k);
    return out;
}
/** Token has at least one alias among its contexts. */
function tokenHasAlias(t) {
    const byCtx = t.byContext || {};
    for (const k in byCtx) {
        const v = byCtx[k];
        if (v && v.kind === 'alias')
            return true;
    }
    return false;
}
/** Compare imported hex values against stored metadata and raise a gentle warning if they diverge. */
function maybeWarnColorMismatch(t, ctx, importedHexOrNull) {
    try {
        const extAll = t.extensions && typeof t.extensions === 'object' ? t.extensions['com.figma'] : undefined;
        if (!extAll || typeof extAll !== 'object')
            return;
        let hintHex;
        if (typeof extAll.hex === 'string')
            hintHex = extAll.hex;
        const pc = extAll.perContext && typeof extAll.perContext === 'object' ? extAll.perContext : undefined;
        if (!hintHex && pc && pc[ctx] && typeof pc[ctx].hex === 'string')
            hintHex = pc[ctx].hex;
        if (!hintHex || !importedHexOrNull)
            return;
        const a = hintHex.trim().toLowerCase();
        const b = importedHexOrNull.trim().toLowerCase();
        if (a !== b)
            logWarn(`color mismatch for “${t.path.join('/')}” in ${ctx}. Using $value over $extensions.`);
    }
    catch { /* never throw from logging */ }
}
/** Normalize alias path segments and map collection slugs back to display names when possible. */
function normalizeAliasSegments(rawPath, currentCollection, displayBySlug, knownCollections) {
    const segs = Array.isArray(rawPath)
        ? rawPath.slice()
        : String(rawPath).split('.').map(s => s.trim()).filter(Boolean);
    if (segs.length === 0)
        return [currentCollection];
    const first = segs[0];
    if (knownCollections.has(first))
        return segs;
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
function namesMatchExtensions(t) {
    const ext = t.extensions && typeof t.extensions === 'object'
        ? t.extensions['com.figma']
        : undefined;
    if (!ext || typeof ext !== 'object')
        return { ok: true };
    const pathCollection = t.path[0];
    const pathVariable = t.path.slice(1).join('/'); // exact JSON key
    let expectedCollection = typeof ext.collectionName === 'string' ? ext.collectionName : undefined;
    let expectedVariable = typeof ext.variableName === 'string' ? ext.variableName : undefined;
    // If top-level missing, try perContext (lenient)
    if (!expectedCollection || !expectedVariable) {
        const per = ext.perContext;
        if (per && typeof per === 'object') {
            const ctxKeys = forEachKey(t.byContext);
            let ctxToUse;
            for (const k of ctxKeys) {
                if (per[k] && typeof per[k] === 'object') {
                    ctxToUse = k;
                    break;
                }
            }
            if (!ctxToUse) {
                for (const k in per) {
                    if (Object.prototype.hasOwnProperty.call(per, k) && per[k] && typeof per[k] === 'object') {
                        ctxToUse = k;
                        break;
                    }
                }
            }
            if (ctxToUse) {
                const ctxData = per[ctxToUse];
                if (!expectedCollection && typeof ctxData.collectionName === 'string')
                    expectedCollection = ctxData.collectionName;
                if (!expectedVariable && typeof ctxData.variableName === 'string')
                    expectedVariable = ctxData.variableName;
            }
        }
    }
    if (typeof expectedCollection === 'string' && expectedCollection !== pathCollection) {
        return {
            ok: false,
            reason: `Skipping “${t.path.join('/')}” — $extensions.com.figma.collectionName (“${expectedCollection}”) ` +
                `doesn’t match JSON group (“${pathCollection}”).`
        };
    }
    if (typeof expectedVariable === 'string' && expectedVariable !== pathVariable) {
        return {
            ok: false,
            reason: `Skipping “${t.path.join('/')}” — $extensions.com.figma.variableName (“${expectedVariable}”) ` +
                `doesn’t match JSON key (“${pathVariable}”).`
        };
    }
    return { ok: true };
}
// --- Key indexing helpers: index display + slug for BOTH collection and variable segments
function dot(segs) { return segs.join('.'); }
function indexVarKeys(map, collectionDisplay, varSegsRaw, varId) {
    const colDisp = collectionDisplay;
    const colSlug = (0, normalize_1.slugSegment)(collectionDisplay);
    const varRaw = varSegsRaw;
    const varSlug = varSegsRaw.map(s => (0, normalize_1.slugSegment)(s));
    // 1) Display collection + Raw variable segs
    map[dot([colDisp, ...varRaw])] = varId;
    // 2) Display collection + Slugged variable segs
    map[dot([colDisp, ...varSlug])] = varId;
    // 3) Slugged collection + Raw variable segs
    map[dot([colSlug, ...varRaw])] = varId;
    // 4) Slugged collection + Slugged variable segs
    map[dot([colSlug, ...varSlug])] = varId;
}
async function writeIRToFigma(graph) {
    const profile = figma.root.documentColorProfile;
    const canonicalProfile = (0, color_1.normalizeDocumentProfile)(profile);
    const variablesApi = figma.variables;
    logInfo(`Import: document color profile ${String(profile)} (canonical ${canonicalProfile}).`);
    const { collections: existingCollections, variablesById, collectionNameById } = await (0, figma_cache_1.loadCollectionsSnapshot)(variablesApi);
    const colByName = {};
    for (const c of existingCollections)
        colByName[c.name] = c;
    const existingVarIdByPathDot = {};
    for (const c of existingCollections) {
        const cDisplay = c.name;
        for (const vid of c.variableIds) {
            const variable = variablesById.get(vid);
            if (!variable)
                continue;
            const varSegs = variable.name.split('/');
            indexVarKeys(existingVarIdByPathDot, cDisplay, varSegs, variable.id);
        }
    }
    // ---- build slug→display mapping for collections (existing + incoming)
    const knownCollections = new Set(Object.keys(colByName));
    const displayBySlug = {};
    for (const name of knownCollections)
        displayBySlug[(0, normalize_1.slugSegment)(name)] = name;
    for (const t of graph.tokens) {
        const name = t.path[0];
        knownCollections.add(name);
        displayBySlug[(0, normalize_1.slugSegment)(name)] = name;
    }
    // ---- buckets for Pass 1a (direct values) and 1b (alias-only)
    const directTokens = [];
    const aliasOnlyTokens = [];
    for (const t of graph.tokens) {
        const hasDirect = tokenHasDirectValue(t);
        const hasAlias = tokenHasAlias(t);
        if (hasDirect) {
            directTokens.push(t);
        }
        else if (hasAlias) {
            aliasOnlyTokens.push(t);
        }
        else {
            logWarn(`Skipped ${t.type} token “${t.path.join('/')}” — needs a ${t.type} $value or an alias reference.`);
        }
        // Mild note: string tokens that look boolean but have no explicit hint
        if (t.type === 'string' && !readFigmaVariableTypeHint(t) && tokenHasBooleanLikeString(t)) {
            logInfo(`Note: “${t.path.join('/')}” has string values "true"/"false" but no $extensions.com.figma.variableType hint; keeping STRING in Figma.`);
        }
    }
    // helper to ensure collection exists (only when we actually create a var)
    function ensureCollection(name) {
        let col = colByName[name];
        if (!col) {
            col = variablesApi.createVariableCollection(name);
            colByName[name] = col;
            knownCollections.add(name);
            displayBySlug[(0, normalize_1.slugSegment)(name)] = name;
            collectionNameById.set(col.id, name);
        }
        return col;
    }
    // ---- Pass 1a: create direct-value variables, collect ids
    const idByPath = {};
    function varNameFromPath(path) {
        // everything after the collection joined with '/'
        return path.slice(1).join('/') || (path[0] || 'token');
    }
    for (const t of directTokens) {
        if (t.path.length < 1)
            continue;
        // enforce strict name match vs $extensions (when present)
        const nameChk = namesMatchExtensions(t);
        if (!nameChk.ok) {
            logWarn(nameChk.reason);
            continue;
        }
        const collectionName = t.path[0];
        const varName = varNameFromPath(t.path);
        // Do NOT create a collection or variable unless we have at least one *valid* direct value.
        const directCheck = tokenHasAtLeastOneValidDirectValue(t, profile);
        if (!directCheck.ok) {
            if (directCheck.reason) {
                logWarn(`Skipped creating direct ${t.type} token “${t.path.join('/')}” — ${directCheck.reason}`);
            }
            else if (!directCheck.suppressWarn) {
                logWarn(`Skipped creating direct ${t.type} token “${t.path.join('/')}” — no valid direct values in any context; not creating variable or collection.`);
            }
            continue;
        }
        const col = ensureCollection(collectionName);
        // find existing
        let existingVarId = null;
        for (const vid of col.variableIds) {
            const cand = variablesById.get(vid) || await variablesApi.getVariableByIdAsync(vid);
            if (cand && !variablesById.has(vid) && cand)
                variablesById.set(vid, cand);
            if (cand && cand.name === varName) {
                existingVarId = cand.id;
                break;
            }
        }
        let v = null;
        if (existingVarId) {
            v = variablesById.get(existingVarId) || await variablesApi.getVariableByIdAsync(existingVarId);
            if (v && !variablesById.has(existingVarId))
                variablesById.set(existingVarId, v);
            if (!v)
                continue;
        }
        else {
            const hint = readFigmaVariableTypeHint(t);
            // Strict rule: only honor BOOLEAN hint when DTCG $type is "string".
            const createAs = (hint === 'BOOLEAN' && t.type === 'string') ? 'BOOLEAN' : resolvedTypeFor(t.type);
            v = variablesApi.createVariable(varName, col, createAs);
            variablesById.set(v.id, v);
        }
        // --- set description if provided (safe & idempotent)
        if (typeof t.description === 'string' && t.description.trim().length > 0 && v.description !== t.description) {
            try {
                v.description = t.description;
            }
            catch { /* ignore */ }
        }
        // Index display & slug for BOTH collection and variable segments
        const varSegs = varName.split('/');
        indexVarKeys(idByPath, collectionName, varSegs, v.id);
    }
    // ---- Pass 1b: create alias-only variables in ROUNDS so intra-collection chains work
    const pending = aliasOnlyTokens.slice();
    while (pending.length) {
        let progress = false;
        const nextRound = [];
        for (const t of pending) {
            // enforce strict name match vs $extensions (when present)
            const nameChk = namesMatchExtensions(t);
            if (!nameChk.ok) {
                logWarn(nameChk.reason);
                continue;
            }
            const collectionName = t.path[0];
            const varName = varNameFromPath(t.path);
            // Self keys (display + slug) for skipping self-alias resolvability
            const selfVarSegs = varName.split('/');
            const selfKeys = new Set();
            (function addSelfKeys() {
                const colDisp = collectionName;
                const colSlug = (0, normalize_1.slugSegment)(collectionName);
                const varRaw = selfVarSegs;
                const varSlug = selfVarSegs.map(s => (0, normalize_1.slugSegment)(s));
                selfKeys.add(dot([colDisp, ...varRaw]));
                selfKeys.add(dot([colDisp, ...varSlug]));
                selfKeys.add(dot([colSlug, ...varRaw]));
                selfKeys.add(dot([colSlug, ...varSlug]));
            })();
            // Is ANY alias context resolvable now? (newly created, direct, or existing doc) — excluding self
            let resolvable = false;
            const ctxKeys = forEachKey(t.byContext);
            for (const ctx of ctxKeys) {
                const val = t.byContext[ctx];
                if (!val || val.kind !== 'alias')
                    continue;
                const segs = normalizeAliasSegments(val.path, collectionName, displayBySlug, knownCollections);
                const aliasDot = dot(segs);
                if (selfKeys.has(aliasDot))
                    continue; // ignore self-alias
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
            let existingVarId = null;
            for (const vid of col.variableIds) {
                const cand = variablesById.get(vid) || await variablesApi.getVariableByIdAsync(vid);
                if (cand && !variablesById.has(vid))
                    variablesById.set(vid, cand);
                if (cand && cand.name === varName) {
                    existingVarId = cand.id;
                    break;
                }
            }
            let v = null;
            if (existingVarId) {
                v = variablesById.get(existingVarId) || await variablesApi.getVariableByIdAsync(existingVarId);
                if (v && !variablesById.has(existingVarId))
                    variablesById.set(existingVarId, v);
                if (!v)
                    continue;
            }
            else {
                const hint = readFigmaVariableTypeHint(t);
                const createAs = (hint === 'BOOLEAN' && t.type === 'string') ? 'BOOLEAN' : resolvedTypeFor(t.type);
                v = variablesApi.createVariable(varName, col, createAs);
                variablesById.set(v.id, v);
            }
            // --- set description if provided (safe & idempotent)
            if (typeof t.description === 'string' && t.description.trim().length > 0 && v.description !== t.description) {
                try {
                    v.description = t.description;
                }
                catch { /* ignore */ }
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
    const modeIdByKey = {};
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
        const possibleSelfKeys = [];
        (function addSelfKeys() {
            const colDisp = collectionName;
            const colSlug = (0, normalize_1.slugSegment)(collectionName);
            const varRaw = varSegs;
            const varSlug = varSegs.map(s => (0, normalize_1.slugSegment)(s));
            possibleSelfKeys.push(dot([colDisp, ...varRaw]), dot([colDisp, ...varSlug]), dot([colSlug, ...varRaw]), dot([colSlug, ...varSlug]));
        })();
        let varId;
        for (const k of possibleSelfKeys) {
            varId = idByPath[k];
            if (varId)
                break;
        }
        if (!varId)
            continue; // not created (e.g., unresolved alias or name mismatch)
        const targetVar = variablesById.get(varId) || await variablesApi.getVariableByIdAsync(varId);
        if (targetVar && !variablesById.has(varId))
            variablesById.set(varId, targetVar);
        if (!targetVar)
            continue;
        // Optional: keep existing variables' descriptions in sync with incoming IR
        if (typeof node.description === 'string' && node.description.trim().length > 0 && targetVar.description !== node.description) {
            try {
                targetVar.description = node.description;
            }
            catch { /* ignore */ }
        }
        const ctxKeys = forEachKey(node.byContext);
        for (const ctx of ctxKeys) {
            const val = node.byContext[ctx];
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
            if (!modeId)
                continue;
            if (val.kind === 'alias') {
                const currentCollection = collectionName;
                // Build candidates (as-written, relative, slug→display for first seg).
                const rawSegs = Array.isArray(val.path)
                    ? val.path.slice()
                    : String(val.path).split('.').map(s => s.trim()).filter(Boolean);
                const candidates = [];
                if (rawSegs.length > 0)
                    candidates.push(rawSegs);
                candidates.push([currentCollection, ...rawSegs]);
                if (rawSegs.length > 0 && displayBySlug[rawSegs[0]]) {
                    candidates.push([displayBySlug[rawSegs[0]], ...rawSegs.slice(1)]);
                }
                let targetId;
                for (const cand of candidates) {
                    // Try exact, and also a fully-slugged form (for non-color types referencing other collections)
                    const exact = dot(cand);
                    const fullySlugged = dot([(0, normalize_1.slugSegment)(cand[0] || ''), ...cand.slice(1).map(s => (0, normalize_1.slugSegment)(s))]);
                    targetId =
                        idByPath[exact] ||
                            idByPath[fullySlugged] ||
                            existingVarIdByPathDot[exact] ||
                            existingVarIdByPathDot[fullySlugged];
                    if (targetId)
                        break;
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
                const shape = (0, color_1.isDtcgColorShapeValid)(val.value);
                if (!shape.ok) {
                    logWarn(`Skipped setting color for “${node.path.join('/')}” in ${ctx} — ${shape.reason}.`);
                    continue;
                }
                // STRICT: check representability in this document profile
                const cs = (val.value.colorSpace || 'srgb').toLowerCase();
                if (!(0, color_1.isColorSpaceRepresentableInDocument)(cs, canonicalProfile)) {
                    if (cs === 'display-p3' && canonicalProfile === 'SRGB') {
                        logWarn(`Skipped “${node.path.join('/')}” in ${ctx}: the token is display-p3 but this file is set to sRGB. ` +
                            'Open File → File Settings → Color Space and switch to Display P3, or convert the token to sRGB.');
                    }
                    else {
                        logWarn(`Skipped setting color for “${node.path.join('/')}” in ${ctx} — colorSpace “${cs}” isn’t representable in this document (${canonicalProfile}).`);
                    }
                    continue;
                }
                // Safe normalization (no destructive clamping before checks)
                const norm = (0, color_1.normalizeDtcgColorValue)(val.value);
                maybeWarnColorMismatch(node, ctx, typeof norm.hex === 'string' ? norm.hex : null);
                const rgba = (0, color_1.dtcgToFigmaRGBA)(norm, profile);
                targetVar.setValueForMode(modeId, { r: rgba.r, g: rgba.g, b: rgba.b, a: rgba.a });
            }
            else if (val.kind === 'number' || val.kind === 'string' || val.kind === 'boolean') {
                // BOOLEAN round-trip:
                // - If the Figma variable was created as BOOLEAN (by hint), accept true/false safely.
                // - If it's STRING but IR provides a boolean, downgrade to "true"/"false".
                if (targetVar.resolvedType === 'BOOLEAN') {
                    if (val.kind === 'boolean') {
                        targetVar.setValueForMode(modeId, !!val.value);
                    }
                    else if (val.kind === 'string' && looksBooleanString(val.value)) {
                        targetVar.setValueForMode(modeId, /^true$/i.test(val.value.trim()));
                    }
                    else {
                        logWarn(`Skipped setting non-boolean value for BOOLEAN variable “${node.path.join('/')}” in ${ctx}.`);
                    }
                }
                else if (val.kind === 'boolean') {
                    // Figma var is not BOOLEAN → set as string "true"/"false" (non-breaking)
                    targetVar.setValueForMode(modeId, val.value ? 'true' : 'false');
                }
                else {
                    targetVar.setValueForMode(modeId, val.value);
                }
            }
        }
    }
    // After Pass 2 and after setting values
    for (const name of Object.keys(colByName)) {
        const col = colByName[name];
        if (col && col.variableIds.length === 0) {
            try {
                col.remove();
            }
            catch { /* ignore */ }
            knownCollections.delete(name);
            delete colByName[name];
        }
    }
}
