import { describe, test, expect } from "vitest";
import {
    normalizeDocumentProfile,
    isColorSpaceRepresentableInDocument,
} from "../../src/core/color";

describe("colorProfiles", () => {
    test("normalizeDocumentProfile should map document profiles to standard profiles", () => {
        const normalizedDisplayP3 = normalizeDocumentProfile(
            "DOCUMENT_DISPLAY_P3"
        );
        const normalizedSrgb = normalizeDocumentProfile("DOCUMENT_SRGB");
        expect(normalizedDisplayP3).toBe("DISPLAY_P3");
        expect(normalizedSrgb).toBe("SRGB");
    });

    test("isColorSpaceRepresentableInDocument should correctly identify representable color spaces", () => {
        expect(
            isColorSpaceRepresentableInDocument(
                "display-p3",
                "DOCUMENT_DISPLAY_P3"
            )
        ).toBe(true);
        expect(
            isColorSpaceRepresentableInDocument("display-p3", "DOCUMENT_SRGB")
        ).toBe(false);
    });
});
