"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));

  // src/app/collections.ts
  async function snapshotCollectionsForUi() {
    if (typeof figma.editorType !== "string" || figma.editorType !== "figma") {
      return {
        collections: [],
        rawText: "Variables API is not available in this editor.\nOpen a Figma Design file (not FigJam) and try again.",
        checksum: "",
        textStylesCount: 0
      };
    }
    if (typeof figma.variables === "undefined" || typeof figma.variables.getLocalVariableCollectionsAsync !== "function" || typeof figma.variables.getVariableByIdAsync !== "function") {
      return {
        collections: [],
        rawText: "Variables API methods not found. Ensure your Figma version supports Variables and try again.",
        checksum: "",
        textStylesCount: 0
      };
    }
    const locals = await figma.variables.getLocalVariableCollectionsAsync();
    const allVars = await figma.variables.getLocalVariablesAsync();
    const varsById = /* @__PURE__ */ new Map();
    for (const v of allVars) {
      varsById.set(v.id, v);
    }
    const out = [];
    const rawLines = [];
    const checksumParts = [];
    for (let i = 0; i < locals.length; i++) {
      const c = locals[i];
      if (!c) continue;
      const modes = [];
      for (let mi = 0; mi < c.modes.length; mi++) {
        const m = c.modes[mi];
        modes.push({ id: m.modeId, name: m.name });
      }
      checksumParts.push(`C:${c.id}:${c.name}`);
      const modeSigs = c.modes.map((m) => `${m.modeId}:${m.name}`);
      checksumParts.push(`M:${modeSigs.join(",")}`);
      const varsList = [];
      const varLines = [];
      for (let vi = 0; vi < c.variableIds.length; vi++) {
        const varId = c.variableIds[vi];
        const v = varsById.get(varId);
        if (!v) continue;
        varsList.push({ id: v.id, name: v.name, type: v.resolvedType });
        const values = [];
        for (const m of c.modes) {
          const val = v.valuesByMode[m.modeId];
          values.push(JSON.stringify(val));
        }
        varLines.push(`    - ${v.name} [${v.resolvedType}]`);
        checksumParts.push(
          `V:${v.id}:${v.name}:${v.resolvedType}:${values.join(",")}`
        );
      }
      out.push({ id: c.id, name: c.name, modes, variables: varsList });
      rawLines.push("Collection: " + c.name + " (" + c.id + ")");
      const modeNames = modes.map((m) => m.name);
      rawLines.push(
        "  Modes: " + (modeNames.length > 0 ? modeNames.join(", ") : "(none)")
      );
      rawLines.push("  Variables (" + String(varsList.length) + "):");
      rawLines.push(...varLines);
      rawLines.push("");
    }
    if (out.length === 0) {
      rawLines.push("No local Variable Collections found.");
      rawLines.push("Create one in the Variables panel, then press Refresh.");
    }
    let textStylesCount = 0;
    let textStyles = null;
    if (typeof figma.getLocalTextStylesAsync === "function") {
      textStyles = await figma.getLocalTextStylesAsync();
    }
    if (textStyles) {
      textStylesCount = textStyles.length;
      rawLines.push("");
      rawLines.push("Text styles: " + String(textStyles.length));
      for (let si = 0; si < textStyles.length; si++) {
        const style = textStyles[si];
        rawLines.push("  - " + style.name);
      }
      if (textStyles.length === 0) {
        rawLines.push("  (No local text styles found.)");
      }
    }
    return {
      collections: out,
      rawText: rawLines.join("\n"),
      checksum: checksumParts.join("|"),
      textStylesCount
    };
  }
  function safeKeyFromCollectionAndMode(collectionName, modeName) {
    const base = collectionName + "/mode=" + modeName;
    let out = "";
    for (let i = 0; i < base.length; i++) {
      const ch = base.charAt(i);
      out += ch === "/" || ch === "\\" || ch === ":" ? "_" : ch;
    }
    return out;
  }
  async function analyzeSelectionState(collectionName, modeName) {
    try {
      const snap = await snapshotCollectionsForUi();
      const col = snap.collections.find((c) => c.name === collectionName);
      if (!col)
        return {
          ok: false,
          message: `Collection "${collectionName}" not found in this file.`
        };
      if (!col.variables || col.variables.length === 0) {
        return {
          ok: false,
          message: `Collection "${collectionName}" has no local variables.`
        };
      }
      const mode = col.modes.find((m) => m.name === modeName);
      if (!mode)
        return {
          ok: false,
          message: `Mode "${modeName}" not found in collection "${collectionName}".`
        };
      let withValues = 0;
      for (const v of col.variables) {
        const full = await figma.variables.getVariableByIdAsync(v.id);
        if (full && full.valuesByMode && mode.id in full.valuesByMode)
          withValues++;
      }
      return {
        ok: true,
        variableCount: col.variables.length,
        variablesWithValues: withValues
      };
    } catch (e) {
      return {
        ok: false,
        message: (e == null ? void 0 : e.message) || "Analysis failed"
      };
    }
  }

  // src/core/normalize.ts
  function slugSegment(s) {
    return String(s).trim().replace(/\s+/g, "-").replace(/-+/g, "-").toLowerCase();
  }
  function canonicalPath(collection, variableName) {
    const segs = String(variableName).split("/").map((s) => s.trim()).filter(Boolean);
    return [collection, ...segs];
  }
  function toDot(path) {
    let i = 0, s = "";
    for (i = 0; i < path.length; i++) {
      if (i > 0) s += ".";
      s += path[i];
    }
    return s;
  }
  function normalize(graph) {
    const seen = {};
    const copy = [];
    let i = 0;
    for (i = 0; i < graph.tokens.length; i++) {
      const t = graph.tokens[i];
      const key = slashPath(t.path);
      if (!seen[key]) {
        seen[key] = 1;
        copy.push(t);
      }
    }
    copy.sort(function(a, b) {
      const da = toDot(a.path);
      const db = toDot(b.path);
      if (da < db) return -1;
      if (da > db) return 1;
      return 0;
    });
    return { tokens: copy };
  }
  function slashPath(path) {
    let i = 0, s = "";
    for (i = 0; i < path.length; i++) {
      if (i > 0) s += "/";
      s += path[i];
    }
    return s;
  }

  // src/core/typography.ts
  var KNOWN_KEYS = {
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
    fontVariant: true
  };
  function isFiniteNumber(v) {
    return typeof v === "number" && isFinite(v);
  }
  function normalizeUnit(raw) {
    if (typeof raw !== "string") return null;
    const lower = raw.trim().toLowerCase();
    if (lower === "pixel" || lower === "pixels" || lower === "px")
      return "pixel";
    if (lower === "percent" || lower === "percentage" || lower === "%")
      return "percent";
    return null;
  }
  function parseDimension(raw) {
    if (!raw || typeof raw !== "object") return null;
    const obj = raw;
    const value = obj.value;
    const unit = normalizeUnit(obj.unit);
    if (!isFiniteNumber(value) || !unit) return null;
    return { value, unit };
  }
  function parsePixelDimension(raw) {
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      return parseDimension(raw);
    }
    if (isFiniteNumber(raw)) {
      return { value: raw, unit: "pixel" };
    }
    return null;
  }
  function parseTypographyValue(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const obj = raw;
    const value = {};
    let recognized = false;
    if (typeof obj.fontFamily === "string" && obj.fontFamily.trim().length > 0) {
      value.fontFamily = obj.fontFamily;
      recognized = true;
    }
    if (typeof obj.fontStyle === "string" && obj.fontStyle.trim().length > 0) {
      value.fontStyle = obj.fontStyle;
      recognized = true;
    }
    if (typeof obj.fontWeight === "string" && obj.fontWeight.trim().length > 0) {
      value.fontWeight = obj.fontWeight;
      recognized = true;
    }
    if (typeof obj.fontVariant === "string" && obj.fontVariant.trim().length > 0) {
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
    if (typeof obj.textDecoration === "string" && obj.textDecoration.trim().length > 0) {
      value.textDecoration = obj.textDecoration;
      recognized = true;
    }
    if (typeof obj.textAlignHorizontal === "string" && obj.textAlignHorizontal.trim().length > 0) {
      value.textAlignHorizontal = obj.textAlignHorizontal;
      recognized = true;
    }
    if (typeof obj.textAlignVertical === "string" && obj.textAlignVertical.trim().length > 0) {
      value.textAlignVertical = obj.textAlignVertical;
      recognized = true;
    }
    for (const key of Object.keys(obj)) {
      if (KNOWN_KEYS[key]) continue;
      const v = obj[key];
      if (typeof v === "undefined") continue;
      value[key] = v;
    }
    return recognized ? value : null;
  }
  function normalizeLetterSpacingForSerialization(letterSpacing, fontSizePx) {
    if (!letterSpacing) return void 0;
    if (letterSpacing.unit === "pixel") {
      return { value: letterSpacing.value, unit: "px" };
    }
    if (letterSpacing.unit === "percent" && typeof fontSizePx === "number") {
      return { value: letterSpacing.value / 100 * fontSizePx, unit: "px" };
    }
    return void 0;
  }
  function normalizeLineHeightForSerialization(lineHeight, fontSizePx) {
    if (!lineHeight) return void 0;
    if (lineHeight === "auto") return "auto";
    if (lineHeight.unit === "percent") {
      return lineHeight.value / 100;
    }
    if (lineHeight.unit === "pixel" && typeof fontSizePx === "number" && fontSizePx !== 0) {
      return lineHeight.value / fontSizePx;
    }
    return void 0;
  }
  function serializeTypographyValue(value) {
    const out = {};
    if (typeof value.fontFamily === "string") out.fontFamily = value.fontFamily;
    if (typeof value.fontWeight === "string") out.fontWeight = value.fontWeight;
    const fontSizePx = (() => {
      if (!value.fontSize) return void 0;
      if (value.fontSize.unit === "pixel") {
        const serialized = {
          value: value.fontSize.value,
          unit: "px"
        };
        out.fontSize = serialized;
        return value.fontSize.value;
      }
      return void 0;
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
  function cloneDimensionIfFinite(num) {
    if (!isFiniteNumber(num)) return void 0;
    return { value: num, unit: "pixel" };
  }
  var TEXT_CASE_MAP = {
    ORIGINAL: "none",
    UPPER: "uppercase",
    LOWER: "lowercase",
    TITLE: "capitalize",
    SMALL_CAPS: "smallCaps",
    SMALL_CAPS_FORCED: "smallCapsForced"
  };
  var TEXT_DECORATION_MAP = {
    NONE: "none",
    UNDERLINE: "underline",
    STRIKETHROUGH: "lineThrough"
  };
  var TEXT_ALIGN_HORIZONTAL_MAP = {
    LEFT: "left",
    RIGHT: "right",
    CENTER: "center",
    JUSTIFIED: "justify"
  };
  var TEXT_ALIGN_VERTICAL_MAP = {
    TOP: "top",
    CENTER: "center",
    BOTTOM: "bottom"
  };
  function inferFontStyle(style) {
    if (!style) return void 0;
    const lower = style.trim().toLowerCase();
    if (lower.includes("italic") || lower.includes("oblique")) return "italic";
    return "normal";
  }
  function typographyValueFromTextStyle(style) {
    const value = {};
    const figma2 = {};
    const assignFigma = (key, val) => {
      if (typeof val === "undefined") return;
      figma2[key] = val;
    };
    const fontName = style.fontName;
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
    const lineHeight = style.lineHeight;
    if (lineHeight && typeof lineHeight.unit === "string") {
      const unit = lineHeight.unit;
      if (unit === "AUTO") {
        value.lineHeight = "auto";
        assignFigma("lineHeight", { unit: "AUTO" });
      } else if (unit === "PIXELS" && isFiniteNumber(lineHeight.value)) {
        value.lineHeight = { value: lineHeight.value, unit: "pixel" };
        assignFigma("lineHeight", {
          unit: "PIXELS",
          value: lineHeight.value
        });
      } else if (unit === "PERCENT" && isFiniteNumber(lineHeight.value)) {
        value.lineHeight = { value: lineHeight.value, unit: "percent" };
        assignFigma("lineHeight", {
          unit: "PERCENT",
          value: lineHeight.value
        });
      }
    }
    const letterSpacing = style.letterSpacing;
    if (letterSpacing && typeof letterSpacing.unit === "string" && isFiniteNumber(letterSpacing.value)) {
      if (letterSpacing.unit === "PIXELS") {
        value.letterSpacing = { value: letterSpacing.value, unit: "pixel" };
        assignFigma("letterSpacing", {
          unit: "PIXELS",
          value: letterSpacing.value
        });
      } else if (letterSpacing.unit === "PERCENT") {
        value.letterSpacing = {
          value: letterSpacing.value,
          unit: "percent"
        };
        assignFigma("letterSpacing", {
          unit: "PERCENT",
          value: letterSpacing.value
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
    const textCase = style.textCase;
    if (textCase && typeof textCase === "string") {
      value.textCase = TEXT_CASE_MAP[textCase] || textCase.toLowerCase();
      assignFigma("textCase", textCase);
    }
    const textDecoration = style.textDecoration;
    if (textDecoration && typeof textDecoration === "string") {
      value.textDecoration = TEXT_DECORATION_MAP[textDecoration] || textDecoration.toLowerCase();
      assignFigma("textDecoration", textDecoration);
    }
    const textAlignHorizontal = style.textAlignHorizontal;
    if (textAlignHorizontal && typeof textAlignHorizontal === "string") {
      value.textAlignHorizontal = TEXT_ALIGN_HORIZONTAL_MAP[textAlignHorizontal] || textAlignHorizontal.toLowerCase();
      assignFigma("textAlignHorizontal", textAlignHorizontal);
    }
    const textAlignVertical = style.textAlignVertical;
    if (textAlignVertical && typeof textAlignVertical === "string") {
      value.textAlignVertical = TEXT_ALIGN_VERTICAL_MAP[textAlignVertical] || textAlignVertical.toLowerCase();
      assignFigma("textAlignVertical", textAlignVertical);
    }
    const leadingTrim = style.leadingTrim;
    if (typeof leadingTrim !== "undefined")
      assignFigma("leadingTrim", leadingTrim);
    const listSpacing = style.listSpacing;
    if (isFiniteNumber(listSpacing)) assignFigma("listSpacing", listSpacing);
    const hangingPunctuation = style.hangingPunctuation;
    if (typeof hangingPunctuation === "boolean")
      assignFigma("hangingPunctuation", hangingPunctuation);
    const hangingList = style.hangingList;
    if (typeof hangingList === "boolean")
      assignFigma("hangingList", hangingList);
    const textAutoResize = style.textAutoResize;
    if (typeof textAutoResize === "string")
      assignFigma("textAutoResize", textAutoResize);
    const fills = style.fills;
    if (typeof fills !== "undefined") assignFigma("fills", fills);
    const strokes = style.strokes;
    if (typeof strokes !== "undefined") assignFigma("strokes", strokes);
    const cleaned = {};
    for (const key of Object.keys(value)) {
      const v = value[key];
      if (typeof v === "undefined") continue;
      cleaned[key] = v;
    }
    return { value: cleaned, figma: figma2 };
  }
  function normalizeFontVariantName(style) {
    if (typeof style !== "string") return null;
    const trimmed = style.trim();
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();
    if (lower === "italic") return "Italic";
    if (lower === "normal") return "Regular";
    if (lower === "oblique") return "Oblique";
    return trimmed;
  }
  function typographyFontNameFromValue(value) {
    const family = typeof value.fontFamily === "string" ? value.fontFamily.trim() : "";
    if (!family) {
      return { fontName: null, usedFallback: false };
    }
    const candidates = [
      value.fontVariant,
      value.fontWeight,
      normalizeFontVariantName(value.fontStyle)
    ];
    for (const cand of candidates) {
      if (typeof cand !== "string") continue;
      const trimmed = cand.trim();
      if (trimmed.length === 0) continue;
      return { fontName: { family, style: trimmed }, usedFallback: false };
    }
    return { fontName: { family, style: "Regular" }, usedFallback: true };
  }
  function normalizeKey(raw) {
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;
    return trimmed.toLowerCase();
  }
  var TEXT_CASE_REVERSE_MAP = {
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
    "small-caps-forced": "SMALL_CAPS_FORCED"
  };
  var TEXT_DECORATION_REVERSE_MAP = {
    none: "NONE",
    underline: "UNDERLINE",
    strikethrough: "STRIKETHROUGH",
    "strike-through": "STRIKETHROUGH",
    linethrough: "STRIKETHROUGH",
    "line-through": "STRIKETHROUGH"
  };
  var TEXT_ALIGN_HORIZONTAL_REVERSE_MAP = {
    left: "LEFT",
    right: "RIGHT",
    center: "CENTER",
    justify: "JUSTIFIED",
    justified: "JUSTIFIED"
  };
  var TEXT_ALIGN_VERTICAL_REVERSE_MAP = {
    top: "TOP",
    center: "CENTER",
    middle: "CENTER",
    bottom: "BOTTOM"
  };
  function mapTextCaseToFigma(raw) {
    const key = normalizeKey(raw);
    if (!key) return null;
    return TEXT_CASE_REVERSE_MAP[key] || null;
  }
  function mapTextDecorationToFigma(raw) {
    const key = normalizeKey(raw);
    if (!key) return null;
    return TEXT_DECORATION_REVERSE_MAP[key] || null;
  }
  function mapTextAlignHorizontalToFigma(raw) {
    const key = normalizeKey(raw);
    if (!key) return null;
    return TEXT_ALIGN_HORIZONTAL_REVERSE_MAP[key] || null;
  }
  function mapTextAlignVerticalToFigma(raw) {
    const key = normalizeKey(raw);
    if (!key) return null;
    return TEXT_ALIGN_VERTICAL_REVERSE_MAP[key] || null;
  }
  function applyTypographyValueToTextStyle(style, value, opts) {
    const warnings = [];
    if (opts && opts.fontName) {
      style.fontName = opts.fontName;
    }
    const figmaExt = opts && opts.figma ? opts.figma : null;
    if (value.fontSize) {
      if (value.fontSize.unit === "pixel") {
        style.fontSize = value.fontSize.value;
      } else {
        warnings.push(
          `fontSize unit \u201C${value.fontSize.unit}\u201D is not supported. Expected "pixel".`
        );
      }
    }
    const extLineHeight = figmaExt == null ? void 0 : figmaExt.lineHeight;
    style.lineHeight = { unit: "AUTO" };
    if (extLineHeight) {
      if (extLineHeight.unit === "AUTO") {
        style.lineHeight = { unit: "AUTO" };
      } else if ((extLineHeight.unit === "PIXELS" || extLineHeight.unit === "PERCENT") && isFiniteNumber(extLineHeight.value)) {
        style.lineHeight = {
          unit: extLineHeight.unit,
          value: extLineHeight.value
        };
      }
    } else if (value.lineHeight) {
      if (value.lineHeight === "auto") {
        style.lineHeight = { unit: "AUTO" };
      } else if (value.lineHeight.unit === "pixel") {
        style.lineHeight = {
          unit: "PIXELS",
          value: value.lineHeight.value
        };
      } else if (value.lineHeight.unit === "percent") {
        style.lineHeight = {
          unit: "PERCENT",
          value: value.lineHeight.value
        };
      } else {
        warnings.push(
          `lineHeight unit \u201C${value.lineHeight.unit}\u201D is not supported.`
        );
      }
    }
    const extLetterSpacing = figmaExt == null ? void 0 : figmaExt.letterSpacing;
    style.letterSpacing = { unit: "PERCENT", value: 0 };
    if (extLetterSpacing) {
      if ((extLetterSpacing.unit === "PIXELS" || extLetterSpacing.unit === "PERCENT") && isFiniteNumber(extLetterSpacing.value)) {
        style.letterSpacing = {
          unit: extLetterSpacing.unit,
          value: extLetterSpacing.value
        };
      }
    } else if (value.letterSpacing) {
      if (value.letterSpacing.unit === "pixel") {
        style.letterSpacing = {
          unit: "PIXELS",
          value: value.letterSpacing.value
        };
      } else if (value.letterSpacing.unit === "percent") {
        style.letterSpacing = {
          unit: "PERCENT",
          value: value.letterSpacing.value
        };
      } else {
        warnings.push(
          `letterSpacing unit \u201C${value.letterSpacing.unit}\u201D is not supported.`
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
          `paragraphSpacing unit \u201C${value.paragraphSpacing.unit}\u201D is not supported. Expected "pixel".`
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
          `paragraphIndent unit \u201C${value.paragraphIndent.unit}\u201D is not supported. Expected "pixel".`
        );
      }
    }
    if (figmaExt && typeof figmaExt.textCase === "string") {
      try {
        style.textCase = figmaExt.textCase;
      } catch (e) {
      }
    } else {
      const textCase = mapTextCaseToFigma(value.textCase);
      if (textCase) {
        style.textCase = textCase;
      } else {
        if (value.textCase)
          warnings.push(
            `textCase \u201C${value.textCase}\u201D is not recognized. Using default.`
          );
        style.textCase = "ORIGINAL";
      }
    }
    if (figmaExt && typeof figmaExt.textDecoration === "string") {
      try {
        style.textDecoration = figmaExt.textDecoration;
      } catch (e) {
      }
    } else {
      const textDecoration = mapTextDecorationToFigma(value.textDecoration);
      if (textDecoration) {
        style.textDecoration = textDecoration;
      } else {
        if (value.textDecoration)
          warnings.push(
            `textDecoration \u201C${value.textDecoration}\u201D is not recognized. Using default.`
          );
        style.textDecoration = "NONE";
      }
    }
    const anyStyle = style;
    const supportsTextAlignHorizontal = typeof anyStyle.textAlignHorizontal !== "undefined";
    const extTextAlignHorizontal = figmaExt && typeof figmaExt.textAlignHorizontal === "string" ? figmaExt.textAlignHorizontal : null;
    if (extTextAlignHorizontal) {
      if (supportsTextAlignHorizontal) {
        try {
          anyStyle.textAlignHorizontal = extTextAlignHorizontal;
        } catch (e) {
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
          } catch (e) {
          }
        } else {
          warnings.push(
            "textAlignHorizontal is not supported for text styles in this version of Figma."
          );
        }
      } else if (value.textAlignHorizontal) {
        warnings.push(
          `textAlignHorizontal \u201C${value.textAlignHorizontal}\u201D is not recognized. Using default.`
        );
      } else if (supportsTextAlignHorizontal) {
        try {
          anyStyle.textAlignHorizontal = "LEFT";
        } catch (e) {
        }
      }
    }
    const supportsTextAlignVertical = typeof anyStyle.textAlignVertical !== "undefined";
    const extTextAlignVertical = figmaExt && typeof figmaExt.textAlignVertical === "string" ? figmaExt.textAlignVertical : null;
    if (extTextAlignVertical) {
      if (supportsTextAlignVertical) {
        try {
          anyStyle.textAlignVertical = extTextAlignVertical;
        } catch (e) {
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
          } catch (e) {
          }
        } else {
          warnings.push(
            "textAlignVertical is not supported for text styles in this version of Figma."
          );
        }
      } else if (value.textAlignVertical) {
        warnings.push(
          `textAlignVertical \u201C${value.textAlignVertical}\u201D is not recognized. Using default.`
        );
      } else if (supportsTextAlignVertical) {
        try {
          anyStyle.textAlignVertical = "TOP";
        } catch (e) {
        }
      }
    }
    if (figmaExt) {
      if (isFiniteNumber(figmaExt.listSpacing) && typeof anyStyle.listSpacing !== "undefined") {
        try {
          anyStyle.listSpacing = figmaExt.listSpacing;
        } catch (e) {
        }
      }
      if (typeof figmaExt.hangingPunctuation === "boolean" && typeof anyStyle.hangingPunctuation !== "undefined") {
        try {
          anyStyle.hangingPunctuation = figmaExt.hangingPunctuation;
        } catch (e) {
        }
      }
      if (typeof figmaExt.hangingList === "boolean" && typeof anyStyle.hangingList !== "undefined") {
        try {
          anyStyle.hangingList = figmaExt.hangingList;
        } catch (e) {
        }
      }
      if (typeof figmaExt.leadingTrim !== "undefined" && typeof anyStyle.leadingTrim !== "undefined") {
        try {
          anyStyle.leadingTrim = figmaExt.leadingTrim;
        } catch (e) {
        }
      }
      if (typeof figmaExt.textAutoResize === "string" && typeof anyStyle.textAutoResize !== "undefined") {
        try {
          anyStyle.textAutoResize = figmaExt.textAutoResize;
        } catch (e) {
        }
      }
      if (typeof figmaExt.fills !== "undefined" && typeof anyStyle.fills !== "undefined") {
        try {
          anyStyle.fills = figmaExt.fills;
        } catch (e) {
        }
      }
      if (typeof figmaExt.strokes !== "undefined" && typeof anyStyle.strokes !== "undefined") {
        try {
          anyStyle.strokes = figmaExt.strokes;
        } catch (e) {
        }
      }
    }
    return warnings;
  }

  // src/core/color.ts
  function normalizeDocumentProfile(profile) {
    const upper = String(profile).toUpperCase();
    return upper.includes("DISPLAY_P3") ? "DISPLAY_P3" : "SRGB";
  }
  var SUPPORTED_DTCG_COLOR_SPACES = /* @__PURE__ */ new Set(["srgb", "display-p3"]);
  function isDtcgColorShapeValid(input) {
    if (!input || typeof input !== "object") {
      return { ok: false, reason: "not an object" };
    }
    const cs = String(input.colorSpace || "").toLowerCase();
    if (!SUPPORTED_DTCG_COLOR_SPACES.has(cs)) {
      return {
        ok: false,
        reason: `unsupported colorSpace (\u201C${input.colorSpace}\u201D)`
      };
    }
    if (!Array.isArray(input.components) || input.components.length !== 3) {
      return { ok: false, reason: "components must be an array of length 3" };
    }
    for (let i = 0; i < 3; i++) {
      const v = input.components[i];
      if (typeof v !== "number" || !Number.isFinite(v)) {
        return {
          ok: false,
          reason: `component ${i} is not a finite number`
        };
      }
      if (v < 0 || v > 1) {
        return { ok: false, reason: `component ${i} out of range (${v})` };
      }
    }
    if (typeof input.alpha !== "undefined") {
      if (typeof input.alpha !== "number" || !Number.isFinite(input.alpha)) {
        return { ok: false, reason: "alpha is not a finite number" };
      }
      if (input.alpha < 0 || input.alpha > 1) {
        return { ok: false, reason: `alpha out of range (${input.alpha})` };
      }
    }
    return { ok: true };
  }
  function isColorSpaceRepresentableInDocument(colorSpace, profile) {
    const cs = String(colorSpace).toLowerCase();
    const normalized = normalizeDocumentProfile(profile);
    if (normalized === "DISPLAY_P3")
      return cs === "srgb" || cs === "display-p3";
    return cs === "srgb";
  }
  function clamp01(x) {
    if (x < 0) return 0;
    if (x > 1) return 1;
    return x;
  }
  function clamp01Array(v) {
    const out = [];
    let i = 0;
    for (i = 0; i < v.length; i++) out.push(clamp01(v[i]));
    return out;
  }
  function srgbEncode(linear) {
    if (linear <= 31308e-7) return 12.92 * linear;
    return 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
  }
  function srgbDecode(encoded) {
    if (encoded <= 0.04045) return encoded / 12.92;
    return Math.pow((encoded + 0.055) / 1.055, 2.4);
  }
  var p3Encode = srgbEncode;
  var p3Decode = srgbDecode;
  function mul3(m, v) {
    return [
      m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
      m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
      m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2]
    ];
  }
  var M_SRGB_TO_XYZ = [
    [0.4124564, 0.3575761, 0.1804375],
    [0.2126729, 0.7151522, 0.072175],
    [0.0193339, 0.119192, 0.9503041]
  ];
  var M_XYZ_TO_SRGB = [
    [3.2404542, -1.5371385, -0.4985314],
    [-0.969266, 1.8760108, 0.041556],
    [0.0556434, -0.2040259, 1.0572252]
  ];
  var M_P3_TO_XYZ = [
    [0.4865709486482162, 0.26566769316909306, 0.1982172852343625],
    [0.2289745640697488, 0.6917385218365064, 0.079286914093745],
    [0, 0.04511338185890264, 1.043944368900976]
  ];
  var M_XYZ_TO_P3 = [
    [2.493496911941425, -0.9313836179191239, -0.40271078445071684],
    [-0.8294889695615747, 1.7626640603183463, 0.02362468584194358],
    [0.03584583024378447, -0.07617238926804182, 0.9568845240076872]
  ];
  function encode(space, linearRGB) {
    if (space === "display-p3")
      return [
        p3Encode(linearRGB[0]),
        p3Encode(linearRGB[1]),
        p3Encode(linearRGB[2])
      ];
    return [
      srgbEncode(linearRGB[0]),
      srgbEncode(linearRGB[1]),
      srgbEncode(linearRGB[2])
    ];
  }
  function decode(space, encodedRGB) {
    if (space === "display-p3")
      return [
        p3Decode(encodedRGB[0]),
        p3Decode(encodedRGB[1]),
        p3Decode(encodedRGB[2])
      ];
    return [
      srgbDecode(encodedRGB[0]),
      srgbDecode(encodedRGB[1]),
      srgbDecode(encodedRGB[2])
    ];
  }
  function convertRgbSpace(rgb, src, dst) {
    if (src === dst) return clamp01Array(rgb);
    const lin = decode(src, clamp01Array(rgb));
    const xyz = src === "srgb" ? mul3(M_SRGB_TO_XYZ, lin) : mul3(M_P3_TO_XYZ, lin);
    const linDst = dst === "srgb" ? mul3(M_XYZ_TO_SRGB, xyz) : mul3(M_XYZ_TO_P3, xyz);
    const enc = encode(dst, linDst);
    return clamp01Array(enc);
  }
  function srgbToHex6(rgb) {
    const r = Math.round(clamp01(rgb[0]) * 255);
    const g = Math.round(clamp01(rgb[1]) * 255);
    const b = Math.round(clamp01(rgb[2]) * 255);
    function to2(n) {
      const s = n.toString(16);
      return s.length === 1 ? "0" + s : s;
    }
    return "#" + to2(r) + to2(g) + to2(b);
  }
  function srgbToHex8(rgba) {
    const r = Math.round(clamp01(rgba.r) * 255);
    const g = Math.round(clamp01(rgba.g) * 255);
    const b = Math.round(clamp01(rgba.b) * 255);
    const a = Math.round(clamp01(rgba.a) * 255);
    function to2(n) {
      const s = n.toString(16);
      return s.length === 1 ? "0" + s : s;
    }
    return "#" + to2(r) + to2(g) + to2(b) + to2(a);
  }
  function isHexCharCode(code) {
    if (code >= 48 && code <= 57) return true;
    if (code >= 65 && code <= 70) return true;
    if (code >= 97 && code <= 102) return true;
    return false;
  }
  function hexPairToByte(h1, h2) {
    function val(c) {
      if (c >= 48 && c <= 57) return c - 48;
      if (c >= 65 && c <= 70) return c - 55;
      if (c >= 97 && c <= 102) return c - 87;
      return 0;
    }
    return val(h1) << 4 | val(h2);
  }
  function parseHexToSrgbRGBA(hex) {
    let s = hex;
    if (s.length > 0 && s.charAt(0) === "#") s = s.substring(1);
    let i = 0;
    for (i = 0; i < s.length; i++) {
      if (!isHexCharCode(s.charCodeAt(i)))
        throw new Error("Invalid hex color: " + hex);
    }
    let r = 0, g = 0, b = 0, a = 255;
    if (s.length === 3 || s.length === 4) {
      const rNib = s.charCodeAt(0);
      const gNib = s.charCodeAt(1);
      const bNib = s.charCodeAt(2);
      const aNib = s.length === 4 ? s.charCodeAt(3) : 102;
      r = hexPairToByte(rNib, rNib);
      g = hexPairToByte(gNib, gNib);
      b = hexPairToByte(bNib, bNib);
      a = hexPairToByte(aNib, aNib);
    } else if (s.length === 6 || s.length === 8) {
      r = hexPairToByte(s.charCodeAt(0), s.charCodeAt(1));
      g = hexPairToByte(s.charCodeAt(2), s.charCodeAt(3));
      b = hexPairToByte(s.charCodeAt(4), s.charCodeAt(5));
      if (s.length === 8) a = hexPairToByte(s.charCodeAt(6), s.charCodeAt(7));
    } else {
      throw new Error("Invalid hex length: " + hex);
    }
    return {
      r: clamp01(r / 255),
      g: clamp01(g / 255),
      b: clamp01(b / 255),
      a: clamp01(a / 255)
    };
  }
  function docProfileToSpaceKey(profile) {
    return normalizeDocumentProfile(profile) === "DISPLAY_P3" ? "display-p3" : "srgb";
  }
  function dtcgToFigmaRGBA(value, docProfile) {
    const alpha = typeof value.alpha === "number" ? value.alpha : 1;
    const dst = docProfileToSpaceKey(docProfile);
    const comps = value.components;
    if (comps && comps.length >= 3) {
      const space = value.colorSpace;
      if (space === "srgb" || space === "display-p3") {
        const converted = convertRgbSpace(
          [comps[0], comps[1], comps[2]],
          space,
          dst
        );
        return {
          r: converted[0],
          g: converted[1],
          b: converted[2],
          a: clamp01(alpha)
        };
      }
      throw new Error(
        "Unsupported colorSpace: " + space + ". Supported: srgb, display-p3."
      );
    }
    if (value.hex && typeof value.hex === "string") {
      const fromHex = parseHexToSrgbRGBA(value.hex);
      const a = typeof value.alpha === "number" ? clamp01(value.alpha) : fromHex.a;
      if (dst === "srgb")
        return { r: fromHex.r, g: fromHex.g, b: fromHex.b, a };
      const toDst = convertRgbSpace(
        [fromHex.r, fromHex.g, fromHex.b],
        "srgb",
        dst
      );
      return { r: toDst[0], g: toDst[1], b: toDst[2], a };
    }
    throw new Error("Color has neither components nor hex.");
  }
  function figmaRGBAToDtcg(rgba, docProfile) {
    const src = docProfileToSpaceKey(docProfile);
    const rgb = [clamp01(rgba.r), clamp01(rgba.g), clamp01(rgba.b)];
    const a = clamp01(rgba.a);
    const colorSpace = src;
    const components = [rgb[0], rgb[1], rgb[2]];
    const srgbRgb = src === "srgb" ? rgb : convertRgbSpace(rgb, "display-p3", "srgb");
    const hex = srgbToHex6(srgbRgb);
    return {
      colorSpace,
      components,
      alpha: a,
      hex
    };
  }
  function toHex6FromSrgb(rgb) {
    return srgbToHex6([clamp01(rgb.r), clamp01(rgb.g), clamp01(rgb.b)]);
  }
  function colorValueToHexString(value) {
    const comps = Array.isArray(value.components) ? value.components : [0, 0, 0];
    const srgb = value.colorSpace === "display-p3" ? convertRgbSpace(comps, "display-p3", "srgb") : clamp01Array(comps);
    const baseHex = typeof value.hex === "string" && value.hex.length > 0 ? value.hex.charAt(0) === "#" ? value.hex : "#" + value.hex : srgbToHex6(srgb);
    if (typeof value.alpha === "number") {
      const alpha = clamp01(value.alpha);
      if (alpha < 1) {
        return srgbToHex8({ r: srgb[0], g: srgb[1], b: srgb[2], a: alpha });
      }
    }
    return baseHex;
  }
  function hexToDtcgColor(hex) {
    const rgba = parseHexToSrgbRGBA(hex);
    const comps = [rgba.r, rgba.g, rgba.b];
    return {
      colorSpace: "srgb",
      components: comps,
      alpha: rgba.a,
      hex: toHex6FromSrgb({ r: rgba.r, g: rgba.g, b: rgba.b })
    };
  }
  function isValidDtcgColorValueObject(v) {
    if (!v || typeof v !== "object") return false;
    const o = v;
    if (!Array.isArray(o.components) || o.components.length < 3) return false;
    if (typeof o.components[0] !== "number" || typeof o.components[1] !== "number" || typeof o.components[2] !== "number")
      return false;
    return true;
  }
  function normalizeDtcgColorValue(input) {
    function clamp012(x) {
      if (!Number.isFinite(x)) return 0;
      if (x < 0) return 0;
      if (x > 1) return 1;
      return x;
    }
    const comps = [
      clamp012(Number(input.components[0])),
      clamp012(Number(input.components[1])),
      clamp012(Number(input.components[2]))
    ];
    const alpha = typeof input.alpha === "number" ? clamp012(input.alpha) : void 0;
    const cs = input.colorSpace === "display-p3" ? "display-p3" : "srgb";
    return __spreadValues(__spreadValues({
      colorSpace: cs,
      components: comps
    }, alpha !== void 0 ? { alpha } : {}), typeof input.hex === "string" ? { hex: input.hex } : {});
  }

  // src/adapters/dtcg-reader.ts
  function postInfoToUi(msg) {
    var _a;
    try {
      if (typeof figma !== "undefined" && ((_a = figma.ui) == null ? void 0 : _a.postMessage)) {
        figma.ui.postMessage({ type: "INFO", payload: { message: msg } });
        return true;
      }
    } catch (e) {
    }
    return false;
  }
  function logInfo(msg) {
    var _a, _b;
    if (postInfoToUi(msg)) return;
    try {
      (_b = (_a = globalThis.console) == null ? void 0 : _a.log) == null ? void 0 : _b.call(_a, msg);
    } catch (e) {
    }
  }
  function logWarn(msg) {
    var _a, _b, _c, _d;
    const payload = "Warning: " + msg;
    if (postInfoToUi(payload)) return;
    try {
      (_b = (_a = globalThis.console) == null ? void 0 : _a.warn) == null ? void 0 : _b.call(_a, payload);
    } catch (e) {
      try {
        (_d = (_c = globalThis.console) == null ? void 0 : _c.log) == null ? void 0 : _d.call(_c, payload);
      } catch (e2) {
      }
    }
  }
  function hasKey(o, k) {
    return !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);
  }
  function isAliasString(v) {
    return typeof v === "string" && v.startsWith("{") && v.endsWith("}") && v.length > 2;
  }
  function parseAliasToSegments(v) {
    return v.slice(1, -1).split(".").map((s) => s.trim());
  }
  function isLikelyHexString(v) {
    return typeof v === "string" && /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v.trim());
  }
  function readDescription(obj) {
    if (!obj || typeof obj !== "object") return void 0;
    const d = obj["$description"];
    if (typeof d === "string") {
      const s = d.trim();
      if (s.length > 0) return s;
    }
    return void 0;
  }
  function readColorValueFlexible(raw, allowHexStrings) {
    if (typeof raw === "string") {
      if (!allowHexStrings) return null;
      if (!isLikelyHexString(raw)) return null;
      try {
        return { value: hexToDtcgColor(raw), coercedFromHex: true };
      } catch (e) {
        return null;
      }
    }
    if (raw && typeof raw === "object") {
      const obj = raw;
      const candidate = __spreadValues(__spreadValues(__spreadValues(__spreadValues({}, typeof obj.colorSpace === "string" ? { colorSpace: obj.colorSpace } : {}), Array.isArray(obj.components) ? { components: obj.components.slice(0, 3) } : {}), "alpha" in obj ? { alpha: obj.alpha } : {}), typeof obj.hex === "string" ? { hex: obj.hex } : {});
      const shape = isDtcgColorShapeValid(candidate);
      if (!shape.ok) return null;
      return { value: candidate, coercedFromHex: false };
    }
    return null;
  }
  function computePathAndCtx(path, obj) {
    var _a;
    const irPath = path.slice();
    let mode = "Mode 1";
    const ext = hasKey(obj, "$extensions") ? obj["$extensions"] : void 0;
    const cf = ext && typeof ext === "object" ? ext["com.figma"] : void 0;
    if (cf && typeof cf === "object" && typeof cf.modeName === "string") {
      mode = cf.modeName;
    }
    const collection = (_a = irPath[0]) != null ? _a : "Tokens";
    return { irPath, ctx: `${collection}/${mode}` };
  }
  function readDtcgToIR(root, opts = {}) {
    const allowHexStrings = !!opts.allowHexStrings;
    const tokens = [];
    const tokensByPath = /* @__PURE__ */ new Map();
    const aliasTokens = [];
    function registerToken(token) {
      tokens.push(token);
      tokensByPath.set(token.path.join("/"), token);
    }
    function visit(obj, path, inheritedType) {
      if (!obj || typeof obj !== "object") return;
      let groupType = inheritedType;
      if (hasKey(obj, "$type") && typeof obj.$type === "string") {
        const t = String(obj.$type);
        if (t === "color" || t === "number" || t === "string" || t === "boolean" || t === "typography") {
          groupType = t;
        }
      }
      if (hasKey(obj, "$value")) {
        const rawVal = obj.$value;
        const desc = readDescription(obj);
        if (isAliasString(rawVal)) {
          const segs = parseAliasToSegments(rawVal);
          const { irPath: irPath2, ctx: ctx2 } = computePathAndCtx(path, obj);
          const byCtx2 = {};
          byCtx2[ctx2] = { kind: "alias", path: segs };
          const token = __spreadValues(__spreadValues({
            path: irPath2,
            type: groupType != null ? groupType : "string",
            byContext: byCtx2
          }, desc ? { description: desc } : {}), hasKey(obj, "$extensions") ? {
            extensions: obj["$extensions"]
          } : {});
          registerToken(token);
          aliasTokens.push({ token, declaredType: groupType != null ? groupType : null });
          return;
        }
        if (groupType === "color") {
          const { irPath: irPath2, ctx: ctx2 } = computePathAndCtx(path, obj);
          const parsed = readColorValueFlexible(rawVal, allowHexStrings);
          if (!parsed) {
            if (typeof rawVal === "string") {
              if (allowHexStrings) {
                logWarn(
                  `Skipped invalid color for \u201C${irPath2.join(
                    "/"
                  )}\u201D \u2014 expected hex string or a valid DTCG color object (srgb/display-p3, 3 numeric components, alpha in [0..1]).`
                );
              } else {
                logWarn(
                  `Skipped invalid color for \u201C${irPath2.join(
                    "/"
                  )}\u201D \u2014 expected a DTCG color object (srgb/display-p3, 3 numeric components, optional numeric alpha in [0..1]); strings like "#RRGGBB" are not accepted.`
                );
              }
            } else {
              logWarn(
                `Skipped invalid color for \u201C${irPath2.join(
                  "/"
                )}\u201D \u2014 expected a valid DTCG color object (srgb/display-p3, 3 numeric components, alpha in [0..1]).`
              );
            }
            return;
          }
          if (parsed.coercedFromHex) {
            logInfo(
              `Coerced string hex to DTCG color object for \u201C${irPath2.join(
                "/"
              )}\u201D.`
            );
          }
          const byCtx2 = {};
          byCtx2[ctx2] = { kind: "color", value: parsed.value };
          registerToken(__spreadValues(__spreadValues({
            path: irPath2,
            type: "color",
            byContext: byCtx2
          }, desc ? { description: desc } : {}), hasKey(obj, "$extensions") ? {
            extensions: obj["$extensions"]
          } : {}));
          return;
        }
        const declaredType = groupType;
        if (!declaredType) {
          logWarn(
            `Skipped token \u201C${path.join(
              "/"
            )}\u201D \u2014 no $type found in token or parent groups.`
          );
          return;
        }
        let effectiveType = declaredType;
        let valObj = null;
        if (declaredType === "number" && typeof rawVal === "number") {
          valObj = { kind: "number", value: rawVal };
        } else if (declaredType === "boolean" && typeof rawVal === "boolean") {
          valObj = { kind: "boolean", value: rawVal };
        } else if (declaredType === "string" && typeof rawVal === "string") {
          valObj = { kind: "string", value: rawVal };
        }
        if (!valObj && declaredType === "string" && typeof rawVal === "string") {
          const ext = hasKey(obj, "$extensions") ? obj["$extensions"] : void 0;
          const com = ext && typeof ext === "object" ? ext["com.figma"] : void 0;
          const varType = com && typeof com === "object" ? com["variableType"] : void 0;
          if (varType === "BOOLEAN") {
            const raw = rawVal.trim().toLowerCase();
            if (raw === "true" || raw === "false") {
              valObj = { kind: "boolean", value: raw === "true" };
              logInfo(
                `Note: coerced string \u201C${rawVal}\u201D to boolean due to $extensions.com.figma.variableType=BOOLEAN at \u201C${path.join(
                  "/"
                )}\u201D.`
              );
              effectiveType = "boolean";
            }
          }
        }
        if (!valObj && declaredType === "typography") {
          const parsedTypography = parseTypographyValue(rawVal);
          if (!parsedTypography) {
            logWarn(
              `Skipped token \u201C${path.join(
                "/"
              )}\u201D \u2014 expected a valid typography object.`
            );
            return;
          }
          const { irPath: irPath2, ctx: ctx2 } = computePathAndCtx(path, obj);
          const byCtx2 = {};
          byCtx2[ctx2] = { kind: "typography", value: parsedTypography };
          registerToken(__spreadValues(__spreadValues({
            path: irPath2,
            type: "typography",
            byContext: byCtx2
          }, desc ? { description: desc } : {}), hasKey(obj, "$extensions") ? {
            extensions: obj["$extensions"]
          } : {}));
          return;
        }
        if (!valObj) {
          const observed = typeof rawVal;
          logWarn(
            `Skipped token \u201C${path.join(
              "/"
            )}\u201D \u2014 declared $type ${declaredType} but found ${observed}.`
          );
          return;
        }
        const { irPath, ctx } = computePathAndCtx(path, obj);
        const byCtx = {};
        byCtx[ctx] = valObj;
        registerToken(__spreadValues(__spreadValues({
          path: irPath,
          type: effectiveType,
          byContext: byCtx
        }, desc ? { description: desc } : {}), hasKey(obj, "$extensions") ? {
          extensions: obj["$extensions"]
        } : {}));
        return;
      }
      for (const k in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
        if (k.startsWith("$")) continue;
        const child = obj[k];
        const newPath = path.concat([k]);
        visit(child, newPath, groupType);
      }
    }
    visit(root, [], null);
    const aliasTokenSet = new Set(aliasTokens.map((a) => a.token));
    const resolvedTypeCache = /* @__PURE__ */ new Map();
    const invalidTokens = /* @__PURE__ */ new Set();
    function resolveTypeForPath(pathSegs, stack) {
      const key = pathSegs.join("/");
      if (resolvedTypeCache.has(key)) return resolvedTypeCache.get(key);
      if (stack.has(key)) {
        resolvedTypeCache.set(key, null);
        return null;
      }
      const target = tokensByPath.get(key);
      if (!target) {
        resolvedTypeCache.set(key, null);
        return null;
      }
      if (!aliasTokenSet.has(target)) {
        resolvedTypeCache.set(key, target.type);
        return target.type;
      }
      stack.add(key);
      let detected = null;
      const ctxValues = Object.values(target.byContext);
      for (const ctxVal of ctxValues) {
        if (!ctxVal || ctxVal.kind !== "alias") {
          detected = null;
          break;
        }
        const nested = resolveTypeForPath(ctxVal.path, stack);
        if (!nested) {
          detected = null;
          break;
        }
        if (!detected) detected = nested;
        else if (detected !== nested) {
          detected = null;
          break;
        }
      }
      stack.delete(key);
      resolvedTypeCache.set(key, detected);
      return detected;
    }
    for (const { token, declaredType } of aliasTokens) {
      const tokenKey = token.path.join("/");
      let resolvedType = null;
      let unresolved = false;
      for (const ctxVal of Object.values(token.byContext)) {
        if (!ctxVal || ctxVal.kind !== "alias") {
          unresolved = true;
          break;
        }
        const stack = /* @__PURE__ */ new Set([tokenKey]);
        const nestedType = resolveTypeForPath(ctxVal.path, stack);
        if (!nestedType) {
          unresolved = true;
          break;
        }
        if (!resolvedType) resolvedType = nestedType;
        else if (resolvedType !== nestedType) {
          unresolved = true;
          break;
        }
      }
      if (!resolvedType || unresolved) {
        if (declaredType) {
          resolvedType = declaredType;
        } else {
          logWarn(
            `Skipped token \u201C${token.path.join(
              "/"
            )}\u201D \u2014 could not resolve alias type and no $type declared.`
          );
          invalidTokens.add(token);
          continue;
        }
      }
      if (declaredType && declaredType !== resolvedType) {
        logWarn(
          `Token \u201C${token.path.join(
            "/"
          )}\u201D declared $type ${declaredType} but resolves to ${resolvedType}; using resolved type.`
        );
      }
      token.type = resolvedType;
      tokensByPath.set(tokenKey, token);
    }
    const finalTokens = tokens.filter((t) => !invalidTokens.has(t));
    return { tokens: finalTokens };
  }

  // src/adapters/dtcg-writer.ts
  function dotRaw(segs) {
    return segs.join(".");
  }
  function slugForMatch(s) {
    return s.trim().replace(/\s+/g, "-").replace(/-+/g, "-").toLowerCase();
  }
  function getFigmaDisplayNames(t, ctx) {
    var _a;
    const extAll = t.extensions && typeof t.extensions === "object" ? (_a = t.extensions["com.figma"]) != null ? _a : t.extensions["org.figma"] : void 0;
    let collection = extAll && typeof extAll.collectionName === "string" ? extAll.collectionName : void 0;
    let variable = extAll && typeof extAll.variableName === "string" ? extAll.variableName : void 0;
    if (ctx && extAll && typeof extAll === "object" && typeof extAll.perContext === "object") {
      const ctxBlock = extAll.perContext[ctx];
      if (ctxBlock && typeof ctxBlock === "object") {
        if (typeof ctxBlock.collectionName === "string")
          collection = ctxBlock.collectionName;
        if (typeof ctxBlock.variableName === "string")
          variable = ctxBlock.variableName;
      }
    }
    if (!collection) collection = t.path[0];
    if (!variable) variable = t.path.slice(1).join("/");
    return { collection, variable };
  }
  function buildDisplayNameIndex(graph) {
    const byKey = /* @__PURE__ */ new Map();
    for (const t of graph.tokens) {
      const ctxKeys = keysOf(t.byContext);
      const chosenCtx = ctxKeys.length > 0 ? ctxKeys[0] : void 0;
      const { collection, variable } = getFigmaDisplayNames(t, chosenCtx);
      const entry = { collection, variable };
      byKey.set(dotRaw(t.path), entry);
      const displaySegs = [collection, ...String(variable).split("/")];
      byKey.set(dotRaw(displaySegs), entry);
      const slugSegs = [
        slugForMatch(collection),
        ...String(variable).split("/").map((s) => slugForMatch(s))
      ];
      byKey.set(dotRaw(slugSegs), entry);
    }
    return byKey;
  }
  function serialize(graph, opts) {
    const root = {};
    const displayIndex = buildDisplayNameIndex(graph);
    for (const t of graph.tokens) {
      writeTokenInto(root, t, displayIndex, opts);
    }
    return { json: root };
  }
  function writeTokenInto(root, t, displayIndex, opts) {
    var _a, _b, _c;
    const ctxKeys = keysOf(t.byContext);
    const chosenCtx = ctxKeys.length > 0 ? ctxKeys[0] : void 0;
    const chosen = chosenCtx !== void 0 ? (_a = t.byContext[chosenCtx]) != null ? _a : null : null;
    const path = Array.isArray(t.path) ? t.path : [String(t.path)];
    const collectionSeg = (_b = path[0]) != null ? _b : "Tokens";
    const variableSegs = path.slice(1);
    const useFlat = !!(opts && opts.flatTokens);
    const groupSegments = useFlat ? variableSegs.slice(0, -1) : [collectionSeg, ...variableSegs.slice(0, -1)];
    const leaf = variableSegs.length ? variableSegs[variableSegs.length - 1] : (_c = path[path.length - 1]) != null ? _c : "token";
    let obj = root;
    for (let i = 0; i < groupSegments.length; i++) {
      const seg = groupSegments[i];
      let next = obj[seg];
      if (!next || typeof next !== "object") {
        next = {};
        obj[seg] = next;
      }
      obj = next;
    }
    const tokenObj = {};
    const emittedType = t.type === "boolean" ? "string" : t.type;
    tokenObj["$type"] = emittedType;
    if (chosen !== null) {
      switch (chosen.kind) {
        case "alias": {
          const segsIn = Array.isArray(chosen.path) ? chosen.path.slice() : String(chosen.path).split(".").map((p) => p.trim()).filter(Boolean);
          let refDisp = displayIndex.get(dotRaw(segsIn));
          if (!refDisp) {
            refDisp = displayIndex.get(
              dotRaw(segsIn.map((s) => slugForMatch(s)))
            );
          }
          if (!refDisp && segsIn.length > 0) {
            const firstSlug = slugForMatch(segsIn[0]);
            for (const [k] of displayIndex.entries()) {
              const parts = k.split(".");
              if (parts.length === 0) continue;
              if (slugForMatch(parts[0]) === firstSlug) {
                const cand1 = [parts[0], ...segsIn.slice(1)];
                const cand2 = [
                  parts[0],
                  ...segsIn.slice(1).map((s) => slugForMatch(s))
                ];
                refDisp = displayIndex.get(dotRaw(cand1)) || displayIndex.get(dotRaw(cand2));
                if (refDisp) break;
              }
            }
          }
          tokenObj["$value"] = refDisp ? `{${[
            refDisp.collection,
            ...String(refDisp.variable).split("/")
          ].join(".")}}` : `{${segsIn.join(".")}}`;
          break;
        }
        case "color": {
          const cv = chosen.value;
          if (opts && opts.styleDictionary) {
            tokenObj["$value"] = colorValueToHexString(cv);
          } else {
            const out = {
              colorSpace: cv.colorSpace,
              components: [
                cv.components[0],
                cv.components[1],
                cv.components[2]
              ]
            };
            if (typeof cv.alpha === "number") out["alpha"] = cv.alpha;
            if (typeof cv.hex === "string") out["hex"] = cv.hex;
            tokenObj["$value"] = out;
          }
          break;
        }
        case "number":
        case "string": {
          tokenObj["$value"] = chosen.value;
          break;
        }
        case "boolean": {
          tokenObj["$value"] = chosen.value ? "true" : "false";
          break;
        }
        case "typography": {
          tokenObj["$value"] = serializeTypographyValue(chosen.value);
          break;
        }
      }
    }
    if (typeof t.description === "string" && t.description.trim() !== "") {
      tokenObj["$description"] = t.description;
    }
    let extOut;
    if (t.extensions) {
      const flattened = flattenFigmaExtensionsForCtx(
        t.extensions,
        chosenCtx
      );
      extOut = flattened != null ? flattened : t.extensions;
    }
    if (t.type === "boolean") {
      if (!extOut) extOut = {};
      const fig = extOut["com.figma"] && typeof extOut["com.figma"] === "object" ? extOut["com.figma"] : extOut["com.figma"] = {};
      if (fig["variableType"] !== "BOOLEAN") fig["variableType"] = "BOOLEAN";
    }
    if (extOut) tokenObj["$extensions"] = extOut;
    obj[leaf] = tokenObj;
  }
  function flattenFigmaExtensionsForCtx(ext, ctx) {
    if (!ext || typeof ext !== "object") return null;
    const out = {};
    for (const k in ext) {
      if (!Object.prototype.hasOwnProperty.call(ext, k)) continue;
      if (k !== "com.figma" && k !== "org.figma") {
        out[k] = ext[k];
      }
    }
    const ns = ext["com.figma"] ? "com.figma" : ext["org.figma"] ? "org.figma" : null;
    if (ns) {
      const figmaBlock = ext[ns];
      if (figmaBlock && typeof figmaBlock === "object") {
        const base = {};
        for (const k of Object.keys(figmaBlock)) {
          if (k !== "perContext") base[k] = figmaBlock[k];
        }
        const per = figmaBlock["perContext"];
        if (ctx && per && typeof per === "object") {
          const ctxData = per[ctx];
          if (ctxData && typeof ctxData === "object") {
            Object.assign(base, ctxData);
          }
        }
        if (Object.keys(base).length > 0) {
          out["com.figma"] = base;
        }
      }
    }
    return Object.keys(out).length > 0 ? out : null;
  }
  function keysOf(o) {
    const out = [];
    if (!o) return out;
    for (const k in o)
      if (Object.prototype.hasOwnProperty.call(o, k)) out.push(k);
    return out;
  }

  // src/core/figma-cache.ts
  async function loadCollectionsSnapshot(variablesApi) {
    const collections = await variablesApi.getLocalVariableCollectionsAsync();
    const collectionNameById = /* @__PURE__ */ new Map();
    for (const col of collections) {
      collectionNameById.set(col.id, col.name);
    }
    const seenIds = /* @__PURE__ */ new Set();
    const ids = [];
    for (const col of collections) {
      for (const id of col.variableIds) {
        if (id && !seenIds.has(id)) {
          seenIds.add(id);
          ids.push(id);
        }
      }
    }
    const variablesById = /* @__PURE__ */ new Map();
    if (ids.length > 0) {
      const fetched = await Promise.all(
        ids.map((id) => variablesApi.getVariableByIdAsync(id))
      );
      for (let i = 0; i < ids.length; i++) {
        const variable = fetched[i];
        if (variable) variablesById.set(ids[i], variable);
      }
    }
    return { collections, variablesById, collectionNameById };
  }

  // src/core/ir.ts
  function ctxKey(collection, mode) {
    return collection + "/" + mode;
  }

  // src/adapters/figma-reader.ts
  function mapType(t) {
    if (t === "COLOR") return "color";
    if (t === "FLOAT") return "number";
    if (t === "STRING") return "string";
    return "boolean";
  }
  function isAliasValue(v) {
    return !!v && typeof v === "object" && v.type === "VARIABLE_ALIAS" && typeof v.id === "string";
  }
  function isRGBA(v) {
    return !!v && typeof v === "object" && typeof v.r === "number" && typeof v.g === "number" && typeof v.b === "number" && typeof v.a === "number";
  }
  async function readFigmaToIR() {
    const profile = figma.root.documentColorProfile;
    const variablesApi = figma.variables;
    const { collections, variablesById, collectionNameById } = await loadCollectionsSnapshot(variablesApi);
    const tokens = [];
    for (const c of collections) {
      const modeNameById = {};
      for (const m of c.modes) modeNameById[m.modeId] = m.name;
      for (const vid of c.variableIds) {
        const v2 = variablesById.get(vid) || await variablesApi.getVariableByIdAsync(vid);
        if (v2 && !variablesById.has(vid)) variablesById.set(vid, v2);
        if (!v2) continue;
        const path = canonicalPath(c.name, v2.name);
        const type = mapType(v2.resolvedType);
        const byContext = {};
        const perContext = {};
        for (const md of c.modes) {
          const ctx = ctxKey(c.name, md.name);
          const mv = v2.valuesByMode[md.modeId];
          perContext[ctx] = {
            collectionName: c.name,
            collectionID: c.id,
            modeName: md.name,
            modeID: md.modeId,
            variableName: v2.name,
            variableID: v2.id
          };
          if (isAliasValue(mv)) {
            perContext[ctx].alias = {
              type: "VARIABLE_ALIAS",
              id: mv.id
            };
            const target = variablesById.get(mv.id) || await variablesApi.getVariableByIdAsync(mv.id);
            if (target && !variablesById.has(target.id))
              variablesById.set(target.id, target);
            if (target) {
              const collName = collectionNameById.get(
                target.variableCollectionId
              ) || c.name;
              const aPath = canonicalPath(collName, target.name);
              byContext[ctx] = { kind: "alias", path: aPath };
            }
            continue;
          }
          if (type === "color" && isRGBA(mv)) {
            const cv = figmaRGBAToDtcg(
              { r: mv.r, g: mv.g, b: mv.b, a: mv.a },
              profile
            );
            byContext[ctx] = { kind: "color", value: cv };
            continue;
          }
          if (typeof mv === "number") {
            byContext[ctx] = { kind: "number", value: mv };
            continue;
          }
          if (typeof mv === "boolean") {
            byContext[ctx] = { kind: "boolean", value: mv };
            continue;
          }
          if (typeof mv === "string") {
            byContext[ctx] = { kind: "string", value: mv };
            continue;
          }
        }
        const figmaExt = { perContext };
        if (type === "boolean") {
          figmaExt["variableType"] = "BOOLEAN";
        }
        const token = __spreadProps(__spreadValues({
          path,
          type,
          byContext
        }, v2.description && v2.description.length > 0 ? { description: v2.description } : {}), {
          extensions: {
            "com.figma": figmaExt
          }
        });
        tokens.push(token);
      }
    }
    if (typeof figma.getLocalTextStylesAsync === "function") {
      const textStyles = await figma.getLocalTextStylesAsync();
      if (textStyles.length === 0) return { tokens };
      const defaultCollection = "typography";
      const defaultMode = "Mode 1";
      for (const style of textStyles) {
        const { value, figma: typographyFigma } = typographyValueFromTextStyle(style);
        const path = canonicalPath(defaultCollection, style.name);
        const ctx = ctxKey(defaultCollection, defaultMode);
        const byContext = {};
        byContext[ctx] = { kind: "typography", value };
        const perContext = {};
        perContext[ctx] = {
          styleID: style.id,
          styleName: style.name
        };
        const extensions = {
          "com.figma": {
            styleType: "TEXT",
            styleID: style.id,
            styleName: style.name,
            typography: typographyFigma,
            perContext
          }
        };
        tokens.push(__spreadProps(__spreadValues({
          path,
          type: "typography",
          byContext
        }, style.description && style.description.length > 0 ? { description: style.description } : {}), {
          extensions
        }));
      }
    }
    return { tokens };
  }

  // src/adapters/figma-writer.ts
  function logInfo2(msg) {
    var _a;
    try {
      (_a = figma.ui) == null ? void 0 : _a.postMessage({ type: "INFO", payload: { message: msg } });
    } catch (e) {
    }
  }
  function logWarn2(msg) {
    logInfo2("Warning: " + msg);
  }
  function logError(msg) {
    logInfo2("Error: " + msg);
  }
  function readFigmaVariableTypeHint(t) {
    try {
      const ext = t.extensions && typeof t.extensions === "object" ? t.extensions["com.figma"] : void 0;
      const vt = ext && typeof ext === "object" ? ext.variableType : void 0;
      return vt === "BOOLEAN" ? "BOOLEAN" : void 0;
    } catch (e) {
      return void 0;
    }
  }
  function looksBooleanString(s) {
    return typeof s === "string" && /^(true|false)$/i.test(s.trim());
  }
  function tokenHasBooleanLikeString(t) {
    const byCtx = t.byContext || {};
    for (const k in byCtx) {
      const v = byCtx[k];
      if (!v || v.kind === "alias") continue;
      if (v.kind === "string" && looksBooleanString(v.value)) return true;
    }
    return false;
  }
  function tokenHasDirectValue(t) {
    const byCtx = t.byContext || {};
    for (const k in byCtx) {
      const v = byCtx[k];
      if (!v) continue;
      if (t.type === "color") {
        if (v.kind === "color" && isValidDtcgColorValueObject(v.value))
          return true;
      } else {
        if (v.kind === t.type) return true;
      }
    }
    return false;
  }
  function tokenHasAtLeastOneValidDirectValue(t, profile) {
    const canonicalProfile = normalizeDocumentProfile(profile);
    const byCtx = t.byContext || {};
    let lastReason;
    let reasonAlreadyLogged = false;
    for (const ctx in byCtx) {
      const v = byCtx[ctx];
      if (!v || v.kind === "alias") continue;
      if (t.type === "color") {
        if (v.kind !== "color") continue;
        const shape = isDtcgColorShapeValid(v.value);
        if (!shape.ok) {
          lastReason = `color in ${ctx} is invalid: ${shape.reason}`;
          continue;
        }
        const cs = (v.value.colorSpace || "srgb").toLowerCase();
        if (!isColorSpaceRepresentableInDocument(cs, canonicalProfile)) {
          lastReason = `colorSpace \u201C${cs}\u201D isn\u2019t representable in this document (${canonicalProfile}).`;
          if (!reasonAlreadyLogged) {
            logWarn2(
              `Skipped creating direct color at \u201C${t.path.join(
                "/"
              )}\u201D in ${ctx} \u2014 ${lastReason}`
            );
            reasonAlreadyLogged = true;
          }
          continue;
        }
        return { ok: true };
      } else if (t.type === "number" || t.type === "string" || t.type === "boolean") {
        if (v.kind === t.type) return { ok: true };
      }
    }
    if (t.type === "number" || t.type === "string" || t.type === "boolean") {
      return { ok: false };
    }
    if (reasonAlreadyLogged) {
      return { ok: false, suppressWarn: true };
    }
    return {
      ok: false,
      reason: lastReason || "no valid color values in any context; not creating variable or collection."
    };
  }
  function resolvedTypeFor(t) {
    if (t === "color") return "COLOR";
    if (t === "number") return "FLOAT";
    if (t === "string") return "STRING";
    return "BOOLEAN";
  }
  function forEachKey(obj) {
    const out = [];
    if (!obj) return out;
    for (const k in obj)
      if (Object.prototype.hasOwnProperty.call(obj, k)) out.push(k);
    return out;
  }
  function tokenHasAlias(t) {
    const byCtx = t.byContext || {};
    for (const k in byCtx) {
      const v = byCtx[k];
      if (v && v.kind === "alias") return true;
    }
    return false;
  }
  function maybeWarnColorMismatch(t, ctx, importedHexOrNull) {
    try {
      const extAll = t.extensions && typeof t.extensions === "object" ? t.extensions["com.figma"] : void 0;
      if (!extAll || typeof extAll !== "object") return;
      let hintHex;
      if (typeof extAll.hex === "string") hintHex = extAll.hex;
      const pc = extAll.perContext && typeof extAll.perContext === "object" ? extAll.perContext : void 0;
      if (!hintHex && pc && pc[ctx] && typeof pc[ctx].hex === "string")
        hintHex = pc[ctx].hex;
      if (!hintHex || !importedHexOrNull) return;
      const a = hintHex.trim().toLowerCase();
      const b = importedHexOrNull.trim().toLowerCase();
      if (a !== b)
        logWarn2(
          `color mismatch for \u201C${t.path.join(
            "/"
          )}\u201D in ${ctx}. Using $value over $extensions.`
        );
    } catch (e) {
    }
  }
  function normalizeAliasSegments(rawPath, currentCollection, displayBySlug, knownCollections) {
    const segs = Array.isArray(rawPath) ? rawPath.slice() : String(rawPath).split(".").map((s) => s.trim()).filter(Boolean);
    if (segs.length === 0) return [currentCollection];
    const first = segs[0];
    if (knownCollections.has(first)) return segs;
    const mapped = displayBySlug[first];
    if (mapped && knownCollections.has(mapped)) {
      segs[0] = mapped;
      return segs;
    }
    return [currentCollection, ...segs];
  }
  function namesMatchExtensions(t) {
    const ext = t.extensions && typeof t.extensions === "object" ? t.extensions["com.figma"] : void 0;
    if (!ext || typeof ext !== "object") return { ok: true };
    const pathCollection = t.path[0];
    const pathVariable = t.path.slice(1).join("/");
    let expectedCollection = typeof ext.collectionName === "string" ? ext.collectionName : void 0;
    let expectedVariable = typeof ext.variableName === "string" ? ext.variableName : void 0;
    if (!expectedCollection || !expectedVariable) {
      const per = ext.perContext;
      if (per && typeof per === "object") {
        const ctxKeys = forEachKey(t.byContext);
        let ctxToUse;
        for (const k of ctxKeys) {
          if (per[k] && typeof per[k] === "object") {
            ctxToUse = k;
            break;
          }
        }
        if (!ctxToUse) {
          for (const k in per) {
            if (Object.prototype.hasOwnProperty.call(per, k) && per[k] && typeof per[k] === "object") {
              ctxToUse = k;
              break;
            }
          }
        }
        if (ctxToUse) {
          const ctxData = per[ctxToUse];
          if (!expectedCollection && typeof ctxData.collectionName === "string")
            expectedCollection = ctxData.collectionName;
          if (!expectedVariable && typeof ctxData.variableName === "string")
            expectedVariable = ctxData.variableName;
        }
      }
    }
    if (typeof expectedCollection === "string" && expectedCollection !== pathCollection) {
      return {
        ok: false,
        reason: `Skipping \u201C${t.path.join(
          "/"
        )}\u201D \u2014 $extensions.com.figma.collectionName (\u201C${expectedCollection}\u201D) doesn\u2019t match JSON group (\u201C${pathCollection}\u201D).`
      };
    }
    if (typeof expectedVariable === "string" && expectedVariable !== pathVariable) {
      return {
        ok: false,
        reason: `Skipping \u201C${t.path.join(
          "/"
        )}\u201D \u2014 $extensions.com.figma.variableName (\u201C${expectedVariable}\u201D) doesn\u2019t match JSON key (\u201C${pathVariable}\u201D).`
      };
    }
    return { ok: true };
  }
  function typographyNamesMatchExtensions(t, styleName) {
    const ext = t.extensions && typeof t.extensions === "object" ? t.extensions["com.figma"] : void 0;
    if (!ext || typeof ext !== "object") return { ok: true };
    const expected = typeof ext.styleName === "string" ? ext.styleName : void 0;
    if (expected && expected !== styleName) {
      return {
        ok: false,
        reason: `Skipping \u201C${t.path.join(
          "/"
        )}\u201D \u2014 $extensions.com.figma.styleName (\u201C${expected}\u201D) doesn\u2019t match JSON key (\u201C${styleName}\u201D).`
      };
    }
    return { ok: true };
  }
  function dot(segs) {
    return segs.join(".");
  }
  function indexVarKeys(map, collectionDisplay, varSegsRaw, varId) {
    const colDisp = collectionDisplay;
    const colSlug = slugSegment(collectionDisplay);
    const varRaw = varSegsRaw;
    const varSlug = varSegsRaw.map((s) => slugSegment(s));
    map[dot([colDisp, ...varRaw])] = varId;
    map[dot([colDisp, ...varSlug])] = varId;
    map[dot([colSlug, ...varRaw])] = varId;
    map[dot([colSlug, ...varSlug])] = varId;
  }
  async function writeIRToFigma(graph) {
    const profile = figma.root.documentColorProfile;
    const canonicalProfile = normalizeDocumentProfile(profile);
    const variablesApi = figma.variables;
    logInfo2(
      `Import: document color profile ${String(
        profile
      )} (canonical ${canonicalProfile}).`
    );
    const {
      collections: existingCollections,
      variablesById,
      collectionNameById
    } = await loadCollectionsSnapshot(variablesApi);
    const colByName = {};
    for (const c of existingCollections) colByName[c.name] = c;
    const existingVarIdByPathDot = {};
    for (const c of existingCollections) {
      const cDisplay = c.name;
      for (const vid of c.variableIds) {
        const variable = variablesById.get(vid);
        if (!variable) continue;
        const varSegs = variable.name.split("/");
        indexVarKeys(
          existingVarIdByPathDot,
          cDisplay,
          varSegs,
          variable.id
        );
      }
    }
    const knownCollections = new Set(Object.keys(colByName));
    const displayBySlug = {};
    for (const name of knownCollections)
      displayBySlug[slugSegment(name)] = name;
    for (const t of graph.tokens) {
      const name = t.path[0];
      knownCollections.add(name);
      displayBySlug[slugSegment(name)] = name;
    }
    const directTokens = [];
    const aliasOnlyTokens = [];
    const typographyTokens = [];
    for (const t of graph.tokens) {
      if (t.type === "typography") {
        typographyTokens.push(t);
        continue;
      }
      const hasDirect = tokenHasDirectValue(t);
      const hasAlias = tokenHasAlias(t);
      if (hasDirect) {
        directTokens.push(t);
      } else if (hasAlias) {
        aliasOnlyTokens.push(t);
      } else {
        logWarn2(
          `Skipped ${t.type} token \u201C${t.path.join("/")}\u201D \u2014 needs a ${t.type} $value or an alias reference.`
        );
      }
      if (t.type === "string" && !readFigmaVariableTypeHint(t) && tokenHasBooleanLikeString(t)) {
        logInfo2(
          `Note: \u201C${t.path.join(
            "/"
          )}\u201D has string values "true"/"false" but no $extensions.com.figma.variableType hint; keeping STRING in Figma.`
        );
      }
    }
    function ensureCollection(name) {
      let col = colByName[name];
      if (!col) {
        col = variablesApi.createVariableCollection(name);
        colByName[name] = col;
        knownCollections.add(name);
        displayBySlug[slugSegment(name)] = name;
        collectionNameById.set(col.id, name);
      }
      return col;
    }
    let createdTextStyles = 0;
    async function importTypographyTokens(tokens) {
      if (tokens.length === 0) return;
      const hasAsyncTextStyles = typeof figma.getLocalTextStylesAsync === "function";
      const canReadStyles = hasAsyncTextStyles;
      const canCreateStyles = typeof figma.createTextStyle === "function";
      if (!canReadStyles || !canCreateStyles) {
        logWarn2(
          "Typography tokens present but text style APIs are unavailable in this version of Figma. Skipping typography import."
        );
        return;
      }
      const stylesById = /* @__PURE__ */ new Map();
      const stylesByName = /* @__PURE__ */ new Map();
      const localStyles = await figma.getLocalTextStylesAsync();
      for (const style of localStyles) {
        stylesById.set(style.id, style);
        stylesByName.set(style.name, style);
      }
      const loadedFonts = /* @__PURE__ */ new Set();
      for (const token of tokens) {
        const styleSegments = token.path.slice(1);
        const styleName = styleSegments.join("/");
        if (!styleName) {
          logWarn2(
            `Skipped typography token \u201C${token.path.join(
              "/"
            )}\u201D \u2014 requires a style name after the collection.`
          );
          continue;
        }
        const nameCheck = typographyNamesMatchExtensions(token, styleName);
        if (!nameCheck.ok) {
          logWarn2(nameCheck.reason);
          continue;
        }
        const ctxKeys = forEachKey(token.byContext);
        let typographyValue = null;
        let typographyContexts = 0;
        for (const ctx of ctxKeys) {
          const val = token.byContext[ctx];
          if (!val) continue;
          if (val.kind === "typography") {
            typographyContexts++;
            if (!typographyValue) typographyValue = val.value;
          } else if (val.kind === "alias") {
            logWarn2(
              `Skipped typography alias at \u201C${token.path.join(
                "/"
              )}\u201D in ${ctx} \u2014 text styles do not support aliases.`
            );
          } else {
            logWarn2(
              `Skipped unsupported value for \u201C${token.path.join(
                "/"
              )}\u201D in ${ctx} \u2014 expected a typography $value.`
            );
          }
        }
        if (!typographyValue) {
          logWarn2(
            `Skipped typography token \u201C${token.path.join(
              "/"
            )}\u201D \u2014 needs a typography $value.`
          );
          continue;
        }
        if (typographyContexts > 1) {
          logWarn2(
            `Typography token \u201C${token.path.join(
              "/"
            )}\u201D has multiple contexts. Using the first typography value.`
          );
        }
        const ext = token.extensions && typeof token.extensions === "object" ? token.extensions["com.figma"] : void 0;
        const extStyleId = ext && typeof ext === "object" && typeof ext.styleID === "string" ? String(ext.styleID) : void 0;
        const typographyExt = ext && typeof ext === "object" ? ext.typography : void 0;
        let style = null;
        let createdStyle = false;
        if (extStyleId) {
          style = stylesById.get(extStyleId) || null;
        }
        if (!style) {
          style = stylesByName.get(styleName) || null;
        }
        if (!style) {
          style = figma.createTextStyle();
          createdStyle = true;
        }
        const { fontName, usedFallback } = typographyFontNameFromValue(typographyValue);
        let appliedFont = null;
        let skipToken = false;
        const tokenPath = token.path.join("/");
        if (fontName) {
          const key = fontName.family + ":::" + fontName.style;
          if (!loadedFonts.has(key)) {
            try {
              await figma.loadFontAsync(fontName);
              loadedFonts.add(key);
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              logWarn2(
                `Skipped typography token \u201C${tokenPath}\u201D \u2014 failed to load font \u201C${fontName.family} ${fontName.style}\u201D. ${msg}`
              );
              skipToken = true;
            }
          }
          if (!skipToken && loadedFonts.has(key)) {
            appliedFont = fontName;
            if (usedFallback) {
              logInfo2(
                `Typography token \u201C${token.path.join(
                  "/"
                )}\u201D is missing a font style. Defaulted to \u201C${fontName.style}\u201D.`
              );
            }
          }
        } else {
          logWarn2(
            `Skipped typography token \u201C${tokenPath}\u201D \u2014 typography token is missing fontFamily.`
          );
          skipToken = true;
        }
        if (skipToken || !appliedFont) {
          if (createdStyle) {
            try {
              style.remove();
            } catch (e) {
            }
          }
          continue;
        }
        const prevName = style.name;
        if (style.name !== styleName) {
          style.name = styleName;
        }
        stylesById.set(style.id, style);
        if (prevName && stylesByName.get(prevName) === style) {
          stylesByName.delete(prevName);
        }
        stylesByName.set(styleName, style);
        if (typeof token.description === "string" && token.description.trim().length > 0 && style.description !== token.description) {
          try {
            style.description = token.description;
          } catch (e) {
          }
        }
        if (createdStyle) {
          createdTextStyles++;
        }
        const warnings = applyTypographyValueToTextStyle(
          style,
          typographyValue,
          {
            fontName: appliedFont,
            figma: typographyExt != null ? typographyExt : null
          }
        );
        for (const warning of warnings) {
          logWarn2(`Text style \u201C${styleName}\u201D: ${warning}`);
        }
      }
    }
    const idByPath = {};
    function varNameFromPath(path) {
      return path.slice(1).join("/") || path[0] || "token";
    }
    for (const t of directTokens) {
      if (t.path.length < 1) continue;
      const nameChk = namesMatchExtensions(t);
      if (!nameChk.ok) {
        logWarn2(nameChk.reason);
        continue;
      }
      const collectionName = t.path[0];
      const varName = varNameFromPath(t.path);
      const directCheck = tokenHasAtLeastOneValidDirectValue(t, profile);
      if (!directCheck.ok) {
        if (directCheck.reason) {
          logWarn2(
            `Skipped creating direct ${t.type} token \u201C${t.path.join(
              "/"
            )}\u201D \u2014 ${directCheck.reason}`
          );
        } else if (!directCheck.suppressWarn) {
          logWarn2(
            `Skipped creating direct ${t.type} token \u201C${t.path.join(
              "/"
            )}\u201D \u2014 no valid direct values in any context; not creating variable or collection.`
          );
        }
        continue;
      }
      const col = ensureCollection(collectionName);
      let existingVarId = null;
      for (const vid of col.variableIds) {
        const cand = variablesById.get(vid) || await variablesApi.getVariableByIdAsync(vid);
        if (cand && !variablesById.has(vid) && cand)
          variablesById.set(vid, cand);
        if (cand && cand.name === varName) {
          existingVarId = cand.id;
          break;
        }
      }
      let v = null;
      if (existingVarId) {
        v = variablesById.get(existingVarId) || await variablesApi.getVariableByIdAsync(existingVarId);
        if (v && !variablesById.has(existingVarId))
          variablesById.set(existingVarId, v);
        if (!v) continue;
      } else {
        const hint = readFigmaVariableTypeHint(t);
        const createAs = hint === "BOOLEAN" && t.type === "string" ? "BOOLEAN" : resolvedTypeFor(t.type);
        v = variablesApi.createVariable(varName, col, createAs);
        variablesById.set(v.id, v);
      }
      if (typeof t.description === "string" && t.description.trim().length > 0 && v.description !== t.description) {
        try {
          v.description = t.description;
        } catch (e) {
        }
      }
      const varSegs = varName.split("/");
      indexVarKeys(idByPath, collectionName, varSegs, v.id);
    }
    const pending = aliasOnlyTokens.slice();
    while (pending.length) {
      let progress = false;
      const nextRound = [];
      for (const t of pending) {
        const nameChk = namesMatchExtensions(t);
        if (!nameChk.ok) {
          logWarn2(nameChk.reason);
          continue;
        }
        const collectionName = t.path[0];
        const varName = varNameFromPath(t.path);
        const selfVarSegs = varName.split("/");
        const selfKeys = /* @__PURE__ */ new Set();
        (function addSelfKeys() {
          const colDisp = collectionName;
          const colSlug = slugSegment(collectionName);
          const varRaw = selfVarSegs;
          const varSlug = selfVarSegs.map((s) => slugSegment(s));
          selfKeys.add(dot([colDisp, ...varRaw]));
          selfKeys.add(dot([colDisp, ...varSlug]));
          selfKeys.add(dot([colSlug, ...varRaw]));
          selfKeys.add(dot([colSlug, ...varSlug]));
        })();
        let resolvable = false;
        const ctxKeys = forEachKey(t.byContext);
        for (const ctx of ctxKeys) {
          const val = t.byContext[ctx];
          if (!val || val.kind !== "alias") continue;
          const segs = normalizeAliasSegments(
            val.path,
            collectionName,
            displayBySlug,
            knownCollections
          );
          const aliasDot = dot(segs);
          if (selfKeys.has(aliasDot)) continue;
          if (idByPath[aliasDot] || existingVarIdByPathDot[aliasDot]) {
            resolvable = true;
            break;
          }
        }
        if (!resolvable) {
          nextRound.push(t);
          continue;
        }
        const col = ensureCollection(collectionName);
        let existingVarId = null;
        for (const vid of col.variableIds) {
          const cand = variablesById.get(vid) || await variablesApi.getVariableByIdAsync(vid);
          if (cand && !variablesById.has(vid))
            variablesById.set(vid, cand);
          if (cand && cand.name === varName) {
            existingVarId = cand.id;
            break;
          }
        }
        let v = null;
        if (existingVarId) {
          v = variablesById.get(existingVarId) || await variablesApi.getVariableByIdAsync(existingVarId);
          if (v && !variablesById.has(existingVarId))
            variablesById.set(existingVarId, v);
          if (!v) continue;
        } else {
          const hint = readFigmaVariableTypeHint(t);
          const createAs = hint === "BOOLEAN" && t.type === "string" ? "BOOLEAN" : resolvedTypeFor(t.type);
          v = variablesApi.createVariable(varName, col, createAs);
          variablesById.set(v.id, v);
        }
        if (typeof t.description === "string" && t.description.trim().length > 0 && v.description !== t.description) {
          try {
            v.description = t.description;
          } catch (e) {
          }
        }
        const varSegs = varName.split("/");
        indexVarKeys(idByPath, collectionName, varSegs, v.id);
        progress = true;
      }
      if (!progress) {
        for (const t of nextRound) {
          logWarn2(
            `Alias target not found for \u201C${t.path.join(
              "/"
            )}\u201D. Variable not created.`
          );
        }
        break;
      }
      pending.length = 0;
      Array.prototype.push.apply(pending, nextRound);
    }
    await importTypographyTokens(typographyTokens);
    const modeIdByKey = {};
    const colsPost = await variablesApi.getLocalVariableCollectionsAsync();
    for (const c of colsPost) {
      for (const m of c.modes) {
        modeIdByKey[c.name + "/" + m.name] = m.modeId;
      }
    }
    for (const node of graph.tokens) {
      const collectionName = node.path[0];
      const varName = node.path.slice(1).join("/");
      const varSegs = varName.split("/");
      const possibleSelfKeys = [];
      (function addSelfKeys() {
        const colDisp = collectionName;
        const colSlug = slugSegment(collectionName);
        const varRaw = varSegs;
        const varSlug = varSegs.map((s) => slugSegment(s));
        possibleSelfKeys.push(
          dot([colDisp, ...varRaw]),
          dot([colDisp, ...varSlug]),
          dot([colSlug, ...varRaw]),
          dot([colSlug, ...varSlug])
        );
      })();
      let varId;
      for (const k of possibleSelfKeys) {
        varId = idByPath[k];
        if (varId) break;
      }
      if (!varId) continue;
      const targetVar = variablesById.get(varId) || await variablesApi.getVariableByIdAsync(varId);
      if (targetVar && !variablesById.has(varId))
        variablesById.set(varId, targetVar);
      if (!targetVar) continue;
      if (typeof node.description === "string" && node.description.trim().length > 0 && targetVar.description !== node.description) {
        try {
          targetVar.description = node.description;
        } catch (e) {
        }
      }
      const ctxKeys = forEachKey(node.byContext);
      for (const ctx of ctxKeys) {
        const val = node.byContext[ctx];
        let modeId = modeIdByKey[ctx];
        if (!modeId) {
          const parts = ctx.split("/");
          const cName = parts[0];
          const mName = parts.slice(1).join("/") || "Mode 1";
          const col = colByName[cName];
          if (col) {
            const found = col.modes.find((m) => m.name === mName);
            if (found) {
              modeId = found.modeId;
              modeIdByKey[cName + "/" + mName] = modeId;
              modeIdByKey[ctx] = modeId;
            } else if (col.modes.length === 1) {
              const loneMode = col.modes[0];
              const prevName = loneMode.name;
              if (prevName !== mName) {
                logWarn2(
                  `Collection \u201C${cName}\u201D is limited to a single mode. Renaming \u201C${prevName}\u201D to \u201C${mName}\u201D.`
                );
                try {
                  col.renameMode(loneMode.modeId, mName);
                  loneMode.name = mName;
                  const keyOld = cName + "/" + prevName;
                  delete modeIdByKey[keyOld];
                  modeId = loneMode.modeId;
                  const keyNew = cName + "/" + mName;
                  modeIdByKey[keyNew] = modeId;
                  modeIdByKey[ctx] = modeId;
                  logInfo2(
                    `Renamed mode \u201C${prevName}\u201D \u2192 \u201C${mName}\u201D in collection \u201C${cName}\u201D.`
                  );
                } catch (err) {
                  const errMsg = err instanceof Error ? err.message : String(err);
                  logError(
                    `Failed to rename mode \u201C${prevName}\u201D to \u201C${mName}\u201D in collection \u201C${cName}\u201D. ${errMsg}`
                  );
                }
              } else {
                modeId = loneMode.modeId;
                modeIdByKey[cName + "/" + mName] = modeId;
                modeIdByKey[ctx] = modeId;
              }
            } else {
              try {
                modeId = col.addMode(mName);
                modeIdByKey[cName + "/" + mName] = modeId;
                modeIdByKey[ctx] = modeId;
              } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                if (message && message.includes("Limited to 1")) {
                  const loneMode = col.modes[0];
                  const prevName = (loneMode == null ? void 0 : loneMode.name) || "Mode 1";
                  logWarn2(
                    `Unable to add mode \u201C${mName}\u201D to collection \u201C${cName}\u201D because only a single mode is allowed. Renaming existing mode \u201C${prevName}\u201D.`
                  );
                  try {
                    if (loneMode) {
                      col.renameMode(loneMode.modeId, mName);
                      loneMode.name = mName;
                      const keyOld = cName + "/" + prevName;
                      delete modeIdByKey[keyOld];
                      modeId = loneMode.modeId;
                      const keyNew = cName + "/" + mName;
                      modeIdByKey[keyNew] = modeId;
                      modeIdByKey[ctx] = modeId;
                      logInfo2(
                        `Renamed mode \u201C${prevName}\u201D \u2192 \u201C${mName}\u201D in collection \u201C${cName}\u201D.`
                      );
                    } else {
                      logError(
                        `Unable to rename mode in collection \u201C${cName}\u201D because it has no modes.`
                      );
                    }
                  } catch (renameErr) {
                    const renameMsg = renameErr instanceof Error ? renameErr.message : String(renameErr);
                    logError(
                      `Failed to rename mode \u201C${prevName}\u201D to \u201C${mName}\u201D in collection \u201C${cName}\u201D. ${renameMsg}`
                    );
                  }
                } else {
                  logError(
                    `Error while adding mode \u201C${mName}\u201D to collection \u201C${cName}\u201D. ${message}`
                  );
                }
              }
            }
          }
        }
        if (!modeId) continue;
        if (val.kind === "alias") {
          const currentCollection = collectionName;
          const rawSegs = Array.isArray(val.path) ? val.path.slice() : String(val.path).split(".").map((s) => s.trim()).filter(Boolean);
          const candidates = [];
          if (rawSegs.length > 0) candidates.push(rawSegs);
          candidates.push([currentCollection, ...rawSegs]);
          if (rawSegs.length > 0 && displayBySlug[rawSegs[0]]) {
            candidates.push([
              displayBySlug[rawSegs[0]],
              ...rawSegs.slice(1)
            ]);
          }
          let targetId;
          for (const cand of candidates) {
            const exact = dot(cand);
            const fullySlugged = dot([
              slugSegment(cand[0] || ""),
              ...cand.slice(1).map((s) => slugSegment(s))
            ]);
            targetId = idByPath[exact] || idByPath[fullySlugged] || existingVarIdByPathDot[exact] || existingVarIdByPathDot[fullySlugged];
            if (targetId) break;
          }
          if (!targetId) {
            logWarn2(
              `Alias target not found while setting \u201C${node.path.join(
                "/"
              )}\u201D in ${ctx}. Skipped this context.`
            );
            continue;
          }
          if (targetId === targetVar.id) {
            logWarn2(
              `Self-alias is not allowed for \u201C${node.path.join(
                "/"
              )}\u201D in ${ctx}. Skipped this context.`
            );
            continue;
          }
          const aliasObj = await variablesApi.createVariableAliasByIdAsync(targetId);
          targetVar.setValueForMode(modeId, aliasObj);
          continue;
        } else if (val.kind === "color") {
          const shape = isDtcgColorShapeValid(val.value);
          if (!shape.ok) {
            logWarn2(
              `Skipped setting color for \u201C${node.path.join(
                "/"
              )}\u201D in ${ctx} \u2014 ${shape.reason}.`
            );
            continue;
          }
          const cs = (val.value.colorSpace || "srgb").toLowerCase();
          if (!isColorSpaceRepresentableInDocument(cs, canonicalProfile)) {
            if (cs === "display-p3" && canonicalProfile === "SRGB") {
              logWarn2(
                `Skipped \u201C${node.path.join(
                  "/"
                )}\u201D in ${ctx}: the token is display-p3 but this file is set to sRGB. Open File \u2192 File Settings \u2192 Color Space and switch to Display P3, or convert the token to sRGB.`
              );
            } else {
              logWarn2(
                `Skipped setting color for \u201C${node.path.join(
                  "/"
                )}\u201D in ${ctx} \u2014 colorSpace \u201C${cs}\u201D isn\u2019t representable in this document (${canonicalProfile}).`
              );
            }
            continue;
          }
          const norm = normalizeDtcgColorValue(val.value);
          maybeWarnColorMismatch(
            node,
            ctx,
            typeof norm.hex === "string" ? norm.hex : null
          );
          const rgba = dtcgToFigmaRGBA(norm, profile);
          targetVar.setValueForMode(modeId, {
            r: rgba.r,
            g: rgba.g,
            b: rgba.b,
            a: rgba.a
          });
        } else if (val.kind === "number" || val.kind === "string" || val.kind === "boolean") {
          if (targetVar.resolvedType === "BOOLEAN") {
            if (val.kind === "boolean") {
              targetVar.setValueForMode(modeId, !!val.value);
            } else if (val.kind === "string" && looksBooleanString(val.value)) {
              targetVar.setValueForMode(
                modeId,
                /^true$/i.test(val.value.trim())
              );
            } else {
              logWarn2(
                `Skipped setting non-boolean value for BOOLEAN variable \u201C${node.path.join(
                  "/"
                )}\u201D in ${ctx}.`
              );
            }
          } else if (val.kind === "boolean") {
            targetVar.setValueForMode(
              modeId,
              val.value ? "true" : "false"
            );
          } else {
            targetVar.setValueForMode(modeId, val.value);
          }
        }
      }
    }
    for (const name of Object.keys(colByName)) {
      const col = colByName[name];
      if (col && col.variableIds.length === 0) {
        try {
          col.remove();
        } catch (e) {
        }
        knownCollections.delete(name);
        delete colByName[name];
      }
    }
    return { createdTextStyles };
  }

  // src/core/pipeline.ts
  function keysOf2(obj) {
    const out = [];
    let k;
    for (k in obj)
      if (Object.prototype.hasOwnProperty.call(obj, k)) out.push(k);
    return out;
  }
  var INVALID_FILE_CHARS = /[<>:"/\\|?*\u0000-\u001F]/g;
  function sanitizeForFile(s) {
    let cleaned = String(s);
    cleaned = cleaned.replace(INVALID_FILE_CHARS, "_");
    cleaned = cleaned.replace(/\s+/g, " ").trim();
    cleaned = cleaned.replace(/[. ]+$/g, "");
    return cleaned;
  }
  function cloneTokenWithSingleContext(t, ctx) {
    const val = t.byContext[ctx];
    if (!val) return null;
    const copyByCtx = {};
    copyByCtx[ctx] = val;
    return {
      path: (function() {
        const arr = [];
        let i = 0;
        for (i = 0; i < t.path.length; i++) arr.push(t.path[i]);
        return arr;
      })(),
      type: t.type,
      byContext: copyByCtx,
      description: t.description,
      extensions: t.extensions
    };
  }
  function collectContextsFromGraph(graph) {
    const seen = [];
    let i = 0;
    for (i = 0; i < graph.tokens.length; i++) {
      const t = graph.tokens[i];
      const ks = keysOf2(t.byContext);
      let j = 0;
      for (j = 0; j < ks.length; j++) {
        const ctx = ks[j];
        let already = false;
        let k = 0;
        for (k = 0; k < seen.length; k++)
          if (seen[k] === ctx) {
            already = true;
            break;
          }
        if (!already) seen.push(ctx);
      }
    }
    return seen;
  }
  function sanitizeContexts(list) {
    if (!list) return [];
    const out = [];
    for (let i = 0; i < list.length; i++) {
      const raw = list[i];
      if (typeof raw !== "string") continue;
      const trimmed = raw.trim();
      if (!trimmed) continue;
      let exists = false;
      for (let j = 0; j < out.length; j++)
        if (out[j] === trimmed) {
          exists = true;
          break;
        }
      if (!exists) out.push(trimmed);
    }
    return out;
  }
  function filterGraphByContexts(graph, requested) {
    const available = collectContextsFromGraph(graph);
    const requestedList = sanitizeContexts(requested);
    const availableSet = {};
    for (let ai = 0; ai < available.length; ai++)
      availableSet[available[ai]] = true;
    const appliedSet = {};
    const missingRequested = [];
    let fallbackToAll = false;
    if (requestedList.length > 0) {
      for (let ri = 0; ri < requestedList.length; ri++) {
        const ctx = requestedList[ri];
        if (availableSet[ctx]) appliedSet[ctx] = true;
        else missingRequested.push(ctx);
      }
      if (Object.keys(appliedSet).length === 0 && available.length > 0) {
        fallbackToAll = true;
        for (let ai2 = 0; ai2 < available.length; ai2++)
          appliedSet[available[ai2]] = true;
      }
    } else {
      for (let ai3 = 0; ai3 < available.length; ai3++)
        appliedSet[available[ai3]] = true;
    }
    const appliedList = [];
    for (const ctxKey2 in appliedSet)
      if (Object.prototype.hasOwnProperty.call(appliedSet, ctxKey2))
        appliedList.push(ctxKey2);
    appliedList.sort();
    const skippedList = [];
    for (let si = 0; si < available.length; si++) {
      const ctxAvailable = available[si];
      if (!appliedSet[ctxAvailable]) {
        skippedList.push({
          context: ctxAvailable,
          reason: "Excluded by partial import selection"
        });
      }
    }
    skippedList.sort(function(a, b) {
      if (a.context === b.context) return 0;
      return a.context < b.context ? -1 : 1;
    });
    const filteredTokens = [];
    const removedTokens = [];
    for (let ti = 0; ti < graph.tokens.length; ti++) {
      const tok = graph.tokens[ti];
      const ctxs = keysOf2(tok.byContext);
      if (ctxs.length === 0) {
        const cloneEmpty = {
          path: tok.path.slice(),
          type: tok.type,
          byContext: {}
        };
        if (typeof tok.description !== "undefined")
          cloneEmpty.description = tok.description;
        if (typeof tok.extensions !== "undefined")
          cloneEmpty.extensions = tok.extensions;
        filteredTokens.push(cloneEmpty);
        continue;
      }
      const kept = [];
      const removed = [];
      const newCtx = {};
      for (let ci = 0; ci < ctxs.length; ci++) {
        const ctx = ctxs[ci];
        if (appliedSet[ctx]) {
          kept.push(ctx);
          newCtx[ctx] = tok.byContext[ctx];
        } else {
          removed.push(ctx);
        }
      }
      if (kept.length === 0) {
        removedTokens.push({
          path: tok.path.join("/"),
          removedContexts: removed.slice(),
          keptContexts: [],
          reason: "removed"
        });
        continue;
      }
      if (removed.length > 0) {
        removedTokens.push({
          path: tok.path.join("/"),
          removedContexts: removed.slice(),
          keptContexts: kept.slice(),
          reason: "partial"
        });
      }
      const clone = {
        path: tok.path.slice(),
        type: tok.type,
        byContext: newCtx
      };
      if (typeof tok.description !== "undefined")
        clone.description = tok.description;
      if (typeof tok.extensions !== "undefined")
        clone.extensions = tok.extensions;
      filteredTokens.push(clone);
    }
    removedTokens.sort(function(a, b) {
      if (a.path === b.path) return 0;
      return a.path < b.path ? -1 : 1;
    });
    return {
      graph: { tokens: filteredTokens },
      summary: {
        totalTokens: graph.tokens.length,
        importedTokens: filteredTokens.length,
        createdStyles: 0,
        availableContexts: available.slice().sort(),
        appliedContexts: appliedList,
        skippedContexts: skippedList,
        missingRequestedContexts: missingRequested,
        selectionRequested: requestedList,
        selectionFallbackToAll: fallbackToAll ? true : void 0,
        tokensWithRemovedContexts: removedTokens
      }
    };
  }
  async function importDtcg(json, opts = {}) {
    const desired = normalize(
      readDtcgToIR(json, { allowHexStrings: !!opts.allowHexStrings })
    );
    const filtered = filterGraphByContexts(desired, opts.contexts || []);
    const writeResult = await writeIRToFigma(filtered.graph);
    filtered.summary.createdStyles = writeResult.createdTextStyles;
    return filtered.summary;
  }
  async function exportDtcg(opts) {
    const current = await readFigmaToIR();
    const graph = normalize(current);
    const styleDictionary = !!opts.styleDictionary;
    const flatTokens = !!opts.flatTokens;
    if (opts.format === "typography") {
      const typographyTokens = [];
      for (let ti = 0; ti < graph.tokens.length; ti++) {
        const tok = graph.tokens[ti];
        if (tok.type === "typography") {
          const cloneTypo = {
            path: tok.path.slice(),
            type: tok.type,
            byContext: {}
          };
          const ctxKeys = keysOf2(tok.byContext);
          for (let ci2 = 0; ci2 < ctxKeys.length; ci2++) {
            const ctx = ctxKeys[ci2];
            cloneTypo.byContext[ctx] = tok.byContext[ctx];
          }
          if (typeof tok.description !== "undefined")
            cloneTypo.description = tok.description;
          if (typeof tok.extensions !== "undefined")
            cloneTypo.extensions = tok.extensions;
          typographyTokens.push(cloneTypo);
        }
      }
      const typographyGraph = { tokens: typographyTokens };
      const typographySerialized = serialize(typographyGraph, {
        styleDictionary,
        flatTokens
      });
      let typographyJson = typographySerialized.json;
      if (!typographyTokens.length) {
        typographyJson = {};
      }
      return { files: [{ name: "typography.json", json: typographyJson }] };
    }
    if (opts.format === "single") {
      const single = serialize(graph, {
        styleDictionary,
        flatTokens
      });
      return { files: [{ name: "tokens.json", json: single.json }] };
    }
    const contexts = [];
    let i = 0;
    for (i = 0; i < graph.tokens.length; i++) {
      const t = graph.tokens[i];
      const ks = keysOf2(t.byContext);
      let j = 0;
      for (j = 0; j < ks.length; j++) {
        const c = ks[j];
        let found = false;
        let k = 0;
        for (k = 0; k < contexts.length; k++)
          if (contexts[k] === c) {
            found = true;
            break;
          }
        if (!found) contexts.push(c);
      }
    }
    const files = [];
    let ci = 0;
    for (ci = 0; ci < contexts.length; ci++) {
      const ctx = contexts[ci];
      const filtered = { tokens: [] };
      let ii = 0;
      for (ii = 0; ii < graph.tokens.length; ii++) {
        const tok = graph.tokens[ii];
        const one = cloneTokenWithSingleContext(tok, ctx);
        if (one) filtered.tokens.push(one);
      }
      if (filtered.tokens.length === 0) continue;
      const out = serialize(filtered, {
        styleDictionary,
        flatTokens
      });
      let collection = ctx;
      let mode = "default";
      let haveCollection = false;
      let haveMode = false;
      for (ii = 0; ii < filtered.tokens.length && (!haveCollection || !haveMode); ii++) {
        const tok = filtered.tokens[ii];
        if (!tok || !tok.extensions) continue;
        const figmaExt = tok.extensions["com.figma"];
        if (!figmaExt || typeof figmaExt !== "object") continue;
        const perCtx = figmaExt.perContext;
        if (!perCtx || typeof perCtx !== "object") continue;
        const ctxMeta = perCtx[ctx];
        if (!ctxMeta || typeof ctxMeta !== "object") continue;
        const ctxCollection = ctxMeta.collectionName;
        const ctxMode = ctxMeta.modeName;
        if (typeof ctxCollection === "string" && !haveCollection) {
          collection = ctxCollection;
          haveCollection = true;
        }
        if (typeof ctxMode === "string" && !haveMode) {
          mode = ctxMode;
          haveMode = true;
        }
      }
      if (!haveCollection || !haveMode) {
        const slash = ctx.lastIndexOf("/");
        collection = slash >= 0 ? ctx.substring(0, slash) : ctx;
        mode = slash >= 0 ? ctx.substring(slash + 1) : "default";
      }
      const fname = sanitizeForFile(collection) + "_mode=" + sanitizeForFile(mode) + ".tokens.json";
      files.push({ name: fname, json: out.json });
    }
    if (files.length === 0) {
      const fallback = serialize(graph, {
        styleDictionary,
        flatTokens
      });
      files.push({ name: "tokens.json", json: fallback.json });
    }
    return { files };
  }

  // src/core/github/api.ts
  function headerGet(h, key) {
    try {
      if (h && typeof h.get === "function") return h.get(key);
    } catch (e) {
    }
    return null;
  }
  function parseRate(h) {
    const remainingStr = headerGet(h, "x-ratelimit-remaining");
    const resetStr = headerGet(h, "x-ratelimit-reset");
    const rate = {};
    const rem = remainingStr ? parseInt(remainingStr, 10) : NaN;
    const rst = resetStr ? parseInt(resetStr, 10) : NaN;
    if (Number.isFinite(rem)) rate.remaining = rem;
    if (Number.isFinite(rst)) rate.resetEpochSec = rst;
    return rate.remaining !== void 0 || rate.resetEpochSec !== void 0 ? rate : void 0;
  }
  async function safeText(res) {
    try {
      return await res.text();
    } catch (e) {
      return "";
    }
  }
  function b64(s) {
    try {
      return btoa(unescape(encodeURIComponent(s)));
    } catch (e) {
      const enc = new TextEncoder();
      const bytes = enc.encode(s);
      let bin = "";
      for (let i = 0; i < bytes.length; i++)
        bin += String.fromCharCode(bytes[i]);
      return btoa(bin);
    }
  }
  var INVALID_REPO_SEGMENT = /[<>:"\\|?*\u0000-\u001F]/;
  function sanitizeRepoPathInput(path) {
    const collapsed = String(path || "").replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^\/+|\/+$/g, "");
    if (!collapsed) return { ok: true, path: "" };
    const segments = collapsed.split("/").filter(Boolean);
    for (const seg of segments) {
      if (!seg)
        return { ok: false, message: "Path contains an empty segment." };
      if (seg === "." || seg === "..") {
        return {
          ok: false,
          message: 'Path cannot include "." or ".." segments.'
        };
      }
      if (INVALID_REPO_SEGMENT.test(seg)) {
        return {
          ok: false,
          message: `Path component "${seg}" contains invalid characters.`
        };
      }
    }
    return { ok: true, path: segments.join("/") };
  }
  function encodePathSegments(path) {
    const sanitized = sanitizeRepoPathInput(path);
    if (!sanitized.ok) throw new Error(sanitized.message);
    if (!sanitized.path) return "";
    return sanitized.path.split("/").map(encodeURIComponent).join("/");
  }
  function decodeBase64ToUtf8(rawInput) {
    const cleaned = typeof rawInput === "string" ? rawInput.trim() : "";
    if (!cleaned) return "";
    const stripWhitespace = cleaned.replace(/\s+/g, "");
    if (!stripWhitespace) return "";
    const decodeBytes = (bytes) => {
      if (typeof TextDecoder !== "undefined") {
        try {
          return new TextDecoder().decode(bytes);
        } catch (e) {
        }
      }
      let text = "";
      for (let i = 0; i < bytes.length; i++)
        text += String.fromCharCode(bytes[i]);
      try {
        return decodeURIComponent(escape(text));
      } catch (e) {
        return text;
      }
    };
    if (typeof figma !== "undefined" && typeof figma.base64Decode === "function") {
      try {
        return decodeBytes(figma.base64Decode(stripWhitespace));
      } catch (e) {
      }
    }
    if (typeof atob === "function") {
      try {
        const bin = atob(stripWhitespace);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        return decodeBytes(bytes);
      } catch (e) {
        try {
          return decodeURIComponent(escape(atob(stripWhitespace)));
        } catch (e2) {
        }
      }
    }
    const maybeBuffer = globalThis.Buffer;
    if (maybeBuffer && typeof maybeBuffer.from === "function") {
      try {
        return maybeBuffer.from(stripWhitespace, "base64").toString("utf8");
      } catch (e) {
      }
    }
    return "";
  }
  async function ghGetUser(token) {
    try {
      const res = await fetch("https://api.github.com/user", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28"
        }
      });
      if (res.status === 401) return { ok: false, error: "bad credentials" };
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const data = await res.json();
      const login = typeof (data == null ? void 0 : data.login) === "string" ? data.login : "";
      const name = typeof (data == null ? void 0 : data.name) === "string" ? data.name : void 0;
      if (!login) return { ok: false, error: "response missing login" };
      return { ok: true, user: { login, name } };
    } catch (e) {
      return { ok: false, error: (e == null ? void 0 : e.message) || "network error" };
    }
  }
  async function fetchJsonWithRetry(url, init, tries = 2) {
    let last;
    for (let i = 0; i < tries; i++) {
      try {
        return await fetch(url, init);
      } catch (e) {
        last = e;
        await new Promise((r) => setTimeout(r, 150));
      }
    }
    throw last;
  }
  async function ghListRepos(token) {
    try {
      const base = "https://api.github.com/user/repos?per_page=100&affiliation=owner,collaborator,organization_member&sort=updated";
      const headers = {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      };
      const all = [];
      let page = 1;
      while (true) {
        const res = await fetchJsonWithRetry(
          `${base}&page=${page}`,
          { headers },
          2
        );
        if (res.status === 401)
          return { ok: false, error: "bad credentials" };
        if (!res.ok) {
          if (all.length) return { ok: true, repos: all };
          return {
            ok: false,
            error: await res.text() || `HTTP ${res.status}`
          };
        }
        const arr = await res.json();
        if (!Array.isArray(arr) || arr.length === 0) break;
        for (const r of arr) {
          if (r == null ? void 0 : r.full_name) {
            all.push({
              id: r.id,
              name: r.name,
              full_name: r.full_name,
              private: !!r.private,
              default_branch: r.default_branch || "main",
              owner: r.owner,
              permissions: r.permissions,
              fork: r.fork
            });
          }
        }
        if (arr.length < 100) break;
        page++;
      }
      return { ok: true, repos: all };
    } catch (e) {
      return { ok: false, error: (e == null ? void 0 : e.message) || "network error" };
    }
  }
  async function ghListBranches(token, owner, repo, page = 1, force = false) {
    const baseRepoUrl = `https://api.github.com/repos/${owner}/${repo}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    const ts = force ? `&_ts=${Date.now()}` : "";
    try {
      const branchesUrl = `${baseRepoUrl}/branches?per_page=100&page=${page}${ts}`;
      const res = await fetch(branchesUrl, { headers });
      const rate = parseRate(res == null ? void 0 : res.headers);
      const saml = headerGet(res == null ? void 0 : res.headers, "x-github-saml");
      if (res.status === 403 && saml) {
        return {
          ok: false,
          owner,
          repo,
          status: 403,
          message: "SAML/SSO required",
          samlRequired: true,
          rate
        };
      }
      if (!res.ok) {
        const text = await safeText(res);
        return {
          ok: false,
          owner,
          repo,
          status: res.status,
          message: text || `HTTP ${res.status}`,
          rate
        };
      }
      const arr = await res.json();
      const branches = Array.isArray(arr) ? arr.filter((b) => b && typeof b.name === "string").map((b) => ({ name: b.name })) : [];
      const link = headerGet(res == null ? void 0 : res.headers, "link");
      let hasMore = false;
      if (link && /\brel="next"/i.test(link)) hasMore = true;
      else if (branches.length === 100) hasMore = true;
      let defaultBranch;
      if (page === 1) {
        try {
          const repoRes = await fetch(
            `${baseRepoUrl}${force ? `?_ts=${Date.now()}` : ""}`,
            { headers }
          );
          if (repoRes.ok) {
            const j = await repoRes.json();
            if (j && typeof j.default_branch === "string")
              defaultBranch = j.default_branch;
          }
        } catch (e) {
        }
      }
      return {
        ok: true,
        owner,
        repo,
        page,
        branches,
        defaultBranch,
        hasMore,
        rate
      };
    } catch (e) {
      return {
        ok: false,
        owner,
        repo,
        status: 0,
        message: (e == null ? void 0 : e.message) || "network error"
      };
    }
  }
  async function ghCreateBranch(token, owner, repo, newBranch, baseBranch) {
    var _a, _b;
    const baseRepoUrl = `https://api.github.com/repos/${owner}/${repo}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    const branchName = String(newBranch || "").trim().replace(/^refs\/heads\//, "");
    const baseName = String(baseBranch || "").trim().replace(/^refs\/heads\//, "");
    if (!branchName || !baseName) {
      return {
        ok: false,
        owner,
        repo,
        baseBranch: baseName,
        newBranch: branchName,
        status: 400,
        message: "empty branch name(s)"
      };
    }
    try {
      try {
        const repoRes = await fetch(baseRepoUrl, { headers });
        const rate0 = parseRate(repoRes == null ? void 0 : repoRes.headers);
        const saml0 = headerGet(repoRes == null ? void 0 : repoRes.headers, "x-github-saml");
        if (repoRes.status === 403 && saml0) {
          return {
            ok: false,
            owner,
            repo,
            baseBranch: baseName,
            newBranch: branchName,
            status: 403,
            message: "SAML/SSO required",
            samlRequired: true,
            rate: rate0
          };
        }
        if (!repoRes.ok) {
          const text = await safeText(repoRes);
          return {
            ok: false,
            owner,
            repo,
            baseBranch: baseName,
            newBranch: branchName,
            status: repoRes.status,
            message: text || `HTTP ${repoRes.status}`
          };
        }
        const repoJson = await repoRes.json();
        const pushAllowed = !!((_a = repoJson == null ? void 0 : repoJson.permissions) == null ? void 0 : _a.push);
        if ((repoJson == null ? void 0 : repoJson.permissions) && pushAllowed !== true) {
          return {
            ok: false,
            owner,
            repo,
            baseBranch: baseName,
            newBranch: branchName,
            status: 403,
            message: "Token/user lacks push permission to this repository",
            noPushPermission: true,
            rate: rate0
          };
        }
      } catch (e) {
      }
      const refUrl = `${baseRepoUrl}/git/ref/heads/${encodeURIComponent(
        baseName
      )}`;
      const refRes = await fetch(refUrl, { headers });
      const rate1 = parseRate(refRes == null ? void 0 : refRes.headers);
      const saml1 = headerGet(refRes == null ? void 0 : refRes.headers, "x-github-saml");
      if (refRes.status === 403 && saml1) {
        return {
          ok: false,
          owner,
          repo,
          baseBranch: baseName,
          newBranch: branchName,
          status: 403,
          message: "SAML/SSO required",
          samlRequired: true,
          rate: rate1
        };
      }
      if (!refRes.ok) {
        const text = await safeText(refRes);
        return {
          ok: false,
          owner,
          repo,
          baseBranch: baseName,
          newBranch: branchName,
          status: refRes.status,
          message: text || `HTTP ${refRes.status}`,
          rate: rate1
        };
      }
      const refJson = await refRes.json();
      const sha = (((_b = refJson == null ? void 0 : refJson.object) == null ? void 0 : _b.sha) || (refJson == null ? void 0 : refJson.sha) || "").trim();
      if (!sha) {
        return {
          ok: false,
          owner,
          repo,
          baseBranch: baseName,
          newBranch: branchName,
          status: 500,
          message: "could not resolve base SHA"
        };
      }
      const createUrl = `${baseRepoUrl}/git/refs`;
      const body = JSON.stringify({ ref: `refs/heads/${branchName}`, sha });
      const createRes = await fetch(createUrl, {
        method: "POST",
        headers,
        body
      });
      const rate2 = parseRate(createRes == null ? void 0 : createRes.headers);
      const saml2 = headerGet(createRes == null ? void 0 : createRes.headers, "x-github-saml");
      if (createRes.status === 403 && saml2) {
        return {
          ok: false,
          owner,
          repo,
          baseBranch: baseName,
          newBranch: branchName,
          status: 403,
          message: "SAML/SSO required",
          samlRequired: true,
          rate: rate2
        };
      }
      if (!createRes.ok) {
        const text = await safeText(createRes);
        return {
          ok: false,
          owner,
          repo,
          baseBranch: baseName,
          newBranch: branchName,
          status: createRes.status,
          message: text || `HTTP ${createRes.status}`,
          rate: rate2
        };
      }
      const html_url = `https://github.com/${owner}/${repo}/tree/${encodeURIComponent(
        branchName
      )}`;
      return {
        ok: true,
        owner,
        repo,
        baseBranch: baseName,
        newBranch: branchName,
        sha,
        html_url,
        rate: rate2
      };
    } catch (e) {
      return {
        ok: false,
        owner,
        repo,
        baseBranch: baseName,
        newBranch: branchName,
        status: 0,
        message: (e == null ? void 0 : e.message) || "network error"
      };
    }
  }
  async function ghListDir(token, owner, repo, path, ref) {
    const baseRepoUrl = `https://api.github.com/repos/${owner}/${repo}`;
    const sanitized = sanitizeRepoPathInput(path);
    if (!sanitized.ok) {
      return {
        ok: false,
        owner,
        repo,
        ref,
        path: String(path || "").replace(/^\/+|\/+$/g, ""),
        status: 400,
        message: sanitized.message
      };
    }
    const rel = sanitized.path ? sanitized.path.split("/").map(encodeURIComponent).join("/") : "";
    const canonicalPath2 = sanitized.path;
    const url = rel ? `${baseRepoUrl}/contents/${rel}?ref=${encodeURIComponent(
      ref
    )}&_ts=${Date.now()}` : `${baseRepoUrl}/contents?ref=${encodeURIComponent(
      ref
    )}&_ts=${Date.now()}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    try {
      const res = await fetch(url, { headers });
      const rate = parseRate(res == null ? void 0 : res.headers);
      if (!res.ok) {
        const msg = await safeText(res);
        return {
          ok: false,
          owner,
          repo,
          ref,
          path: canonicalPath2,
          status: res.status,
          message: msg || `HTTP ${res.status}`,
          rate
        };
      }
      const json = await res.json();
      if (!Array.isArray(json)) {
        const type = typeof (json == null ? void 0 : json.type) === "string" ? json.type : "";
        const status = type === "file" ? 409 : 400;
        const message = type === "file" ? "GitHub: Path is a file, not a folder." : "GitHub: Unable to list path as a folder.";
        return {
          ok: false,
          owner,
          repo,
          ref,
          path: canonicalPath2,
          status,
          message,
          rate
        };
      }
      const entries = json.map((it) => ({
        type: (it == null ? void 0 : it.type) === "dir" ? "dir" : "file",
        name: String((it == null ? void 0 : it.name) || ""),
        path: String((it == null ? void 0 : it.path) || "")
      }));
      return {
        ok: true,
        owner,
        repo,
        ref,
        path: canonicalPath2,
        entries,
        rate
      };
    } catch (e) {
      return {
        ok: false,
        owner,
        repo,
        ref,
        path: canonicalPath2,
        status: 0,
        message: (e == null ? void 0 : e.message) || "network error"
      };
    }
  }
  async function ghListDirs(token, owner, repo, branch, path = "") {
    const res = await ghListDir(token, owner, repo, path, branch);
    if (!res.ok) {
      return {
        ok: false,
        owner,
        repo,
        branch,
        path: res.path,
        status: res.status,
        message: res.message,
        samlRequired: /SAML|SSO/i.test(res.message || "") || res.status === 403
      };
    }
    const onlyDirs = res.entries.filter((e) => e.type === "dir");
    return {
      ok: true,
      owner,
      repo,
      branch,
      path: res.path,
      entries: onlyDirs,
      dirs: onlyDirs.map((d) => ({ name: d.name, path: d.path })),
      rate: res.rate
    };
  }
  async function ghEnsureFolder(token, owner, repo, branch, folderPath) {
    var _a, _b;
    const baseRepoUrl = `https://api.github.com/repos/${owner}/${repo}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    const sanitized = sanitizeRepoPathInput(folderPath);
    if (!sanitized.ok) {
      return {
        ok: false,
        owner,
        repo,
        branch,
        folderPath: "",
        status: 400,
        message: sanitized.message
      };
    }
    const norm = sanitized.path;
    if (!norm) {
      return {
        ok: false,
        owner,
        repo,
        branch,
        folderPath: norm,
        status: 400,
        message: "empty folder path"
      };
    }
    try {
      {
        const rel = encodePathSegments(norm);
        const url = `${baseRepoUrl}/contents/${rel}?ref=${encodeURIComponent(
          branch
        )}&_ts=${Date.now()}`;
        const res = await fetch(url, { headers });
        const rate = parseRate(res == null ? void 0 : res.headers);
        const saml = headerGet(res == null ? void 0 : res.headers, "x-github-saml");
        if (res.status === 403 && saml) {
          return {
            ok: false,
            owner,
            repo,
            branch,
            folderPath: norm,
            status: 403,
            message: "SAML/SSO required",
            samlRequired: true,
            rate
          };
        }
        if (res.ok) {
          return {
            ok: true,
            owner,
            repo,
            branch,
            folderPath: norm,
            created: false,
            html_url: `https://github.com/${owner}/${repo}/tree/${encodeURIComponent(
              branch
            )}/${encodePathSegments(norm)}`,
            rate
          };
        }
        if (res.status !== 404) {
          const text = await safeText(res);
          return {
            ok: false,
            owner,
            repo,
            branch,
            folderPath: norm,
            status: res.status,
            message: text || `HTTP ${res.status}`,
            rate
          };
        }
      }
      const placeholderRel = `${norm}/.gitkeep`;
      const putUrl = `${baseRepoUrl}/contents/${encodePathSegments(
        placeholderRel
      )}`;
      const body = JSON.stringify({
        message: `chore: create folder ${norm}`,
        content: b64("."),
        branch
      });
      const putRes = await fetch(putUrl, { method: "PUT", headers, body });
      const rate2 = parseRate(putRes == null ? void 0 : putRes.headers);
      const saml2 = headerGet(putRes == null ? void 0 : putRes.headers, "x-github-saml");
      if (putRes.status === 403 && saml2) {
        return {
          ok: false,
          owner,
          repo,
          branch,
          folderPath: norm,
          status: 403,
          message: "SAML/SSO required",
          samlRequired: true,
          rate: rate2
        };
      }
      if (!putRes.ok) {
        const text = await safeText(putRes);
        return {
          ok: false,
          owner,
          repo,
          branch,
          folderPath: norm,
          status: putRes.status,
          message: text || `HTTP ${putRes.status}`,
          rate: rate2
        };
      }
      const j = await putRes.json();
      const fileSha = ((_a = j == null ? void 0 : j.content) == null ? void 0 : _a.sha) || ((_b = j == null ? void 0 : j.commit) == null ? void 0 : _b.sha) || "";
      return {
        ok: true,
        owner,
        repo,
        branch,
        folderPath: norm,
        created: true,
        fileSha,
        html_url: `https://github.com/${owner}/${repo}/tree/${encodeURIComponent(
          branch
        )}/${encodePathSegments(norm)}`,
        rate: rate2
      };
    } catch (e) {
      return {
        ok: false,
        owner,
        repo,
        branch,
        folderPath: norm,
        status: 0,
        message: (e == null ? void 0 : e.message) || "network error"
      };
    }
  }
  async function ghCommitFiles(token, owner, repo, branch, message, files) {
    var _a, _b;
    const base = `https://api.github.com/repos/${owner}/${repo}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    function normPath(p) {
      const sanitized = sanitizeRepoPathInput(p);
      if (!sanitized.ok) throw new Error(sanitized.message);
      return sanitized.path;
    }
    const cleaned = [];
    for (let i = 0; i < files.length; i++) {
      const src = files[i];
      let normalizedPath;
      try {
        normalizedPath = normPath(src.path);
      } catch (err) {
        return {
          ok: false,
          owner,
          repo,
          branch,
          status: 400,
          message: (err == null ? void 0 : err.message) || "invalid path"
        };
      }
      if (!normalizedPath) continue;
      if (typeof src.content !== "string") continue;
      cleaned.push({
        path: normalizedPath,
        content: src.content,
        mode: src.mode || "100644"
      });
    }
    if (cleaned.length === 0) {
      return {
        ok: false,
        owner,
        repo,
        branch,
        status: 400,
        message: "no files to commit"
      };
    }
    try {
      const cacheBust = `_ts=${Date.now()}`;
      const refRes = await fetch(
        `${base}/git/ref/heads/${encodeURIComponent(branch)}?${cacheBust}`,
        { headers }
      );
      const rate1 = parseRate(refRes == null ? void 0 : refRes.headers);
      if (!refRes.ok) {
        const text = await safeText(refRes);
        return {
          ok: false,
          owner,
          repo,
          branch,
          status: refRes.status,
          message: text || `HTTP ${refRes.status}`,
          rate: rate1
        };
      }
      const refJson = await refRes.json();
      const baseCommitSha = (((_a = refJson == null ? void 0 : refJson.object) == null ? void 0 : _a.sha) || (refJson == null ? void 0 : refJson.sha) || "").trim();
      if (!baseCommitSha) {
        return {
          ok: false,
          owner,
          repo,
          branch,
          status: 500,
          message: "could not resolve branch commit sha",
          rate: rate1
        };
      }
      const commitRes = await fetch(
        `${base}/git/commits/${baseCommitSha}?${cacheBust}`,
        { headers }
      );
      const rate2 = parseRate(commitRes == null ? void 0 : commitRes.headers);
      if (!commitRes.ok) {
        const text = await safeText(commitRes);
        return {
          ok: false,
          owner,
          repo,
          branch,
          status: commitRes.status,
          message: text || `HTTP ${commitRes.status}`,
          rate: rate2
        };
      }
      const commitJson = await commitRes.json();
      const baseTreeSha = (((_b = commitJson == null ? void 0 : commitJson.tree) == null ? void 0 : _b.sha) || "").trim();
      if (!baseTreeSha) {
        return {
          ok: false,
          owner,
          repo,
          branch,
          status: 500,
          message: "could not resolve base tree sha",
          rate: rate2
        };
      }
      const blobShas = [];
      for (let i = 0; i < cleaned.length; i++) {
        const blobRes = await fetch(`${base}/git/blobs`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            content: cleaned[i].content,
            encoding: "utf-8"
          })
        });
        const rateB = parseRate(blobRes == null ? void 0 : blobRes.headers);
        if (!blobRes.ok) {
          const text = await safeText(blobRes);
          return {
            ok: false,
            owner,
            repo,
            branch,
            status: blobRes.status,
            message: text || `HTTP ${blobRes.status}`,
            rate: rateB
          };
        }
        const blobJson = await blobRes.json();
        const blobSha = ((blobJson == null ? void 0 : blobJson.sha) || "").trim();
        if (!blobSha) {
          return {
            ok: false,
            owner,
            repo,
            branch,
            status: 500,
            message: "failed to create blob sha"
          };
        }
        blobShas.push(blobSha);
      }
      const treeEntries = cleaned.map((f, idx) => ({
        path: f.path,
        type: "blob",
        mode: f.mode,
        sha: blobShas[idx]
      }));
      const treeRes = await fetch(`${base}/git/trees`, {
        method: "POST",
        headers,
        body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries })
      });
      const rate3 = parseRate(treeRes == null ? void 0 : treeRes.headers);
      if (!treeRes.ok) {
        const text = await safeText(treeRes);
        return {
          ok: false,
          owner,
          repo,
          branch,
          status: treeRes.status,
          message: text || `HTTP ${treeRes.status}`,
          rate: rate3
        };
      }
      const treeJson = await treeRes.json();
      const newTreeSha = ((treeJson == null ? void 0 : treeJson.sha) || "").trim();
      if (!newTreeSha) {
        return {
          ok: false,
          owner,
          repo,
          branch,
          status: 500,
          message: "failed to create tree sha"
        };
      }
      const commitCreateRes = await fetch(`${base}/git/commits`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          message,
          tree: newTreeSha,
          parents: [baseCommitSha]
        })
      });
      const rate4 = parseRate(commitCreateRes == null ? void 0 : commitCreateRes.headers);
      if (!commitCreateRes.ok) {
        const text = await safeText(commitCreateRes);
        return {
          ok: false,
          owner,
          repo,
          branch,
          status: commitCreateRes.status,
          message: text || `HTTP ${commitCreateRes.status}`,
          rate: rate4
        };
      }
      const newCommit = await commitCreateRes.json();
      const newCommitSha = ((newCommit == null ? void 0 : newCommit.sha) || "").trim();
      if (!newCommitSha) {
        return {
          ok: false,
          owner,
          repo,
          branch,
          status: 500,
          message: "failed to create commit sha"
        };
      }
      const updateRefRes = await fetch(
        `${base}/git/refs/heads/${encodeURIComponent(branch)}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({ sha: newCommitSha, force: false })
        }
      );
      const rate5 = parseRate(updateRefRes == null ? void 0 : updateRefRes.headers);
      if (!updateRefRes.ok) {
        const text = await safeText(updateRefRes);
        return {
          ok: false,
          owner,
          repo,
          branch,
          status: updateRefRes.status,
          message: text || `HTTP ${updateRefRes.status}`,
          rate: rate5
        };
      }
      return {
        ok: true,
        owner,
        repo,
        branch,
        commitSha: newCommitSha,
        commitUrl: `https://github.com/${owner}/${repo}/commit/${newCommitSha}`,
        treeUrl: `https://github.com/${owner}/${repo}/tree/${encodeURIComponent(
          branch
        )}`,
        rate: rate5
      };
    } catch (e) {
      return {
        ok: false,
        owner,
        repo,
        branch,
        status: 0,
        message: (e == null ? void 0 : e.message) || "network error"
      };
    }
  }
  async function ghGetFileContents(token, owner, repo, branch, path) {
    const sanitized = sanitizeRepoPathInput(path);
    if (!sanitized.ok) {
      return {
        ok: false,
        owner,
        repo,
        branch,
        path: "",
        status: 400,
        message: sanitized.message
      };
    }
    if (!sanitized.path) {
      return {
        ok: false,
        owner,
        repo,
        branch,
        path: "",
        status: 400,
        message: "Empty path"
      };
    }
    const cleanPath = sanitized.path;
    const base = `https://api.github.com/repos/${owner}/${repo}/contents/${cleanPath.split("/").map(encodeURIComponent).join("/")}`;
    const url = `${base}?ref=${encodeURIComponent(branch)}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    try {
      const res = await fetch(url, { headers });
      const rate = parseRate(res == null ? void 0 : res.headers);
      const saml = headerGet(res == null ? void 0 : res.headers, "x-github-saml");
      if (res.status === 403 && saml) {
        return {
          ok: false,
          owner,
          repo,
          branch,
          path: cleanPath,
          status: 403,
          message: "SAML/SSO required",
          samlRequired: true,
          rate
        };
      }
      if (!res.ok) {
        const text2 = await safeText(res);
        return {
          ok: false,
          owner,
          repo,
          branch,
          path: cleanPath,
          status: res.status,
          message: text2 || `HTTP ${res.status}`,
          rate
        };
      }
      const json = await res.json();
      if (Array.isArray(json)) {
        return {
          ok: false,
          owner,
          repo,
          branch,
          path: cleanPath,
          status: 409,
          message: "Path refers to a directory. Provide a file path.",
          rate,
          isDirectory: true
        };
      }
      const encoding = typeof (json == null ? void 0 : json.encoding) === "string" ? json.encoding : "";
      const content = typeof (json == null ? void 0 : json.content) === "string" ? json.content : "";
      const sha = typeof (json == null ? void 0 : json.sha) === "string" ? json.sha : "";
      const size = typeof (json == null ? void 0 : json.size) === "number" ? json.size : void 0;
      if (!content) {
        return {
          ok: false,
          owner,
          repo,
          branch,
          path: cleanPath,
          status: 422,
          message: "File had no content",
          rate
        };
      }
      let text = content;
      if (encoding === "base64") {
        text = decodeBase64ToUtf8(content.replace(/\s+/g, ""));
      }
      return {
        ok: true,
        owner,
        repo,
        branch,
        path: cleanPath,
        sha,
        size,
        contentText: text,
        encoding,
        rate
      };
    } catch (e) {
      return {
        ok: false,
        owner,
        repo,
        branch,
        path: cleanPath,
        status: 0,
        message: (e == null ? void 0 : e.message) || "network error"
      };
    }
  }
  async function ghCreatePullRequest(token, owner, repo, params) {
    const url = `https://api.github.com/repos/${owner}/${repo}/pulls`;
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    const title = String(params.title || "").trim();
    const head = String(params.head || "").trim();
    const base = String(params.base || "").trim();
    const body = typeof params.body === "string" && params.body.length ? params.body : void 0;
    if (!title || !head || !base) {
      return {
        ok: false,
        owner,
        repo,
        base,
        head,
        status: 400,
        message: "missing PR parameters"
      };
    }
    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({ title, head, base, body })
      });
      const rate = parseRate(res == null ? void 0 : res.headers);
      const saml = headerGet(res == null ? void 0 : res.headers, "x-github-saml");
      if (res.status === 403 && saml) {
        return {
          ok: false,
          owner,
          repo,
          base,
          head,
          status: 403,
          message: "SAML/SSO required",
          samlRequired: true,
          rate
        };
      }
      if (!res.ok) {
        const text = await safeText(res);
        const msg = text || `HTTP ${res.status}`;
        const already = res.status === 422 && /already exists/i.test(msg);
        return {
          ok: false,
          owner,
          repo,
          base,
          head,
          status: res.status,
          message: msg,
          rate,
          alreadyExists: already
        };
      }
      const json = await res.json();
      const number = typeof (json == null ? void 0 : json.number) === "number" ? json.number : 0;
      const prUrl = typeof (json == null ? void 0 : json.html_url) === "string" ? json.html_url : "";
      if (!number || !prUrl) {
        return {
          ok: false,
          owner,
          repo,
          base,
          head,
          status: 500,
          message: "invalid PR response",
          rate
        };
      }
      return { ok: true, owner, repo, base, head, number, url: prUrl, rate };
    } catch (e) {
      return {
        ok: false,
        owner,
        repo,
        base,
        head,
        status: 0,
        message: (e == null ? void 0 : e.message) || "network error"
      };
    }
  }

  // src/app/github/folders.ts
  var INVALID_FOLDER_SEGMENT = /[<>:"\\|?*\u0000-\u001F]/;
  function validateFolderSegments(segments) {
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (!seg) return "GitHub: Folder path has an empty segment.";
      if (seg === "." || seg === "..") {
        return 'GitHub: Folder path cannot include "." or ".." segments.';
      }
      if (INVALID_FOLDER_SEGMENT.test(seg)) {
        return `GitHub: Folder segment "${seg}" contains invalid characters.`;
      }
    }
    return null;
  }
  function normalizeFolderForStorage(raw) {
    const trimmed = (raw != null ? raw : "").trim();
    if (!trimmed) return { ok: true, storage: "" };
    if (trimmed === "/" || trimmed === "./" || trimmed === ".")
      return { ok: true, storage: "/" };
    const collapsed = trimmed.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
    const stripped = collapsed.replace(/^\/+/, "").replace(/\/+$/, "");
    if (!stripped) return { ok: true, storage: "/" };
    const segments = stripped.split("/").filter(Boolean);
    const err = validateFolderSegments(segments);
    if (err) return { ok: false, message: err };
    return { ok: true, storage: segments.join("/") };
  }
  function folderStorageToCommitPath(stored) {
    if (!stored) return { ok: true, path: "" };
    if (stored === "/" || stored === "./" || stored === ".")
      return { ok: true, path: "" };
    const collapsed = stored.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
    const stripped = collapsed.replace(/^\/+/, "").replace(/\/+$/, "");
    if (!stripped) return { ok: true, path: "" };
    const segments = stripped.split("/").filter(Boolean);
    const err = validateFolderSegments(segments);
    if (err) return { ok: false, message: err };
    return { ok: true, path: segments.join("/") };
  }

  // src/app/github/handlers/state.ts
  var GH_SELECTED_KEY = "gh.selected";
  var GH_LAST_COMMIT_KEY = "gh.lastCommitSignature";
  async function getSelected() {
    var _a;
    try {
      return (_a = await figma.clientStorage.getAsync(GH_SELECTED_KEY)) != null ? _a : {};
    } catch (e) {
      return {};
    }
  }
  async function setSelected(sel) {
    try {
      await figma.clientStorage.setAsync(GH_SELECTED_KEY, sel);
    } catch (e) {
    }
  }
  async function mergeSelected(partial) {
    const current = await getSelected();
    const merged = __spreadValues(__spreadValues({}, current), partial);
    await setSelected(merged);
    return merged;
  }
  async function getLastCommitSignature() {
    try {
      const stored = await figma.clientStorage.getAsync(GH_LAST_COMMIT_KEY);
      if (stored && typeof stored === "object" && typeof stored.branch === "string" && typeof stored.fullPath === "string") {
        return {
          branch: stored.branch,
          fullPath: stored.fullPath,
          scope: typeof stored.scope === "string" && (stored.scope === "all" || stored.scope === "selected" || stored.scope === "typography") ? stored.scope : "selected"
        };
      }
    } catch (e) {
    }
    return null;
  }
  async function setLastCommitSignature(sig) {
    try {
      await figma.clientStorage.setAsync(GH_LAST_COMMIT_KEY, sig);
    } catch (e) {
    }
  }
  async function handleSaveState(ctx, payload) {
    const update = {};
    if (typeof payload.owner === "string") update.owner = payload.owner;
    if (typeof payload.repo === "string") update.repo = payload.repo;
    if (typeof payload.branch === "string") update.branch = payload.branch;
    if (typeof payload.folder === "string") {
      const folderResult = normalizeFolderForStorage(payload.folder);
      if (folderResult.ok) update.folder = folderResult.storage;
      else
        ctx.deps.send({
          type: "ERROR",
          payload: { message: folderResult.message }
        });
    }
    if (typeof payload.filename === "string")
      update.filename = payload.filename.trim();
    if (typeof payload.commitMessage === "string")
      update.commitMessage = payload.commitMessage;
    if (payload.scope === "all" || payload.scope === "selected" || payload.scope === "typography") {
      update.scope = payload.scope;
    }
    if (typeof payload.collection === "string")
      update.collection = payload.collection;
    if (typeof payload.mode === "string") update.mode = payload.mode;
    if (typeof payload.styleDictionary === "boolean")
      update.styleDictionary = payload.styleDictionary;
    if (typeof payload.flatTokens === "boolean")
      update.flatTokens = payload.flatTokens;
    if (typeof payload.createPr === "boolean")
      update.createPr = payload.createPr;
    if (typeof payload.prBase === "string") update.prBase = payload.prBase;
    if (typeof payload.prTitle === "string") update.prTitle = payload.prTitle;
    if (typeof payload.prBody === "string") update.prBody = payload.prBody;
    await mergeSelected(update);
  }

  // src/app/github/handlers/repos.ts
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  async function listAndSendRepos(ctx, token) {
    await sleep(75);
    let repos = await ghListRepos(token);
    if (!repos.ok && /Failed to fetch|network error/i.test(repos.error || "")) {
      await sleep(200);
      repos = await ghListRepos(token);
    }
    if (repos.ok) {
      const minimal = repos.repos.map((r) => ({
        full_name: r.full_name,
        default_branch: r.default_branch,
        private: !!r.private
      }));
      ctx.deps.send({ type: "GITHUB_REPOS", payload: { repos: minimal } });
    } else {
      ctx.deps.send({
        type: "ERROR",
        payload: {
          message: `GitHub: Could not list repos: ${repos.error}`
        }
      });
      ctx.deps.send({ type: "GITHUB_REPOS", payload: { repos: [] } });
    }
  }
  async function handleSelectRepo(ctx, payload) {
    const sel = await getSelected();
    await setSelected({
      owner: payload.owner,
      repo: payload.repo,
      branch: sel.branch,
      folder: void 0,
      filename: sel.filename,
      commitMessage: sel.commitMessage,
      scope: sel.scope,
      collection: sel.collection,
      mode: sel.mode,
      createPr: sel.createPr,
      prBase: sel.prBase,
      prTitle: sel.prTitle,
      prBody: sel.prBody
    });
  }

  // src/app/github/handlers/auth.ts
  function encodeToken(s) {
    try {
      return btoa(s);
    } catch (e) {
      return s;
    }
  }
  function decodeToken(s) {
    try {
      return atob(s);
    } catch (e) {
      return s;
    }
  }
  async function restoreGithubTokenAndVerify(ctx) {
    try {
      const rememberPrefStored = await figma.clientStorage.getAsync("githubRememberPref").catch(() => null);
      const rememberPref = typeof rememberPrefStored === "boolean" ? rememberPrefStored : true;
      if (!rememberPref) {
        await figma.clientStorage.deleteAsync("github_token_b64").catch(() => {
        });
        return;
      }
      const stored = await figma.clientStorage.getAsync("github_token_b64").catch(() => null);
      if (!stored || typeof stored !== "string" || stored.length === 0)
        return;
      const decoded = decodeToken(stored);
      ctx.state.token = decoded;
      const who = await ghGetUser(decoded);
      if (who.ok) {
        ctx.deps.send({
          type: "GITHUB_AUTH_RESULT",
          payload: {
            ok: true,
            login: who.user.login,
            name: who.user.name,
            remember: true
          }
        });
        await listAndSendRepos(ctx, decoded);
      } else {
        ctx.deps.send({
          type: "ERROR",
          payload: {
            message: `GitHub: Authentication failed (stored token): ${who.error}.`
          }
        });
        ctx.deps.send({
          type: "GITHUB_AUTH_RESULT",
          payload: { ok: false, error: who.error, remember: false }
        });
      }
    } catch (e) {
    }
  }
  async function handleSetToken(ctx, payload) {
    const token = String(payload.token || "").trim();
    const remember = !!payload.remember;
    if (!token) {
      ctx.deps.send({
        type: "ERROR",
        payload: { message: "GitHub: Empty token." }
      });
      ctx.deps.send({
        type: "GITHUB_AUTH_RESULT",
        payload: {
          ok: false,
          error: "empty token",
          remember: false
        }
      });
      return;
    }
    ctx.state.token = token;
    if (remember) {
      await figma.clientStorage.setAsync("github_token_b64", encodeToken(token)).catch(() => {
      });
    } else {
      await figma.clientStorage.deleteAsync("github_token_b64").catch(() => {
      });
    }
    const who = await ghGetUser(token);
    if (who.ok) {
      ctx.deps.send({
        type: "GITHUB_AUTH_RESULT",
        payload: {
          ok: true,
          login: who.user.login,
          name: who.user.name,
          remember
        }
      });
      await listAndSendRepos(ctx, token);
    } else {
      ctx.deps.send({
        type: "ERROR",
        payload: {
          message: `GitHub: Authentication failed: ${who.error}.`
        }
      });
      ctx.deps.send({
        type: "GITHUB_AUTH_RESULT",
        payload: {
          ok: false,
          error: who.error,
          remember: false
        }
      });
      ctx.deps.send({ type: "GITHUB_REPOS", payload: { repos: [] } });
    }
  }
  async function handleForgetToken(ctx) {
    ctx.state.token = null;
    await figma.clientStorage.deleteAsync("github_token_b64").catch(() => {
    });
    ctx.deps.send({
      type: "INFO",
      payload: { message: "GitHub: Token cleared." }
    });
    ctx.deps.send({
      type: "GITHUB_AUTH_RESULT",
      payload: { ok: false, remember: false }
    });
    ctx.deps.send({ type: "GITHUB_REPOS", payload: { repos: [] } });
  }

  // src/app/github/handlers/branches.ts
  async function handleFetchBranches(ctx, payload) {
    const owner = String(payload.owner || "");
    const repo = String(payload.repo || "");
    const page = Number.isFinite(payload.page) ? Number(payload.page) : 1;
    const force = !!payload.force;
    if (!ctx.state.token) {
      ctx.deps.send({
        type: "GITHUB_BRANCHES_ERROR",
        payload: {
          owner,
          repo,
          status: 401,
          message: "No token"
        }
      });
      return;
    }
    const res = await ghListBranches(ctx.state.token, owner, repo, page, force);
    if (res.ok) {
      ctx.deps.send({ type: "GITHUB_BRANCHES", payload: res });
      if (page === 1 && res.defaultBranch) {
        await mergeSelected({
          owner,
          repo,
          branch: res.defaultBranch,
          prBase: res.defaultBranch
        });
      }
    } else {
      ctx.deps.send({ type: "GITHUB_BRANCHES_ERROR", payload: res });
    }
  }
  async function handleSelectBranch(ctx, payload) {
    const sel = await getSelected();
    await setSelected({
      owner: payload.owner || sel.owner,
      repo: payload.repo || sel.repo,
      branch: payload.branch,
      folder: void 0,
      filename: sel.filename,
      commitMessage: sel.commitMessage,
      scope: sel.scope,
      collection: sel.collection,
      mode: sel.mode,
      createPr: sel.createPr,
      prBase: sel.prBase,
      prTitle: sel.prTitle,
      prBody: sel.prBody
    });
  }
  async function handleCreateBranch(ctx, payload) {
    const owner = String(payload.owner || "");
    const repo = String(payload.repo || "");
    const baseBranch = String(payload.baseBranch || "");
    const newBranch = String(payload.newBranch || "");
    if (!ctx.state.token) {
      ctx.deps.send({
        type: "GITHUB_CREATE_BRANCH_RESULT",
        payload: {
          ok: false,
          owner,
          repo,
          baseBranch,
          newBranch,
          status: 401,
          message: "No token"
        }
      });
      return;
    }
    if (!owner || !repo || !baseBranch || !newBranch) {
      ctx.deps.send({
        type: "GITHUB_CREATE_BRANCH_RESULT",
        payload: {
          ok: false,
          owner,
          repo,
          baseBranch,
          newBranch,
          status: 400,
          message: "Missing owner/repo/base/new"
        }
      });
      return;
    }
    const res = await ghCreateBranch(
      ctx.state.token,
      owner,
      repo,
      newBranch,
      baseBranch
    );
    if (res.ok) {
      await mergeSelected({ owner, repo, branch: newBranch });
    }
    ctx.deps.send({
      type: "GITHUB_CREATE_BRANCH_RESULT",
      payload: res
    });
  }

  // src/app/github/handlers/folders.ts
  async function ensureFolderPathWritable(token, owner, repo, branch, folderPath) {
    if (!folderPath) return { ok: true };
    const segments = folderPath.split("/").filter(Boolean);
    let prefix = "";
    for (let i = 0; i < segments.length; i++) {
      prefix = prefix ? `${prefix}/${segments[i]}` : segments[i];
      const res = await ghListDirs(token, owner, repo, branch, prefix);
      if (res.ok) continue;
      const status = typeof res.status === "number" ? res.status : 0;
      if (status === 404) break;
      if (status === 409) {
        return {
          ok: false,
          status: 409,
          message: `GitHub: "${prefix}" is already a file. Choose a different export folder.`
        };
      }
      if (res.samlRequired) {
        return {
          ok: false,
          status: 403,
          message: "GitHub: Authorize SSO for this repository to export into that folder."
        };
      }
      const message = res.message || `HTTP ${status}`;
      return { ok: false, status: status || 400, message };
    }
    return { ok: true };
  }
  async function getSelectedFolderForCommit(folderRaw) {
    const folderStoredResult = normalizeFolderForStorage(folderRaw);
    if (!folderStoredResult.ok) {
      return folderStoredResult;
    }
    const folderCommitResult = folderStorageToCommitPath(
      folderStoredResult.storage
    );
    if (!folderCommitResult.ok) {
      return folderCommitResult;
    }
    return {
      ok: true,
      storage: folderStoredResult.storage,
      path: folderCommitResult.path
    };
  }
  async function handleSetFolder(ctx, payload) {
    var _a;
    const folderResult = normalizeFolderForStorage(
      String((_a = payload.folder) != null ? _a : "")
    );
    if (!folderResult.ok) {
      ctx.deps.send({
        type: "ERROR",
        payload: { message: folderResult.message }
      });
      return;
    }
    const folder = folderResult.storage;
    const sel = await getSelected();
    await setSelected({
      owner: payload.owner || sel.owner,
      repo: payload.repo || sel.repo,
      branch: sel.branch,
      folder,
      filename: sel.filename,
      commitMessage: sel.commitMessage,
      scope: sel.scope,
      collection: sel.collection,
      mode: sel.mode,
      createPr: sel.createPr,
      prBase: sel.prBase,
      prTitle: sel.prTitle,
      prBody: sel.prBody
    });
  }
  async function handleFolderList(ctx, payload) {
    const owner = String(payload.owner || "");
    const repo = String(payload.repo || "");
    const branch = String(payload.branch || "");
    const pathRaw = String(payload.path || "");
    if (!ctx.state.token) {
      ctx.deps.send({
        type: "GITHUB_FOLDER_LIST_RESULT",
        payload: {
          ok: false,
          owner,
          repo,
          branch,
          path: pathRaw,
          status: 401,
          message: "No token"
        }
      });
      return;
    }
    const normalizedPath = normalizeFolderForStorage(pathRaw);
    if (!normalizedPath.ok) {
      ctx.deps.send({
        type: "GITHUB_FOLDER_LIST_RESULT",
        payload: {
          ok: false,
          owner,
          repo,
          branch,
          path: pathRaw,
          status: 400,
          message: normalizedPath.message
        }
      });
      return;
    }
    const commitPathResult = folderStorageToCommitPath(normalizedPath.storage);
    if (!commitPathResult.ok) {
      ctx.deps.send({
        type: "GITHUB_FOLDER_LIST_RESULT",
        payload: {
          ok: false,
          owner,
          repo,
          branch,
          path: pathRaw,
          status: 400,
          message: commitPathResult.message
        }
      });
      return;
    }
    const folderPath = commitPathResult.path;
    if (folderPath) {
      const collision = await ensureFolderPathWritable(
        ctx.state.token,
        owner,
        repo,
        branch,
        folderPath
      );
      if (!collision.ok) {
        ctx.deps.send({
          type: "GITHUB_FOLDER_LIST_RESULT",
          payload: {
            ok: false,
            owner,
            repo,
            branch,
            path: folderPath,
            status: collision.status,
            message: collision.message
          }
        });
        return;
      }
    }
    const res = await ghListDirs(
      ctx.state.token,
      owner,
      repo,
      branch,
      commitPathResult.path
    );
    if (res.ok) {
      ctx.deps.send({
        type: "GITHUB_FOLDER_LIST_RESULT",
        payload: {
          ok: true,
          owner,
          repo,
          branch,
          path: res.path,
          entries: res.dirs.map((d) => ({
            type: "dir",
            name: d.name,
            path: d.path
          })),
          rate: res.rate
        }
      });
    } else {
      ctx.deps.send({
        type: "GITHUB_FOLDER_LIST_RESULT",
        payload: {
          ok: false,
          owner,
          repo,
          branch,
          path: res.path,
          status: res.status,
          message: res.message,
          rate: res.rate
        }
      });
    }
  }
  async function handleCreateFolder(ctx, payload) {
    const owner = String(payload.owner || "");
    const repo = String(payload.repo || "");
    const branch = String(payload.branch || "");
    const folderPathRaw = String(
      payload.folderPath || payload.path || ""
    ).trim();
    if (!ctx.state.token) {
      ctx.deps.send({
        type: "GITHUB_CREATE_FOLDER_RESULT",
        payload: {
          ok: false,
          owner,
          repo,
          branch,
          folderPath: folderPathRaw,
          status: 401,
          message: "No token"
        }
      });
      return;
    }
    const folderNormalized = normalizeFolderForStorage(folderPathRaw);
    if (!folderNormalized.ok) {
      ctx.deps.send({
        type: "GITHUB_CREATE_FOLDER_RESULT",
        payload: {
          ok: false,
          owner,
          repo,
          branch,
          folderPath: folderPathRaw,
          status: 400,
          message: folderNormalized.message
        }
      });
      return;
    }
    const folderCommit = folderStorageToCommitPath(folderNormalized.storage);
    if (!folderCommit.ok) {
      ctx.deps.send({
        type: "GITHUB_CREATE_FOLDER_RESULT",
        payload: {
          ok: false,
          owner,
          repo,
          branch,
          folderPath: folderPathRaw,
          status: 400,
          message: folderCommit.message
        }
      });
      return;
    }
    if (!folderCommit.path) {
      ctx.deps.send({
        type: "GITHUB_CREATE_FOLDER_RESULT",
        payload: {
          ok: false,
          owner,
          repo,
          branch,
          folderPath: folderPathRaw,
          status: 400,
          message: "GitHub: Choose a subfolder name."
        }
      });
      return;
    }
    const res = await ghEnsureFolder(
      ctx.state.token,
      owner,
      repo,
      branch,
      folderCommit.path
    );
    ctx.deps.send({
      type: "GITHUB_CREATE_FOLDER_RESULT",
      payload: res
    });
  }

  // src/app/github/filenames.ts
  var DEFAULT_GITHUB_FILENAME = "tokens.json";
  var INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001F]/;
  var MAX_FILENAME_LENGTH = 128;
  function validateGithubFilename(raw) {
    const initial = typeof raw === "string" ? raw : DEFAULT_GITHUB_FILENAME;
    const trimmed = initial.trim();
    if (!trimmed) {
      return {
        ok: false,
        message: "GitHub: Enter a filename (e.g., tokens.json)."
      };
    }
    if (trimmed === "." || trimmed === "..") {
      return {
        ok: false,
        message: 'GitHub: Filename cannot be "." or "..".'
      };
    }
    if (trimmed.length > MAX_FILENAME_LENGTH) {
      return {
        ok: false,
        message: `GitHub: Filename must be ${MAX_FILENAME_LENGTH} characters or fewer.`
      };
    }
    if (INVALID_FILENAME_CHARS.test(trimmed)) {
      return {
        ok: false,
        message: 'GitHub: Filename contains unsupported characters like / \\ : * ? " < > |.'
      };
    }
    if (!/\.json$/i.test(trimmed)) {
      return { ok: false, message: "GitHub: Filename must end with .json." };
    }
    return { ok: true, filename: trimmed };
  }

  // src/app/github/handlers/commits.ts
  function sleep2(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  function pickPerModeFile(files, collectionName, modeName, safeKeyFn) {
    const prettyExact = `${collectionName} - ${modeName}.json`;
    const prettyLoose = `${collectionName} - ${modeName}`;
    const legacy1 = `${collectionName}_mode=${modeName}`;
    const legacy2 = `${collectionName}/mode=${modeName}`;
    const legacy3 = safeKeyFn(collectionName, modeName);
    let picked = files.find((f) => {
      const n = String((f == null ? void 0 : f.name) || "");
      return n === prettyExact || n === prettyLoose || n.includes(`${collectionName} - ${modeName}`);
    });
    if (!picked) {
      picked = files.find((f) => {
        const n = String((f == null ? void 0 : f.name) || "");
        return n.includes(legacy1) || n.includes(legacy2) || n.includes(legacy3);
      });
    }
    return picked || null;
  }
  async function handleExportFiles(ctx, payload) {
    const scope = payload.scope === "all" ? "all" : payload.scope === "typography" ? "typography" : "selected";
    const collection = String(payload.collection || "");
    const mode = String(payload.mode || "");
    const styleDictionary = !!payload.styleDictionary;
    const flatTokens = !!payload.flatTokens;
    try {
      if (scope === "all") {
        const all = await ctx.deps.exportDtcg({
          format: "single",
          styleDictionary,
          flatTokens
        });
        ctx.deps.send({
          type: "GITHUB_EXPORT_FILES_RESULT",
          payload: { files: all.files }
        });
      } else if (scope === "typography") {
        const typo = await ctx.deps.exportDtcg({
          format: "typography"
        });
        ctx.deps.send({
          type: "GITHUB_EXPORT_FILES_RESULT",
          payload: { files: typo.files }
        });
      } else {
        if (!collection || !mode) {
          ctx.deps.send({
            type: "GITHUB_EXPORT_FILES_RESULT",
            payload: { files: [] }
          });
          ctx.deps.send({
            type: "ERROR",
            payload: {
              message: "GitHub: choose collection and mode before exporting."
            }
          });
          return;
        }
        const per = await ctx.deps.exportDtcg({
          format: "perMode",
          styleDictionary,
          flatTokens
        });
        const picked = pickPerModeFile(
          per.files,
          collection,
          mode,
          ctx.deps.safeKeyFromCollectionAndMode
        );
        const files = picked ? [picked] : per.files;
        ctx.deps.send({
          type: "GITHUB_EXPORT_FILES_RESULT",
          payload: { files }
        });
      }
    } catch (err) {
      const msgText = (err == null ? void 0 : err.message) || "Failed to export";
      ctx.deps.send({
        type: "ERROR",
        payload: {
          message: `GitHub export failed: ${msgText}`
        }
      });
      ctx.deps.send({
        type: "GITHUB_EXPORT_FILES_RESULT",
        payload: { files: [] }
      });
    }
  }
  async function handleExportAndCommit(ctx, payload) {
    var _a;
    const owner = String(payload.owner || "");
    const repo = String(payload.repo || "");
    const baseBranch = String(payload.branch || "");
    const folderRaw = typeof payload.folder === "string" ? payload.folder : "";
    const commitMessage = (String(payload.commitMessage || "") || "Update tokens from Figma").trim();
    const requestedScope = payload.scope === "all" ? "all" : payload.scope === "typography" ? "typography" : "selected";
    const scope = requestedScope;
    const collection = String(payload.collection || "");
    const mode = String(payload.mode || "");
    const styleDictionary = !!payload.styleDictionary;
    const flatTokens = !!payload.flatTokens;
    const createPr = !!payload.createPr;
    const prBaseBranch = createPr ? String(payload.prBase || "") : "";
    const prTitle = String(payload.prTitle || commitMessage).trim() || commitMessage;
    const prBody = typeof payload.prBody === "string" ? payload.prBody : void 0;
    const storedSelection = await getSelected();
    const selectionCollection = collection || (typeof storedSelection.collection === "string" ? storedSelection.collection : "");
    const selectionMode = mode || (typeof storedSelection.mode === "string" ? storedSelection.mode : "");
    const filenameCandidate = typeof payload.filename === "string" ? payload.filename : typeof storedSelection.filename === "string" ? storedSelection.filename : void 0;
    const filenameCheck = validateGithubFilename(
      filenameCandidate != null ? filenameCandidate : DEFAULT_GITHUB_FILENAME
    );
    if (!filenameCheck.ok) {
      ctx.deps.send({
        type: "GITHUB_COMMIT_RESULT",
        payload: {
          ok: false,
          owner,
          repo,
          branch: baseBranch,
          status: 400,
          message: filenameCheck.message,
          folder: folderRaw || "",
          filename: filenameCandidate
        }
      });
      return;
    }
    const filenameToCommit = filenameCheck.filename;
    if (!ctx.state.token) {
      ctx.deps.send({
        type: "GITHUB_COMMIT_RESULT",
        payload: {
          ok: false,
          owner,
          repo,
          branch: baseBranch,
          status: 401,
          message: "No token",
          folder: folderRaw || "",
          filename: filenameToCommit
        }
      });
      return;
    }
    if (!owner || !repo || !baseBranch) {
      ctx.deps.send({
        type: "GITHUB_COMMIT_RESULT",
        payload: {
          ok: false,
          owner,
          repo,
          branch: baseBranch,
          status: 400,
          message: "Missing owner/repo/branch",
          folder: folderRaw || "",
          filename: filenameToCommit
        }
      });
      return;
    }
    if (!commitMessage) {
      ctx.deps.send({
        type: "GITHUB_COMMIT_RESULT",
        payload: {
          ok: false,
          owner,
          repo,
          branch: baseBranch,
          status: 400,
          message: "Empty commit message",
          folder: folderRaw || "",
          filename: filenameToCommit
        }
      });
      return;
    }
    const folderInfo = await getSelectedFolderForCommit(folderRaw);
    if (!folderInfo.ok) {
      ctx.deps.send({
        type: "GITHUB_COMMIT_RESULT",
        payload: {
          ok: false,
          owner,
          repo,
          branch: baseBranch,
          status: 400,
          message: folderInfo.message,
          folder: folderRaw || "",
          filename: filenameToCommit
        }
      });
      return;
    }
    if (folderInfo.path) {
      const folderCheck = await ensureFolderPathWritable(
        ctx.state.token,
        owner,
        repo,
        baseBranch,
        folderInfo.path
      );
      if (!folderCheck.ok) {
        ctx.deps.send({
          type: "GITHUB_COMMIT_RESULT",
          payload: {
            ok: false,
            owner,
            repo,
            branch: baseBranch,
            status: folderCheck.status,
            message: folderCheck.message,
            folder: folderInfo.storage,
            filename: filenameToCommit
          }
        });
        return;
      }
    }
    if (createPr && !prBaseBranch) {
      ctx.deps.send({
        type: "GITHUB_COMMIT_RESULT",
        payload: {
          ok: false,
          owner,
          repo,
          branch: baseBranch,
          status: 400,
          message: "Unable to determine target branch for pull request.",
          folder: folderInfo.storage,
          filename: filenameToCommit
        }
      });
      return;
    }
    if (createPr && prBaseBranch === baseBranch) {
      ctx.deps.send({
        type: "GITHUB_COMMIT_RESULT",
        payload: {
          ok: false,
          owner,
          repo,
          branch: baseBranch,
          status: 400,
          message: "Selected branch matches PR target branch. Choose a different branch before creating a PR.",
          folder: folderInfo.storage,
          filename: filenameToCommit
        }
      });
      return;
    }
    const folderStorageValue = folderInfo.storage;
    const folderCommitPath = folderInfo.path;
    const fullPathForCommit = folderCommitPath ? `${folderCommitPath}/${filenameToCommit}` : filenameToCommit;
    const lastCommitSignature = await getLastCommitSignature() || null;
    const sameTargetAsLastCommit = !!lastCommitSignature && lastCommitSignature.branch === baseBranch && lastCommitSignature.fullPath === fullPathForCommit && lastCommitSignature.scope === scope;
    const selectionState = {
      owner,
      repo,
      branch: baseBranch,
      folder: folderInfo.storage,
      filename: filenameToCommit,
      commitMessage,
      scope,
      styleDictionary: payload.styleDictionary,
      flatTokens: payload.flatTokens,
      createPr,
      prBase: createPr ? prBaseBranch : void 0,
      prTitle: createPr ? prTitle : void 0,
      prBody: createPr ? prBody : void 0
    };
    if (selectionCollection) selectionState.collection = selectionCollection;
    if (selectionMode) selectionState.mode = selectionMode;
    await mergeSelected(selectionState);
    await ctx.deps.broadcastLocalCollections({ force: true });
    try {
      const files = [];
      if (scope === "all") {
        const all = await ctx.deps.exportDtcg({
          format: "single",
          styleDictionary,
          flatTokens
        });
        for (const f of all.files)
          files.push({ name: f.name, json: f.json });
      } else if (scope === "typography") {
        const typo = await ctx.deps.exportDtcg({
          format: "typography"
        });
        for (const f of typo.files)
          files.push({ name: f.name, json: f.json });
      } else {
        if (!selectionCollection || !selectionMode) {
          ctx.deps.send({
            type: "GITHUB_COMMIT_RESULT",
            payload: {
              ok: false,
              owner,
              repo,
              branch: baseBranch,
              status: 400,
              message: "Pick a collection and a mode.",
              folder: folderStorageValue,
              filename: filenameToCommit,
              fullPath: fullPathForCommit
            }
          });
          return;
        }
        const per = await ctx.deps.exportDtcg({
          format: "perMode",
          styleDictionary,
          flatTokens
        });
        const picked = pickPerModeFile(
          per.files,
          selectionCollection,
          selectionMode,
          ctx.deps.safeKeyFromCollectionAndMode
        );
        if (!picked) {
          const available = per.files.map((f) => f.name).join(", ");
          ctx.deps.send({
            type: "GITHUB_COMMIT_RESULT",
            payload: {
              ok: false,
              owner,
              repo,
              branch: baseBranch,
              status: 404,
              message: `No export found for "${selectionCollection}" / "${selectionMode}". Available: [${available}]`,
              folder: folderStorageValue,
              filename: filenameToCommit,
              fullPath: fullPathForCommit
            }
          });
          return;
        }
        files.push({ name: picked.name, json: picked.json });
      }
      if (files.length > 1) {
        ctx.deps.send({
          type: "GITHUB_COMMIT_RESULT",
          payload: {
            ok: false,
            owner,
            repo,
            branch: baseBranch,
            status: 400,
            message: "GitHub: Custom filename requires a single export file. Adjust scope or disable extra formats.",
            folder: folderStorageValue,
            filename: filenameToCommit,
            fullPath: fullPathForCommit
          }
        });
        return;
      }
      const isPlainEmptyObject = (v) => v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0;
      const exportLooksEmpty = files.length === 0 || files.every((f) => isPlainEmptyObject(f.json));
      if (exportLooksEmpty) {
        if (scope === "typography") {
          const warningMessage = "GitHub export warning: typography.json is empty (no local text styles). Nothing to commit.";
          ctx.deps.send({
            type: "GITHUB_COMMIT_RESULT",
            payload: {
              ok: false,
              owner,
              repo,
              branch: baseBranch,
              status: 412,
              message: warningMessage,
              folder: folderStorageValue,
              filename: filenameToCommit,
              fullPath: fullPathForCommit
            }
          });
          return;
        }
        if (exportLooksEmpty && scope === "selected") {
          const diag = await ctx.deps.analyzeSelectionState(
            selectionCollection,
            selectionMode
          );
          const tail = diag.ok ? `Found ${diag.variableCount} variable(s) in "${selectionCollection}", but ${(_a = diag.variablesWithValues) != null ? _a : 0} with a value in "${selectionMode}".` : diag.message || "No values present.";
          ctx.deps.send({
            type: "GITHUB_COMMIT_RESULT",
            payload: {
              ok: false,
              owner,
              repo,
              branch: baseBranch,
              status: 412,
              message: `Export for "${selectionCollection}" / "${selectionMode}" produced an empty tokens file. ${tail}`,
              folder: folderStorageValue,
              filename: filenameToCommit,
              fullPath: fullPathForCommit
            }
          });
          return;
        }
        if (exportLooksEmpty) {
          ctx.deps.send({
            type: "GITHUB_COMMIT_RESULT",
            payload: {
              ok: false,
              owner,
              repo,
              branch: baseBranch,
              status: 412,
              message: "Export produced an empty tokens file. Ensure this file contains local Variables with values.",
              folder: folderStorageValue,
              filename: filenameToCommit,
              fullPath: fullPathForCommit
            }
          });
          return;
        }
      }
      const prettyExportName = (original) => {
        const name = original && typeof original === "string" ? original : "tokens.json";
        const m = name.match(/^(.*)_mode=(.*)\.tokens\.json$/);
        if (m) return `${m[1].trim()} - ${m[2].trim()}.json`;
        return name.endsWith(".json") ? name : name + ".json";
      };
      const prefix = folderCommitPath ? folderCommitPath + "/" : "";
      const commitFiles = files.map((f) => {
        const resolvedName = files.length === 1 ? filenameToCommit : prettyExportName(f.name);
        return {
          path: prefix + resolvedName,
          content: JSON.stringify(f.json, null, 2) + "\n"
        };
      });
      const normalizeForCompare = (text) => text.replace(/\r\n/g, "\n").trimEnd();
      const tryParseJson = (text) => {
        try {
          return JSON.parse(text);
        } catch (e) {
          return void 0;
        }
      };
      const canonicalizeJson = (value) => {
        if (Array.isArray(value)) {
          return value.map((item) => canonicalizeJson(item));
        }
        if (value && typeof value === "object") {
          const proto = Object.getPrototypeOf(value);
          if (proto === Object.prototype || proto === null) {
            const record = value;
            const sortedKeys = Object.keys(record).sort();
            const canonical = {};
            for (const key of sortedKeys)
              canonical[key] = canonicalizeJson(record[key]);
            return canonical;
          }
        }
        return value;
      };
      const containsTypographyTokens = (text) => {
        const parsed = tryParseJson(text);
        const hasTypography = (value) => {
          if (!value) return false;
          if (typeof value === "string") {
            return value.toLowerCase() === "typography";
          }
          if (typeof value === "object") {
            if (Object.prototype.hasOwnProperty.call(value, "$type")) {
              const t = value["$type"];
              if (typeof t === "string" && t.toLowerCase() === "typography") {
                return true;
              }
            }
            for (const key in value) {
              if (Object.prototype.hasOwnProperty.call(value, key) && hasTypography(
                value[key]
              )) {
                return true;
              }
            }
          }
          return false;
        };
        if (parsed !== void 0) {
          return hasTypography(parsed);
        }
        return /"\$type"\s*:\s*"typography"/i.test(text);
      };
      const contentsMatch = (existing, nextContent) => {
        if (existing === nextContent) return true;
        if (normalizeForCompare(existing) === normalizeForCompare(nextContent))
          return true;
        const existingJson = tryParseJson(existing);
        const nextJson = tryParseJson(nextContent);
        if (existingJson !== void 0 && nextJson !== void 0) {
          return JSON.stringify(canonicalizeJson(existingJson)) === JSON.stringify(canonicalizeJson(nextJson));
        }
        return false;
      };
      let allFilesIdentical = commitFiles.length > 0;
      for (const file of commitFiles) {
        const current = await ghGetFileContents(
          ctx.state.token,
          owner,
          repo,
          baseBranch,
          file.path
        );
        if (!current.ok) {
          if (current.status === 404) {
            allFilesIdentical = false;
            break;
          }
          allFilesIdentical = false;
          break;
        }
        if (scope === "typography" && containsTypographyTokens(file.content) && !containsTypographyTokens(current.contentText)) {
          allFilesIdentical = false;
          break;
        }
        if (!contentsMatch(current.contentText, file.content)) {
          allFilesIdentical = false;
          break;
        }
      }
      if (allFilesIdentical && !sameTargetAsLastCommit) {
        allFilesIdentical = false;
      }
      if (allFilesIdentical) {
        const noChangeMessage = scope === "selected" ? `No token values changed for "${selectionCollection}" / "${selectionMode}"; repository already matches the current export.` : "No token values changed; repository already matches the current export.";
        ctx.deps.send({
          type: "GITHUB_COMMIT_RESULT",
          payload: {
            ok: false,
            owner,
            repo,
            branch: baseBranch,
            status: 304,
            message: noChangeMessage,
            folder: folderStorageValue,
            filename: filenameToCommit,
            fullPath: fullPathForCommit
          }
        });
        return;
      }
      const attemptCommit = async () => ghCommitFiles(
        ctx.state.token,
        owner,
        repo,
        baseBranch,
        commitMessage,
        commitFiles
      );
      let commitRes = await attemptCommit();
      let fastForwardRetry = false;
      if (!commitRes.ok && commitRes.status === 422 && typeof commitRes.message === "string" && /not a fast forward/i.test(commitRes.message)) {
        await sleep2(200);
        commitRes = await attemptCommit();
        fastForwardRetry = true;
      }
      if (!commitRes.ok) {
        const looksLikeFastForwardRace = commitRes.status === 422 && typeof commitRes.message === "string" && /not a fast forward/i.test(commitRes.message);
        if (looksLikeFastForwardRace && sameTargetAsLastCommit) {
          const noChangeMessage = scope === "selected" ? `No token values changed for "${selectionCollection}" / "${selectionMode}"; repository already matches the current export.` : "No token values changed; repository already matches the current export.";
          ctx.deps.send({
            type: "GITHUB_COMMIT_RESULT",
            payload: {
              ok: false,
              owner,
              repo,
              branch: baseBranch,
              status: 304,
              message: noChangeMessage,
              folder: folderStorageValue,
              filename: filenameToCommit,
              fullPath: fullPathForCommit
            }
          });
          return;
        }
        ctx.deps.send({
          type: "GITHUB_COMMIT_RESULT",
          payload: __spreadProps(__spreadValues({}, commitRes), {
            folder: folderStorageValue,
            filename: filenameToCommit,
            fullPath: fullPathForCommit
          })
        });
        ctx.deps.send({
          type: "ERROR",
          payload: {
            message: `GitHub: Commit failed (${commitRes.status}): ${commitRes.message}${fastForwardRetry ? " (after retry)" : ""}`
          }
        });
        return;
      }
      await setLastCommitSignature({
        branch: baseBranch,
        fullPath: fullPathForCommit,
        scope
      });
      let prResult;
      if (createPr) {
        prResult = await ghCreatePullRequest(
          ctx.state.token,
          owner,
          repo,
          {
            title: prTitle,
            head: baseBranch,
            base: prBaseBranch,
            body: prBody
          }
        );
      }
      const commitOkPayload = {
        ok: true,
        owner,
        repo,
        branch: baseBranch,
        folder: folderStorageValue,
        filename: filenameToCommit,
        fullPath: fullPathForCommit,
        commitSha: commitRes.commitSha,
        commitUrl: commitRes.commitUrl,
        treeUrl: commitRes.treeUrl,
        rate: commitRes.rate,
        createdPr: prResult && prResult.ok ? {
          number: prResult.number,
          url: prResult.url,
          base: prResult.base,
          head: prResult.head
        } : void 0
      };
      ctx.deps.send({
        type: "GITHUB_COMMIT_RESULT",
        payload: commitOkPayload
      });
      ctx.deps.send({
        type: "INFO",
        payload: {
          message: `Committed ${commitFiles.length} file(s) to ${owner}/${repo}@${baseBranch}`
        }
      });
      if (createPr) {
        if (prResult && prResult.ok) {
          ctx.deps.send({
            type: "GITHUB_PR_RESULT",
            payload: prResult
          });
          ctx.deps.send({
            type: "INFO",
            payload: {
              message: `PR created: ${prResult.url}`
            }
          });
        } else if (prResult) {
          ctx.deps.send({
            type: "GITHUB_PR_RESULT",
            payload: prResult
          });
          ctx.deps.send({
            type: "ERROR",
            payload: {
              message: `GitHub: PR creation failed (${prResult.status}): ${prResult.message}`
            }
          });
        }
      }
    } catch (e) {
      const msgText = (e == null ? void 0 : e.message) || "unknown error";
      ctx.deps.send({
        type: "GITHUB_COMMIT_RESULT",
        payload: {
          ok: false,
          owner,
          repo,
          branch: baseBranch,
          status: 0,
          message: msgText,
          folder: folderStorageValue,
          filename: filenameToCommit,
          fullPath: fullPathForCommit
        }
      });
    }
  }

  // src/app/github/handlers/import.ts
  async function handleFetchTokens(ctx, payload) {
    const owner = String(payload.owner || "");
    const repo = String(payload.repo || "");
    const branch = String(payload.branch || "");
    const pathRaw = String(payload.path || "");
    const allowHex = !!payload.allowHexStrings;
    if (!ctx.state.token) {
      ctx.deps.send({
        type: "GITHUB_FETCH_TOKENS_RESULT",
        payload: {
          ok: false,
          owner,
          repo,
          branch,
          path: pathRaw,
          status: 401,
          message: "No token"
        }
      });
      return;
    }
    if (!owner || !repo || !branch || !pathRaw.trim()) {
      ctx.deps.send({
        type: "GITHUB_FETCH_TOKENS_RESULT",
        payload: {
          ok: false,
          owner,
          repo,
          branch,
          path: pathRaw,
          status: 400,
          message: "Missing owner/repo/branch/path"
        }
      });
      return;
    }
    const normalizedPath = normalizeFolderForStorage(pathRaw);
    if (!normalizedPath.ok) {
      ctx.deps.send({
        type: "GITHUB_FETCH_TOKENS_RESULT",
        payload: {
          ok: false,
          owner,
          repo,
          branch,
          path: pathRaw,
          status: 400,
          message: normalizedPath.message
        }
      });
      return;
    }
    const commitPathResult = folderStorageToCommitPath(normalizedPath.storage);
    if (!commitPathResult.ok) {
      ctx.deps.send({
        type: "GITHUB_FETCH_TOKENS_RESULT",
        payload: {
          ok: false,
          owner,
          repo,
          branch,
          path: pathRaw,
          status: 400,
          message: commitPathResult.message
        }
      });
      return;
    }
    const path = commitPathResult.path;
    const res = await ghGetFileContents(
      ctx.state.token,
      owner,
      repo,
      branch,
      path
    );
    if (!res.ok) {
      ctx.deps.send({
        type: "GITHUB_FETCH_TOKENS_RESULT",
        payload: res
      });
      if (res.samlRequired) {
        ctx.deps.send({
          type: "ERROR",
          payload: {
            message: "GitHub: SSO required for this repository. Authorize your PAT and try again."
          }
        });
      }
      return;
    }
    try {
      const json = JSON.parse(res.contentText || "{}");
      const contexts = Array.isArray(payload.contexts) ? payload.contexts.map((c) => String(c)) : [];
      const summary = await ctx.deps.importDtcg(json, {
        allowHexStrings: allowHex,
        contexts
      });
      ctx.deps.send({
        type: "GITHUB_FETCH_TOKENS_RESULT",
        payload: { ok: true, owner, repo, branch, path, json }
      });
      ctx.deps.send({
        type: "INFO",
        payload: {
          message: `Imported tokens from ${owner}/${repo}@${branch}:${path}`
        }
      });
      ctx.deps.send({
        type: "IMPORT_SUMMARY",
        payload: {
          summary,
          timestamp: Date.now(),
          source: "github"
        }
      });
    } catch (err) {
      const msgText = (err == null ? void 0 : err.message) || "Invalid JSON";
      ctx.deps.send({
        type: "GITHUB_FETCH_TOKENS_RESULT",
        payload: {
          ok: false,
          owner,
          repo,
          branch,
          path,
          status: 422,
          message: msgText
        }
      });
      ctx.deps.send({
        type: "ERROR",
        payload: {
          message: `GitHub import failed: ${msgText}`
        }
      });
      return;
    }
    try {
      await ctx.deps.broadcastLocalCollections({ force: true });
    } catch (e) {
    }
  }

  // src/app/github/dispatcher.ts
  function createGithubDispatcher(deps) {
    const state = {
      token: null
    };
    const ctx = {
      deps,
      state
    };
    async function handle(msg) {
      switch (msg.type) {
        case "GITHUB_SET_TOKEN":
          await handleSetToken(ctx, msg.payload);
          return true;
        case "GITHUB_FORGET_TOKEN":
          await handleForgetToken(ctx);
          return true;
        case "GITHUB_SELECT_REPO":
          await handleSelectRepo(ctx, msg.payload);
          return true;
        case "GITHUB_FETCH_BRANCHES":
          await handleFetchBranches(ctx, msg.payload);
          return true;
        case "GITHUB_SELECT_BRANCH":
          await handleSelectBranch(ctx, msg.payload);
          return true;
        case "GITHUB_CREATE_BRANCH":
          await handleCreateBranch(ctx, msg.payload);
          return true;
        case "GITHUB_FOLDER_LIST":
          await handleFolderList(ctx, msg.payload);
          return true;
        case "GITHUB_CREATE_FOLDER":
          await handleCreateFolder(ctx, msg.payload);
          return true;
        case "GITHUB_SET_FOLDER":
          await handleSetFolder(ctx, msg.payload);
          return true;
        case "GITHUB_SAVE_STATE":
          await handleSaveState(ctx, msg.payload);
          return true;
        case "GITHUB_EXPORT_FILES":
          await handleExportFiles(ctx, msg.payload);
          return true;
        case "GITHUB_EXPORT_AND_COMMIT":
          await handleExportAndCommit(ctx, msg.payload);
          return true;
        case "GITHUB_FETCH_TOKENS":
          await handleFetchTokens(ctx, msg.payload);
          return true;
        default:
          return false;
      }
    }
    async function onUiReady() {
      await restoreGithubTokenAndVerify(ctx);
      const sel = await getSelected();
      if (sel.owner && sel.repo) {
        deps.send({ type: "GITHUB_RESTORE_SELECTED", payload: sel });
      }
    }
    return { handle, onUiReady };
  }

  // src/app/main.ts
  (async function initUI() {
    let w = 1200, h = 675;
    try {
      const saved = await figma.clientStorage.getAsync("uiSize");
      if (saved && typeof saved.width === "number" && typeof saved.height === "number") {
        const sw = Math.floor(saved.width);
        const sh = Math.floor(saved.height);
        w = Math.max(720, Math.min(1600, sw));
        h = Math.max(420, Math.min(1200, sh));
      }
    } catch (e) {
    }
    figma.showUI('<!doctype html>\n<html>\n\n<head>\n  <meta charset="utf-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1" />\n  <title>DTCG Import/Export</title>\n  <style>/* src/app/ui.css */\n:root {\n  --bg: #040511;\n  --bg-gradient:\n    radial-gradient(\n      \n      120% 140% at 20% 15%,\n      #1d2144 0%,\n      #080919 55%,\n      #020205 100% );\n  --surface: rgba(16, 20, 39, 0.9);\n  --surface-elevated: rgba(24, 29, 58, 0.95);\n  --surface-muted: rgba(255, 255, 255, 0.03);\n  --ink: #ffffff;\n  --ink-subtle: #f3f5ff;\n  --ink-muted: #dfe4ff;\n  --accent: #fe8ac9;\n  --accent-secondary: #9c8aff;\n  --accent-ink: #160919;\n  --border: rgba(255, 255, 255, 0.14);\n  --border-strong: rgba(255, 255, 255, 0.24);\n  --glow-pink: 0 0 18px rgba(254, 138, 201, 0.35);\n  --glow-indigo: 0 0 18px rgba(156, 138, 255, 0.3);\n  --button-shadow: 0 6px 14px rgba(254, 138, 201, 0.18);\n  --button-shadow-hover: 0 8px 18px rgba(254, 138, 201, 0.22);\n  --log-surface: rgba(5, 6, 16, 0.92);\n  --drawer-h: 260px;\n  --drawer-collapsed-h: 2rem;\n}\n[data-theme=light] {\n  --bg: #f5f5f7;\n  --bg-gradient:\n    radial-gradient(\n      \n      120% 140% at 20% 15%,\n      #ffffff 0%,\n      #f0f2f5 55%,\n      #e1e4e8 100% );\n  --surface: rgba(255, 255, 255, 0.85);\n  --surface-elevated: rgba(255, 255, 255, 0.95);\n  --surface-muted: rgba(0, 0, 0, 0.03);\n  --ink: #1a1a1a;\n  --ink-subtle: #4a4a4a;\n  --ink-muted: #6a6a6a;\n  --accent: #d02c85;\n  --accent-secondary: #6344e8;\n  --accent-ink: #ffffff;\n  --border: rgba(0, 0, 0, 0.1);\n  --border-strong: rgba(0, 0, 0, 0.2);\n  --glow-pink: 0 2px 8px rgba(208, 44, 133, 0.25);\n  --glow-indigo: 0 2px 8px rgba(99, 68, 232, 0.2);\n  --button-shadow: 0 4px 12px rgba(208, 44, 133, 0.18);\n  --button-shadow-hover: 0 6px 14px rgba(208, 44, 133, 0.22);\n  --log-surface: rgba(255, 255, 255, 0.9);\n}\nhtml,\nbody {\n  height: 100%;\n  margin: 0;\n}\nbody {\n  background: var(--bg-gradient);\n  background-color: var(--bg);\n  color: var(--ink);\n  font-family:\n    "Inter",\n    "SF Pro Display",\n    ui-sans-serif,\n    system-ui,\n    -apple-system,\n    Segoe UI,\n    Roboto,\n    Arial,\n    sans-serif;\n  line-height: 1.4;\n  -webkit-font-smoothing: antialiased;\n}\n.shell {\n  height: 100vh;\n  width: 100%;\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 1fr);\n  grid-template-rows: 1fr var(--drawer-h);\n  gap: 16px;\n  padding: 18px;\n  box-sizing: border-box;\n  grid-auto-flow: row;\n  backdrop-filter: blur(22px);\n  background: rgba(3, 4, 12, 0.35);\n}\n.shell.drawer-collapsed {\n  grid-template-rows: 1fr var(--drawer-collapsed-h);\n}\n.shell.drawer-collapsed .drawer .drawer-body {\n  display: none;\n}\n.drawer-toggle {\n  padding: 6px 12px;\n  border: 1px solid var(--border);\n  border-radius: 999px;\n  background: var(--surface);\n  color: var(--ink);\n  font-size: 12px;\n  cursor: pointer;\n  transition: background 180ms ease, box-shadow 180ms ease;\n  box-shadow: var(--glow-indigo);\n}\n.drawer-toggle:hover {\n  background: rgba(255, 255, 255, 0.06);\n}\n.col {\n  display: flex;\n  flex-direction: column;\n  min-width: 0;\n  min-height: 0;\n}\n.panel {\n  display: flex;\n  flex-direction: column;\n  min-width: 0;\n  min-height: 0;\n  flex: 1;\n  border: 1px solid var(--border);\n  background: var(--surface);\n  border-radius: 18px;\n  padding: 0.75rem;\n  overflow: hidden;\n  box-shadow: 0 30px 60px rgba(2, 2, 8, 0.55), var(--glow-indigo);\n}\n.panel-header {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  padding: 10px 14px 8px 14px;\n  border-bottom: 1px solid var(--border);\n}\n.eyebrow {\n  font-size: 11px;\n  letter-spacing: 0.18em;\n  text-transform: uppercase;\n  color: var(--ink-muted);\n  margin: 0 0 2px 0;\n}\n.title {\n  font-size: 18px;\n  font-weight: 700;\n  margin: 0;\n  display: inline-flex;\n  align-items: center;\n  gap: 10px;\n  background:\n    linear-gradient(\n      120deg,\n      var(--accent),\n      var(--accent-secondary));\n  -webkit-background-clip: text;\n  background-clip: text;\n  color: transparent;\n}\n.title::before {\n  content: "";\n  width: 10px;\n  height: 10px;\n  border-radius: 50%;\n  background:\n    linear-gradient(\n      120deg,\n      var(--accent),\n      var(--accent-secondary));\n  box-shadow: 0 0 12px rgba(254, 138, 201, 0.7);\n  flex-shrink: 0;\n}\n.panel-body {\n  padding: 0.5rem;\n  display: flex;\n  flex-direction: column;\n  gap: 14px;\n  min-width: 0;\n  min-height: 0;\n  flex: 1;\n  overflow: auto;\n  max-height: 100%;\n}\n.row {\n  display: flex;\n  gap: 12px;\n  align-items: center;\n}\n.row > * {\n  flex: 1;\n  min-width: 0;\n}\nlabel {\n  font-size: 12px;\n  color: var(--ink-subtle);\n  display: block;\n  margin-bottom: 4px;\n  letter-spacing: 0.04em;\n}\nlabel:has(input[type=checkbox]),\nlabel:has(input[type=radio]) {\n  display: flex;\n  align-items: center;\n  gap: 0.35rem;\n}\ninput[type=text],\ninput[type=password],\nselect,\ninput[type=file],\ntextarea {\n  width: 100%;\n  padding: 10px 12px;\n  border: 1px solid var(--border);\n  border-radius: 12px;\n  background: rgba(255, 255, 255, 0.04);\n  color: var(--ink);\n  font-size: 13px;\n  box-sizing: border-box;\n  transition: border-color 150ms ease, box-shadow 150ms ease;\n  backdrop-filter: blur(6px);\n}\ninput[type=file] {\n  padding: 10px;\n  color: var(--ink-muted);\n}\ninput[type=file]::-webkit-file-upload-button,\ninput[type=file]::file-selector-button {\n  padding: 8px 14px;\n  border: none;\n  border-radius: 999px;\n  font-size: 12px;\n  font-weight: 600;\n  color: var(--accent-ink);\n  background:\n    linear-gradient(\n      125deg,\n      var(--accent),\n      var(--accent-secondary));\n  cursor: pointer;\n  margin-right: 12px;\n  transition: transform 150ms ease, box-shadow 150ms ease;\n  box-shadow: var(--button-shadow);\n}\ninput[type=file]::-webkit-file-upload-button:hover,\ninput[type=file]::file-selector-button:hover {\n  transform: translateY(-1px);\n  box-shadow: var(--button-shadow-hover);\n}\ninput[type=checkbox],\ninput[type=radio] {\n  -webkit-appearance: none;\n  appearance: none;\n  width: 16px;\n  height: 16px;\n  border-radius: 4px;\n  border: 2px solid var(--accent-secondary);\n  background: var(--log-surface);\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  cursor: pointer;\n  transition:\n    border-color 140ms ease,\n    box-shadow 140ms ease,\n    background 140ms ease;\n  position: relative;\n  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.45);\n}\ninput[type=radio] {\n  border-radius: 50%;\n}\ninput[type=checkbox]::after,\ninput[type=radio]::after {\n  content: "";\n  position: absolute;\n  top: 50%;\n  left: 50%;\n  transition: transform 140ms ease;\n  transform: translate(-50%, -50%) scale(0);\n}\ninput[type=checkbox]::after {\n  width: 6px;\n  height: 10px;\n  border-right: 2px solid #000;\n  border-bottom: 2px solid #000;\n  transform-origin: center;\n  transform: translate(-50%, -60%) rotate(45deg) scale(0);\n}\ninput[type=radio]::after {\n  width: 8px;\n  height: 8px;\n  border-radius: 50%;\n  background: #000;\n  transform-origin: center;\n}\ninput[type=checkbox]:checked,\ninput[type=radio]:checked {\n  border-color: transparent;\n  background:\n    linear-gradient(\n      125deg,\n      var(--accent),\n      var(--accent-secondary));\n  box-shadow: var(--glow-pink);\n}\ninput[type=radio]:checked {\n  border: 2px solid var(--accent-secondary);\n  background: var(--log-surface);\n  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.45);\n}\ninput[type=checkbox]:checked::after {\n  transform: translate(-50%, -60%) rotate(45deg) scale(1);\n}\n[data-theme=light] input[type=checkbox]::after {\n  border-color: #fff;\n}\ninput[type=radio]:checked::after {\n  background:\n    linear-gradient(\n      125deg,\n      var(--accent),\n      var(--accent-secondary));\n  transform: translate(-50%, -50%) scale(1);\n}\ninput[type=checkbox]:focus-visible,\ninput[type=radio]:focus-visible {\n  outline: 2px solid rgba(255, 255, 255, 0.4);\n  outline-offset: 2px;\n}\ninput[type=text]::placeholder,\ninput[type=password]::placeholder,\ntextarea::placeholder {\n  color: var(--ink-muted);\n}\ninput[type=text]:focus,\ninput[type=password]:focus,\nselect:focus,\ninput[type=file]:focus,\ntextarea:focus {\n  outline: none;\n  border-color: var(--accent);\n  box-shadow: 0 0 0 1px rgba(254, 138, 201, 0.4);\n}\nselect {\n  background-color: rgba(255, 255, 255, 0.04);\n  color: var(--ink);\n}\n.gh-folder-display {\n  width: 100%;\n  padding: 10px 12px;\n  border: 1px dashed var(--border);\n  border-radius: 12px;\n  background: rgba(255, 255, 255, 0.04);\n  color: var(--ink);\n  font-size: 12px;\n  min-height: 40px;\n  display: flex;\n  align-items: center;\n  box-sizing: border-box;\n}\n.gh-folder-display.is-placeholder {\n  color: var(--ink-muted);\n  font-style: italic;\n}\n.gh-input-error {\n  color: #b91c1c;\n  font-size: 11px;\n  margin-top: 4px;\n}\nbutton {\n  padding: 11px 18px;\n  border: none;\n  border-radius: 999px;\n  color: var(--accent-ink);\n  font-weight: 600;\n  cursor: pointer;\n  font-size: 14px;\n  background:\n    linear-gradient(\n      125deg,\n      var(--accent),\n      var(--accent-secondary));\n  box-shadow: var(--button-shadow);\n  transition: transform 150ms ease, box-shadow 150ms ease;\n}\nbutton:hover:not([disabled]) {\n  transform: translateY(-1px);\n  box-shadow: var(--button-shadow-hover);\n}\nbutton[disabled] {\n  opacity: 0.4;\n  cursor: not-allowed;\n  box-shadow: none;\n}\n.css-button-neumorphic {\n  min-width: 130px;\n  height: 44px;\n  padding: 0 20px;\n  font-weight: 500;\n  border: 1px solid rgba(255, 255, 255, 0.18);\n  background:\n    linear-gradient(\n      160deg,\n      rgba(255, 255, 255, 0.08),\n      rgba(8, 9, 18, 0.9));\n  color: var(--ink);\n  border-radius: 999px;\n  box-shadow:\n    inset 0 1px 3px rgba(255, 255, 255, 0.15),\n    inset 0 -4px 8px rgba(3, 4, 12, 0.9),\n    var(--glow-indigo);\n}\n.css-button-neumorphic:active {\n  box-shadow: inset 0 0 6px rgba(0, 0, 0, 0.6), inset 0 6px 12px rgba(255, 255, 255, 0.05);\n}\n[data-theme=light] #importBtn,\n[data-theme=light] #exportBtn,\n[data-theme=light] #exportTypographyBtn,\n[data-theme=light] #ghConnectBtn,\n[data-theme=light] #ghLogoutBtn,\n[data-theme=light] #ghBranchRefreshBtn,\n[data-theme=light] #ghNewBranchBtn,\n[data-theme=light] #ghCreateBranchConfirmBtn,\n[data-theme=light] #ghPickFolderBtn,\n[data-theme=light] #ghExportAndCommitBtn,\n[data-theme=light] #ghFetchTokensBtn {\n  background:\n    linear-gradient(\n      125deg,\n      var(--accent),\n      var(--accent-secondary));\n  box-shadow: var(--button-shadow);\n  color: var(--accent-ink);\n  border: none;\n}\n[data-theme=light] #importBtn:hover:not([disabled]),\n[data-theme=light] #exportBtn:hover:not([disabled]),\n[data-theme=light] #exportTypographyBtn:hover:not([disabled]),\n[data-theme=light] #ghConnectBtn:hover:not([disabled]),\n[data-theme=light] #ghLogoutBtn:hover:not([disabled]),\n[data-theme=light] #ghBranchRefreshBtn:hover:not([disabled]),\n[data-theme=light] #ghNewBranchBtn:hover:not([disabled]),\n[data-theme=light] #ghCreateBranchConfirmBtn:hover:not([disabled]),\n[data-theme=light] #ghPickFolderBtn:hover:not([disabled]),\n[data-theme=light] #ghExportAndCommitBtn:hover:not([disabled]),\n[data-theme=light] #ghFetchTokensBtn:hover:not([disabled]) {\n  transform: translateY(-1px);\n  box-shadow: var(--button-shadow-hover);\n}\n.muted {\n  color: var(--ink-muted);\n  font-size: 12px;\n}\n.gh-import-status {\n  font-size: 12px;\n  margin-top: 6px;\n  color: var(--ink-muted);\n}\n.gh-import-status--ready {\n  color: var(--ink-subtle);\n}\n.gh-import-status--progress {\n  color: var(--accent);\n}\n.gh-import-status--success {\n  color: #047857;\n}\n.gh-import-status--error {\n  color: #b91c1c;\n}\n.import-scope-summary {\n  border: 1px solid var(--border);\n  border-radius: 14px;\n  background: rgba(255, 255, 255, 0.03);\n  padding: 0.75rem;\n  display: flex;\n  flex-direction: column;\n  gap: 0.35rem;\n  box-shadow: inset 0 0 30px rgba(255, 255, 255, 0.02);\n}\n.import-skip-log {\n  margin-top: 1rem;\n  display: flex;\n  flex-direction: column;\n  gap: 0.5rem;\n  flex: 1;\n  min-height: 0;\n}\n.import-skip-log-list {\n  display: flex;\n  flex-direction: column;\n  gap: 0.5rem;\n  flex: 1;\n  min-height: 0;\n  overflow: auto;\n}\n.import-skip-log-entry {\n  border: 1px solid var(--border);\n  border-radius: 14px;\n  background: rgba(255, 255, 255, 0.02);\n  padding: 0.75rem;\n  font-size: 12px;\n  display: flex;\n  flex-direction: column;\n  gap: 0.35rem;\n  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.02);\n}\n.import-skip-log-entry-header {\n  font-weight: 600;\n  font-size: 12px;\n  letter-spacing: 0.05em;\n  text-transform: uppercase;\n  color: var(--ink-muted);\n}\n.import-skip-log-entry-note {\n  color: var(--ink-muted);\n  font-size: 11px;\n}\n.import-skip-log-token-list {\n  margin: 0;\n  padding-left: 1.1rem;\n}\n.import-skip-log-token-list li {\n  margin-bottom: 0.2rem;\n}\nbutton.link-button {\n  background: none;\n  border: none;\n  padding: 0;\n  color: var(--accent);\n  font-size: 12px;\n  cursor: pointer;\n  text-decoration: underline;\n}\nbutton.link-button:disabled {\n  opacity: 0.5;\n  cursor: not-allowed;\n  text-decoration: none;\n}\npre {\n  margin: 0;\n  padding: 0.75rem;\n  background: var(--log-surface);\n  color: var(--ink);\n  border: 1px solid var(--border);\n  border-radius: 16px;\n  font-family:\n    "SFMono-Regular",\n    Menlo,\n    Consolas,\n    "Cascadia Code",\n    "Source Code Pro",\n    "JetBrains Mono",\n    ui-monospace,\n    monospace;\n  font-size: 11px;\n  white-space: pre-wrap;\n  overflow-wrap: anywhere;\n  word-break: break-word;\n  overflow: auto;\n  min-width: 0;\n  min-height: 0;\n  flex: 1;\n  height: 100%;\n  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);\n}\n#log {\n  background: var(--log-surface);\n  color: var(--ink);\n  font-family:\n    ui-monospace,\n    SFMono-Regular,\n    Menlo,\n    Consolas,\n    "Liberation Mono",\n    monospace;\n  font-size: 12px;\n  line-height: 1.5;\n  padding: 16px;\n  border-radius: 16px;\n  border: 1px solid var(--border);\n  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05), 0 10px 25px rgba(0, 0, 0, 0.55);\n  overflow-y: auto;\n  min-height: 140px;\n  max-height: 100%;\n}\n#log a {\n  color: var(--accent);\n  font-weight: 600;\n  text-decoration-color: rgba(254, 138, 201, 0.6);\n  text-underline-offset: 3px;\n}\n#log a:hover,\n#log a:focus-visible {\n  color: var(--ink);\n  text-decoration-color: rgba(255, 255, 255, 0.9);\n  outline: 2px solid rgba(254, 138, 201, 0.4);\n  outline-offset: 2px;\n}\n#log > div {\n  padding: 2px 0;\n  white-space: pre-wrap;\n}\n.stack {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n  flex: 1;\n  min-height: 0;\n}\n.row-center {\n  display: flex;\n  gap: 8px;\n  align-items: center;\n  justify-content: space-between;\n}\n.drawer {\n  grid-column: 1 / -1;\n  grid-row: 2;\n  display: flex;\n  flex-direction: column;\n  min-height: 0;\n  min-width: 0;\n  border: 1px solid var(--border);\n  background: var(--surface-elevated);\n  border-radius: 22px;\n  padding: 0.75rem;\n  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.55);\n}\n.drawer .panel-header {\n  border-bottom: 1px solid var(--border);\n}\n.drawer-body {\n  padding: 0.5rem;\n  min-height: 0;\n  min-width: 0;\n  flex: 1;\n  display: flex;\n  flex-direction: column;\n}\n#log {\n  display: block;\n  padding: 16px;\n  background: var(--log-surface);\n  color: var(--ink);\n  border: 1px solid var(--border);\n  border-radius: 16px;\n  font-family:\n    ui-monospace,\n    SFMono-Regular,\n    Menlo,\n    Consolas,\n    "Liberation Mono",\n    monospace;\n  font-size: 12px;\n  white-space: pre-wrap;\n  overflow-y: auto;\n  min-width: 0;\n  min-height: 0;\n  flex: 1;\n  height: 100%;\n  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05), 0 12px 30px rgba(0, 0, 0, 0.6);\n}\n.resize-handle {\n  position: fixed;\n  right: 6px;\n  bottom: 6px;\n  width: 14px;\n  height: 14px;\n  border-radius: 3px;\n  cursor: nwse-resize;\n  display: grid;\n  place-items: center;\n  z-index: 2147483647;\n  touch-action: none;\n  user-select: none;\n}\n.resize-handle::after {\n  content: "";\n  width: 8px;\n  height: 8px;\n  border-right: 2px solid rgba(255, 255, 255, 0.4);\n  border-bottom: 2px solid rgba(255, 255, 255, 0.4);\n  transform: translate(1px, 1px);\n  pointer-events: none;\n}\n#exportBtn {\n  margin-top: 0.5rem;\n  width: 100%;\n}\n.shell.drawer-collapsed .drawer {\n  padding: 0;\n  background: transparent;\n  border: 0;\n}\n.shell.drawer-collapsed .drawer .panel-header {\n  padding: 6px 10px;\n  border: 1px solid var(--border);\n  border-radius: 14px;\n  background: var(--surface);\n  border-bottom: 1px solid var(--border);\n}\n.shell.drawer-collapsed .drawer .title {\n  display: none;\n}\n.shell.drawer-collapsed .drawer .eyebrow {\n  margin: 0;\n}\n.panel-header .actions {\n  display: flex;\n  gap: 8px;\n  align-items: center;\n}\n.panel-header button {\n  font-size: 11px;\n  padding: 6px 12px;\n  border: 1px solid var(--border);\n  background: rgba(255, 255, 255, 0.08);\n  color: var(--ink);\n  border-radius: 999px;\n  cursor: pointer;\n  transition: background 140ms ease;\n}\n.panel-header button:hover {\n  background: rgba(255, 255, 255, 0.18);\n}\n.tabs {\n  display: flex;\n  gap: 0.25rem;\n  align-items: center;\n}\n.tab-btn {\n  font-size: 1rem;\n  padding: 0.45rem 1rem;\n  border: 1px solid var(--border);\n  background: rgba(255, 255, 255, 0.06);\n  color: var(--ink);\n  border-radius: 999px;\n  cursor: pointer;\n  transition:\n    background 150ms ease,\n    color 150ms ease,\n    border-color 150ms ease;\n}\n.tab-btn:hover {\n  color: var(--ink);\n  background: rgba(255, 255, 255, 0.12);\n}\n.tab-btn.is-active:hover {\n  background:\n    linear-gradient(\n      120deg,\n      var(--accent),\n      var(--accent-secondary));\n  color: var(--accent-ink);\n  cursor: default;\n}\n.tab-btn.is-active {\n  background:\n    linear-gradient(\n      120deg,\n      var(--accent),\n      var(--accent-secondary));\n  color: var(--accent-ink);\n  border-color: transparent;\n  box-shadow: var(--glow-pink);\n}\n.modal-overlay {\n  position: fixed;\n  inset: 0;\n  display: none;\n  align-items: center;\n  justify-content: center;\n  background: rgba(2, 3, 8, 0.75);\n  backdrop-filter: blur(10px);\n  padding: 1.5rem;\n  z-index: 99999;\n}\n.modal-overlay.is-open {\n  display: flex;\n}\n.folder-picker-modal {\n  width: min(560px, 92vw);\n  max-height: 80vh;\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n  background: rgba(7, 9, 22, 0.95);\n  border: 1px solid var(--border);\n  border-radius: 18px;\n  box-shadow: 0 40px 80px rgba(0, 0, 0, 0.6);\n  padding: 16px;\n}\n.import-scope-modal {\n  width: min(420px, 92vw);\n}\n.import-scope-body {\n  max-height: 240px;\n  overflow: auto;\n  display: flex;\n  flex-direction: column;\n  gap: 0.5rem;\n}\n.import-scope-group {\n  border: 1px solid var(--border);\n  border-radius: 14px;\n  background: rgba(255, 255, 255, 0.03);\n  padding: 0.75rem;\n  display: flex;\n  flex-direction: column;\n  gap: 0.35rem;\n}\n.import-scope-group h3 {\n  margin: 0 0 0.25rem 0;\n  font-size: 13px;\n}\n.import-scope-mode {\n  display: flex;\n  align-items: center;\n  gap: 0.5rem;\n  font-size: 12px;\n}\n.import-scope-footer {\n  display: flex;\n  gap: 0.5rem;\n  justify-content: flex-end;\n}\n.import-scope-remember {\n  display: flex;\n  flex-direction: column;\n  gap: 0.25rem;\n  font-size: 12px;\n}\n.import-scope-remember label {\n  display: flex;\n  align-items: center;\n  gap: 0.35rem;\n}\n.import-scope-missing {\n  font-size: 11px;\n  color: var(--ink-muted);\n  margin: 0;\n}\n.folder-picker-header {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n}\n.folder-picker-title {\n  font-size: 14px;\n  font-weight: 600;\n  color: var(--ink);\n}\n.folder-picker-path-row {\n  display: flex;\n  gap: 8px;\n  align-items: center;\n}\n.folder-picker-path-row input {\n  flex: 1;\n}\n.folder-picker-list {\n  border: 1px solid var(--border);\n  border-radius: 14px;\n  background: rgba(255, 255, 255, 0.02);\n  min-height: 160px;\n  max-height: 50vh;\n  overflow: auto;\n  padding: 6px;\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n.folder-picker-row {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  padding: 6px 8px;\n  border: 0;\n  border-radius: 6px;\n  background: transparent;\n  font-size: 12px;\n  color: inherit;\n  cursor: pointer;\n  text-align: left;\n}\n.folder-picker-row:not([disabled]):hover {\n  background: rgba(255, 255, 255, 0.08);\n}\n.folder-picker-row.is-muted {\n  color: var(--ink-muted);\n  cursor: default;\n}\n.folder-picker-row.is-muted:hover {\n  background: transparent;\n}\n.folder-picker-row[disabled] {\n  cursor: default;\n}\n.folder-picker-actions {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  gap: 8px;\n}\n.tab-panel {\n  display: none;\n  flex-direction: column;\n  gap: 12px;\n  min-width: 0;\n  min-height: 0;\n  flex: 1;\n}\n.tab-panel.is-active {\n  display: flex;\n}\n.tab-panel--scroll {\n  flex: 1 1 auto;\n  min-height: 0;\n  overflow: auto;\n}\n.github-panel {\n  gap: 12px;\n}\n#panel-github button {\n  font-size: 12px;\n  padding: 6px 10px;\n  border-width: 1px;\n}\n#panel-github .css-button-neumorphic {\n  min-width: 0;\n  height: auto;\n  padding: 6px 10px;\n}\n.gh-section {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  flex: 0 0 auto;\n  min-height: auto;\n}\n.gh-auth-actions {\n  display: flex;\n  gap: 8px;\n  flex-wrap: wrap;\n}\n.gh-auth-actions button {\n  min-width: 0;\n}\n.gh-auth-status,\n.gh-auth-meta {\n  font-size: 12px;\n}\n.gh-remember {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  flex-wrap: wrap;\n}\n.gh-remember-toggle {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n}\n.gh-repo-combo {\n  position: relative;\n  display: flex;\n  align-items: center;\n}\n.gh-repo-combo select {\n  appearance: none;\n  -webkit-appearance: none;\n  -moz-appearance: none;\n  padding-right: 28px;\n  border-radius: 12px;\n  background-color: var(--surface-elevated);\n  cursor: pointer;\n}\n[data-theme=light] .gh-repo-combo select {\n  background-color: var(--surface-elevated);\n}\n.gh-repo-combo select:disabled {\n  cursor: not-allowed;\n  color: var(--ink-muted);\n  background: rgba(255, 255, 255, 0.02);\n}\n.gh-repo-combo::after {\n  content: "\\25be";\n  position: absolute;\n  right: 10px;\n  pointer-events: none;\n  color: var(--ink-muted);\n  font-size: 20px;\n}\n.gh-repo-combo:focus-within select:not(:disabled) {\n  border-color: var(--accent);\n}\n.gh-branch-search {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  flex-wrap: wrap;\n}\n.gh-branch-label-row {\n  display: flex;\n  align-items: baseline;\n  justify-content: flex-start;\n  gap: 6px;\n}\n.gh-branch-combo {\n  position: relative;\n  --branch-toggle-width: 32px;\n  flex: 1 1 0;\n  min-width: 0;\n  display: flex;\n  align-items: stretch;\n}\n.gh-branch-combo input {\n  flex: 1 1 0;\n  min-width: 0;\n  border-top-right-radius: 0;\n  border-bottom-right-radius: 0;\n  padding-right: 24px;\n}\n.gh-branch-toggle {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: var(--branch-toggle-width);\n  min-width: var(--branch-toggle-width);\n  padding: 0;\n  border: 1px solid var(--border);\n  border-left: none;\n  border-top-left-radius: 0;\n  border-bottom-left-radius: 0;\n  border-top-right-radius: 12px;\n  border-bottom-right-radius: 12px;\n  background: rgba(255, 255, 255, 0.06);\n  color: var(--ink);\n  font-size: 12px;\n  cursor: pointer;\n  box-shadow: none;\n}\n.gh-branch-toggle:hover:not([disabled]) {\n  background: rgba(255, 255, 255, 0.12);\n  transform: none;\n  box-shadow: none;\n}\n.gh-branch-toggle[disabled] {\n  cursor: not-allowed;\n  opacity: 0.5;\n}\nbutton.gh-branch-clear {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  padding: 0;\n  margin: 0;\n  border: none;\n  background: rgba(255, 255, 255, 0.04);\n  color: var(--ink-muted);\n  font-size: 20px;\n  font-weight: normal;\n  cursor: pointer;\n  position: absolute;\n  right: var(--branch-toggle-width);\n  top: 50%;\n  transform: translateY(-50%);\n  line-height: 1;\n  width: 24px;\n  height: calc(100% - 2px);\n  box-shadow: none;\n  border-radius: 0;\n  z-index: 10;\n}\nbutton.gh-branch-clear:hover,\nbutton.gh-branch-clear:active,\nbutton.gh-branch-clear:focus {\n  transform: translateY(-50%);\n  box-shadow: none;\n  background: rgba(255, 255, 255, 0.04);\n}\nbutton.gh-branch-clear[hidden] {\n  display: none;\n}\n.gh-branch-menu {\n  position: absolute;\n  top: calc(100% + 4px);\n  left: 0;\n  right: 0;\n  max-height: 216px;\n  margin: 0;\n  padding: 4px 0;\n  list-style: none;\n  border: 1px solid var(--border);\n  border-radius: 14px;\n  background: var(--surface-elevated);\n  box-shadow: 0 25px 45px rgba(0, 0, 0, 0.55);\n  overflow-y: auto;\n  z-index: 20;\n}\n.gh-branch-menu[hidden] {\n  display: none;\n}\n.gh-branch-item {\n  padding: 6px 10px;\n  font-size: 12px;\n  cursor: pointer;\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  color: var(--ink);\n}\n.gh-branch-item[data-active="1"],\n.gh-branch-item:hover {\n  background: rgba(255, 255, 255, 0.08);\n}\n.gh-branch-item[aria-disabled=true] {\n  cursor: default;\n  color: var(--ink-muted);\n  background: transparent;\n}\n.gh-branch-item-action {\n  font-weight: 600;\n}\n.gh-branch-item-empty {\n  cursor: default;\n  color: var(--ink-muted);\n}\n.gh-branch-menu::after {\n  content: "";\n  position: absolute;\n  inset: 0;\n  border-radius: 14px;\n  pointer-events: none;\n}\n.gh-branch-combo:focus-within .gh-branch-toggle:not([disabled]) {\n  border-color: var(--accent);\n}\n.gh-branch-combo:focus-within input:not(:disabled) {\n  border-color: var(--accent);\n}\n[data-theme=light] .gh-branch-toggle {\n  background: var(--surface);\n  box-shadow: none;\n}\n.gh-branch-toggle:active {\n  transform: none;\n  box-shadow: none;\n}\n[data-theme=light] .gh-branch-combo input:not(:disabled) {\n  background: var(--surface);\n}\n[data-theme=light] .gh-branch-menu {\n  background: var(--surface-elevated);\n}\n.gh-branch-count {\n  flex: 0 0 auto;\n  min-width: 7ch;\n  white-space: nowrap;\n  font-size: 12px;\n  text-align: right;\n  font-variant-numeric: tabular-nums;\n}\n.gh-branch-actions {\n  display: flex;\n  gap: 8px;\n  flex-wrap: wrap;\n  align-self: flex-start;\n}\n.gh-branch-actions button {\n  flex: 0 0 auto;\n}\n.gh-branch-refresh,\n.gh-new-branch-btn,\n#ghPickFolderBtn {\n  align-self: flex-start;\n}\n.gh-new-branch-row {\n  display: flex;\n  gap: 8px;\n  flex-wrap: wrap;\n}\n.gh-new-branch-row input {\n  flex: 1 1 auto;\n  min-width: 0;\n}\n#ghTokenInput.gh-mask {\n  -webkit-text-security: disc;\n}\n/*# sourceMappingURL=ui.css.map */\n</style>\n</head>\n\n<body>\n  <div class="shell">\n    <!-- Left: Actions -->\n    <div class="col">\n      <div class="panel">\n        <div class="panel-header">\n          <div>\n            <div class="eyebrow">Actions</div>\n            <h2 class="title">Import, Export &amp; GitHub</h2>\n          </div>\n          <div class="tabs" role="tablist" aria-label="Actions tabs">\n            <button class="tab-btn is-active" data-tab="import" role="tab" aria-selected="true"\n              aria-controls="panel-import">Import</button>\n            <button class="tab-btn" data-tab="export" role="tab" aria-selected="false"\n              aria-controls="panel-export">Export</button>\n            <button class="tab-btn" data-tab="github" role="tab" aria-selected="false"\n              aria-controls="panel-github">GitHub</button>\n          </div>\n        </div>\n\n        <div class="panel-body">\n          <!-- Import tab -->\n          <div class="tab-panel is-active" id="panel-import" data-tab="import" role="tabpanel"\n            aria-labelledby="tab-import">\n            <div class="stack">\n              <div class="eyebrow">Import DTCG</div>\n              <div>\n                <label>Choose a DTCG JSON file</label>\n                <div class="muted" style="padding: .5rem 0">Imports collections/modes as defined in the file.</div>\n                <input id="file" type="file" accept=".json,application/json" />\n              </div>\n              <div class="row">\n                <button id="importBtn" class="css-button-neumorphic">Import</button>\n              </div>\n              <div class="row">\n                <div style="display: flex; gap: .25rem;">\n                  <input id="allowHexChk" type="checkbox" />\n                  <label for="allowHexChk" class="muted" style="padding-top: .35rem;">Accept hex strings as\n                    colors</label>\n                </div>\n              </div>\n              <!-- <div id="importScopeSummary" class="import-scope-summary" hidden>\n                <div id="importScopeSummaryText" class="muted"></div>\n                <button id="importScopeClearBtn" class="link-button" type="button">Clear remembered selection</button>\n              </div> -->\n              <div class="import-skip-log">\n                <div class="eyebrow">Import summaries</div>\n                <div id="importSkipLogEmpty" class="muted">No partial import history yet.</div>\n                <div id="importSkipLogList" class="import-skip-log-list"></div>\n              </div>\n            </div>\n          </div>\n\n          <!-- Export tab -->\n          <div class="tab-panel" id="panel-export" data-tab="export" role="tabpanel" aria-labelledby="tab-export">\n            <div class="stack" style="border-top:1px solid var(--border);padding-top:12px;">\n              <div class="eyebrow">Export DTCG</div>\n              <div class="row-center"></div>\n              <div class="stack" id="exportPickers">\n                <div>\n                  <label>Collection</label>\n                  <select id="collectionSelect"></select>\n                </div>\n                <div>\n                  <label>Mode (within collection)</label>\n                  <select id="modeSelect"></select>\n                </div>\n                <div>\n                  <div class="muted">Select a collection and mode, or check \u201CExport all\u201D.</div>\n                  <label><input type="checkbox" id="exportAllChk" /> Export all collections &amp; modes (creates a\n                    single\n                    file)</label>\n                  <div class="stack" style="gap:6px; margin:8px 0;">\n                    <label class="muted" style="display:flex; align-items:center; gap:.35rem;">\n                      <input type="checkbox" id="styleDictionaryChk" />\n                      <span>Export color tokens as hex values</span>\n                    </label>\n                    <label class="muted" style="display:flex; align-items:center; gap:.35rem;">\n                      <input type="checkbox" id="flatTokensChk" />\n                      <span>Flatten collections (omit top-level collection groups)</span>\n                    </label>\n                  </div>\n                  <button id="exportBtn" class="css-button-neumorphic">Export</button>\n                </div>\n                <div style="border-top:1px solid var(--border); padding-top:12px; margin-top:8px;">\n                  <div class="muted" style="margin-bottom:8px;">Typography tokens are exported separately.</div>\n                  <button id="exportTypographyBtn" class="css-button-neumorphic">Export typography.json</button>\n                  <div class="muted" style="margin-top:6px;">Saves all local text styles as DTCG typography tokens.\n                  </div>\n                </div>\n              </div>\n            </div>\n          </div>\n          <!-- /Export tab -->\n\n          <!-- GitHub tab -->\n          <div class="tab-panel" id="panel-github" data-tab="github" role="tabpanel" aria-labelledby="tab-github">\n            <div class="stack tab-panel--scroll github-panel">\n\n              <!-- Auth row -->\n              <div class="stack gh-section gh-auth">\n                <h3 class="eyebrow">GitHub Authentication</h3>\n                <label>Personal Access Token (PAT)</label>\n                <input id="ghTokenInput" type="password" placeholder="GitHub personal access token"\n                  autocomplete="off" />\n                <div class="muted gh-remember">\n                  <span>Store on this device?</span>\n                  <div class="row">\n            <label>\n              <input type="checkbox" id="githubRememberChk" checked />\n              Remember access token\n            </label>\n          </div>      </div>\n                <div class="gh-auth-actions" style="margin-bottom: .5rem;">\n                  <button id="ghConnectBtn" class="css-button-neumorphic">Connect</button>\n                  <button id="ghLogoutBtn" class="css-button-neumorphic" type="button">Log out</button>\n                </div>\n                <div id="ghAuthStatus" class="muted gh-auth-status"></div>\n                <div id="ghTokenMeta" class="muted gh-auth-meta"></div>\n              </div>\n\n              <!-- Export scope -->\n              <div class="row">\n                <div>\n                  <h3 class="eyebrow" style="margin: .5rem;">Export scope</h3>\n                  <div class="col" style="gap:.5rem;">\n                    <label style="display:flex; align-items:center; gap:.35rem;">\n                      <input type="radio" name="ghScope" id="ghScopeSelected" checked />\n                      Use export tab selection (collection and mode)\n                    </label>\n                    <label style="display:flex; align-items:center; gap:.35rem;">\n                      <input type="radio" name="ghScope" id="ghScopeAll" />\n                      All collections &amp; modes\n                    </label>\n                    <label style="display:flex; align-items:center; gap:.35rem;">\n                      <input type="radio" name="ghScope" id="ghScopeTypography" />\n                      Typography (text styles)\n                    </label>\n                  </div>\n                </div>\n              </div>\n\n              <!-- Repo picker -->\n              <div class="stack gh-section">\n                <h3 class="eyebrow">Export repository details</h3>\n                <label>Export repository</label>\n                <div class="gh-repo-combo">\n                  <select id="ghRepoSelect" disabled></select>\n                </div>\n                <div class="muted">Repos you own or are a member of (populated after Connect).</div>\n              </div>\n\n              <!-- Branch controls -->\n              <div class="stack gh-section">\n                <div class="gh-branch-label-row">\n                  <label>Export repository branch:</label>\n                  <div id="ghBranchCount" class="muted gh-branch-count"></div>\n                </div>\n                <div class="gh-branch-search">\n                  <div class="gh-branch-combo">\n                    <input id="ghBranchInput" type="text" placeholder="Pick a repository first\u2026" autocomplete="off"\n                      disabled />\n                    <button id="ghBranchClearBtn" class="gh-branch-clear" type="button" aria-label="Clear search" hidden>\n                      <span aria-hidden="true">\xD7</span>\n                    </button>\n                    <button id="ghBranchToggleBtn" class="gh-branch-toggle" type="button" aria-label="Show branches"\n                      aria-haspopup="listbox" disabled>\n                      <span aria-hidden="true">\u25BE</span>\n                    </button>\n                    <ul id="ghBranchMenu" class="gh-branch-menu" role="listbox" aria-label="Branches" hidden></ul>\n                  </div>\n                </div>\n                <div class="gh-branch-actions">\n                  <button id="ghBranchRefreshBtn" class="css-button-neumorphic gh-branch-refresh"\n                    type="button">Refresh</button>\n                  <button id="ghNewBranchBtn" class="css-button-neumorphic gh-new-branch-btn" disabled\n                    type="button">Create new\u2026</button>\n                </div>\n                <div id="ghNewBranchRow" class="gh-new-branch-row" style="display:none;">\n                  <input id="ghNewBranchName" type="text" placeholder="feature/my-branch" />\n                  <button id="ghCreateBranchConfirmBtn" class="css-button-neumorphic" type="button">Create</button>\n                  <button id="ghCancelBranchBtn" class="css-button-neumorphic" type="button">Cancel</button>\n                </div>\n              </div>\n\n              <!-- Destination folder -->\n              <div class="stack gh-section" style="margin-top: .5rem;">\n                <h3 class="eyebrow">Export destination folder and file name</h3>\n                <label>Destination folder (in repo)</label>\n                <button id="ghPickFolderBtn" class="css-button-neumorphic" disabled type="button">Pick a\n                  folder\u2026</button>\n                <div id="ghFolderDisplay" class="gh-folder-display is-placeholder" aria-live="polite">Folder path\u2026\n                </div>\n                <input id="ghFolderInput" type="hidden" value="" />\n                <label for="ghFilenameInput">Filename</label>\n                <input id="ghFilenameInput" type="text" value="tokens.json" autocomplete="off" />\n                <div id="ghFilenameError" class="gh-input-error" aria-live="polite" hidden></div>\n              </div>\n\n\n\n              <!-- Commit -->\n              <div class="row">\n                <div>\n                  <h3 class="eyebrow" style="margin-bottom: .5rem;">Commit/pull request details</h3>\n                  <label>Commit message</label>\n                  <input id="ghCommitMsgInput" type="text" value="Update tokens from Figma" />\n                </div>\n              </div>\n\n              <!-- PR toggle -->\n              <div class="row">\n                <div>\n                  <label>Pull request</label>\n                  <label style="display:flex; align-items:center; gap:.35rem;">\n                    <input type="checkbox" id="ghCreatePrChk" />\n                    Create a pull request after committing\n                  </label>\n                  <div id="ghPrOptions" class="stack" style="margin-top:.5rem; display:none; gap:.5rem;">\n                    <input id="ghPrTitleInput" type="text" placeholder="Pull request title" />\n                    <textarea id="ghPrBodyInput" rows="3" placeholder="Optional PR description"></textarea>\n                  </div>\n                </div>\n              </div>\n\n\n\n              <!-- Actions -->\n              <div class="row">\n                <div class="row" style="gap:.5rem;">\n                  <button id="ghExportAndCommitBtn" class="css-button-neumorphic" disabled>Export &amp; Commit /\n                    PR</button>\n                </div>\n              </div>\n\n              <!-- Import from GitHub -->\n              <div class="row" style="margin-top: .5rem;">\n                <div>\n                  <h3 class="eyebrow" style="padding-bottom: .25rem;">Import from tokens from GitHub</h3>\n                  <label>Directory path to tokens in GitHub</label>\n                  <!-- <div class="muted" style="margin: .25rem;">(Downloads a JSON file from the selected repo/branch and\n                    imports it.)</div> -->\n                  <div class="row">\n                    <input id="ghFetchPathInput" type="text" placeholder="path/to/tokens-folder/design-token.json" />\n                    <div style="flex:0 0 auto;">\n                      <button id="ghFetchTokensBtn" class="css-button-neumorphic" disabled>Fetch &amp; Import</button>\n                    </div>\n                  </div>\n                  <div id="ghImportStatus" class="gh-import-status">Select a repository and branch to enable imports.\n                  </div>\n                </div>\n              </div>\n            </div>\n          </div>\n        </div>\n      </div>\n    </div>\n\n    <!-- Middle: Raw Figma Collections -->\n    <div class="col">\n      <div class="panel">\n        <div class="panel-header">\n          <div>\n            <div class="eyebrow">Reference</div>\n            <h2 class="title">Figma Document</h2>\n          </div>\n          <div class="actions">\n            <button id="copyRawBtn" title="Copy raw collections">Copy</button>\n            <button id="refreshBtn">Refresh</button>\n          </div>\n        </div>\n        <div class="panel-body">\n          <pre id="raw"></pre>\n        </div>\n      </div>\n    </div>\n\n    <!-- Right: W3C Preview -->\n    <div class="col">\n      <div class="panel">\n        <div class="panel-header">\n          <div>\n            <div class="eyebrow">Preview</div>\n            <h2 class="title">W3C Design Tokens (JSON)</h2>\n          </div>\n          <button id="copyW3cBtn" title="Copy W3C JSON">Copy</button>\n        </div>\n        <div class="panel-body">\n          <pre id="w3cPreview">{ /* preview will render here */ }</pre>\n        </div>\n      </div>\n    </div>\n\n    <!-- Bottom drawer: tabs span all columns -->\n    <div class="drawer">\n      <div class="panel-header">\n        <div>\n          <div class="eyebrow">Diagnostics</div>\n          <h2 class="title">Activity Log</h2>\n        </div>\n        <div class="actions">\n          <button id="copyLogBtn" title="Copy log">Copy</button>\n          <button id="drawerToggleBtn" class="drawer-toggle" aria-expanded="true" title="Hide log">Hide</button>\n        </div>\n      </div>\n\n      <div class="drawer-body">\n        <div id="log"></div>\n      </div>\n    </div>\n\n    <div id="importScopeOverlay" class="modal-overlay" hidden aria-hidden="true">\n      <div class="folder-picker-modal import-scope-modal" role="dialog" aria-modal="true"\n        aria-labelledby="importScopeTitle">\n        <h2 id="importScopeTitle" class="folder-picker-title">Select a mode to import</h2>\n        <p class="muted" style="margin:0;">Choose which collection and mode to bring into this file.</p>\n        <p id="importScopeMissingNotice" class="import-scope-missing" hidden></p>\n        <div id="importScopeBody" class="import-scope-body"></div>\n        <!-- <div class="import-scope-remember">\n          <label><input type="checkbox" id="importScopeRememberChk" /> Remember my choice for next time</label>\n          <span class="muted">You can clear this later from the import panel.</span>\n        </div> -->\n        <div class="import-scope-footer">\n          <button id="importScopeConfirmBtn" class="css-button-neumorphic" type="button">Import selected mode</button>\n          <button id="importScopeCancelBtn" class="css-button-neumorphic" type="button">Cancel</button>\n        </div>\n      </div>\n    </div>\n\n    <div id="folderPickerOverlay" class="modal-overlay" hidden aria-hidden="true">\n      <div class="folder-picker-modal" role="dialog" aria-modal="true" aria-labelledby="folderPickerTitle">\n        <div class="folder-picker-header">\n          <div class="eyebrow">Pick destination</div>\n          <div id="folderPickerTitle" class="folder-picker-title">owner/repo @ branch</div>\n        </div>\n        <div class="folder-picker-path-row">\n          <input id="folderPickerPath" type="text" placeholder="tokens/ (optional)" autocomplete="off" />\n          <button id="folderPickerUseBtn" class="tab-btn">Use this folder</button>\n        </div>\n        <div id="folderPickerList" class="folder-picker-list">\n          <button class="folder-picker-row is-muted" type="button" disabled>Loading\u2026</button>\n        </div>\n        <div class="folder-picker-actions">\n          <button id="folderPickerCancelBtn" class="tab-btn">Cancel</button>\n        </div>\n      </div>\n    </div>\n\n    <div class="resize-handle" id="resizeHandle" title="Drag to resize"></div>\n\n    <script>"use strict";\n(() => {\n  // src/app/github/ui/auth.ts\n  var GH_MASK = "\\u2022\\u2022\\u2022\\u2022\\u2022\\u2022\\u2022\\u2022\\u2022\\u2022";\n  var GithubAuthUi = class {\n    constructor(deps) {\n      this.doc = null;\n      this.ghTokenInput = null;\n      this.ghRememberChk = null;\n      this.ghConnectBtn = null;\n      this.ghVerifyBtn = null;\n      this.ghLogoutBtn = null;\n      this.ghAuthStatusEl = null;\n      this.ghTokenMetaEl = null;\n      this.ghIsAuthed = false;\n      this.ghTokenExpiresAt = null;\n      this.ghRememberPref = true;\n      this.deps = deps;\n    }\n    attach(context) {\n      this.doc = context.document;\n      this.ghTokenInput = this.findTokenInput();\n      this.ghRememberChk = this.doc.getElementById(\n        "githubRememberChk"\n      ) || this.doc.getElementById("ghRememberChk");\n      this.ghConnectBtn = this.doc.getElementById(\n        "githubConnectBtn"\n      ) || this.doc.getElementById("ghConnectBtn");\n      this.ghVerifyBtn = this.doc.getElementById("githubVerifyBtn") || this.doc.getElementById("ghVerifyBtn");\n      this.ghLogoutBtn = this.doc.getElementById(\n        "ghLogoutBtn"\n      );\n      this.ensureGhStatusElements();\n      if (this.ghRememberChk) {\n        this.ghRememberChk.checked = this.ghRememberPref;\n        this.ghRememberChk.addEventListener("change", () => {\n          this.updateRememberPref(!!this.ghRememberChk.checked, true);\n        });\n      }\n      if (this.ghConnectBtn) {\n        this.ghConnectBtn.addEventListener(\n          "click",\n          () => this.onGitHubConnectClick()\n        );\n      }\n      if (this.ghVerifyBtn) {\n        this.ghVerifyBtn.addEventListener(\n          "click",\n          () => this.onGitHubVerifyClick()\n        );\n      }\n      if (this.ghLogoutBtn) {\n        this.ghLogoutBtn.addEventListener(\n          "click",\n          () => this.onGitHubLogoutClick()\n        );\n      }\n      this.updateGhStatusUi();\n    }\n    handleMessage(msg) {\n      if (msg.type === "GITHUB_AUTH_RESULT") {\n        const p = msg.payload || {};\n        this.ghIsAuthed = !!p.ok;\n        this.ghTokenExpiresAt = typeof p.exp !== "undefined" && p.exp !== null ? p.exp : typeof p.tokenExpiration !== "undefined" && p.tokenExpiration !== null ? p.tokenExpiration : null;\n        if (typeof p.remember === "boolean") {\n          this.updateRememberPref(p.remember, false);\n        }\n        if (this.ghIsAuthed) {\n          this.setPatFieldObfuscated(true);\n          const who = p.login || "unknown";\n          const name = p.name ? ` (${p.name})` : "";\n          this.deps.log(`GitHub: Authenticated as ${who}${name}.`);\n        } else {\n          this.setPatFieldObfuscated(false);\n          const why = p.error ? `: ${p.error}` : ".";\n          this.deps.log(`GitHub: Authentication failed${why}`);\n        }\n        this.updateGhStatusUi();\n        return true;\n      }\n      return false;\n    }\n    isAuthed() {\n      return this.ghIsAuthed;\n    }\n    logout() {\n      this.onGitHubLogoutClick();\n    }\n    findTokenInput() {\n      if (!this.doc) return null;\n      return this.doc.getElementById("githubTokenInput") || this.doc.getElementById("ghTokenInput") || this.doc.getElementById("githubPatInput") || this.doc.querySelector(\n        \'input[name="githubToken"]\'\n      ) || this.doc.querySelector(\n        \'input[type="password"]\'\n      );\n    }\n    readPatFromUi() {\n      if (!this.ghTokenInput) this.ghTokenInput = this.findTokenInput();\n      if (!this.ghTokenInput) return "";\n      if (this.ghTokenInput.getAttribute("data-filled") === "1")\n        return GH_MASK;\n      return (this.ghTokenInput.value || "").trim();\n    }\n    updateRememberPref(pref, persist = false) {\n      const next = !!pref;\n      this.ghRememberPref = next;\n      if (this.ghRememberChk) {\n        this.ghRememberChk.checked = this.ghRememberPref;\n      }\n      this.updateGhStatusUi();\n      if (persist) {\n        this.deps.postToPlugin({\n          type: "SAVE_PREFS",\n          payload: { githubRememberToken: this.ghRememberPref }\n        });\n      }\n    }\n    ensureGhStatusElements() {\n      if (!this.doc) return;\n      if (!this.ghAuthStatusEl)\n        this.ghAuthStatusEl = this.doc.getElementById("ghAuthStatus");\n      if (!this.ghTokenMetaEl)\n        this.ghTokenMetaEl = this.doc.getElementById("ghTokenMeta");\n      if (!this.ghLogoutBtn)\n        this.ghLogoutBtn = this.doc.getElementById(\n          "ghLogoutBtn"\n        );\n    }\n    formatTimeLeft(expInput) {\n      const exp = typeof expInput === "number" ? expInput : Date.parse(expInput);\n      if (!isFinite(exp)) return "expiration: unknown";\n      const now = Date.now();\n      const ms = exp - now;\n      if (ms <= 0) return "expired";\n      const days = Math.floor(ms / (24 * 60 * 60 * 1e3));\n      const hours = Math.floor(\n        ms % (24 * 60 * 60 * 1e3) / (60 * 60 * 1e3)\n      );\n      if (days > 0) return `${days}d ${hours}h left`;\n      const mins = Math.floor(ms % (60 * 60 * 1e3) / (60 * 1e3));\n      if (hours > 0) return `${hours}h ${mins}m left`;\n      const secs = Math.floor(ms % (60 * 1e3) / 1e3);\n      if (mins > 0) return `${mins}m ${secs}s left`;\n      return `${secs}s left`;\n    }\n    setPatFieldObfuscated(filled) {\n      if (!this.ghTokenInput) this.ghTokenInput = this.findTokenInput();\n      if (!this.ghTokenInput) return;\n      this.ghTokenInput.type = "password";\n      if (filled) {\n        this.ghTokenInput.value = GH_MASK;\n        this.ghTokenInput.setAttribute("data-filled", "1");\n      } else {\n        this.ghTokenInput.value = "";\n        this.ghTokenInput.removeAttribute("data-filled");\n      }\n    }\n    updateGhStatusUi() {\n      this.ensureGhStatusElements();\n      if (this.ghAuthStatusEl) {\n        this.ghAuthStatusEl.textContent = this.ghIsAuthed ? "GitHub: authenticated." : "GitHub: not authenticated.";\n      }\n      if (this.ghTokenMetaEl) {\n        const rememberTxt = this.ghRememberPref ? "Remember me: on" : "Remember me: off";\n        const expTxt = this.ghTokenExpiresAt ? `Token ${this.formatTimeLeft(this.ghTokenExpiresAt)}` : "Token expiration: unknown";\n        this.ghTokenMetaEl.textContent = `${expTxt} \\u2022 ${rememberTxt}`;\n      }\n      if (this.ghTokenInput) {\n        this.ghTokenInput.oninput = () => {\n          if (this.ghTokenInput && this.ghTokenInput.getAttribute("data-filled") === "1") {\n            this.ghTokenInput.removeAttribute("data-filled");\n          }\n          if (this.ghConnectBtn) this.ghConnectBtn.disabled = false;\n        };\n      }\n      if (this.ghConnectBtn && this.ghTokenInput) {\n        const isMasked = this.ghTokenInput.getAttribute("data-filled") === "1";\n        this.ghConnectBtn.disabled = this.ghIsAuthed && isMasked;\n      }\n      if (this.ghLogoutBtn) {\n        this.ghLogoutBtn.disabled = !this.ghIsAuthed;\n      }\n      if (this.ghRememberChk) {\n        this.ghRememberChk.checked = this.ghRememberPref;\n      }\n    }\n    onGitHubConnectClick() {\n      var _a;\n      const tokenRaw = this.readPatFromUi();\n      const isMasked = ((_a = this.ghTokenInput) == null ? void 0 : _a.getAttribute("data-filled")) === "1";\n      if (this.ghIsAuthed && isMasked) return;\n      if (!tokenRaw) {\n        this.deps.log("GitHub: Paste a Personal Access Token first.");\n        return;\n      }\n      const remember = !!(this.ghRememberChk && this.ghRememberChk.checked);\n      this.deps.log("GitHub: Verifying token\\u2026");\n      this.deps.postToPlugin({\n        type: "GITHUB_SET_TOKEN",\n        payload: { token: tokenRaw, remember }\n      });\n    }\n    onGitHubVerifyClick() {\n      this.onGitHubConnectClick();\n    }\n    onGitHubLogoutClick() {\n      this.deps.postToPlugin({ type: "GITHUB_FORGET_TOKEN" });\n      this.ghIsAuthed = false;\n      this.ghTokenExpiresAt = null;\n      this.setPatFieldObfuscated(false);\n      this.updateGhStatusUi();\n      this.deps.log("GitHub: Logged out.");\n    }\n  };\n\n  // src/app/ui/dom-helpers.ts\n  function h(tag, props, ...children) {\n    const el = document.createElement(tag);\n    if (props) {\n      for (const key in props) {\n        if (Object.prototype.hasOwnProperty.call(props, key)) {\n          const val = props[key];\n          if (key === "className") {\n            el.className = val;\n          } else if (key === "dataset" && typeof val === "object") {\n            for (const dKey in val) {\n              el.dataset[dKey] = val[dKey];\n            }\n          } else if (key === "style" && typeof val === "object") {\n            Object.assign(el.style, val);\n          } else if (key.startsWith("on") && typeof val === "function") {\n            el.addEventListener(key.substring(2).toLowerCase(), val);\n          } else if (key === "textContent") {\n            el.textContent = val;\n          } else if (val === true) {\n            if (key in el && typeof el[key] === "boolean") {\n              el[key] = true;\n            }\n            el.setAttribute(key, "");\n          } else if (val === false || val === null || val === void 0) {\n          } else {\n            el.setAttribute(key, String(val));\n          }\n        }\n      }\n    }\n    for (const child of children) {\n      if (typeof child === "string") {\n        el.appendChild(document.createTextNode(child));\n      } else if (child instanceof Node) {\n        el.appendChild(child);\n      }\n    }\n    return el;\n  }\n  function clearChildren(el) {\n    while (el.firstChild) {\n      el.removeChild(el.firstChild);\n    }\n  }\n\n  // src/app/github/ui/repo.ts\n  var GithubRepoUi = class {\n    constructor(deps) {\n      this.doc = null;\n      this.ghRepoSelect = null;\n      this.currentOwner = "";\n      this.currentRepo = "";\n      // Callbacks\n      this.onRepoChange = null;\n      this.deps = deps;\n    }\n    attach(context) {\n      this.doc = context.document;\n      this.ghRepoSelect = this.doc.getElementById(\n        "ghRepoSelect"\n      );\n      if (this.ghRepoSelect) {\n        let lastRepoKey = "";\n        this.ghRepoSelect.addEventListener("change", () => {\n          const value = this.ghRepoSelect.value;\n          if (!value) return;\n          if (value === lastRepoKey) return;\n          lastRepoKey = value;\n          const parts = value.split("/");\n          this.currentOwner = parts[0] || "";\n          this.currentRepo = parts[1] || "";\n          this.deps.postToPlugin({\n            type: "GITHUB_SELECT_REPO",\n            payload: {\n              owner: this.currentOwner,\n              repo: this.currentRepo\n            }\n          });\n          if (this.onRepoChange) {\n            this.onRepoChange(this.currentOwner, this.currentRepo);\n          }\n        });\n      }\n    }\n    handleMessage(msg) {\n      var _a, _b;\n      if (msg.type === "GITHUB_REPOS") {\n        const repos = (_b = (_a = msg.payload) == null ? void 0 : _a.repos) != null ? _b : [];\n        this.populateGhRepos(repos);\n        this.deps.log(`GitHub: Repository list updated (${repos.length}).`);\n        return true;\n      }\n      if (msg.type === "GITHUB_RESTORE_SELECTED") {\n        const p = msg.payload || {};\n        const newOwner = typeof p.owner === "string" ? p.owner : "";\n        const newRepo = typeof p.repo === "string" ? p.repo : "";\n        if (newOwner === this.currentOwner && newRepo === this.currentRepo) {\n          return false;\n        }\n        this.currentOwner = newOwner;\n        this.currentRepo = newRepo;\n        this.syncSelect();\n        if (this.currentOwner && this.currentRepo && this.onRepoChange) {\n          this.onRepoChange(this.currentOwner, this.currentRepo);\n        }\n        return false;\n      }\n      return false;\n    }\n    reset() {\n      this.populateGhRepos([]);\n      this.currentOwner = "";\n      this.currentRepo = "";\n    }\n    getSelected() {\n      return { owner: this.currentOwner, repo: this.currentRepo };\n    }\n    populateGhRepos(list) {\n      if (!this.ghRepoSelect || !this.doc) return;\n      clearChildren(this.ghRepoSelect);\n      for (const r of list) {\n        this.ghRepoSelect.appendChild(\n          h("option", { value: r.full_name }, r.full_name)\n        );\n      }\n      this.ghRepoSelect.disabled = list.length === 0;\n      if (list.length > 0) {\n        const prevOwner = this.currentOwner;\n        const prevRepo = this.currentRepo;\n        this.syncSelect();\n        if ((this.currentOwner !== prevOwner || this.currentRepo !== prevRepo) && this.onRepoChange) {\n          this.onRepoChange(this.currentOwner, this.currentRepo);\n        }\n      }\n    }\n    syncSelect() {\n      if (!this.ghRepoSelect) return;\n      if (this.currentOwner && this.currentRepo) {\n        const want = `${this.currentOwner}/${this.currentRepo}`;\n        let matched = false;\n        for (let i = 0; i < this.ghRepoSelect.options.length; i++) {\n          if (this.ghRepoSelect.options[i].value === want) {\n            this.ghRepoSelect.selectedIndex = i;\n            matched = true;\n            break;\n          }\n        }\n        if (matched) {\n        }\n      } else {\n        if (this.ghRepoSelect.options.length > 0) {\n          this.ghRepoSelect.selectedIndex = 0;\n          const val = this.ghRepoSelect.options[0].value;\n          const parts = val.split("/");\n          if (parts.length === 2) {\n            this.currentOwner = parts[0];\n            this.currentRepo = parts[1];\n          }\n        }\n      }\n    }\n  };\n\n  // src/app/ui/components/autocomplete.ts\n  var Autocomplete = class {\n    constructor(options) {\n      this.items = [];\n      this.highlightIndex = -1;\n      this.isOpen = false;\n      // Bound event handlers for add/remove symmetry\n      this.onInputFocus = () => {\n        this.open();\n        this.onQuery(this.input.value);\n      };\n      this.onInputInput = () => {\n        if (this.debounceTimer) window.clearTimeout(this.debounceTimer);\n        this.debounceTimer = window.setTimeout(() => {\n          this.open();\n          this.onQuery(this.input.value);\n        }, 120);\n      };\n      this.onInputKeydown = (e) => this.handleKeydown(e);\n      this.onToggleClick = (e) => {\n        e.preventDefault();\n        this.toggle();\n      };\n      this.onMenuMouseDown = (e) => e.preventDefault();\n      this.onMenuClick = (e) => {\n        const target = e.target;\n        const li = target.closest("li");\n        if (li) {\n          const index = Number(li.dataset.index);\n          if (!isNaN(index) && this.items[index]) {\n            this.select(index, false);\n          }\n        }\n      };\n      this.onDocumentMouseDown = (e) => {\n        if (!this.isOpen) return;\n        const target = e.target;\n        if (this.menu.contains(target) || this.input.contains(target) || this.toggleBtn && this.toggleBtn.contains(target)) {\n          return;\n        }\n        this.close();\n      };\n      this.input = options.input;\n      this.menu = options.menu;\n      this.toggleBtn = options.toggleBtn;\n      this.onQuery = options.onQuery;\n      this.onSelect = options.onSelect;\n      this.renderItem = options.renderItem || this.defaultRenderItem;\n      this.setupEvents();\n    }\n    setItems(items) {\n      this.items = items;\n      this.render();\n      if (this.isOpen) {\n        this.syncHighlight();\n      }\n    }\n    open() {\n      if (this.isOpen) return;\n      this.isOpen = true;\n      this.menu.hidden = false;\n      this.menu.setAttribute("data-open", "1");\n      this.input.setAttribute("aria-expanded", "true");\n      if (this.toggleBtn)\n        this.toggleBtn.setAttribute("aria-expanded", "true");\n      this.syncHighlight();\n    }\n    close() {\n      if (!this.isOpen) return;\n      this.isOpen = false;\n      this.menu.hidden = true;\n      this.menu.removeAttribute("data-open");\n      this.input.setAttribute("aria-expanded", "false");\n      if (this.toggleBtn)\n        this.toggleBtn.setAttribute("aria-expanded", "false");\n      this.setHighlight(-1);\n    }\n    destroy() {\n      window.clearTimeout(this.debounceTimer);\n      this.input.removeEventListener("focus", this.onInputFocus);\n      this.input.removeEventListener("input", this.onInputInput);\n      this.input.removeEventListener("keydown", this.onInputKeydown);\n      if (this.toggleBtn)\n        this.toggleBtn.removeEventListener("click", this.onToggleClick);\n      this.menu.removeEventListener("mousedown", this.onMenuMouseDown);\n      this.menu.removeEventListener("click", this.onMenuClick);\n      document.removeEventListener("mousedown", this.onDocumentMouseDown);\n    }\n    toggle() {\n      if (this.isOpen) this.close();\n      else {\n        this.input.focus();\n        this.open();\n        this.onQuery(this.input.value);\n      }\n    }\n    setupEvents() {\n      this.input.addEventListener("focus", this.onInputFocus);\n      this.input.addEventListener("input", this.onInputInput);\n      this.input.addEventListener("keydown", this.onInputKeydown);\n      if (this.toggleBtn) {\n        this.toggleBtn.addEventListener("click", this.onToggleClick);\n      }\n      this.menu.addEventListener("mousedown", this.onMenuMouseDown);\n      this.menu.addEventListener("click", this.onMenuClick);\n      document.addEventListener("mousedown", this.onDocumentMouseDown);\n    }\n    handleKeydown(e) {\n      if (e.key === "ArrowDown") {\n        e.preventDefault();\n        this.moveHighlight(1);\n        this.open();\n      } else if (e.key === "ArrowUp") {\n        e.preventDefault();\n        this.moveHighlight(-1);\n        this.open();\n      } else if (e.key === "Enter") {\n        if (this.isOpen && this.highlightIndex >= 0) {\n          e.preventDefault();\n          this.select(this.highlightIndex, true);\n        }\n      } else if (e.key === "Escape") {\n        if (this.isOpen) {\n          e.preventDefault();\n          this.close();\n        }\n      }\n    }\n    moveHighlight(delta) {\n      if (this.items.length === 0) return;\n      let next = this.highlightIndex + delta;\n      if (next >= this.items.length) next = 0;\n      if (next < 0) next = this.items.length - 1;\n      let scanned = 0;\n      while (scanned < this.items.length) {\n        const item = this.items[next];\n        if (item.type !== "info" && !item.disabled) {\n          this.setHighlight(next);\n          return;\n        }\n        next += delta;\n        if (next >= this.items.length) next = 0;\n        if (next < 0) next = this.items.length - 1;\n        scanned++;\n      }\n    }\n    setHighlight(index) {\n      this.highlightIndex = index;\n      const children = this.menu.children;\n      for (let i = 0; i < children.length; i++) {\n        const child = children[i];\n        if (i === index) {\n          child.setAttribute("data-active", "1");\n          child.scrollIntoView({ block: "nearest" });\n        } else {\n          child.removeAttribute("data-active");\n        }\n      }\n    }\n    syncHighlight() {\n      if (this.highlightIndex >= 0 && this.items[this.highlightIndex]) {\n        const item = this.items[this.highlightIndex];\n        if (item.type !== "info" && !item.disabled) {\n          this.setHighlight(this.highlightIndex);\n          return;\n        }\n      }\n      const first = this.items.findIndex(\n        (i) => i.type !== "info" && !i.disabled\n      );\n      this.setHighlight(first);\n    }\n    select(index, fromKeyboard) {\n      const item = this.items[index];\n      if (!item || item.disabled || item.type === "info") return;\n      this.onSelect(item, fromKeyboard);\n    }\n    render() {\n      clearChildren(this.menu);\n      this.items.forEach((item, index) => {\n        const el = this.renderItem(item);\n        el.dataset.index = String(index);\n        el.setAttribute("role", "option");\n        if (item.disabled) el.setAttribute("aria-disabled", "true");\n        this.menu.appendChild(el);\n      });\n    }\n    defaultRenderItem(item) {\n      return h("li", {\n        className: `autocomplete-item ${item.type === "info" ? "is-info" : ""}`,\n        textContent: item.label\n      });\n    }\n  };\n\n  // src/app/github/ui/branch.ts\n  var BRANCH_TTL_MS = 6e4;\n  var RENDER_STEP = 200;\n  var BRANCH_INPUT_PLACEHOLDER = "Search branches\\u2026";\n  var GithubBranchUi = class {\n    constructor(deps) {\n      this.doc = null;\n      this.win = null;\n      // Elements\n      this.ghBranchInput = null;\n      this.ghBranchClearBtn = null;\n      this.ghBranchToggleBtn = null;\n      this.ghBranchMenu = null;\n      this.ghBranchCountEl = null;\n      this.ghBranchRefreshBtn = null;\n      this.ghNewBranchBtn = null;\n      this.ghNewBranchRow = null;\n      this.ghNewBranchName = null;\n      this.ghCreateBranchConfirmBtn = null;\n      this.ghCancelBranchBtn = null;\n      // Components\n      this.autocomplete = null;\n      // State\n      this.currentOwner = "";\n      this.currentRepo = "";\n      this.desiredBranch = null;\n      this.defaultBranchFromApi = void 0;\n      this.loadedPages = 0;\n      this.hasMorePages = false;\n      this.isFetchingBranches = false;\n      this.lastBranchesFetchedAtMs = 0;\n      this.allBranches = [];\n      this.filteredBranches = [];\n      this.renderCount = 0;\n      this.lastQuery = "";\n      this.inputPristine = true;\n      // Callbacks\n      this.onBranchChange = null;\n      this.deps = deps;\n    }\n    attach(context) {\n      this.doc = context.document;\n      this.win = context.window;\n      this.ghBranchInput = this.doc.getElementById(\n        "ghBranchInput"\n      );\n      this.ghBranchClearBtn = this.doc.getElementById(\n        "ghBranchClearBtn"\n      );\n      this.ghBranchToggleBtn = this.doc.getElementById(\n        "ghBranchToggleBtn"\n      );\n      this.ghBranchMenu = this.doc.getElementById(\n        "ghBranchMenu"\n      );\n      this.ghBranchCountEl = this.doc.getElementById("ghBranchCount");\n      this.ghBranchRefreshBtn = this.doc.getElementById(\n        "ghBranchRefreshBtn"\n      );\n      this.ghNewBranchBtn = this.doc.getElementById(\n        "ghNewBranchBtn"\n      );\n      this.ghNewBranchRow = this.doc.getElementById("ghNewBranchRow");\n      this.ghNewBranchName = this.doc.getElementById(\n        "ghNewBranchName"\n      );\n      this.ghCreateBranchConfirmBtn = this.doc.getElementById(\n        "ghCreateBranchConfirmBtn"\n      );\n      this.ghCancelBranchBtn = this.doc.getElementById(\n        "ghCancelBranchBtn"\n      );\n      if (this.ghBranchInput && this.ghBranchMenu) {\n        this.autocomplete = new Autocomplete({\n          input: this.ghBranchInput,\n          menu: this.ghBranchMenu,\n          toggleBtn: this.ghBranchToggleBtn || void 0,\n          onQuery: (q) => this.handleQuery(q),\n          onSelect: (item, fromKeyboard) => this.handleSelect(item, fromKeyboard),\n          renderItem: (item) => this.renderAutocompleteItem(item)\n        });\n      }\n      this.setupEventListeners();\n    }\n    setRepo(owner, repo) {\n      this.currentOwner = owner;\n      this.currentRepo = repo;\n      this.reset();\n      if (owner && repo) {\n        this.setBranchDisabled(true, "Loading branches\\u2026");\n        this.updateBranchCount();\n        this.cancelNewBranchFlow(false);\n        this.deps.log(`GitHub: loading branches for ${owner}/${repo}\\u2026`);\n        this.isFetchingBranches = true;\n        this.deps.postToPlugin({\n          type: "GITHUB_FETCH_BRANCHES",\n          payload: { owner, repo, page: 1 }\n        });\n      } else {\n        this.setBranchDisabled(true, "Pick a repository first\\u2026");\n        this.updateBranchCount();\n        this.cancelNewBranchFlow(false);\n      }\n    }\n    getCurrentBranch() {\n      if (this.desiredBranch) return this.desiredBranch;\n      if (this.ghBranchInput && !this.ghBranchInput.disabled) {\n        const raw = this.ghBranchInput.value.trim();\n        if (raw && raw !== "__more__" && raw !== "__fetch__") {\n          if (this.allBranches.includes(raw) || raw === this.defaultBranchFromApi)\n            return raw;\n        }\n      }\n      return this.defaultBranchFromApi || "";\n    }\n    getPrBaseBranch() {\n      return this.defaultBranchFromApi || "";\n    }\n    handleMessage(msg) {\n      if (msg.type === "GITHUB_BRANCHES") {\n        const pl = msg.payload || {};\n        const owner = String(pl.owner || "");\n        const repo = String(pl.repo || "");\n        if (owner !== this.currentOwner || repo !== this.currentRepo)\n          return true;\n        this.lastBranchesFetchedAtMs = Date.now();\n        this.loadedPages = Number(pl.page || 1);\n        this.hasMorePages = !!pl.hasMore;\n        this.isFetchingBranches = false;\n        if (typeof pl.defaultBranch === "string" && !this.defaultBranchFromApi) {\n          this.defaultBranchFromApi = pl.defaultBranch;\n        }\n        if (this.ghNewBranchBtn) this.ghNewBranchBtn.disabled = false;\n        const names = Array.isArray(pl.branches) ? pl.branches.map((b) => b.name) : [];\n        const set = new Set(this.allBranches);\n        for (const n of names) if (n) set.add(n);\n        this.allBranches = Array.from(set).sort(\n          (a, b) => a.localeCompare(b)\n        );\n        this.applyBranchFilter();\n        this.setBranchDisabled(false);\n        this.deps.log(\n          `Loaded ${names.length} branches (page ${this.loadedPages}) for ${repo}${this.hasMorePages ? "\\u2026" : ""}`\n        );\n        return true;\n      }\n      if (msg.type === "GITHUB_BRANCHES_ERROR") {\n        const pl = msg.payload || {};\n        const owner = String(pl.owner || "");\n        const repo = String(pl.repo || "");\n        if (owner !== this.currentOwner || repo !== this.currentRepo)\n          return true;\n        this.isFetchingBranches = false;\n        this.setBranchDisabled(false);\n        this.deps.log(\n          `Branch load failed (status ${pl.status}): ${pl.message || "unknown error"}`\n        );\n        return true;\n      }\n      if (msg.type === "GITHUB_CREATE_BRANCH_RESULT") {\n        this.handleCreateBranchResult(msg.payload);\n        return true;\n      }\n      if (msg.type === "GITHUB_RESTORE_SELECTED") {\n        const p = msg.payload || {};\n        this.desiredBranch = typeof p.branch === "string" ? p.branch : null;\n        if (this.desiredBranch && this.ghBranchInput) {\n          this.ghBranchInput.value = this.desiredBranch;\n          this.lastQuery = this.desiredBranch;\n          this.inputPristine = false;\n          this.updateClearButtonVisibility();\n          if (this.onBranchChange)\n            this.onBranchChange(this.desiredBranch);\n        }\n        return false;\n      }\n      return false;\n    }\n    reset() {\n      this.desiredBranch = null;\n      this.defaultBranchFromApi = void 0;\n      this.loadedPages = 0;\n      this.hasMorePages = false;\n      this.isFetchingBranches = false;\n      this.allBranches = [];\n      this.filteredBranches = [];\n      this.renderCount = 0;\n      if (this.ghBranchInput) {\n        this.ghBranchInput.value = "";\n        this.lastQuery = "";\n        this.inputPristine = true;\n        this.updateClearButtonVisibility();\n      }\n      if (this.autocomplete) {\n        this.autocomplete.setItems([]);\n        this.autocomplete.close();\n      }\n    }\n    setupEventListeners() {\n      if (this.ghBranchInput) {\n        this.ghBranchInput.addEventListener("change", () => {\n          const val = this.ghBranchInput.value;\n          if (val && val !== "__more__" && val !== "__fetch__") {\n            this.processBranchSelection(val);\n          }\n        });\n      }\n      if (this.ghBranchClearBtn) {\n        this.ghBranchClearBtn.addEventListener("click", (e) => {\n          e.preventDefault();\n          e.stopPropagation();\n          if (this.ghBranchInput) {\n            this.ghBranchInput.value = "";\n            this.lastQuery = "";\n            this.desiredBranch = null;\n            this.inputPristine = false;\n            this.updateClearButtonVisibility();\n            this.handleQuery("");\n            this.ghBranchInput.focus();\n          }\n        });\n      }\n      if (this.ghBranchRefreshBtn) {\n        this.ghBranchRefreshBtn.addEventListener("click", () => {\n          this.lastBranchesFetchedAtMs = 0;\n          this.revalidateBranchesIfStale(true);\n        });\n      }\n      if (this.ghNewBranchBtn) {\n        this.ghNewBranchBtn.addEventListener("click", () => {\n          if (this.ghNewBranchBtn.disabled) return;\n          const next = !this.isNewBranchRowVisible();\n          if (next) this.showNewBranchRow(true);\n          else this.cancelNewBranchFlow(false);\n        });\n      }\n      if (this.ghNewBranchName) {\n        this.ghNewBranchName.addEventListener("keydown", (event) => {\n          if (event.key === "Enter") {\n            event.preventDefault();\n            this.requestNewBranchCreation();\n          } else if (event.key === "Escape") {\n            event.preventDefault();\n            this.cancelNewBranchFlow(true);\n          }\n        });\n      }\n      if (this.ghCreateBranchConfirmBtn) {\n        this.ghCreateBranchConfirmBtn.addEventListener(\n          "click",\n          () => this.requestNewBranchCreation()\n        );\n      }\n      if (this.ghCancelBranchBtn) {\n        this.ghCancelBranchBtn.addEventListener(\n          "click",\n          () => this.cancelNewBranchFlow(true)\n        );\n      }\n    }\n    handleQuery(query) {\n      if (query !== "__more__" && query !== "__fetch__") {\n        this.lastQuery = query;\n      }\n      this.inputPristine = false;\n      this.updateClearButtonVisibility();\n      this.applyBranchFilter();\n    }\n    handleSelect(item, fromKeyboard) {\n      if (item.value === "__more__") {\n        this.renderCount = Math.min(\n          this.renderCount + RENDER_STEP,\n          this.filteredBranches.length\n        );\n        this.updateAutocompleteItems();\n        this.updateBranchCount();\n        if (this.ghBranchInput) this.ghBranchInput.value = this.lastQuery;\n        if (this.autocomplete) this.autocomplete.open();\n        return;\n      }\n      if (item.value === "__fetch__") {\n        this.ensureNextPageIfNeeded();\n        if (this.ghBranchInput) this.ghBranchInput.value = this.lastQuery;\n        return;\n      }\n      this.processBranchSelection(item.value);\n      if (this.autocomplete) this.autocomplete.close();\n    }\n    revalidateBranchesIfStale(forceLog = false) {\n      if (!this.currentOwner || !this.currentRepo) return;\n      const stale = Date.now() - this.lastBranchesFetchedAtMs > BRANCH_TTL_MS;\n      if (!stale) {\n        if (forceLog)\n          this.deps.log("Branches are up to date (no refresh needed).");\n        return;\n      }\n      this.desiredBranch = this.desiredBranch || null;\n      this.defaultBranchFromApi = void 0;\n      this.loadedPages = 0;\n      this.hasMorePages = false;\n      this.isFetchingBranches = true;\n      this.allBranches = [];\n      this.filteredBranches = [];\n      this.renderCount = 0;\n      this.setBranchDisabled(true, "Refreshing branches\\u2026");\n      this.updateBranchCount();\n      if (this.ghBranchInput) {\n        this.ghBranchInput.value = "";\n        this.lastQuery = "";\n        this.inputPristine = true;\n      }\n      this.deps.log("Refreshing branches\\u2026");\n      this.deps.postToPlugin({\n        type: "GITHUB_FETCH_BRANCHES",\n        payload: {\n          owner: this.currentOwner,\n          repo: this.currentRepo,\n          page: 1\n        }\n      });\n    }\n    updateClearButtonVisibility() {\n      if (this.ghBranchClearBtn) {\n        const hasText = !!(this.ghBranchInput && this.ghBranchInput.value.trim());\n        this.ghBranchClearBtn.hidden = !hasText;\n      }\n    }\n    setBranchDisabled(disabled, placeholder) {\n      const nextPlaceholder = placeholder !== void 0 ? placeholder : BRANCH_INPUT_PLACEHOLDER;\n      if (this.ghBranchInput) {\n        this.ghBranchInput.disabled = disabled;\n        this.ghBranchInput.placeholder = nextPlaceholder;\n        if (disabled) {\n          this.ghBranchInput.value = "";\n          this.lastQuery = "";\n          this.inputPristine = true;\n        }\n      }\n      if (this.ghBranchToggleBtn) {\n        this.ghBranchToggleBtn.disabled = disabled;\n        this.ghBranchToggleBtn.setAttribute("aria-expanded", "false");\n      }\n      if (disabled && this.autocomplete) this.autocomplete.close();\n    }\n    updateBranchCount() {\n      if (!this.ghBranchCountEl) return;\n      const total = this.allBranches.length;\n      const showing = this.filteredBranches.length;\n      this.ghBranchCountEl.textContent = `${showing} / ${total}${this.hasMorePages ? " +" : ""}`;\n    }\n    applyBranchFilter() {\n      var _a;\n      const rawInput = (((_a = this.ghBranchInput) == null ? void 0 : _a.value) || "").trim();\n      const raw = rawInput === "__more__" || rawInput === "__fetch__" ? this.lastQuery.trim() : rawInput;\n      const q = raw.toLowerCase();\n      const effectiveQuery = q;\n      this.filteredBranches = effectiveQuery ? this.allBranches.filter(\n        (n) => n.toLowerCase().includes(effectiveQuery)\n      ) : [...this.allBranches];\n      this.renderCount = Math.min(RENDER_STEP, this.filteredBranches.length);\n      this.updateAutocompleteItems();\n      this.updateBranchCount();\n    }\n    updateAutocompleteItems() {\n      if (!this.autocomplete) return;\n      const items = [];\n      const slice = this.filteredBranches.slice(0, this.renderCount);\n      if (slice.length > 0) {\n        for (const name of slice) {\n          items.push({\n            key: name,\n            label: name,\n            value: name,\n            type: "option"\n          });\n        }\n      } else {\n        items.push({\n          key: "__empty__",\n          label: this.allBranches.length ? "No matching branches" : "No branches loaded yet",\n          value: "",\n          type: "info",\n          disabled: true\n        });\n      }\n      if (this.filteredBranches.length > this.renderCount) {\n        items.push({\n          key: "__more__",\n          label: `Load more\\u2026 (${this.filteredBranches.length - this.renderCount} more)`,\n          value: "__more__",\n          type: "action"\n        });\n      } else if (this.hasMorePages) {\n        items.push({\n          key: "__fetch__",\n          label: "Load next page\\u2026",\n          value: "__fetch__",\n          type: "action"\n        });\n      }\n      this.autocomplete.setItems(items);\n    }\n    renderAutocompleteItem(item) {\n      if (item.type === "info") {\n        return h(\n          "li",\n          {\n            className: "gh-branch-item gh-branch-item-empty",\n            "aria-disabled": "true"\n          },\n          item.label\n        );\n      }\n      if (item.type === "action") {\n        return h(\n          "li",\n          {\n            className: "gh-branch-item gh-branch-item-action"\n          },\n          item.label\n        );\n      }\n      return h(\n        "li",\n        {\n          className: "gh-branch-item"\n        },\n        item.label\n      );\n    }\n    processBranchSelection(value) {\n      const val = (value || "").trim();\n      if (!val) return;\n      if (!this.ghBranchInput) return;\n      this.desiredBranch = val;\n      this.lastQuery = val;\n      this.ghBranchInput.value = val;\n      this.inputPristine = false;\n      this.updateClearButtonVisibility();\n      this.deps.postToPlugin({\n        type: "GITHUB_SELECT_BRANCH",\n        payload: {\n          owner: this.currentOwner,\n          repo: this.currentRepo,\n          branch: val\n        }\n      });\n      this.applyBranchFilter();\n      if (this.onBranchChange) this.onBranchChange(val);\n    }\n    ensureNextPageIfNeeded() {\n      if (!this.ghBranchInput) return;\n      if (!this.hasMorePages || this.isFetchingBranches) return;\n      if (!this.currentOwner || !this.currentRepo) return;\n      this.isFetchingBranches = true;\n      this.deps.postToPlugin({\n        type: "GITHUB_FETCH_BRANCHES",\n        payload: {\n          owner: this.currentOwner,\n          repo: this.currentRepo,\n          page: this.loadedPages + 1\n        }\n      });\n    }\n    // New Branch Flow\n    showNewBranchRow(show) {\n      if (!this.ghNewBranchRow) return;\n      this.ghNewBranchRow.style.display = show ? "flex" : "none";\n      if (show && this.ghNewBranchName) {\n        if (!this.ghNewBranchName.value) {\n          this.ghNewBranchName.value = `tokens/update-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;\n        }\n        this.ghNewBranchName.focus();\n        this.ghNewBranchName.select();\n      }\n    }\n    isNewBranchRowVisible() {\n      if (!this.ghNewBranchRow) return false;\n      return this.ghNewBranchRow.style.display !== "none";\n    }\n    cancelNewBranchFlow(refocusBtn) {\n      this.showNewBranchRow(false);\n      if (this.ghNewBranchName) this.ghNewBranchName.value = "";\n      if (refocusBtn && this.ghNewBranchBtn) this.ghNewBranchBtn.focus();\n    }\n    requestNewBranchCreation() {\n      var _a;\n      if (!this.ghCreateBranchConfirmBtn || this.ghCreateBranchConfirmBtn.disabled)\n        return;\n      if (!this.currentOwner || !this.currentRepo) {\n        this.deps.log("Pick a repository before creating a branch.");\n        return;\n      }\n      const baseBranch = this.defaultBranchFromApi || "";\n      if (!baseBranch) {\n        this.deps.log(\n          "GitHub: Unable to determine the repository default branch. Refresh branches first."\n        );\n        return;\n      }\n      const newBranch = (((_a = this.ghNewBranchName) == null ? void 0 : _a.value) || "").trim();\n      if (!newBranch) {\n        this.deps.log("Enter a branch name to create.");\n        if (this.ghNewBranchName) this.ghNewBranchName.focus();\n        return;\n      }\n      if (newBranch === baseBranch) {\n        this.deps.log(\n          "Enter a branch name that differs from the source branch."\n        );\n        if (this.ghNewBranchName) this.ghNewBranchName.focus();\n        return;\n      }\n      this.ghCreateBranchConfirmBtn.disabled = true;\n      this.deps.log(`GitHub: creating ${newBranch} from ${baseBranch}\\u2026`);\n      this.deps.postToPlugin({\n        type: "GITHUB_CREATE_BRANCH",\n        payload: {\n          owner: this.currentOwner,\n          repo: this.currentRepo,\n          baseBranch,\n          newBranch\n        }\n      });\n    }\n    handleCreateBranchResult(payload) {\n      var _a;\n      const pl = payload || {};\n      if (this.ghCreateBranchConfirmBtn)\n        this.ghCreateBranchConfirmBtn.disabled = false;\n      if (typeof pl.ok !== "boolean") return;\n      if (pl.ok) {\n        const baseBranch = String(pl.baseBranch || "");\n        const newBranch = String(pl.newBranch || "");\n        const url = String(pl.html_url || "");\n        if (newBranch) {\n          const s = new Set(this.allBranches);\n          if (!s.has(newBranch)) {\n            s.add(newBranch);\n            this.allBranches = Array.from(s).sort(\n              (a, b) => a.localeCompare(b)\n            );\n          }\n          this.desiredBranch = newBranch;\n          if (this.ghBranchInput) {\n            this.ghBranchInput.value = newBranch;\n            this.lastQuery = newBranch;\n            this.inputPristine = false;\n          }\n          this.applyBranchFilter();\n        }\n        this.showNewBranchRow(false);\n        if (this.ghNewBranchName) this.ghNewBranchName.value = "";\n        if (url) {\n          this.deps.log(\n            `Branch created: ${newBranch} (from ${baseBranch})`\n          );\n          const logEl = this.deps.getLogElement();\n          if (logEl && this.doc) {\n            const wrap = h(\n              "div",\n              null,\n              h(\n                "a",\n                { href: url, target: "_blank" },\n                "View on GitHub"\n              )\n            );\n            logEl.appendChild(wrap);\n            logEl.scrollTop = logEl.scrollHeight;\n          }\n        } else {\n          this.deps.log(\n            `Branch created: ${newBranch} (from ${baseBranch})`\n          );\n        }\n        if (this.onBranchChange && newBranch)\n          this.onBranchChange(newBranch);\n      } else {\n        const status = (_a = pl.status) != null ? _a : 0;\n        const message = pl.message || "unknown error";\n        this.deps.log(\n          `Create branch failed (status ${status}): ${message}`\n        );\n        if (pl.samlRequired) {\n          this.deps.log(\n            "This org requires SSO. Open the repo in your browser and authorize SSO for your token."\n          );\n        } else if (status === 403) {\n          if (pl.noPushPermission) {\n            this.deps.log(\n              "You do not have push permission to this repository. Ask a maintainer for write access."\n            );\n          } else {\n            this.deps.log("Likely a token permission issue:");\n            this.deps.log(\n              \'\\u2022 Classic PAT: add the "repo" scope (or "public_repo" for public repos).\'\n            );\n            this.deps.log(\n              \'\\u2022 Fine-grained PAT: grant this repository and set "Contents: Read and write".\'\n            );\n          }\n        }\n      }\n    }\n  };\n\n  // src/app/github/ui/folder.ts\n  var GH_FOLDER_PLACEHOLDER = "Path in repository\\u2026";\n  var GithubFolderUi = class {\n    constructor(deps) {\n      this.doc = null;\n      this.win = null;\n      // Elements\n      this.ghFolderInput = null;\n      this.ghFolderDisplay = null;\n      this.ghPickFolderBtn = null;\n      this.folderPickerOverlay = null;\n      this.folderPickerTitleEl = null;\n      this.folderPickerPathInput = null;\n      this.folderPickerUseBtn = null;\n      this.folderPickerListEl = null;\n      this.folderPickerCancelBtn = null;\n      // State\n      this.currentOwner = "";\n      this.currentRepo = "";\n      this.currentBranch = "";\n      this.pickerState = {\n        isOpen: false,\n        currentPath: "",\n        lastFocus: null,\n        refreshNonce: 0\n      };\n      this.folderListWaiters = [];\n      this.folderCreateWaiters = [];\n      // Callbacks\n      this.onFolderChange = null;\n      this.deps = deps;\n    }\n    attach(context) {\n      var _a;\n      this.doc = context.document;\n      this.win = context.window;\n      this.ghFolderInput = this.doc.getElementById(\n        "ghFolderInput"\n      );\n      this.ghFolderDisplay = this.doc.getElementById("ghFolderDisplay");\n      this.setGhFolderDisplay(((_a = this.ghFolderInput) == null ? void 0 : _a.value) || "");\n      this.ghPickFolderBtn = this.doc.getElementById(\n        "ghPickFolderBtn"\n      );\n      this.folderPickerOverlay = this.doc.getElementById(\n        "folderPickerOverlay"\n      );\n      this.folderPickerTitleEl = this.doc.getElementById("folderPickerTitle");\n      this.folderPickerPathInput = this.doc.getElementById(\n        "folderPickerPath"\n      );\n      this.folderPickerUseBtn = this.doc.getElementById(\n        "folderPickerUseBtn"\n      );\n      this.folderPickerListEl = this.doc.getElementById("folderPickerList");\n      this.folderPickerCancelBtn = this.doc.getElementById(\n        "folderPickerCancelBtn"\n      );\n      this.setupEventListeners();\n    }\n    setContext(owner, repo, branch) {\n      this.currentOwner = owner;\n      this.currentRepo = repo;\n      this.currentBranch = branch;\n      this.updateFolderControlsEnabled();\n    }\n    reset() {\n      this.setGhFolderDisplay("");\n      this.pickerState.isOpen = false;\n      this.pickerState.currentPath = "";\n      this.pickerState.refreshNonce++;\n      this.folderListWaiters = [];\n      this.folderCreateWaiters = [];\n      if (this.folderPickerOverlay) {\n        this.folderPickerOverlay.classList.remove("is-open");\n        this.folderPickerOverlay.setAttribute("aria-hidden", "true");\n        this.folderPickerOverlay.hidden = true;\n      }\n    }\n    getFolder() {\n      const raw = this.ghFolderInput ? this.ghFolderInput.value.trim() : "";\n      return this.normalizeFolderInput(raw).payload;\n    }\n    setFolder(path) {\n      const normalized = this.normalizeFolderInput(path);\n      this.setGhFolderDisplay(normalized.display);\n    }\n    handleMessage(msg) {\n      if (msg.type === "GITHUB_FOLDER_LIST_RESULT") {\n        const pl = msg.payload;\n        const path = String(pl.path || "").replace(/^\\/+|\\/+$/g, "");\n        const ok = pl.ok;\n        let entries = [];\n        let message = "";\n        let status;\n        if (pl.ok) {\n          entries = pl.entries;\n        } else {\n          message = pl.message;\n          status = pl.status;\n        }\n        for (let i = 0; i < this.folderListWaiters.length; i++) {\n          if (this.folderListWaiters[i].path === path) {\n            const waiter = this.folderListWaiters.splice(i, 1)[0];\n            if (ok) waiter.resolve({ ok: true, entries });\n            else\n              waiter.reject({\n                ok: false,\n                message: message || `HTTP ${status || 0}`,\n                status\n              });\n            break;\n          }\n        }\n        return true;\n      }\n      if (msg.type === "GITHUB_CREATE_FOLDER_RESULT") {\n        const pl = msg.payload;\n        const fp = String(pl.folderPath || "").replace(/^\\/+|\\/+$/g, "");\n        const ok = pl.ok;\n        let message = "";\n        let status;\n        if (!pl.ok) {\n          message = pl.message;\n          status = pl.status;\n        }\n        for (let i = 0; i < this.folderCreateWaiters.length; i++) {\n          if (this.folderCreateWaiters[i].folderPath === fp) {\n            const waiter = this.folderCreateWaiters.splice(i, 1)[0];\n            if (ok) waiter.resolve({ ok: true });\n            else\n              waiter.reject({\n                ok: false,\n                message: message || `HTTP ${status || 0}`,\n                status\n              });\n            break;\n          }\n        }\n        return true;\n      }\n      if (msg.type === "GITHUB_RESTORE_SELECTED") {\n        const p = msg.payload || {};\n        if (typeof p.folder === "string") {\n          const normalized = this.normalizeFolderInput(p.folder);\n          this.setGhFolderDisplay(normalized.display);\n          if (this.onFolderChange)\n            this.onFolderChange(normalized.payload);\n        }\n        return false;\n      }\n      return false;\n    }\n    setupEventListeners() {\n      if (this.ghPickFolderBtn) {\n        this.ghPickFolderBtn.addEventListener(\n          "click",\n          () => this.openFolderPicker()\n        );\n      }\n      if (this.folderPickerOverlay) {\n        this.folderPickerOverlay.addEventListener("click", (event) => {\n          if (event.target === this.folderPickerOverlay)\n            this.closeFolderPicker();\n        });\n      }\n      if (this.folderPickerCancelBtn) {\n        this.folderPickerCancelBtn.addEventListener(\n          "click",\n          () => this.closeFolderPicker()\n        );\n      }\n      let folderPickerPathDebounce;\n      if (this.folderPickerPathInput) {\n        this.folderPickerPathInput.addEventListener("input", () => {\n          var _a, _b;\n          if (folderPickerPathDebounce)\n            (_a = this.win) == null ? void 0 : _a.clearTimeout(folderPickerPathDebounce);\n          const value = this.folderPickerPathInput.value;\n          folderPickerPathDebounce = (_b = this.win) == null ? void 0 : _b.setTimeout(() => {\n            this.setFolderPickerPath(value, true, false);\n          }, 120);\n        });\n        this.folderPickerPathInput.addEventListener("keydown", (event) => {\n          if (event.key === "Enter") {\n            event.preventDefault();\n            this.setFolderPickerPath(this.folderPickerPathInput.value);\n          }\n        });\n        this.folderPickerPathInput.addEventListener(\n          "click",\n          (e) => e.stopPropagation()\n        );\n        this.folderPickerPathInput.addEventListener(\n          "mousedown",\n          (e) => e.stopPropagation()\n        );\n      }\n      if (this.folderPickerUseBtn) {\n        this.folderPickerUseBtn.addEventListener("click", () => {\n          if (this.folderPickerPathInput) {\n            this.setFolderPickerPath(\n              this.folderPickerPathInput.value,\n              false\n            );\n          }\n          const selectionRaw = this.pickerState.currentPath ? `${this.pickerState.currentPath}/` : "/";\n          const normalized = this.normalizeFolderInput(selectionRaw);\n          this.setGhFolderDisplay(normalized.display);\n          this.deps.postToPlugin({\n            type: "GITHUB_SET_FOLDER",\n            payload: {\n              owner: this.currentOwner,\n              repo: this.currentRepo,\n              folder: normalized.payload\n            }\n          });\n          this.closeFolderPicker();\n          this.deps.log(\n            `Folder selected: ${normalized.display === "/" ? "(repo root)" : normalized.display}`\n          );\n          if (this.onFolderChange)\n            this.onFolderChange(normalized.payload);\n        });\n      }\n      if (this.doc) {\n        this.doc.addEventListener(\n          "keydown",\n          (e) => this.handleFolderPickerKeydown(e)\n        );\n      }\n    }\n    normalizeFolderInput(raw) {\n      const trimmed = raw.trim();\n      if (!trimmed) return { display: "", payload: "" };\n      if (trimmed === "/" || trimmed === "./" || trimmed === ".") {\n        return { display: "/", payload: "/" };\n      }\n      const collapsed = trimmed.replace(/\\\\/g, "/").replace(/\\/{2,}/g, "/");\n      const stripped = collapsed.replace(/^\\/+/, "").replace(/\\/+$/, "");\n      if (!stripped) return { display: "/", payload: "/" };\n      return { display: stripped + "/", payload: stripped };\n    }\n    normalizeFolderPickerPath(raw) {\n      const trimmed = (raw || "").trim();\n      if (!trimmed || trimmed === "/" || trimmed === "./" || trimmed === ".")\n        return "";\n      const collapsed = trimmed.replace(/\\\\/g, "/").replace(/\\/{2,}/g, "/");\n      return collapsed.replace(/^\\/+/, "").replace(/\\/+$/, "");\n    }\n    setGhFolderDisplay(display) {\n      if (this.ghFolderInput) this.ghFolderInput.value = display || "";\n      if (!this.ghFolderDisplay) return;\n      if (display) {\n        this.ghFolderDisplay.textContent = display;\n        this.ghFolderDisplay.classList.remove("is-placeholder");\n      } else {\n        this.ghFolderDisplay.textContent = GH_FOLDER_PLACEHOLDER;\n        this.ghFolderDisplay.classList.add("is-placeholder");\n      }\n    }\n    updateFolderControlsEnabled() {\n      const enable = !!(this.currentOwner && this.currentRepo && this.currentBranch);\n      if (this.ghPickFolderBtn) this.ghPickFolderBtn.disabled = !enable;\n    }\n    listDir(path) {\n      return new Promise((resolve) => {\n        const req = { path: path.replace(/^\\/+|\\/+$/g, "") };\n        this.folderListWaiters.push({\n          path: req.path,\n          resolve: (v) => resolve(v),\n          reject: (v) => resolve(v)\n        });\n        this.deps.postToPlugin({\n          type: "GITHUB_FOLDER_LIST",\n          payload: {\n            owner: this.currentOwner,\n            repo: this.currentRepo,\n            branch: this.currentBranch,\n            path: req.path\n          }\n        });\n      });\n    }\n    openFolderPicker() {\n      var _a, _b;\n      if (!this.currentOwner || !this.currentRepo) {\n        this.deps.log("Pick a repository first.");\n        return;\n      }\n      if (!this.currentBranch) {\n        this.deps.log("Pick a branch first.");\n        return;\n      }\n      if (!(this.folderPickerOverlay && this.folderPickerTitleEl && this.folderPickerPathInput && this.folderPickerListEl)) {\n        this.deps.log("Folder picker UI is unavailable.");\n        return;\n      }\n      this.pickerState.lastFocus = this.doc && this.doc.activeElement instanceof HTMLElement ? this.doc.activeElement : null;\n      this.folderPickerOverlay.hidden = false;\n      this.folderPickerOverlay.classList.add("is-open");\n      this.folderPickerOverlay.setAttribute("aria-hidden", "false");\n      this.pickerState.isOpen = true;\n      this.updateFolderPickerTitle(this.currentBranch);\n      const startNormalized = this.normalizeFolderInput(\n        ((_a = this.ghFolderInput) == null ? void 0 : _a.value) || ""\n      );\n      const startPath = startNormalized.payload === "/" ? "" : startNormalized.payload;\n      this.setFolderPickerPath(startPath, true);\n      (_b = this.win) == null ? void 0 : _b.setTimeout(() => {\n        var _a2, _b2;\n        (_a2 = this.folderPickerPathInput) == null ? void 0 : _a2.focus();\n        (_b2 = this.folderPickerPathInput) == null ? void 0 : _b2.select();\n      }, 0);\n    }\n    closeFolderPicker() {\n      var _a;\n      if (!this.folderPickerOverlay) return;\n      this.folderPickerOverlay.classList.remove("is-open");\n      this.folderPickerOverlay.setAttribute("aria-hidden", "true");\n      this.folderPickerOverlay.hidden = true;\n      this.pickerState.isOpen = false;\n      this.pickerState.currentPath = "";\n      this.pickerState.refreshNonce++;\n      if (this.folderPickerListEl) {\n        this.folderPickerListEl.replaceChildren(\n          this.createFolderPickerRow("Loading\\u2026", {\n            muted: true,\n            disabled: true\n          })\n        );\n      }\n      if (this.pickerState.lastFocus && ((_a = this.doc) == null ? void 0 : _a.contains(this.pickerState.lastFocus))) {\n        this.pickerState.lastFocus.focus();\n      }\n      this.pickerState.lastFocus = null;\n    }\n    createFolderPickerRow(label, options) {\n      const props = {\n        className: `folder-picker-row ${(options == null ? void 0 : options.muted) ? "is-muted" : ""}`,\n        type: "button"\n      };\n      if (options == null ? void 0 : options.disabled) props.disabled = true;\n      if (options == null ? void 0 : options.onClick) {\n        props.onmousedown = (event) => {\n          var _a;\n          event.preventDefault();\n          event.stopPropagation();\n          (_a = options.onClick) == null ? void 0 : _a.call(options);\n        };\n      }\n      return h("button", props, label);\n    }\n    updateFolderPickerTitle(branch) {\n      if (!this.folderPickerTitleEl) return;\n      if (this.currentOwner && this.currentRepo) {\n        this.folderPickerTitleEl.textContent = `${this.currentOwner}/${this.currentRepo} @ ${branch}`;\n      } else {\n        this.folderPickerTitleEl.textContent = "Select a repository first";\n      }\n    }\n    setFolderPickerPath(raw, refresh = true, syncInput = true) {\n      const normalized = this.normalizeFolderPickerPath(raw);\n      this.pickerState.currentPath = normalized;\n      if (syncInput && this.folderPickerPathInput)\n        this.folderPickerPathInput.value = normalized;\n      if (refresh && this.pickerState.isOpen) {\n        void this.refreshFolderPickerList();\n      }\n    }\n    async refreshFolderPickerList() {\n      if (!(this.folderPickerListEl && this.pickerState.isOpen)) return;\n      const listEl = this.folderPickerListEl;\n      const requestId = ++this.pickerState.refreshNonce;\n      listEl.replaceChildren(\n        this.createFolderPickerRow("Loading\\u2026", {\n          muted: true,\n          disabled: true\n        })\n      );\n      const path = this.pickerState.currentPath;\n      const res = await this.listDir(path);\n      if (requestId !== this.pickerState.refreshNonce) return;\n      if (!res.ok) {\n        const status = typeof res.status === "number" ? res.status : 0;\n        if (status === 404) {\n          listEl.replaceChildren(\n            this.createFolderPickerRow(\n              "Folder not found. It will be created during export.",\n              { muted: true, disabled: true }\n            )\n          );\n          return;\n        }\n        if (status === 409) {\n          listEl.replaceChildren(\n            this.createFolderPickerRow(\n              "Cannot open this path: an existing file blocks the folder.",\n              { muted: true, disabled: true }\n            )\n          );\n          return;\n        }\n        const message = res.message ? res.message : "failed to fetch";\n        listEl.replaceChildren(\n          this.createFolderPickerRow(`Error: ${message}`, {\n            muted: true,\n            disabled: true\n          })\n        );\n        return;\n      }\n      const nodes = [];\n      if (path) {\n        nodes.push(\n          this.createFolderPickerRow(".. (up one level)", {\n            muted: true,\n            onClick: () => {\n              const parentParts = this.pickerState.currentPath.split("/").filter(Boolean);\n              parentParts.pop();\n              this.setFolderPickerPath(parentParts.join("/"));\n            }\n          })\n        );\n      }\n      const entries = Array.isArray(res.entries) ? res.entries : [];\n      const dirs = entries.filter((e) => e.type === "dir").sort((a, b) => (a.name || "").localeCompare(b.name || ""));\n      if (dirs.length === 0) {\n        nodes.push(\n          this.createFolderPickerRow("(no subfolders)", {\n            muted: true,\n            disabled: true\n          })\n        );\n      } else {\n        for (const d of dirs) {\n          const name = d.name || "";\n          nodes.push(\n            this.createFolderPickerRow(`${name}/`, {\n              onClick: () => {\n                const next = this.pickerState.currentPath ? `${this.pickerState.currentPath}/${name}` : name;\n                this.setFolderPickerPath(next);\n              }\n            })\n          );\n        }\n      }\n      listEl.replaceChildren(...nodes);\n    }\n    handleFolderPickerKeydown(event) {\n      if (!this.pickerState.isOpen) return;\n      if (event.key === "Escape") {\n        event.preventDefault();\n        this.closeFolderPicker();\n      }\n    }\n  };\n\n  // src/app/github/ui/import.ts\n  var GithubImportUi = class {\n    constructor(deps) {\n      this.doc = null;\n      // Elements\n      this.ghFetchBtn = null;\n      this.ghFetchPathInput = null;\n      // State\n      this.currentOwner = "";\n      this.currentRepo = "";\n      this.currentBranch = "";\n      this.currentFolder = "";\n      this.deps = deps;\n    }\n    attach(context) {\n      this.doc = context.document;\n      this.ghFetchBtn = this.doc.getElementById(\n        "ghFetchTokensBtn"\n      );\n      this.ghFetchPathInput = this.doc.getElementById(\n        "ghFetchPathInput"\n      );\n      if (this.ghFetchBtn) {\n        this.ghFetchBtn.addEventListener("click", () => this.fetchTokens());\n      }\n      if (this.ghFetchPathInput) {\n        this.ghFetchPathInput.addEventListener(\n          "input",\n          () => this.updateEnabled()\n        );\n      }\n    }\n    setContext(owner, repo, branch, folder) {\n      this.currentOwner = owner;\n      this.currentRepo = repo;\n      this.currentBranch = branch;\n      this.currentFolder = folder;\n      this.updateEnabled();\n    }\n    reset() {\n      this.updateEnabled();\n    }\n    handleMessage(msg) {\n      if (msg.type === "GITHUB_FETCH_TOKENS_RESULT") {\n        this.handleFetchResult(msg.payload);\n        return true;\n      }\n      return false;\n    }\n    updateEnabled() {\n      if (this.ghFetchBtn) {\n        const hasContext = !!(this.currentOwner && this.currentRepo && this.currentBranch);\n        const hasPath = !!(this.ghFetchPathInput && this.ghFetchPathInput.value.trim());\n        this.ghFetchBtn.disabled = !(hasContext && hasPath);\n      }\n    }\n    fetchTokens() {\n      var _a;\n      if (!this.currentOwner || !this.currentRepo || !this.currentBranch) {\n        this.deps.log("Please select a repository and branch first.");\n        return;\n      }\n      const pathInput = ((_a = this.ghFetchPathInput) == null ? void 0 : _a.value.trim()) || "";\n      if (!pathInput) {\n        this.deps.log("Please enter a path to the tokens file.");\n        return;\n      }\n      const path = pathInput.replace(/^\\/+|\\/+$/g, "");\n      this.deps.log(\n        `Fetching ${path} from ${this.currentOwner}/${this.currentRepo} (${this.currentBranch})\\u2026`\n      );\n      if (this.ghFetchBtn) this.ghFetchBtn.disabled = true;\n      const allowHex = !!(this.deps.getAllowHexCheckbox() && this.deps.getAllowHexCheckbox().checked);\n      const contexts = this.deps.getImportContexts();\n      this.deps.postToPlugin({\n        type: "GITHUB_FETCH_TOKENS",\n        payload: {\n          owner: this.currentOwner,\n          repo: this.currentRepo,\n          branch: this.currentBranch,\n          path,\n          allowHexStrings: allowHex,\n          contexts\n        }\n      });\n    }\n    handleFetchResult(pl) {\n      if (this.ghFetchBtn) this.ghFetchBtn.disabled = false;\n      if (!pl || typeof pl !== "object") return;\n      const payload = pl;\n      const status = typeof payload.status === "number" ? payload.status : 0;\n      const message = payload.message || "unknown error";\n      if (payload.ok) {\n        const json = payload.json;\n        if (!json) {\n          this.deps.log("Fetched file is empty or invalid JSON.");\n          return;\n        }\n        this.deps.log(\n          `Successfully fetched tokens file (${JSON.stringify(json).length} bytes).`\n        );\n      } else {\n        this.deps.log(`Fetch failed (status ${status}): ${message}`);\n        if (status === 404) {\n          this.deps.log("File not found. Check if the path is correct.");\n        }\n      }\n    }\n  };\n\n  // src/app/github/ui/export.ts\n  var GithubExportUi = class {\n    constructor(deps) {\n      this.doc = null;\n      // Elements\n      this.ghExportAndCommitBtn = null;\n      this.ghCommitMsgInput = null;\n      this.ghFilenameInput = null;\n      this.ghScopeAll = null;\n      this.ghScopeTypography = null;\n      this.ghScopeSelected = null;\n      this.ghCreatePrChk = null;\n      this.ghPrTitleInput = null;\n      this.ghPrBodyInput = null;\n      // State\n      this.currentOwner = "";\n      this.currentRepo = "";\n      this.currentBranch = "";\n      this.currentFolder = "";\n      this.prBaseBranch = "";\n      this.hasCollections = false;\n      this.hasTextStyles = false;\n      this.deps = deps;\n    }\n    attach(context) {\n      this.doc = context.document;\n      this.ghExportAndCommitBtn = this.doc.getElementById(\n        "ghExportAndCommitBtn"\n      );\n      this.ghCommitMsgInput = this.doc.getElementById(\n        "ghCommitMsgInput"\n      );\n      this.ghFilenameInput = this.doc.getElementById(\n        "ghFilenameInput"\n      );\n      this.ghScopeAll = this.doc.getElementById(\n        "ghScopeAll"\n      );\n      this.ghScopeTypography = this.doc.getElementById(\n        "ghScopeTypography"\n      );\n      this.ghScopeSelected = this.doc.getElementById(\n        "ghScopeSelected"\n      );\n      this.ghCreatePrChk = this.doc.getElementById(\n        "ghCreatePrChk"\n      );\n      this.ghPrTitleInput = this.doc.getElementById(\n        "ghPrTitleInput"\n      );\n      this.ghPrBodyInput = this.doc.getElementById(\n        "ghPrBodyInput"\n      );\n      if (this.ghExportAndCommitBtn) {\n        this.ghExportAndCommitBtn.addEventListener(\n          "click",\n          () => this.handleExportClick()\n        );\n      }\n      [this.ghScopeAll, this.ghScopeTypography, this.ghScopeSelected].forEach(\n        (el) => {\n          if (el)\n            el.addEventListener("change", () => this.updateEnabled());\n        }\n      );\n    }\n    setContext(owner, repo, branch, folder, prBaseBranch) {\n      this.currentOwner = owner;\n      this.currentRepo = repo;\n      this.currentBranch = branch;\n      this.currentFolder = folder;\n      this.prBaseBranch = prBaseBranch;\n      this.updateEnabled();\n    }\n    reset() {\n      this.updateEnabled();\n    }\n    handleMessage(msg) {\n      if (msg.type === "GITHUB_COMMIT_RESULT") {\n        this.handleCommitResult(msg.payload);\n        return true;\n      }\n      if (msg.type === "GITHUB_PR_RESULT") {\n        this.handlePrResult(msg.payload);\n        return true;\n      }\n      return false;\n    }\n    updateEnabled() {\n      if (!this.ghExportAndCommitBtn) return;\n      const hasContext = !!(this.currentOwner && this.currentRepo && this.currentBranch);\n      let scopeValid = true;\n      const scope = this.getSelectedScope();\n      if (scope === "selected") {\n        const collectionSelect = this.deps.getCollectionSelect();\n        const modeSelect = this.deps.getModeSelect();\n        const hasCollection = !!(collectionSelect && collectionSelect.value);\n        const hasMode = !!(modeSelect && modeSelect.value);\n        scopeValid = hasCollection && hasMode;\n      } else if (scope === "all") {\n        scopeValid = this.hasCollections;\n      } else if (scope === "typography") {\n        scopeValid = this.hasTextStyles;\n      }\n      const hasFilename = !!(this.ghFilenameInput && this.ghFilenameInput.value.trim());\n      this.ghExportAndCommitBtn.disabled = !(hasContext && scopeValid && hasFilename);\n    }\n    setCollectionsAvailability(hasCollections, hasTextStyles) {\n      this.hasCollections = hasCollections;\n      this.hasTextStyles = hasTextStyles;\n      this.updateEnabled();\n    }\n    getSelectedScope() {\n      if (this.ghScopeAll && this.ghScopeAll.checked) return "all";\n      if (this.ghScopeTypography && this.ghScopeTypography.checked)\n        return "typography";\n      return "selected";\n    }\n    handleExportClick() {\n      var _a, _b, _c, _d, _e, _f, _g, _h;\n      if (!this.currentOwner || !this.currentRepo || !this.currentBranch) {\n        this.deps.log("Pick a repository and branch first.");\n        return;\n      }\n      const collectionSelect = this.deps.getCollectionSelect();\n      const modeSelect = this.deps.getModeSelect();\n      const scope = this.ghScopeAll && this.ghScopeAll.checked ? "all" : this.ghScopeTypography && this.ghScopeTypography.checked ? "typography" : "selected";\n      const selectedCollection = collectionSelect ? collectionSelect.value || "" : "";\n      const selectedMode = modeSelect ? modeSelect.value || "" : "";\n      const commitMessage = (((_a = this.ghCommitMsgInput) == null ? void 0 : _a.value) || "Update tokens from Figma").trim();\n      const folder = this.currentFolder;\n      if (!folder || folder === "/") {\n      }\n      const filenameRaw = ((_b = this.ghFilenameInput) == null ? void 0 : _b.value) || "";\n      if (!filenameRaw.trim()) {\n        this.deps.log("Enter a filename (e.g. tokens.json).");\n        (_c = this.ghFilenameInput) == null ? void 0 : _c.focus();\n        return;\n      }\n      if (!filenameRaw.endsWith(".json")) {\n        this.deps.log("Filename must end with .json");\n        (_d = this.ghFilenameInput) == null ? void 0 : _d.focus();\n        return;\n      }\n      if (scope === "selected") {\n        if (!selectedCollection || !selectedMode) {\n          this.deps.log("Pick a collection and a mode before exporting.");\n          return;\n        }\n      }\n      const createPr = !!(this.ghCreatePrChk && this.ghCreatePrChk.checked);\n      const payload = {\n        type: "GITHUB_EXPORT_AND_COMMIT",\n        payload: {\n          owner: this.currentOwner,\n          repo: this.currentRepo,\n          branch: this.currentBranch,\n          folder,\n          filename: filenameRaw,\n          commitMessage,\n          scope,\n          styleDictionary: !!((_e = this.deps.getStyleDictionaryCheckbox()) == null ? void 0 : _e.checked),\n          flatTokens: !!((_f = this.deps.getFlatTokensCheckbox()) == null ? void 0 : _f.checked),\n          createPr\n        }\n      };\n      if (selectedCollection) payload.payload.collection = selectedCollection;\n      if (selectedMode) payload.payload.mode = selectedMode;\n      if (createPr) {\n        payload.payload.prBase = this.prBaseBranch;\n        payload.payload.prTitle = (((_g = this.ghPrTitleInput) == null ? void 0 : _g.value) || "").trim();\n        payload.payload.prBody = ((_h = this.ghPrBodyInput) == null ? void 0 : _h.value) || "";\n      }\n      const scopeLabel = scope === "all" ? "all collections" : scope === "typography" ? "typography" : "selected mode";\n      const fullPath = folder ? `${folder}${filenameRaw}` : filenameRaw;\n      this.deps.log(`GitHub: Export summary \\u2192 ${fullPath} (${scopeLabel})`);\n      this.deps.log(\n        createPr ? "Export, Commit & PR requested\\u2026" : "Export & Commit requested\\u2026"\n      );\n      this.deps.postToPlugin(payload);\n    }\n    handleCommitResult(pl) {\n      if (!pl || typeof pl !== "object") return;\n      const payload = pl;\n      if (payload.ok) {\n        const url = String(payload.commitUrl || "");\n        const branch = payload.branch || "";\n        const fullPath = payload.fullPath || "file";\n        this.deps.log(`Commit succeeded (${branch}): ${url || "(no URL)"}`);\n        this.deps.log(`Committed ${fullPath}`);\n        if (url) {\n          this.addLogLink(url, "View commit");\n        }\n        if (payload.createdPr) {\n          const pr = payload.createdPr;\n          this.deps.log(\n            `PR prepared (#${pr.number}) from ${pr.head} \\u2192 ${pr.base}`\n          );\n        }\n      } else {\n        const status = typeof payload.status === "number" ? payload.status : 0;\n        const message = payload.message || "unknown error";\n        const fullPath = payload.fullPath || "file";\n        if (status === 304) {\n          this.deps.log(`Commit skipped: ${message} (${fullPath})`);\n        } else {\n          this.deps.log(\n            `Commit failed (${status}): ${message} (${fullPath})`\n          );\n        }\n      }\n    }\n    handlePrResult(pl) {\n      if (!pl || typeof pl !== "object") return;\n      const payload = pl;\n      if (payload.ok) {\n        this.deps.log(\n          `PR created: #${payload.number} (${payload.head} \\u2192 ${payload.base})`\n        );\n        const url = payload.url;\n        if (url && typeof url === "string") {\n          this.addLogLink(url, "View PR");\n        }\n      } else {\n        this.deps.log(\n          `PR creation failed (${payload.status || 0}): ${payload.message || "unknown error"}`\n        );\n      }\n    }\n    addLogLink(url, text) {\n      const logEl = this.deps.getLogElement();\n      if (logEl && this.doc) {\n        const wrap = this.doc.createElement("div");\n        const a = this.doc.createElement("a");\n        a.href = url;\n        a.target = "_blank";\n        a.textContent = text;\n        wrap.appendChild(a);\n        logEl.appendChild(wrap);\n        logEl.scrollTop = logEl.scrollHeight;\n      }\n    }\n  };\n\n  // src/app/github/ui.ts\n  function createGithubUi(deps) {\n    const authUi = new GithubAuthUi(deps);\n    const repoUi = new GithubRepoUi(deps);\n    const branchUi = new GithubBranchUi(deps);\n    const folderUi = new GithubFolderUi(deps);\n    const importUi = new GithubImportUi(deps);\n    const exportUi = new GithubExportUi(deps);\n    wireDependencies();\n    function wireDependencies() {\n      repoUi.onRepoChange = () => {\n        const { owner, repo } = repoUi.getSelected();\n        branchUi.setRepo(owner, repo);\n        folderUi.reset();\n        importUi.reset();\n        exportUi.reset();\n      };\n      branchUi.onBranchChange = (branch) => {\n        const { owner, repo } = repoUi.getSelected();\n        folderUi.setContext(owner, repo, branch);\n        const folder = folderUi.getFolder();\n        const prBase = branchUi.getPrBaseBranch();\n        importUi.setContext(owner, repo, branch, folder);\n        exportUi.setContext(owner, repo, branch, folder, prBase);\n      };\n      folderUi.onFolderChange = (folder) => {\n        const { owner, repo } = repoUi.getSelected();\n        const branch = branchUi.getCurrentBranch();\n        const prBase = branchUi.getPrBaseBranch();\n        importUi.setContext(owner, repo, branch, folder);\n        exportUi.setContext(owner, repo, branch, folder, prBase);\n      };\n    }\n    function attach(context) {\n      authUi.attach(context);\n      repoUi.attach(context);\n      branchUi.attach(context);\n      folderUi.attach(context);\n      importUi.attach(context);\n      exportUi.attach(context);\n    }\n    function handleMessage(msg) {\n      let handled = false;\n      handled = authUi.handleMessage(msg) || handled;\n      handled = repoUi.handleMessage(msg) || handled;\n      handled = branchUi.handleMessage(msg) || handled;\n      handled = folderUi.handleMessage(msg) || handled;\n      handled = importUi.handleMessage(msg) || handled;\n      handled = exportUi.handleMessage(msg) || handled;\n      return handled;\n    }\n    function onSelectionChange() {\n      exportUi.updateEnabled();\n    }\n    function onCollectionsData(data) {\n      const hasCollections = !!(data == null ? void 0 : data.collections) && data.collections.length > 0 && data.collections.some((c) => c.variables && c.variables.length > 0);\n      const hasTextStyles = !!((data == null ? void 0 : data.textStyles) && data.textStyles.length);\n      exportUi.setCollectionsAvailability(hasCollections, hasTextStyles);\n      exportUi.updateEnabled();\n    }\n    return {\n      attach,\n      handleMessage,\n      onSelectionChange,\n      onCollectionsData\n    };\n  }\n\n  // src/app/ui/dom.ts\n  var uiElements = {\n    logEl: null,\n    rawEl: null,\n    exportAllChk: null,\n    collectionSelect: null,\n    modeSelect: null,\n    fileInput: null,\n    importBtn: null,\n    exportBtn: null,\n    exportTypographyBtn: null,\n    exportPickers: null,\n    refreshBtn: null,\n    shellEl: null,\n    drawerToggleBtn: null,\n    resizeHandleEl: null,\n    w3cPreviewEl: null,\n    copyRawBtn: null,\n    copyW3cBtn: null,\n    copyLogBtn: null,\n    allowHexChk: null,\n    styleDictionaryChk: null,\n    flatTokensChk: null,\n    githubRememberChk: null,\n    importScopeOverlay: null,\n    importScopeBody: null,\n    importScopeConfirmBtn: null,\n    importScopeCancelBtn: null,\n    importScopeRememberChk: null,\n    importScopeMissingEl: null,\n    importScopeSummaryEl: null,\n    importScopeSummaryTextEl: null,\n    importScopeClearBtn: null,\n    importSkipLogListEl: null,\n    importSkipLogEmptyEl: null\n  };\n  function initDomElements() {\n    if (typeof document === "undefined") return;\n    uiElements.logEl = document.getElementById("log");\n    uiElements.rawEl = document.getElementById("raw");\n    uiElements.exportAllChk = document.getElementById(\n      "exportAllChk"\n    );\n    uiElements.collectionSelect = document.getElementById(\n      "collectionSelect"\n    );\n    uiElements.modeSelect = document.getElementById(\n      "modeSelect"\n    );\n    uiElements.fileInput = document.getElementById(\n      "file"\n    );\n    uiElements.importBtn = document.getElementById(\n      "importBtn"\n    );\n    uiElements.exportBtn = document.getElementById(\n      "exportBtn"\n    );\n    uiElements.exportTypographyBtn = document.getElementById(\n      "exportTypographyBtn"\n    );\n    uiElements.exportPickers = document.getElementById("exportPickers");\n    uiElements.refreshBtn = document.getElementById(\n      "refreshBtn"\n    );\n    uiElements.shellEl = document.querySelector(".shell");\n    uiElements.drawerToggleBtn = document.getElementById(\n      "drawerToggleBtn"\n    );\n    uiElements.resizeHandleEl = document.getElementById("resizeHandle");\n    uiElements.w3cPreviewEl = document.getElementById(\n      "w3cPreview"\n    );\n    uiElements.copyRawBtn = document.getElementById(\n      "copyRawBtn"\n    );\n    uiElements.copyW3cBtn = document.getElementById(\n      "copyW3cBtn"\n    );\n    uiElements.copyLogBtn = document.getElementById(\n      "copyLogBtn"\n    );\n    uiElements.allowHexChk = document.getElementById(\n      "allowHexChk"\n    );\n    uiElements.styleDictionaryChk = document.getElementById(\n      "styleDictionaryChk"\n    );\n    uiElements.flatTokensChk = document.getElementById(\n      "flatTokensChk"\n    );\n    uiElements.githubRememberChk = document.getElementById(\n      "githubRememberChk"\n    );\n    uiElements.importScopeOverlay = document.getElementById("importScopeOverlay");\n    uiElements.importScopeBody = document.getElementById("importScopeBody");\n    uiElements.importScopeConfirmBtn = document.getElementById(\n      "importScopeConfirmBtn"\n    );\n    uiElements.importScopeCancelBtn = document.getElementById(\n      "importScopeCancelBtn"\n    );\n    uiElements.importScopeRememberChk = document.getElementById(\n      "importScopeRememberChk"\n    );\n    uiElements.importScopeMissingEl = document.getElementById(\n      "importScopeMissingNotice"\n    );\n    uiElements.importScopeSummaryEl = document.getElementById("importScopeSummary");\n    uiElements.importScopeSummaryTextEl = document.getElementById(\n      "importScopeSummaryText"\n    );\n    uiElements.importScopeClearBtn = document.getElementById(\n      "importScopeClearBtn"\n    );\n    uiElements.importSkipLogListEl = document.getElementById("importSkipLogList");\n    uiElements.importSkipLogEmptyEl = document.getElementById("importSkipLogEmpty");\n  }\n\n  // src/app/ui/utils.ts\n  function log(msg) {\n    const t = (/* @__PURE__ */ new Date()).toLocaleTimeString();\n    const line = document.createElement("div");\n    line.textContent = "[" + t + "] " + msg;\n    if (uiElements.logEl) {\n      uiElements.logEl.appendChild(line);\n      uiElements.logEl.scrollTop = uiElements.logEl.scrollHeight;\n    }\n  }\n  function postToPlugin(message) {\n    parent.postMessage({ pluginMessage: message }, "*");\n  }\n  function prettyJson(obj) {\n    try {\n      return JSON.stringify(obj, null, 2);\n    } catch (e) {\n      return String(obj);\n    }\n  }\n  function copyElText(el, label) {\n    var _a;\n    if (!el) return;\n    try {\n      const text = (_a = el.textContent) != null ? _a : "";\n      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {\n        navigator.clipboard.writeText(text).then(() => {\n          log(`Copied ${label} to clipboard.`);\n        }).catch(() => {\n          throw new Error("clipboard write failed");\n        });\n        return;\n      }\n      const ta = document.createElement("textarea");\n      ta.value = text;\n      ta.style.position = "fixed";\n      ta.style.opacity = "0";\n      document.body.appendChild(ta);\n      ta.select();\n      ta.setSelectionRange(0, ta.value.length);\n      const ok = document.execCommand("copy");\n      document.body.removeChild(ta);\n      if (ok) log(`Copied ${label} to clipboard (${text.length} chars).`);\n      else throw new Error("execCommand(copy) returned false");\n    } catch (e) {\n      log(`Could not copy ${label}.`);\n    }\n  }\n\n  // src/app/ui/state.ts\n  var appState = {\n    importPreference: null,\n    importLogEntries: [],\n    importScopeModalState: null,\n    lastImportSelection: [],\n    systemDarkMode: false,\n    // Export state\n    pendingSave: null,\n    // Resize state\n    resizeTracking: null,\n    resizeQueued: null,\n    resizeRaf: 0,\n    // Collections state\n    currentCollections: []\n  };\n\n  // src/app/ui/storage.ts\n  var IMPORT_PREF_KEY = "dtcg.importPreference.v1";\n  var IMPORT_LOG_KEY = "dtcg.importLog.v1";\n  function normalizeContextList(list) {\n    var _a;\n    const seen = /* @__PURE__ */ new Set();\n    const out = [];\n    for (let i = 0; i < list.length; i++) {\n      const raw = String((_a = list[i]) != null ? _a : "").trim();\n      if (!raw) continue;\n      if (seen.has(raw)) continue;\n      seen.add(raw);\n      out.push(raw);\n    }\n    out.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);\n    return out;\n  }\n  function contextsEqual(a, b) {\n    if (a.length !== b.length) return false;\n    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;\n    return true;\n  }\n  function readImportPreference() {\n    var _a;\n    try {\n      const raw = (_a = window.localStorage) == null ? void 0 : _a.getItem(IMPORT_PREF_KEY);\n      if (!raw) return null;\n      const parsed = JSON.parse(raw);\n      if (!parsed || typeof parsed !== "object") return null;\n      const ctxs = Array.isArray(parsed.contexts) ? normalizeContextList(parsed.contexts) : [];\n      const ts = typeof parsed.updatedAt === "number" ? Number(parsed.updatedAt) : Date.now();\n      if (ctxs.length > 0) return { contexts: ctxs, updatedAt: ts };\n    } catch (e) {\n    }\n    return null;\n  }\n  function writeImportPreference(pref) {\n    var _a;\n    try {\n      (_a = window.localStorage) == null ? void 0 : _a.setItem(IMPORT_PREF_KEY, JSON.stringify(pref));\n    } catch (e) {\n    }\n  }\n  function removeImportPreference() {\n    var _a;\n    try {\n      (_a = window.localStorage) == null ? void 0 : _a.removeItem(IMPORT_PREF_KEY);\n    } catch (e) {\n    }\n  }\n  function readImportLog() {\n    var _a;\n    try {\n      const raw = (_a = window.localStorage) == null ? void 0 : _a.getItem(IMPORT_LOG_KEY);\n      if (!raw) return [];\n      const parsed = JSON.parse(raw);\n      if (!Array.isArray(parsed)) return [];\n      const entries = [];\n      for (let i = 0; i < parsed.length; i++) {\n        const entry = parsed[i];\n        if (!entry || typeof entry !== "object") continue;\n        const timestamp = typeof entry.timestamp === "number" ? Number(entry.timestamp) : null;\n        const summary = entry.summary;\n        const source = entry.source === "github" ? "github" : entry.source === "local" ? "local" : void 0;\n        if (!timestamp || !summary || typeof summary !== "object") continue;\n        if (!Array.isArray(summary.appliedContexts) || !Array.isArray(summary.availableContexts))\n          continue;\n        if (!Array.isArray(summary.tokensWithRemovedContexts)) {\n          summary.tokensWithRemovedContexts = [];\n        }\n        if (!Array.isArray(summary.skippedContexts)) {\n          summary.skippedContexts = [];\n        }\n        if (!Array.isArray(summary.missingRequestedContexts)) {\n          summary.missingRequestedContexts = [];\n        }\n        if (typeof summary.createdStyles !== "number" || !isFinite(summary.createdStyles)) {\n          summary.createdStyles = 0;\n        }\n        entries.push({ timestamp, summary, source });\n      }\n      entries.sort((a, b) => a.timestamp - b.timestamp);\n      return entries;\n    } catch (e) {\n      return [];\n    }\n  }\n  function writeImportLog(entries) {\n    var _a;\n    try {\n      (_a = window.localStorage) == null ? void 0 : _a.setItem(IMPORT_LOG_KEY, JSON.stringify(entries));\n    } catch (e) {\n    }\n  }\n\n  // src/app/ui/features/import.ts\n  function formatContextList(contexts) {\n    const normalized = normalizeContextList(contexts);\n    if (normalized.length === 0) return "All contexts";\n    const grouped = /* @__PURE__ */ new Map();\n    for (let i = 0; i < normalized.length; i++) {\n      const ctx = normalized[i];\n      const slash = ctx.indexOf("/");\n      const collection = slash >= 0 ? ctx.slice(0, slash) : ctx;\n      const mode = slash >= 0 ? ctx.slice(slash + 1) : "Mode 1";\n      const coll = collection ? collection : "Tokens";\n      const modes = grouped.get(coll) || [];\n      if (!grouped.has(coll)) grouped.set(coll, modes);\n      if (!modes.includes(mode)) modes.push(mode);\n    }\n    const parts = [];\n    const collections = Array.from(grouped.keys()).sort(\n      (a, b) => a < b ? -1 : a > b ? 1 : 0\n    );\n    for (let i = 0; i < collections.length; i++) {\n      const coll = collections[i];\n      const modes = grouped.get(coll) || [];\n      modes.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);\n      parts.push(`${coll} (${modes.join(", ")})`);\n    }\n    return parts.join("; ");\n  }\n  function renderImportPreferenceSummary() {\n    if (!uiElements.importScopeSummaryEl || !uiElements.importScopeSummaryTextEl)\n      return;\n    const hasPref = !!appState.importPreference && appState.importPreference.contexts.length > 0;\n    if (uiElements.importScopeClearBtn)\n      uiElements.importScopeClearBtn.disabled = !hasPref;\n    if (!hasPref) {\n      uiElements.importScopeSummaryEl.hidden = true;\n      return;\n    }\n    uiElements.importScopeSummaryEl.hidden = false;\n    const when = new Date(\n      appState.importPreference.updatedAt\n    ).toLocaleString();\n    uiElements.importScopeSummaryTextEl.textContent = `Remembered import scope (${when}): ${formatContextList(\n      appState.importPreference.contexts\n    )}.`;\n  }\n  function renderImportLog() {\n    if (!(uiElements.importSkipLogListEl && uiElements.importSkipLogEmptyEl))\n      return;\n    uiElements.importSkipLogListEl.innerHTML = "";\n    if (!appState.importLogEntries || appState.importLogEntries.length === 0) {\n      uiElements.importSkipLogEmptyEl.hidden = false;\n      return;\n    }\n    uiElements.importSkipLogEmptyEl.hidden = true;\n    for (let idx = appState.importLogEntries.length - 1; idx >= 0; idx--) {\n      const entry = appState.importLogEntries[idx];\n      const container = document.createElement("div");\n      container.className = "import-skip-log-entry";\n      const header = document.createElement("div");\n      header.className = "import-skip-log-entry-header";\n      const label = entry.source === "github" ? "GitHub import" : "Manual import";\n      header.textContent = `${label} \\u2022 ${new Date(\n        entry.timestamp\n      ).toLocaleString()}`;\n      container.appendChild(header);\n      const stats = document.createElement("div");\n      stats.className = "import-skip-log-entry-stats";\n      const tokensText = `Imported ${entry.summary.importedTokens} of ${entry.summary.totalTokens} tokens.`;\n      const stylesCreated = typeof entry.summary.createdStyles === "number" ? entry.summary.createdStyles : void 0;\n      if (typeof stylesCreated === "number") {\n        const stylesLabel = stylesCreated === 1 ? "style" : "styles";\n        stats.textContent = `${tokensText} ${stylesCreated} ${stylesLabel} created.`;\n      } else {\n        stats.textContent = tokensText;\n      }\n      container.appendChild(stats);\n      const contextsLine = document.createElement("div");\n      contextsLine.className = "import-skip-log-entry-contexts";\n      contextsLine.textContent = "Applied: " + formatContextList(entry.summary.appliedContexts);\n      container.appendChild(contextsLine);\n      if (entry.summary.skippedContexts.length > 0) {\n        const skippedLine = document.createElement("div");\n        skippedLine.className = "import-skip-log-entry-contexts";\n        skippedLine.textContent = "Skipped modes: " + formatContextList(\n          entry.summary.skippedContexts.map((s) => s.context)\n        );\n        container.appendChild(skippedLine);\n      }\n      if (entry.summary.missingRequestedContexts.length > 0) {\n        const missingLine = document.createElement("div");\n        missingLine.className = "import-skip-log-entry-note";\n        missingLine.textContent = "Not found in file: " + formatContextList(entry.summary.missingRequestedContexts);\n        container.appendChild(missingLine);\n      }\n      if (entry.summary.selectionFallbackToAll) {\n        const fallbackLine = document.createElement("div");\n        fallbackLine.className = "import-skip-log-entry-note";\n        fallbackLine.textContent = "Requested modes were missing; imported all contexts instead.";\n        container.appendChild(fallbackLine);\n      }\n      if (entry.summary.tokensWithRemovedContexts.length > 0) {\n        const tokenList = document.createElement("ul");\n        tokenList.className = "import-skip-log-token-list";\n        const maxTokens = Math.min(\n          entry.summary.tokensWithRemovedContexts.length,\n          10\n        );\n        for (let t = 0; t < maxTokens; t++) {\n          const tok = entry.summary.tokensWithRemovedContexts[t];\n          const li = document.createElement("li");\n          const removedLabel = tok.removedContexts.length > 0 ? formatContextList(tok.removedContexts) : "none";\n          const keptLabel = tok.keptContexts.length > 0 ? formatContextList(tok.keptContexts) : "";\n          li.textContent = `${tok.path} \\u2014 skipped ${removedLabel}${keptLabel ? "; kept " + keptLabel : ""}`;\n          tokenList.appendChild(li);\n        }\n        if (entry.summary.tokensWithRemovedContexts.length > maxTokens) {\n          const more = document.createElement("li");\n          more.textContent = `\\u2026and ${entry.summary.tokensWithRemovedContexts.length - maxTokens} more token(s).`;\n          tokenList.appendChild(more);\n        }\n        container.appendChild(tokenList);\n      }\n      if (entry.summary.skippedContexts.length > 0 && appState.importPreference && appState.importPreference.contexts.length > 0) {\n        const tip = document.createElement("div");\n        tip.className = "import-skip-log-entry-note";\n        tip.textContent = "Tip: Clear the remembered import selection to restore skipped modes.";\n        container.appendChild(tip);\n      }\n      uiElements.importSkipLogListEl.appendChild(container);\n    }\n  }\n  function addImportLogEntry(entry) {\n    appState.importLogEntries.push(entry);\n    if (appState.importLogEntries.length > 10) {\n      appState.importLogEntries = appState.importLogEntries.slice(\n        appState.importLogEntries.length - 10\n      );\n    }\n    writeImportLog(appState.importLogEntries);\n    renderImportLog();\n  }\n  function setImportPreference(contexts) {\n    const normalized = normalizeContextList(contexts);\n    if (normalized.length === 0) {\n      clearImportPreference(false);\n      return;\n    }\n    const same = appState.importPreference && contextsEqual(appState.importPreference.contexts, normalized);\n    appState.importPreference = { contexts: normalized, updatedAt: Date.now() };\n    writeImportPreference(appState.importPreference);\n    renderImportPreferenceSummary();\n    if (!same) log("Remembered import selection for future imports.");\n  }\n  function clearImportPreference(logChange) {\n    if (!appState.importPreference) return;\n    appState.importPreference = null;\n    removeImportPreference();\n    renderImportPreferenceSummary();\n    if (logChange)\n      log(\n        "Cleared remembered import selection. Next import will prompt for modes."\n      );\n  }\n  function collectContextsFromJson(root) {\n    const grouped = /* @__PURE__ */ new Map();\n    function visit(node, path) {\n      if (Array.isArray(node)) {\n        for (let i = 0; i < node.length; i++) visit(node[i], path);\n        return;\n      }\n      if (!node || typeof node !== "object") return;\n      const obj = node;\n      if (Object.prototype.hasOwnProperty.call(obj, "$value")) {\n        const rawCollection = path[0] ? String(path[0]).trim() : "Tokens";\n        let mode = "Mode 1";\n        try {\n          const ext = obj["$extensions"];\n          if (ext && typeof ext === "object") {\n            const cf = ext["com.figma"];\n            if (cf && typeof cf === "object" && typeof cf.modeName === "string") {\n              const candidate = String(cf.modeName).trim();\n              if (candidate) mode = candidate;\n            }\n          }\n        } catch (e) {\n        }\n        const collection = rawCollection ? rawCollection : "Tokens";\n        const set = grouped.get(collection) || /* @__PURE__ */ new Set();\n        if (!grouped.has(collection)) grouped.set(collection, set);\n        set.add(mode);\n        return;\n      }\n      for (const key in obj) {\n        if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;\n        if (key.startsWith("$")) continue;\n        visit(obj[key], path.concat(String(key)));\n      }\n    }\n    visit(root, []);\n    const options = [];\n    const collections = Array.from(grouped.keys()).sort(\n      (a, b) => a < b ? -1 : a > b ? 1 : 0\n    );\n    for (let i = 0; i < collections.length; i++) {\n      const collection = collections[i];\n      const modes = Array.from(grouped.get(collection) || []).sort(\n        (a, b) => a < b ? -1 : a > b ? 1 : 0\n      );\n      for (let j = 0; j < modes.length; j++) {\n        const mode = modes[j];\n        options.push({\n          context: `${collection}/${mode}`,\n          collection,\n          mode\n        });\n      }\n    }\n    return options;\n  }\n  function updateImportScopeConfirmState() {\n    if (!appState.importScopeModalState) return;\n    const state = appState.importScopeModalState;\n    let allCollectionsSelected = true;\n    for (let i = 0; i < state.collections.length; i++) {\n      const collection = state.collections[i];\n      const inputs = state.inputsByCollection.get(collection) || [];\n      if (!inputs.some((input) => input.checked)) {\n        allCollectionsSelected = false;\n        break;\n      }\n    }\n    if (uiElements.importScopeConfirmBtn) {\n      uiElements.importScopeConfirmBtn.disabled = !allCollectionsSelected;\n      const label = state.collections.length > 1 ? "Import selected modes" : "Import selected mode";\n      uiElements.importScopeConfirmBtn.textContent = label;\n    }\n  }\n  var importScopeKeyListenerAttached = false;\n  function handleImportScopeKeydown(ev) {\n    if (ev.key === "Escape") {\n      ev.preventDefault();\n      closeImportScopeModal();\n    }\n  }\n  function openImportScopeModal(opts) {\n    var _a;\n    if (!uiElements.importScopeOverlay || !uiElements.importScopeBody || !uiElements.importScopeConfirmBtn || !uiElements.importScopeCancelBtn) {\n      opts.onConfirm(opts.initialSelection, opts.rememberInitially);\n      return;\n    }\n    uiElements.importScopeBody.innerHTML = "";\n    const grouped = /* @__PURE__ */ new Map();\n    for (let i = 0; i < opts.options.length; i++) {\n      const option = opts.options[i];\n      const list = grouped.get(option.collection) || [];\n      if (!grouped.has(option.collection))\n        grouped.set(option.collection, list);\n      list.push(option);\n    }\n    const collections = Array.from(grouped.keys()).sort(\n      (a, b) => a < b ? -1 : a > b ? 1 : 0\n    );\n    appState.importScopeModalState = {\n      options: opts.options,\n      collections,\n      inputs: [],\n      inputsByCollection: /* @__PURE__ */ new Map(),\n      onConfirm: opts.onConfirm\n    };\n    const initialSelectionsByCollection = /* @__PURE__ */ new Map();\n    for (let i = 0; i < opts.initialSelection.length; i++) {\n      const ctx = opts.initialSelection[i];\n      const match = opts.options.find((opt) => opt.context === ctx);\n      if (match)\n        initialSelectionsByCollection.set(match.collection, match.context);\n    }\n    for (let i = 0; i < collections.length; i++) {\n      const collection = collections[i];\n      const groupEl = document.createElement("div");\n      groupEl.className = "import-scope-group";\n      const heading = document.createElement("h3");\n      heading.textContent = collection;\n      groupEl.appendChild(heading);\n      const modes = (grouped.get(collection) || []).sort(\n        (a, b) => a.mode < b.mode ? -1 : a.mode > b.mode ? 1 : 0\n      );\n      const defaultContext = initialSelectionsByCollection.get(collection) || ((_a = modes[0]) == null ? void 0 : _a.context) || null;\n      const radioName = `importScopeMode_${i}`;\n      for (let j = 0; j < modes.length; j++) {\n        const opt = modes[j];\n        const label = document.createElement("label");\n        label.className = "import-scope-mode";\n        const radio = document.createElement("input");\n        radio.type = "radio";\n        radio.name = radioName;\n        radio.value = opt.context;\n        radio.checked = defaultContext === opt.context;\n        radio.addEventListener("change", updateImportScopeConfirmState);\n        appState.importScopeModalState.inputs.push(radio);\n        const list = appState.importScopeModalState.inputsByCollection.get(\n          collection\n        ) || [];\n        if (!appState.importScopeModalState.inputsByCollection.has(\n          collection\n        )) {\n          appState.importScopeModalState.inputsByCollection.set(\n            collection,\n            list\n          );\n        }\n        list.push(radio);\n        const span = document.createElement("span");\n        span.textContent = opt.mode;\n        label.appendChild(radio);\n        label.appendChild(span);\n        groupEl.appendChild(label);\n      }\n      uiElements.importScopeBody.appendChild(groupEl);\n    }\n    if (uiElements.importScopeRememberChk)\n      uiElements.importScopeRememberChk.checked = opts.rememberInitially;\n    if (uiElements.importScopeMissingEl) {\n      if (opts.missingPreferred.length > 0) {\n        uiElements.importScopeMissingEl.hidden = false;\n        uiElements.importScopeMissingEl.textContent = "Previously remembered modes not present in this file: " + formatContextList(opts.missingPreferred);\n      } else {\n        uiElements.importScopeMissingEl.hidden = true;\n        uiElements.importScopeMissingEl.textContent = "";\n      }\n    }\n    updateImportScopeConfirmState();\n    uiElements.importScopeOverlay.hidden = false;\n    uiElements.importScopeOverlay.classList.add("is-open");\n    uiElements.importScopeOverlay.setAttribute("aria-hidden", "false");\n    if (!importScopeKeyListenerAttached) {\n      window.addEventListener("keydown", handleImportScopeKeydown, true);\n      importScopeKeyListenerAttached = true;\n    }\n    if (uiElements.importScopeConfirmBtn)\n      uiElements.importScopeConfirmBtn.focus();\n  }\n  function closeImportScopeModal() {\n    if (!uiElements.importScopeOverlay) return;\n    uiElements.importScopeOverlay.classList.remove("is-open");\n    uiElements.importScopeOverlay.hidden = true;\n    uiElements.importScopeOverlay.setAttribute("aria-hidden", "true");\n    if (importScopeKeyListenerAttached) {\n      window.removeEventListener("keydown", handleImportScopeKeydown, true);\n      importScopeKeyListenerAttached = false;\n    }\n    appState.importScopeModalState = null;\n  }\n  function performImport(json, allowHex, contexts) {\n    const normalized = normalizeContextList(contexts);\n    const payload = normalized.length > 0 ? {\n      type: "IMPORT_DTCG",\n      payload: {\n        json,\n        allowHexStrings: allowHex,\n        contexts: normalized\n      }\n    } : {\n      type: "IMPORT_DTCG",\n      payload: { json, allowHexStrings: allowHex }\n    };\n    postToPlugin(payload);\n    appState.lastImportSelection = normalized.slice();\n    const label = normalized.length > 0 ? formatContextList(normalized) : "all contexts";\n    log(`Import requested (${label}).`);\n  }\n  function startImportFlow(json, allowHex) {\n    const options = collectContextsFromJson(json);\n    if (options.length === 0) {\n      performImport(json, allowHex, []);\n      return;\n    }\n    const grouped = /* @__PURE__ */ new Map();\n    for (let i = 0; i < options.length; i++) {\n      const option = options[i];\n      const list = grouped.get(option.collection) || [];\n      if (!grouped.has(option.collection))\n        grouped.set(option.collection, list);\n      list.push(option);\n    }\n    const availableSet = new Set(options.map((opt) => opt.context));\n    const missingPreferred = [];\n    let rememberInitially = false;\n    const initialSelectionsByCollection = /* @__PURE__ */ new Map();\n    if (appState.importPreference && appState.importPreference.contexts.length > 0) {\n      for (let i = 0; i < appState.importPreference.contexts.length; i++) {\n        const ctx = appState.importPreference.contexts[i];\n        if (availableSet.has(ctx)) {\n          const match = options.find((opt) => opt.context === ctx);\n          if (match) {\n            initialSelectionsByCollection.set(\n              match.collection,\n              match.context\n            );\n            rememberInitially = true;\n          }\n        } else {\n          missingPreferred.push(ctx);\n        }\n      }\n    }\n    const collections = Array.from(grouped.keys()).sort(\n      (a, b) => a < b ? -1 : a > b ? 1 : 0\n    );\n    for (let i = 0; i < collections.length; i++) {\n      const collection = collections[i];\n      if (!initialSelectionsByCollection.has(collection)) {\n        const modes = (grouped.get(collection) || []).sort(\n          (a, b) => a.mode < b.mode ? -1 : a.mode > b.mode ? 1 : 0\n        );\n        if (modes.length > 0)\n          initialSelectionsByCollection.set(collection, modes[0].context);\n      }\n    }\n    const initialSelection = collections.map((collection) => initialSelectionsByCollection.get(collection)).filter((ctx) => typeof ctx === "string");\n    const requiresChoice = collections.some((collection) => {\n      const list = grouped.get(collection) || [];\n      return list.length > 1;\n    });\n    if (!requiresChoice) {\n      performImport(json, allowHex, initialSelection);\n      return;\n    }\n    openImportScopeModal({\n      options,\n      initialSelection,\n      rememberInitially,\n      missingPreferred,\n      onConfirm: (selected, remember) => {\n        if (remember) setImportPreference(selected);\n        else if (appState.importPreference) clearImportPreference(true);\n        performImport(json, allowHex, selected);\n      }\n    });\n  }\n  function getPreferredImportContexts() {\n    if (appState.importPreference && appState.importPreference.contexts.length > 0)\n      return appState.importPreference.contexts.slice();\n    if (appState.lastImportSelection.length > 0)\n      return appState.lastImportSelection.slice();\n    return [];\n  }\n\n  // src/app/ui/features/export.ts\n  function prettyExportName(original) {\n    const name = original && typeof original === "string" ? original : "tokens.json";\n    const m = name.match(/^(.*)_mode=(.*)\\.tokens\\.json$/);\n    if (m) {\n      const collection = m[1].trim();\n      const mode = m[2].trim();\n      return `${collection} - ${mode}.json`;\n    }\n    return name.endsWith(".json") ? name : name + ".json";\n  }\n  function supportsFilePicker() {\n    return typeof window.showSaveFilePicker === "function";\n  }\n  async function beginPendingSave(suggestedName) {\n    try {\n      if (!supportsFilePicker()) return false;\n      const handle = await window.showSaveFilePicker({\n        suggestedName,\n        types: [\n          {\n            description: "JSON",\n            accept: { "application/json": [".json"] }\n          }\n        ]\n      });\n      const writable = await handle.createWritable();\n      appState.pendingSave = { writable, name: suggestedName };\n      return true;\n    } catch (e) {\n      appState.pendingSave = null;\n      return false;\n    }\n  }\n  async function finishPendingSave(text) {\n    if (!appState.pendingSave) return false;\n    try {\n      await appState.pendingSave.writable.write(\n        new Blob([text], { type: "application/json" })\n      );\n      await appState.pendingSave.writable.close();\n      return true;\n    } catch (e) {\n      try {\n        await appState.pendingSave.writable.close();\n      } catch (e2) {\n      }\n      return false;\n    } finally {\n      appState.pendingSave = null;\n    }\n  }\n  function triggerJsonDownload(filename, text) {\n    try {\n      const blob = new Blob([text], { type: "application/json" });\n      const url = URL.createObjectURL(blob);\n      const a = document.createElement("a");\n      a.href = url;\n      a.download = filename;\n      a.style.position = "absolute";\n      a.style.left = "-9999px";\n      document.body.appendChild(a);\n      a.click();\n      setTimeout(() => {\n        URL.revokeObjectURL(url);\n        a.remove();\n      }, 0);\n    } catch (e) {\n    }\n  }\n\n  // src/app/ui/features/resize.ts\n  function postResize(width, height) {\n    const w = Math.max(720, Math.min(1600, Math.floor(width)));\n    const h2 = Math.max(420, Math.min(1200, Math.floor(height)));\n    postToPlugin({ type: "UI_RESIZE", payload: { width: w, height: h2 } });\n  }\n  function queueResize(width, height) {\n    appState.resizeQueued = { width, height };\n    if (appState.resizeRaf !== 0) return;\n    appState.resizeRaf = window.requestAnimationFrame(() => {\n      appState.resizeRaf = 0;\n      if (!appState.resizeQueued) return;\n      postResize(appState.resizeQueued.width, appState.resizeQueued.height);\n      appState.resizeQueued = null;\n    });\n  }\n  function applyResizeDelta(ev) {\n    if (!appState.resizeTracking || ev.pointerId !== appState.resizeTracking.pointerId)\n      return;\n    const dx = ev.clientX - appState.resizeTracking.startX;\n    const dy = ev.clientY - appState.resizeTracking.startY;\n    const nextW = appState.resizeTracking.startWidth + dx;\n    const nextH = appState.resizeTracking.startHeight + dy;\n    queueResize(nextW, nextH);\n    ev.preventDefault();\n  }\n  function endResize(ev) {\n    if (!appState.resizeTracking || ev.pointerId !== appState.resizeTracking.pointerId)\n      return;\n    applyResizeDelta(ev);\n    window.removeEventListener("pointermove", handleResizeMove, true);\n    window.removeEventListener("pointerup", endResize, true);\n    window.removeEventListener("pointercancel", cancelResize, true);\n    if (uiElements.resizeHandleEl) {\n      try {\n        uiElements.resizeHandleEl.releasePointerCapture(\n          appState.resizeTracking.pointerId\n        );\n      } catch (e) {\n      }\n    }\n    appState.resizeTracking = null;\n  }\n  function cancelResize(ev) {\n    if (!appState.resizeTracking || ev.pointerId !== appState.resizeTracking.pointerId)\n      return;\n    window.removeEventListener("pointermove", handleResizeMove, true);\n    window.removeEventListener("pointerup", endResize, true);\n    window.removeEventListener("pointercancel", cancelResize, true);\n    if (uiElements.resizeHandleEl) {\n      try {\n        uiElements.resizeHandleEl.releasePointerCapture(\n          appState.resizeTracking.pointerId\n        );\n      } catch (e) {\n      }\n    }\n    appState.resizeTracking = null;\n  }\n  function handleResizeMove(ev) {\n    applyResizeDelta(ev);\n  }\n  function autoFitOnce() {\n    if (typeof document === "undefined") return;\n    const contentW = Math.max(\n      document.documentElement.scrollWidth,\n      document.body ? document.body.scrollWidth : 0\n    );\n    const contentH = Math.max(\n      document.documentElement.scrollHeight,\n      document.body ? document.body.scrollHeight : 0\n    );\n    const vw = window.innerWidth;\n    const vh = window.innerHeight;\n    const needsW = contentW > vw ? contentW : vw;\n    const needsH = contentH > vh ? contentH : vh;\n    if (needsW > vw || needsH > vh) postResize(needsW, needsH);\n  }\n\n  // src/app/ui.ts\n  var prefersDarkQuery = typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null;\n  function applyTheme() {\n    if (typeof document === "undefined") return;\n    const effective = appState.systemDarkMode ? "dark" : "light";\n    const root = document.documentElement;\n    if (effective === "light") {\n      root.setAttribute("data-theme", "light");\n    } else {\n      root.removeAttribute("data-theme");\n    }\n    root.style.colorScheme = effective;\n  }\n  function primeTheme() {\n    if (!prefersDarkQuery) {\n      applyTheme();\n      return;\n    }\n    appState.systemDarkMode = prefersDarkQuery.matches;\n    applyTheme();\n    prefersDarkQuery.addEventListener("change", (e) => {\n      appState.systemDarkMode = e.matches;\n      applyTheme();\n    });\n  }\n  primeTheme();\n  var githubUi = createGithubUi({\n    postToPlugin: (message) => postToPlugin(message),\n    log: (message) => log(message),\n    getLogElement: () => uiElements.logEl,\n    getCollectionSelect: () => uiElements.collectionSelect,\n    getModeSelect: () => uiElements.modeSelect,\n    getAllowHexCheckbox: () => uiElements.allowHexChk,\n    getStyleDictionaryCheckbox: () => uiElements.styleDictionaryChk,\n    getFlatTokensCheckbox: () => uiElements.flatTokensChk,\n    getImportContexts: () => getPreferredImportContexts()\n  });\n  function clearSelect(sel) {\n    while (sel.options.length > 0) sel.remove(0);\n  }\n  function setDisabledStates() {\n    if (uiElements.importBtn && uiElements.fileInput) {\n      const hasFile = !!(uiElements.fileInput.files && uiElements.fileInput.files.length > 0);\n      uiElements.importBtn.disabled = !hasFile;\n    }\n    if (uiElements.exportBtn && uiElements.exportAllChk && uiElements.collectionSelect && uiElements.modeSelect && uiElements.exportPickers) {\n      const exportAll = !!uiElements.exportAllChk.checked;\n      if (exportAll) {\n        uiElements.exportBtn.disabled = false;\n        uiElements.exportPickers.style.opacity = "0.5";\n      } else {\n        uiElements.exportPickers.style.opacity = "1";\n        const hasSelection = !!uiElements.collectionSelect.value && !!uiElements.modeSelect.value;\n        uiElements.exportBtn.disabled = !hasSelection;\n      }\n    }\n    if (uiElements.exportTypographyBtn) {\n      uiElements.exportTypographyBtn.disabled = false;\n    }\n  }\n  function populateCollections(data) {\n    appState.currentCollections = data.collections;\n    if (!(uiElements.collectionSelect && uiElements.modeSelect)) return;\n    clearSelect(uiElements.collectionSelect);\n    for (let i = 0; i < data.collections.length; i++) {\n      const c = data.collections[i];\n      const opt = document.createElement("option");\n      opt.value = c.name;\n      opt.textContent = c.name;\n      uiElements.collectionSelect.appendChild(opt);\n    }\n    onCollectionChange();\n  }\n  function onCollectionChange() {\n    if (!(uiElements.collectionSelect && uiElements.modeSelect)) return;\n    const selected = uiElements.collectionSelect.value;\n    clearSelect(uiElements.modeSelect);\n    let firstModeSet = false;\n    for (let i = 0; i < appState.currentCollections.length; i++) {\n      const c = appState.currentCollections[i];\n      if (c.name === selected) {\n        for (let j = 0; j < c.modes.length; j++) {\n          const m = c.modes[j];\n          const opt = document.createElement("option");\n          opt.value = m.name;\n          opt.textContent = m.name;\n          uiElements.modeSelect.appendChild(opt);\n        }\n        if (uiElements.modeSelect.options.length > 0 && uiElements.modeSelect.selectedIndex === -1) {\n          uiElements.modeSelect.selectedIndex = 0;\n          firstModeSet = true;\n        }\n        break;\n      }\n    }\n    setDisabledStates();\n    githubUi.onSelectionChange();\n    if (firstModeSet) requestPreviewForCurrent();\n  }\n  function applyLastSelection(last) {\n    if (!last || !(uiElements.collectionSelect && uiElements.modeSelect))\n      return;\n    let found = false;\n    for (let i = 0; i < uiElements.collectionSelect.options.length; i++) {\n      if (uiElements.collectionSelect.options[i].value === last.collection) {\n        uiElements.collectionSelect.selectedIndex = i;\n        found = true;\n        break;\n      }\n    }\n    onCollectionChange();\n    if (found) {\n      for (let j = 0; j < uiElements.modeSelect.options.length; j++) {\n        if (uiElements.modeSelect.options[j].value === last.mode) {\n          uiElements.modeSelect.selectedIndex = j;\n          break;\n        }\n      }\n    }\n    setDisabledStates();\n  }\n  function requestPreviewForCurrent() {\n    if (!(uiElements.collectionSelect && uiElements.modeSelect)) return;\n    const collection = uiElements.collectionSelect.value || "";\n    const mode = uiElements.modeSelect.value || "";\n    if (!collection || !mode) {\n      if (uiElements.w3cPreviewEl)\n        uiElements.w3cPreviewEl.textContent = "{ /* select a collection & mode to preview */ }";\n      return;\n    }\n    const styleDictionary = !!(uiElements.styleDictionaryChk && uiElements.styleDictionaryChk.checked);\n    const flatTokens = !!(uiElements.flatTokensChk && uiElements.flatTokensChk.checked);\n    postToPlugin({\n      type: "PREVIEW_REQUEST",\n      payload: { collection, mode, styleDictionary, flatTokens }\n    });\n  }\n  window.addEventListener("message", async (event) => {\n    var _a, _b, _c, _d, _e;\n    const data = event.data;\n    if (!data || typeof data !== "object") return;\n    let msg = null;\n    const maybePayload = data.pluginMessage;\n    if (maybePayload && typeof maybePayload === "object") {\n      const maybeMsg = maybePayload;\n      if (typeof maybeMsg.type === "string") {\n        msg = maybeMsg;\n      }\n    }\n    if (!msg) return;\n    if (msg.type === "ERROR") {\n      log("ERROR: " + ((_b = (_a = msg.payload) == null ? void 0 : _a.message) != null ? _b : ""));\n      return;\n    }\n    if (msg.type === "INFO") {\n      log((_d = (_c = msg.payload) == null ? void 0 : _c.message) != null ? _d : "");\n      return;\n    }\n    if (msg.type === "IMPORT_SUMMARY") {\n      const summary = msg.payload.summary;\n      if (summary && Array.isArray(summary.appliedContexts)) {\n        appState.lastImportSelection = summary.appliedContexts.slice();\n      } else {\n        appState.lastImportSelection = [];\n      }\n      addImportLogEntry({\n        timestamp: msg.payload.timestamp,\n        source: msg.payload.source,\n        summary\n      });\n      renderImportPreferenceSummary();\n      return;\n    }\n    if (githubUi.handleMessage(msg)) return;\n    if (msg.type === "EXPORT_RESULT") {\n      const files = Array.isArray((_e = msg.payload) == null ? void 0 : _e.files) ? msg.payload.files : [];\n      if (files.length === 0) {\n        log("Nothing to export.");\n        return;\n      }\n      if (appState.pendingSave && files.length === 1) {\n        const only = files[0];\n        const fname = prettyExportName(only == null ? void 0 : only.name);\n        const text = prettyJson(only == null ? void 0 : only.json);\n        const ok = await finishPendingSave(text);\n        if (ok) {\n          log("Saved " + fname + " via file picker.");\n          const div = document.createElement("div");\n          const link = document.createElement("a");\n          link.href = "#";\n          link.textContent = "Download " + fname + " again";\n          link.addEventListener("click", (e) => {\n            e.preventDefault();\n            triggerJsonDownload(fname, text);\n          });\n          if (uiElements.logEl) {\n            div.appendChild(link);\n            uiElements.logEl.appendChild(div);\n            uiElements.logEl.scrollTop = uiElements.logEl.scrollHeight;\n          }\n          log("Export ready.");\n          return;\n        }\n        log(\n          "Could not write via file picker; falling back to download links."\n        );\n      }\n      setDrawerOpen(true);\n      for (let k = 0; k < files.length; k++) {\n        const f = files[k];\n        const fname = prettyExportName(f == null ? void 0 : f.name);\n        const text = prettyJson(f == null ? void 0 : f.json);\n        triggerJsonDownload(fname, text);\n        const div = document.createElement("div");\n        const link = document.createElement("a");\n        link.href = "#";\n        link.textContent = "Download " + fname;\n        link.addEventListener("click", (e) => {\n          e.preventDefault();\n          triggerJsonDownload(fname, text);\n        });\n        if (uiElements.logEl) {\n          div.appendChild(link);\n          uiElements.logEl.appendChild(div);\n          uiElements.logEl.scrollTop = uiElements.logEl.scrollHeight;\n        }\n      }\n      log("Export ready.");\n      return;\n    }\n    if (msg.type === "W3C_PREVIEW") {\n      const displayName = prettyExportName(msg.payload.name);\n      const header = `/* ${displayName} */\n`;\n      if (uiElements.w3cPreviewEl)\n        uiElements.w3cPreviewEl.textContent = header + prettyJson(msg.payload.json);\n      return;\n    }\n    if (msg.type === "COLLECTIONS_DATA") {\n      githubUi.onCollectionsData({\n        collections: msg.payload.collections,\n        textStyles: msg.payload.textStylesCount ? new Array(msg.payload.textStylesCount).fill({\n          id: "",\n          name: ""\n        }) : []\n      });\n      populateCollections({ collections: msg.payload.collections });\n      if (uiElements.exportAllChk)\n        uiElements.exportAllChk.checked = !!msg.payload.exportAllPref;\n      if (uiElements.styleDictionaryChk && typeof msg.payload.styleDictionaryPref === "boolean") {\n        uiElements.styleDictionaryChk.checked = !!msg.payload.styleDictionaryPref;\n      }\n      if (uiElements.flatTokensChk && typeof msg.payload.flatTokensPref === "boolean") {\n        uiElements.flatTokensChk.checked = !!msg.payload.flatTokensPref;\n      }\n      if (uiElements.allowHexChk && typeof msg.payload.allowHexPref === "boolean") {\n        uiElements.allowHexChk.checked = !!msg.payload.allowHexPref;\n      }\n      if (typeof msg.payload.githubRememberPref === "boolean") {\n        if (uiElements.githubRememberChk)\n          uiElements.githubRememberChk.checked = msg.payload.githubRememberPref;\n      }\n      const payload = msg.payload;\n      let last = null;\n      if (payload && typeof payload === "object" && "last" in payload) {\n        const maybeLast = payload.last;\n        if (maybeLast && typeof maybeLast === "object" && typeof maybeLast.collection === "string" && typeof maybeLast.mode === "string") {\n          last = {\n            collection: maybeLast.collection,\n            mode: maybeLast.mode\n          };\n        }\n      }\n      applyLastSelection(last);\n      setDisabledStates();\n      requestPreviewForCurrent();\n      return;\n    }\n    if (msg.type === "RAW_COLLECTIONS_TEXT") {\n      if (uiElements.rawEl) uiElements.rawEl.textContent = msg.payload.text;\n      return;\n    }\n  });\n  document.addEventListener("DOMContentLoaded", () => {\n    if (typeof document === "undefined") return;\n    initDomElements();\n    if (!prefersDarkQuery) applyTheme();\n    appState.importPreference = readImportPreference();\n    appState.importLogEntries = readImportLog();\n    renderImportPreferenceSummary();\n    renderImportLog();\n    if (uiElements.importScopeClearBtn) {\n      uiElements.importScopeClearBtn.addEventListener(\n        "click",\n        () => clearImportPreference(true)\n      );\n    }\n    if (uiElements.importScopeConfirmBtn) {\n      uiElements.importScopeConfirmBtn.addEventListener("click", () => {\n        if (!appState.importScopeModalState) {\n          closeImportScopeModal();\n          return;\n        }\n        const state = appState.importScopeModalState;\n        const selections = [];\n        for (let i = 0; i < state.collections.length; i++) {\n          const collection = state.collections[i];\n          const inputs = state.inputsByCollection.get(collection) || [];\n          const selected = inputs.find((input) => input.checked);\n          if (!selected) return;\n          selections.push(selected.value);\n        }\n        const remember = uiElements.importScopeRememberChk ? !!uiElements.importScopeRememberChk.checked : false;\n        closeImportScopeModal();\n        state.onConfirm(selections, remember);\n      });\n    }\n    if (uiElements.importScopeCancelBtn) {\n      uiElements.importScopeCancelBtn.addEventListener(\n        "click",\n        () => closeImportScopeModal()\n      );\n    }\n    if (uiElements.importScopeOverlay) {\n      uiElements.importScopeOverlay.addEventListener("click", (ev) => {\n        if (ev.target === uiElements.importScopeOverlay)\n          closeImportScopeModal();\n      });\n    }\n    if (uiElements.resizeHandleEl) {\n      uiElements.resizeHandleEl.addEventListener(\n        "pointerdown",\n        (event) => {\n          if (event.button !== 0 && event.pointerType === "mouse") return;\n          if (appState.resizeTracking) return;\n          event.preventDefault();\n          appState.resizeTracking = {\n            pointerId: event.pointerId,\n            startX: event.clientX,\n            startY: event.clientY,\n            startWidth: window.innerWidth,\n            startHeight: window.innerHeight\n          };\n          try {\n            uiElements.resizeHandleEl.setPointerCapture(\n              event.pointerId\n            );\n          } catch (e) {\n          }\n          window.addEventListener("pointermove", handleResizeMove, true);\n          window.addEventListener("pointerup", endResize, true);\n          window.addEventListener("pointercancel", cancelResize, true);\n        }\n      );\n    }\n    githubUi.attach({ document, window });\n    if (uiElements.fileInput)\n      uiElements.fileInput.addEventListener("change", setDisabledStates);\n    if (uiElements.exportAllChk) {\n      uiElements.exportAllChk.addEventListener("change", () => {\n        setDisabledStates();\n        postToPlugin({\n          type: "SAVE_PREFS",\n          payload: { exportAll: !!uiElements.exportAllChk.checked }\n        });\n        githubUi.onSelectionChange();\n      });\n    }\n    if (uiElements.styleDictionaryChk) {\n      uiElements.styleDictionaryChk.addEventListener("change", () => {\n        postToPlugin({\n          type: "SAVE_PREFS",\n          payload: {\n            styleDictionary: !!uiElements.styleDictionaryChk.checked\n          }\n        });\n        requestPreviewForCurrent();\n        githubUi.onSelectionChange();\n      });\n    }\n    if (uiElements.flatTokensChk) {\n      uiElements.flatTokensChk.addEventListener("change", () => {\n        postToPlugin({\n          type: "SAVE_PREFS",\n          payload: { flatTokens: !!uiElements.flatTokensChk.checked }\n        });\n        requestPreviewForCurrent();\n        githubUi.onSelectionChange();\n      });\n    }\n    if (uiElements.githubRememberChk) {\n      uiElements.githubRememberChk.addEventListener("change", () => {\n        postToPlugin({\n          type: "SAVE_PREFS",\n          payload: {\n            githubRememberToken: !!uiElements.githubRememberChk.checked\n          }\n        });\n      });\n    }\n    if (uiElements.refreshBtn) {\n      uiElements.refreshBtn.addEventListener("click", () => {\n        postToPlugin({ type: "FETCH_COLLECTIONS" });\n      });\n    }\n    if (uiElements.importBtn && uiElements.fileInput) {\n      uiElements.importBtn.addEventListener("click", () => {\n        if (!uiElements.fileInput.files || uiElements.fileInput.files.length === 0) {\n          log("Select a JSON file first.");\n          return;\n        }\n        const reader = new FileReader();\n        reader.onload = function() {\n          try {\n            const text = String(reader.result);\n            const json = JSON.parse(text);\n            if (!json || typeof json !== "object" || json instanceof Array) {\n              log(\n                "Invalid JSON structure for tokens (expected an object)."\n              );\n              return;\n            }\n            const allowHex = !!(uiElements.allowHexChk && uiElements.allowHexChk.checked);\n            startImportFlow(json, allowHex);\n          } catch (e) {\n            const msg = e instanceof Error ? e.message : String(e);\n            log("Failed to parse JSON: " + msg);\n          }\n        };\n        reader.readAsText(uiElements.fileInput.files[0]);\n      });\n    }\n    if (uiElements.exportBtn) {\n      uiElements.exportBtn.addEventListener("click", async () => {\n        var _a, _b;\n        let exportAll = false;\n        if (uiElements.exportAllChk)\n          exportAll = !!uiElements.exportAllChk.checked;\n        const styleDictionary = !!(uiElements.styleDictionaryChk && uiElements.styleDictionaryChk.checked);\n        const flatTokens = !!(uiElements.flatTokensChk && uiElements.flatTokensChk.checked);\n        const payload = { exportAll, styleDictionary, flatTokens };\n        if (!exportAll && uiElements.collectionSelect && uiElements.modeSelect) {\n          payload.collection = uiElements.collectionSelect.value;\n          payload.mode = uiElements.modeSelect.value;\n          if (!(payload.collection && payload.mode)) {\n            log(\'Pick collection and mode or use "Export all".\');\n            return;\n          }\n        }\n        const suggestedName = exportAll ? "tokens.json" : prettyExportName(\n          `${(_a = payload.collection) != null ? _a : "Tokens"}_mode=${(_b = payload.mode) != null ? _b : "Mode 1"}.tokens.json`\n        );\n        await beginPendingSave(suggestedName);\n        postToPlugin({ type: "EXPORT_DTCG", payload });\n        if (exportAll) log("Export all requested.");\n        else\n          log(\n            `Export requested for "${payload.collection || ""}" / "${payload.mode || ""}".`\n          );\n      });\n    }\n    if (uiElements.exportTypographyBtn) {\n      uiElements.exportTypographyBtn.addEventListener("click", async () => {\n        await beginPendingSave("typography.json");\n        postToPlugin({ type: "EXPORT_TYPOGRAPHY" });\n        log("Typography export requested.");\n      });\n    }\n    if (uiElements.drawerToggleBtn) {\n      uiElements.drawerToggleBtn.addEventListener("click", () => {\n        const current = uiElements.drawerToggleBtn.getAttribute("aria-expanded") === "true";\n        setDrawerOpen(!current);\n      });\n    }\n    if (uiElements.collectionSelect) {\n      uiElements.collectionSelect.addEventListener("change", () => {\n        onCollectionChange();\n        if (uiElements.collectionSelect && uiElements.modeSelect) {\n          postToPlugin({\n            type: "SAVE_LAST",\n            payload: {\n              collection: uiElements.collectionSelect.value,\n              mode: uiElements.modeSelect.value\n            }\n          });\n          requestPreviewForCurrent();\n        }\n        githubUi.onSelectionChange();\n      });\n    }\n    if (uiElements.modeSelect) {\n      uiElements.modeSelect.addEventListener("change", () => {\n        if (uiElements.collectionSelect && uiElements.modeSelect) {\n          postToPlugin({\n            type: "SAVE_LAST",\n            payload: {\n              collection: uiElements.collectionSelect.value,\n              mode: uiElements.modeSelect.value\n            }\n          });\n        }\n        setDisabledStates();\n        requestPreviewForCurrent();\n        githubUi.onSelectionChange();\n      });\n    }\n    if (uiElements.copyRawBtn)\n      uiElements.copyRawBtn.addEventListener(\n        "click",\n        () => copyElText(uiElements.rawEl, "Raw Figma Collections")\n      );\n    if (uiElements.copyW3cBtn)\n      uiElements.copyW3cBtn.addEventListener(\n        "click",\n        () => copyElText(uiElements.w3cPreviewEl, "W3C Preview")\n      );\n    if (uiElements.copyLogBtn)\n      uiElements.copyLogBtn.addEventListener(\n        "click",\n        () => copyElText(uiElements.logEl, "Log")\n      );\n    githubUi.onSelectionChange();\n    autoFitOnce();\n    if (uiElements.rawEl)\n      uiElements.rawEl.textContent = "Loading variable collections\\u2026";\n    setDisabledStates();\n    setDrawerOpen(getSavedDrawerOpen());\n    postToPlugin({ type: "UI_READY" });\n    setInterval(() => {\n      postToPlugin({ type: "PING" });\n    }, 500);\n  });\n  function setDrawerOpen(open) {\n    if (uiElements.shellEl) {\n      if (open) uiElements.shellEl.classList.remove("drawer-collapsed");\n      else uiElements.shellEl.classList.add("drawer-collapsed");\n    }\n    if (uiElements.drawerToggleBtn) {\n      uiElements.drawerToggleBtn.setAttribute(\n        "aria-expanded",\n        open ? "true" : "false"\n      );\n      uiElements.drawerToggleBtn.textContent = open ? "Hide" : "Show";\n      uiElements.drawerToggleBtn.title = open ? "Hide log" : "Show log";\n    }\n    try {\n      window.localStorage.setItem("drawerOpen", open ? "1" : "0");\n    } catch (e) {\n    }\n  }\n  function getSavedDrawerOpen() {\n    try {\n      const v = window.localStorage.getItem("drawerOpen");\n      if (v === "0") return false;\n      if (v === "1") return true;\n    } catch (e) {\n    }\n    return true;\n  }\n})();\n//# sourceMappingURL=ui.js.map\n<\/script>\n    <script>\n      // Scope tab behavior PER PANEL so multiple tab groups don\'t interfere.\n      (function () {\n        const panels = Array.from(document.querySelectorAll(\'.panel, .drawer\'));\n        panels.forEach(container => {\n          const tabBtns = Array.from(container.querySelectorAll(\'.tabs .tab-btn\'));\n          if (tabBtns.length === 0) return;\n\n          const body = container.querySelector(\'.panel-body, .drawer-body\') || container;\n          const tabPanels = Array.from(body.querySelectorAll(\'.tab-panel\'));\n\n          function activate(name) {\n            tabBtns.forEach(b => {\n              const on = b.getAttribute(\'data-tab\') === name;\n              b.classList.toggle(\'is-active\', on);\n              b.setAttribute(\'aria-selected\', String(on));\n            });\n            tabPanels.forEach(p => {\n              const on = p.getAttribute(\'data-tab\') === name;\n              p.classList.toggle(\'is-active\', on);\n              if (on) p.scrollTop = 0;\n            });\n          }\n\n          tabBtns.forEach(btn => {\n            btn.addEventListener(\'click\', () => {\n              const name = btn.getAttribute(\'data-tab\');\n              if (name) activate(name);\n            });\n          });\n\n          // Initialize to the first .is-active button, or default to the first button\n          const initial = tabBtns.find(b => b.classList.contains(\'is-active\')) || tabBtns[0];\n          if (initial) {\n            const name = initial.getAttribute(\'data-tab\');\n            if (name) activate(name);\n          }\n        });\n      })();\n    <\/script>\n</body>\n\n</html>\n', { width: w, height: h });
  })();
  function send(msg) {
    figma.ui.postMessage(msg);
  }
  var lastChecksum = "";
  async function broadcastLocalCollections(opts = {}) {
    const snap = await snapshotCollectionsForUi();
    if (!opts.force && snap.checksum === lastChecksum) {
      return;
    }
    lastChecksum = snap.checksum;
    const last = await figma.clientStorage.getAsync("lastSelection").catch(() => null);
    const exportAllPrefVal = await figma.clientStorage.getAsync("exportAllPref").catch(() => false);
    const styleDictionaryPrefVal = await figma.clientStorage.getAsync("styleDictionaryPref").catch(() => false);
    const flatTokensPrefVal = await figma.clientStorage.getAsync("flatTokensPref").catch(() => false);
    const allowHexPrefStored = await figma.clientStorage.getAsync("allowHexPref").catch(() => null);
    const githubRememberPrefStored = await figma.clientStorage.getAsync("githubRememberPref").catch(() => null);
    const allowHexPrefVal = typeof allowHexPrefStored === "boolean" ? allowHexPrefStored : true;
    const githubRememberPrefVal = typeof githubRememberPrefStored === "boolean" ? githubRememberPrefStored : true;
    const lastOrNull = last && typeof last.collection === "string" && typeof last.mode === "string" ? last : null;
    if (!opts.silent) {
      send({
        type: "INFO",
        payload: {
          message: "Fetched " + String(snap.collections.length) + " collections" + (opts.force ? "" : " (auto)")
        }
      });
    }
    send({
      type: "COLLECTIONS_DATA",
      payload: {
        collections: snap.collections,
        last: lastOrNull,
        exportAllPref: !!exportAllPrefVal,
        styleDictionaryPref: !!styleDictionaryPrefVal,
        flatTokensPref: !!flatTokensPrefVal,
        allowHexPref: allowHexPrefVal,
        githubRememberPref: githubRememberPrefVal,
        textStylesCount: snap.textStylesCount
      }
    });
    send({ type: "RAW_COLLECTIONS_TEXT", payload: { text: snap.rawText } });
  }
  function startPolling() {
    figma.on("documentchange", (event) => {
      const styleChanges = event.documentChanges.filter(
        (c) => c.type === "STYLE_CREATE" || c.type === "STYLE_DELETE" || c.type === "STYLE_PROPERTY_CHANGE"
      );
      if (styleChanges.length > 0) {
        const createdIds = new Set(
          styleChanges.filter((c) => c.type === "STYLE_CREATE").map((c) => c.id)
        );
        const deletedIds = new Set(
          styleChanges.filter((c) => c.type === "STYLE_DELETE").map((c) => c.id)
        );
        const ghostIds = new Set(
          [...createdIds].filter((id) => deletedIds.has(id))
        );
        for (const change of styleChanges) {
          if (ghostIds.has(change.id)) continue;
          if (change.type === "STYLE_CREATE") {
            const style = figma.getStyleById(change.id);
            if (style) {
              send({
                type: "INFO",
                payload: {
                  message: `Style Created: ${style.name}`
                }
              });
            }
          } else if (change.type === "STYLE_DELETE") {
            send({
              type: "INFO",
              payload: { message: "Style Deleted" }
            });
          } else if (change.type === "STYLE_PROPERTY_CHANGE") {
            if (createdIds.has(change.id)) continue;
            const style = figma.getStyleById(change.id);
            if (style) {
              send({
                type: "INFO",
                payload: {
                  message: `Style Updated: ${style.name} (Properties: ${change.properties.join(
                    ", "
                  )})`
                }
              });
            }
          }
        }
        broadcastLocalCollections({ force: true, silent: true }).catch(
          (err) => console.error(err)
        );
      }
    });
    figma.on("selectionchange", () => {
      broadcastLocalCollections({ force: false, silent: true }).catch(
        (err) => console.error(err)
      );
    });
    figma.on("currentpagechange", () => {
      broadcastLocalCollections({ force: false, silent: true }).catch(
        (err) => console.error(err)
      );
    });
  }
  var github = createGithubDispatcher({
    send,
    snapshotCollectionsForUi,
    analyzeSelectionState,
    safeKeyFromCollectionAndMode,
    importDtcg,
    exportDtcg,
    broadcastLocalCollections
  });
  async function handleUiReady(_msg) {
    await broadcastLocalCollections({ force: true, silent: false });
    await github.onUiReady();
    startPolling();
  }
  async function handleFetchCollections(_msg) {
    await broadcastLocalCollections({ force: true, silent: false });
  }
  async function handlePing(_msg) {
    await broadcastLocalCollections({ force: false, silent: true });
  }
  async function handleImportDtcg(msg) {
    const payload = msg.payload;
    const contexts = Array.isArray(payload.contexts) ? payload.contexts.map((c) => String(c)) : [];
    const summary = await importDtcg(payload.json, {
      allowHexStrings: !!payload.allowHexStrings,
      contexts
    });
    const skippedCount = summary.skippedContexts.length;
    if (skippedCount > 0) {
      send({
        type: "INFO",
        payload: {
          message: `Import completed. Applied ${summary.appliedContexts.length} context(s); skipped ${skippedCount}.`
        }
      });
    } else {
      send({ type: "INFO", payload: { message: "Import completed." } });
    }
    send({
      type: "IMPORT_SUMMARY",
      payload: { summary, timestamp: Date.now(), source: "local" }
    });
    await broadcastLocalCollections({ force: true, silent: true });
  }
  async function handleExportDtcg(msg) {
    const payload = msg.payload;
    const exportAll = !!payload.exportAll;
    const styleDictionary = !!payload.styleDictionary;
    const flatTokens = !!payload.flatTokens;
    if (exportAll) {
      const all = await exportDtcg({
        format: "single",
        styleDictionary,
        flatTokens
      });
      send({ type: "EXPORT_RESULT", payload: { files: all.files } });
      return;
    }
    const collectionName = payload.collection ? payload.collection : "";
    const modeName = payload.mode ? payload.mode : "";
    const per = await exportDtcg({
      format: "perMode",
      styleDictionary,
      flatTokens
    });
    const prettyExact = `${collectionName} - ${modeName}.json`;
    const prettyLoose = `${collectionName} - ${modeName}`;
    const legacy1 = `${collectionName}_mode=${modeName}`;
    const legacy2 = `${collectionName}/mode=${modeName}`;
    const legacy3 = safeKeyFromCollectionAndMode(collectionName, modeName);
    let picked = per.files.find((f) => {
      const n = String((f == null ? void 0 : f.name) || "");
      return n === prettyExact || n === prettyLoose || n.includes(`${collectionName} - ${modeName}`);
    });
    if (!picked) {
      picked = per.files.find((f) => {
        const n = String((f == null ? void 0 : f.name) || "");
        return n.includes(legacy1) || n.includes(legacy2) || n.includes(legacy3);
      });
    }
    const filesToSend = picked ? [picked] : per.files;
    if (!picked) {
      send({
        type: "INFO",
        payload: {
          message: `Export: pretty file not found for "${collectionName}" / "${modeName}". Falling back to all per-mode files.`
        }
      });
    }
    send({ type: "EXPORT_RESULT", payload: { files: filesToSend } });
  }
  async function handleExportTypography(_msg) {
    const result = await exportDtcg({ format: "typography" });
    send({ type: "EXPORT_RESULT", payload: { files: result.files } });
    if (result.files.length > 0) {
      const first = result.files[0];
      send({
        type: "W3C_PREVIEW",
        payload: { name: first.name, json: first.json }
      });
    }
  }
  async function handleSaveLast(msg) {
    const payload = msg.payload;
    if (typeof payload.collection === "string" && typeof payload.mode === "string") {
      await figma.clientStorage.setAsync("lastSelection", {
        collection: payload.collection,
        mode: payload.mode
      });
    }
  }
  async function handleSavePrefs(msg) {
    const payload = msg.payload;
    if (typeof payload.exportAll === "boolean") {
      await figma.clientStorage.setAsync(
        "exportAllPref",
        !!payload.exportAll
      );
    }
    if (typeof payload.styleDictionary === "boolean") {
      await figma.clientStorage.setAsync(
        "styleDictionaryPref",
        !!payload.styleDictionary
      );
    }
    if (typeof payload.flatTokens === "boolean") {
      await figma.clientStorage.setAsync(
        "flatTokensPref",
        !!payload.flatTokens
      );
    }
    if (typeof payload.allowHexStrings === "boolean") {
      await figma.clientStorage.setAsync(
        "allowHexPref",
        !!payload.allowHexStrings
      );
    }
    if (typeof payload.githubRememberToken === "boolean") {
      const rememberPref = !!payload.githubRememberToken;
      await figma.clientStorage.setAsync("githubRememberPref", rememberPref);
      if (!rememberPref) {
        await figma.clientStorage.deleteAsync("github_token_b64").catch(() => {
        });
      }
    }
  }
  async function handleUiResize(msg) {
    const payload = msg.payload;
    const w = Math.max(720, Math.min(1600, Math.floor(payload.width)));
    const h = Math.max(420, Math.min(1200, Math.floor(payload.height)));
    figma.ui.resize(w, h);
    try {
      await figma.clientStorage.setAsync("uiSize", { width: w, height: h });
    } catch (e) {
    }
  }
  async function handlePreviewRequest(msg) {
    const payload = msg.payload;
    const collectionName = payload.collection ? String(payload.collection) : "";
    const modeName = payload.mode ? String(payload.mode) : "";
    const styleDictionary = !!payload.styleDictionary;
    const flatTokens = !!payload.flatTokens;
    const per = await exportDtcg({
      format: "perMode",
      styleDictionary,
      flatTokens
    });
    const prettyExact = `${collectionName} - ${modeName}.json`;
    const prettyLoose = `${collectionName} - ${modeName}`;
    const legacy1 = `${collectionName}_mode=${modeName}`;
    const legacy2 = `${collectionName}/mode=${modeName}`;
    const legacy3 = safeKeyFromCollectionAndMode(collectionName, modeName);
    const picked = per.files.find((f) => {
      const n = String((f == null ? void 0 : f.name) || "");
      return n === prettyExact || n === prettyLoose || n.includes(`${collectionName} - ${modeName}`);
    }) || per.files.find((f) => {
      const n = String((f == null ? void 0 : f.name) || "");
      return n.includes(legacy1) || n.includes(legacy2) || n.includes(legacy3);
    }) || per.files[0] || { name: "tokens-empty.json", json: {} };
    send({
      type: "W3C_PREVIEW",
      payload: { name: picked.name, json: picked.json }
    });
  }
  var coreHandlers = /* @__PURE__ */ new Map([
    ["UI_READY", handleUiReady],
    ["PING", handlePing],
    ["FETCH_COLLECTIONS", handleFetchCollections],
    ["IMPORT_DTCG", handleImportDtcg],
    ["EXPORT_DTCG", handleExportDtcg],
    ["EXPORT_TYPOGRAPHY", handleExportTypography],
    ["SAVE_LAST", handleSaveLast],
    ["SAVE_PREFS", handleSavePrefs],
    ["UI_RESIZE", handleUiResize],
    ["PREVIEW_REQUEST", handlePreviewRequest]
  ]);
  figma.ui.onmessage = async (msg) => {
    try {
      const handler = coreHandlers.get(msg.type);
      if (handler) {
        await handler(msg);
        return;
      }
      if (await github.handle(msg)) return;
    } catch (e) {
      let message = "Unknown error";
      if (e && e.message) message = e.message;
      figma.notify("Plugin error: " + message, { timeout: 4e3 });
      send({ type: "ERROR", payload: { message } });
      console.error(e);
    }
  };
})();
//# sourceMappingURL=main.js.map
