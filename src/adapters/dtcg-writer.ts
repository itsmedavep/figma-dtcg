// src/adapters/dtcg-writer.ts
// IR -> DTCG object (grouped), including aliases and color values.

import { type TokenGraph, type TokenNode, type ValueOrAlias } from '../core/ir';

// We must emit EXACT names as Figma shows them when available via $extensions.
// No normalization, no whitespace collapsing, no hyphen munging.

// ---------- tiny utils (lookup-only; never used for emission) ----------
function dotRaw(segs: string[]): string {
  return segs.join('.');
}

/** Matching-only slug so aliases written in slug form still resolve.
 * NEVER used for emission, only for building index keys.
 */
function slugForMatch(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, '-')   // collapse whitespace to single '-'
    .replace(/-+/g, '-')    // collapse multiple '-' to one
    .toLowerCase();
}

type DisplayNames = { collection: string; variable: string };

// Extract Figma display names, preferring perContext[ctx], then top-level, then path fallback.
// Do NOT mutate or normalize these strings in any way.
function getFigmaDisplayNames(t: TokenNode, ctx?: string): DisplayNames {
  const extAll = (t.extensions && typeof t.extensions === 'object')
    ? (t.extensions as any)['com.figma'] ?? (t.extensions as any)['org.figma']
    : undefined;

  // pull top-level first
  let collection = (extAll && typeof extAll.collectionName === 'string')
    ? extAll.collectionName
    : undefined;

  let variable = (extAll && typeof extAll.variableName === 'string')
    ? extAll.variableName
    : undefined;

  // if a context is chosen, prefer perContext overrides for names
  if (ctx && extAll && typeof extAll === 'object' && typeof (extAll as any).perContext === 'object') {
    const ctxBlock = (extAll as any).perContext[ctx];
    if (ctxBlock && typeof ctxBlock === 'object') {
      if (typeof (ctxBlock as any).collectionName === 'string') collection = (ctxBlock as any).collectionName;
      if (typeof (ctxBlock as any).variableName === 'string') variable = (ctxBlock as any).variableName;
    }
  }

  // final fallback to IR path
  if (!collection) collection = t.path[0];
  if (!variable) variable = t.path.slice(1).join('/');

  return { collection, variable };
}

// ---------- Build alias resolution index (using per-context names) ----------
function buildDisplayNameIndex(graph: TokenGraph): Map<string, DisplayNames> {
  const byKey = new Map<string, DisplayNames>();

  for (const t of graph.tokens) {
    const ctxKeys = keysOf(t.byContext);
    const chosenCtx = ctxKeys.length > 0 ? ctxKeys[0] : undefined;

    const { collection, variable } = getFigmaDisplayNames(t, chosenCtx);
    const entry: DisplayNames = { collection, variable };

    // 1) raw IR path key
    byKey.set(dotRaw(t.path), entry);

    // 2) exact display key
    const displaySegs = [collection, ...variable.split('/')];
    byKey.set(dotRaw(displaySegs), entry);

    // 3) slug-for-match key (lookup only)
    const slugSegs = [slugForMatch(collection), ...variable.split('/').map((s: string) => slugForMatch(s))];
    byKey.set(dotRaw(slugSegs), entry);
  }

  return byKey;
}

export interface SerializeResult { json: unknown; }
export interface ExportOpts { /* reserved */ }

export function serialize(graph: TokenGraph, _opts?: ExportOpts): SerializeResult {
  const root: { [k: string]: unknown } = {};
  const displayIndex = buildDisplayNameIndex(graph);

  for (const t of graph.tokens) {
    writeTokenInto(root, t, displayIndex);
  }

  return { json: root };
}

function writeTokenInto(
  root: { [k: string]: unknown },
  t: TokenNode,
  displayIndex: Map<string, DisplayNames>
): void {
  // DTCG has no modes; pick one context just to serialize value/ids
  const ctxKeys = keysOf(t.byContext);
  const chosenCtx = ctxKeys.length > 0 ? ctxKeys[0] : undefined;

  const chosen: ValueOrAlias | null =
    chosenCtx !== undefined ? (t.byContext[chosenCtx] as ValueOrAlias | undefined) ?? null : null;

  // ******** THE CRITICAL CHANGE ********
  // Names now come from perContext (when present), falling back to top-level, then path.
  const { collection: collectionDisplay, variable: variableDisplay } = getFigmaDisplayNames(t, chosenCtx);

  // Build groups from path, but force the first segment to the EXACT collectionDisplay.
  // Keep the legacy "strip collection-1" safeguard on the second segment.
  let groupSegments = t.path.slice(0, t.path.length - 1);
  if (groupSegments.length > 0) groupSegments[0] = collectionDisplay;
  if (groupSegments.length > 1) {
    const firstChild = groupSegments[1].toLowerCase();
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
    obj = next as { [k: string]: unknown };
  }

  // Leaf key = EXACT variable name from Figma (can include spaces, double hyphens, etc.)
  const leaf = variableDisplay;

  const tokenObj: { [k: string]: unknown } = {};
  tokenObj['$type'] = t.type;

  // ----- value emission -----
  if (chosen !== null) {
    switch (chosen.kind) {
      case 'alias': {
        // Resolve to display names if we can (no normalization on emitted string).
        const segs: string[] = Array.isArray((chosen as any).path)
          ? ((chosen as any).path as string[]).slice()
          : String((chosen as any).path).split('.').map((p: string) => p.trim()).filter(Boolean);

        let refDisp = displayIndex.get(dotRaw(segs));
        if (!refDisp) {
          // try slug-for-match
          refDisp = displayIndex.get(dotRaw(segs.map((s: string) => slugForMatch(s))));
        }

        if (!refDisp && segs.length > 0) {
          // As a courtesy, try swapping a slugged collection with a matching display collection
          const firstSlug = slugForMatch(segs[0]);
          for (const [k, v] of displayIndex.entries()) {
            const parts = k.split('.');
            if (parts.length === 0) continue;
            if (slugForMatch(parts[0]) === firstSlug) {
              const cand1 = [parts[0], ...segs.slice(1)];
              const cand2 = [parts[0], ...segs.slice(1).map((s: string) => slugForMatch(s))];
              refDisp = displayIndex.get(dotRaw(cand1)) || displayIndex.get(dotRaw(cand2));
              if (refDisp) break;
            }
          }
        }

        tokenObj['$value'] = refDisp
          ? `{${[refDisp.collection, ...refDisp.variable.split('/')].join('.')}}`
          : `{${segs.join('.')}}`;
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

function keysOf<T>(o: { [k: string]: T } | undefined): string[] {
  const out: string[] = [];
  if (!o) return out;
  for (const k in o) if (Object.prototype.hasOwnProperty.call(o, k)) out.push(k);
  return out;
}
