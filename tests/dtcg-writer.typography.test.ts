import { serialize } from '../src/adapters/dtcg-writer';
import type { TokenGraph } from '../src/core/ir';

declare const console: { log(...args: unknown[]): void };

function assertDeepEqual(actual: unknown, expected: unknown, message: string): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}\nExpected: ${expectedJson}\nActual:   ${actualJson}`);
  }
}

const graph: TokenGraph = {
  tokens: [
    {
      path: ['typography', 'Body', 'Regular'],
      type: 'typography',
      byContext: {
        'typography/Mode 1': {
          kind: 'typography',
          value: {
            fontFamily: 'Inter',
            fontWeight: 'Regular',
            fontSize: { value: 16, unit: 'px' },
            lineHeight: 'auto',
            letterSpacing: { value: 0, unit: 'px' },
          },
        },
      },
    },
  ],
};

const result = serialize(graph).json;

const expected = {
  typography: {
    Body: {
      Regular: {
        $type: 'typography',
        $value: {
          fontFamily: 'Inter',
          fontWeight: 'Regular',
          fontSize: { value: 16, unit: 'px' },
          lineHeight: 'auto',
          letterSpacing: { value: 0, unit: 'px' },
        },
      },
    },
  },
};

assertDeepEqual(result, expected, 'serialize should emit typography payloads');

const percentGraph: TokenGraph = {
  tokens: [
    {
      path: ['typography', 'Display', 'Tight'],
      type: 'typography',
      byContext: {
        'typography/Mode 1': {
          kind: 'typography',
          value: {
            fontFamily: 'Inter',
            fontWeight: 'Bold',
            fontSize: { value: 20, unit: 'pixel' },
            letterSpacing: { value: -5, unit: 'percent' },
            lineHeight: { value: 150, unit: 'percent' },
          },
        },
      },
    },
  ],
};

const percentResult = serialize(percentGraph).json;

const percentExpected = {
  typography: {
    Display: {
      Tight: {
        $type: 'typography',
        $value: {
          fontFamily: 'Inter',
          fontWeight: 'Bold',
          fontSize: { value: 20, unit: 'px' },
          letterSpacing: { value: -1, unit: 'px' },
          lineHeight: 1.5,
        },
      },
    },
  },
};

assertDeepEqual(percentResult, percentExpected, 'serialize should normalize percentage letter-spacing and line-height');

console.log('dtcg-writer typography serialization tests passed');
