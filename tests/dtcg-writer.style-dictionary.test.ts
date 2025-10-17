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
      path: ['Collection', 'Group', 'Base'],
      type: 'color',
      byContext: {
        'Collection/Mode 1': {
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
      path: ['Collection', 'Group', 'Alias'],
      type: 'color',
      byContext: {
        'Collection/Mode 1': {
          kind: 'alias',
          path: ['Collection', 'Group', 'Base'],
        },
      },
    },
  ],
};

const defaultJson = serialize(graph).json;
const styleJson = serialize(graph, { styleDictionary: true }).json;
const flatJson = serialize(graph, { flatTokens: true }).json;
const combinedJson = serialize(graph, { styleDictionary: true, flatTokens: true }).json;

const expectedDefault = {
  Collection: {
    Group: {
      Base: {
        $type: 'color',
        $value: {
          colorSpace: 'srgb',
          components: [0.2, 0.4, 0.6],
          hex: '#336699',
        },
      },
      Alias: {
        $type: 'color',
        $value: '{Collection.Group.Base}',
      },
    },
  },
};

const expectedStyle = {
  Collection: {
    Group: {
      Base: {
        $type: 'color',
        $value: '#336699',
      },
      Alias: {
        $type: 'color',
        $value: '{Collection.Group.Base}',
      },
    },
  },
};

const expectedFlat = {
  Group: {
    Base: {
      $type: 'color',
      $value: {
        colorSpace: 'srgb',
        components: [0.2, 0.4, 0.6],
        hex: '#336699',
      },
    },
    Alias: {
      $type: 'color',
      $value: '{Collection.Group.Base}',
    },
  },
};

const expectedCombined = {
  Group: {
    Base: {
      $type: 'color',
      $value: '#336699',
    },
    Alias: {
      $type: 'color',
      $value: '{Collection.Group.Base}',
    },
  },
};

assertDeepEqual(defaultJson, expectedDefault, 'Default serialization should remain W3C JSON.');
assertDeepEqual(styleJson, expectedStyle, 'Style Dictionary mode should emit #RRGGBB strings.');
assertDeepEqual(flatJson, expectedFlat, 'Flat tokens mode should drop the collection wrapper.');
assertDeepEqual(combinedJson, expectedCombined, 'Style Dictionary + flat tokens should combine both behaviors.');

console.log('dtcg-writer style dictionary + flat tokens test passed');
