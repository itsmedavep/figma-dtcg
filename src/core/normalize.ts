// src/core/normalize.ts
// Shared helpers for names, paths, alias parsing, and graph checks.

import type { TokenGraph, TokenNode, ValueOrAlias } from './ir';

/* =========================
   Naming & Path Utilities
   ========================= */

export function slugSegment(s: string): string {
  var cleaned = s.replace(/\s+/g, '-').trim().toLowerCase();
  var out = '';
  var i = 0;
  for (i = 0; i < cleaned.length; i++) {
    var ch = cleaned.charAt(i);
    if (ch === '{' || ch === '}' || ch === '.' || ch === ':' || ch === '\\' || ch === '/') ch = '-';
    var ok =
      (ch >= 'a' && ch <= 'z') ||
      (ch >= '0' && ch <= '9') ||
      ch === '-';
    out += ok ? ch : '-';
  }
  out = out.replace(/-+/g, '-');
  if (out.length > 0 && out.charAt(0) === '$') out = 'dollar' + out.substring(1);
  if (out.length === 0) out = 'unnamed';
  return out;
}

export function canonicalPath(collectionName: string, variableName: string): string[] {
  var segs = variableName.split('/');
  var out: string[] = [];
  out.push(slugSegment(collectionName));
  var i = 0;
  for (i = 0; i < segs.length; i++) out.push(slugSegment(segs[i]));
  return out;
}

export function toDot(path: string[]): string {
  var i = 0, s = '';
  for (i = 0; i < path.length; i++) {
    if (i > 0) s += '.';
    s += path[i];
  }
  return s;
}

export function toAliasString(path: string[]): string {
  return '{' + toDot(path) + '}';
}

export function parseAliasString(s: string): string[] | null {
  if (typeof s !== 'string') return null;
  if (s.length < 3) return null;
  if (s.charAt(0) !== '{' || s.charAt(s.length - 1) !== '}') return null;
  var inner = s.substring(1, s.length - 1);
  if (!inner) return null;
  return inner.split('.');
}

/* =========================
   Graph Utilities
   ========================= */

export function normalize(graph: TokenGraph): TokenGraph {
  var seen: { [k: string]: 1 } = {};
  var copy: TokenNode[] = [];
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
    if (da < db) return -1;
    if (da > db) return 1;
    return 0;
  });
  return { tokens: copy };
}

function slashPath(path: string[]): string {
  var i = 0, s = '';
  for (i = 0; i < path.length; i++) {
    if (i > 0) s += '/';
    s += path[i];
  }
  return s;
}

export function indexByDotPath(graph: TokenGraph): { [dot: string]: TokenNode } {
  var idx: { [dot: string]: TokenNode } = {};
  var i = 0;
  for (i = 0; i < graph.tokens.length; i++) {
    var t = graph.tokens[i];
    idx[toDot(t.path)] = t;
  }
  return idx;
}

export function isAlias(v: ValueOrAlias): v is { kind: 'alias'; path: string[] } {
  return !!v && v.kind === 'alias';
}

export function analyzeAliases(graph: TokenGraph): { missing: string[]; cycles: string[][] } {
  var idx = indexByDotPath(graph);
  var edges: { [from: string]: string[] } = {};
  var nodes: string[] = [];

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

  var missing: string[] = [];
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
        for (m = 0; m < missing.length; m++) if (missing[m] === target) { seen = true; break; }
        if (!seen) missing.push(target);
      }
    }
  }

  var WHITE = 0, GRAY = 1, BLACK = 2;
  var color: { [node: string]: number } = {};
  for (u = 0; u < nodes.length; u++) color[nodes[u]] = WHITE;

  var cycles: string[][] = [];

  function dfs(start: string, stack: string[]): boolean {
    color[start] = GRAY;
    stack.push(start);
    var arr = edges[start];
    var p = 0;
    for (p = 0; p < arr.length; p++) {
      var v = arr[p];
      if (color[v] === WHITE) {
        if (dfs(v, stack)) return true;
      } else if (color[v] === GRAY) {
        var ci = stack.length - 1;
        var cyc: string[] = [];
        while (ci >= 0 && stack[ci] !== v) { ci--; }
        if (ci >= 0) {
          var w = ci;
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
    var node = nodes[u];
    if (color[node] === WHITE) {
      var stack: string[] = [];
      dfs(node, stack);
    }
  }

  return { missing: missing, cycles: cycles };
}

function keysOf<T>(obj: { [k: string]: T }): string[] {
  var keys: string[] = [];
  var k: string;
  for (k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) keys.push(k);
  return keys;
}
