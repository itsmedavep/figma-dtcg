// src/adapters/dtcg-writer.ts
// Convert the IR graph back into DTCG JSON while keeping alias strings readable.
// - Emits groups directly from the IR path so git diffs stay predictable
// - Uses Figma display metadata only for alias references to preserve user intent

import { type TokenGraph, type TokenNode, type ValueOrAlias } from "../core/ir";
import { serializeTypographyValue } from "../core/typography";
import { colorValueToHexString } from "../core/color";

// ---------- tiny utils (lookup-only; never used for emission) ----------
/** Join path segments with '.' for alias lookups. */
function dotRaw(segs: string[]): string {
    return segs.join(".");
}

/** Matching-only slug so aliases written in slug form still resolve (never for emission). */
function slugForMatch(s: string): string {
    return s
        .trim()
        .replace(/\s+/g, "-") // collapse whitespace to single '-'
        .replace(/-+/g, "-") // collapse multiple '-' to one
        .toLowerCase();
}

type DisplayNames = { collection: string; variable: string };

/**
 * Extract Figma display names for alias emission, preferring per-context overrides.
 * NEVER used for key generation; JSON structure always follows IR paths.
 */
function getFigmaDisplayNames(t: TokenNode, ctx?: string): DisplayNames {
    const extAll =
        t.extensions && typeof t.extensions === "object"
            ? (t.extensions as any)["com.figma"] ??
              (t.extensions as any)["org.figma"]
            : undefined;

    // Pull top-level first
    let collection =
        extAll && typeof (extAll as any).collectionName === "string"
            ? (extAll as any).collectionName
            : undefined;

    let variable =
        extAll && typeof (extAll as any).variableName === "string"
            ? (extAll as any).variableName
            : undefined;

    // If a context is chosen, prefer perContext overrides for names
    if (
        ctx &&
        extAll &&
        typeof extAll === "object" &&
        typeof (extAll as any).perContext === "object"
    ) {
        const ctxBlock = (extAll as any).perContext[ctx];
        if (ctxBlock && typeof ctxBlock === "object") {
            if (typeof (ctxBlock as any).collectionName === "string")
                collection = (ctxBlock as any).collectionName;
            if (typeof (ctxBlock as any).variableName === "string")
                variable = (ctxBlock as any).variableName;
        }
    }

    // Final fallback to IR path (for display purposes only)
    if (!collection) collection = t.path[0];
    if (!variable) variable = t.path.slice(1).join("/");

    return { collection, variable };
}

// ---------- Build alias resolution index (using per-context names) ----------
/** Build a lookup map so alias emission can resolve display names quickly. */
function buildDisplayNameIndex(graph: TokenGraph): Map<string, DisplayNames> {
    const byKey = new Map<string, DisplayNames>();

    for (const t of graph.tokens) {
        const ctxKeys = keysOf(t.byContext);
        const chosenCtx = ctxKeys.length > 0 ? ctxKeys[0] : undefined;

        const { collection, variable } = getFigmaDisplayNames(t, chosenCtx);
        const entry: DisplayNames = { collection, variable };

        // 1) raw IR path key (used by some alias paths)
        byKey.set(dotRaw(t.path), entry);

        // 2) exact display key (collection + variable split)
        const displaySegs = [collection, ...String(variable).split("/")];
        byKey.set(dotRaw(displaySegs), entry);

        // 3) slug-for-match key (lookup only)
        const slugSegs = [
            slugForMatch(collection),
            ...String(variable)
                .split("/")
                .map((s: string) => slugForMatch(s)),
        ];
        byKey.set(dotRaw(slugSegs), entry);
    }

    return byKey;
}

export interface SerializeResult {
    json: unknown;
}
export interface SerializeOptions {
    styleDictionary?: boolean;
    flatTokens?: boolean;
}

/**
 * Walk the token graph and emit grouped DTCG JSON.
 * Keeps all grouping logic deterministic so repeated exports diff cleanly.
 */
export function serialize(
    graph: TokenGraph,
    opts?: SerializeOptions
): SerializeResult {
    const root: { [k: string]: unknown } = {};
    const displayIndex = buildDisplayNameIndex(graph);

    for (const t of graph.tokens) {
        writeTokenInto(root, t, displayIndex, opts);
    }

    return { json: root };
}

/**
 * Emit a single token into the mutable JSON root. Handles alias resolution and metadata.
 */
function writeTokenInto(
    root: { [k: string]: unknown },
    t: TokenNode,
    displayIndex: Map<string, DisplayNames>,
    opts?: SerializeOptions
): void {
    // DTCG has no modes; pick one context just to serialize value/ids
    const ctxKeys = keysOf(t.byContext);
    const chosenCtx = ctxKeys.length > 0 ? ctxKeys[0] : undefined;

    const chosen: ValueOrAlias | null =
        chosenCtx !== undefined
            ? (t.byContext[chosenCtx] as ValueOrAlias | undefined) ?? null
            : null;

    // ***** THE CRITICAL GUARANTEE *****
    // Build the JSON hierarchy STRICTLY from the IR path segments:
    //   t.path === [collection, ...variableSegments]
    const path = Array.isArray(t.path) ? t.path : [String(t.path)];
    const collectionSeg = path[0] ?? "Tokens";
    const variableSegs = path.slice(1); // ["group1","baseVar"] etc.

    // Groups are the collection + parent segments; the JSON leaf key is ALWAYS the last segment.
    const useFlat = !!(opts && opts.flatTokens);
    const groupSegments = useFlat
        ? variableSegs.slice(0, -1)
        : [collectionSeg, ...variableSegs.slice(0, -1)];
    const leaf = variableSegs.length
        ? variableSegs[variableSegs.length - 1]
        : path[path.length - 1] ?? "token";

    // Preserve the exact group hierarchy; do not strip user-authored segments
    // like "Collection 2" that participate in canonical alias paths (§5.1).

    // Walk/build the group objects
    let obj = root;
    for (let i = 0; i < groupSegments.length; i++) {
        const seg = groupSegments[i];
        let next = obj[seg];
        if (!next || typeof next !== "object") {
            next = {};
            obj[seg] = next;
        }
        obj = next as { [k: string]: unknown };
    }

    // Build token payload
    const tokenObj: { [k: string]: unknown } = {};
    // Emit boolean as DTCG string (with a hint in $extensions for round-trip)
    const emittedType = t.type === "boolean" ? "string" : t.type;
    tokenObj["$type"] = emittedType;

    // ----- value emission -----
    if (chosen !== null) {
        switch (chosen.kind) {
            case "alias": {
                // Resolve to display names if we can (no normalization on emitted string).
                const segsIn: string[] = Array.isArray((chosen as any).path)
                    ? ((chosen as any).path as string[]).slice()
                    : String((chosen as any).path)
                          .split(".")
                          .map((p: string) => p.trim())
                          .filter(Boolean);

                let refDisp = displayIndex.get(dotRaw(segsIn));
                if (!refDisp) {
                    // try slug-for-match
                    refDisp = displayIndex.get(
                        dotRaw(segsIn.map((s: string) => slugForMatch(s)))
                    );
                }

                if (!refDisp && segsIn.length > 0) {
                    // Courtesy: try swapping a slugged collection with a matching display collection
                    const firstSlug = slugForMatch(segsIn[0]);
                    for (const [k] of displayIndex.entries()) {
                        const parts = k.split(".");
                        if (parts.length === 0) continue;
                        if (slugForMatch(parts[0]) === firstSlug) {
                            const cand1 = [parts[0], ...segsIn.slice(1)];
                            const cand2 = [
                                parts[0],
                                ...segsIn
                                    .slice(1)
                                    .map((s: string) => slugForMatch(s)),
                            ];
                            refDisp =
                                displayIndex.get(dotRaw(cand1)) ||
                                displayIndex.get(dotRaw(cand2));
                            if (refDisp) break;
                        }
                    }
                }

                tokenObj["$value"] = refDisp
                    ? `{${[
                          refDisp.collection,
                          ...String(refDisp.variable).split("/"),
                      ].join(".")}}`
                    : `{${segsIn.join(".")}}`;
                break;
            }

            case "color": {
                const cv = chosen.value;
                if (opts && opts.styleDictionary) {
                    tokenObj["$value"] = colorValueToHexString(cv);
                } else {
                    const out: { [k: string]: unknown } = {
                        colorSpace: cv.colorSpace,
                        components: [
                            cv.components[0],
                            cv.components[1],
                            cv.components[2],
                        ],
                    };
                    if (typeof cv.alpha === "number") out["alpha"] = cv.alpha;
                    if (typeof cv.hex === "string") out["hex"] = cv.hex;
                    tokenObj["$value"] = out;
                }
                break;
            }

            case "number":
            case "string": {
                tokenObj["$value"] = chosen.value;
                break;
            }

            case "boolean": {
                // DTCG: write as string "true"/"false"
                tokenObj["$value"] = chosen.value ? "true" : "false";
                break;
            }

            case "typography": {
                tokenObj["$value"] = serializeTypographyValue(chosen.value);
                break;
            }
        }
    }

    // Only emit non-empty descriptions
    if (typeof t.description === "string" && t.description.trim() !== "") {
        tokenObj["$description"] = t.description;
    }

    // Flatten $extensions.(com|org).figma.perContext[chosenCtx] into $extensions.com.figma
    let extOut: Record<string, unknown> | undefined;
    if (t.extensions) {
        const flattened = flattenFigmaExtensionsForCtx(
            t.extensions as Record<string, unknown>,
            chosenCtx
        );
        extOut = flattened ?? (t.extensions as Record<string, unknown>);
    }

    // Add boolean round-trip hint (keeps DTCG $type as "string")
    if (t.type === "boolean") {
        if (!extOut) extOut = {};
        const fig =
            extOut["com.figma"] && typeof extOut["com.figma"] === "object"
                ? (extOut["com.figma"] as Record<string, unknown>)
                : ((extOut["com.figma"] = {} as Record<
                      string,
                      unknown
                  >) as Record<string, unknown>);
        if (fig["variableType"] !== "BOOLEAN") fig["variableType"] = "BOOLEAN";
    }

    if (extOut) tokenObj["$extensions"] = extOut;

    // ***** Final write: leaf only (NEVER the full display path) *****
    (obj as any)[leaf] = tokenObj;
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
    if (!ext || typeof ext !== "object") return null;

    const out: Record<string, unknown> = {};

    // Copy non-figma namespaces as-is
    for (const k in ext) {
        if (!Object.prototype.hasOwnProperty.call(ext, k)) continue;
        if (k !== "com.figma" && k !== "org.figma") {
            out[k] = (ext as any)[k];
        }
    }

    // Prefer com.figma if present; otherwise accept org.figma for backward-compat
    const ns = (ext as any)["com.figma"]
        ? "com.figma"
        : (ext as any)["org.figma"]
        ? "org.figma"
        : null;

    if (ns) {
        const figmaBlock = (ext as any)[ns];
        if (figmaBlock && typeof figmaBlock === "object") {
            const base: Record<string, unknown> = {};
            // copy all keys except perContext
            for (const k of Object.keys(figmaBlock)) {
                if (k !== "perContext") base[k] = (figmaBlock as any)[k];
            }
            // merge selected context
            const per = (figmaBlock as any)["perContext"];
            if (ctx && per && typeof per === "object") {
                const ctxData = (per as any)[ctx];
                if (ctxData && typeof ctxData === "object") {
                    Object.assign(base, ctxData);
                }
            }
            if (Object.keys(base).length > 0) {
                // Always emit using the standardized "com.figma" key
                out["com.figma"] = base;
            }
        }
    }

    return Object.keys(out).length > 0 ? out : null;
}

function keysOf<T>(o: { [k: string]: T } | undefined): string[] {
    const out: string[] = [];
    if (!o) return out;
    for (const k in o)
        if (Object.prototype.hasOwnProperty.call(o, k)) out.push(k);
    return out;
}
