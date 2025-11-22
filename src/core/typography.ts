// src/core/typography.ts
// Shared helpers for representing typography tokens and converting Figma text styles.

export type DimensionUnit = "pixel" | "percent";

export interface DimensionValue {
    value: number;
    unit: DimensionUnit;
}

type SerializedDimensionUnit = "px" | "percent";

interface SerializedDimensionValue {
    value: number;
    unit: SerializedDimensionUnit;
}

export type LineHeightValue = DimensionValue | "auto";

export type FigmaDimensionUnit = "PIXELS" | "PERCENT";

export interface FigmaDimensionValue {
    value: number;
    unit: FigmaDimensionUnit;
}

export type FigmaLineHeightValue =
    | { unit: "AUTO" }
    | { unit: FigmaDimensionUnit; value: number };

export interface TypographyFigmaExtension {
    fontStyle?: string;
    fontVariant?: string;
    letterSpacing?: FigmaDimensionValue;
    lineHeight?: FigmaLineHeightValue;
    paragraphSpacing?: number;
    paragraphIndent?: number;
    listSpacing?: number;
    hangingPunctuation?: boolean;
    hangingList?: boolean;
    leadingTrim?: unknown;
    textCase?: string;
    textDecoration?: string;
    textAlignHorizontal?: string;
    textAlignVertical?: string;
    textAutoResize?: string;
    fills?: unknown;
    strokes?: unknown;
    [key: string]: unknown;
}

export interface TypographyValue {
    fontFamily?: string;
    fontStyle?: string;
    fontWeight?: string;
    fontSize?: DimensionValue;
    lineHeight?: LineHeightValue;
    letterSpacing?: DimensionValue;
    paragraphSpacing?: DimensionValue;
    paragraphIndent?: DimensionValue;
    textCase?: string;
    textDecoration?: string;
    textAlignHorizontal?: string;
    textAlignVertical?: string;
    fontVariant?: string;
    [key: string]: unknown;
}

export interface TypographyFromTextStyleResult {
    value: TypographyValue;
    figma: TypographyFigmaExtension;
}

const KNOWN_KEYS: { [k: string]: true } = {
    fontFamily: true,
    fontStyle: true,
    fontWeight: true,
    fontSize: true,
    lineHeight: true,
    letterSpacing: true,
    paragraphSpacing: true,
    paragraphIndent: true,
    textCase: true,
    textDecoration: true,
    textAlignHorizontal: true,
    textAlignVertical: true,
    fontVariant: true,
};

function isFiniteNumber(v: unknown): v is number {
    return typeof v === "number" && isFinite(v);
}

function normalizeUnit(raw: unknown): DimensionUnit | null {
    if (typeof raw !== "string") return null;
    const lower = raw.trim().toLowerCase();
    if (lower === "pixel" || lower === "pixels" || lower === "px")
        return "pixel";
    if (lower === "percent" || lower === "percentage" || lower === "%")
        return "percent";
    return null;
}

function parseDimension(raw: unknown): DimensionValue | null {
    if (!raw || typeof raw !== "object") return null;
    const obj = raw as Record<string, unknown>;
    const value = obj.value;
    const unit = normalizeUnit(obj.unit);
    if (!isFiniteNumber(value) || !unit) return null;
    return { value, unit };
}

function parsePixelDimension(raw: unknown): DimensionValue | null {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        return parseDimension(raw);
    }
    if (isFiniteNumber(raw)) {
        return { value: raw, unit: "pixel" };
    }
    return null;
}

// Parse a JSON-friendly payload into the normalized typography value shape expected by the pipeline.
export function parseTypographyValue(raw: unknown): TypographyValue | null {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const obj = raw as Record<string, unknown>;
    const value: TypographyValue = {};
    let recognized = false;

    if (
        typeof obj.fontFamily === "string" &&
        obj.fontFamily.trim().length > 0
    ) {
        value.fontFamily = obj.fontFamily;
        recognized = true;
    }
    if (typeof obj.fontStyle === "string" && obj.fontStyle.trim().length > 0) {
        value.fontStyle = obj.fontStyle;
        recognized = true;
    }
    if (
        typeof obj.fontWeight === "string" &&
        obj.fontWeight.trim().length > 0
    ) {
        value.fontWeight = obj.fontWeight;
        recognized = true;
    }
    if (
        typeof obj.fontVariant === "string" &&
        obj.fontVariant.trim().length > 0
    ) {
        value.fontVariant = obj.fontVariant;
        recognized = true;
    }

    const fontSize = parseDimension(obj.fontSize);
    if (fontSize) {
        value.fontSize = fontSize;
        recognized = true;
    }

    const rawLineHeight = obj.lineHeight;
    if (typeof rawLineHeight === "number") {
        if (isFiniteNumber(rawLineHeight)) {
            value.lineHeight = { value: rawLineHeight * 100, unit: "percent" };
            recognized = true;
        }
    } else if (typeof rawLineHeight === "string") {
        if (rawLineHeight.trim().toLowerCase() === "auto") {
            value.lineHeight = "auto";
            recognized = true;
        }
    } else {
        const lineHeight = parseDimension(rawLineHeight);
        if (lineHeight) {
            value.lineHeight = lineHeight;
            recognized = true;
        }
    }

    const letterSpacing = parseDimension(obj.letterSpacing);
    if (letterSpacing) {
        value.letterSpacing = letterSpacing;
        recognized = true;
    }

    const paragraphSpacing = parsePixelDimension(obj.paragraphSpacing);
    if (paragraphSpacing) {
        value.paragraphSpacing = paragraphSpacing;
        recognized = true;
    }

    const paragraphIndent = parsePixelDimension(obj.paragraphIndent);
    if (paragraphIndent) {
        value.paragraphIndent = paragraphIndent;
        recognized = true;
    }

    if (typeof obj.textCase === "string" && obj.textCase.trim().length > 0) {
        value.textCase = obj.textCase;
        recognized = true;
    }

    if (
        typeof obj.textDecoration === "string" &&
        obj.textDecoration.trim().length > 0
    ) {
        value.textDecoration = obj.textDecoration;
        recognized = true;
    }

    if (
        typeof obj.textAlignHorizontal === "string" &&
        obj.textAlignHorizontal.trim().length > 0
    ) {
        value.textAlignHorizontal = obj.textAlignHorizontal;
        recognized = true;
    }

    if (
        typeof obj.textAlignVertical === "string" &&
        obj.textAlignVertical.trim().length > 0
    ) {
        value.textAlignVertical = obj.textAlignVertical;
        recognized = true;
    }

    // Preserve additional custom fields to avoid data loss.
    for (const key of Object.keys(obj)) {
        if (KNOWN_KEYS[key]) continue;
        const v = obj[key];
        if (typeof v === "undefined") continue;
        (value as Record<string, unknown>)[key] = v;
    }

    return recognized ? value : null;
}

function normalizeLetterSpacingForSerialization(
    letterSpacing: DimensionValue | undefined,
    fontSizePx: number | undefined
): SerializedDimensionValue | undefined {
    if (!letterSpacing) return undefined;
    if (letterSpacing.unit === "pixel") {
        return { value: letterSpacing.value, unit: "px" };
    }
    if (letterSpacing.unit === "percent" && typeof fontSizePx === "number") {
        return { value: (letterSpacing.value / 100) * fontSizePx, unit: "px" };
    }
    return undefined;
}

function normalizeLineHeightForSerialization(
    lineHeight: LineHeightValue | undefined,
    fontSizePx: number | undefined
): number | "auto" | undefined {
    if (!lineHeight) return undefined;
    if (lineHeight === "auto") return "auto";
    if (lineHeight.unit === "percent") {
        return lineHeight.value / 100;
    }
    if (
        lineHeight.unit === "pixel" &&
        typeof fontSizePx === "number" &&
        fontSizePx !== 0
    ) {
        return lineHeight.value / fontSizePx;
    }
    return undefined;
}

// Convert a normalized typography value into a DTCG-compliant fragment for export.
export function serializeTypographyValue(
    value: TypographyValue
): Record<string, unknown> {
    const out: Record<string, unknown> = {};

    if (typeof value.fontFamily === "string") out.fontFamily = value.fontFamily;
    if (typeof value.fontWeight === "string") out.fontWeight = value.fontWeight;

    const fontSizePx = ((): number | undefined => {
        if (!value.fontSize) return undefined;
        if (value.fontSize.unit === "pixel") {
            const serialized: SerializedDimensionValue = {
                value: value.fontSize.value,
                unit: "px",
            };
            out.fontSize = serialized;
            return value.fontSize.value;
        }
        return undefined;
    })();

    const normalizedLetterSpacing = normalizeLetterSpacingForSerialization(
        value.letterSpacing,
        fontSizePx
    );
    if (normalizedLetterSpacing) {
        out.letterSpacing = normalizedLetterSpacing;
    }

    const normalizedLineHeight = normalizeLineHeightForSerialization(
        value.lineHeight,
        fontSizePx
    );
    if (typeof normalizedLineHeight !== "undefined") {
        out.lineHeight = normalizedLineHeight;
    }

    return out;
}

function cloneDimensionIfFinite(
    num: number | undefined
): DimensionValue | undefined {
    if (!isFiniteNumber(num)) return undefined;
    return { value: num, unit: "pixel" };
}

const TEXT_CASE_MAP: { [key: string]: string } = {
    ORIGINAL: "none",
    UPPER: "uppercase",
    LOWER: "lowercase",
    TITLE: "capitalize",
    SMALL_CAPS: "smallCaps",
    SMALL_CAPS_FORCED: "smallCapsForced",
};

const TEXT_DECORATION_MAP: { [key: string]: string } = {
    NONE: "none",
    UNDERLINE: "underline",
    STRIKETHROUGH: "lineThrough",
};

const TEXT_ALIGN_HORIZONTAL_MAP: { [key: string]: string } = {
    LEFT: "left",
    RIGHT: "right",
    CENTER: "center",
    JUSTIFIED: "justify",
};

const TEXT_ALIGN_VERTICAL_MAP: { [key: string]: string } = {
    TOP: "top",
    CENTER: "center",
    BOTTOM: "bottom",
};

function inferFontStyle(style: string | undefined): string | undefined {
    if (!style) return undefined;
    const lower = style.trim().toLowerCase();
    if (lower.includes("italic") || lower.includes("oblique")) return "italic";
    return "normal";
}

// Read a Figma text style and produce the token value plus the Figma-specific extension metadata.
export function typographyValueFromTextStyle(
    style: TextStyle
): TypographyFromTextStyleResult {
    const value: TypographyValue = {};
    const figma: TypographyFigmaExtension = {};

    const assignFigma = <K extends keyof TypographyFigmaExtension>(
        key: K,
        val: TypographyFigmaExtension[K]
    ): void => {
        if (typeof val === "undefined") return;
        figma[key] = val;
    };

    const fontName = style.fontName as
        | { family?: string; style?: string }
        | undefined;
    if (fontName && typeof fontName.family === "string") {
        value.fontFamily = fontName.family;
    }
    if (fontName && typeof fontName.style === "string") {
        value.fontWeight = fontName.style;
        value.fontVariant = fontName.style;
        value.fontStyle = inferFontStyle(fontName.style);
        assignFigma("fontVariant", fontName.style);
        assignFigma("fontStyle", fontName.style);
    }

    if (isFiniteNumber(style.fontSize)) {
        value.fontSize = { value: style.fontSize, unit: "pixel" };
    }

    const lineHeight = style.lineHeight as
        | { unit?: string; value?: number }
        | undefined;
    if (lineHeight && typeof lineHeight.unit === "string") {
        const unit = lineHeight.unit;
        if (unit === "AUTO") {
            value.lineHeight = "auto";
            assignFigma("lineHeight", { unit: "AUTO" });
        } else if (unit === "PIXELS" && isFiniteNumber(lineHeight.value)) {
            value.lineHeight = { value: lineHeight.value, unit: "pixel" };
            assignFigma("lineHeight", {
                unit: "PIXELS",
                value: lineHeight.value,
            });
        } else if (unit === "PERCENT" && isFiniteNumber(lineHeight.value)) {
            value.lineHeight = { value: lineHeight.value, unit: "percent" };
            assignFigma("lineHeight", {
                unit: "PERCENT",
                value: lineHeight.value,
            });
        }
    }

    const letterSpacing = style.letterSpacing as
        | { unit?: string; value?: number }
        | undefined;
    if (
        letterSpacing &&
        typeof letterSpacing.unit === "string" &&
        isFiniteNumber(letterSpacing.value)
    ) {
        if (letterSpacing.unit === "PIXELS") {
            value.letterSpacing = { value: letterSpacing.value, unit: "pixel" };
            assignFigma("letterSpacing", {
                unit: "PIXELS",
                value: letterSpacing.value,
            });
        } else if (letterSpacing.unit === "PERCENT") {
            value.letterSpacing = {
                value: letterSpacing.value,
                unit: "percent",
            };
            assignFigma("letterSpacing", {
                unit: "PERCENT",
                value: letterSpacing.value,
            });
        }
    }

    const paragraphSpacing = cloneDimensionIfFinite(style.paragraphSpacing);
    if (paragraphSpacing) {
        value.paragraphSpacing = paragraphSpacing;
        assignFigma("paragraphSpacing", paragraphSpacing.value);
    }

    const paragraphIndent = cloneDimensionIfFinite(style.paragraphIndent);
    if (paragraphIndent) {
        value.paragraphIndent = paragraphIndent;
        assignFigma("paragraphIndent", paragraphIndent.value);
    }

    const textCase = (style as { textCase?: string }).textCase;
    if (textCase && typeof textCase === "string") {
        value.textCase = TEXT_CASE_MAP[textCase] || textCase.toLowerCase();
        assignFigma("textCase", textCase);
    }

    const textDecoration = (style as { textDecoration?: string })
        .textDecoration;
    if (textDecoration && typeof textDecoration === "string") {
        value.textDecoration =
            TEXT_DECORATION_MAP[textDecoration] || textDecoration.toLowerCase();
        assignFigma("textDecoration", textDecoration);
    }

    const textAlignHorizontal = (style as { textAlignHorizontal?: string })
        .textAlignHorizontal;
    if (textAlignHorizontal && typeof textAlignHorizontal === "string") {
        value.textAlignHorizontal =
            TEXT_ALIGN_HORIZONTAL_MAP[textAlignHorizontal] ||
            textAlignHorizontal.toLowerCase();
        assignFigma("textAlignHorizontal", textAlignHorizontal);
    }

    const textAlignVertical = (style as { textAlignVertical?: string })
        .textAlignVertical;
    if (textAlignVertical && typeof textAlignVertical === "string") {
        value.textAlignVertical =
            TEXT_ALIGN_VERTICAL_MAP[textAlignVertical] ||
            textAlignVertical.toLowerCase();
        assignFigma("textAlignVertical", textAlignVertical);
    }

    const leadingTrim = (style as { leadingTrim?: unknown }).leadingTrim;
    if (typeof leadingTrim !== "undefined")
        assignFigma("leadingTrim", leadingTrim);

    const listSpacing = (style as { listSpacing?: number }).listSpacing;
    if (isFiniteNumber(listSpacing)) assignFigma("listSpacing", listSpacing);

    const hangingPunctuation = (style as { hangingPunctuation?: boolean })
        .hangingPunctuation;
    if (typeof hangingPunctuation === "boolean")
        assignFigma("hangingPunctuation", hangingPunctuation);

    const hangingList = (style as { hangingList?: boolean }).hangingList;
    if (typeof hangingList === "boolean")
        assignFigma("hangingList", hangingList);

    const textAutoResize = (style as { textAutoResize?: string })
        .textAutoResize;
    if (typeof textAutoResize === "string")
        assignFigma("textAutoResize", textAutoResize);

    const fills = (style as { fills?: unknown }).fills;
    if (typeof fills !== "undefined") assignFigma("fills", fills);

    const strokes = (style as { strokes?: unknown }).strokes;
    if (typeof strokes !== "undefined") assignFigma("strokes", strokes);

    // Drop undefined entries to keep payload compact.
    const cleaned: TypographyValue = {};
    for (const key of Object.keys(value)) {
        const v = (value as Record<string, unknown>)[key];
        if (typeof v === "undefined") continue;
        cleaned[key] = v;
    }

    return { value: cleaned, figma };
}

function normalizeFontVariantName(style: string | undefined): string | null {
    if (typeof style !== "string") return null;
    const trimmed = style.trim();
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();
    if (lower === "italic") return "Italic";
    if (lower === "normal") return "Regular";
    if (lower === "oblique") return "Oblique";
    return trimmed;
}

export interface TypographyFontNameResult {
    fontName: FontName | null;
    usedFallback: boolean;
}

export function typographyFontNameFromValue(
    value: TypographyValue
): TypographyFontNameResult {
    const family =
        typeof value.fontFamily === "string" ? value.fontFamily.trim() : "";
    if (!family) {
        return { fontName: null, usedFallback: false };
    }

    const candidates: (string | null | undefined)[] = [
        value.fontVariant,
        value.fontWeight,
        normalizeFontVariantName(value.fontStyle),
    ];

    for (const cand of candidates) {
        if (typeof cand !== "string") continue;
        const trimmed = cand.trim();
        if (trimmed.length === 0) continue;
        return { fontName: { family, style: trimmed }, usedFallback: false };
    }

    return { fontName: { family, style: "Regular" }, usedFallback: true };
}

function normalizeKey(raw: string | undefined): string | null {
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    return trimmed.toLowerCase();
}

const TEXT_CASE_REVERSE_MAP: { [key: string]: TextCase } = {
    none: "ORIGINAL",
    original: "ORIGINAL",
    uppercase: "UPPER",
    upper: "UPPER",
    lowercase: "LOWER",
    lower: "LOWER",
    capitalize: "TITLE",
    title: "TITLE",
    smallcaps: "SMALL_CAPS",
    "small-caps": "SMALL_CAPS",
    smallcapsforced: "SMALL_CAPS_FORCED",
    "small-caps-forced": "SMALL_CAPS_FORCED",
};

const TEXT_DECORATION_REVERSE_MAP: { [key: string]: TextDecoration } = {
    none: "NONE",
    underline: "UNDERLINE",
    strikethrough: "STRIKETHROUGH",
    "strike-through": "STRIKETHROUGH",
    linethrough: "STRIKETHROUGH",
    "line-through": "STRIKETHROUGH",
};

type FigmaTextAlignHorizontal = "LEFT" | "CENTER" | "RIGHT" | "JUSTIFIED";
type FigmaTextAlignVertical = "TOP" | "CENTER" | "BOTTOM";

const TEXT_ALIGN_HORIZONTAL_REVERSE_MAP: {
    [key: string]: FigmaTextAlignHorizontal;
} = {
    left: "LEFT",
    right: "RIGHT",
    center: "CENTER",
    justify: "JUSTIFIED",
    justified: "JUSTIFIED",
};

const TEXT_ALIGN_VERTICAL_REVERSE_MAP: {
    [key: string]: FigmaTextAlignVertical;
} = {
    top: "TOP",
    center: "CENTER",
    middle: "CENTER",
    bottom: "BOTTOM",
};

function mapTextCaseToFigma(raw: string | undefined): TextCase | null {
    const key = normalizeKey(raw);
    if (!key) return null;
    return TEXT_CASE_REVERSE_MAP[key] || null;
}

function mapTextDecorationToFigma(
    raw: string | undefined
): TextDecoration | null {
    const key = normalizeKey(raw);
    if (!key) return null;
    return TEXT_DECORATION_REVERSE_MAP[key] || null;
}

function mapTextAlignHorizontalToFigma(
    raw: string | undefined
): FigmaTextAlignHorizontal | null {
    const key = normalizeKey(raw);
    if (!key) return null;
    return TEXT_ALIGN_HORIZONTAL_REVERSE_MAP[key] || null;
}

function mapTextAlignVerticalToFigma(
    raw: string | undefined
): FigmaTextAlignVertical | null {
    const key = normalizeKey(raw);
    if (!key) return null;
    return TEXT_ALIGN_VERTICAL_REVERSE_MAP[key] || null;
}

// Apply a typography token to a Figma text style, returning warnings when values require manual follow-up.
export function applyTypographyValueToTextStyle(
    style: TextStyle,
    value: TypographyValue,
    opts?: {
        fontName?: FontName | null;
        figma?: TypographyFigmaExtension | null;
    }
): string[] {
    const warnings: string[] = [];

    if (opts && opts.fontName) {
        style.fontName = opts.fontName;
    }

    const figmaExt = opts && opts.figma ? opts.figma : null;

    if (value.fontSize) {
        if (value.fontSize.unit === "pixel") {
            style.fontSize = value.fontSize.value;
        } else {
            warnings.push(
                `fontSize unit “${value.fontSize.unit}” is not supported. Expected "pixel".`
            );
        }
    }

    const extLineHeight = figmaExt?.lineHeight;
    style.lineHeight = { unit: "AUTO" };
    if (extLineHeight) {
        if (extLineHeight.unit === "AUTO") {
            style.lineHeight = { unit: "AUTO" };
        } else if (
            (extLineHeight.unit === "PIXELS" ||
                extLineHeight.unit === "PERCENT") &&
            isFiniteNumber(extLineHeight.value)
        ) {
            style.lineHeight = {
                unit: extLineHeight.unit,
                value: extLineHeight.value,
            } as {
                unit: "PIXELS" | "PERCENT";
                value: number;
            };
        }
    } else if (value.lineHeight) {
        if (value.lineHeight === "auto") {
            style.lineHeight = { unit: "AUTO" };
        } else if (value.lineHeight.unit === "pixel") {
            style.lineHeight = {
                unit: "PIXELS",
                value: value.lineHeight.value,
            };
        } else if (value.lineHeight.unit === "percent") {
            style.lineHeight = {
                unit: "PERCENT",
                value: value.lineHeight.value,
            };
        } else {
            warnings.push(
                `lineHeight unit “${
                    (value.lineHeight as DimensionValue).unit
                }” is not supported.`
            );
        }
    }

    const extLetterSpacing = figmaExt?.letterSpacing;
    style.letterSpacing = { unit: "PERCENT", value: 0 };
    if (extLetterSpacing) {
        if (
            (extLetterSpacing.unit === "PIXELS" ||
                extLetterSpacing.unit === "PERCENT") &&
            isFiniteNumber(extLetterSpacing.value)
        ) {
            style.letterSpacing = {
                unit: extLetterSpacing.unit,
                value: extLetterSpacing.value,
            };
        }
    } else if (value.letterSpacing) {
        if (value.letterSpacing.unit === "pixel") {
            style.letterSpacing = {
                unit: "PIXELS",
                value: value.letterSpacing.value,
            };
        } else if (value.letterSpacing.unit === "percent") {
            style.letterSpacing = {
                unit: "PERCENT",
                value: value.letterSpacing.value,
            };
        } else {
            warnings.push(
                `letterSpacing unit “${value.letterSpacing.unit}” is not supported.`
            );
        }
    }

    style.paragraphSpacing = 0;
    if (figmaExt && isFiniteNumber(figmaExt.paragraphSpacing)) {
        style.paragraphSpacing = figmaExt.paragraphSpacing;
    } else if (value.paragraphSpacing) {
        if (value.paragraphSpacing.unit === "pixel") {
            style.paragraphSpacing = value.paragraphSpacing.value;
        } else {
            warnings.push(
                `paragraphSpacing unit “${value.paragraphSpacing.unit}” is not supported. Expected "pixel".`
            );
        }
    }

    style.paragraphIndent = 0;
    if (figmaExt && isFiniteNumber(figmaExt.paragraphIndent)) {
        style.paragraphIndent = figmaExt.paragraphIndent;
    } else if (value.paragraphIndent) {
        if (value.paragraphIndent.unit === "pixel") {
            style.paragraphIndent = value.paragraphIndent.value;
        } else {
            warnings.push(
                `paragraphIndent unit “${value.paragraphIndent.unit}” is not supported. Expected "pixel".`
            );
        }
    }

    if (figmaExt && typeof figmaExt.textCase === "string") {
        try {
            style.textCase = figmaExt.textCase as TextCase;
        } catch {
            /* ignore */
        }
    } else {
        const textCase = mapTextCaseToFigma(value.textCase);
        if (textCase) {
            style.textCase = textCase;
        } else {
            if (value.textCase)
                warnings.push(
                    `textCase “${value.textCase}” is not recognized. Using default.`
                );
            style.textCase = "ORIGINAL";
        }
    }

    if (figmaExt && typeof figmaExt.textDecoration === "string") {
        try {
            style.textDecoration = figmaExt.textDecoration as TextDecoration;
        } catch {
            /* ignore */
        }
    } else {
        const textDecoration = mapTextDecorationToFigma(value.textDecoration);
        if (textDecoration) {
            style.textDecoration = textDecoration;
        } else {
            if (value.textDecoration)
                warnings.push(
                    `textDecoration “${value.textDecoration}” is not recognized. Using default.`
                );
            style.textDecoration = "NONE";
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anyStyle = style as any;
    const supportsTextAlignHorizontal =
        typeof anyStyle.textAlignHorizontal !== "undefined";
    const extTextAlignHorizontal =
        figmaExt && typeof figmaExt.textAlignHorizontal === "string"
            ? (figmaExt.textAlignHorizontal as FigmaTextAlignHorizontal)
            : null;
    if (extTextAlignHorizontal) {
        if (supportsTextAlignHorizontal) {
            try {
                anyStyle.textAlignHorizontal = extTextAlignHorizontal;
            } catch {
                /* ignore */
            }
        } else {
            warnings.push(
                "textAlignHorizontal is not supported for text styles in this version of Figma."
            );
        }
    } else {
        const textAlignHorizontal = mapTextAlignHorizontalToFigma(
            value.textAlignHorizontal
        );
        if (textAlignHorizontal) {
            if (supportsTextAlignHorizontal) {
                try {
                    anyStyle.textAlignHorizontal = textAlignHorizontal;
                } catch {
                    /* ignore */
                }
            } else {
                warnings.push(
                    "textAlignHorizontal is not supported for text styles in this version of Figma."
                );
            }
        } else if (value.textAlignHorizontal) {
            warnings.push(
                `textAlignHorizontal “${value.textAlignHorizontal}” is not recognized. Using default.`
            );
        } else if (supportsTextAlignHorizontal) {
            try {
                anyStyle.textAlignHorizontal = "LEFT";
            } catch {
                /* ignore */
            }
        }
    }

    const supportsTextAlignVertical =
        typeof anyStyle.textAlignVertical !== "undefined";
    const extTextAlignVertical =
        figmaExt && typeof figmaExt.textAlignVertical === "string"
            ? (figmaExt.textAlignVertical as FigmaTextAlignVertical)
            : null;
    if (extTextAlignVertical) {
        if (supportsTextAlignVertical) {
            try {
                anyStyle.textAlignVertical = extTextAlignVertical;
            } catch {
                /* ignore */
            }
        } else {
            warnings.push(
                "textAlignVertical is not supported for text styles in this version of Figma."
            );
        }
    } else {
        const textAlignVertical = mapTextAlignVerticalToFigma(
            value.textAlignVertical
        );
        if (textAlignVertical) {
            if (supportsTextAlignVertical) {
                try {
                    anyStyle.textAlignVertical = textAlignVertical;
                } catch {
                    /* ignore */
                }
            } else {
                warnings.push(
                    "textAlignVertical is not supported for text styles in this version of Figma."
                );
            }
        } else if (value.textAlignVertical) {
            warnings.push(
                `textAlignVertical “${value.textAlignVertical}” is not recognized. Using default.`
            );
        } else if (supportsTextAlignVertical) {
            try {
                anyStyle.textAlignVertical = "TOP";
            } catch {
                /* ignore */
            }
        }
    }

    if (figmaExt) {
        if (
            isFiniteNumber(figmaExt.listSpacing) &&
            typeof anyStyle.listSpacing !== "undefined"
        ) {
            try {
                anyStyle.listSpacing = figmaExt.listSpacing;
            } catch {
                /* ignore */
            }
        }
        if (
            typeof figmaExt.hangingPunctuation === "boolean" &&
            typeof anyStyle.hangingPunctuation !== "undefined"
        ) {
            try {
                anyStyle.hangingPunctuation = figmaExt.hangingPunctuation;
            } catch {
                /* ignore */
            }
        }
        if (
            typeof figmaExt.hangingList === "boolean" &&
            typeof anyStyle.hangingList !== "undefined"
        ) {
            try {
                anyStyle.hangingList = figmaExt.hangingList;
            } catch {
                /* ignore */
            }
        }
        if (
            typeof figmaExt.leadingTrim !== "undefined" &&
            typeof anyStyle.leadingTrim !== "undefined"
        ) {
            try {
                anyStyle.leadingTrim = figmaExt.leadingTrim;
            } catch {
                /* ignore */
            }
        }
        if (
            typeof figmaExt.textAutoResize === "string" &&
            typeof anyStyle.textAutoResize !== "undefined"
        ) {
            try {
                anyStyle.textAutoResize = figmaExt.textAutoResize;
            } catch {
                /* ignore */
            }
        }
        if (
            typeof figmaExt.fills !== "undefined" &&
            typeof anyStyle.fills !== "undefined"
        ) {
            try {
                anyStyle.fills = figmaExt.fills;
            } catch {
                /* ignore */
            }
        }
        if (
            typeof figmaExt.strokes !== "undefined" &&
            typeof anyStyle.strokes !== "undefined"
        ) {
            try {
                anyStyle.strokes = figmaExt.strokes;
            } catch {
                /* ignore */
            }
        }
    }

    return warnings;
}
