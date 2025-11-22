import { readDtcgToIR } from '../src/adapters/dtcg-reader';

declare const console: {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
};

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message} (expected: ${String(expected)}, actual: ${String(actual)})`);
  }
}

function assertCondition(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

// Declared type mismatch: token should be skipped entirely so type/value stay in sync.
const mismatchedRoot = {
  Collection: {
    badNumber: {
      $type: 'number',
      $value: 'not-a-number'
    }
  }
};

const mismatchedWarnings: string[] = [];
const originalWarn = console.warn;
console.warn = (...args: unknown[]): void => {
  mismatchedWarnings.push(args.map(a => String(a)).join(' '));
};

const mismatchResult = readDtcgToIR(mismatchedRoot);
assertEqual(mismatchResult.tokens.length, 0, 'Tokens with mismatched declared type should be dropped');
assertCondition(
  mismatchedWarnings.some(w => w.includes('badNumber')), 
  'Declared type mismatch should emit a warning'
);
console.warn = originalWarn;

// No declared type: importer must reject the token rather than guessing.
const typelessRoot = {
  Collection: {
    inferredNumber: {
      $value: 42
    }
  }
};

const typelessWarnings: string[] = [];
const originalWarn2 = console.warn;
console.warn = (...args: unknown[]): void => {
  typelessWarnings.push(args.map(a => String(a)).join(' '));
};
const typelessResult = readDtcgToIR(typelessRoot);
assertEqual(typelessResult.tokens.length, 0, 'Tokens without declared type should be considered invalid');
assertCondition(
  typelessWarnings.some(w => w.includes('no $type')), 
  'Typeless token rejection should emit a warning'
);
console.warn = originalWarn2;

// Alias tokens resolve their type from the referenced token.
const aliasRoot = {
  Colors: {
    base: {
      $type: 'color',
      $value: {
        colorSpace: 'srgb',
        components: [0.1, 0.2, 0.3]
      }
    },
    chained: {
      $value: '{Colors.base}'
    },
    finalAlias: {
      $value: '{Colors.chained}'
    }
  },
  Strings: {
    declaredStringAlias: {
      $type: 'string',
      $value: '{Colors.base}'
    }
  }
};

const aliasWarnings: string[] = [];
const originalWarn3 = console.warn;
console.warn = (...args: unknown[]): void => {
  aliasWarnings.push(args.map(a => String(a)).join(' '));
};
const aliasResult = readDtcgToIR(aliasRoot);
assertEqual(aliasResult.tokens.length, 4, 'All valid tokens should import');

const tokenByPath: { [path: string]: (typeof aliasResult.tokens)[number] } = {};
for (const token of aliasResult.tokens) {
  tokenByPath[token.path.join('/')] = token;
}

const baseToken = tokenByPath['Colors/base'];
assertCondition(!!baseToken, 'Base color token should exist');
assertEqual(baseToken.type, 'color', 'Base token keeps declared color type');

const chainedToken = tokenByPath['Colors/chained'];
assertCondition(!!chainedToken, 'Alias token should exist');
assertEqual(chainedToken.type, 'color', 'Alias resolves type from referenced token');

const finalAliasToken = tokenByPath['Colors/finalAlias'];
assertCondition(!!finalAliasToken, 'Chained alias token should exist');
assertEqual(finalAliasToken.type, 'color', 'Alias chains resolve to the ultimate token type');

const declaredStringAlias = tokenByPath['Strings/declaredStringAlias'];
assertCondition(!!declaredStringAlias, 'Declared alias token should exist');
assertEqual(declaredStringAlias.type, 'color', 'Resolved alias type overrides declared string type');
assertCondition(
  aliasWarnings.some(w => w.includes('declared $type string')), 
  'Alias type resolution should note declared type mismatch'
);
console.warn = originalWarn3;

// Typography tokens should import with structured values.
const typographyRoot = {
  typography: {
    Body: {
      Regular: {
        $type: 'typography',
        $value: {
          fontFamily: 'Inter',
          fontWeight: 'Regular',
          fontSize: { value: 16, unit: 'px' },
          lineHeight: 1.5,
          letterSpacing: { value: 0, unit: 'px' },
          textCase: 'none',
          textDecoration: 'none'
        }
      }
    }
  }
};

const typographyResult = readDtcgToIR(typographyRoot);
assertEqual(typographyResult.tokens.length, 1, 'Typography token should import');
const typographyToken = typographyResult.tokens[0];
assertEqual(typographyToken.type, 'typography', 'Typography token retains type');
const ctxVal = typographyToken.byContext['typography/Mode 1'];
assertCondition(!!ctxVal, 'Typography context should exist');
assertEqual((ctxVal as any).kind, 'typography', 'Typography context stores structured value');
assertEqual((ctxVal as any).value.fontFamily, 'Inter', 'Typography value preserves font family');

console.log('readDtcgToIR primitive type and alias resolution tests passed');
