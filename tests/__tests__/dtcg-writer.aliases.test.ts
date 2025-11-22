import { test, expect } from "vitest";
import { serialize } from "../../src/adapters/dtcg-writer";
import type { TokenGraph } from "../../src/core/ir";

test('serialize should preserve user-authored "Collection N" segments', () => {
    const graph: TokenGraph = {
        tokens: [
            {
                path: ["Primitives", "Collection 1", "Neutral", "Fill"],
                type: "color",
                byContext: {
                    "Primitives/Mode 1": {
                        kind: "color",
                        value: {
                            colorSpace: "srgb",
                            components: [0.2, 0.4, 0.6],
                            hex: "#336699",
                        },
                    },
                },
            },
            {
                path: ["Brand", "Collection 2", "Primary", "Fill"],
                type: "color",
                byContext: {
                    "Brand/Mode 1": {
                        kind: "alias",
                        path: ["Primitives", "Collection 1", "Neutral", "Fill"],
                    },
                },
            },
        ],
    };

    const result = serialize(graph).json;

    const expected = {
        Primitives: {
            "Collection 1": {
                Neutral: {
                    Fill: {
                        $type: "color",
                        $value: {
                            colorSpace: "srgb",
                            components: [0.2, 0.4, 0.6],
                            hex: "#336699",
                        },
                    },
                },
            },
        },
        Brand: {
            "Collection 2": {
                Primary: {
                    Fill: {
                        $type: "color",
                        $value: "{Primitives.Collection 1.Neutral.Fill}",
                    },
                },
            },
        },
    };

    expect(result).toEqual(expected);
});
