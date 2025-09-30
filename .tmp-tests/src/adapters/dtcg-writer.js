"use strict";
// src/adapters/dtcg-writer.ts
// Convert the IR graph back into DTCG JSON while keeping alias strings readable.
// - Emits groups directly from the IR path so git diffs stay predictable
// - Uses Figma display metadata only for alias references to preserve user intent
Object.defineProperty(exports, "__esModule", { value: true });
exports.serialize = serialize;
// ---------- tiny utils (lookup-only; never used for emission) ----------
/** Join path segments with '.' for alias lookups. */
function dotRaw(segs) {
    return segs.join('.');
}
/** Matching-only slug so aliases written in slug form still resolve (never for emission). */
function slugForMatch(s) {
    return s
        .trim()
        .replace(/\s+/g, '-') // collapse whitespace to single '-'
        .replace(/-+/g, '-') // collapse multiple '-' to one
        .toLowerCase();
}
/**
 * Extract Figma display names for alias emission, preferring per-context overrides.
 * NEVER used for key generation; JSON structure always follows IR paths.
 */
function getFigmaDisplayNames(t, ctx) {
    const extAll = (t.extensions && typeof t.extensions === 'object')
        ? t.extensions['com.figma'] ?? t.extensions['org.figma']
        : undefined;
    // Pull top-level first
    let collection = (extAll && typeof extAll.collectionName === 'string')
        ? extAll.collectionName
        : undefined;
    let variable = (extAll && typeof extAll.variableName === 'string')
        ? extAll.variableName
        : undefined;
    // If a context is chosen, prefer perContext overrides for names
    if (ctx && extAll && typeof extAll === 'object' && typeof extAll.perContext === 'object') {
        const ctxBlock = extAll.perContext[ctx];
        if (ctxBlock && typeof ctxBlock === 'object') {
            if (typeof ctxBlock.collectionName === 'string')
                collection = ctxBlock.collectionName;
            if (typeof ctxBlock.variableName === 'string')
                variable = ctxBlock.variableName;
        }
    }
    // Final fallback to IR path (for display purposes only)
    if (!collection)
        collection = t.path[0];
    if (!variable)
        variable = t.path.slice(1).join('/');
    return { collection, variable };
}
// ---------- Build alias resolution index (using per-context names) ----------
/** Build a lookup map so alias emission can resolve display names quickly. */
function buildDisplayNameIndex(graph) {
    const byKey = new Map();
    for (const t of graph.tokens) {
        const ctxKeys = keysOf(t.byContext);
        const chosenCtx = ctxKeys.length > 0 ? ctxKeys[0] : undefined;
        const { collection, variable } = getFigmaDisplayNames(t, chosenCtx);
        const entry = { collection, variable };
        // 1) raw IR path key (used by some alias paths)
        byKey.set(dotRaw(t.path), entry);
        // 2) exact display key (collection + variable split)
        const displaySegs = [collection, ...String(variable).split('/')];
        byKey.set(dotRaw(displaySegs), entry);
        // 3) slug-for-match key (lookup only)
        const slugSegs = [slugForMatch(collection), ...String(variable).split('/').map((s) => slugForMatch(s))];
        byKey.set(dotRaw(slugSegs), entry);
    }
    return byKey;
}
/**
 * Walk the token graph and emit grouped DTCG JSON.
 * Keeps all grouping logic deterministic so repeated exports diff cleanly.
 */
function serialize(graph, _opts) {
    const root = {};
    const displayIndex = buildDisplayNameIndex(graph);
    for (const t of graph.tokens) {
        writeTokenInto(root, t, displayIndex);
    }
    return { json: root };
}
/**
 * Emit a single token into the mutable JSON root. Handles alias resolution and metadata.
 */
function writeTokenInto(root, t, displayIndex) {
    // DTCG has no modes; pick one context just to serialize value/ids
    const ctxKeys = keysOf(t.byContext);
    const chosenCtx = ctxKeys.length > 0 ? ctxKeys[0] : undefined;
    const chosen = chosenCtx !== undefined ? t.byContext[chosenCtx] ?? null : null;
    // ***** THE CRITICAL GUARANTEE *****
    // Build the JSON hierarchy STRICTLY from the IR path segments:
    //   t.path === [collection, ...variableSegments]
    const path = Array.isArray(t.path) ? t.path : [String(t.path)];
    const collectionSeg = path[0] ?? 'Tokens';
    const variableSegs = path.slice(1); // ["group1","baseVar"] etc.
    // Groups are the collection + parent segments; the JSON leaf key is ALWAYS the last segment.
    let groupSegments = [collectionSeg, ...variableSegs.slice(0, -1)];
    const leaf = variableSegs.length ? variableSegs[variableSegs.length - 1] : (path[path.length - 1] ?? 'token');
    // (Optional) legacy safeguard if you previously stripped "Collection 1" child:
    if (groupSegments.length > 1) {
        const firstChild = String(groupSegments[1]).toLowerCase();
        if (/^collection(\s|-)?\d+/.test(firstChild)) {
            groupSegments = [groupSegments[0], ...groupSegments.slice(2)];
        }
    }
    // Walk/build the group objects
    let obj = root;
    for (let i = 0; i < groupSegments.length; i++) {
        const seg = groupSegments[i];
        let next = obj[seg];
        if (!next || typeof next !== 'object') {
            next = {};
            obj[seg] = next;
        }
        obj = next;
    }
    // Build token payload
    const tokenObj = {};
    // Emit boolean as DTCG string (with a hint in $extensions for round-trip)
    const emittedType = (t.type === 'boolean') ? 'string' : t.type;
    tokenObj['$type'] = emittedType;
    // ----- value emission -----
    if (chosen !== null) {
        switch (chosen.kind) {
            case 'alias': {
                // Resolve to display names if we can (no normalization on emitted string).
                const segsIn = Array.isArray(chosen.path)
                    ? chosen.path.slice()
                    : String(chosen.path).split('.').map((p) => p.trim()).filter(Boolean);
                let refDisp = displayIndex.get(dotRaw(segsIn));
                if (!refDisp) {
                    // try slug-for-match
                    refDisp = displayIndex.get(dotRaw(segsIn.map((s) => slugForMatch(s))));
                }
                if (!refDisp && segsIn.length > 0) {
                    // Courtesy: try swapping a slugged collection with a matching display collection
                    const firstSlug = slugForMatch(segsIn[0]);
                    for (const [k] of displayIndex.entries()) {
                        const parts = k.split('.');
                        if (parts.length === 0)
                            continue;
                        if (slugForMatch(parts[0]) === firstSlug) {
                            const cand1 = [parts[0], ...segsIn.slice(1)];
                            const cand2 = [parts[0], ...segsIn.slice(1).map((s) => slugForMatch(s))];
                            refDisp = displayIndex.get(dotRaw(cand1)) || displayIndex.get(dotRaw(cand2));
                            if (refDisp)
                                break;
                        }
                    }
                }
                tokenObj['$value'] = refDisp
                    ? `{${[refDisp.collection, ...String(refDisp.variable).split('/')].join('.')}}`
                    : `{${segsIn.join('.')}}`;
                break;
            }
            case 'color': {
                const cv = chosen.value;
                const out = {
                    colorSpace: cv.colorSpace,
                    components: [cv.components[0], cv.components[1], cv.components[2]],
                };
                if (typeof cv.alpha === 'number')
                    out['alpha'] = cv.alpha;
                if (typeof cv.hex === 'string')
                    out['hex'] = cv.hex;
                tokenObj['$value'] = out;
                break;
            }
            case 'number':
            case 'string': {
                tokenObj['$value'] = chosen.value;
                break;
            }
            case 'boolean': {
                // DTCG: write as string "true"/"false"
                tokenObj['$value'] = chosen.value ? 'true' : 'false';
                break;
            }
        }
    }
    // Only emit non-empty descriptions
    if (typeof t.description === 'string' && t.description.trim() !== '') {
        tokenObj['$description'] = t.description;
    }
    // Flatten $extensions.(com|org).figma.perContext[chosenCtx] into $extensions.com.figma
    let extOut;
    if (t.extensions) {
        const flattened = flattenFigmaExtensionsForCtx(t.extensions, chosenCtx);
        extOut = (flattened ?? t.extensions);
    }
    // Add boolean round-trip hint (keeps DTCG $type as "string")
    if (t.type === 'boolean') {
        if (!extOut)
            extOut = {};
        const fig = (extOut['com.figma'] && typeof (extOut['com.figma']) === 'object')
            ? extOut['com.figma']
            : (extOut['com.figma'] = {});
        if (fig['variableType'] !== 'BOOLEAN')
            fig['variableType'] = 'BOOLEAN';
    }
    if (extOut)
        tokenObj['$extensions'] = extOut;
    // ***** Final write: leaf only (NEVER the full display path) *****
    obj[leaf] = tokenObj;
}
/**
 * Flattens either $extensions.com.figma or $extensions.org.figma.
 * - Copies all other namespaces through unchanged.
 * - Removes "perContext" and merges the selected context's identifiers.
 * - Always emits under "com.figma" to follow current DTCG guidance.
 */
function flattenFigmaExtensionsForCtx(ext, ctx) {
    if (!ext || typeof ext !== 'object')
        return null;
    const out = {};
    // Copy non-figma namespaces as-is
    for (const k in ext) {
        if (!Object.prototype.hasOwnProperty.call(ext, k))
            continue;
        if (k !== 'com.figma' && k !== 'org.figma') {
            out[k] = ext[k];
        }
    }
    // Prefer com.figma if present; otherwise accept org.figma for backward-compat
    const ns = ext['com.figma']
        ? 'com.figma'
        : (ext['org.figma'] ? 'org.figma' : null);
    if (ns) {
        const figmaBlock = ext[ns];
        if (figmaBlock && typeof figmaBlock === 'object') {
            const base = {};
            // copy all keys except perContext
            for (const k of Object.keys(figmaBlock)) {
                if (k !== 'perContext')
                    base[k] = figmaBlock[k];
            }
            // merge selected context
            const per = figmaBlock['perContext'];
            if (ctx && per && typeof per === 'object') {
                const ctxData = per[ctx];
                if (ctxData && typeof ctxData === 'object') {
                    Object.assign(base, ctxData);
                }
            }
            if (Object.keys(base).length > 0) {
                // Always emit using the standardized "com.figma" key
                out['com.figma'] = base;
            }
        }
    }
    return Object.keys(out).length > 0 ? out : null;
}
function keysOf(o) {
    const out = [];
    if (!o)
        return out;
    for (const k in o)
        if (Object.prototype.hasOwnProperty.call(o, k))
            out.push(k);
    return out;
}
