"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const color_1 = require("../src/core/color");
function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(`${message} (expected: ${String(expected)}, actual: ${String(actual)})`);
    }
}
function assertCondition(cond, message) {
    if (!cond)
        throw new Error(message);
}
const normalizedDisplayP3 = (0, color_1.normalizeDocumentProfile)('DOCUMENT_DISPLAY_P3');
const normalizedSrgb = (0, color_1.normalizeDocumentProfile)('DOCUMENT_SRGB');
assertEqual(normalizedDisplayP3, 'DISPLAY_P3', 'normalizeDocumentProfile should map DOCUMENT_DISPLAY_P3 to DISPLAY_P3');
assertEqual(normalizedSrgb, 'SRGB', 'normalizeDocumentProfile should map DOCUMENT_SRGB to SRGB');
assertCondition((0, color_1.isColorSpaceRepresentableInDocument)('display-p3', 'DOCUMENT_DISPLAY_P3'), 'display-p3 colors should be representable in DOCUMENT_DISPLAY_P3 profiles');
assertCondition(!(0, color_1.isColorSpaceRepresentableInDocument)('display-p3', 'DOCUMENT_SRGB'), 'display-p3 colors should NOT be representable in DOCUMENT_SRGB profiles');
console.log('color profile normalization tests passed');
