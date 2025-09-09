// src/adapters/dtcg-writer.ts
// IR -> DTCG object (grouped), including aliases and color values.

import { type TokenGraph, type TokenNode, type ValueOrAlias } from '../core/ir';
import { toAliasString } from '../core/normalize';

export interface SerializeResult {
  json: unknown;
}
export interface ExportOpts {
  // reserved for future (e.g., filename templates, grouping strategy)
}

export function serialize(graph: TokenGraph, _opts?: ExportOpts): SerializeResult {
  const root: { [k: string]: unknown } = {};

  for (let i = 0; i < graph.tokens.length; i++) {
    writeTokenInto(root, graph.tokens[i]);
  }

  return { json: root };
}

function writeTokenInto(root: { [k: string]: unknown }, t: TokenNode): void {
  // Decide which context (collection/mode) to serialize (DTCG has no "modes")
  const ctxKeys = keysOf(t.byContext);
  const chosenCtx = ctxKeys.length > 0 ? ctxKeys[0] : undefined;

  // Explicit type so TS doesn't narrow to never
  const chosen: ValueOrAlias | null =
    chosenCtx !== undefined ? (t.byContext[chosenCtx] as ValueOrAlias | undefined) ?? null : null;

  // Build groups from path — optionally strip a leading "collection-N" subgroup
  // Example: ["imported", "collection-1", "color"] -> strip "collection-1"
  let groupSegments = t.path.slice(0, t.path.length - 1);
  if (groupSegments.length > 1) {
    const firstChild = groupSegments[1].toLowerCase();
    if (/^collection(\s|-)?\d+/.test(firstChild)) {
      groupSegments = [groupSegments[0], ...groupSegments.slice(2)];
    }
  }

  let obj = root;
  for (let i = 0; i < groupSegments.length; i++) {
    const seg = groupSegments[i];
    let next = obj[seg];
    if (!next || typeof next !== 'object') {
      next = {};
      obj[seg] = next;
    }
    obj = next as { [k: string]: unknown };
  }

  const leaf = t.path[t.path.length - 1];
  const tokenObj: { [k: string]: unknown } = {};
  tokenObj['$type'] = t.type;

  // Value by kind
  if (chosen !== null) {
    switch (chosen.kind) {
      case 'alias': {
        tokenObj['$value'] = toAliasString(chosen.path);
        break;
      }
      case 'color': {
        const cv = chosen.value;
        const out: { [k: string]: unknown } = {
          colorSpace: cv.colorSpace,
          components: [cv.components[0], cv.components[1], cv.components[2]],
        };
        if (typeof cv.alpha === 'number') out['alpha'] = cv.alpha;
        if (typeof cv.hex === 'string') out['hex'] = cv.hex;
        tokenObj['$value'] = out;
        break;
      }
      case 'number':
      case 'string':
      case 'boolean': {
        tokenObj['$value'] = chosen.value;
        break;
      }
    }
  }

  if (t.description) tokenObj['$description'] = t.description;

  // Flatten $extensions.(com|org).figma.perContext[chosenCtx] into $extensions.com.figma
  if (t.extensions) {
    const flattened = flattenFigmaExtensionsForCtx(t.extensions as Record<string, unknown>, chosenCtx);
    tokenObj['$extensions'] = flattened ?? t.extensions;
  }

  obj[leaf] = tokenObj;
}

/**
 * Flattens either $extensions.com.figma or $extensions.org.figma.
 * - Copies all other namespaces through unchanged.
 * - Removes "perContext" and merges the selected context's identifiers.
 * - Always emits under "com.figma" to follow current DTCG guidance.
 */
function flattenFigmaExtensionsForCtx(
  ext: Record<string, unknown>,
  ctx?: string
): Record<string, unknown> | null {
  if (!ext || typeof ext !== 'object') return null;

  const out: Record<string, unknown> = {};

  // Copy non-figma namespaces as-is
  for (const k in ext) {
    if (!Object.prototype.hasOwnProperty.call(ext, k)) continue;
    if (k !== 'com.figma' && k !== 'org.figma') {
      out[k] = (ext as any)[k];
    }
  }

  // Prefer com.figma if present; otherwise accept org.figma for backward-compat
  const ns = (ext as any)['com.figma']
    ? 'com.figma'
    : ((ext as any)['org.figma'] ? 'org.figma' : null);

  if (ns) {
    const figmaBlock = (ext as any)[ns];
    if (figmaBlock && typeof figmaBlock === 'object') {
      const base: Record<string, unknown> = {};
      // copy all keys except perContext
      for (const k of Object.keys(figmaBlock)) {
        if (k !== 'perContext') base[k] = (figmaBlock as any)[k];
      }
      // merge selected context
      const per = (figmaBlock as any)['perContext'];
      if (ctx && per && typeof per === 'object') {
        const ctxData = (per as any)[ctx];
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

function keysOf<T>(o: { [k: string]: T }): string[] {
  const out: string[] = [];
  for (const k in o) if (Object.prototype.hasOwnProperty.call(o, k)) out.push(k);
  return out;
}
