"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const pipeline_1 = require("../src/core/pipeline");
const invalidPattern = /[<>:"/\\|?*\u0000-\u001F]/;
const cases = [
    { input: 'Colors: Primary/Light*', expected: 'Colors_ Primary_Light_' },
    { input: ' Mode 1 ', expected: 'Mode 1' },
    { input: 'folder.', expected: 'folder' },
    { input: '\u0007bell', expected: '_bell' }
];
function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(message + ` (expected: "${expected}", actual: "${actual}")`);
    }
}
function assertCondition(cond, message) {
    if (!cond)
        throw new Error(message);
}
for (const { input, expected } of cases) {
    const actual = (0, pipeline_1.sanitizeForFile)(input);
    if (expected !== undefined) {
        assertEqual(actual, expected, `Sanitized name mismatch for "${input}"`);
    }
    assertCondition(!invalidPattern.test(actual), `Sanitized name still contains invalid characters: ${actual}`);
}
console.log('sanitizeForFile tests passed');
