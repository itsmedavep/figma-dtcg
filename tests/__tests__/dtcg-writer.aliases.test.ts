import { serialize } from '../src/adapters/dtcg-writer';
import type { TokenGraph } from '../src/core/ir';

declare const console: { log(...args: unknown[]): void };

function stableStringify(value: unknown): string {
  return JSON.stringify(
    value,
    (_, v) => {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        const ordered: { [k: string]: unknown } = {};
        for (const key of Object.keys(v as Record<string, unknown>).sort()) {
          ordered[key] = (v as Record<string, unknown>)[key];
        }
        return ordered;
      }
      return v;
    },
    2
  );
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = stableStringify(actual);
  const expectedJson = stableStringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}\nExpected: ${expectedJson}\nActual:   ${actualJson}`);
  }
}

const graph: TokenGraph = {
  tokens: [
    {
      path: ['Primitives', 'Collection 1', 'Neutral', 'Fill'],
      type: 'color',
      byContext: {
        'Primitives/Mode 1': {
          kind: 'color',
          value: {
            colorSpace: 'srgb',
            components: [0.2, 0.4, 0.6],
            hex: '#336699',
          },
        },
      },
    },
    {
      path: ['Brand', 'Collection 2', 'Primary', 'Fill'],
      type: 'color',
      byContext: {
        'Brand/Mode 1': {
          kind: 'alias',
          path: ['Primitives', 'Collection 1', 'Neutral', 'Fill'],
        },
      },
    },
  ],
};

const result = serialize(graph).json;

const expected = {
  Primitives: {
    'Collection 1': {
      Neutral: {
        Fill: {
          $type: 'color',
          $value: {
            colorSpace: 'srgb',
            components: [0.2, 0.4, 0.6],
            hex: '#336699',
          },
        },
      },
    },
  },
  Brand: {
    'Collection 2': {
      Primary: {
        Fill: {
          $type: 'color',
          $value: '{Primitives.Collection 1.Neutral.Fill}',
        },
      },
    },
  },
};

assertDeepEqual(result, expected, 'serialize should preserve user-authored "Collection N" segments');

console.log('dtcg-writer alias serialization test passed');
