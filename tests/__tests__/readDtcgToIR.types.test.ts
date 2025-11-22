import { describe, test, expect, vi, afterEach } from "vitest";
import { readDtcgToIR } from "../../src/adapters/dtcg-reader";

describe("readDtcgToIR types", () => {
    const consoleWarnSpy = vi
        .spyOn(console, "warn")
        .mockImplementation(() => {});

    afterEach(() => {
        consoleWarnSpy.mockClear();
    });

    test("Tokens with mismatched declared type should be dropped", () => {
        // Declared type mismatch: token should be skipped entirely so type/value stay in sync.
        const mismatchedRoot = {
            Collection: {
                badNumber: {
                    $type: "number",
                    $value: "not-a-number",
                },
            },
        };

        const mismatchResult = readDtcgToIR(mismatchedRoot);
        expect(mismatchResult.tokens.length).toBe(0);
        expect(consoleWarnSpy).toHaveBeenCalledWith(
            expect.stringMatching(/badNumber/)
        );
    });

    test("Tokens without declared type should be considered invalid", () => {
        // No declared type: importer must reject the token rather than guessing.
        const typelessRoot = {
            Collection: {
                inferredNumber: {
                    $value: 42,
                },
            },
        };

        const typelessResult = readDtcgToIR(typelessRoot);
        expect(typelessResult.tokens.length).toBe(0);
        expect(consoleWarnSpy).toHaveBeenCalledWith(
            expect.stringMatching(/no \$type/)
        );
    });

    test("Alias tokens resolve their type from the referenced token", () => {
        // Alias tokens resolve their type from the referenced token.
        const aliasRoot = {
            Colors: {
                base: {
                    $type: "color",
                    $value: {
                        colorSpace: "srgb",
                        components: [0.1, 0.2, 0.3],
                    },
                },
                chained: {
                    $value: "{Colors.base}",
                },
                finalAlias: {
                    $value: "{Colors.chained}",
                },
            },
            Strings: {
                declaredStringAlias: {
                    $type: "string",
                    $value: "{Colors.base}",
                },
            },
        };

        const aliasResult = readDtcgToIR(aliasRoot);
        expect(aliasResult.tokens.length).toBe(4);

        const tokenByPath: {
            [path: string]: (typeof aliasResult.tokens)[number];
        } = {};
        for (const token of aliasResult.tokens) {
            tokenByPath[token.path.join("/")] = token;
        }

        const baseToken = tokenByPath["Colors/base"];
        expect(baseToken).toBeDefined();
        expect(baseToken.type).toBe("color");

        const chainedToken = tokenByPath["Colors/chained"];
        expect(chainedToken).toBeDefined();
        expect(chainedToken.type).toBe("color");

        const finalAliasToken = tokenByPath["Colors/finalAlias"];
        expect(finalAliasToken).toBeDefined();
        expect(finalAliasToken.type).toBe("color");

        const declaredStringAlias = tokenByPath["Strings/declaredStringAlias"];
        expect(declaredStringAlias).toBeDefined();
        expect(declaredStringAlias.type).toBe("color");

        expect(consoleWarnSpy).toHaveBeenCalledWith(
            expect.stringMatching(/declared \$type string/)
        );
    });

    test("Typography tokens should import with structured values", () => {
        // Typography tokens should import with structured values.
        const typographyRoot = {
            typography: {
                Body: {
                    Regular: {
                        $type: "typography",
                        $value: {
                            fontFamily: "Inter",
                            fontWeight: "Regular",
                            fontSize: { value: 16, unit: "px" },
                            lineHeight: 1.5,
                            letterSpacing: { value: 0, unit: "px" },
                            textCase: "none",
                            textDecoration: "none",
                        },
                    },
                },
            },
        };

        const typographyResult = readDtcgToIR(typographyRoot);
        expect(typographyResult.tokens.length).toBe(1);

        const typographyToken = typographyResult.tokens[0];
        expect(typographyToken.type).toBe("typography");

        const ctxVal = typographyToken.byContext["typography/Mode 1"];
        expect(ctxVal).toBeDefined();
        if (ctxVal && ctxVal.kind === "typography") {
            expect(ctxVal.value.fontFamily).toBe("Inter");
        } else {
            throw new Error("Expected typography value");
        }
    });
});
