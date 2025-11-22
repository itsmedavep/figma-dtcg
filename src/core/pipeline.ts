// src/core/pipeline.ts
// Pipeline glue between adapters and the UI.
// - importDtcg: DTCG JSON -> IR -> write to Figma
// - exportDtcg: read IR from Figma -> serialize to DTCG; package as files

import { normalize } from "./normalize";
import { readDtcgToIR } from "../adapters/dtcg-reader";
import { serialize } from "../adapters/dtcg-writer";
import { readFigmaToIR } from "../adapters/figma-reader";
import { writeIRToFigma } from "../adapters/figma-writer";
import type { TokenGraph, TokenNode, ValueOrAlias } from "./ir";

export interface ExportOpts {
    format: "single" | "perMode" | "typography";
    styleDictionary?: boolean;
    flatTokens?: boolean;
}
export interface ExportResult {
    files: Array<{ name: string; json: unknown }>;
}

export interface ImportSummary {
    /** Total tokens parsed from the incoming file. */
    totalTokens: number;
    /** Tokens that remained after applying the selected contexts. */
    importedTokens: number;
    /** Total number of Figma styles created while applying the import. */
    createdStyles: number;
    /** Every context discovered in the incoming file (Collection/Mode). */
    availableContexts: string[];
    /** Contexts actually written to the document after filtering. */
    appliedContexts: string[];
    /** Contexts that were intentionally skipped because they weren't selected. */
    skippedContexts: Array<{ context: string; reason: string }>;
    /** Contexts requested by the UI that did not exist in the incoming file. */
    missingRequestedContexts: string[];
    /** Raw contexts requested by the UI (before intersecting with available contexts). */
    selectionRequested: string[];
    /** True when the requested selection had no overlap and we fell back to all contexts. */
    selectionFallbackToAll?: boolean;
    /** Tokens that lost one or more contexts during filtering. */
    tokensWithRemovedContexts: Array<{
        path: string;
        removedContexts: string[];
        keptContexts: string[];
        reason: "partial" | "removed";
    }>;
}

// ---------- helpers ----------

export interface ImportOpts {
    allowHexStrings?: boolean;
    contexts?: string[];
}

/**
 * Capture the enumerable keys on a plain object without trusting prototype mutation.
 * We keep this helper local so the export path never depends on a broader utility module.
 */
function keysOf<T>(obj: { [k: string]: T }): string[] {
    const out: string[] = [];
    let k: string;
    for (k in obj)
        if (Object.prototype.hasOwnProperty.call(obj, k)) out.push(k);
    return out;
}

/**
 * Replace file-hostile characters so each export path is safe for Git commits on every OS.
 * Using a narrow allow list keeps legacy file names stable while preventing accidental nesting.
 * Includes control characters (\u0000-\u001F) which are invalid in file paths and could cause
 * security issues or filesystem errors.
 */
// eslint-disable-next-line no-control-regex -- Intentionally filtering control characters for path safety
const INVALID_FILE_CHARS = /[<>:"/\\|?*\u0000-\u001F]/g;

function sanitizeForFile(s: string): string {
    let cleaned = String(s);
    cleaned = cleaned.replace(INVALID_FILE_CHARS, "_");
    cleaned = cleaned.replace(/\s+/g, " ").trim();
    cleaned = cleaned.replace(/[. ]+$/g, "");
    return cleaned;
}

/**
 * Build a copy of a token that only contains the requested context so per-mode exports stay minimal.
 * Returning null when the context is absent lets the caller drop empty files entirely.
 */
function cloneTokenWithSingleContext(
    t: TokenNode,
    ctx: string
): TokenNode | null {
    const val = t.byContext[ctx];
    if (!val) return null;

    // shallow clone without spreads
    const copyByCtx: { [k: string]: ValueOrAlias } = {};
    copyByCtx[ctx] = val;

    return {
        path: (function () {
            const arr: string[] = [];
            let i = 0;
            for (i = 0; i < t.path.length; i++) arr.push(t.path[i]);
            return arr;
        })(),
        type: t.type,
        byContext: copyByCtx,
        description: t.description,
        extensions: t.extensions,
    };
}

function collectContextsFromGraph(graph: TokenGraph): string[] {
    const seen: string[] = [];
    let i = 0;
    for (i = 0; i < graph.tokens.length; i++) {
        const t = graph.tokens[i];
        const ks = keysOf(t.byContext);
        let j = 0;
        for (j = 0; j < ks.length; j++) {
            const ctx = ks[j];
            let already = false;
            let k = 0;
            for (k = 0; k < seen.length; k++)
                if (seen[k] === ctx) {
                    already = true;
                    break;
                }
            if (!already) seen.push(ctx);
        }
    }
    return seen;
}

function sanitizeContexts(list: string[] | undefined): string[] {
    if (!list) return [];
    const out: string[] = [];
    for (let i = 0; i < list.length; i++) {
        const raw = list[i];
        if (typeof raw !== "string") continue;
        const trimmed = raw.trim();
        if (!trimmed) continue;
        let exists = false;
        for (let j = 0; j < out.length; j++)
            if (out[j] === trimmed) {
                exists = true;
                break;
            }
        if (!exists) out.push(trimmed);
    }
    return out;
}

function filterGraphByContexts(
    graph: TokenGraph,
    requested: string[]
): { graph: TokenGraph; summary: ImportSummary } {
    const available = collectContextsFromGraph(graph);
    const requestedList = sanitizeContexts(requested);

    const availableSet: { [k: string]: true } = {};
    for (let ai = 0; ai < available.length; ai++)
        availableSet[available[ai]] = true;

    const appliedSet: { [k: string]: true } = {};
    const missingRequested: string[] = [];
    let fallbackToAll = false;

    if (requestedList.length > 0) {
        for (let ri = 0; ri < requestedList.length; ri++) {
            const ctx = requestedList[ri];
            if (availableSet[ctx]) appliedSet[ctx] = true;
            else missingRequested.push(ctx);
        }
        if (Object.keys(appliedSet).length === 0 && available.length > 0) {
            fallbackToAll = true;
            for (let ai2 = 0; ai2 < available.length; ai2++)
                appliedSet[available[ai2]] = true;
        }
    } else {
        for (let ai3 = 0; ai3 < available.length; ai3++)
            appliedSet[available[ai3]] = true;
    }

    const appliedList: string[] = [];
    for (const ctxKey in appliedSet)
        if (Object.prototype.hasOwnProperty.call(appliedSet, ctxKey))
            appliedList.push(ctxKey);
    appliedList.sort();

    const skippedList: Array<{ context: string; reason: string }> = [];
    for (let si = 0; si < available.length; si++) {
        const ctxAvailable = available[si];
        if (!appliedSet[ctxAvailable]) {
            skippedList.push({
                context: ctxAvailable,
                reason: "Excluded by partial import selection",
            });
        }
    }
    skippedList.sort(function (a, b) {
        if (a.context === b.context) return 0;
        return a.context < b.context ? -1 : 1;
    });

    const filteredTokens: TokenNode[] = [];
    const removedTokens: Array<{
        path: string;
        removedContexts: string[];
        keptContexts: string[];
        reason: "partial" | "removed";
    }> = [];

    for (let ti = 0; ti < graph.tokens.length; ti++) {
        const tok = graph.tokens[ti];
        const ctxs = keysOf(tok.byContext);
        if (ctxs.length === 0) {
            // Nothing to filter; keep token as-is (clone for safety).
            const cloneEmpty: TokenNode = {
                path: tok.path.slice(),
                type: tok.type,
                byContext: {},
            };
            if (typeof tok.description !== "undefined")
                cloneEmpty.description = tok.description;
            if (typeof tok.extensions !== "undefined")
                cloneEmpty.extensions = tok.extensions;
            filteredTokens.push(cloneEmpty);
            continue;
        }

        const kept: string[] = [];
        const removed: string[] = [];
        const newCtx: { [k: string]: ValueOrAlias } = {};

        for (let ci = 0; ci < ctxs.length; ci++) {
            const ctx = ctxs[ci];
            if (appliedSet[ctx]) {
                kept.push(ctx);
                newCtx[ctx] = tok.byContext[ctx];
            } else {
                removed.push(ctx);
            }
        }

        if (kept.length === 0) {
            removedTokens.push({
                path: tok.path.join("/"),
                removedContexts: removed.slice(),
                keptContexts: [],
                reason: "removed",
            });
            continue;
        }

        if (removed.length > 0) {
            removedTokens.push({
                path: tok.path.join("/"),
                removedContexts: removed.slice(),
                keptContexts: kept.slice(),
                reason: "partial",
            });
        }

        const clone: TokenNode = {
            path: tok.path.slice(),
            type: tok.type,
            byContext: newCtx,
        };
        if (typeof tok.description !== "undefined")
            clone.description = tok.description;
        if (typeof tok.extensions !== "undefined")
            clone.extensions = tok.extensions;
        filteredTokens.push(clone);
    }

    removedTokens.sort(function (a, b) {
        if (a.path === b.path) return 0;
        return a.path < b.path ? -1 : 1;
    });

    return {
        graph: { tokens: filteredTokens },
        summary: {
            totalTokens: graph.tokens.length,
            importedTokens: filteredTokens.length,
            createdStyles: 0,
            availableContexts: available.slice().sort(),
            appliedContexts: appliedList,
            skippedContexts: skippedList,
            missingRequestedContexts: missingRequested,
            selectionRequested: requestedList,
            selectionFallbackToAll: fallbackToAll ? true : undefined,
            tokensWithRemovedContexts: removedTokens,
        },
    };
}

// ---------- API ----------

// Read a DTCG payload, normalize it, and write the resulting graph into the current document.
export async function importDtcg(
    json: unknown,
    opts: ImportOpts = {}
): Promise<ImportSummary> {
    // Build desired graph from DTCG, then write directly to Figma.
    // We previously shipped an unused "plan" module that tried to diff the desired
    // graph against the live document. Nothing in the plugin ever called it, and
    // the write path already overwrites the full state, so keeping the unused
    // module only increased bundle size and maintenance cost. Keeping a single
    // happy-path write keeps the observable behavior identical to the versions
    // that shipped before the cleanup.
    const desired = normalize(
        readDtcgToIR(json, { allowHexStrings: !!opts.allowHexStrings })
    );
    const filtered = filterGraphByContexts(desired, opts.contexts || []);
    const writeResult = await writeIRToFigma(filtered.graph);
    filtered.summary.createdStyles = writeResult.createdTextStyles;
    return filtered.summary;
}

// Pull the latest graph from Figma and emit files in the format requested by the UI (single/per-mode/typography).
export async function exportDtcg(opts: ExportOpts): Promise<ExportResult> {
    const current = await readFigmaToIR();
    const graph = normalize(current);
    const styleDictionary = !!opts.styleDictionary;
    const flatTokens = !!opts.flatTokens;

    if (opts.format === "typography") {
        const typographyTokens: TokenNode[] = [];
        for (let ti = 0; ti < graph.tokens.length; ti++) {
            const tok = graph.tokens[ti];
            if (tok.type === "typography") {
                const cloneTypo: TokenNode = {
                    path: tok.path.slice(),
                    type: tok.type,
                    byContext: {} as { [ctx: string]: ValueOrAlias },
                };
                const ctxKeys = keysOf(tok.byContext);
                for (let ci = 0; ci < ctxKeys.length; ci++) {
                    const ctx = ctxKeys[ci];
                    cloneTypo.byContext[ctx] = tok.byContext[ctx];
                }
                if (typeof tok.description !== "undefined")
                    cloneTypo.description = tok.description;
                if (typeof tok.extensions !== "undefined")
                    cloneTypo.extensions = tok.extensions;
                typographyTokens.push(cloneTypo);
            }
        }

        const typographyGraph: TokenGraph = { tokens: typographyTokens };
        const typographySerialized = serialize(typographyGraph, {
            styleDictionary: styleDictionary,
            flatTokens: flatTokens,
        });
        let typographyJson = typographySerialized.json;
        if (!typographyTokens.length) {
            typographyJson = {};
        }
        return { files: [{ name: "typography.json", json: typographyJson }] };
    }

    if (opts.format === "single") {
        // One file with whatever contexts exist; writer will emit the first available per token.
        const single = serialize(graph, {
            styleDictionary: styleDictionary,
            flatTokens: flatTokens,
        });
        return { files: [{ name: "tokens.json", json: single.json }] };
    }

    // Per mode: split graph by context "Collection/Mode", one file each.
    const contexts: string[] = [];
    let i = 0;
    for (i = 0; i < graph.tokens.length; i++) {
        const t = graph.tokens[i];
        const ks = keysOf(t.byContext);
        let j = 0;
        for (j = 0; j < ks.length; j++) {
            const c = ks[j];
            // push if unique
            let found = false;
            let k = 0;
            for (k = 0; k < contexts.length; k++)
                if (contexts[k] === c) {
                    found = true;
                    break;
                }
            if (!found) contexts.push(c);
        }
    }

    // Build a file per context
    const files: Array<{ name: string; json: unknown }> = [];
    let ci = 0;
    for (ci = 0; ci < contexts.length; ci++) {
        const ctx = contexts[ci];

        // Create a filtered graph where each token only carries this ctx (if present)
        const filtered: TokenGraph = { tokens: [] };
        let ii = 0;
        for (ii = 0; ii < graph.tokens.length; ii++) {
            const tok = graph.tokens[ii];
            const one = cloneTokenWithSingleContext(tok, ctx);
            if (one) filtered.tokens.push(one);
        }

        // If nothing in this context, skip
        if (filtered.tokens.length === 0) continue;

        const out = serialize(filtered, {
            styleDictionary: styleDictionary,
            flatTokens: flatTokens,
        });

        // Try to recover the original collection/mode names from per-context metadata so
        // we don't lose slashes or other punctuation that appears in the collection name.
        let collection = ctx;
        let mode = "default";

        let haveCollection = false;
        let haveMode = false;
        for (
            ii = 0;
            ii < filtered.tokens.length && (!haveCollection || !haveMode);
            ii++
        ) {
            const tok = filtered.tokens[ii];
            if (!tok || !tok.extensions) continue;

            const figmaExt = (tok.extensions as { [k: string]: unknown })[
                "com.figma"
            ] as
                | {
                      perContext?: {
                          [ctx: string]: {
                              collectionName?: string;
                              modeName?: string;
                          };
                      };
                  }
                | undefined;
            if (!figmaExt || typeof figmaExt !== "object") continue;

            const perCtx = figmaExt.perContext;
            if (!perCtx || typeof perCtx !== "object") continue;

            const ctxMeta = perCtx[ctx];
            if (!ctxMeta || typeof ctxMeta !== "object") continue;

            const ctxCollection = (ctxMeta as { collectionName?: unknown })
                .collectionName;
            const ctxMode = (ctxMeta as { modeName?: unknown }).modeName;

            if (typeof ctxCollection === "string" && !haveCollection) {
                collection = ctxCollection;
                haveCollection = true;
            }
            if (typeof ctxMode === "string" && !haveMode) {
                mode = ctxMode;
                haveMode = true;
            }
        }

        if (!haveCollection || !haveMode) {
            // ctx format falls back to "Collection/Mode"
            const slash = ctx.lastIndexOf("/");
            collection = slash >= 0 ? ctx.substring(0, slash) : ctx;
            mode = slash >= 0 ? ctx.substring(slash + 1) : "default";
        }

        const fname =
            sanitizeForFile(collection) +
            "_mode=" +
            sanitizeForFile(mode) +
            ".tokens.json";
        files.push({ name: fname, json: out.json });
    }

    // Fallback: if no contexts were found, still emit a single file
    if (files.length === 0) {
        const fallback = serialize(graph, {
            styleDictionary: styleDictionary,
            flatTokens: flatTokens,
        });
        files.push({ name: "tokens.json", json: fallback.json });
    }

    return { files: files };
}

export { sanitizeForFile };
