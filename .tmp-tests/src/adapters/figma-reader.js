"use strict";
// src/adapters/figma-reader.ts
// Convert live Figma variables into the IR token graph shape used everywhere else.
// - Preserves canonical path splitting for consistent lookups
// - Captures per-mode metadata so exports can round-trip Figma specifics
Object.defineProperty(exports, "__esModule", { value: true });
exports.readFigmaToIR = readFigmaToIR;
const color_1 = require("../core/color");
const normalize_1 = require("../core/normalize");
const figma_cache_1 = require("../core/figma-cache");
const ir_1 = require("../core/ir");
/** Translate Figma's resolved type into the primitive kinds our IR expects. */
function mapType(t) {
    if (t === 'COLOR')
        return 'color';
    if (t === 'FLOAT')
        return 'number';
    if (t === 'STRING')
        return 'string';
    return 'boolean';
}
/** Guard for Figma alias payloads so we can branch without optional chaining chains. */
function isAliasValue(v) {
    return !!v && typeof v === 'object' && v.type === 'VARIABLE_ALIAS' && typeof v.id === 'string';
}
/** Guard raw color values while staying defensive about nullish placeholders. */
function isRGBA(v) {
    return !!v && typeof v === 'object' &&
        typeof v.r === 'number' &&
        typeof v.g === 'number' &&
        typeof v.b === 'number' &&
        typeof v.a === 'number';
}
/**
 * Snapshot every local variable into TokenGraph form while annotating per-mode metadata.
 * We favor direct reads from figma.variables so the IR mirrors whatever is live in the document.
 */
async function readFigmaToIR() {
    const profile = figma.root.documentColorProfile;
    const variablesApi = figma.variables;
    const { collections, variablesById, collectionNameById } = await (0, figma_cache_1.loadCollectionsSnapshot)(variablesApi);
    const tokens = [];
    for (const c of collections) {
        // Mode name lookup
        const modeNameById = {};
        for (const m of c.modes)
            modeNameById[m.modeId] = m.name;
        for (const vid of c.variableIds) {
            const v2 = variablesById.get(vid) || await variablesApi.getVariableByIdAsync(vid);
            if (v2 && !variablesById.has(vid))
                variablesById.set(vid, v2);
            if (!v2)
                continue;
            // ***** CRITICAL: always split variable name by '/' into path segments *****
            const path = (0, normalize_1.canonicalPath)(c.name, v2.name);
            const type = mapType(v2.resolvedType);
            const byContext = {};
            // Collect per-context figma metadata (stored under $extensions.com.figma.perContext)
            const perContext = {};
            // For each mode, collect value
            for (const md of c.modes) {
                const ctx = (0, ir_1.ctxKey)(c.name, md.name);
                const mv = v2.valuesByMode[md.modeId];
                // Always record per-context figma metadata
                perContext[ctx] = {
                    collectionName: c.name,
                    collectionID: c.id,
                    modeName: md.name,
                    modeID: md.modeId,
                    variableName: v2.name,
                    variableID: v2.id,
                };
                if (isAliasValue(mv)) {
                    const target = variablesById.get(mv.id) || await variablesApi.getVariableByIdAsync(mv.id);
                    if (target && !variablesById.has(target.id))
                        variablesById.set(target.id, target);
                    if (target) {
                        const collName = collectionNameById.get(target.variableCollectionId) || c.name;
                        const aPath = (0, normalize_1.canonicalPath)(collName, target.name);
                        byContext[ctx] = { kind: 'alias', path: aPath };
                    }
                    continue;
                }
                if (type === 'color' && isRGBA(mv)) {
                    const cv = (0, color_1.figmaRGBAToDtcg)({ r: mv.r, g: mv.g, b: mv.b, a: mv.a }, profile);
                    byContext[ctx] = { kind: 'color', value: cv };
                    continue;
                }
                if (typeof mv === 'number') {
                    byContext[ctx] = { kind: 'number', value: mv };
                    continue;
                }
                if (typeof mv === 'boolean') {
                    byContext[ctx] = { kind: 'boolean', value: mv };
                    continue;
                }
                if (typeof mv === 'string') {
                    byContext[ctx] = { kind: 'string', value: mv };
                    continue;
                }
                // else unhandled null/undefined -> skip
            }
            const figmaExt = { perContext };
            if (type === 'boolean') {
                // Hint for round-tripping booleans while staying DTCG-compliant ("string" on write)
                figmaExt['variableType'] = 'BOOLEAN';
            }
            const token = {
                path,
                type,
                byContext,
                ...(v2.description && v2.description.length > 0 ? { description: v2.description } : {}),
                extensions: {
                    'com.figma': figmaExt
                }
            };
            tokens.push(token);
        }
    }
    return { tokens };
}
