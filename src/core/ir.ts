
export type PrimitiveType = 'color' | 'number' | 'string' | 'boolean' | 'dimension';

export type AliasRef = { kind: 'alias'; path: string };
export type ColorValue = { colorSpace: 'srgb'; components: [number, number, number]; alpha?: number; hex?: string };
export type DimensionValue = { value: number; unit: 'px'|'rem'|'em'|'pt'|'percent' };

export type PrimitiveValue =
  | { kind: 'color'; value: ColorValue }
  | { kind: 'number'; value: number }
  | { kind: 'string'; value: string }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'dimension'; value: DimensionValue };

export type ValueOrAlias = PrimitiveValue | AliasRef;

export interface TokenNode {
  path: string[];                     // group path + name
  type: PrimitiveType;                // resolved type
  byContext: Record<string, ValueOrAlias>; // 'Collection/mode=Light' => value
  description?: string;
  extensions?: Record<string, unknown>;
}

export interface TokenGraph {
  tokens: TokenNode[];
}

export const ctxKey = (collection: string, mode: string) => `${collection}/mode=${mode}`;
export const tokenNameFromPath = (p: string[]) => p.join('/');
