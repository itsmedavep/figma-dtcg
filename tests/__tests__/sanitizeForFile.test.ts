import { test, expect } from "vitest";
import { sanitizeForFile } from "../../src/core/pipeline";

const invalidPattern = /[<>:"/|?*\u0000-\u001F]/;

const cases = [
    { input: "Colors: Primary/Light*", expected: "Colors_ Primary_Light_" },
    { input: " Mode 1 ", expected: "Mode 1" },
    { input: "folder.", expected: "folder" },
    { input: "\u0007bell", expected: "_bell" },
];

test.each(cases)(
    "sanitizeForFile($input) -> $expected",
    ({ input, expected }) => {
        const actual = sanitizeForFile(input);
        if (expected !== undefined) {
            expect(actual).toBe(expected);
        }
        expect(invalidPattern.test(actual)).toBe(false);
    }
);
