"use strict";
// src/core/figma-cache.ts
// Shared helpers for loading Figma variable collections with cached Variable handles.
// - Avoids repeated getVariableByIdAsync calls during read/write passes
// - Supplies quick lookups for collection names so alias resolution stays fast
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadCollectionsSnapshot = loadCollectionsSnapshot;
/**
 * Load all local variable collections and hydrate a cache of Variable objects.
 * Callers can reuse the returned maps to avoid redundant async lookups.
 */
async function loadCollectionsSnapshot(variablesApi) {
    const collections = await variablesApi.getLocalVariableCollectionsAsync();
    const collectionNameById = new Map();
    for (const col of collections) {
        collectionNameById.set(col.id, col.name);
    }
    const seenIds = new Set();
    const ids = [];
    for (const col of collections) {
        for (const id of col.variableIds) {
            if (id && !seenIds.has(id)) {
                seenIds.add(id);
                ids.push(id);
            }
        }
    }
    const variablesById = new Map();
    if (ids.length > 0) {
        const fetched = await Promise.all(ids.map(id => variablesApi.getVariableByIdAsync(id)));
        for (let i = 0; i < ids.length; i++) {
            const variable = fetched[i];
            if (variable)
                variablesById.set(ids[i], variable);
        }
    }
    return { collections, variablesById, collectionNameById };
}
