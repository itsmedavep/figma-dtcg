
import type { TokenGraph, TokenNode } from './ir';

export function normalize(graph: TokenGraph): TokenGraph {
  // Here we could add: cycle detection for aliases, dedupe, etc.
  // For now, ensure stable order and unique paths.
  const seen = new Set<string>();
  const tokens: TokenNode[] = [];
  for (const t of graph.tokens) {
    const key = t.path.join('/');
    if (!seen.has(key)) {
      seen.add(key);
      tokens.push(t);
    }
  }
  return { tokens };
}
