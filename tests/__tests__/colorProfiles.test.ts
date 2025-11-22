import {
  normalizeDocumentProfile,
  isColorSpaceRepresentableInDocument
} from '../src/core/color';

declare const console: { log(...args: unknown[]): void };

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message} (expected: ${String(expected)}, actual: ${String(actual)})`);
  }
}

function assertCondition(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

const normalizedDisplayP3 = normalizeDocumentProfile('DOCUMENT_DISPLAY_P3');
const normalizedSrgb = normalizeDocumentProfile('DOCUMENT_SRGB');
assertEqual(normalizedDisplayP3, 'DISPLAY_P3', 'normalizeDocumentProfile should map DOCUMENT_DISPLAY_P3 to DISPLAY_P3');
assertEqual(normalizedSrgb, 'SRGB', 'normalizeDocumentProfile should map DOCUMENT_SRGB to SRGB');

assertCondition(
  isColorSpaceRepresentableInDocument('display-p3', 'DOCUMENT_DISPLAY_P3'),
  'display-p3 colors should be representable in DOCUMENT_DISPLAY_P3 profiles'
);
assertCondition(
  !isColorSpaceRepresentableInDocument('display-p3', 'DOCUMENT_SRGB'),
  'display-p3 colors should NOT be representable in DOCUMENT_SRGB profiles'
);

console.log('color profile normalization tests passed');
