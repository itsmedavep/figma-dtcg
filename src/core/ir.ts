// src/core/ir.ts
// Central token graph types shared between adapters.
// - Defines the minimal shape needed to round-trip DTCG and Figma
// - Keeps primitive helpers colocated with the structural types

/** Primitive kinds supported by both Figma variables and DTCG. */
export type PrimitiveType = 'color' | 'number' | 'string' | 'boolean';

/** Normalized color payload aligning with DTCG's schema. */
export interface ColorValue {
  colorSpace: 'srgb' | 'display-p3';
  components: [number, number, number]; // 0..1
  alpha?: number;                       // 0..1
  hex?: string;                         // sRGB fallback "#RRGGBB"
}

export type ValueOrAlias =
  | { kind: 'alias'; path: string[] }
  | { kind: 'color'; value: ColorValue }
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'boolean'; value: boolean };

/** Single token entry with canonical path + per-context values. */
export interface TokenNode {
  path: string[];                         // canonical path segments
  type: PrimitiveType;
  byContext: { [ctx: string]: ValueOrAlias }; // ctx like "Collection/Mode"
  description?: string;
  extensions?: { [k: string]: unknown };
}

/** Container for all tokens we imported or plan to export. */
export interface TokenGraph {
  tokens: TokenNode[];
}

/** Build a context key like `Collection/Mode`. */
export function ctxKey(collection: string, mode: string): string {
  return collection + '/' + mode;
}
