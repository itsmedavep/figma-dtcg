import { test, expect } from "vitest";
import { serialize } from "../../src/adapters/dtcg-writer";
import type { TokenGraph } from "../../src/core/ir";

test("dtcg-writer style dictionary + flat tokens", () => {
    const graph: TokenGraph = {
        tokens: [
            {
                path: ["Collection", "Group", "Base"],
                type: "color",
                byContext: {
                    "Collection/Mode 1": {
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
                path: ["Collection", "Group", "Alias"],
                type: "color",
                byContext: {
                    "Collection/Mode 1": {
                        kind: "alias",
                        path: ["Collection", "Group", "Base"],
                    },
                },
            },
        ],
    };

    const defaultJson = serialize(graph).json;
    const styleJson = serialize(graph, { styleDictionary: true }).json;
    const flatJson = serialize(graph, { flatTokens: true }).json;
    const combinedJson = serialize(graph, {
        styleDictionary: true,
        flatTokens: true,
    }).json;

    const expectedDefault = {
        Collection: {
            Group: {
                Base: {
                    $type: "color",
                    $value: {
                        colorSpace: "srgb",
                        components: [0.2, 0.4, 0.6],
                        hex: "#336699",
                    },
                },
                Alias: {
                    $type: "color",
                    $value: "{Collection.Group.Base}",
                },
            },
        },
    };

    const expectedStyle = {
        Collection: {
            Group: {
                Base: {
                    $type: "color",
                    $value: "#336699",
                },
                Alias: {
                    $type: "color",
                    $value: "{Collection.Group.Base}",
                },
            },
        },
    };

    const expectedFlat = {
        Group: {
            Base: {
                $type: "color",
                $value: {
                    colorSpace: "srgb",
                    components: [0.2, 0.4, 0.6],
                    hex: "#336699",
                },
            },
            Alias: {
                $type: "color",
                $value: "{Collection.Group.Base}",
            },
        },
    };

    const expectedCombined = {
        Group: {
            Base: {
                $type: "color",
                $value: "#336699",
            },
            Alias: {
                $type: "color",
                $value: "{Collection.Group.Base}",
            },
        },
    };

    expect(defaultJson).toEqual(expectedDefault);
    expect(styleJson).toEqual(expectedStyle);
    expect(flatJson).toEqual(expectedFlat);
    expect(combinedJson).toEqual(expectedCombined);
});
