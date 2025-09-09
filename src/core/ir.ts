// src/core/ir.ts

export type PrimitiveType = 'color' | 'number' | 'string' | 'boolean';

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

export interface TokenNode {
  path: string[];                         // canonical path segments
  type: PrimitiveType;
  byContext: { [ctx: string]: ValueOrAlias }; // ctx like "Collection/Mode"
  description?: string;
  extensions?: { [k: string]: unknown };
}

export interface TokenGraph {
  tokens: TokenNode[];
}

/** Build a context key like "Collection/Mode". */
export function ctxKey(collection: string, mode: string): string {
  return collection + '/' + mode;
}
