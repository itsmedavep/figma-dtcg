import { test, expect } from "vitest";
import { serialize } from "../../src/adapters/dtcg-writer";
import type { TokenGraph } from "../../src/core/ir";

test("serialize should emit typography payloads", () => {
    const graph: TokenGraph = {
        tokens: [
            {
                path: ["typography", "Body", "Regular"],
                type: "typography",
                byContext: {
                    "typography/Mode 1": {
                        kind: "typography",
                        value: {
                            fontFamily: "Inter",
                            fontWeight: "Regular",
                            fontSize: { value: 16, unit: "pixel" },
                            lineHeight: "auto",
                            letterSpacing: { value: 0, unit: "pixel" },
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
                    $type: "typography",
                    $value: {
                        fontFamily: "Inter",
                        fontWeight: "Regular",
                        fontSize: { value: 16, unit: "px" },
                        lineHeight: "auto",
                        letterSpacing: { value: 0, unit: "px" },
                    },
                },
            },
        },
    };

    expect(result).toEqual(expected);
});

test("serialize should normalize percentage letter-spacing and line-height", () => {
    const percentGraph: TokenGraph = {
        tokens: [
            {
                path: ["typography", "Display", "Tight"],
                type: "typography",
                byContext: {
                    "typography/Mode 1": {
                        kind: "typography",
                        value: {
                            fontFamily: "Inter",
                            fontWeight: "Bold",
                            fontSize: { value: 20, unit: "pixel" },
                            letterSpacing: { value: -5, unit: "percent" },
                            lineHeight: { value: 150, unit: "percent" },
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
                    $type: "typography",
                    $value: {
                        fontFamily: "Inter",
                        fontWeight: "Bold",
                        fontSize: { value: 20, unit: "px" },
                        letterSpacing: { value: -1, unit: "px" },
                        lineHeight: 1.5,
                    },
                },
            },
        },
    };

    expect(percentResult).toEqual(percentExpected);
});
