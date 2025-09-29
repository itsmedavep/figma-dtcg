// src/core/figma-cache.ts
// Shared helpers for loading Figma variable collections with cached Variable handles.
// - Avoids repeated getVariableByIdAsync calls during read/write passes
// - Supplies quick lookups for collection names so alias resolution stays fast

export interface CollectionsSnapshot {
  collections: VariableCollection[];
  variablesById: Map<string, Variable>;
  collectionNameById: Map<string, string>;
}

/**
 * Load all local variable collections and hydrate a cache of Variable objects.
 * Callers can reuse the returned maps to avoid redundant async lookups.
 */
export async function loadCollectionsSnapshot(
  variablesApi: PluginAPI['variables']
): Promise<CollectionsSnapshot> {
  const collections = await variablesApi.getLocalVariableCollectionsAsync();

  const collectionNameById = new Map<string, string>();
  for (const col of collections) {
    collectionNameById.set(col.id, col.name);
  }

  const seenIds = new Set<string>();
  const ids: string[] = [];
  for (const col of collections) {
    for (const id of col.variableIds) {
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        ids.push(id);
      }
    }
  }

  const variablesById = new Map<string, Variable>();
  if (ids.length > 0) {
    const fetched = await Promise.all(ids.map(id => variablesApi.getVariableByIdAsync(id)));
    for (let i = 0; i < ids.length; i++) {
      const variable = fetched[i];
      if (variable) variablesById.set(ids[i], variable);
    }
  }

  return { collections, variablesById, collectionNameById };
}
