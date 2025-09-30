"use strict";
// src/core/pipeline.ts
// Pipeline glue between adapters and the UI.
// - importDtcg: DTCG JSON -> IR -> write to Figma
// - exportDtcg: read IR from Figma -> serialize to DTCG; package as files
Object.defineProperty(exports, "__esModule", { value: true });
exports.importDtcg = importDtcg;
exports.exportDtcg = exportDtcg;
exports.sanitizeForFile = sanitizeForFile;
const normalize_1 = require("./normalize");
const dtcg_reader_1 = require("../adapters/dtcg-reader");
const dtcg_writer_1 = require("../adapters/dtcg-writer");
const figma_reader_1 = require("../adapters/figma-reader");
const figma_writer_1 = require("../adapters/figma-writer");
/**
 * Capture the enumerable keys on a plain object without trusting prototype mutation.
 * We keep this helper local so the export path never depends on a broader utility module.
 */
function keysOf(obj) {
    var out = [];
    var k;
    for (k in obj)
        if (Object.prototype.hasOwnProperty.call(obj, k))
            out.push(k);
    return out;
}
/**
 * Replace file-hostile characters so each export path is safe for Git commits on every OS.
 * Using a narrow allow list keeps legacy file names stable while preventing accidental nesting.
 */
const INVALID_FILE_CHARS = /[<>:"/\\|?*\u0000-\u001F]/g;
function sanitizeForFile(s) {
    var cleaned = String(s);
    cleaned = cleaned.replace(INVALID_FILE_CHARS, '_');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    cleaned = cleaned.replace(/[. ]+$/g, '');
    return cleaned;
}
/**
 * Build a copy of a token that only contains the requested context so per-mode exports stay minimal.
 * Returning null when the context is absent lets the caller drop empty files entirely.
 */
function cloneTokenWithSingleContext(t, ctx) {
    var val = t.byContext[ctx];
    if (!val)
        return null;
    // shallow clone without spreads
    var copyByCtx = {};
    copyByCtx[ctx] = val;
    return {
        path: (function () { var arr = []; var i = 0; for (i = 0; i < t.path.length; i++)
            arr.push(t.path[i]); return arr; })(),
        type: t.type,
        byContext: copyByCtx,
        description: t.description,
        extensions: t.extensions
    };
}
// ---------- API ----------
async function importDtcg(json, opts = {}) {
    // Build desired graph from DTCG, then write directly to Figma.
    // We previously shipped an unused "plan" module that tried to diff the desired
    // graph against the live document. Nothing in the plugin ever called it, and
    // the write path already overwrites the full state, so keeping the unused
    // module only increased bundle size and maintenance cost. Keeping a single
    // happy-path write keeps the observable behavior identical to the versions
    // that shipped before the cleanup.
    const desired = (0, normalize_1.normalize)((0, dtcg_reader_1.readDtcgToIR)(json, { allowHexStrings: !!opts.allowHexStrings }));
    await (0, figma_writer_1.writeIRToFigma)(desired);
}
async function exportDtcg(opts) {
    var current = await (0, figma_reader_1.readFigmaToIR)();
    var graph = (0, normalize_1.normalize)(current);
    if (opts.format === 'single') {
        // One file with whatever contexts exist; writer will emit the first available per token.
        var single = (0, dtcg_writer_1.serialize)(graph);
        return { files: [{ name: 'tokens.json', json: single.json }] };
    }
    // Per mode: split graph by context "Collection/Mode", one file each.
    var contexts = [];
    var i = 0;
    for (i = 0; i < graph.tokens.length; i++) {
        var t = graph.tokens[i];
        var ks = keysOf(t.byContext);
        var j = 0;
        for (j = 0; j < ks.length; j++) {
            var c = ks[j];
            // push if unique
            var found = false;
            var k = 0;
            for (k = 0; k < contexts.length; k++)
                if (contexts[k] === c) {
                    found = true;
                    break;
                }
            if (!found)
                contexts.push(c);
        }
    }
    // Build a file per context
    var files = [];
    var ci = 0;
    for (ci = 0; ci < contexts.length; ci++) {
        var ctx = contexts[ci];
        // Create a filtered graph where each token only carries this ctx (if present)
        var filtered = { tokens: [] };
        var ii = 0;
        for (ii = 0; ii < graph.tokens.length; ii++) {
            var tok = graph.tokens[ii];
            var one = cloneTokenWithSingleContext(tok, ctx);
            if (one)
                filtered.tokens.push(one);
        }
        // If nothing in this context, skip
        if (filtered.tokens.length === 0)
            continue;
        var out = (0, dtcg_writer_1.serialize)(filtered);
        // ctx format is "Collection/Mode"
        var slash = ctx.indexOf('/');
        var collection = slash >= 0 ? ctx.substring(0, slash) : ctx;
        var mode = slash >= 0 ? ctx.substring(slash + 1) : 'default';
        var fname = sanitizeForFile(collection) + '_mode=' + sanitizeForFile(mode) + '.tokens.json';
        files.push({ name: fname, json: out.json });
    }
    // Fallback: if no contexts were found, still emit a single file
    if (files.length === 0) {
        var fallback = (0, dtcg_writer_1.serialize)(graph);
        files.push({ name: 'tokens.json', json: fallback.json });
    }
    return { files: files };
}
