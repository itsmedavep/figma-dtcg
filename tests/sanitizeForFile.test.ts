import { sanitizeForFile } from '../src/core/pipeline';

declare const console: { log(...args: unknown[]): void };

const invalidPattern = /[<>:"/\\|?*\u0000-\u001F]/;

const cases: Array<{ input: string; expected?: string }> = [
  { input: 'Colors: Primary/Light*', expected: 'Colors_ Primary_Light_' },
  { input: ' Mode 1 ', expected: 'Mode 1' },
  { input: 'folder.', expected: 'folder' },
  { input: '\u0007bell', expected: '_bell' }
];

function assertEqual(actual: string, expected: string, message: string): void {
  if (actual !== expected) {
    throw new Error(message + ` (expected: "${expected}", actual: "${actual}")`);
  }
}

function assertCondition(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

for (const { input, expected } of cases) {
  const actual = sanitizeForFile(input);
  if (expected !== undefined) {
    assertEqual(actual, expected, `Sanitized name mismatch for "${input}"`);
  }
  assertCondition(!invalidPattern.test(actual), `Sanitized name still contains invalid characters: ${actual}`);
}

console.log('sanitizeForFile tests passed');
