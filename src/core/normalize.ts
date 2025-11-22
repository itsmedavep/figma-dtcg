// src/core/normalize.ts
// Shared helpers for names, paths, alias parsing, and graph checks.
// - Normalizes paths so adapters stay in sync
// - Provides alias analysis utilities for validation and exports

import type { TokenGraph, TokenNode, ValueOrAlias } from "./ir";

/* =========================
   Naming & Path Utilities
   ========================= */
/** Slug a single path segment for lookup (never for emission). */
export function slugSegment(s: string): string {
    return String(s)
        .trim()
        .replace(/\s+/g, "-") // collapse whitespace to '-'
        .replace(/-+/g, "-") // collapse runs of '-'
        .toLowerCase();
}

/**
 * Return a canonical token path using Figma's display names.
 * Always splits variable names on '/', trims segments, and removes empties.
 */
export function canonicalPath(
    collection: string,
    variableName: string
): string[] {
    const segs = String(variableName)
        .split("/")
        .map((s) => s.trim())
        .filter(Boolean);
    return [collection, ...segs];
}

export function toDot(path: string[]): string {
    let i = 0,
        s = "";
    for (i = 0; i < path.length; i++) {
        if (i > 0) s += ".";
        s += path[i];
    }
    return s;
}

export function toAliasString(path: string[]): string {
    return "{" + toDot(path) + "}";
}

export function parseAliasString(s: string): string[] | null {
    if (typeof s !== "string") return null;
    if (s.length < 3) return null;
    if (s.charAt(0) !== "{" || s.charAt(s.length - 1) !== "}") return null;
    const inner = s.substring(1, s.length - 1);
    if (!inner) return null;
    return inner.split(".");
}

/* =========================
   Graph Utilities
   ========================= */

/**
 * Deduplicate tokens by slash path and sort them for stable comparisons.
 * Keeps adapters from reordering content across reads/writes.
 */
export function normalize(graph: TokenGraph): TokenGraph {
    const seen: { [k: string]: 1 } = {};
    const copy: TokenNode[] = [];
    let i = 0;
    for (i = 0; i < graph.tokens.length; i++) {
        const t = graph.tokens[i];
        const key = slashPath(t.path);
        if (!seen[key]) {
            seen[key] = 1;
            copy.push(t);
        }
    }
    copy.sort(function (a, b) {
        const da = toDot(a.path);
        const db = toDot(b.path);
        if (da < db) return -1;
        if (da > db) return 1;
        return 0;
    });
    return { tokens: copy };
}

function slashPath(path: string[]): string {
    let i = 0,
        s = "";
    for (i = 0; i < path.length; i++) {
        if (i > 0) s += "/";
        s += path[i];
    }
    return s;
}

/** Build a dot-path index for quick alias resolution. */
export function indexByDotPath(graph: TokenGraph): {
    [dot: string]: TokenNode;
} {
    const idx: { [dot: string]: TokenNode } = {};
    let i = 0;
    for (i = 0; i < graph.tokens.length; i++) {
        const t = graph.tokens[i];
        idx[toDot(t.path)] = t;
    }
    return idx;
}

/** Type guard: true if the value is an alias entry. */
export function isAlias(
    v: ValueOrAlias
): v is { kind: "alias"; path: string[] } {
    return !!v && v.kind === "alias";
}

/**
 * Walk alias edges to find missing references and cycles.
 * Useful for validation before exporting or writing to Figma.
 */
export function analyzeAliases(graph: TokenGraph): {
    missing: string[];
    cycles: string[][];
} {
    const idx = indexByDotPath(graph);
    const edges: { [from: string]: string[] } = {};
    const nodes: string[] = [];

    let i = 0;
    for (i = 0; i < graph.tokens.length; i++) {
        const t = graph.tokens[i];
        const from = toDot(t.path);
        nodes.push(from);
        edges[from] = [];
        const ctxKeys = keysOf(t.byContext);
        let k = 0;
        for (k = 0; k < ctxKeys.length; k++) {
            const ctx = ctxKeys[k];
            const val = t.byContext[ctx];
            if (isAlias(val)) {
                const to = toDot(val.path);
                edges[from].push(to);
            }
        }
    }

    const missing: string[] = [];
    let u = 0;
    for (u = 0; u < nodes.length; u++) {
        const n = nodes[u];
        const outs = edges[n];
        let j = 0;
        for (j = 0; j < outs.length; j++) {
            const target = outs[j];
            if (!idx[target]) {
                let seen = false;
                let m = 0;
                for (m = 0; m < missing.length; m++)
                    if (missing[m] === target) {
                        seen = true;
                        break;
                    }
                if (!seen) missing.push(target);
            }
        }
    }

    const WHITE = 0,
        GRAY = 1,
        BLACK = 2;
    const color: { [node: string]: number } = {};
    for (u = 0; u < nodes.length; u++) color[nodes[u]] = WHITE;

    const cycles: string[][] = [];

    function dfs(start: string, stack: string[]): boolean {
        color[start] = GRAY;
        stack.push(start);
        const arr = edges[start];
        let p = 0;
        for (p = 0; p < arr.length; p++) {
            const v = arr[p];
            if (color[v] === WHITE) {
                if (dfs(v, stack)) return true;
            } else if (color[v] === GRAY) {
                let ci = stack.length - 1;
                const cyc: string[] = [];
                while (ci >= 0 && stack[ci] !== v) {
                    ci--;
                }
                if (ci >= 0) {
                    let w = ci;
                    for (w = ci; w < stack.length; w++) cyc.push(stack[w]);
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
        const node = nodes[u];
        if (color[node] === WHITE) {
            const stack: string[] = [];
            dfs(node, stack);
        }
    }

    return { missing: missing, cycles: cycles };
}

function keysOf<T>(obj: { [k: string]: T }): string[] {
    const keys: string[] = [];
    let k: string;
    for (k in obj)
        if (Object.prototype.hasOwnProperty.call(obj, k)) keys.push(k);
    return keys;
}
