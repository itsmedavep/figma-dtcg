"use strict";
// src/core/normalize.ts
// Shared helpers for names, paths, alias parsing, and graph checks.
// - Normalizes paths so adapters stay in sync
// - Provides alias analysis utilities for validation and exports
Object.defineProperty(exports, "__esModule", { value: true });
exports.slugSegment = slugSegment;
exports.canonicalPath = canonicalPath;
exports.toDot = toDot;
exports.toAliasString = toAliasString;
exports.parseAliasString = parseAliasString;
exports.normalize = normalize;
exports.indexByDotPath = indexByDotPath;
exports.isAlias = isAlias;
exports.analyzeAliases = analyzeAliases;
/* =========================
   Naming & Path Utilities
   ========================= */
/** Slug a single path segment for lookup (never for emission). */
function slugSegment(s) {
    return String(s)
        .trim()
        .replace(/\s+/g, '-') // collapse whitespace to '-'
        .replace(/-+/g, '-') // collapse runs of '-'
        .toLowerCase();
}
/**
 * Return a canonical token path using Figma's display names.
 * Always splits variable names on '/', trims segments, and removes empties.
 */
function canonicalPath(collection, variableName) {
    const segs = String(variableName)
        .split('/')
        .map(s => s.trim())
        .filter(Boolean);
    return [collection, ...segs];
}
function toDot(path) {
    var i = 0, s = '';
    for (i = 0; i < path.length; i++) {
        if (i > 0)
            s += '.';
        s += path[i];
    }
    return s;
}
function toAliasString(path) {
    return '{' + toDot(path) + '}';
}
function parseAliasString(s) {
    if (typeof s !== 'string')
        return null;
    if (s.length < 3)
        return null;
    if (s.charAt(0) !== '{' || s.charAt(s.length - 1) !== '}')
        return null;
    var inner = s.substring(1, s.length - 1);
    if (!inner)
        return null;
    return inner.split('.');
}
/* =========================
   Graph Utilities
   ========================= */
/**
 * Deduplicate tokens by slash path and sort them for stable comparisons.
 * Keeps adapters from reordering content across reads/writes.
 */
function normalize(graph) {
    var seen = {};
    var copy = [];
    var i = 0;
    for (i = 0; i < graph.tokens.length; i++) {
        var t = graph.tokens[i];
        var key = slashPath(t.path);
        if (!seen[key]) {
            seen[key] = 1;
            copy.push(t);
        }
    }
    copy.sort(function (a, b) {
        var da = toDot(a.path);
        var db = toDot(b.path);
        if (da < db)
            return -1;
        if (da > db)
            return 1;
        return 0;
    });
    return { tokens: copy };
}
function slashPath(path) {
    var i = 0, s = '';
    for (i = 0; i < path.length; i++) {
        if (i > 0)
            s += '/';
        s += path[i];
    }
    return s;
}
/** Build a dot-path index for quick alias resolution. */
function indexByDotPath(graph) {
    var idx = {};
    var i = 0;
    for (i = 0; i < graph.tokens.length; i++) {
        var t = graph.tokens[i];
        idx[toDot(t.path)] = t;
    }
    return idx;
}
/** Type guard: true if the value is an alias entry. */
function isAlias(v) {
    return !!v && v.kind === 'alias';
}
/**
 * Walk alias edges to find missing references and cycles.
 * Useful for validation before exporting or writing to Figma.
 */
function analyzeAliases(graph) {
    var idx = indexByDotPath(graph);
    var edges = {};
    var nodes = [];
    var i = 0;
    for (i = 0; i < graph.tokens.length; i++) {
        var t = graph.tokens[i];
        var from = toDot(t.path);
        nodes.push(from);
        edges[from] = [];
        var ctxKeys = keysOf(t.byContext);
        var k = 0;
        for (k = 0; k < ctxKeys.length; k++) {
            var ctx = ctxKeys[k];
            var val = t.byContext[ctx];
            if (isAlias(val)) {
                var to = toDot(val.path);
                edges[from].push(to);
            }
        }
    }
    var missing = [];
    var u = 0;
    for (u = 0; u < nodes.length; u++) {
        var n = nodes[u];
        var outs = edges[n];
        var j = 0;
        for (j = 0; j < outs.length; j++) {
            var target = outs[j];
            if (!idx[target]) {
                var seen = false;
                var m = 0;
                for (m = 0; m < missing.length; m++)
                    if (missing[m] === target) {
                        seen = true;
                        break;
                    }
                if (!seen)
                    missing.push(target);
            }
        }
    }
    var WHITE = 0, GRAY = 1, BLACK = 2;
    var color = {};
    for (u = 0; u < nodes.length; u++)
        color[nodes[u]] = WHITE;
    var cycles = [];
    function dfs(start, stack) {
        color[start] = GRAY;
        stack.push(start);
        var arr = edges[start];
        var p = 0;
        for (p = 0; p < arr.length; p++) {
            var v = arr[p];
            if (color[v] === WHITE) {
                if (dfs(v, stack))
                    return true;
            }
            else if (color[v] === GRAY) {
                var ci = stack.length - 1;
                var cyc = [];
                while (ci >= 0 && stack[ci] !== v) {
                    ci--;
                }
                if (ci >= 0) {
                    var w = ci;
                    for (w = ci; w < stack.length; w++)
                        cyc.push(stack[w]);
                    cyc.push(v);
                }
                cycles.push(cyc);
                return true;
            }
        }
        stack.pop();
        color[start] = BLACK;
        return false;
    }
    for (u = 0; u < nodes.length; u++) {
        var node = nodes[u];
        if (color[node] === WHITE) {
            var stack = [];
            dfs(node, stack);
        }
    }
    return { missing: missing, cycles: cycles };
}
function keysOf(obj) {
    var keys = [];
    var k;
    for (k in obj)
        if (Object.prototype.hasOwnProperty.call(obj, k))
            keys.push(k);
    return keys;
}
