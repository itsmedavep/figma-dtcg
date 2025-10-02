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
            fontSize: { value: 16, unit: 'pixel' },
            lineHeight: 'auto',
            letterSpacing: { value: 0, unit: 'pixel' },
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
          fontSize: { value: 16, unit: 'pixel' },
          lineHeight: 'auto',
          letterSpacing: { value: 0, unit: 'pixel' },
        },
      },
    },
  },
};

assertDeepEqual(result, expected, 'serialize should emit typography payloads');

console.log('dtcg-writer typography serialization test passed');
