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
        checksum: ""
      };
    }
    if (typeof figma.variables === "undefined" || typeof figma.variables.getLocalVariableCollectionsAsync !== "function" || typeof figma.variables.getVariableByIdAsync !== "function") {
      return {
        collections: [],
        rawText: "Variables API methods not found. Ensure your Figma version supports Variables and try again.",
        checksum: ""
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
        checksumParts.push(`${v.id}:${values.join(",")}`);
      }
      out.push({ id: c.id, name: c.name, modes, variables: varsList });
      rawLines.push("Collection: " + c.name + " (" + c.id + ")");
      const modeNames = modes.map((m) => m.name);
      rawLines.push("  Modes: " + (modeNames.length > 0 ? modeNames.join(", ") : "(none)"));
      rawLines.push("  Variables (" + String(varsList.length) + "):");
      rawLines.push(...varLines);
      rawLines.push("");
    }
    if (out.length === 0) {
      rawLines.push("No local Variable Collections found.");
      rawLines.push("Create one in the Variables panel, then press Refresh.");
    }
    if (typeof figma.getLocalTextStyles === "function") {
      const textStyles = figma.getLocalTextStyles();
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
    return { collections: out, rawText: rawLines.join("\n"), checksum: checksumParts.join("|") };
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
      if (!col) return { ok: false, message: `Collection "${collectionName}" not found in this file.` };
      if (!col.variables || col.variables.length === 0) {
        return { ok: false, message: `Collection "${collectionName}" has no local variables.` };
      }
      const mode = col.modes.find((m) => m.name === modeName);
      if (!mode) return { ok: false, message: `Mode "${modeName}" not found in collection "${collectionName}".` };
      let withValues = 0;
      for (const v of col.variables) {
        const full = await figma.variables.getVariableByIdAsync(v.id);
        if (full && full.valuesByMode && mode.id in full.valuesByMode) withValues++;
      }
      return { ok: true, variableCount: col.variables.length, variablesWithValues: withValues };
    } catch (e) {
      return { ok: false, message: (e == null ? void 0 : e.message) || "Analysis failed" };
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
    var i = 0, s = "";
    for (i = 0; i < path.length; i++) {
      if (i > 0) s += ".";
      s += path[i];
    }
    return s;
  }
  function normalize(graph) {
    var seen = {};
    var copy = [];
    var i = 0;
    for (i = 0; i < graph.tokens.length; i++) {
      var t = graph.tokens[i];
      var key = slashPath(t.path);
      if (!seen[key]) {
        seen[key] = 1;
        copy.push(t);
      }
    }
    copy.sort(function(a, b) {
      var da = toDot(a.path);
      var db = toDot(b.path);
      if (da < db) return -1;
      if (da > db) return 1;
      return 0;
    });
    return { tokens: copy };
  }
  function slashPath(path) {
    var i = 0, s = "";
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
    if (lower === "pixel" || lower === "pixels" || lower === "px") return "pixel";
    if (lower === "percent" || lower === "percentage" || lower === "%") return "percent";
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
        const serialized = { value: value.fontSize.value, unit: "px" };
        out.fontSize = serialized;
        return value.fontSize.value;
      }
      return void 0;
    })();
    const normalizedLetterSpacing = normalizeLetterSpacingForSerialization(value.letterSpacing, fontSizePx);
    if (normalizedLetterSpacing) {
      out.letterSpacing = normalizedLetterSpacing;
    }
    const normalizedLineHeight = normalizeLineHeightForSerialization(value.lineHeight, fontSizePx);
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
        assignFigma("lineHeight", { unit: "PIXELS", value: lineHeight.value });
      } else if (unit === "PERCENT" && isFiniteNumber(lineHeight.value)) {
        value.lineHeight = { value: lineHeight.value, unit: "percent" };
        assignFigma("lineHeight", { unit: "PERCENT", value: lineHeight.value });
      }
    }
    const letterSpacing = style.letterSpacing;
    if (letterSpacing && typeof letterSpacing.unit === "string" && isFiniteNumber(letterSpacing.value)) {
      if (letterSpacing.unit === "PIXELS") {
        value.letterSpacing = { value: letterSpacing.value, unit: "pixel" };
        assignFigma("letterSpacing", { unit: "PIXELS", value: letterSpacing.value });
      } else if (letterSpacing.unit === "PERCENT") {
        value.letterSpacing = { value: letterSpacing.value, unit: "percent" };
        assignFigma("letterSpacing", { unit: "PERCENT", value: letterSpacing.value });
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
    if (typeof leadingTrim !== "undefined") assignFigma("leadingTrim", leadingTrim);
    const listSpacing = style.listSpacing;
    if (isFiniteNumber(listSpacing)) assignFigma("listSpacing", listSpacing);
    const hangingPunctuation = style.hangingPunctuation;
    if (typeof hangingPunctuation === "boolean") assignFigma("hangingPunctuation", hangingPunctuation);
    const hangingList = style.hangingList;
    if (typeof hangingList === "boolean") assignFigma("hangingList", hangingList);
    const textAutoResize = style.textAutoResize;
    if (typeof textAutoResize === "string") assignFigma("textAutoResize", textAutoResize);
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
        warnings.push(`fontSize unit \u201C${value.fontSize.unit}\u201D is not supported. Expected "pixel".`);
      }
    }
    const extLineHeight = figmaExt == null ? void 0 : figmaExt.lineHeight;
    style.lineHeight = { unit: "AUTO" };
    if (extLineHeight) {
      if (extLineHeight.unit === "AUTO") {
        style.lineHeight = { unit: "AUTO" };
      } else if ((extLineHeight.unit === "PIXELS" || extLineHeight.unit === "PERCENT") && isFiniteNumber(extLineHeight.value)) {
        style.lineHeight = { unit: extLineHeight.unit, value: extLineHeight.value };
      }
    } else if (value.lineHeight) {
      if (value.lineHeight === "auto") {
        style.lineHeight = { unit: "AUTO" };
      } else if (value.lineHeight.unit === "pixel") {
        style.lineHeight = { unit: "PIXELS", value: value.lineHeight.value };
      } else if (value.lineHeight.unit === "percent") {
        style.lineHeight = { unit: "PERCENT", value: value.lineHeight.value };
      } else {
        warnings.push(`lineHeight unit \u201C${value.lineHeight.unit}\u201D is not supported.`);
      }
    }
    const extLetterSpacing = figmaExt == null ? void 0 : figmaExt.letterSpacing;
    style.letterSpacing = { unit: "PERCENT", value: 0 };
    if (extLetterSpacing) {
      if ((extLetterSpacing.unit === "PIXELS" || extLetterSpacing.unit === "PERCENT") && isFiniteNumber(extLetterSpacing.value)) {
        style.letterSpacing = { unit: extLetterSpacing.unit, value: extLetterSpacing.value };
      }
    } else if (value.letterSpacing) {
      if (value.letterSpacing.unit === "pixel") {
        style.letterSpacing = { unit: "PIXELS", value: value.letterSpacing.value };
      } else if (value.letterSpacing.unit === "percent") {
        style.letterSpacing = { unit: "PERCENT", value: value.letterSpacing.value };
      } else {
        warnings.push(`letterSpacing unit \u201C${value.letterSpacing.unit}\u201D is not supported.`);
      }
    }
    style.paragraphSpacing = 0;
    if (figmaExt && isFiniteNumber(figmaExt.paragraphSpacing)) {
      style.paragraphSpacing = figmaExt.paragraphSpacing;
    } else if (value.paragraphSpacing) {
      if (value.paragraphSpacing.unit === "pixel") {
        style.paragraphSpacing = value.paragraphSpacing.value;
      } else {
        warnings.push(`paragraphSpacing unit \u201C${value.paragraphSpacing.unit}\u201D is not supported. Expected "pixel".`);
      }
    }
    style.paragraphIndent = 0;
    if (figmaExt && isFiniteNumber(figmaExt.paragraphIndent)) {
      style.paragraphIndent = figmaExt.paragraphIndent;
    } else if (value.paragraphIndent) {
      if (value.paragraphIndent.unit === "pixel") {
        style.paragraphIndent = value.paragraphIndent.value;
      } else {
        warnings.push(`paragraphIndent unit \u201C${value.paragraphIndent.unit}\u201D is not supported. Expected "pixel".`);
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
        if (value.textCase) warnings.push(`textCase \u201C${value.textCase}\u201D is not recognized. Using default.`);
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
        if (value.textDecoration) warnings.push(`textDecoration \u201C${value.textDecoration}\u201D is not recognized. Using default.`);
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
        warnings.push("textAlignHorizontal is not supported for text styles in this version of Figma.");
      }
    } else {
      const textAlignHorizontal = mapTextAlignHorizontalToFigma(value.textAlignHorizontal);
      if (textAlignHorizontal) {
        if (supportsTextAlignHorizontal) {
          try {
            anyStyle.textAlignHorizontal = textAlignHorizontal;
          } catch (e) {
          }
        } else {
          warnings.push("textAlignHorizontal is not supported for text styles in this version of Figma.");
        }
      } else if (value.textAlignHorizontal) {
        warnings.push(`textAlignHorizontal \u201C${value.textAlignHorizontal}\u201D is not recognized. Using default.`);
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
        warnings.push("textAlignVertical is not supported for text styles in this version of Figma.");
      }
    } else {
      const textAlignVertical = mapTextAlignVerticalToFigma(value.textAlignVertical);
      if (textAlignVertical) {
        if (supportsTextAlignVertical) {
          try {
            anyStyle.textAlignVertical = textAlignVertical;
          } catch (e) {
          }
        } else {
          warnings.push("textAlignVertical is not supported for text styles in this version of Figma.");
        }
      } else if (value.textAlignVertical) {
        warnings.push(`textAlignVertical \u201C${value.textAlignVertical}\u201D is not recognized. Using default.`);
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
      return { ok: false, reason: `unsupported colorSpace (\u201C${input.colorSpace}\u201D)` };
    }
    if (!Array.isArray(input.components) || input.components.length !== 3) {
      return { ok: false, reason: "components must be an array of length 3" };
    }
    for (let i = 0; i < 3; i++) {
      const v = input.components[i];
      if (typeof v !== "number" || !Number.isFinite(v)) {
        return { ok: false, reason: `component ${i} is not a finite number` };
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
    if (normalized === "DISPLAY_P3") return cs === "srgb" || cs === "display-p3";
    return cs === "srgb";
  }
  function clamp01(x) {
    if (x < 0) return 0;
    if (x > 1) return 1;
    return x;
  }
  function clamp01Array(v) {
    var out = [];
    var i = 0;
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
    if (space === "display-p3") return [p3Encode(linearRGB[0]), p3Encode(linearRGB[1]), p3Encode(linearRGB[2])];
    return [srgbEncode(linearRGB[0]), srgbEncode(linearRGB[1]), srgbEncode(linearRGB[2])];
  }
  function decode(space, encodedRGB) {
    if (space === "display-p3") return [p3Decode(encodedRGB[0]), p3Decode(encodedRGB[1]), p3Decode(encodedRGB[2])];
    return [srgbDecode(encodedRGB[0]), srgbDecode(encodedRGB[1]), srgbDecode(encodedRGB[2])];
  }
  function convertRgbSpace(rgb, src, dst) {
    if (src === dst) return clamp01Array(rgb);
    var lin = decode(src, clamp01Array(rgb));
    var xyz = src === "srgb" ? mul3(M_SRGB_TO_XYZ, lin) : mul3(M_P3_TO_XYZ, lin);
    var linDst = dst === "srgb" ? mul3(M_XYZ_TO_SRGB, xyz) : mul3(M_XYZ_TO_P3, xyz);
    var enc = encode(dst, linDst);
    return clamp01Array(enc);
  }
  function srgbToHex6(rgb) {
    var r = Math.round(clamp01(rgb[0]) * 255);
    var g = Math.round(clamp01(rgb[1]) * 255);
    var b = Math.round(clamp01(rgb[2]) * 255);
    function to2(n) {
      var s = n.toString(16);
      return s.length === 1 ? "0" + s : s;
    }
    return "#" + to2(r) + to2(g) + to2(b);
  }
  function srgbToHex8(rgba) {
    var r = Math.round(clamp01(rgba.r) * 255);
    var g = Math.round(clamp01(rgba.g) * 255);
    var b = Math.round(clamp01(rgba.b) * 255);
    var a = Math.round(clamp01(rgba.a) * 255);
    function to2(n) {
      var s = n.toString(16);
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
    var s = hex;
    if (s.length > 0 && s.charAt(0) === "#") s = s.substring(1);
    var i = 0;
    for (i = 0; i < s.length; i++) {
      if (!isHexCharCode(s.charCodeAt(i))) throw new Error("Invalid hex color: " + hex);
    }
    var r = 0, g = 0, b = 0, a = 255;
    if (s.length === 3 || s.length === 4) {
      var rNib = s.charCodeAt(0);
      var gNib = s.charCodeAt(1);
      var bNib = s.charCodeAt(2);
      var aNib = s.length === 4 ? s.charCodeAt(3) : 102;
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
    return { r: clamp01(r / 255), g: clamp01(g / 255), b: clamp01(b / 255), a: clamp01(a / 255) };
  }
  function docProfileToSpaceKey(profile) {
    return normalizeDocumentProfile(profile) === "DISPLAY_P3" ? "display-p3" : "srgb";
  }
  function dtcgToFigmaRGBA(value, docProfile) {
    var alpha = typeof value.alpha === "number" ? value.alpha : 1;
    var dst = docProfileToSpaceKey(docProfile);
    var comps = value.components;
    if (comps && comps.length >= 3) {
      var space = value.colorSpace;
      if (space === "srgb" || space === "display-p3") {
        var converted = convertRgbSpace([comps[0], comps[1], comps[2]], space, dst);
        return { r: converted[0], g: converted[1], b: converted[2], a: clamp01(alpha) };
      }
      throw new Error("Unsupported colorSpace: " + space + ". Supported: srgb, display-p3.");
    }
    if (value.hex && typeof value.hex === "string") {
      var fromHex = parseHexToSrgbRGBA(value.hex);
      var a = typeof value.alpha === "number" ? clamp01(value.alpha) : fromHex.a;
      if (dst === "srgb") return { r: fromHex.r, g: fromHex.g, b: fromHex.b, a };
      var toDst = convertRgbSpace([fromHex.r, fromHex.g, fromHex.b], "srgb", dst);
      return { r: toDst[0], g: toDst[1], b: toDst[2], a };
    }
    throw new Error("Color has neither components nor hex.");
  }
  function figmaRGBAToDtcg(rgba, docProfile) {
    var src = docProfileToSpaceKey(docProfile);
    var rgb = [clamp01(rgba.r), clamp01(rgba.g), clamp01(rgba.b)];
    var a = clamp01(rgba.a);
    var colorSpace = src;
    var components = [rgb[0], rgb[1], rgb[2]];
    var srgbRgb = src === "srgb" ? rgb : convertRgbSpace(rgb, "display-p3", "srgb");
    var hex = srgbToHex6(srgbRgb);
    return { colorSpace, components, alpha: a, hex };
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
    var rgba = parseHexToSrgbRGBA(hex);
    var comps = [rgba.r, rgba.g, rgba.b];
    return { colorSpace: "srgb", components: comps, alpha: rgba.a, hex: toHex6FromSrgb({ r: rgba.r, g: rgba.g, b: rgba.b }) };
  }
  function isValidDtcgColorValueObject(v) {
    if (!v || typeof v !== "object") return false;
    const o = v;
    if (!Array.isArray(o.components) || o.components.length < 3) return false;
    if (typeof o.components[0] !== "number" || typeof o.components[1] !== "number" || typeof o.components[2] !== "number") return false;
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
          }, desc ? { description: desc } : {}), hasKey(obj, "$extensions") ? { extensions: obj["$extensions"] } : {});
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
                logWarn(`Skipped invalid color for \u201C${irPath2.join("/")}\u201D \u2014 expected hex string or a valid DTCG color object (srgb/display-p3, 3 numeric components, alpha in [0..1]).`);
              } else {
                logWarn(`Skipped invalid color for \u201C${irPath2.join("/")}\u201D \u2014 expected a DTCG color object (srgb/display-p3, 3 numeric components, optional numeric alpha in [0..1]); strings like "#RRGGBB" are not accepted.`);
              }
            } else {
              logWarn(`Skipped invalid color for \u201C${irPath2.join("/")}\u201D \u2014 expected a valid DTCG color object (srgb/display-p3, 3 numeric components, alpha in [0..1]).`);
            }
            return;
          }
          if (parsed.coercedFromHex) {
            logInfo(`Coerced string hex to DTCG color object for \u201C${irPath2.join("/")}\u201D.`);
          }
          const byCtx2 = {};
          byCtx2[ctx2] = { kind: "color", value: parsed.value };
          registerToken(__spreadValues(__spreadValues({
            path: irPath2,
            type: "color",
            byContext: byCtx2
          }, desc ? { description: desc } : {}), hasKey(obj, "$extensions") ? { extensions: obj["$extensions"] } : {}));
          return;
        }
        const declaredType = groupType;
        if (!declaredType) {
          logWarn(`Skipped token \u201C${path.join("/")}\u201D \u2014 no $type found in token or parent groups.`);
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
              logInfo(`Note: coerced string \u201C${rawVal}\u201D to boolean due to $extensions.com.figma.variableType=BOOLEAN at \u201C${path.join("/")}\u201D.`);
              effectiveType = "boolean";
            }
          }
        }
        if (!valObj && declaredType === "typography") {
          const parsedTypography = parseTypographyValue(rawVal);
          if (!parsedTypography) {
            logWarn(`Skipped token \u201C${path.join("/")}\u201D \u2014 expected a valid typography object.`);
            return;
          }
          const { irPath: irPath2, ctx: ctx2 } = computePathAndCtx(path, obj);
          const byCtx2 = {};
          byCtx2[ctx2] = { kind: "typography", value: parsedTypography };
          registerToken(__spreadValues(__spreadValues({
            path: irPath2,
            type: "typography",
            byContext: byCtx2
          }, desc ? { description: desc } : {}), hasKey(obj, "$extensions") ? { extensions: obj["$extensions"] } : {}));
          return;
        }
        if (!valObj) {
          const observed = typeof rawVal;
          logWarn(`Skipped token \u201C${path.join("/")}\u201D \u2014 declared $type ${declaredType} but found ${observed}.`);
          return;
        }
        const { irPath, ctx } = computePathAndCtx(path, obj);
        const byCtx = {};
        byCtx[ctx] = valObj;
        registerToken(__spreadValues(__spreadValues({
          path: irPath,
          type: effectiveType,
          byContext: byCtx
        }, desc ? { description: desc } : {}), hasKey(obj, "$extensions") ? { extensions: obj["$extensions"] } : {}));
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
          logWarn(`Skipped token \u201C${token.path.join("/")}\u201D \u2014 could not resolve alias type and no $type declared.`);
          invalidTokens.add(token);
          continue;
        }
      }
      if (declaredType && declaredType !== resolvedType) {
        logWarn(`Token \u201C${token.path.join("/")}\u201D declared $type ${declaredType} but resolves to ${resolvedType}; using resolved type.`);
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
        if (typeof ctxBlock.collectionName === "string") collection = ctxBlock.collectionName;
        if (typeof ctxBlock.variableName === "string") variable = ctxBlock.variableName;
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
      const slugSegs = [slugForMatch(collection), ...String(variable).split("/").map((s) => slugForMatch(s))];
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
            refDisp = displayIndex.get(dotRaw(segsIn.map((s) => slugForMatch(s))));
          }
          if (!refDisp && segsIn.length > 0) {
            const firstSlug = slugForMatch(segsIn[0]);
            for (const [k] of displayIndex.entries()) {
              const parts = k.split(".");
              if (parts.length === 0) continue;
              if (slugForMatch(parts[0]) === firstSlug) {
                const cand1 = [parts[0], ...segsIn.slice(1)];
                const cand2 = [parts[0], ...segsIn.slice(1).map((s) => slugForMatch(s))];
                refDisp = displayIndex.get(dotRaw(cand1)) || displayIndex.get(dotRaw(cand2));
                if (refDisp) break;
              }
            }
          }
          tokenObj["$value"] = refDisp ? `{${[refDisp.collection, ...String(refDisp.variable).split("/")].join(".")}}` : `{${segsIn.join(".")}}`;
          break;
        }
        case "color": {
          const cv = chosen.value;
          if (opts && opts.styleDictionary) {
            tokenObj["$value"] = colorValueToHexString(cv);
          } else {
            const out = {
              colorSpace: cv.colorSpace,
              components: [cv.components[0], cv.components[1], cv.components[2]]
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
      const flattened = flattenFigmaExtensionsForCtx(t.extensions, chosenCtx);
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
    for (const k in o) if (Object.prototype.hasOwnProperty.call(o, k)) out.push(k);
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
      const fetched = await Promise.all(ids.map((id) => variablesApi.getVariableByIdAsync(id)));
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
            perContext[ctx].alias = { type: "VARIABLE_ALIAS", id: mv.id };
            const target = variablesById.get(mv.id) || await variablesApi.getVariableByIdAsync(mv.id);
            if (target && !variablesById.has(target.id)) variablesById.set(target.id, target);
            if (target) {
              const collName = collectionNameById.get(target.variableCollectionId) || c.name;
              const aPath = canonicalPath(collName, target.name);
              byContext[ctx] = { kind: "alias", path: aPath };
            }
            continue;
          }
          if (type === "color" && isRGBA(mv)) {
            const cv = figmaRGBAToDtcg({ r: mv.r, g: mv.g, b: mv.b, a: mv.a }, profile);
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
    if (typeof figma.getLocalTextStyles === "function") {
      const textStyles = figma.getLocalTextStyles();
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
        if (v.kind === "color" && isValidDtcgColorValueObject(v.value)) return true;
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
            logWarn2(`Skipped creating direct color at \u201C${t.path.join("/")}\u201D in ${ctx} \u2014 ${lastReason}`);
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
    return { ok: false, reason: lastReason || "no valid color values in any context; not creating variable or collection." };
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
    for (const k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) out.push(k);
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
      if (!hintHex && pc && pc[ctx] && typeof pc[ctx].hex === "string") hintHex = pc[ctx].hex;
      if (!hintHex || !importedHexOrNull) return;
      const a = hintHex.trim().toLowerCase();
      const b = importedHexOrNull.trim().toLowerCase();
      if (a !== b) logWarn2(`color mismatch for \u201C${t.path.join("/")}\u201D in ${ctx}. Using $value over $extensions.`);
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
          if (!expectedCollection && typeof ctxData.collectionName === "string") expectedCollection = ctxData.collectionName;
          if (!expectedVariable && typeof ctxData.variableName === "string") expectedVariable = ctxData.variableName;
        }
      }
    }
    if (typeof expectedCollection === "string" && expectedCollection !== pathCollection) {
      return {
        ok: false,
        reason: `Skipping \u201C${t.path.join("/")}\u201D \u2014 $extensions.com.figma.collectionName (\u201C${expectedCollection}\u201D) doesn\u2019t match JSON group (\u201C${pathCollection}\u201D).`
      };
    }
    if (typeof expectedVariable === "string" && expectedVariable !== pathVariable) {
      return {
        ok: false,
        reason: `Skipping \u201C${t.path.join("/")}\u201D \u2014 $extensions.com.figma.variableName (\u201C${expectedVariable}\u201D) doesn\u2019t match JSON key (\u201C${pathVariable}\u201D).`
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
        reason: `Skipping \u201C${t.path.join("/")}\u201D \u2014 $extensions.com.figma.styleName (\u201C${expected}\u201D) doesn\u2019t match JSON key (\u201C${styleName}\u201D).`
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
    logInfo2(`Import: document color profile ${String(profile)} (canonical ${canonicalProfile}).`);
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
        indexVarKeys(existingVarIdByPathDot, cDisplay, varSegs, variable.id);
      }
    }
    const knownCollections = new Set(Object.keys(colByName));
    const displayBySlug = {};
    for (const name of knownCollections) displayBySlug[slugSegment(name)] = name;
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
        logWarn2(`Skipped ${t.type} token \u201C${t.path.join("/")}\u201D \u2014 needs a ${t.type} $value or an alias reference.`);
      }
      if (t.type === "string" && !readFigmaVariableTypeHint(t) && tokenHasBooleanLikeString(t)) {
        logInfo2(`Note: \u201C${t.path.join("/")}\u201D has string values "true"/"false" but no $extensions.com.figma.variableType hint; keeping STRING in Figma.`);
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
      const canReadStyles = typeof figma.getLocalTextStyles === "function";
      const canCreateStyles = typeof figma.createTextStyle === "function";
      if (!canReadStyles || !canCreateStyles) {
        logWarn2("Typography tokens present but text style APIs are unavailable in this version of Figma. Skipping typography import.");
        return;
      }
      const stylesById = /* @__PURE__ */ new Map();
      const stylesByName = /* @__PURE__ */ new Map();
      const localStyles = figma.getLocalTextStyles();
      for (const style of localStyles) {
        stylesById.set(style.id, style);
        stylesByName.set(style.name, style);
      }
      const loadedFonts = /* @__PURE__ */ new Set();
      for (const token of tokens) {
        const styleSegments = token.path.slice(1);
        const styleName = styleSegments.join("/");
        if (!styleName) {
          logWarn2(`Skipped typography token \u201C${token.path.join("/")}\u201D \u2014 requires a style name after the collection.`);
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
            logWarn2(`Skipped typography alias at \u201C${token.path.join("/")}\u201D in ${ctx} \u2014 text styles do not support aliases.`);
          } else {
            logWarn2(`Skipped unsupported value for \u201C${token.path.join("/")}\u201D in ${ctx} \u2014 expected a typography $value.`);
          }
        }
        if (!typographyValue) {
          logWarn2(`Skipped typography token \u201C${token.path.join("/")}\u201D \u2014 needs a typography $value.`);
          continue;
        }
        if (typographyContexts > 1) {
          logWarn2(`Typography token \u201C${token.path.join("/")}\u201D has multiple contexts. Using the first typography value.`);
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
              logWarn2(`Skipped typography token \u201C${tokenPath}\u201D \u2014 failed to load font \u201C${fontName.family} ${fontName.style}\u201D. ${msg}`);
              skipToken = true;
            }
          }
          if (!skipToken && loadedFonts.has(key)) {
            appliedFont = fontName;
            if (usedFallback) {
              logInfo2(`Typography token \u201C${token.path.join("/")}\u201D is missing a font style. Defaulted to \u201C${fontName.style}\u201D.`);
            }
          }
        } else {
          logWarn2(`Skipped typography token \u201C${tokenPath}\u201D \u2014 typography token is missing fontFamily.`);
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
        const warnings = applyTypographyValueToTextStyle(style, typographyValue, {
          fontName: appliedFont,
          figma: typographyExt != null ? typographyExt : null
        });
        for (const warning of warnings) {
          logWarn2(`Text style \u201C${styleName}\u201D: ${warning}`);
        }
      }
    }
    const idByPath = {};
    function varNameFromPath(path) {
      return path.slice(1).join("/") || (path[0] || "token");
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
          logWarn2(`Skipped creating direct ${t.type} token \u201C${t.path.join("/")}\u201D \u2014 ${directCheck.reason}`);
        } else if (!directCheck.suppressWarn) {
          logWarn2(`Skipped creating direct ${t.type} token \u201C${t.path.join("/")}\u201D \u2014 no valid direct values in any context; not creating variable or collection.`);
        }
        continue;
      }
      const col = ensureCollection(collectionName);
      let existingVarId = null;
      for (const vid of col.variableIds) {
        const cand = variablesById.get(vid) || await variablesApi.getVariableByIdAsync(vid);
        if (cand && !variablesById.has(vid) && cand) variablesById.set(vid, cand);
        if (cand && cand.name === varName) {
          existingVarId = cand.id;
          break;
        }
      }
      let v = null;
      if (existingVarId) {
        v = variablesById.get(existingVarId) || await variablesApi.getVariableByIdAsync(existingVarId);
        if (v && !variablesById.has(existingVarId)) variablesById.set(existingVarId, v);
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
          const segs = normalizeAliasSegments(val.path, collectionName, displayBySlug, knownCollections);
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
          if (cand && !variablesById.has(vid)) variablesById.set(vid, cand);
          if (cand && cand.name === varName) {
            existingVarId = cand.id;
            break;
          }
        }
        let v = null;
        if (existingVarId) {
          v = variablesById.get(existingVarId) || await variablesApi.getVariableByIdAsync(existingVarId);
          if (v && !variablesById.has(existingVarId)) variablesById.set(existingVarId, v);
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
          logWarn2(`Alias target not found for \u201C${t.path.join("/")}\u201D. Variable not created.`);
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
      if (targetVar && !variablesById.has(varId)) variablesById.set(varId, targetVar);
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
                logWarn2(`Collection \u201C${cName}\u201D is limited to a single mode. Renaming \u201C${prevName}\u201D to \u201C${mName}\u201D.`);
                try {
                  col.renameMode(loneMode.modeId, mName);
                  loneMode.name = mName;
                  const keyOld = cName + "/" + prevName;
                  delete modeIdByKey[keyOld];
                  modeId = loneMode.modeId;
                  const keyNew = cName + "/" + mName;
                  modeIdByKey[keyNew] = modeId;
                  modeIdByKey[ctx] = modeId;
                  logInfo2(`Renamed mode \u201C${prevName}\u201D \u2192 \u201C${mName}\u201D in collection \u201C${cName}\u201D.`);
                } catch (err) {
                  const errMsg = err instanceof Error ? err.message : String(err);
                  logError(`Failed to rename mode \u201C${prevName}\u201D to \u201C${mName}\u201D in collection \u201C${cName}\u201D. ${errMsg}`);
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
                  logWarn2(`Unable to add mode \u201C${mName}\u201D to collection \u201C${cName}\u201D because only a single mode is allowed. Renaming existing mode \u201C${prevName}\u201D.`);
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
                      logInfo2(`Renamed mode \u201C${prevName}\u201D \u2192 \u201C${mName}\u201D in collection \u201C${cName}\u201D.`);
                    } else {
                      logError(`Unable to rename mode in collection \u201C${cName}\u201D because it has no modes.`);
                    }
                  } catch (renameErr) {
                    const renameMsg = renameErr instanceof Error ? renameErr.message : String(renameErr);
                    logError(`Failed to rename mode \u201C${prevName}\u201D to \u201C${mName}\u201D in collection \u201C${cName}\u201D. ${renameMsg}`);
                  }
                } else {
                  logError(`Error while adding mode \u201C${mName}\u201D to collection \u201C${cName}\u201D. ${message}`);
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
            candidates.push([displayBySlug[rawSegs[0]], ...rawSegs.slice(1)]);
          }
          let targetId;
          for (const cand of candidates) {
            const exact = dot(cand);
            const fullySlugged = dot([slugSegment(cand[0] || ""), ...cand.slice(1).map((s) => slugSegment(s))]);
            targetId = idByPath[exact] || idByPath[fullySlugged] || existingVarIdByPathDot[exact] || existingVarIdByPathDot[fullySlugged];
            if (targetId) break;
          }
          if (!targetId) {
            logWarn2(`Alias target not found while setting \u201C${node.path.join("/")}\u201D in ${ctx}. Skipped this context.`);
            continue;
          }
          if (targetId === targetVar.id) {
            logWarn2(`Self-alias is not allowed for \u201C${node.path.join("/")}\u201D in ${ctx}. Skipped this context.`);
            continue;
          }
          const aliasObj = await variablesApi.createVariableAliasByIdAsync(targetId);
          targetVar.setValueForMode(modeId, aliasObj);
          continue;
        } else if (val.kind === "color") {
          const shape = isDtcgColorShapeValid(val.value);
          if (!shape.ok) {
            logWarn2(`Skipped setting color for \u201C${node.path.join("/")}\u201D in ${ctx} \u2014 ${shape.reason}.`);
            continue;
          }
          const cs = (val.value.colorSpace || "srgb").toLowerCase();
          if (!isColorSpaceRepresentableInDocument(cs, canonicalProfile)) {
            if (cs === "display-p3" && canonicalProfile === "SRGB") {
              logWarn2(
                `Skipped \u201C${node.path.join("/")}\u201D in ${ctx}: the token is display-p3 but this file is set to sRGB. Open File \u2192 File Settings \u2192 Color Space and switch to Display P3, or convert the token to sRGB.`
              );
            } else {
              logWarn2(`Skipped setting color for \u201C${node.path.join("/")}\u201D in ${ctx} \u2014 colorSpace \u201C${cs}\u201D isn\u2019t representable in this document (${canonicalProfile}).`);
            }
            continue;
          }
          const norm = normalizeDtcgColorValue(val.value);
          maybeWarnColorMismatch(node, ctx, typeof norm.hex === "string" ? norm.hex : null);
          const rgba = dtcgToFigmaRGBA(norm, profile);
          targetVar.setValueForMode(modeId, { r: rgba.r, g: rgba.g, b: rgba.b, a: rgba.a });
        } else if (val.kind === "number" || val.kind === "string" || val.kind === "boolean") {
          if (targetVar.resolvedType === "BOOLEAN") {
            if (val.kind === "boolean") {
              targetVar.setValueForMode(modeId, !!val.value);
            } else if (val.kind === "string" && looksBooleanString(val.value)) {
              targetVar.setValueForMode(modeId, /^true$/i.test(val.value.trim()));
            } else {
              logWarn2(`Skipped setting non-boolean value for BOOLEAN variable \u201C${node.path.join("/")}\u201D in ${ctx}.`);
            }
          } else if (val.kind === "boolean") {
            targetVar.setValueForMode(modeId, val.value ? "true" : "false");
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
    var out = [];
    var k;
    for (k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) out.push(k);
    return out;
  }
  var INVALID_FILE_CHARS = /[<>:"/\\|?*\u0000-\u001F]/g;
  function sanitizeForFile(s) {
    var cleaned = String(s);
    cleaned = cleaned.replace(INVALID_FILE_CHARS, "_");
    cleaned = cleaned.replace(/\s+/g, " ").trim();
    cleaned = cleaned.replace(/[. ]+$/g, "");
    return cleaned;
  }
  function cloneTokenWithSingleContext(t, ctx) {
    var val = t.byContext[ctx];
    if (!val) return null;
    var copyByCtx = {};
    copyByCtx[ctx] = val;
    return {
      path: (function() {
        var arr = [];
        var i = 0;
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
    var seen = [];
    var i = 0;
    for (i = 0; i < graph.tokens.length; i++) {
      var t = graph.tokens[i];
      var ks = keysOf2(t.byContext);
      var j = 0;
      for (j = 0; j < ks.length; j++) {
        var ctx = ks[j];
        var already = false;
        var k = 0;
        for (k = 0; k < seen.length; k++) if (seen[k] === ctx) {
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
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var raw = list[i];
      if (typeof raw !== "string") continue;
      var trimmed = raw.trim();
      if (!trimmed) continue;
      var exists = false;
      for (var j = 0; j < out.length; j++) if (out[j] === trimmed) {
        exists = true;
        break;
      }
      if (!exists) out.push(trimmed);
    }
    return out;
  }
  function filterGraphByContexts(graph, requested) {
    var available = collectContextsFromGraph(graph);
    var requestedList = sanitizeContexts(requested);
    var availableSet = {};
    for (var ai = 0; ai < available.length; ai++) availableSet[available[ai]] = true;
    var appliedSet = {};
    var missingRequested = [];
    var fallbackToAll = false;
    if (requestedList.length > 0) {
      for (var ri = 0; ri < requestedList.length; ri++) {
        var ctx = requestedList[ri];
        if (availableSet[ctx]) appliedSet[ctx] = true;
        else missingRequested.push(ctx);
      }
      if (Object.keys(appliedSet).length === 0 && available.length > 0) {
        fallbackToAll = true;
        for (var ai2 = 0; ai2 < available.length; ai2++) appliedSet[available[ai2]] = true;
      }
    } else {
      for (var ai3 = 0; ai3 < available.length; ai3++) appliedSet[available[ai3]] = true;
    }
    var appliedList = [];
    for (var ctxKey2 in appliedSet) if (Object.prototype.hasOwnProperty.call(appliedSet, ctxKey2)) appliedList.push(ctxKey2);
    appliedList.sort();
    var skippedList = [];
    for (var si = 0; si < available.length; si++) {
      var ctxAvailable = available[si];
      if (!appliedSet[ctxAvailable]) {
        skippedList.push({ context: ctxAvailable, reason: "Excluded by partial import selection" });
      }
    }
    skippedList.sort(function(a, b) {
      if (a.context === b.context) return 0;
      return a.context < b.context ? -1 : 1;
    });
    var filteredTokens = [];
    var removedTokens = [];
    for (var ti = 0; ti < graph.tokens.length; ti++) {
      var tok = graph.tokens[ti];
      var ctxs = keysOf2(tok.byContext);
      if (ctxs.length === 0) {
        var cloneEmpty = {
          path: tok.path.slice(),
          type: tok.type,
          byContext: {}
        };
        if (typeof tok.description !== "undefined") cloneEmpty.description = tok.description;
        if (typeof tok.extensions !== "undefined") cloneEmpty.extensions = tok.extensions;
        filteredTokens.push(cloneEmpty);
        continue;
      }
      var kept = [];
      var removed = [];
      var newCtx = {};
      for (var ci = 0; ci < ctxs.length; ci++) {
        var ctx = ctxs[ci];
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
      var clone = {
        path: tok.path.slice(),
        type: tok.type,
        byContext: newCtx
      };
      if (typeof tok.description !== "undefined") clone.description = tok.description;
      if (typeof tok.extensions !== "undefined") clone.extensions = tok.extensions;
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
    const desired = normalize(readDtcgToIR(json, { allowHexStrings: !!opts.allowHexStrings }));
    const filtered = filterGraphByContexts(desired, opts.contexts || []);
    const writeResult = await writeIRToFigma(filtered.graph);
    filtered.summary.createdStyles = writeResult.createdTextStyles;
    return filtered.summary;
  }
  async function exportDtcg(opts) {
    var current = await readFigmaToIR();
    var graph = normalize(current);
    var styleDictionary = !!opts.styleDictionary;
    var flatTokens = !!opts.flatTokens;
    if (opts.format === "typography") {
      var typographyTokens = [];
      for (var ti = 0; ti < graph.tokens.length; ti++) {
        var tok = graph.tokens[ti];
        if (tok.type === "typography") {
          var cloneTypo = {
            path: tok.path.slice(),
            type: tok.type,
            byContext: {}
          };
          var ctxKeys = keysOf2(tok.byContext);
          for (var ci = 0; ci < ctxKeys.length; ci++) {
            var ctx = ctxKeys[ci];
            cloneTypo.byContext[ctx] = tok.byContext[ctx];
          }
          if (typeof tok.description !== "undefined") cloneTypo.description = tok.description;
          if (typeof tok.extensions !== "undefined") cloneTypo.extensions = tok.extensions;
          typographyTokens.push(cloneTypo);
        }
      }
      var typographyGraph = { tokens: typographyTokens };
      var typographySerialized = serialize(typographyGraph, { styleDictionary, flatTokens });
      var typographyJson = typographySerialized.json;
      if (!typographyTokens.length) {
        typographyJson = {};
      }
      return { files: [{ name: "typography.json", json: typographyJson }] };
    }
    if (opts.format === "single") {
      var single = serialize(graph, { styleDictionary, flatTokens });
      return { files: [{ name: "tokens.json", json: single.json }] };
    }
    var contexts = [];
    var i = 0;
    for (i = 0; i < graph.tokens.length; i++) {
      var t = graph.tokens[i];
      var ks = keysOf2(t.byContext);
      var j = 0;
      for (j = 0; j < ks.length; j++) {
        var c = ks[j];
        var found = false;
        var k = 0;
        for (k = 0; k < contexts.length; k++) if (contexts[k] === c) {
          found = true;
          break;
        }
        if (!found) contexts.push(c);
      }
    }
    var files = [];
    var ci = 0;
    for (ci = 0; ci < contexts.length; ci++) {
      var ctx = contexts[ci];
      var filtered = { tokens: [] };
      var ii = 0;
      for (ii = 0; ii < graph.tokens.length; ii++) {
        var tok = graph.tokens[ii];
        var one = cloneTokenWithSingleContext(tok, ctx);
        if (one) filtered.tokens.push(one);
      }
      if (filtered.tokens.length === 0) continue;
      var out = serialize(filtered, { styleDictionary, flatTokens });
      var collection = ctx;
      var mode = "default";
      var haveCollection = false;
      var haveMode = false;
      for (ii = 0; ii < filtered.tokens.length && (!haveCollection || !haveMode); ii++) {
        var tok = filtered.tokens[ii];
        if (!tok || !tok.extensions) continue;
        var figmaExt = tok.extensions["com.figma"];
        if (!figmaExt || typeof figmaExt !== "object") continue;
        var perCtx = figmaExt.perContext;
        if (!perCtx || typeof perCtx !== "object") continue;
        var ctxMeta = perCtx[ctx];
        if (!ctxMeta || typeof ctxMeta !== "object") continue;
        var ctxCollection = ctxMeta.collectionName;
        var ctxMode = ctxMeta.modeName;
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
        var slash = ctx.lastIndexOf("/");
        collection = slash >= 0 ? ctx.substring(0, slash) : ctx;
        mode = slash >= 0 ? ctx.substring(slash + 1) : "default";
      }
      var fname = sanitizeForFile(collection) + "_mode=" + sanitizeForFile(mode) + ".tokens.json";
      files.push({ name: fname, json: out.json });
    }
    if (files.length === 0) {
      var fallback = serialize(graph, { styleDictionary, flatTokens });
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
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin);
    }
  }
  var INVALID_REPO_SEGMENT = /[<>:"\\|?*\u0000-\u001F]/;
  function sanitizeRepoPathInput(path) {
    const collapsed = String(path || "").replace(/\\/g, "/").replace(/\/{2,}/g, "/").replace(/^\/+|\/+$/g, "");
    if (!collapsed) return { ok: true, path: "" };
    const segments = collapsed.split("/").filter(Boolean);
    for (const seg of segments) {
      if (!seg) return { ok: false, message: "Path contains an empty segment." };
      if (seg === "." || seg === "..") {
        return { ok: false, message: 'Path cannot include "." or ".." segments.' };
      }
      if (INVALID_REPO_SEGMENT.test(seg)) {
        return { ok: false, message: `Path component "${seg}" contains invalid characters.` };
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
      for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
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
          "Authorization": `Bearer ${token}`,
          "Accept": "application/vnd.github+json",
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
        "Authorization": `Bearer ${token}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      };
      const all = [];
      let page = 1;
      while (true) {
        const res = await fetchJsonWithRetry(`${base}&page=${page}`, { headers }, 2);
        if (res.status === 401) return { ok: false, error: "bad credentials" };
        if (!res.ok) {
          if (all.length) return { ok: true, repos: all };
          return { ok: false, error: await res.text() || `HTTP ${res.status}` };
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
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
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
        return { ok: false, owner, repo, status: res.status, message: text || `HTTP ${res.status}`, rate };
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
          const repoRes = await fetch(`${baseRepoUrl}${force ? `?_ts=${Date.now()}` : ""}`, { headers });
          if (repoRes.ok) {
            const j = await repoRes.json();
            if (j && typeof j.default_branch === "string") defaultBranch = j.default_branch;
          }
        } catch (e) {
        }
      }
      return { ok: true, owner, repo, page, branches, defaultBranch, hasMore, rate };
    } catch (e) {
      return { ok: false, owner, repo, status: 0, message: (e == null ? void 0 : e.message) || "network error" };
    }
  }
  async function ghCreateBranch(token, owner, repo, newBranch, baseBranch) {
    var _a, _b;
    const baseRepoUrl = `https://api.github.com/repos/${owner}/${repo}`;
    const headers = {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    const branchName = String(newBranch || "").trim().replace(/^refs\/heads\//, "");
    const baseName = String(baseBranch || "").trim().replace(/^refs\/heads\//, "");
    if (!branchName || !baseName) {
      return { ok: false, owner, repo, baseBranch: baseName, newBranch: branchName, status: 400, message: "empty branch name(s)" };
    }
    try {
      try {
        const repoRes = await fetch(baseRepoUrl, { headers });
        const rate0 = parseRate(repoRes == null ? void 0 : repoRes.headers);
        const saml0 = headerGet(repoRes == null ? void 0 : repoRes.headers, "x-github-saml");
        if (repoRes.status === 403 && saml0) {
          return { ok: false, owner, repo, baseBranch: baseName, newBranch: branchName, status: 403, message: "SAML/SSO required", samlRequired: true, rate: rate0 };
        }
        if (!repoRes.ok) {
          const text = await safeText(repoRes);
          return { ok: false, owner, repo, baseBranch: baseName, newBranch: branchName, status: repoRes.status, message: text || `HTTP ${repoRes.status}` };
        }
        const repoJson = await repoRes.json();
        const pushAllowed = !!((_a = repoJson == null ? void 0 : repoJson.permissions) == null ? void 0 : _a.push);
        if ((repoJson == null ? void 0 : repoJson.permissions) && pushAllowed !== true) {
          return { ok: false, owner, repo, baseBranch: baseName, newBranch: branchName, status: 403, message: "Token/user lacks push permission to this repository", noPushPermission: true, rate: rate0 };
        }
      } catch (e) {
      }
      const refUrl = `${baseRepoUrl}/git/ref/heads/${encodeURIComponent(baseName)}`;
      const refRes = await fetch(refUrl, { headers });
      const rate1 = parseRate(refRes == null ? void 0 : refRes.headers);
      const saml1 = headerGet(refRes == null ? void 0 : refRes.headers, "x-github-saml");
      if (refRes.status === 403 && saml1) {
        return { ok: false, owner, repo, baseBranch: baseName, newBranch: branchName, status: 403, message: "SAML/SSO required", samlRequired: true, rate: rate1 };
      }
      if (!refRes.ok) {
        const text = await safeText(refRes);
        return { ok: false, owner, repo, baseBranch: baseName, newBranch: branchName, status: refRes.status, message: text || `HTTP ${refRes.status}`, rate: rate1 };
      }
      const refJson = await refRes.json();
      const sha = (((_b = refJson == null ? void 0 : refJson.object) == null ? void 0 : _b.sha) || (refJson == null ? void 0 : refJson.sha) || "").trim();
      if (!sha) {
        return { ok: false, owner, repo, baseBranch: baseName, newBranch: branchName, status: 500, message: "could not resolve base SHA" };
      }
      const createUrl = `${baseRepoUrl}/git/refs`;
      const body = JSON.stringify({ ref: `refs/heads/${branchName}`, sha });
      const createRes = await fetch(createUrl, { method: "POST", headers, body });
      const rate2 = parseRate(createRes == null ? void 0 : createRes.headers);
      const saml2 = headerGet(createRes == null ? void 0 : createRes.headers, "x-github-saml");
      if (createRes.status === 403 && saml2) {
        return { ok: false, owner, repo, baseBranch: baseName, newBranch: branchName, status: 403, message: "SAML/SSO required", samlRequired: true, rate: rate2 };
      }
      if (!createRes.ok) {
        const text = await safeText(createRes);
        return { ok: false, owner, repo, baseBranch: baseName, newBranch: branchName, status: createRes.status, message: text || `HTTP ${createRes.status}`, rate: rate2 };
      }
      const html_url = `https://github.com/${owner}/${repo}/tree/${encodeURIComponent(branchName)}`;
      return { ok: true, owner, repo, baseBranch: baseName, newBranch: branchName, sha, html_url, rate: rate2 };
    } catch (e) {
      return { ok: false, owner, repo, baseBranch: baseName, newBranch: branchName, status: 0, message: (e == null ? void 0 : e.message) || "network error" };
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
    const url = rel ? `${baseRepoUrl}/contents/${rel}?ref=${encodeURIComponent(ref)}&_ts=${Date.now()}` : `${baseRepoUrl}/contents?ref=${encodeURIComponent(ref)}&_ts=${Date.now()}`;
    const headers = {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
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
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
    const sanitized = sanitizeRepoPathInput(folderPath);
    if (!sanitized.ok) {
      return { ok: false, owner, repo, branch, folderPath: "", status: 400, message: sanitized.message };
    }
    const norm = sanitized.path;
    if (!norm) {
      return { ok: false, owner, repo, branch, folderPath: norm, status: 400, message: "empty folder path" };
    }
    try {
      {
        const rel = encodePathSegments(norm);
        const url = `${baseRepoUrl}/contents/${rel}?ref=${encodeURIComponent(branch)}&_ts=${Date.now()}`;
        const res = await fetch(url, { headers });
        const rate = parseRate(res == null ? void 0 : res.headers);
        const saml = headerGet(res == null ? void 0 : res.headers, "x-github-saml");
        if (res.status === 403 && saml) {
          return { ok: false, owner, repo, branch, folderPath: norm, status: 403, message: "SAML/SSO required", samlRequired: true, rate };
        }
        if (res.ok) {
          return {
            ok: true,
            owner,
            repo,
            branch,
            folderPath: norm,
            created: false,
            html_url: `https://github.com/${owner}/${repo}/tree/${encodeURIComponent(branch)}/${encodePathSegments(norm)}`,
            rate
          };
        }
        if (res.status !== 404) {
          const text = await safeText(res);
          return { ok: false, owner, repo, branch, folderPath: norm, status: res.status, message: text || `HTTP ${res.status}`, rate };
        }
      }
      const placeholderRel = `${norm}/.gitkeep`;
      const putUrl = `${baseRepoUrl}/contents/${encodePathSegments(placeholderRel)}`;
      const body = JSON.stringify({
        message: `chore: create folder ${norm}`,
        content: b64("."),
        branch
      });
      const putRes = await fetch(putUrl, { method: "PUT", headers, body });
      const rate2 = parseRate(putRes == null ? void 0 : putRes.headers);
      const saml2 = headerGet(putRes == null ? void 0 : putRes.headers, "x-github-saml");
      if (putRes.status === 403 && saml2) {
        return { ok: false, owner, repo, branch, folderPath: norm, status: 403, message: "SAML/SSO required", samlRequired: true, rate: rate2 };
      }
      if (!putRes.ok) {
        const text = await safeText(putRes);
        return { ok: false, owner, repo, branch, folderPath: norm, status: putRes.status, message: text || `HTTP ${putRes.status}`, rate: rate2 };
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
        html_url: `https://github.com/${owner}/${repo}/tree/${encodeURIComponent(branch)}/${encodePathSegments(norm)}`,
        rate: rate2
      };
    } catch (e) {
      return { ok: false, owner, repo, branch, folderPath: norm, status: 0, message: (e == null ? void 0 : e.message) || "network error" };
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
        return { ok: false, owner, repo, branch, status: 400, message: (err == null ? void 0 : err.message) || "invalid path" };
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
      return { ok: false, owner, repo, branch, status: 400, message: "no files to commit" };
    }
    try {
      const cacheBust = `_ts=${Date.now()}`;
      const refRes = await fetch(`${base}/git/ref/heads/${encodeURIComponent(branch)}?${cacheBust}`, { headers });
      const rate1 = parseRate(refRes == null ? void 0 : refRes.headers);
      if (!refRes.ok) {
        const text = await safeText(refRes);
        return { ok: false, owner, repo, branch, status: refRes.status, message: text || `HTTP ${refRes.status}`, rate: rate1 };
      }
      const refJson = await refRes.json();
      const baseCommitSha = (((_a = refJson == null ? void 0 : refJson.object) == null ? void 0 : _a.sha) || (refJson == null ? void 0 : refJson.sha) || "").trim();
      if (!baseCommitSha) {
        return { ok: false, owner, repo, branch, status: 500, message: "could not resolve branch commit sha", rate: rate1 };
      }
      const commitRes = await fetch(`${base}/git/commits/${baseCommitSha}?${cacheBust}`, { headers });
      const rate2 = parseRate(commitRes == null ? void 0 : commitRes.headers);
      if (!commitRes.ok) {
        const text = await safeText(commitRes);
        return { ok: false, owner, repo, branch, status: commitRes.status, message: text || `HTTP ${commitRes.status}`, rate: rate2 };
      }
      const commitJson = await commitRes.json();
      const baseTreeSha = (((_b = commitJson == null ? void 0 : commitJson.tree) == null ? void 0 : _b.sha) || "").trim();
      if (!baseTreeSha) {
        return { ok: false, owner, repo, branch, status: 500, message: "could not resolve base tree sha", rate: rate2 };
      }
      const blobShas = [];
      for (let i = 0; i < cleaned.length; i++) {
        const blobRes = await fetch(`${base}/git/blobs`, {
          method: "POST",
          headers,
          body: JSON.stringify({ content: cleaned[i].content, encoding: "utf-8" })
        });
        const rateB = parseRate(blobRes == null ? void 0 : blobRes.headers);
        if (!blobRes.ok) {
          const text = await safeText(blobRes);
          return { ok: false, owner, repo, branch, status: blobRes.status, message: text || `HTTP ${blobRes.status}`, rate: rateB };
        }
        const blobJson = await blobRes.json();
        const blobSha = ((blobJson == null ? void 0 : blobJson.sha) || "").trim();
        if (!blobSha) {
          return { ok: false, owner, repo, branch, status: 500, message: "failed to create blob sha" };
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
        return { ok: false, owner, repo, branch, status: treeRes.status, message: text || `HTTP ${treeRes.status}`, rate: rate3 };
      }
      const treeJson = await treeRes.json();
      const newTreeSha = ((treeJson == null ? void 0 : treeJson.sha) || "").trim();
      if (!newTreeSha) {
        return { ok: false, owner, repo, branch, status: 500, message: "failed to create tree sha" };
      }
      const commitCreateRes = await fetch(`${base}/git/commits`, {
        method: "POST",
        headers,
        body: JSON.stringify({ message, tree: newTreeSha, parents: [baseCommitSha] })
      });
      const rate4 = parseRate(commitCreateRes == null ? void 0 : commitCreateRes.headers);
      if (!commitCreateRes.ok) {
        const text = await safeText(commitCreateRes);
        return { ok: false, owner, repo, branch, status: commitCreateRes.status, message: text || `HTTP ${commitCreateRes.status}`, rate: rate4 };
      }
      const newCommit = await commitCreateRes.json();
      const newCommitSha = ((newCommit == null ? void 0 : newCommit.sha) || "").trim();
      if (!newCommitSha) {
        return { ok: false, owner, repo, branch, status: 500, message: "failed to create commit sha" };
      }
      const updateRefRes = await fetch(`${base}/git/refs/heads/${encodeURIComponent(branch)}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ sha: newCommitSha, force: false })
      });
      const rate5 = parseRate(updateRefRes == null ? void 0 : updateRefRes.headers);
      if (!updateRefRes.ok) {
        const text = await safeText(updateRefRes);
        return { ok: false, owner, repo, branch, status: updateRefRes.status, message: text || `HTTP ${updateRefRes.status}`, rate: rate5 };
      }
      return {
        ok: true,
        owner,
        repo,
        branch,
        commitSha: newCommitSha,
        commitUrl: `https://github.com/${owner}/${repo}/commit/${newCommitSha}`,
        treeUrl: `https://github.com/${owner}/${repo}/tree/${encodeURIComponent(branch)}`,
        rate: rate5
      };
    } catch (e) {
      return { ok: false, owner, repo, branch, status: 0, message: (e == null ? void 0 : e.message) || "network error" };
    }
  }
  async function ghGetFileContents(token, owner, repo, branch, path) {
    const sanitized = sanitizeRepoPathInput(path);
    if (!sanitized.ok) {
      return { ok: false, owner, repo, branch, path: "", status: 400, message: sanitized.message };
    }
    if (!sanitized.path) {
      return { ok: false, owner, repo, branch, path: "", status: 400, message: "Empty path" };
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
        return { ok: false, owner, repo, branch, path: cleanPath, status: 403, message: "SAML/SSO required", samlRequired: true, rate };
      }
      if (!res.ok) {
        const text2 = await safeText(res);
        return { ok: false, owner, repo, branch, path: cleanPath, status: res.status, message: text2 || `HTTP ${res.status}`, rate };
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
        return { ok: false, owner, repo, branch, path: cleanPath, status: 422, message: "File had no content", rate };
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
      return { ok: false, owner, repo, branch, path: cleanPath, status: 0, message: (e == null ? void 0 : e.message) || "network error" };
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
      return { ok: false, owner, repo, base, head, status: 400, message: "missing PR parameters" };
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
        return { ok: false, owner, repo, base, head, status: 403, message: "SAML/SSO required", samlRequired: true, rate };
      }
      if (!res.ok) {
        const text = await safeText(res);
        const msg = text || `HTTP ${res.status}`;
        const already = res.status === 422 && /already exists/i.test(msg);
        return { ok: false, owner, repo, base, head, status: res.status, message: msg, rate, alreadyExists: already };
      }
      const json = await res.json();
      const number = typeof (json == null ? void 0 : json.number) === "number" ? json.number : 0;
      const prUrl = typeof (json == null ? void 0 : json.html_url) === "string" ? json.html_url : "";
      if (!number || !prUrl) {
        return { ok: false, owner, repo, base, head, status: 500, message: "invalid PR response", rate };
      }
      return { ok: true, owner, repo, base, head, number, url: prUrl, rate };
    } catch (e) {
      return { ok: false, owner, repo, base, head, status: 0, message: (e == null ? void 0 : e.message) || "network error" };
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
    if (trimmed === "/" || trimmed === "./" || trimmed === ".") return { ok: true, storage: "/" };
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
    if (stored === "/" || stored === "./" || stored === ".") return { ok: true, path: "" };
    const collapsed = stored.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
    const stripped = collapsed.replace(/^\/+/, "").replace(/\/+$/, "");
    if (!stripped) return { ok: true, path: "" };
    const segments = stripped.split("/").filter(Boolean);
    const err = validateFolderSegments(segments);
    if (err) return { ok: false, message: err };
    return { ok: true, path: segments.join("/") };
  }

  // src/app/github/filenames.ts
  var DEFAULT_GITHUB_FILENAME = "tokens.json";
  var INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001F]/;
  var MAX_FILENAME_LENGTH = 128;
  function validateGithubFilename(raw) {
    const initial = typeof raw === "string" ? raw : DEFAULT_GITHUB_FILENAME;
    const trimmed = initial.trim();
    if (!trimmed) {
      return { ok: false, message: "GitHub: Enter a filename (e.g., tokens.json)." };
    }
    if (trimmed === "." || trimmed === "..") {
      return { ok: false, message: 'GitHub: Filename cannot be "." or "..".' };
    }
    if (trimmed.length > MAX_FILENAME_LENGTH) {
      return { ok: false, message: `GitHub: Filename must be ${MAX_FILENAME_LENGTH} characters or fewer.` };
    }
    if (INVALID_FILENAME_CHARS.test(trimmed)) {
      return { ok: false, message: 'GitHub: Filename contains unsupported characters like / \\ : * ? " < > |.' };
    }
    if (!/\.json$/i.test(trimmed)) {
      return { ok: false, message: "GitHub: Filename must end with .json." };
    }
    return { ok: true, filename: trimmed };
  }

  // src/app/github/dispatcher.ts
  var GH_SELECTED_KEY = "gh.selected";
  var GH_LAST_COMMIT_KEY = "gh.lastCommitSignature";
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
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  function createGithubDispatcher(deps) {
    let ghToken = null;
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
    function pickPerModeFile(files, collectionName, modeName) {
      const prettyExact = `${collectionName} - ${modeName}.json`;
      const prettyLoose = `${collectionName} - ${modeName}`;
      const legacy1 = `${collectionName}_mode=${modeName}`;
      const legacy2 = `${collectionName}/mode=${modeName}`;
      const legacy3 = deps.safeKeyFromCollectionAndMode(
        collectionName,
        modeName
      );
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
    async function listAndSendRepos(token) {
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
        deps.send({ type: "GITHUB_REPOS", payload: { repos: minimal } });
      } else {
        deps.send({
          type: "ERROR",
          payload: {
            message: `GitHub: Could not list repos: ${repos.error}`
          }
        });
        deps.send({ type: "GITHUB_REPOS", payload: { repos: [] } });
      }
    }
    async function restoreGithubTokenAndVerify() {
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
        ghToken = decoded;
        const who = await ghGetUser(decoded);
        if (who.ok) {
          deps.send({
            type: "GITHUB_AUTH_RESULT",
            payload: {
              ok: true,
              login: who.user.login,
              name: who.user.name,
              remember: true
            }
          });
          await listAndSendRepos(decoded);
        } else {
          deps.send({
            type: "ERROR",
            payload: {
              message: `GitHub: Authentication failed (stored token): ${who.error}.`
            }
          });
          deps.send({
            type: "GITHUB_AUTH_RESULT",
            payload: { ok: false, error: who.error, remember: false }
          });
        }
      } catch (e) {
      }
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
    async function handle(msg) {
      var _a, _b;
      switch (msg.type) {
        case "GITHUB_SET_TOKEN": {
          const token = String(msg.payload.token || "").trim();
          const remember = !!msg.payload.remember;
          if (!token) {
            deps.send({
              type: "ERROR",
              payload: { message: "GitHub: Empty token." }
            });
            deps.send({
              type: "GITHUB_AUTH_RESULT",
              payload: {
                ok: false,
                error: "empty token",
                remember: false
              }
            });
            return true;
          }
          ghToken = token;
          if (remember) {
            await figma.clientStorage.setAsync("github_token_b64", encodeToken(token)).catch(() => {
            });
          } else {
            await figma.clientStorage.deleteAsync("github_token_b64").catch(() => {
            });
          }
          const who = await ghGetUser(token);
          if (who.ok) {
            deps.send({
              type: "GITHUB_AUTH_RESULT",
              payload: {
                ok: true,
                login: who.user.login,
                name: who.user.name,
                remember
              }
            });
            await listAndSendRepos(token);
          } else {
            deps.send({
              type: "ERROR",
              payload: {
                message: `GitHub: Authentication failed: ${who.error}.`
              }
            });
            deps.send({
              type: "GITHUB_AUTH_RESULT",
              payload: {
                ok: false,
                error: who.error,
                remember: false
              }
            });
            deps.send({ type: "GITHUB_REPOS", payload: { repos: [] } });
          }
          return true;
        }
        case "GITHUB_FORGET_TOKEN": {
          ghToken = null;
          await figma.clientStorage.deleteAsync("github_token_b64").catch(() => {
          });
          deps.send({
            type: "INFO",
            payload: { message: "GitHub: Token cleared." }
          });
          deps.send({
            type: "GITHUB_AUTH_RESULT",
            payload: { ok: false, remember: false }
          });
          deps.send({ type: "GITHUB_REPOS", payload: { repos: [] } });
          return true;
        }
        case "GITHUB_SELECT_REPO": {
          const sel = await getSelected();
          await setSelected({
            owner: msg.payload.owner,
            repo: msg.payload.repo,
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
          return true;
        }
        case "GITHUB_SELECT_BRANCH": {
          const sel = await getSelected();
          await setSelected({
            owner: msg.payload.owner || sel.owner,
            repo: msg.payload.repo || sel.repo,
            branch: msg.payload.branch,
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
          return true;
        }
        case "GITHUB_SET_FOLDER": {
          const folderResult = normalizeFolderForStorage(
            String((_a = msg.payload.folder) != null ? _a : "")
          );
          if (!folderResult.ok) {
            deps.send({
              type: "ERROR",
              payload: { message: folderResult.message }
            });
            return true;
          }
          const folder = folderResult.storage;
          const sel = await getSelected();
          await setSelected({
            owner: msg.payload.owner || sel.owner,
            repo: msg.payload.repo || sel.repo,
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
          return true;
        }
        case "GITHUB_SAVE_STATE": {
          const update = {};
          if (typeof msg.payload.owner === "string")
            update.owner = msg.payload.owner;
          if (typeof msg.payload.repo === "string")
            update.repo = msg.payload.repo;
          if (typeof msg.payload.branch === "string")
            update.branch = msg.payload.branch;
          if (typeof msg.payload.folder === "string") {
            const folderResult = normalizeFolderForStorage(
              msg.payload.folder
            );
            if (folderResult.ok) update.folder = folderResult.storage;
            else
              deps.send({
                type: "ERROR",
                payload: { message: folderResult.message }
              });
          }
          if (typeof msg.payload.filename === "string")
            update.filename = msg.payload.filename.trim();
          if (typeof msg.payload.commitMessage === "string")
            update.commitMessage = msg.payload.commitMessage;
          if (msg.payload.scope === "all" || msg.payload.scope === "selected" || msg.payload.scope === "typography") {
            update.scope = msg.payload.scope;
          }
          if (typeof msg.payload.collection === "string")
            update.collection = msg.payload.collection;
          if (typeof msg.payload.mode === "string")
            update.mode = msg.payload.mode;
          if (typeof msg.payload.styleDictionary === "boolean")
            update.styleDictionary = msg.payload.styleDictionary;
          if (typeof msg.payload.flatTokens === "boolean")
            update.flatTokens = msg.payload.flatTokens;
          if (typeof msg.payload.createPr === "boolean")
            update.createPr = msg.payload.createPr;
          if (typeof msg.payload.prBase === "string")
            update.prBase = msg.payload.prBase;
          if (typeof msg.payload.prTitle === "string")
            update.prTitle = msg.payload.prTitle;
          if (typeof msg.payload.prBody === "string")
            update.prBody = msg.payload.prBody;
          await mergeSelected(update);
          return true;
        }
        case "GITHUB_FETCH_BRANCHES": {
          const owner = String(msg.payload.owner || "");
          const repo = String(msg.payload.repo || "");
          const page = Number.isFinite(msg.payload.page) ? Number(msg.payload.page) : 1;
          const force = !!msg.payload.force;
          if (!ghToken) {
            deps.send({
              type: "GITHUB_BRANCHES_ERROR",
              payload: {
                owner,
                repo,
                status: 401,
                message: "No token"
              }
            });
            return true;
          }
          const res = await ghListBranches(
            ghToken,
            owner,
            repo,
            page,
            force
          );
          if (res.ok) {
            deps.send({ type: "GITHUB_BRANCHES", payload: res });
            if (page === 1 && res.defaultBranch) {
              await mergeSelected({
                owner,
                repo,
                branch: res.defaultBranch,
                prBase: res.defaultBranch
              });
            }
          } else {
            deps.send({ type: "GITHUB_BRANCHES_ERROR", payload: res });
          }
          return true;
        }
        case "GITHUB_FOLDER_LIST": {
          const owner = String(msg.payload.owner || "");
          const repo = String(msg.payload.repo || "");
          const branch = String(msg.payload.branch || "");
          const pathRaw = String(msg.payload.path || "");
          if (!ghToken) {
            deps.send({
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
            return true;
          }
          const normalizedPath = normalizeFolderForStorage(pathRaw);
          if (!normalizedPath.ok) {
            deps.send({
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
            return true;
          }
          const commitPathResult = folderStorageToCommitPath(
            normalizedPath.storage
          );
          if (!commitPathResult.ok) {
            deps.send({
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
            return true;
          }
          const folderPath = commitPathResult.path;
          if (folderPath) {
            const collision = await ensureFolderPathWritable(
              ghToken,
              owner,
              repo,
              branch,
              folderPath
            );
            if (!collision.ok) {
              deps.send({
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
              return true;
            }
          }
          const res = await ghListDirs(
            ghToken,
            owner,
            repo,
            branch,
            commitPathResult.path
          );
          if (res.ok) {
            deps.send({
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
            deps.send({
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
          return true;
        }
        case "GITHUB_CREATE_FOLDER": {
          const owner = String(msg.payload.owner || "");
          const repo = String(msg.payload.repo || "");
          const branch = String(msg.payload.branch || "");
          const folderPathRaw = String(
            msg.payload.folderPath || msg.payload.path || ""
          ).trim();
          if (!ghToken) {
            deps.send({
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
            return true;
          }
          const folderNormalized = normalizeFolderForStorage(folderPathRaw);
          if (!folderNormalized.ok) {
            deps.send({
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
            return true;
          }
          const folderCommit = folderStorageToCommitPath(
            folderNormalized.storage
          );
          if (!folderCommit.ok) {
            deps.send({
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
            return true;
          }
          if (!folderCommit.path) {
            deps.send({
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
            return true;
          }
          const res = await ghEnsureFolder(
            ghToken,
            owner,
            repo,
            branch,
            folderCommit.path
          );
          deps.send({
            type: "GITHUB_CREATE_FOLDER_RESULT",
            payload: res
          });
          return true;
        }
        case "GITHUB_CREATE_BRANCH": {
          const owner = String(msg.payload.owner || "");
          const repo = String(msg.payload.repo || "");
          const baseBranch = String(msg.payload.baseBranch || "");
          const newBranch = String(msg.payload.newBranch || "");
          if (!ghToken) {
            deps.send({
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
            return true;
          }
          if (!owner || !repo || !baseBranch || !newBranch) {
            deps.send({
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
            return true;
          }
          const res = await ghCreateBranch(
            ghToken,
            owner,
            repo,
            newBranch,
            baseBranch
          );
          if (res.ok) {
            await mergeSelected({ owner, repo, branch: newBranch });
          }
          deps.send({
            type: "GITHUB_CREATE_BRANCH_RESULT",
            payload: res
          });
          return true;
        }
        case "GITHUB_FETCH_TOKENS": {
          const owner = String(msg.payload.owner || "");
          const repo = String(msg.payload.repo || "");
          const branch = String(msg.payload.branch || "");
          const pathRaw = String(msg.payload.path || "");
          const allowHex = !!msg.payload.allowHexStrings;
          if (!ghToken) {
            deps.send({
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
            return true;
          }
          if (!owner || !repo || !branch || !pathRaw.trim()) {
            deps.send({
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
            return true;
          }
          const normalizedPath = normalizeFolderForStorage(pathRaw);
          if (!normalizedPath.ok) {
            deps.send({
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
            return true;
          }
          const commitPathResult = folderStorageToCommitPath(
            normalizedPath.storage
          );
          if (!commitPathResult.ok) {
            deps.send({
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
            return true;
          }
          const path = commitPathResult.path;
          const res = await ghGetFileContents(
            ghToken,
            owner,
            repo,
            branch,
            path
          );
          if (!res.ok) {
            deps.send({
              type: "GITHUB_FETCH_TOKENS_RESULT",
              payload: res
            });
            if (res.samlRequired) {
              deps.send({
                type: "ERROR",
                payload: {
                  message: "GitHub: SSO required for this repository. Authorize your PAT and try again."
                }
              });
            }
            return true;
          }
          try {
            const json = JSON.parse(res.contentText || "{}");
            const contexts = Array.isArray(msg.payload.contexts) ? msg.payload.contexts.map((c) => String(c)) : [];
            const summary = await deps.importDtcg(json, {
              allowHexStrings: allowHex,
              contexts
            });
            deps.send({
              type: "GITHUB_FETCH_TOKENS_RESULT",
              payload: { ok: true, owner, repo, branch, path, json }
            });
            deps.send({
              type: "INFO",
              payload: {
                message: `Imported tokens from ${owner}/${repo}@${branch}:${path}`
              }
            });
            deps.send({
              type: "IMPORT_SUMMARY",
              payload: {
                summary,
                timestamp: Date.now(),
                source: "github"
              }
            });
            await deps.broadcastLocalCollections({ force: true });
          } catch (err) {
            const msgText = (err == null ? void 0 : err.message) || "Invalid JSON";
            deps.send({
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
            deps.send({
              type: "ERROR",
              payload: {
                message: `GitHub import failed: ${msgText}`
              }
            });
          }
          return true;
        }
        case "GITHUB_EXPORT_FILES": {
          const scope = msg.payload.scope === "all" ? "all" : msg.payload.scope === "typography" ? "typography" : "selected";
          const collection = String(msg.payload.collection || "");
          const mode = String(msg.payload.mode || "");
          const styleDictionary = !!msg.payload.styleDictionary;
          const flatTokens = !!msg.payload.flatTokens;
          try {
            if (scope === "all") {
              const all = await deps.exportDtcg({
                format: "single",
                styleDictionary,
                flatTokens
              });
              deps.send({
                type: "GITHUB_EXPORT_FILES_RESULT",
                payload: { files: all.files }
              });
            } else if (scope === "typography") {
              const typo = await deps.exportDtcg({
                format: "typography"
              });
              deps.send({
                type: "GITHUB_EXPORT_FILES_RESULT",
                payload: { files: typo.files }
              });
            } else {
              if (!collection || !mode) {
                deps.send({
                  type: "GITHUB_EXPORT_FILES_RESULT",
                  payload: { files: [] }
                });
                deps.send({
                  type: "ERROR",
                  payload: {
                    message: "GitHub: choose collection and mode before exporting."
                  }
                });
                return true;
              }
              const per = await deps.exportDtcg({
                format: "perMode",
                styleDictionary,
                flatTokens
              });
              const prettyExact = `${collection} - ${mode}.json`;
              const prettyLoose = `${collection} - ${mode}`;
              const legacy1 = `${collection}_mode=${mode}`;
              const legacy2 = `${collection}/mode=${mode}`;
              const legacy3 = deps.safeKeyFromCollectionAndMode(
                collection,
                mode
              );
              let picked = per.files.find((f) => {
                const n = String((f == null ? void 0 : f.name) || "");
                return n === prettyExact || n === prettyLoose || n.includes(`${collection} - ${mode}`);
              });
              if (!picked) {
                picked = per.files.find((f) => {
                  const n = String((f == null ? void 0 : f.name) || "");
                  return n.includes(legacy1) || n.includes(legacy2) || n.includes(legacy3);
                });
              }
              const files = picked ? [picked] : per.files;
              deps.send({
                type: "GITHUB_EXPORT_FILES_RESULT",
                payload: { files }
              });
            }
          } catch (err) {
            const msgText = (err == null ? void 0 : err.message) || "Failed to export";
            deps.send({
              type: "ERROR",
              payload: {
                message: `GitHub export failed: ${msgText}`
              }
            });
            deps.send({
              type: "GITHUB_EXPORT_FILES_RESULT",
              payload: { files: [] }
            });
          }
          return true;
        }
        case "GITHUB_EXPORT_AND_COMMIT": {
          const owner = String(msg.payload.owner || "");
          const repo = String(msg.payload.repo || "");
          const baseBranch = String(msg.payload.branch || "");
          const folderRaw = typeof msg.payload.folder === "string" ? msg.payload.folder : "";
          const commitMessage = (String(msg.payload.commitMessage || "") || "Update tokens from Figma").trim();
          const requestedScope = msg.payload.scope === "all" ? "all" : msg.payload.scope === "typography" ? "typography" : "selected";
          let scope = requestedScope;
          const collection = String(msg.payload.collection || "");
          const mode = String(msg.payload.mode || "");
          const styleDictionary = !!msg.payload.styleDictionary;
          const flatTokens = !!msg.payload.flatTokens;
          const createPr = !!msg.payload.createPr;
          const prBaseBranch = createPr ? String(msg.payload.prBase || "") : "";
          const prTitle = String(msg.payload.prTitle || commitMessage).trim() || commitMessage;
          const prBody = typeof msg.payload.prBody === "string" ? msg.payload.prBody : void 0;
          const storedSelection = await getSelected();
          const selectionCollection = collection || (typeof storedSelection.collection === "string" ? storedSelection.collection : "");
          const selectionMode = mode || (typeof storedSelection.mode === "string" ? storedSelection.mode : "");
          const filenameCandidate = typeof msg.payload.filename === "string" ? msg.payload.filename : typeof storedSelection.filename === "string" ? storedSelection.filename : void 0;
          const filenameCheck = validateGithubFilename(
            filenameCandidate != null ? filenameCandidate : DEFAULT_GITHUB_FILENAME
          );
          if (!filenameCheck.ok) {
            deps.send({
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
            return true;
          }
          const filenameToCommit = filenameCheck.filename;
          if (!ghToken) {
            deps.send({
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
            return true;
          }
          if (!owner || !repo || !baseBranch) {
            deps.send({
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
            return true;
          }
          if (!commitMessage) {
            deps.send({
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
            return true;
          }
          const folderInfo = await getSelectedFolderForCommit(folderRaw);
          if (!folderInfo.ok) {
            deps.send({
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
            return true;
          }
          if (folderInfo.path) {
            const folderCheck = await ensureFolderPathWritable(
              ghToken,
              owner,
              repo,
              baseBranch,
              folderInfo.path
            );
            if (!folderCheck.ok) {
              deps.send({
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
              return true;
            }
          }
          if (createPr && !prBaseBranch) {
            deps.send({
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
            return true;
          }
          if (createPr && prBaseBranch === baseBranch) {
            deps.send({
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
            return true;
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
            styleDictionary: msg.payload.styleDictionary,
            flatTokens: msg.payload.flatTokens,
            createPr,
            prBase: createPr ? prBaseBranch : void 0,
            prTitle: createPr ? prTitle : void 0,
            prBody: createPr ? prBody : void 0
          };
          if (selectionCollection)
            selectionState.collection = selectionCollection;
          if (selectionMode) selectionState.mode = selectionMode;
          await mergeSelected(selectionState);
          await deps.broadcastLocalCollections({ force: true });
          try {
            const files = [];
            if (scope === "all") {
              const all = await deps.exportDtcg({
                format: "single",
                styleDictionary,
                flatTokens
              });
              for (const f of all.files)
                files.push({ name: f.name, json: f.json });
            } else if (scope === "typography") {
              const typo = await deps.exportDtcg({
                format: "typography"
              });
              for (const f of typo.files)
                files.push({ name: f.name, json: f.json });
            } else {
              if (!selectionCollection || !selectionMode) {
                deps.send({
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
                return true;
              }
              const per = await deps.exportDtcg({
                format: "perMode",
                styleDictionary,
                flatTokens
              });
              const picked = pickPerModeFile(
                per.files,
                selectionCollection,
                selectionMode
              );
              if (!picked) {
                const available = per.files.map((f) => f.name).join(", ");
                deps.send({
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
                return true;
              }
              files.push({ name: picked.name, json: picked.json });
            }
            if (files.length > 1) {
              deps.send({
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
              return true;
            }
            const isPlainEmptyObject = (v) => v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0;
            let exportLooksEmpty = files.length === 0 || files.every((f) => isPlainEmptyObject(f.json));
            if (exportLooksEmpty) {
              if (scope === "typography") {
                const warningMessage = "GitHub export warning: typography.json is empty (no local text styles). Nothing to commit.";
                deps.send({
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
                return true;
              }
              if (exportLooksEmpty && scope === "selected") {
                const diag = await deps.analyzeSelectionState(
                  selectionCollection,
                  selectionMode
                );
                const tail = diag.ok ? `Found ${diag.variableCount} variable(s) in "${selectionCollection}", but ${(_b = diag.variablesWithValues) != null ? _b : 0} with a value in "${selectionMode}".` : diag.message || "No values present.";
                deps.send({
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
                return true;
              }
              if (exportLooksEmpty) {
                deps.send({
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
                return true;
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
                    canonical[key] = canonicalizeJson(
                      record[key]
                    );
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
                  if (Object.prototype.hasOwnProperty.call(
                    value,
                    "$type"
                  )) {
                    const t = value["$type"];
                    if (typeof t === "string" && t.toLowerCase() === "typography") {
                      return true;
                    }
                  }
                  for (const key in value) {
                    if (Object.prototype.hasOwnProperty.call(
                      value,
                      key
                    ) && hasTypography(
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
                return JSON.stringify(
                  canonicalizeJson(existingJson)
                ) === JSON.stringify(canonicalizeJson(nextJson));
              }
              return false;
            };
            let allFilesIdentical = commitFiles.length > 0;
            for (const file of commitFiles) {
              const current = await ghGetFileContents(
                ghToken,
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
              deps.send({
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
              return true;
            }
            const attemptCommit = async () => ghCommitFiles(
              ghToken,
              owner,
              repo,
              baseBranch,
              commitMessage,
              commitFiles
            );
            let commitRes = await attemptCommit();
            let fastForwardRetry = false;
            if (!commitRes.ok && commitRes.status === 422 && typeof commitRes.message === "string" && /not a fast forward/i.test(commitRes.message)) {
              await sleep(200);
              commitRes = await attemptCommit();
              fastForwardRetry = true;
            }
            if (!commitRes.ok) {
              const looksLikeFastForwardRace = commitRes.status === 422 && typeof commitRes.message === "string" && /not a fast forward/i.test(commitRes.message);
              if (looksLikeFastForwardRace && sameTargetAsLastCommit) {
                const noChangeMessage = scope === "selected" ? `No token values changed for "${selectionCollection}" / "${selectionMode}"; repository already matches the current export.` : "No token values changed; repository already matches the current export.";
                deps.send({
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
                return true;
              }
              deps.send({
                type: "GITHUB_COMMIT_RESULT",
                payload: __spreadProps(__spreadValues({}, commitRes), {
                  folder: folderStorageValue,
                  filename: filenameToCommit,
                  fullPath: fullPathForCommit
                })
              });
              deps.send({
                type: "ERROR",
                payload: {
                  message: `GitHub: Commit failed (${commitRes.status}): ${commitRes.message}${fastForwardRetry ? " (after retry)" : ""}`
                }
              });
              return true;
            }
            await setLastCommitSignature({
              branch: baseBranch,
              fullPath: fullPathForCommit,
              scope
            });
            let prResult;
            if (createPr) {
              prResult = await ghCreatePullRequest(
                ghToken,
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
            deps.send({
              type: "GITHUB_COMMIT_RESULT",
              payload: commitOkPayload
            });
            deps.send({
              type: "INFO",
              payload: {
                message: `Committed ${commitFiles.length} file(s) to ${owner}/${repo}@${baseBranch}`
              }
            });
            if (createPr) {
              if (prResult && prResult.ok) {
                deps.send({
                  type: "GITHUB_PR_RESULT",
                  payload: prResult
                });
                deps.send({
                  type: "INFO",
                  payload: {
                    message: `PR created: ${prResult.url}`
                  }
                });
              } else if (prResult) {
                deps.send({
                  type: "GITHUB_PR_RESULT",
                  payload: prResult
                });
                deps.send({
                  type: "ERROR",
                  payload: {
                    message: `GitHub: PR creation failed (${prResult.status}): ${prResult.message}`
                  }
                });
              }
            }
          } catch (e) {
            const msgText = (e == null ? void 0 : e.message) || "unknown error";
            deps.send({
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
          return true;
        }
        default:
          return false;
      }
    }
    async function onUiReady() {
      await restoreGithubTokenAndVerify();
      const sel = await getSelected();
      if (sel.owner && sel.repo) {
        deps.send({ type: "GITHUB_RESTORE_SELECTED", payload: sel });
      }
    }
    return { handle, onUiReady };
  }

  // src/app/main.ts
  (async function initUI() {
    let w = 960, h = 540;
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
    figma.showUI('<!doctype html>\n<html>\n\n<head>\n  <meta charset="utf-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1" />\n  <title>DTCG Import/Export</title>\n  <style>/* src/app/ui.css */\n:root {\n  --bg: #040511;\n  --bg-gradient:\n    radial-gradient(\n      120% 140% at 20% 15%,\n      #1d2144 0%,\n      #080919 55%,\n      #020205 100%);\n  --surface: rgba(16, 20, 39, 0.9);\n  --surface-elevated: rgba(24, 29, 58, 0.95);\n  --surface-muted: rgba(255, 255, 255, 0.03);\n  --ink: #ffffff;\n  --ink-subtle: #f3f5ff;\n  --ink-muted: #dfe4ff;\n  --accent: #fe8ac9;\n  --accent-secondary: #9c8aff;\n  --accent-ink: #160919;\n  --border: rgba(255, 255, 255, 0.14);\n  --border-strong: rgba(255, 255, 255, 0.24);\n  --glow-pink: 0 0 18px rgba(254, 138, 201, 0.35);\n  --glow-indigo: 0 0 18px rgba(156, 138, 255, 0.3);\n  --log-surface: rgba(5, 6, 16, 0.92);\n  --drawer-h: 260px;\n  --drawer-collapsed-h: 2rem;\n}\n[data-theme=light] {\n  --bg: #f5f5f7;\n  --bg-gradient:\n    radial-gradient(\n      120% 140% at 20% 15%,\n      #ffffff 0%,\n      #f0f2f5 55%,\n      #e1e4e8 100%);\n  --surface: rgba(255, 255, 255, 0.85);\n  --surface-elevated: rgba(255, 255, 255, 0.95);\n  --surface-muted: rgba(0, 0, 0, 0.03);\n  --ink: #1a1a1a;\n  --ink-subtle: #4a4a4a;\n  --ink-muted: #6a6a6a;\n  --accent: #d02c85;\n  --accent-secondary: #6344e8;\n  --accent-ink: #ffffff;\n  --border: rgba(0, 0, 0, 0.1);\n  --border-strong: rgba(0, 0, 0, 0.2);\n  --glow-pink: 0 2px 8px rgba(208, 44, 133, 0.25);\n  --glow-indigo: 0 2px 8px rgba(99, 68, 232, 0.2);\n  --log-surface: rgba(255, 255, 255, 0.9);\n}\nhtml,\nbody {\n  height: 100%;\n  margin: 0;\n}\nbody {\n  background: var(--bg-gradient);\n  background-color: var(--bg);\n  color: var(--ink);\n  font-family:\n    "Inter",\n    "SF Pro Display",\n    ui-sans-serif,\n    system-ui,\n    -apple-system,\n    Segoe UI,\n    Roboto,\n    Arial,\n    sans-serif;\n  line-height: 1.4;\n  -webkit-font-smoothing: antialiased;\n}\n.shell {\n  height: 100vh;\n  width: 100%;\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 1fr);\n  grid-template-rows: 1fr var(--drawer-h);\n  gap: 16px;\n  padding: 18px;\n  box-sizing: border-box;\n  grid-auto-flow: row;\n  backdrop-filter: blur(22px);\n  background: rgba(3, 4, 12, 0.35);\n}\n.shell.drawer-collapsed {\n  grid-template-rows: 1fr var(--drawer-collapsed-h);\n}\n.shell.drawer-collapsed .drawer .drawer-body {\n  display: none;\n}\n.drawer-toggle {\n  padding: 6px 12px;\n  border: 1px solid var(--border);\n  border-radius: 999px;\n  background: var(--surface);\n  color: var(--ink);\n  font-size: 12px;\n  cursor: pointer;\n  transition: background 180ms ease, box-shadow 180ms ease;\n  box-shadow: var(--glow-indigo);\n}\n.drawer-toggle:hover {\n  background: rgba(255, 255, 255, 0.06);\n}\n.col {\n  display: flex;\n  flex-direction: column;\n  min-width: 0;\n  min-height: 0;\n}\n.panel {\n  display: flex;\n  flex-direction: column;\n  min-width: 0;\n  min-height: 0;\n  flex: 1;\n  border: 1px solid var(--border);\n  background: var(--surface);\n  border-radius: 18px;\n  padding: .75rem;\n  overflow: hidden;\n  box-shadow: 0 30px 60px rgba(2, 2, 8, 0.55), var(--glow-indigo);\n}\n.panel-header {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  padding: 10px 14px 8px 14px;\n  border-bottom: 1px solid var(--border);\n}\n.eyebrow {\n  font-size: 11px;\n  letter-spacing: .18em;\n  text-transform: uppercase;\n  color: var(--ink-muted);\n  margin: 0 0 2px 0;\n}\n.title {\n  font-size: 18px;\n  font-weight: 700;\n  margin: 0;\n  display: inline-flex;\n  align-items: center;\n  gap: 10px;\n  background:\n    linear-gradient(\n      120deg,\n      var(--accent),\n      var(--accent-secondary));\n  -webkit-background-clip: text;\n  background-clip: text;\n  color: transparent;\n}\n.title::before {\n  content: "";\n  width: 10px;\n  height: 10px;\n  border-radius: 50%;\n  background:\n    linear-gradient(\n      120deg,\n      var(--accent),\n      var(--accent-secondary));\n  box-shadow: 0 0 12px rgba(254, 138, 201, 0.7);\n  flex-shrink: 0;\n}\n.panel-body {\n  padding: .5rem;\n  display: flex;\n  flex-direction: column;\n  gap: 14px;\n  min-width: 0;\n  min-height: 0;\n  flex: 1;\n  overflow: auto;\n  max-height: 100%;\n}\n.row {\n  display: flex;\n  gap: 12px;\n  align-items: center;\n}\n.row > * {\n  flex: 1;\n  min-width: 0;\n}\nlabel {\n  font-size: 12px;\n  color: var(--ink-subtle);\n  display: block;\n  margin-bottom: 4px;\n  letter-spacing: .04em;\n}\nlabel:has(input[type=checkbox]),\nlabel:has(input[type=radio]) {\n  display: flex;\n  align-items: center;\n  gap: .35rem;\n}\ninput[type=text],\ninput[type=password],\nselect,\ninput[type=file],\ntextarea {\n  width: 100%;\n  padding: 10px 12px;\n  border: 1px solid var(--border);\n  border-radius: 12px;\n  background: rgba(255, 255, 255, 0.04);\n  color: var(--ink);\n  font-size: 13px;\n  box-sizing: border-box;\n  transition: border-color 150ms ease, box-shadow 150ms ease;\n  backdrop-filter: blur(6px);\n}\ninput[type=file] {\n  padding: 10px;\n  color: var(--ink-muted);\n}\ninput[type=file]::-webkit-file-upload-button,\ninput[type=file]::file-selector-button {\n  padding: 8px 14px;\n  border: none;\n  border-radius: 999px;\n  font-size: 12px;\n  font-weight: 600;\n  color: var(--accent-ink);\n  background:\n    linear-gradient(\n      125deg,\n      var(--accent),\n      var(--accent-secondary));\n  cursor: pointer;\n  margin-right: 12px;\n  transition: transform 150ms ease, box-shadow 150ms ease;\n  box-shadow: var(--glow-pink);\n}\ninput[type=file]::-webkit-file-upload-button:hover,\ninput[type=file]::file-selector-button:hover {\n  transform: translateY(-1px);\n  box-shadow: 0 14px 30px rgba(254, 138, 201, 0.35);\n}\ninput[type=checkbox],\ninput[type=radio] {\n  -webkit-appearance: none;\n  appearance: none;\n  width: 16px;\n  height: 16px;\n  border-radius: 4px;\n  border: 2px solid var(--accent-secondary);\n  background: var(--log-surface);\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  cursor: pointer;\n  transition:\n    border-color 140ms ease,\n    box-shadow 140ms ease,\n    background 140ms ease;\n  position: relative;\n  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.45);\n}\ninput[type=radio] {\n  border-radius: 50%;\n}\ninput[type=checkbox]::after,\ninput[type=radio]::after {\n  content: "";\n  position: absolute;\n  top: 50%;\n  left: 50%;\n  transition: transform 140ms ease;\n  transform: translate(-50%, -50%) scale(0);\n}\ninput[type=checkbox]::after {\n  width: 6px;\n  height: 10px;\n  border-right: 2px solid #000;\n  border-bottom: 2px solid #000;\n  transform-origin: center;\n  transform: translate(-50%, -60%) rotate(45deg) scale(0);\n}\ninput[type=radio]::after {\n  width: 8px;\n  height: 8px;\n  border-radius: 50%;\n  background: #000;\n  transform-origin: center;\n}\ninput[type=checkbox]:checked,\ninput[type=radio]:checked {\n  border-color: transparent;\n  background:\n    linear-gradient(\n      125deg,\n      var(--accent),\n      var(--accent-secondary));\n  box-shadow: var(--glow-pink);\n}\ninput[type=radio]:checked {\n  border: 2px solid var(--accent-secondary);\n  background: var(--log-surface);\n  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.45);\n}\ninput[type=checkbox]:checked::after {\n  transform: translate(-50%, -60%) rotate(45deg) scale(1);\n}\n[data-theme=light] input[type=checkbox]::after {\n  border-color: #fff;\n}\ninput[type=radio]:checked::after {\n  background:\n    linear-gradient(\n      125deg,\n      var(--accent),\n      var(--accent-secondary));\n  transform: translate(-50%, -50%) scale(1);\n}\ninput[type=checkbox]:focus-visible,\ninput[type=radio]:focus-visible {\n  outline: 2px solid rgba(255, 255, 255, 0.4);\n  outline-offset: 2px;\n}\ninput[type=text]::placeholder,\ninput[type=password]::placeholder,\ntextarea::placeholder {\n  color: var(--ink-muted);\n}\ninput[type=text]:focus,\ninput[type=password]:focus,\nselect:focus,\ninput[type=file]:focus,\ntextarea:focus {\n  outline: none;\n  border-color: var(--accent);\n  box-shadow: 0 0 0 1px rgba(254, 138, 201, 0.4);\n}\nselect {\n  background-color: rgba(255, 255, 255, 0.04);\n  color: var(--ink);\n}\n.gh-folder-display {\n  width: 100%;\n  padding: 10px 12px;\n  border: 1px dashed var(--border);\n  border-radius: 12px;\n  background: rgba(255, 255, 255, 0.04);\n  color: var(--ink);\n  font-size: 12px;\n  min-height: 40px;\n  display: flex;\n  align-items: center;\n  box-sizing: border-box;\n}\n.gh-folder-display.is-placeholder {\n  color: var(--ink-muted);\n  font-style: italic;\n}\n.gh-input-error {\n  color: #b91c1c;\n  font-size: 11px;\n  margin-top: 4px;\n}\nbutton {\n  padding: 11px 18px;\n  border: none;\n  border-radius: 999px;\n  color: var(--accent-ink);\n  font-weight: 600;\n  cursor: pointer;\n  font-size: 14px;\n  background:\n    linear-gradient(\n      125deg,\n      var(--accent),\n      var(--accent-secondary));\n  box-shadow: var(--glow-pink);\n  transition: transform 150ms ease, box-shadow 150ms ease;\n}\nbutton:hover:not([disabled]) {\n  transform: translateY(-1px);\n  box-shadow: 0 14px 30px rgba(254, 138, 201, 0.35);\n}\nbutton[disabled] {\n  opacity: .4;\n  cursor: not-allowed;\n  box-shadow: none;\n}\n.css-button-neumorphic {\n  min-width: 130px;\n  height: 44px;\n  padding: 0 20px;\n  font-weight: 500;\n  border: 1px solid rgba(255, 255, 255, 0.18);\n  background:\n    linear-gradient(\n      160deg,\n      rgba(255, 255, 255, 0.08),\n      rgba(8, 9, 18, 0.9));\n  color: var(--ink);\n  border-radius: 999px;\n  box-shadow:\n    inset 0 1px 3px rgba(255, 255, 255, 0.15),\n    inset 0 -4px 8px rgba(3, 4, 12, 0.9),\n    var(--glow-indigo);\n}\n.css-button-neumorphic:active {\n  box-shadow: inset 0 0 6px rgba(0, 0, 0, 0.6), inset 0 6px 12px rgba(255, 255, 255, 0.05);\n}\n[data-theme=light] #importBtn,\n[data-theme=light] #exportBtn,\n[data-theme=light] #exportTypographyBtn,\n[data-theme=light] #ghConnectBtn,\n[data-theme=light] #ghLogoutBtn,\n[data-theme=light] #ghBranchRefreshBtn,\n[data-theme=light] #ghNewBranchBtn,\n[data-theme=light] #ghCreateBranchConfirmBtn,\n[data-theme=light] #ghPickFolderBtn,\n[data-theme=light] #ghExportAndCommitBtn,\n[data-theme=light] #ghFetchTokensBtn {\n  background:\n    linear-gradient(\n      125deg,\n      var(--accent),\n      var(--accent-secondary));\n  box-shadow: var(--glow-pink);\n  color: var(--accent-ink);\n  border: none;\n}\n[data-theme=light] #importBtn:hover:not([disabled]),\n[data-theme=light] #exportBtn:hover:not([disabled]),\n[data-theme=light] #exportTypographyBtn:hover:not([disabled]),\n[data-theme=light] #ghConnectBtn:hover:not([disabled]),\n[data-theme=light] #ghLogoutBtn:hover:not([disabled]),\n[data-theme=light] #ghBranchRefreshBtn:hover:not([disabled]),\n[data-theme=light] #ghNewBranchBtn:hover:not([disabled]),\n[data-theme=light] #ghCreateBranchConfirmBtn:hover:not([disabled]),\n[data-theme=light] #ghPickFolderBtn:hover:not([disabled]),\n[data-theme=light] #ghExportAndCommitBtn:hover:not([disabled]),\n[data-theme=light] #ghFetchTokensBtn:hover:not([disabled]) {\n  transform: translateY(-1px);\n  box-shadow: 0 14px 30px rgba(254, 138, 201, 0.35);\n}\n.muted {\n  color: var(--ink-muted);\n  font-size: 12px;\n}\n.gh-import-status {\n  font-size: 12px;\n  margin-top: 6px;\n  color: var(--ink-muted);\n}\n.gh-import-status--ready {\n  color: var(--ink-subtle);\n}\n.gh-import-status--progress {\n  color: var(--accent);\n}\n.gh-import-status--success {\n  color: #047857;\n}\n.gh-import-status--error {\n  color: #b91c1c;\n}\n.import-scope-summary {\n  border: 1px solid var(--border);\n  border-radius: 14px;\n  background: rgba(255, 255, 255, 0.03);\n  padding: .75rem;\n  display: flex;\n  flex-direction: column;\n  gap: .35rem;\n  box-shadow: inset 0 0 30px rgba(255, 255, 255, 0.02);\n}\n.import-skip-log {\n  margin-top: 1rem;\n  display: flex;\n  flex-direction: column;\n  gap: .5rem;\n  flex: 1;\n  min-height: 0;\n}\n.import-skip-log-list {\n  display: flex;\n  flex-direction: column;\n  gap: .5rem;\n  flex: 1;\n  min-height: 0;\n  overflow: auto;\n}\n.import-skip-log-entry {\n  border: 1px solid var(--border);\n  border-radius: 14px;\n  background: rgba(255, 255, 255, 0.02);\n  padding: .75rem;\n  font-size: 12px;\n  display: flex;\n  flex-direction: column;\n  gap: .35rem;\n  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.02);\n}\n.import-skip-log-entry-header {\n  font-weight: 600;\n  font-size: 12px;\n  letter-spacing: .05em;\n  text-transform: uppercase;\n  color: var(--ink-muted);\n}\n.import-skip-log-entry-note {\n  color: var(--ink-muted);\n  font-size: 11px;\n}\n.import-skip-log-token-list {\n  margin: 0;\n  padding-left: 1.1rem;\n}\n.import-skip-log-token-list li {\n  margin-bottom: .2rem;\n}\nbutton.link-button {\n  background: none;\n  border: none;\n  padding: 0;\n  color: var(--accent);\n  font-size: 12px;\n  cursor: pointer;\n  text-decoration: underline;\n}\nbutton.link-button:disabled {\n  opacity: .5;\n  cursor: not-allowed;\n  text-decoration: none;\n}\npre {\n  margin: 0;\n  padding: .75rem;\n  background: var(--log-surface);\n  color: var(--ink);\n  border: 1px solid var(--border);\n  border-radius: 16px;\n  font-family:\n    "SFMono-Regular",\n    Menlo,\n    Consolas,\n    "Cascadia Code",\n    "Source Code Pro",\n    "JetBrains Mono",\n    ui-monospace,\n    monospace;\n  font-size: 11px;\n  white-space: pre-wrap;\n  overflow-wrap: anywhere;\n  word-break: break-word;\n  overflow: auto;\n  min-width: 0;\n  min-height: 0;\n  flex: 1;\n  height: 100%;\n  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);\n}\n#log {\n  background: var(--log-surface);\n  color: var(--ink);\n  font-family:\n    ui-monospace,\n    SFMono-Regular,\n    Menlo,\n    Consolas,\n    "Liberation Mono",\n    monospace;\n  font-size: 12px;\n  line-height: 1.5;\n  padding: 16px;\n  border-radius: 16px;\n  border: 1px solid var(--border);\n  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05), 0 10px 25px rgba(0, 0, 0, 0.55);\n  overflow-y: auto;\n  min-height: 140px;\n  max-height: 100%;\n}\n#log a {\n  color: var(--accent);\n  font-weight: 600;\n  text-decoration-color: rgba(254, 138, 201, 0.6);\n  text-underline-offset: 3px;\n}\n#log a:hover,\n#log a:focus-visible {\n  color: var(--ink);\n  text-decoration-color: rgba(255, 255, 255, 0.9);\n  outline: 2px solid rgba(254, 138, 201, 0.4);\n  outline-offset: 2px;\n}\n#log > div {\n  padding: 2px 0;\n  white-space: pre-wrap;\n}\n.stack {\n  display: flex;\n  flex-direction: column;\n  gap: 10px;\n  flex: 1;\n  min-height: 0;\n}\n.row-center {\n  display: flex;\n  gap: 8px;\n  align-items: center;\n  justify-content: space-between;\n}\n.drawer {\n  grid-column: 1 / -1;\n  grid-row: 2;\n  display: flex;\n  flex-direction: column;\n  min-height: 0;\n  min-width: 0;\n  border: 1px solid var(--border);\n  background: var(--surface-elevated);\n  border-radius: 22px;\n  padding: .75rem;\n  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.55);\n}\n.drawer .panel-header {\n  border-bottom: 1px solid var(--border);\n}\n.drawer-body {\n  padding: .5rem;\n  min-height: 0;\n  min-width: 0;\n  flex: 1;\n  display: flex;\n  flex-direction: column;\n}\n#log {\n  display: block;\n  padding: 16px;\n  background: var(--log-surface);\n  color: var(--ink);\n  border: 1px solid var(--border);\n  border-radius: 16px;\n  font-family:\n    ui-monospace,\n    SFMono-Regular,\n    Menlo,\n    Consolas,\n    "Liberation Mono",\n    monospace;\n  font-size: 12px;\n  white-space: pre-wrap;\n  overflow-y: auto;\n  min-width: 0;\n  min-height: 0;\n  flex: 1;\n  height: 100%;\n  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05), 0 12px 30px rgba(0, 0, 0, 0.6);\n}\n.resize-handle {\n  position: fixed;\n  right: 6px;\n  bottom: 6px;\n  width: 14px;\n  height: 14px;\n  border-radius: 3px;\n  cursor: nwse-resize;\n  display: grid;\n  place-items: center;\n  z-index: 2147483647;\n  touch-action: none;\n  user-select: none;\n}\n.resize-handle::after {\n  content: "";\n  width: 8px;\n  height: 8px;\n  border-right: 2px solid rgba(255, 255, 255, 0.4);\n  border-bottom: 2px solid rgba(255, 255, 255, 0.4);\n  transform: translate(1px, 1px);\n  pointer-events: none;\n}\n#exportBtn {\n  margin-top: .5rem;\n  width: 100%;\n}\n.shell.drawer-collapsed .drawer {\n  padding: 0;\n  background: transparent;\n  border: 0;\n}\n.shell.drawer-collapsed .drawer .panel-header {\n  padding: 6px 10px;\n  border: 1px solid var(--border);\n  border-radius: 14px;\n  background: var(--surface);\n  border-bottom: 1px solid var(--border);\n}\n.shell.drawer-collapsed .drawer .title {\n  display: none;\n}\n.shell.drawer-collapsed .drawer .eyebrow {\n  margin: 0;\n}\n.panel-header .actions {\n  display: flex;\n  gap: 8px;\n  align-items: center;\n}\n.panel-header button {\n  font-size: 11px;\n  padding: 6px 12px;\n  border: 1px solid var(--border);\n  background: rgba(255, 255, 255, 0.08);\n  color: var(--ink);\n  border-radius: 999px;\n  cursor: pointer;\n  transition: background 140ms ease;\n}\n.panel-header button:hover {\n  background: rgba(255, 255, 255, 0.18);\n}\n.tabs {\n  display: flex;\n  gap: .25rem;\n  align-items: center;\n}\n.tab-btn {\n  font-size: 1rem;\n  padding: .45rem 1rem;\n  border: 1px solid var(--border);\n  background: rgba(255, 255, 255, 0.06);\n  color: var(--ink);\n  border-radius: 999px;\n  cursor: pointer;\n  transition:\n    background 150ms ease,\n    color 150ms ease,\n    border-color 150ms ease;\n}\n.tab-btn:hover {\n  color: var(--ink);\n  background: rgba(255, 255, 255, 0.12);\n}\n.tab-btn.is-active:hover {\n  background:\n    linear-gradient(\n      120deg,\n      var(--accent),\n      var(--accent-secondary));\n  color: var(--accent-ink);\n  cursor: default;\n}\n.tab-btn.is-active {\n  background:\n    linear-gradient(\n      120deg,\n      var(--accent),\n      var(--accent-secondary));\n  color: var(--accent-ink);\n  border-color: transparent;\n  box-shadow: var(--glow-pink);\n}\n.modal-overlay {\n  position: fixed;\n  inset: 0;\n  display: none;\n  align-items: center;\n  justify-content: center;\n  background: rgba(2, 3, 8, 0.75);\n  backdrop-filter: blur(10px);\n  padding: 1.5rem;\n  z-index: 99999;\n}\n.modal-overlay.is-open {\n  display: flex;\n}\n.folder-picker-modal {\n  width: min(560px, 92vw);\n  max-height: 80vh;\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n  background: rgba(7, 9, 22, 0.95);\n  border: 1px solid var(--border);\n  border-radius: 18px;\n  box-shadow: 0 40px 80px rgba(0, 0, 0, .6);\n  padding: 16px;\n}\n.import-scope-modal {\n  width: min(420px, 92vw);\n}\n.import-scope-body {\n  max-height: 240px;\n  overflow: auto;\n  display: flex;\n  flex-direction: column;\n  gap: .5rem;\n}\n.import-scope-group {\n  border: 1px solid var(--border);\n  border-radius: 14px;\n  background: rgba(255, 255, 255, 0.03);\n  padding: .75rem;\n  display: flex;\n  flex-direction: column;\n  gap: .35rem;\n}\n.import-scope-group h3 {\n  margin: 0 0 .25rem 0;\n  font-size: 13px;\n}\n.import-scope-mode {\n  display: flex;\n  align-items: center;\n  gap: .5rem;\n  font-size: 12px;\n}\n.import-scope-footer {\n  display: flex;\n  gap: .5rem;\n  justify-content: flex-end;\n}\n.import-scope-remember {\n  display: flex;\n  flex-direction: column;\n  gap: .25rem;\n  font-size: 12px;\n}\n.import-scope-remember label {\n  display: flex;\n  align-items: center;\n  gap: .35rem;\n}\n.import-scope-missing {\n  font-size: 11px;\n  color: var(--ink-muted);\n  margin: 0;\n}\n.folder-picker-header {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n}\n.folder-picker-title {\n  font-size: 14px;\n  font-weight: 600;\n  color: var(--ink);\n}\n.folder-picker-path-row {\n  display: flex;\n  gap: 8px;\n  align-items: center;\n}\n.folder-picker-path-row input {\n  flex: 1;\n}\n.folder-picker-list {\n  border: 1px solid var(--border);\n  border-radius: 14px;\n  background: rgba(255, 255, 255, 0.02);\n  min-height: 160px;\n  max-height: 50vh;\n  overflow: auto;\n  padding: 6px;\n  display: flex;\n  flex-direction: column;\n  gap: 4px;\n}\n.folder-picker-row {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  padding: 6px 8px;\n  border: 0;\n  border-radius: 6px;\n  background: transparent;\n  font-size: 12px;\n  color: inherit;\n  cursor: pointer;\n  text-align: left;\n}\n.folder-picker-row:not([disabled]):hover {\n  background: rgba(255, 255, 255, 0.08);\n}\n.folder-picker-row.is-muted {\n  color: var(--ink-muted);\n  cursor: default;\n}\n.folder-picker-row.is-muted:hover {\n  background: transparent;\n}\n.folder-picker-row[disabled] {\n  cursor: default;\n}\n.folder-picker-actions {\n  display: flex;\n  justify-content: space-between;\n  align-items: center;\n  gap: 8px;\n}\n.tab-panel {\n  display: none;\n  flex-direction: column;\n  gap: 12px;\n  min-width: 0;\n  min-height: 0;\n  flex: 1;\n}\n.tab-panel.is-active {\n  display: flex;\n}\n.tab-panel--scroll {\n  flex: 1 1 auto;\n  min-height: 0;\n  overflow: auto;\n}\n.github-panel {\n  gap: 12px;\n}\n#panel-github button {\n  font-size: 12px;\n  padding: 6px 10px;\n  border-width: 1px;\n}\n#panel-github .css-button-neumorphic {\n  min-width: 0;\n  height: auto;\n  padding: 6px 10px;\n}\n.gh-section {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  flex: 0 0 auto;\n  min-height: auto;\n}\n.gh-auth-actions {\n  display: flex;\n  gap: 8px;\n  flex-wrap: wrap;\n}\n.gh-auth-actions button {\n  min-width: 0;\n}\n.gh-auth-status,\n.gh-auth-meta {\n  font-size: 12px;\n}\n.gh-remember {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  flex-wrap: wrap;\n}\n.gh-remember-toggle {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n}\n.gh-repo-combo {\n  position: relative;\n  display: flex;\n  align-items: center;\n}\n.gh-repo-combo select {\n  appearance: none;\n  -webkit-appearance: none;\n  -moz-appearance: none;\n  padding-right: 28px;\n  border-radius: 12px;\n  background-color: rgba(255, 255, 255, 0.04);\n  cursor: pointer;\n}\n.gh-repo-combo select:disabled {\n  cursor: not-allowed;\n  color: var(--ink-muted);\n  background: rgba(255, 255, 255, 0.02);\n}\n.gh-repo-combo::after {\n  content: "\\25be";\n  position: absolute;\n  right: 10px;\n  pointer-events: none;\n  color: var(--ink-muted);\n  font-size: 20px;\n}\n.gh-repo-combo:focus-within select:not(:disabled) {\n  border-color: var(--accent);\n}\n.gh-branch-search {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  flex-wrap: wrap;\n}\n.gh-branch-combo {\n  position: relative;\n  flex: 1 1 auto;\n  min-width: 0;\n  display: flex;\n  align-items: stretch;\n}\n.gh-branch-combo input {\n  flex: 1 1 auto;\n  min-width: 0;\n  border-top-right-radius: 0;\n  border-bottom-right-radius: 0;\n}\n.gh-branch-toggle {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  padding: 0 10px;\n  border: 1px solid var(--border);\n  border-left: none;\n  border-top-left-radius: 0;\n  border-bottom-left-radius: 0;\n  border-top-right-radius: 12px;\n  border-bottom-right-radius: 12px;\n  background: rgba(255, 255, 255, 0.06);\n  color: var(--ink);\n  font-size: 12px;\n  cursor: pointer;\n}\n.gh-branch-toggle:hover:not([disabled]) {\n  background: rgba(255, 255, 255, 0.12);\n}\n.gh-branch-toggle[disabled] {\n  cursor: not-allowed;\n  opacity: .5;\n}\n.gh-branch-menu {\n  position: absolute;\n  top: calc(100% + 4px);\n  left: 0;\n  right: 0;\n  max-height: 216px;\n  margin: 0;\n  padding: 4px 0;\n  list-style: none;\n  border: 1px solid var(--border);\n  border-radius: 14px;\n  background: rgba(4, 5, 16, 0.95);\n  box-shadow: 0 25px 45px rgba(0, 0, 0, 0.55);\n  overflow-y: auto;\n  z-index: 20;\n}\n.gh-branch-menu[hidden] {\n  display: none;\n}\n.gh-branch-item {\n  padding: 6px 10px;\n  font-size: 12px;\n  cursor: pointer;\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  color: var(--ink);\n}\n.gh-branch-item[data-active="1"],\n.gh-branch-item:hover {\n  background: rgba(255, 255, 255, 0.08);\n}\n.gh-branch-item[aria-disabled=true] {\n  cursor: default;\n  color: var(--ink-muted);\n  background: transparent;\n}\n.gh-branch-item-action {\n  font-weight: 600;\n}\n.gh-branch-item-empty {\n  cursor: default;\n  color: var(--ink-muted);\n}\n.gh-branch-menu::after {\n  content: "";\n  position: absolute;\n  inset: 0;\n  border-radius: 14px;\n  pointer-events: none;\n}\n.gh-branch-combo:focus-within .gh-branch-toggle:not([disabled]) {\n  border-color: var(--accent);\n}\n.gh-branch-combo:focus-within input:not(:disabled) {\n  border-color: var(--accent);\n}\n.gh-branch-count {\n  white-space: nowrap;\n  font-size: 12px;\n}\n.gh-branch-actions {\n  display: flex;\n  gap: 8px;\n  flex-wrap: wrap;\n  align-self: flex-start;\n}\n.gh-branch-actions button {\n  flex: 0 0 auto;\n}\n.gh-branch-refresh,\n.gh-new-branch-btn,\n#ghPickFolderBtn {\n  align-self: flex-start;\n}\n.gh-new-branch-row {\n  display: flex;\n  gap: 8px;\n  flex-wrap: wrap;\n}\n.gh-new-branch-row input {\n  flex: 1 1 auto;\n  min-width: 0;\n}\n#ghTokenInput.gh-mask {\n  -webkit-text-security: disc;\n}\n/*# sourceMappingURL=ui.css.map */\n</style>\n</head>\n\n<body>\n  <div class="shell">\n    <!-- Left: Actions -->\n    <div class="col">\n      <div class="panel">\n        <div class="panel-header">\n          <div>\n            <div class="eyebrow">Actions</div>\n            <h2 class="title">Import, Export &amp; GitHub</h2>\n          </div>\n          <div class="tabs" role="tablist" aria-label="Actions tabs">\n            <button class="tab-btn is-active" data-tab="import" role="tab" aria-selected="true"\n              aria-controls="panel-import">Import</button>\n            <button class="tab-btn" data-tab="export" role="tab" aria-selected="false"\n              aria-controls="panel-export">Export</button>\n            <button class="tab-btn" data-tab="github" role="tab" aria-selected="false"\n              aria-controls="panel-github">GitHub</button>\n          </div>\n        </div>\n\n        <div class="panel-body">\n          <!-- Import tab -->\n          <div class="tab-panel is-active" id="panel-import" data-tab="import" role="tabpanel"\n            aria-labelledby="tab-import">\n            <div class="stack">\n              <div class="eyebrow">Import DTCG</div>\n              <div>\n                <label>Choose a DTCG JSON file</label>\n                <div class="muted" style="padding: .5rem 0">Imports collections/modes as defined in the file.</div>\n                <input id="file" type="file" accept=".json,application/json" />\n              </div>\n              <div class="row">\n                <button id="importBtn" class="css-button-neumorphic">Import</button>\n              </div>\n              <div class="row">\n                <div style="display: flex; gap: .25rem;">\n                  <input id="allowHexChk" type="checkbox" />\n                  <label for="allowHexChk" class="muted" style="padding-top: .35rem;">Accept hex strings as\n                    colors</label>\n                </div>\n              </div>\n              <!-- <div id="importScopeSummary" class="import-scope-summary" hidden>\n                <div id="importScopeSummaryText" class="muted"></div>\n                <button id="importScopeClearBtn" class="link-button" type="button">Clear remembered selection</button>\n              </div> -->\n              <div class="import-skip-log">\n                <div class="eyebrow">Import summaries</div>\n                <div id="importSkipLogEmpty" class="muted">No partial import history yet.</div>\n                <div id="importSkipLogList" class="import-skip-log-list"></div>\n              </div>\n            </div>\n          </div>\n\n          <!-- Export tab -->\n          <div class="tab-panel" id="panel-export" data-tab="export" role="tabpanel" aria-labelledby="tab-export">\n            <div class="stack" style="border-top:1px solid var(--border);padding-top:12px;">\n              <div class="eyebrow">Export DTCG</div>\n              <div class="row-center"></div>\n              <div class="stack" id="exportPickers">\n                <div>\n                  <label>Collection</label>\n                  <select id="collectionSelect"></select>\n                </div>\n                <div>\n                  <label>Mode (within collection)</label>\n                  <select id="modeSelect"></select>\n                </div>\n                <div>\n                  <div class="muted">Select a collection and mode, or check \u201CExport all\u201D.</div>\n                  <label><input type="checkbox" id="exportAllChk" /> Export all collections &amp; modes (creates a\n                    single\n                    file)</label>\n                  <div class="stack" style="gap:6px; margin:8px 0;">\n                    <label class="muted" style="display:flex; align-items:center; gap:.35rem;">\n                      <input type="checkbox" id="styleDictionaryChk" />\n                      <span>Export color tokens as hex values</span>\n                    </label>\n                    <label class="muted" style="display:flex; align-items:center; gap:.35rem;">\n                      <input type="checkbox" id="flatTokensChk" />\n                      <span>Flatten collections (omit top-level collection groups)</span>\n                    </label>\n                  </div>\n                  <button id="exportBtn" class="css-button-neumorphic">Export</button>\n                </div>\n                <div style="border-top:1px solid var(--border); padding-top:12px; margin-top:8px;">\n                  <div class="muted" style="margin-bottom:8px;">Typography tokens are exported separately.</div>\n                  <button id="exportTypographyBtn" class="css-button-neumorphic">Export typography.json</button>\n                  <div class="muted" style="margin-top:6px;">Saves all local text styles as DTCG typography tokens.\n                  </div>\n                </div>\n              </div>\n            </div>\n          </div>\n          <!-- /Export tab -->\n\n          <!-- GitHub tab -->\n          <div class="tab-panel" id="panel-github" data-tab="github" role="tabpanel" aria-labelledby="tab-github">\n            <div class="stack tab-panel--scroll github-panel">\n\n              <!-- Auth row -->\n              <div class="stack gh-section gh-auth">\n                <h3 class="eyebrow">GitHub Authentication</h3>\n                <label>Personal Access Token (PAT)</label>\n                <input id="ghTokenInput" type="password" placeholder="GitHub personal access token"\n                  autocomplete="off" />\n                <div class="muted gh-remember">\n                  <span>Store on this device?</span>\n                  <div class="row">\n            <label>\n              <input type="checkbox" id="githubRememberChk" checked />\n              Remember access token\n            </label>\n          </div>      </div>\n                <div class="gh-auth-actions" style="margin-bottom: .5rem;">\n                  <button id="ghConnectBtn" class="css-button-neumorphic">Connect</button>\n                  <button id="ghLogoutBtn" class="css-button-neumorphic" type="button">Log out</button>\n                </div>\n                <div id="ghAuthStatus" class="muted gh-auth-status"></div>\n                <div id="ghTokenMeta" class="muted gh-auth-meta"></div>\n              </div>\n\n              <!-- Export scope -->\n              <div class="row">\n                <div>\n                  <h3 class="eyebrow" style="margin: .5rem;">Export scope</h3>\n                  <div class="col" style="gap:.5rem;">\n                    <label style="display:flex; align-items:center; gap:.35rem;">\n                      <input type="radio" name="ghScope" id="ghScopeSelected" checked />\n                      Use export tab selection (collection and mode)\n                    </label>\n                    <label style="display:flex; align-items:center; gap:.35rem;">\n                      <input type="radio" name="ghScope" id="ghScopeAll" />\n                      All collections &amp; modes\n                    </label>\n                    <label style="display:flex; align-items:center; gap:.35rem;">\n                      <input type="radio" name="ghScope" id="ghScopeTypography" />\n                      Typography (text styles)\n                    </label>\n                  </div>\n                </div>\n              </div>\n\n              <!-- Repo picker -->\n              <div class="stack gh-section">\n                <h3 class="eyebrow">Export repository details</h3>\n                <label>Export repository</label>\n                <div class="gh-repo-combo">\n                  <select id="ghRepoSelect" disabled></select>\n                </div>\n                <div class="muted">Repos you own or are a member of (populated after Connect).</div>\n              </div>\n\n              <!-- Branch controls -->\n              <div class="stack gh-section">\n                <label>Export repository branch</label>\n                <div class="gh-branch-search">\n                  <div class="gh-branch-combo">\n                    <input id="ghBranchInput" type="text" placeholder="Pick a repository first\u2026" autocomplete="off"\n                      disabled />\n                    <button id="ghBranchToggleBtn" class="gh-branch-toggle" type="button" aria-label="Show branches"\n                      aria-haspopup="listbox" disabled>\n                      <span aria-hidden="true">\u25BE</span>\n                    </button>\n                    <ul id="ghBranchMenu" class="gh-branch-menu" role="listbox" aria-label="Branches" hidden></ul>\n                  </div>\n                  <div id="ghBranchCount" class="muted gh-branch-count"></div>\n                </div>\n                <div class="gh-branch-actions">\n                  <button id="ghBranchRefreshBtn" class="css-button-neumorphic gh-branch-refresh"\n                    type="button">Refresh</button>\n                  <button id="ghNewBranchBtn" class="css-button-neumorphic gh-new-branch-btn" disabled\n                    type="button">Create new\u2026</button>\n                </div>\n                <div id="ghNewBranchRow" class="gh-new-branch-row" style="display:none;">\n                  <input id="ghNewBranchName" type="text" placeholder="feature/my-branch" />\n                  <button id="ghCreateBranchConfirmBtn" class="css-button-neumorphic" type="button">Create</button>\n                  <button id="ghCancelBranchBtn" class="css-button-neumorphic" type="button">Cancel</button>\n                </div>\n              </div>\n\n              <!-- Destination folder -->\n              <div class="stack gh-section" style="margin-top: .5rem;">\n                <h3 class="eyebrow">Export destination folder and file name</h3>\n                <label>Destination folder (in repo)</label>\n                <button id="ghPickFolderBtn" class="css-button-neumorphic" disabled type="button">Pick a\n                  folder\u2026</button>\n                <div id="ghFolderDisplay" class="gh-folder-display is-placeholder" aria-live="polite">Folder path\u2026\n                </div>\n                <input id="ghFolderInput" type="hidden" value="" />\n                <label for="ghFilenameInput">Filename</label>\n                <input id="ghFilenameInput" type="text" value="tokens.json" autocomplete="off" />\n                <div id="ghFilenameError" class="gh-input-error" aria-live="polite" hidden></div>\n              </div>\n\n\n\n              <!-- Commit -->\n              <div class="row">\n                <div>\n                  <h3 class="eyebrow" style="margin-bottom: .5rem;">Commit/pull request details</h3>\n                  <label>Commit message</label>\n                  <input id="ghCommitMsgInput" type="text" value="Update tokens from Figma" />\n                </div>\n              </div>\n\n              <!-- PR toggle -->\n              <div class="row">\n                <div>\n                  <label>Pull request</label>\n                  <label style="display:flex; align-items:center; gap:.35rem;">\n                    <input type="checkbox" id="ghCreatePrChk" />\n                    Create a pull request after committing\n                  </label>\n                  <div id="ghPrOptions" class="stack" style="margin-top:.5rem; display:none; gap:.5rem;">\n                    <input id="ghPrTitleInput" type="text" placeholder="Pull request title" />\n                    <textarea id="ghPrBodyInput" rows="3" placeholder="Optional PR description"></textarea>\n                  </div>\n                </div>\n              </div>\n\n\n\n              <!-- Actions -->\n              <div class="row">\n                <div class="row" style="gap:.5rem;">\n                  <button id="ghExportAndCommitBtn" class="css-button-neumorphic" disabled>Export &amp; Commit /\n                    PR</button>\n                </div>\n              </div>\n\n              <!-- Import from GitHub -->\n              <div class="row" style="margin-top: .5rem;">\n                <div>\n                  <h3 class="eyebrow" style="padding-bottom: .25rem;">Import from tokens from GitHub</h3>\n                  <label>Directory path to tokens in GitHub</label>\n                  <!-- <div class="muted" style="margin: .25rem;">(Downloads a JSON file from the selected repo/branch and\n                    imports it.)</div> -->\n                  <div class="row">\n                    <input id="ghFetchPathInput" type="text" placeholder="path/to/tokens-folder/design-token.json" />\n                    <div style="flex:0 0 auto;">\n                      <button id="ghFetchTokensBtn" class="css-button-neumorphic" disabled>Fetch &amp; Import</button>\n                    </div>\n                  </div>\n                  <div id="ghImportStatus" class="gh-import-status">Select a repository and branch to enable imports.\n                  </div>\n                </div>\n              </div>\n            </div>\n          </div>\n        </div>\n      </div>\n    </div>\n\n    <!-- Middle: Raw Figma Collections -->\n    <div class="col">\n      <div class="panel">\n        <div class="panel-header">\n          <div>\n            <div class="eyebrow">Reference</div>\n            <h2 class="title">Figma Document</h2>\n          </div>\n          <div class="actions">\n            <button id="copyRawBtn" title="Copy raw collections">Copy</button>\n            <button id="refreshBtn">Refresh</button>\n          </div>\n        </div>\n        <div class="panel-body">\n          <pre id="raw"></pre>\n        </div>\n      </div>\n    </div>\n\n    <!-- Right: W3C Preview -->\n    <div class="col">\n      <div class="panel">\n        <div class="panel-header">\n          <div>\n            <div class="eyebrow">Preview</div>\n            <h2 class="title">W3C Design Tokens (JSON)</h2>\n          </div>\n          <button id="copyW3cBtn" title="Copy W3C JSON">Copy</button>\n        </div>\n        <div class="panel-body">\n          <pre id="w3cPreview">{ /* preview will render here */ }</pre>\n        </div>\n      </div>\n    </div>\n\n    <!-- Bottom drawer: tabs span all columns -->\n    <div class="drawer">\n      <div class="panel-header">\n        <div>\n          <div class="eyebrow">Diagnostics</div>\n          <h2 class="title">Activity Log</h2>\n        </div>\n        <div class="actions">\n          <button id="copyLogBtn" title="Copy log">Copy</button>\n          <button id="drawerToggleBtn" class="drawer-toggle" aria-expanded="true" title="Hide log">Hide</button>\n        </div>\n      </div>\n\n      <div class="drawer-body">\n        <div id="log"></div>\n      </div>\n    </div>\n\n    <div id="importScopeOverlay" class="modal-overlay" hidden aria-hidden="true">\n      <div class="folder-picker-modal import-scope-modal" role="dialog" aria-modal="true"\n        aria-labelledby="importScopeTitle">\n        <h2 id="importScopeTitle" class="folder-picker-title">Select a mode to import</h2>\n        <p class="muted" style="margin:0;">Choose which collection and mode to bring into this file.</p>\n        <p id="importScopeMissingNotice" class="import-scope-missing" hidden></p>\n        <div id="importScopeBody" class="import-scope-body"></div>\n        <!-- <div class="import-scope-remember">\n          <label><input type="checkbox" id="importScopeRememberChk" /> Remember my choice for next time</label>\n          <span class="muted">You can clear this later from the import panel.</span>\n        </div> -->\n        <div class="import-scope-footer">\n          <button id="importScopeConfirmBtn" class="css-button-neumorphic" type="button">Import selected mode</button>\n          <button id="importScopeCancelBtn" class="css-button-neumorphic" type="button">Cancel</button>\n        </div>\n      </div>\n    </div>\n\n    <div id="folderPickerOverlay" class="modal-overlay" hidden aria-hidden="true">\n      <div class="folder-picker-modal" role="dialog" aria-modal="true" aria-labelledby="folderPickerTitle">\n        <div class="folder-picker-header">\n          <div class="eyebrow">Pick destination</div>\n          <div id="folderPickerTitle" class="folder-picker-title">owner/repo @ branch</div>\n        </div>\n        <div class="folder-picker-path-row">\n          <input id="folderPickerPath" type="text" placeholder="tokens/ (optional)" autocomplete="off" />\n          <button id="folderPickerUseBtn" class="tab-btn">Use this folder</button>\n        </div>\n        <div id="folderPickerList" class="folder-picker-list">\n          <button class="folder-picker-row is-muted" type="button" disabled>Loading\u2026</button>\n        </div>\n        <div class="folder-picker-actions">\n          <button id="folderPickerCancelBtn" class="tab-btn">Cancel</button>\n        </div>\n      </div>\n    </div>\n\n    <div class="resize-handle" id="resizeHandle" title="Drag to resize"></div>\n\n    <script>"use strict";\n(() => {\n  var __defProp = Object.defineProperty;\n  var __getOwnPropSymbols = Object.getOwnPropertySymbols;\n  var __hasOwnProp = Object.prototype.hasOwnProperty;\n  var __propIsEnum = Object.prototype.propertyIsEnumerable;\n  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;\n  var __spreadValues = (a, b) => {\n    for (var prop in b || (b = {}))\n      if (__hasOwnProp.call(b, prop))\n        __defNormalProp(a, prop, b[prop]);\n    if (__getOwnPropSymbols)\n      for (var prop of __getOwnPropSymbols(b)) {\n        if (__propIsEnum.call(b, prop))\n          __defNormalProp(a, prop, b[prop]);\n      }\n    return a;\n  };\n\n  // src/app/github/filenames.ts\n  var DEFAULT_GITHUB_FILENAME = "tokens.json";\n  var INVALID_FILENAME_CHARS = /[<>:"/\\\\|?*\\u0000-\\u001F]/;\n  var MAX_FILENAME_LENGTH = 128;\n  function validateGithubFilename(raw) {\n    const initial = typeof raw === "string" ? raw : DEFAULT_GITHUB_FILENAME;\n    const trimmed = initial.trim();\n    if (!trimmed) {\n      return { ok: false, message: "GitHub: Enter a filename (e.g., tokens.json)." };\n    }\n    if (trimmed === "." || trimmed === "..") {\n      return { ok: false, message: \'GitHub: Filename cannot be "." or "..".\' };\n    }\n    if (trimmed.length > MAX_FILENAME_LENGTH) {\n      return { ok: false, message: `GitHub: Filename must be ${MAX_FILENAME_LENGTH} characters or fewer.` };\n    }\n    if (INVALID_FILENAME_CHARS.test(trimmed)) {\n      return { ok: false, message: \'GitHub: Filename contains unsupported characters like / \\\\ : * ? " < > |.\' };\n    }\n    if (!/\\.json$/i.test(trimmed)) {\n      return { ok: false, message: "GitHub: Filename must end with .json." };\n    }\n    return { ok: true, filename: trimmed };\n  }\n\n  // src/app/github/ui.ts\n  var GH_MASK = "\\u2022\\u2022\\u2022\\u2022\\u2022\\u2022\\u2022\\u2022\\u2022\\u2022";\n  var BRANCH_TTL_MS = 6e4;\n  function createGithubUi(deps) {\n    let doc = null;\n    let win = null;\n    let ghTokenInput = null;\n    let ghRememberChk = null;\n    let ghConnectBtn = null;\n    let ghVerifyBtn = null;\n    let ghRepoSelect = null;\n    let ghLogoutBtn = null;\n    let ghBranchInput = null;\n    let ghBranchToggleBtn = null;\n    let ghBranchMenu = null;\n    let ghBranchCountEl = null;\n    let ghBranchRefreshBtn = null;\n    let ghNewBranchBtn = null;\n    let ghNewBranchRow = null;\n    let ghNewBranchName = null;\n    let ghCreateBranchConfirmBtn = null;\n    let ghCancelBranchBtn = null;\n    let ghFolderInput = null;\n    let ghFolderDisplay = null;\n    let ghPickFolderBtn = null;\n    let ghFilenameInput = null;\n    let ghFilenameErrorEl = null;\n    let ghCollectionsRefreshing = false;\n    let ghCommitMsgInput = null;\n    let ghExportAndCommitBtn = null;\n    let ghCreatePrChk = null;\n    let ghPrOptionsEl = null;\n    let ghPrTitleInput = null;\n    let ghPrBodyInput = null;\n    let ghFetchPathInput = null;\n    let ghFetchTokensBtn = null;\n    let ghScopeSelected = null;\n    let ghScopeAll = null;\n    let ghScopeTypography = null;\n    let styleDictionaryCheckbox = null;\n    let flatTokensCheckbox = null;\n    let ghImportStatusEl = null;\n    let ghAuthStatusEl = null;\n    let ghTokenMetaEl = null;\n    let folderPickerOverlay = null;\n    let folderPickerTitleEl = null;\n    let folderPickerPathInput = null;\n    let folderPickerUseBtn = null;\n    let folderPickerListEl = null;\n    let folderPickerCancelBtn = null;\n    let folderPickerIsOpen = false;\n    let folderPickerCurrentPath = "";\n    let folderPickerLastFocus = null;\n    let folderPickerRefreshNonce = 0;\n    const folderListWaiters = [];\n    const folderCreateWaiters = [];\n    let ghIsAuthed = false;\n    let ghTokenExpiresAt = null;\n    let ghRememberPref = true;\n    let filenameValidation = validateGithubFilename(DEFAULT_GITHUB_FILENAME);\n    let currentOwner = "";\n    let currentRepo = "";\n    let desiredBranch = null;\n    let defaultBranchFromApi = void 0;\n    let loadedPages = 0;\n    let hasMorePages = false;\n    let isFetchingBranches = false;\n    let lastBranchesFetchedAtMs = 0;\n    let allBranches = [];\n    let filteredBranches = [];\n    let renderCount = 0;\n    let branchMenuVisible = false;\n    let branchHighlightIndex = -1;\n    const RENDER_STEP = 200;\n    const BRANCH_INPUT_PLACEHOLDER = "Search branches\\u2026 (press Enter to refresh)";\n    const GH_FOLDER_PLACEHOLDER = "Path in repository\\u2026";\n    let branchLastQuery = "";\n    let branchInputPristine = true;\n    let ghImportInFlight = false;\n    let lastImportTarget = null;\n    const IMPORT_PROMPT_SELECT = "Select a repository and branch to enable imports.";\n    const IMPORT_PROMPT_BRANCH = "Pick a branch to import from.";\n    const IMPORT_PROMPT_PATH = "Enter the path to a DTCG token file, then press Import.";\n    let currentImportStatus = "idle";\n    function setImportStatus(kind, message) {\n      if (!ghImportStatusEl) return;\n      currentImportStatus = kind;\n      ghImportStatusEl.textContent = message;\n      ghImportStatusEl.classList.remove(\n        "gh-import-status--ready",\n        "gh-import-status--progress",\n        "gh-import-status--success",\n        "gh-import-status--error"\n      );\n      if (kind === "ready") ghImportStatusEl.classList.add("gh-import-status--ready");\n      else if (kind === "progress") ghImportStatusEl.classList.add("gh-import-status--progress");\n      else if (kind === "success") ghImportStatusEl.classList.add("gh-import-status--success");\n      else if (kind === "error") ghImportStatusEl.classList.add("gh-import-status--error");\n    }\n    function pickCollectionSelect() {\n      return deps.getCollectionSelect();\n    }\n    function pickModeSelect() {\n      return deps.getModeSelect();\n    }\n    function pickAllowHexCheckbox() {\n      return deps.getAllowHexCheckbox();\n    }\n    function pickStyleDictionaryCheckbox() {\n      if (!styleDictionaryCheckbox) styleDictionaryCheckbox = deps.getStyleDictionaryCheckbox();\n      return styleDictionaryCheckbox;\n    }\n    function pickFlatTokensCheckbox() {\n      if (!flatTokensCheckbox) flatTokensCheckbox = deps.getFlatTokensCheckbox();\n      return flatTokensCheckbox;\n    }\n    function findTokenInput() {\n      if (!doc) return null;\n      return doc.getElementById("githubTokenInput") || doc.getElementById("ghTokenInput") || doc.getElementById("githubPatInput") || doc.querySelector(\'input[name="githubToken"]\') || doc.querySelector(\'input[type="password"]\');\n    }\n    function readPatFromUi() {\n      if (!ghTokenInput) ghTokenInput = findTokenInput();\n      if (!ghTokenInput) return "";\n      if (ghTokenInput.getAttribute("data-filled") === "1") return GH_MASK;\n      return (ghTokenInput.value || "").trim();\n    }\n    function updateRememberPref(pref, persist = false) {\n      const next = !!pref;\n      ghRememberPref = next;\n      if (ghRememberChk) {\n        ghRememberChk.checked = ghRememberPref;\n      }\n      updateGhStatusUi();\n      if (persist) {\n        deps.postToPlugin({ type: "SAVE_PREFS", payload: { githubRememberToken: ghRememberPref } });\n      }\n    }\n    function ensureGhStatusElements() {\n      if (!doc) return;\n      if (!ghAuthStatusEl) ghAuthStatusEl = doc.getElementById("ghAuthStatus");\n      if (!ghTokenMetaEl) ghTokenMetaEl = doc.getElementById("ghTokenMeta");\n      if (!ghLogoutBtn) ghLogoutBtn = doc.getElementById("ghLogoutBtn");\n    }\n    function formatTimeLeft(expInput) {\n      const exp = typeof expInput === "number" ? expInput : Date.parse(expInput);\n      if (!isFinite(exp)) return "expiration: unknown";\n      const now = Date.now();\n      const ms = exp - now;\n      if (ms <= 0) return "expired";\n      const days = Math.floor(ms / (24 * 60 * 60 * 1e3));\n      const hours = Math.floor(ms % (24 * 60 * 60 * 1e3) / (60 * 60 * 1e3));\n      if (days > 0) return `${days}d ${hours}h left`;\n      const mins = Math.floor(ms % (60 * 60 * 1e3) / (60 * 1e3));\n      if (hours > 0) return `${hours}h ${mins}m left`;\n      const secs = Math.floor(ms % (60 * 1e3) / 1e3);\n      if (mins > 0) return `${mins}m ${secs}s left`;\n      return `${secs}s left`;\n    }\n    function setPatFieldObfuscated(filled) {\n      if (!ghTokenInput) ghTokenInput = findTokenInput();\n      if (!ghTokenInput) return;\n      ghTokenInput.type = "password";\n      if (filled) {\n        ghTokenInput.value = GH_MASK;\n        ghTokenInput.setAttribute("data-filled", "1");\n      } else {\n        ghTokenInput.value = "";\n        ghTokenInput.removeAttribute("data-filled");\n      }\n    }\n    function updateGhStatusUi() {\n      ensureGhStatusElements();\n      if (ghAuthStatusEl) {\n        ghAuthStatusEl.textContent = ghIsAuthed ? "GitHub: authenticated." : "GitHub: not authenticated.";\n      }\n      if (ghTokenMetaEl) {\n        const rememberTxt = ghRememberPref ? "Remember me: on" : "Remember me: off";\n        const expTxt = ghTokenExpiresAt ? `Token ${formatTimeLeft(ghTokenExpiresAt)}` : "Token expiration: unknown";\n        ghTokenMetaEl.textContent = `${expTxt} \\u2022 ${rememberTxt}`;\n      }\n      if (ghTokenInput) {\n        ghTokenInput.oninput = () => {\n          if (ghTokenInput && ghTokenInput.getAttribute("data-filled") === "1") {\n            ghTokenInput.removeAttribute("data-filled");\n          }\n          if (ghConnectBtn) ghConnectBtn.disabled = false;\n        };\n      }\n      if (ghConnectBtn && ghTokenInput) {\n        const isMasked = ghTokenInput.getAttribute("data-filled") === "1";\n        ghConnectBtn.disabled = ghIsAuthed && isMasked;\n      }\n      if (ghLogoutBtn) {\n        ghLogoutBtn.disabled = !ghIsAuthed;\n      }\n      if (ghRememberChk) {\n        ghRememberChk.checked = ghRememberPref;\n      }\n    }\n    function setGitHubDisabledStates() {\n      updateGhStatusUi();\n    }\n    function showNewBranchRow(show) {\n      if (!ghNewBranchRow) return;\n      ghNewBranchRow.style.display = show ? "flex" : "none";\n      if (show && ghNewBranchName) {\n        if (!ghNewBranchName.value) {\n          ghNewBranchName.value = `tokens/update-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;\n        }\n        ghNewBranchName.focus();\n        ghNewBranchName.select();\n      }\n    }\n    function isNewBranchRowVisible() {\n      if (!ghNewBranchRow) return false;\n      return ghNewBranchRow.style.display !== "none";\n    }\n    function cancelNewBranchFlow(refocusBtn) {\n      showNewBranchRow(false);\n      if (ghNewBranchName) ghNewBranchName.value = "";\n      if (refocusBtn && ghNewBranchBtn) ghNewBranchBtn.focus();\n    }\n    function requestNewBranchCreation() {\n      if (!ghCreateBranchConfirmBtn || ghCreateBranchConfirmBtn.disabled) return;\n      if (!currentOwner || !currentRepo) {\n        deps.log("Pick a repository before creating a branch.");\n        return;\n      }\n      const baseBranch = defaultBranchFromApi || "";\n      if (!baseBranch) {\n        deps.log("GitHub: Unable to determine the repository default branch. Refresh branches first.");\n        return;\n      }\n      const newBranch = ((ghNewBranchName == null ? void 0 : ghNewBranchName.value) || "").trim();\n      if (!newBranch) {\n        deps.log("Enter a branch name to create.");\n        if (ghNewBranchName) ghNewBranchName.focus();\n        return;\n      }\n      if (newBranch === baseBranch) {\n        deps.log("Enter a branch name that differs from the source branch.");\n        if (ghNewBranchName) ghNewBranchName.focus();\n        return;\n      }\n      ghCreateBranchConfirmBtn.disabled = true;\n      deps.log(`GitHub: creating ${newBranch} from ${baseBranch}\\u2026`);\n      deps.postToPlugin({\n        type: "GITHUB_CREATE_BRANCH",\n        payload: { owner: currentOwner, repo: currentRepo, baseBranch, newBranch }\n      });\n    }\n    function revalidateBranchesIfStale(forceLog = false) {\n      if (!ghRepoSelect || !ghBranchInput) return;\n      if (!currentOwner || !currentRepo) return;\n      const stale = Date.now() - lastBranchesFetchedAtMs > BRANCH_TTL_MS;\n      if (!stale) {\n        if (forceLog) deps.log("Branches are up to date (no refresh needed).");\n        return;\n      }\n      desiredBranch = desiredBranch || null;\n      defaultBranchFromApi = void 0;\n      loadedPages = 0;\n      hasMorePages = false;\n      isFetchingBranches = true;\n      allBranches = [];\n      filteredBranches = [];\n      renderCount = 0;\n      setBranchDisabled(true, "Refreshing branches\\u2026");\n      updateBranchCount();\n      if (ghBranchInput) {\n        ghBranchInput.value = "";\n        branchLastQuery = "";\n        branchInputPristine = true;\n      }\n      deps.log("Refreshing branches\\u2026");\n      deps.postToPlugin({\n        type: "GITHUB_FETCH_BRANCHES",\n        payload: { owner: currentOwner, repo: currentRepo, page: 1 }\n      });\n    }\n    function setBranchDisabled(disabled, placeholder) {\n      const nextPlaceholder = placeholder !== void 0 ? placeholder : BRANCH_INPUT_PLACEHOLDER;\n      if (ghBranchInput) {\n        ghBranchInput.disabled = disabled;\n        ghBranchInput.placeholder = nextPlaceholder;\n        if (disabled) {\n          ghBranchInput.value = "";\n          branchLastQuery = "";\n          branchInputPristine = true;\n        }\n      }\n      if (ghBranchToggleBtn) {\n        ghBranchToggleBtn.disabled = disabled;\n        ghBranchToggleBtn.setAttribute("aria-expanded", "false");\n      }\n      if (disabled) closeBranchMenu();\n    }\n    function updateBranchCount() {\n      if (!ghBranchCountEl) return;\n      const total = allBranches.length;\n      const showing = filteredBranches.length;\n      ghBranchCountEl.textContent = `${showing} / ${total}${hasMorePages ? " +" : ""}`;\n    }\n    function getBranchMenuItems() {\n      if (!ghBranchMenu) return [];\n      const items = [];\n      let node = ghBranchMenu.firstElementChild;\n      while (node) {\n        if (node instanceof HTMLLIElement) items.push(node);\n        node = node.nextElementSibling;\n      }\n      return items;\n    }\n    function setBranchHighlight(index, scrollIntoView) {\n      const items = getBranchMenuItems();\n      branchHighlightIndex = index;\n      for (let i = 0; i < items.length; i++) {\n        if (i === branchHighlightIndex) items[i].setAttribute("data-active", "1");\n        else items[i].removeAttribute("data-active");\n      }\n      if (scrollIntoView && branchHighlightIndex >= 0 && branchHighlightIndex < items.length) {\n        try {\n          items[branchHighlightIndex].scrollIntoView({ block: "nearest" });\n        } catch (e) {\n        }\n      }\n    }\n    function findNextSelectable(startIndex, delta, items) {\n      if (!items.length) return -1;\n      let index = startIndex;\n      for (let i = 0; i < items.length; i++) {\n        index += delta;\n        if (index < 0) index = items.length - 1;\n        else if (index >= items.length) index = 0;\n        const item = items[index];\n        if (!item) continue;\n        if (item.dataset.selectable === "1" && item.getAttribute("aria-disabled") !== "true") return index;\n      }\n      return -1;\n    }\n    function moveBranchHighlight(delta) {\n      const items = getBranchMenuItems();\n      if (!items.length) {\n        setBranchHighlight(-1, false);\n        return;\n      }\n      const next = findNextSelectable(branchHighlightIndex, delta, items);\n      if (next >= 0) setBranchHighlight(next, true);\n    }\n    function syncBranchHighlightAfterRender() {\n      const items = getBranchMenuItems();\n      if (!branchMenuVisible) {\n        setBranchHighlight(-1, false);\n        return;\n      }\n      if (!items.length) {\n        setBranchHighlight(-1, false);\n        return;\n      }\n      if (branchHighlightIndex >= 0 && branchHighlightIndex < items.length) {\n        const current = items[branchHighlightIndex];\n        if (current && current.dataset.selectable === "1" && current.getAttribute("aria-disabled") !== "true") {\n          setBranchHighlight(branchHighlightIndex, false);\n          return;\n        }\n      }\n      const first = findNextSelectable(-1, 1, items);\n      setBranchHighlight(first, false);\n    }\n    function setBranchMenuVisible(show) {\n      if (!ghBranchMenu) {\n        branchMenuVisible = false;\n        branchHighlightIndex = -1;\n        return;\n      }\n      if (show && ghBranchInput && ghBranchInput.disabled) show = false;\n      branchMenuVisible = show;\n      if (branchMenuVisible) {\n        ghBranchMenu.hidden = false;\n        ghBranchMenu.setAttribute("data-open", "1");\n        if (ghBranchToggleBtn) ghBranchToggleBtn.setAttribute("aria-expanded", "true");\n        if (ghBranchInput) ghBranchInput.setAttribute("aria-expanded", "true");\n      } else {\n        ghBranchMenu.hidden = true;\n        ghBranchMenu.removeAttribute("data-open");\n        if (ghBranchToggleBtn) ghBranchToggleBtn.setAttribute("aria-expanded", "false");\n        if (ghBranchInput) ghBranchInput.setAttribute("aria-expanded", "false");\n        setBranchHighlight(-1, false);\n      }\n    }\n    function openBranchMenu() {\n      if (!ghBranchMenu) return;\n      if (!branchMenuVisible) {\n        if (!ghBranchMenu.childElementCount) renderOptions();\n        setBranchMenuVisible(true);\n      }\n      syncBranchHighlightAfterRender();\n    }\n    function closeBranchMenu() {\n      setBranchMenuVisible(false);\n    }\n    function renderOptions() {\n      if (!ghBranchMenu) return;\n      while (ghBranchMenu.firstChild) ghBranchMenu.removeChild(ghBranchMenu.firstChild);\n      const slice = filteredBranches.slice(0, renderCount);\n      if (slice.length > 0) {\n        for (let i = 0; i < slice.length; i++) {\n          const name = slice[i];\n          const item = doc.createElement("li");\n          item.className = "gh-branch-item";\n          item.dataset.value = name;\n          item.dataset.selectable = "1";\n          item.setAttribute("role", "option");\n          item.textContent = name;\n          if (i === branchHighlightIndex) item.setAttribute("data-active", "1");\n          ghBranchMenu.appendChild(item);\n        }\n      } else {\n        const empty = doc.createElement("li");\n        empty.className = "gh-branch-item gh-branch-item-empty";\n        empty.setAttribute("aria-disabled", "true");\n        empty.dataset.selectable = "0";\n        empty.textContent = allBranches.length ? "No matching branches" : "No branches loaded yet";\n        ghBranchMenu.appendChild(empty);\n      }\n      if (filteredBranches.length > renderCount) {\n        const more = doc.createElement("li");\n        more.className = "gh-branch-item gh-branch-item-action";\n        more.dataset.value = "__more__";\n        more.dataset.selectable = "1";\n        more.textContent = `Load more\\u2026 (${filteredBranches.length - renderCount} more)`;\n        ghBranchMenu.appendChild(more);\n      } else if (hasMorePages) {\n        const fetch = doc.createElement("li");\n        fetch.className = "gh-branch-item gh-branch-item-action";\n        fetch.dataset.value = "__fetch__";\n        fetch.dataset.selectable = "1";\n        fetch.textContent = "Load next page\\u2026";\n        ghBranchMenu.appendChild(fetch);\n      }\n      if (ghBranchInput) {\n        const want = desiredBranch || defaultBranchFromApi || "";\n        if (!ghBranchInput.value && want && branchInputPristine) {\n          ghBranchInput.value = want;\n          branchLastQuery = want;\n        }\n      }\n      if (branchMenuVisible) {\n        syncBranchHighlightAfterRender();\n      }\n    }\n    function applyBranchFilter() {\n      const rawInput = ((ghBranchInput == null ? void 0 : ghBranchInput.value) || "").trim();\n      const raw = rawInput === "__more__" || rawInput === "__fetch__" ? branchLastQuery.trim() : rawInput;\n      const q = raw.toLowerCase();\n      const isSelected = !!desiredBranch && raw === desiredBranch;\n      const isDefaultShown = !desiredBranch && !!defaultBranchFromApi && raw === defaultBranchFromApi;\n      const effectiveQuery = isSelected || isDefaultShown ? "" : q;\n      filteredBranches = effectiveQuery ? allBranches.filter((n) => n.toLowerCase().includes(effectiveQuery)) : [...allBranches];\n      renderCount = Math.min(RENDER_STEP, filteredBranches.length);\n      renderOptions();\n      updateBranchCount();\n      if (!branchMenuVisible && ghBranchInput && !ghBranchInput.disabled) {\n        const isFocused = !!doc && doc.activeElement === ghBranchInput;\n        if (isFocused) {\n          setBranchMenuVisible(true);\n          syncBranchHighlightAfterRender();\n        }\n      }\n    }\n    function processBranchSelection(rawValue, fromMenu) {\n      const value = (rawValue || "").trim();\n      if (!ghBranchInput) return "noop";\n      if (value === "__more__") {\n        renderCount = Math.min(renderCount + RENDER_STEP, filteredBranches.length);\n        renderOptions();\n        updateBranchCount();\n        ghBranchInput.value = branchLastQuery;\n        if (fromMenu && !branchMenuVisible) setBranchMenuVisible(true);\n        return "more";\n      }\n      if (value === "__fetch__") {\n        ensureNextPageIfNeeded();\n        ghBranchInput.value = branchLastQuery;\n        return "fetch";\n      }\n      if (!value) return "noop";\n      desiredBranch = value;\n      branchLastQuery = value;\n      ghBranchInput.value = value;\n      branchInputPristine = false;\n      deps.postToPlugin({\n        type: "GITHUB_SELECT_BRANCH",\n        payload: { owner: currentOwner, repo: currentRepo, branch: value }\n      });\n      applyBranchFilter();\n      updateFolderControlsEnabled();\n      updateExportCommitEnabled();\n      updateFetchButtonEnabled();\n      return "selected";\n    }\n    function ensureNextPageIfNeeded() {\n      if (!ghBranchInput || !ghRepoSelect) return;\n      if (!hasMorePages || isFetchingBranches) return;\n      if (!currentOwner || !currentRepo) return;\n      isFetchingBranches = true;\n      deps.postToPlugin({\n        type: "GITHUB_FETCH_BRANCHES",\n        payload: { owner: currentOwner, repo: currentRepo, page: loadedPages + 1 }\n      });\n    }\n    function onBranchChange() {\n      if (!ghBranchInput) return;\n      const result = processBranchSelection(ghBranchInput.value, false);\n      if (result === "selected") closeBranchMenu();\n      else if (result === "more" || result === "fetch") syncBranchHighlightAfterRender();\n    }\n    function normalizeFolderInput(raw) {\n      const trimmed = raw.trim();\n      if (!trimmed) return { display: "", payload: "" };\n      if (trimmed === "/" || trimmed === "./" || trimmed === ".") {\n        return { display: "/", payload: "/" };\n      }\n      const collapsed = trimmed.replace(/\\\\/g, "/").replace(/\\/{2,}/g, "/");\n      const stripped = collapsed.replace(/^\\/+/, "").replace(/\\/+$/, "");\n      if (!stripped) return { display: "/", payload: "/" };\n      return { display: stripped + "/", payload: stripped };\n    }\n    function normalizeFolderPickerPath(raw) {\n      const trimmed = (raw || "").trim();\n      if (!trimmed || trimmed === "/" || trimmed === "./" || trimmed === ".") return "";\n      const collapsed = trimmed.replace(/\\\\/g, "/").replace(/\\/{2,}/g, "/");\n      return collapsed.replace(/^\\/+/, "").replace(/\\/+$/, "");\n    }\n    function setGhFolderDisplay(display) {\n      if (ghFolderInput) ghFolderInput.value = display || "";\n      if (!ghFolderDisplay) return;\n      if (display) {\n        ghFolderDisplay.textContent = display;\n        ghFolderDisplay.classList.remove("is-placeholder");\n      } else {\n        ghFolderDisplay.textContent = GH_FOLDER_PLACEHOLDER;\n        ghFolderDisplay.classList.add("is-placeholder");\n      }\n    }\n    function setFilenameError(message) {\n      if (!ghFilenameErrorEl) return;\n      if (message) {\n        ghFilenameErrorEl.textContent = message;\n        ghFilenameErrorEl.hidden = false;\n      } else {\n        ghFilenameErrorEl.textContent = "";\n        ghFilenameErrorEl.hidden = true;\n      }\n    }\n    function refreshFilenameValidation() {\n      const raw = ghFilenameInput ? ghFilenameInput.value : "";\n      const result = validateGithubFilename(raw || DEFAULT_GITHUB_FILENAME);\n      filenameValidation = result;\n      if (result.ok) setFilenameError(null);\n      else setFilenameError(result.message);\n    }\n    function getCurrentFilename() {\n      if (filenameValidation.ok) return filenameValidation.filename;\n      const raw = ghFilenameInput ? ghFilenameInput.value : "";\n      return raw.trim() || DEFAULT_GITHUB_FILENAME;\n    }\n    function formatDestinationForLog(folderRaw, filename) {\n      const normalized = normalizeFolderInput(folderRaw || "");\n      const folderDisplay = normalized.display || "/";\n      const base = folderDisplay || "/";\n      const name = filename && filename.trim() ? filename.trim() : "(file)";\n      const joiner = base.endsWith("/") ? "" : "/";\n      return `${base}${joiner}${name}`;\n    }\n    function listDir(path) {\n      return new Promise((resolve) => {\n        const req = { path: path.replace(/^\\/+|\\/+$/g, "") };\n        folderListWaiters.push({\n          path: req.path,\n          resolve: (v) => resolve(v),\n          reject: (v) => resolve(v)\n        });\n        deps.postToPlugin({\n          type: "GITHUB_FOLDER_LIST",\n          payload: { owner: currentOwner, repo: currentRepo, branch: getCurrentBranch(), path: req.path }\n        });\n      });\n    }\n    function openFolderPicker() {\n      if (!currentOwner || !currentRepo) {\n        deps.log("Pick a repository first.");\n        return;\n      }\n      const ref = getCurrentBranch();\n      if (!ref) {\n        deps.log("Pick a branch first.");\n        return;\n      }\n      if (!(folderPickerOverlay && folderPickerTitleEl && folderPickerPathInput && folderPickerListEl)) {\n        deps.log("Folder picker UI is unavailable.");\n        return;\n      }\n      folderPickerLastFocus = doc && doc.activeElement instanceof HTMLElement ? doc.activeElement : null;\n      folderPickerOverlay.hidden = false;\n      folderPickerOverlay.classList.add("is-open");\n      folderPickerOverlay.setAttribute("aria-hidden", "false");\n      folderPickerIsOpen = true;\n      updateFolderPickerTitle(ref);\n      const startNormalized = normalizeFolderInput((ghFolderInput == null ? void 0 : ghFolderInput.value) || "");\n      const startPath = startNormalized.payload === "/" ? "" : startNormalized.payload;\n      setFolderPickerPath(startPath, true);\n      win == null ? void 0 : win.setTimeout(() => {\n        folderPickerPathInput == null ? void 0 : folderPickerPathInput.focus();\n        folderPickerPathInput == null ? void 0 : folderPickerPathInput.select();\n      }, 0);\n    }\n    function closeFolderPicker() {\n      if (!folderPickerOverlay) return;\n      folderPickerOverlay.classList.remove("is-open");\n      folderPickerOverlay.setAttribute("aria-hidden", "true");\n      folderPickerOverlay.hidden = true;\n      folderPickerIsOpen = false;\n      folderPickerCurrentPath = "";\n      folderPickerRefreshNonce++;\n      if (folderPickerListEl) {\n        folderPickerListEl.replaceChildren(createFolderPickerRow("Loading\\u2026", { muted: true, disabled: true }));\n      }\n      if (folderPickerLastFocus && (doc == null ? void 0 : doc.contains(folderPickerLastFocus))) {\n        folderPickerLastFocus.focus();\n      }\n      folderPickerLastFocus = null;\n    }\n    function createFolderPickerRow(label, options) {\n      if (!doc) throw new Error("GitHub UI not attached");\n      const btn = doc.createElement("button");\n      btn.type = "button";\n      btn.className = "folder-picker-row";\n      btn.textContent = label;\n      if (options == null ? void 0 : options.muted) btn.classList.add("is-muted");\n      if (options == null ? void 0 : options.disabled) btn.disabled = true;\n      if (options == null ? void 0 : options.onClick) {\n        btn.addEventListener("click", (event) => {\n          var _a;\n          event.preventDefault();\n          (_a = options.onClick) == null ? void 0 : _a.call(options);\n        });\n      }\n      return btn;\n    }\n    function updateFolderPickerTitle(branch) {\n      if (!folderPickerTitleEl) return;\n      if (currentOwner && currentRepo) {\n        folderPickerTitleEl.textContent = `${currentOwner}/${currentRepo} @ ${branch}`;\n      } else {\n        folderPickerTitleEl.textContent = "Select a repository first";\n      }\n    }\n    function setFolderPickerPath(raw, refresh = true, syncInput = true) {\n      const normalized = normalizeFolderPickerPath(raw);\n      folderPickerCurrentPath = normalized;\n      if (syncInput && folderPickerPathInput) folderPickerPathInput.value = normalized;\n      if (refresh && folderPickerIsOpen) {\n        void refreshFolderPickerList();\n      }\n    }\n    async function refreshFolderPickerList() {\n      if (!(folderPickerListEl && folderPickerIsOpen)) return;\n      const listEl = folderPickerListEl;\n      const requestId = ++folderPickerRefreshNonce;\n      listEl.replaceChildren(createFolderPickerRow("Loading\\u2026", { muted: true, disabled: true }));\n      const path = folderPickerCurrentPath;\n      const res = await listDir(path);\n      if (requestId !== folderPickerRefreshNonce) return;\n      if (!res.ok) {\n        const status = typeof res.status === "number" ? res.status : 0;\n        if (status === 404) {\n          listEl.replaceChildren(\n            createFolderPickerRow("Folder not found. It will be created during export.", { muted: true, disabled: true })\n          );\n          return;\n        }\n        if (status === 409) {\n          listEl.replaceChildren(\n            createFolderPickerRow("Cannot open this path: an existing file blocks the folder.", { muted: true, disabled: true })\n          );\n          return;\n        }\n        const message = res.message ? res.message : "failed to fetch";\n        listEl.replaceChildren(createFolderPickerRow(`Error: ${message}`, { muted: true, disabled: true }));\n        return;\n      }\n      const nodes = [];\n      if (path) {\n        nodes.push(createFolderPickerRow(".. (up one level)", {\n          muted: true,\n          onClick: () => {\n            const parentParts = folderPickerCurrentPath.split("/").filter(Boolean);\n            parentParts.pop();\n            setFolderPickerPath(parentParts.join("/"));\n          }\n        }));\n      }\n      const entries = Array.isArray(res.entries) ? res.entries : [];\n      const dirs = entries.filter((e) => e.type === "dir").sort((a, b) => (a.name || "").localeCompare(b.name || ""));\n      if (dirs.length === 0) {\n        nodes.push(createFolderPickerRow("(no subfolders)", { muted: true, disabled: true }));\n      } else {\n        for (const d of dirs) {\n          const name = d.name || "";\n          nodes.push(createFolderPickerRow(`${name}/`, {\n            onClick: () => {\n              const next = folderPickerCurrentPath ? `${folderPickerCurrentPath}/${name}` : name;\n              setFolderPickerPath(next);\n            }\n          }));\n        }\n      }\n      listEl.replaceChildren(...nodes);\n    }\n    function handleFolderPickerKeydown(event) {\n      if (!folderPickerIsOpen) return;\n      if (event.key === "Escape") {\n        event.preventDefault();\n        closeFolderPicker();\n      }\n    }\n    function populateGhRepos(list) {\n      if (!ghRepoSelect) return;\n      while (ghRepoSelect.options.length) ghRepoSelect.remove(0);\n      for (const r of list) {\n        const opt = doc.createElement("option");\n        opt.value = r.full_name;\n        opt.textContent = r.full_name;\n        ghRepoSelect.appendChild(opt);\n      }\n      ghRepoSelect.disabled = list.length === 0;\n      if (list.length > 0) {\n        if (currentOwner && currentRepo) {\n          const want = `${currentOwner}/${currentRepo}`;\n          let matched = false;\n          for (let i = 0; i < ghRepoSelect.options.length; i++) {\n            if (ghRepoSelect.options[i].value === want) {\n              ghRepoSelect.selectedIndex = i;\n              matched = true;\n              break;\n            }\n          }\n          if (matched) {\n            ghRepoSelect.dispatchEvent(new Event("change", { bubbles: true }));\n          }\n        } else {\n          ghRepoSelect.selectedIndex = 0;\n          ghRepoSelect.dispatchEvent(new Event("change", { bubbles: true }));\n        }\n      }\n    }\n    function getCurrentBranch() {\n      if (desiredBranch) return desiredBranch;\n      if (ghBranchInput && !ghBranchInput.disabled) {\n        const raw = ghBranchInput.value.trim();\n        if (raw && raw !== "__more__" && raw !== "__fetch__") {\n          if (allBranches.includes(raw) || raw === defaultBranchFromApi) return raw;\n        }\n      }\n      return defaultBranchFromApi || "";\n    }\n    function getPrBaseBranch() {\n      return defaultBranchFromApi || "";\n    }\n    function persistGhState(partial) {\n      deps.postToPlugin({ type: "GITHUB_SAVE_STATE", payload: partial });\n    }\n    function requestCollectionsRefresh() {\n      if (ghCollectionsRefreshing) return;\n      ghCollectionsRefreshing = true;\n      deps.log("Refreshing Figma document state\\u2026");\n      deps.postToPlugin({ type: "FETCH_COLLECTIONS" });\n      updateExportCommitEnabled();\n    }\n    function updateExportCommitEnabled() {\n      const collectionSelect2 = pickCollectionSelect();\n      const modeSelect2 = pickModeSelect();\n      const hasRepo = !!(currentOwner && currentRepo);\n      const br = getCurrentBranch();\n      const commitMsg = ((ghCommitMsgInput == null ? void 0 : ghCommitMsgInput.value) || "").trim();\n      const scopeAll = !!(ghScopeAll && ghScopeAll.checked);\n      const scopeTypography = !!(ghScopeTypography && ghScopeTypography.checked);\n      const folderRaw = ghFolderInput ? ghFolderInput.value.trim() : "";\n      const hasFolder = normalizeFolderInput(folderRaw).display.length > 0;\n      const hasFilename = filenameValidation.ok;\n      const hasSelection = scopeAll || scopeTypography ? true : !!(collectionSelect2 && collectionSelect2.value && modeSelect2 && modeSelect2.value);\n      let ready = !!(ghIsAuthed && hasRepo && br && commitMsg && hasSelection && hasFolder && hasFilename);\n      if (ghCollectionsRefreshing) {\n        ready = false;\n      }\n      if (ghCreatePrChk && ghCreatePrChk.checked) {\n        const prBase = getPrBaseBranch();\n        if (!prBase || prBase === br) {\n          ready = false;\n        }\n      }\n      if (ghExportAndCommitBtn) ghExportAndCommitBtn.disabled = !ready;\n    }\n    function updateFolderControlsEnabled() {\n      const br = getCurrentBranch();\n      const enable = !!(currentOwner && currentRepo && br);\n      if (ghPickFolderBtn) ghPickFolderBtn.disabled = !enable;\n      updateExportCommitEnabled();\n      updateFetchButtonEnabled();\n    }\n    function updateFetchButtonEnabled() {\n      const hasRepo = !!(ghIsAuthed && currentOwner && currentRepo);\n      const branch = getCurrentBranch();\n      const path = ((ghFetchPathInput == null ? void 0 : ghFetchPathInput.value) || "").trim();\n      if (ghFetchPathInput) ghFetchPathInput.disabled = !(hasRepo && branch) || ghImportInFlight;\n      if (ghFetchTokensBtn) ghFetchTokensBtn.disabled = ghImportInFlight || !(hasRepo && branch && path);\n      if (ghImportInFlight) return;\n      if (!hasRepo) {\n        lastImportTarget = null;\n        setImportStatus("idle", IMPORT_PROMPT_SELECT);\n        return;\n      }\n      if (!branch) {\n        lastImportTarget = null;\n        setImportStatus("idle", IMPORT_PROMPT_BRANCH);\n        return;\n      }\n      if (!path) {\n        lastImportTarget = null;\n        setImportStatus("idle", IMPORT_PROMPT_PATH);\n        return;\n      }\n      if (currentImportStatus === "success" || currentImportStatus === "error") {\n        if (!lastImportTarget || lastImportTarget.branch !== branch || lastImportTarget.path !== path) {\n          currentImportStatus = "idle";\n        }\n      }\n      if (currentImportStatus !== "success" && currentImportStatus !== "error") {\n        setImportStatus("ready", `Ready to import from ${branch}.`);\n      }\n    }\n    function attach(context) {\n      doc = context.document;\n      win = context.window;\n      ghTokenInput = findTokenInput();\n      ghRememberChk = doc.getElementById("githubRememberChk") || doc.getElementById("ghRememberChk");\n      ghConnectBtn = doc.getElementById("githubConnectBtn") || doc.getElementById("ghConnectBtn");\n      ghVerifyBtn = doc.getElementById("githubVerifyBtn") || doc.getElementById("ghVerifyBtn");\n      ghLogoutBtn = doc.getElementById("ghLogoutBtn");\n      ghRepoSelect = doc.getElementById("ghRepoSelect");\n      ghBranchInput = doc.getElementById("ghBranchInput");\n      ghBranchToggleBtn = doc.getElementById("ghBranchToggleBtn");\n      ghBranchMenu = doc.getElementById("ghBranchMenu");\n      ghBranchCountEl = doc.getElementById("ghBranchCount");\n      ghBranchRefreshBtn = doc.getElementById("ghBranchRefreshBtn");\n      ghNewBranchBtn = doc.getElementById("ghNewBranchBtn");\n      ghNewBranchRow = doc.getElementById("ghNewBranchRow");\n      ghNewBranchName = doc.getElementById("ghNewBranchName");\n      ghCreateBranchConfirmBtn = doc.getElementById("ghCreateBranchConfirmBtn");\n      ghCancelBranchBtn = doc.getElementById("ghCancelBranchBtn");\n      ghFolderInput = doc.getElementById("ghFolderInput");\n      ghFolderDisplay = doc.getElementById("ghFolderDisplay");\n      setGhFolderDisplay((ghFolderInput == null ? void 0 : ghFolderInput.value) || "");\n      ghPickFolderBtn = doc.getElementById("ghPickFolderBtn");\n      ghFilenameInput = doc.getElementById("ghFilenameInput");\n      ghFilenameErrorEl = doc.getElementById("ghFilenameError");\n      if (ghFilenameInput && !ghFilenameInput.value) {\n        ghFilenameInput.value = DEFAULT_GITHUB_FILENAME;\n      }\n      refreshFilenameValidation();\n      ghCommitMsgInput = doc.getElementById("ghCommitMsgInput");\n      ghExportAndCommitBtn = doc.getElementById("ghExportAndCommitBtn");\n      ghCreatePrChk = doc.getElementById("ghCreatePrChk");\n      ghPrOptionsEl = doc.getElementById("ghPrOptions");\n      ghPrTitleInput = doc.getElementById("ghPrTitleInput");\n      ghPrBodyInput = doc.getElementById("ghPrBodyInput");\n      ghFetchPathInput = doc.getElementById("ghFetchPathInput");\n      ghFetchTokensBtn = doc.getElementById("ghFetchTokensBtn");\n      ghScopeSelected = doc.getElementById("ghScopeSelected");\n      ghScopeAll = doc.getElementById("ghScopeAll");\n      ghScopeTypography = doc.getElementById("ghScopeTypography");\n      ghImportStatusEl = doc.getElementById("ghImportStatus");\n      if (ghBranchInput) {\n        ghBranchInput.setAttribute("role", "combobox");\n        ghBranchInput.setAttribute("aria-autocomplete", "list");\n        ghBranchInput.setAttribute("aria-expanded", "false");\n        ghBranchInput.setAttribute("aria-controls", "ghBranchMenu");\n      }\n      if (ghBranchToggleBtn) ghBranchToggleBtn.setAttribute("aria-expanded", "false");\n      folderPickerOverlay = doc.getElementById("folderPickerOverlay");\n      folderPickerTitleEl = doc.getElementById("folderPickerTitle");\n      folderPickerPathInput = doc.getElementById("folderPickerPath");\n      folderPickerUseBtn = doc.getElementById("folderPickerUseBtn");\n      folderPickerListEl = doc.getElementById("folderPickerList");\n      folderPickerCancelBtn = doc.getElementById("folderPickerCancelBtn");\n      if (ghRememberChk) {\n        ghRememberChk.checked = ghRememberPref;\n        ghRememberChk.addEventListener("change", () => {\n          updateRememberPref(!!ghRememberChk.checked, true);\n        });\n      }\n      ensureGhStatusElements();\n      if (ghConnectBtn) ghConnectBtn.addEventListener("click", onGitHubConnectClick);\n      if (ghVerifyBtn) ghVerifyBtn.addEventListener("click", onGitHubVerifyClick);\n      if (ghLogoutBtn) ghLogoutBtn.addEventListener("click", onGitHubLogoutClick);\n      if (ghRepoSelect && ghBranchInput) {\n        let lastRepoKey = "";\n        ghRepoSelect.addEventListener("change", () => {\n          const value = ghRepoSelect.value;\n          if (!value) return;\n          if (value === lastRepoKey) return;\n          lastRepoKey = value;\n          const parts = value.split("/");\n          currentOwner = parts[0] || "";\n          currentRepo = parts[1] || "";\n          updateExportCommitEnabled();\n          updateFetchButtonEnabled();\n          lastBranchesFetchedAtMs = 0;\n          deps.postToPlugin({ type: "GITHUB_SELECT_REPO", payload: { owner: currentOwner, repo: currentRepo } });\n          desiredBranch = null;\n          defaultBranchFromApi = void 0;\n          loadedPages = 0;\n          hasMorePages = false;\n          isFetchingBranches = false;\n          allBranches = [];\n          filteredBranches = [];\n          renderCount = 0;\n          if (ghBranchInput) {\n            ghBranchInput.value = "";\n            branchLastQuery = "";\n            branchInputPristine = true;\n          }\n          if (ghBranchMenu) while (ghBranchMenu.firstChild) ghBranchMenu.removeChild(ghBranchMenu.firstChild);\n          closeBranchMenu();\n          setBranchDisabled(true, "Loading branches\\u2026");\n          updateBranchCount();\n          updateFolderControlsEnabled();\n          setGhFolderDisplay("");\n          cancelNewBranchFlow(false);\n          if (currentOwner && currentRepo) {\n            deps.log(`GitHub: loading branches for ${currentOwner}/${currentRepo}\\u2026`);\n            isFetchingBranches = true;\n            deps.postToPlugin({\n              type: "GITHUB_FETCH_BRANCHES",\n              payload: { owner: currentOwner, repo: currentRepo, page: 1 }\n            });\n          }\n          updateExportCommitEnabled();\n        });\n      }\n      if (ghBranchInput) {\n        let timeout;\n        ghBranchInput.addEventListener("focus", () => {\n          if (ghBranchInput.disabled) return;\n          applyBranchFilter();\n          openBranchMenu();\n        });\n        ghBranchInput.addEventListener("input", () => {\n          if (timeout) win == null ? void 0 : win.clearTimeout(timeout);\n          const value = ghBranchInput.value;\n          if (value !== "__more__" && value !== "__fetch__") {\n            branchLastQuery = value;\n          }\n          branchInputPristine = false;\n          if (!branchMenuVisible) openBranchMenu();\n          timeout = win == null ? void 0 : win.setTimeout(() => {\n            applyBranchFilter();\n          }, 120);\n        });\n        ghBranchInput.addEventListener("keydown", (e) => {\n          if (e.key === "ArrowDown") {\n            openBranchMenu();\n            moveBranchHighlight(1);\n            e.preventDefault();\n            return;\n          }\n          if (e.key === "ArrowUp") {\n            openBranchMenu();\n            moveBranchHighlight(-1);\n            e.preventDefault();\n            return;\n          }\n          if (e.key === "Enter") {\n            if (branchMenuVisible && branchHighlightIndex >= 0) {\n              const items = getBranchMenuItems();\n              const item = items[branchHighlightIndex];\n              if (item && item.dataset.selectable === "1") {\n                const value = item.getAttribute("data-value") || "";\n                if (value) {\n                  const result = processBranchSelection(value, true);\n                  if (result === "selected") closeBranchMenu();\n                  else if (result === "more" || result === "fetch") {\n                    syncBranchHighlightAfterRender();\n                    openBranchMenu();\n                  }\n                }\n              }\n            } else {\n              const result = processBranchSelection(ghBranchInput.value, false);\n              if (result === "selected") closeBranchMenu();\n              else if (result === "more" || result === "fetch") syncBranchHighlightAfterRender();\n            }\n            revalidateBranchesIfStale(true);\n            e.preventDefault();\n            return;\n          }\n          if (e.key === "Escape") {\n            if (branchMenuVisible) {\n              closeBranchMenu();\n              e.preventDefault();\n            }\n          }\n        });\n        ghBranchInput.addEventListener("change", () => {\n          const result = processBranchSelection(ghBranchInput.value, false);\n          if (result === "selected") closeBranchMenu();\n          else if (result === "more" || result === "fetch") syncBranchHighlightAfterRender();\n        });\n      }\n      if (ghBranchToggleBtn) {\n        ghBranchToggleBtn.addEventListener("click", () => {\n          if (ghBranchToggleBtn.disabled) return;\n          if (branchMenuVisible) {\n            closeBranchMenu();\n            return;\n          }\n          if (!ghBranchMenu || !ghBranchMenu.childElementCount) renderOptions();\n          openBranchMenu();\n          if (ghBranchInput && (doc == null ? void 0 : doc.activeElement) !== ghBranchInput) ghBranchInput.focus();\n        });\n      }\n      if (ghBranchMenu) {\n        ghBranchMenu.addEventListener("mousedown", (event) => {\n          event.preventDefault();\n        });\n        ghBranchMenu.addEventListener("click", (event) => {\n          const target = event.target;\n          if (!target) return;\n          const item = target.closest("li");\n          if (!item || !(item instanceof HTMLLIElement)) return;\n          if (item.getAttribute("aria-disabled") === "true") return;\n          const value = item.getAttribute("data-value") || "";\n          if (!value) return;\n          const result = processBranchSelection(value, true);\n          if (result === "selected") closeBranchMenu();\n          else if (result === "more" || result === "fetch") {\n            syncBranchHighlightAfterRender();\n            openBranchMenu();\n          }\n          if (ghBranchInput) ghBranchInput.focus();\n        });\n      }\n      if (doc) {\n        doc.addEventListener("mousedown", (event) => {\n          if (!branchMenuVisible) return;\n          const target = event.target;\n          if (!target) return;\n          if (ghBranchMenu && ghBranchMenu.contains(target)) return;\n          if (ghBranchInput && target === ghBranchInput) return;\n          if (ghBranchToggleBtn && ghBranchToggleBtn.contains(target)) return;\n          closeBranchMenu();\n        });\n        doc.addEventListener("focusin", (event) => {\n          if (!branchMenuVisible) return;\n          const target = event.target;\n          if (!target) {\n            closeBranchMenu();\n            return;\n          }\n          if (ghBranchMenu && ghBranchMenu.contains(target)) return;\n          if (ghBranchInput && target === ghBranchInput) return;\n          if (ghBranchToggleBtn && ghBranchToggleBtn.contains(target)) return;\n          closeBranchMenu();\n        });\n      }\n      if (ghBranchRefreshBtn) {\n        ghBranchRefreshBtn.addEventListener("click", () => {\n          lastBranchesFetchedAtMs = 0;\n          revalidateBranchesIfStale(true);\n        });\n      }\n      if (ghNewBranchBtn) {\n        ghNewBranchBtn.addEventListener("click", () => {\n          if (ghNewBranchBtn.disabled) return;\n          const next = !isNewBranchRowVisible();\n          if (next) showNewBranchRow(true);\n          else cancelNewBranchFlow(false);\n        });\n      }\n      if (ghNewBranchName) {\n        ghNewBranchName.addEventListener("keydown", (event) => {\n          if (event.key === "Enter") {\n            event.preventDefault();\n            requestNewBranchCreation();\n          } else if (event.key === "Escape") {\n            event.preventDefault();\n            cancelNewBranchFlow(true);\n          }\n        });\n      }\n      if (ghCreateBranchConfirmBtn) {\n        ghCreateBranchConfirmBtn.addEventListener("click", () => {\n          requestNewBranchCreation();\n        });\n      }\n      if (ghCancelBranchBtn) {\n        ghCancelBranchBtn.addEventListener("click", () => {\n          cancelNewBranchFlow(true);\n        });\n      }\n      if (ghPickFolderBtn) {\n        ghPickFolderBtn.addEventListener("click", openFolderPicker);\n      }\n      if (folderPickerOverlay) {\n        folderPickerOverlay.addEventListener("click", (event) => {\n          if (event.target === folderPickerOverlay) closeFolderPicker();\n        });\n      }\n      if (folderPickerCancelBtn) {\n        folderPickerCancelBtn.addEventListener("click", () => closeFolderPicker());\n      }\n      let folderPickerPathDebounce;\n      if (folderPickerPathInput) {\n        folderPickerPathInput.addEventListener("input", () => {\n          if (folderPickerPathDebounce) win == null ? void 0 : win.clearTimeout(folderPickerPathDebounce);\n          const value = folderPickerPathInput.value;\n          folderPickerPathDebounce = win == null ? void 0 : win.setTimeout(() => {\n            setFolderPickerPath(value, true, false);\n          }, 120);\n        });\n        folderPickerPathInput.addEventListener("keydown", (event) => {\n          if (event.key === "Enter") {\n            event.preventDefault();\n            setFolderPickerPath(folderPickerPathInput.value);\n          }\n        });\n        folderPickerPathInput.addEventListener("blur", () => {\n          setFolderPickerPath(folderPickerPathInput.value);\n        });\n      }\n      if (folderPickerUseBtn) {\n        folderPickerUseBtn.addEventListener("click", () => {\n          if (folderPickerPathInput) {\n            setFolderPickerPath(folderPickerPathInput.value, false);\n          }\n          const selectionRaw = folderPickerCurrentPath ? `${folderPickerCurrentPath}/` : "/";\n          const normalized = normalizeFolderInput(selectionRaw);\n          setGhFolderDisplay(normalized.display);\n          deps.postToPlugin({\n            type: "GITHUB_SET_FOLDER",\n            payload: { owner: currentOwner, repo: currentRepo, folder: normalized.payload }\n          });\n          persistGhState({ folder: normalized.payload });\n          closeFolderPicker();\n          deps.log(`Folder selected: ${normalized.display === "/" ? "(repo root)" : normalized.display}`);\n          updateExportCommitEnabled();\n          updateFetchButtonEnabled();\n        });\n      }\n      if (ghCommitMsgInput) {\n        ghCommitMsgInput.addEventListener("input", () => {\n          updateExportCommitEnabled();\n          persistGhState({ commitMessage: ghCommitMsgInput.value || "" });\n        });\n      }\n      if (ghFilenameInput) {\n        ghFilenameInput.addEventListener("input", () => {\n          refreshFilenameValidation();\n          persistGhState({ filename: (ghFilenameInput.value || "").trim() });\n          updateExportCommitEnabled();\n        });\n        ghFilenameInput.addEventListener("blur", () => refreshFilenameValidation());\n      }\n      if (ghScopeSelected) {\n        ghScopeSelected.addEventListener("change", () => {\n          if ((ghScopeSelected == null ? void 0 : ghScopeSelected.checked) && ghPrOptionsEl) {\n            ghPrOptionsEl.style.display = (ghCreatePrChk == null ? void 0 : ghCreatePrChk.checked) ? "flex" : "none";\n          }\n          if (ghScopeSelected.checked) {\n            persistGhState({ scope: "selected" });\n            requestCollectionsRefresh();\n          }\n          updateExportCommitEnabled();\n        });\n      }\n      if (ghScopeAll) {\n        ghScopeAll.addEventListener("change", () => {\n          if (ghScopeAll.checked) {\n            persistGhState({ scope: "all" });\n            requestCollectionsRefresh();\n          }\n          updateExportCommitEnabled();\n        });\n      }\n      if (ghScopeTypography) {\n        ghScopeTypography.addEventListener("change", () => {\n          if (ghScopeTypography.checked) {\n            persistGhState({ scope: "typography" });\n            requestCollectionsRefresh();\n          }\n          if (ghPrOptionsEl) ghPrOptionsEl.style.display = (ghCreatePrChk == null ? void 0 : ghCreatePrChk.checked) ? "flex" : "none";\n          updateExportCommitEnabled();\n        });\n      }\n      if (ghCreatePrChk) {\n        ghCreatePrChk.addEventListener("change", () => {\n          const on = !!ghCreatePrChk.checked;\n          if (ghPrOptionsEl) ghPrOptionsEl.style.display = on ? "flex" : "none";\n          const save = { createPr: on };\n          if (on) save.prBase = getPrBaseBranch();\n          persistGhState(save);\n          updateExportCommitEnabled();\n        });\n      }\n      if (ghPrTitleInput) {\n        ghPrTitleInput.addEventListener("input", () => {\n          persistGhState({ prTitle: ghPrTitleInput.value });\n        });\n      }\n      if (ghPrBodyInput) {\n        ghPrBodyInput.addEventListener("input", () => {\n          persistGhState({ prBody: ghPrBodyInput.value });\n        });\n      }\n      if (ghFetchPathInput) ghFetchPathInput.addEventListener("input", updateFetchButtonEnabled);\n      if (ghFetchTokensBtn) {\n        ghFetchTokensBtn.addEventListener("click", () => {\n          var _a;\n          const branch = getCurrentBranch();\n          const path = ((ghFetchPathInput == null ? void 0 : ghFetchPathInput.value) || "").trim().replace(/^\\/+/, "");\n          if (!currentOwner || !currentRepo) {\n            deps.log("Pick a repository first.");\n            return;\n          }\n          if (!branch) {\n            deps.log("Pick a branch first.");\n            return;\n          }\n          if (!path) {\n            deps.log("Enter a path to fetch (e.g., tokens/tokens.json).");\n            return;\n          }\n          ghImportInFlight = true;\n          lastImportTarget = { branch, path };\n          setImportStatus("progress", `Fetching ${path} from ${branch}\\u2026`);\n          updateFetchButtonEnabled();\n          deps.log(`GitHub: fetching ${path} from ${currentOwner}/${currentRepo}@${branch}\\u2026`);\n          const allowHex = !!((_a = pickAllowHexCheckbox()) == null ? void 0 : _a.checked);\n          const contexts = deps.getImportContexts();\n          const payload = {\n            type: "GITHUB_FETCH_TOKENS",\n            payload: __spreadValues({\n              owner: currentOwner,\n              repo: currentRepo,\n              branch,\n              path,\n              allowHexStrings: allowHex\n            }, contexts.length > 0 ? { contexts } : {})\n          };\n          deps.postToPlugin(payload);\n          if (contexts.length > 0) {\n            deps.log(`GitHub: importing ${contexts.length} selected mode(s) based on current scope.`);\n          }\n        });\n      }\n      if (ghExportAndCommitBtn) {\n        ghExportAndCommitBtn.addEventListener("click", () => {\n          var _a, _b;\n          const collectionSelect2 = pickCollectionSelect();\n          const modeSelect2 = pickModeSelect();\n          const scope = ghScopeAll && ghScopeAll.checked ? "all" : ghScopeTypography && ghScopeTypography.checked ? "typography" : "selected";\n          const selectedCollection = collectionSelect2 ? collectionSelect2.value || "" : "";\n          const selectedMode = modeSelect2 ? modeSelect2.value || "" : "";\n          const commitMessage = ((ghCommitMsgInput == null ? void 0 : ghCommitMsgInput.value) || "Update tokens from Figma").trim();\n          const normalizedFolder = normalizeFolderInput((ghFolderInput == null ? void 0 : ghFolderInput.value) || "");\n          refreshFilenameValidation();\n          if (scope === "selected") {\n            if (!selectedCollection || !selectedMode) {\n              deps.log("Pick a collection and a mode before exporting.");\n              if (!selectedCollection && collectionSelect2) collectionSelect2.focus();\n              else if (!selectedMode && modeSelect2) modeSelect2.focus();\n              updateExportCommitEnabled();\n              return;\n            }\n          }\n          if (!normalizedFolder.display) {\n            deps.log("Pick a destination folder (e.g., tokens/).");\n            ghPickFolderBtn == null ? void 0 : ghPickFolderBtn.focus();\n            updateExportCommitEnabled();\n            return;\n          }\n          if (!filenameValidation.ok) {\n            deps.log(filenameValidation.message);\n            ghFilenameInput == null ? void 0 : ghFilenameInput.focus();\n            updateExportCommitEnabled();\n            return;\n          }\n          const filenameToUse = filenameValidation.filename;\n          setGhFolderDisplay(normalizedFolder.display);\n          deps.postToPlugin({\n            type: "GITHUB_SET_FOLDER",\n            payload: { owner: currentOwner, repo: currentRepo, folder: normalizedFolder.payload }\n          });\n          persistGhState({ folder: normalizedFolder.payload, filename: filenameToUse });\n          const createPr = !!(ghCreatePrChk && ghCreatePrChk.checked);\n          const payload = {\n            type: "GITHUB_EXPORT_AND_COMMIT",\n            payload: {\n              owner: currentOwner,\n              repo: currentRepo,\n              branch: getCurrentBranch(),\n              folder: normalizedFolder.payload,\n              filename: filenameToUse,\n              commitMessage,\n              scope,\n              styleDictionary: !!((_a = pickStyleDictionaryCheckbox()) == null ? void 0 : _a.checked),\n              flatTokens: !!((_b = pickFlatTokensCheckbox()) == null ? void 0 : _b.checked),\n              createPr\n            }\n          };\n          if (selectedCollection) payload.payload.collection = selectedCollection;\n          if (selectedMode) payload.payload.mode = selectedMode;\n          if (createPr) {\n            payload.payload.prBase = getPrBaseBranch();\n            payload.payload.prTitle = ((ghPrTitleInput == null ? void 0 : ghPrTitleInput.value) || "").trim();\n            payload.payload.prBody = (ghPrBodyInput == null ? void 0 : ghPrBodyInput.value) || "";\n          }\n          const scopeLabel = scope === "all" ? "all collections" : scope === "typography" ? "typography" : "selected mode";\n          const summaryTarget = formatDestinationForLog(normalizedFolder.payload, filenameToUse);\n          deps.log(`GitHub: Export summary \\u2192 ${summaryTarget} (${scopeLabel})`);\n          deps.log(createPr ? "Export, Commit & PR requested\\u2026" : "Export & Commit requested\\u2026");\n          deps.postToPlugin(payload);\n        });\n      }\n      doc.addEventListener("keydown", handleFolderPickerKeydown);\n      updateGhStatusUi();\n      updateFolderControlsEnabled();\n      updateExportCommitEnabled();\n      updateFetchButtonEnabled();\n    }\n    function onGitHubConnectClick() {\n      const tokenRaw = readPatFromUi();\n      const isMasked = (ghTokenInput == null ? void 0 : ghTokenInput.getAttribute("data-filled")) === "1";\n      if (ghIsAuthed && isMasked) return;\n      if (!tokenRaw) {\n        deps.log("GitHub: Paste a Personal Access Token first.");\n        return;\n      }\n      const remember = !!(ghRememberChk && ghRememberChk.checked);\n      deps.log("GitHub: Verifying token\\u2026");\n      deps.postToPlugin({ type: "GITHUB_SET_TOKEN", payload: { token: tokenRaw, remember } });\n    }\n    function onGitHubVerifyClick() {\n      onGitHubConnectClick();\n    }\n    function onGitHubLogoutClick() {\n      deps.postToPlugin({ type: "GITHUB_FORGET_TOKEN" });\n      ghIsAuthed = false;\n      ghTokenExpiresAt = null;\n      setPatFieldObfuscated(false);\n      populateGhRepos([]);\n      updateGhStatusUi();\n      currentOwner = "";\n      currentRepo = "";\n      allBranches = [];\n      filteredBranches = [];\n      desiredBranch = null;\n      defaultBranchFromApi = void 0;\n      loadedPages = 0;\n      hasMorePages = false;\n      isFetchingBranches = false;\n      if (ghBranchInput) {\n        ghBranchInput.value = "";\n        branchLastQuery = "";\n        branchInputPristine = true;\n      }\n      if (ghBranchMenu) while (ghBranchMenu.firstChild) ghBranchMenu.removeChild(ghBranchMenu.firstChild);\n      closeBranchMenu();\n      setBranchDisabled(true, "Pick a repository first\\u2026");\n      updateBranchCount();\n      updateFolderControlsEnabled();\n      setGhFolderDisplay("");\n      cancelNewBranchFlow(false);\n      deps.log("GitHub: Logged out.");\n    }\n    function handleMessage(msg) {\n      var _a, _b, _c;\n      if (msg.type === "GITHUB_AUTH_RESULT") {\n        const p = msg.payload || {};\n        ghIsAuthed = !!p.ok;\n        ghTokenExpiresAt = typeof p.exp !== "undefined" && p.exp !== null ? p.exp : typeof p.tokenExpiration !== "undefined" && p.tokenExpiration !== null ? p.tokenExpiration : null;\n        if (typeof p.remember === "boolean") {\n          updateRememberPref(p.remember, false);\n        }\n        if (ghIsAuthed) {\n          setPatFieldObfuscated(true);\n          const who = p.login || "unknown";\n          const name = p.name ? ` (${p.name})` : "";\n          deps.log(`GitHub: Authenticated as ${who}${name}.`);\n        } else {\n          setPatFieldObfuscated(false);\n          const why = p.error ? `: ${p.error}` : ".";\n          deps.log(`GitHub: Authentication failed${why}`);\n        }\n        updateGhStatusUi();\n        updateExportCommitEnabled();\n        updateFetchButtonEnabled();\n        return true;\n      }\n      if (msg.type === "GITHUB_REPOS") {\n        const repos = (_b = (_a = msg.payload) == null ? void 0 : _a.repos) != null ? _b : [];\n        populateGhRepos(repos);\n        deps.log(`GitHub: Repository list updated (${repos.length}).`);\n        return true;\n      }\n      if (msg.type === "GITHUB_RESTORE_SELECTED") {\n        const p = msg.payload || {};\n        currentOwner = typeof p.owner === "string" ? p.owner : "";\n        currentRepo = typeof p.repo === "string" ? p.repo : "";\n        desiredBranch = typeof p.branch === "string" ? p.branch : null;\n        if (typeof p.folder === "string") {\n          const normalized = normalizeFolderInput(p.folder);\n          setGhFolderDisplay(normalized.display);\n        }\n        if (ghFilenameInput) {\n          if (typeof p.filename === "string" && p.filename.trim()) {\n            ghFilenameInput.value = p.filename;\n          } else if (!ghFilenameInput.value) {\n            ghFilenameInput.value = DEFAULT_GITHUB_FILENAME;\n          }\n        }\n        refreshFilenameValidation();\n        if (typeof p.commitMessage === "string" && ghCommitMsgInput) {\n          ghCommitMsgInput.value = p.commitMessage;\n        }\n        if (typeof p.scope === "string") {\n          if (p.scope === "all" && ghScopeAll) ghScopeAll.checked = true;\n          if (p.scope === "selected" && ghScopeSelected) ghScopeSelected.checked = true;\n          if (p.scope === "typography" && ghScopeTypography) ghScopeTypography.checked = true;\n        }\n        const styleDictChk = pickStyleDictionaryCheckbox();\n        if (styleDictChk && typeof p.styleDictionary === "boolean") {\n          styleDictChk.checked = p.styleDictionary;\n        }\n        const flatChk = pickFlatTokensCheckbox();\n        if (flatChk && typeof p.flatTokens === "boolean") {\n          flatChk.checked = p.flatTokens;\n        }\n        if (typeof p.createPr === "boolean" && ghCreatePrChk) {\n          ghCreatePrChk.checked = p.createPr;\n          if (ghPrOptionsEl) ghPrOptionsEl.style.display = p.createPr ? "flex" : "none";\n        }\n        if (typeof p.prTitle === "string" && ghPrTitleInput) ghPrTitleInput.value = p.prTitle;\n        if (typeof p.prBody === "string" && ghPrBodyInput) ghPrBodyInput.value = p.prBody;\n        updateExportCommitEnabled();\n        updateFetchButtonEnabled();\n        return true;\n      }\n      if (msg.type === "GITHUB_BRANCHES") {\n        const pl = msg.payload || {};\n        const owner = String(pl.owner || "");\n        const repo = String(pl.repo || "");\n        if (owner !== currentOwner || repo !== currentRepo) return true;\n        lastBranchesFetchedAtMs = Date.now();\n        loadedPages = Number(pl.page || 1);\n        hasMorePages = !!pl.hasMore;\n        isFetchingBranches = false;\n        if (typeof pl.defaultBranch === "string" && !defaultBranchFromApi) {\n          defaultBranchFromApi = pl.defaultBranch;\n        }\n        if (ghNewBranchBtn) ghNewBranchBtn.disabled = false;\n        const names = Array.isArray(pl.branches) ? pl.branches.map((b) => b.name) : [];\n        const set = new Set(allBranches);\n        for (const n of names) if (n) set.add(n);\n        allBranches = Array.from(set).sort((a, b) => a.localeCompare(b));\n        applyBranchFilter();\n        setBranchDisabled(false);\n        updateFolderControlsEnabled();\n        const rate = pl.rate;\n        if (rate && typeof rate.remaining === "number" && rate.remaining <= 3 && typeof rate.resetEpochSec === "number") {\n          const t = new Date(rate.resetEpochSec * 1e3).toLocaleTimeString();\n          deps.log(`GitHub: near rate limit; resets ~${t}`);\n        }\n        deps.log(`Loaded ${names.length} branches (page ${loadedPages}) for ${repo}${hasMorePages ? "\\u2026" : ""}`);\n        return true;\n      }\n      if (msg.type === "GITHUB_BRANCHES_ERROR") {\n        const pl = msg.payload || {};\n        const owner = String(pl.owner || "");\n        const repo = String(pl.repo || "");\n        if (owner !== currentOwner || repo !== currentRepo) return true;\n        isFetchingBranches = false;\n        setBranchDisabled(false);\n        updateFolderControlsEnabled();\n        deps.log(`Branch load failed (status ${pl.status}): ${pl.message || "unknown error"}`);\n        if (pl.samlRequired) deps.log("This org requires SSO. Open the repo in your browser and authorize SSO for your token.");\n        if (pl.rate && typeof pl.rate.resetEpochSec === "number") {\n          const t = new Date(pl.rate.resetEpochSec * 1e3).toLocaleTimeString();\n          deps.log(`Rate limit issue; resets ~${t}`);\n        }\n        return true;\n      }\n      if (msg.type === "GITHUB_CREATE_BRANCH_RESULT") {\n        const pl = msg.payload || {};\n        if (ghCreateBranchConfirmBtn) ghCreateBranchConfirmBtn.disabled = false;\n        if (typeof pl.ok !== "boolean") return true;\n        if (pl.ok) {\n          const baseBranch = String(pl.baseBranch || "");\n          const newBranch = String(pl.newBranch || "");\n          const url = String(pl.html_url || "");\n          if (newBranch) {\n            const s = new Set(allBranches);\n            if (!s.has(newBranch)) {\n              s.add(newBranch);\n              allBranches = Array.from(s).sort((a, b) => a.localeCompare(b));\n            }\n            desiredBranch = newBranch;\n            if (ghBranchInput) {\n              ghBranchInput.value = newBranch;\n              branchLastQuery = newBranch;\n              branchInputPristine = false;\n            }\n            applyBranchFilter();\n          }\n          updateFolderControlsEnabled();\n          showNewBranchRow(false);\n          if (ghNewBranchName) ghNewBranchName.value = "";\n          if (url) {\n            deps.log(`Branch created: ${newBranch} (from ${baseBranch})`);\n            const logEl2 = deps.getLogElement();\n            if (logEl2 && doc) {\n              const wrap = doc.createElement("div");\n              const a = doc.createElement("a");\n              a.href = url;\n              a.target = "_blank";\n              a.textContent = "View on GitHub";\n              wrap.appendChild(a);\n              logEl2.appendChild(wrap);\n              logEl2.scrollTop = logEl2.scrollHeight;\n            }\n          } else {\n            deps.log(`Branch created: ${newBranch} (from ${baseBranch})`);\n          }\n          return true;\n        }\n        const status = (_c = pl.status) != null ? _c : 0;\n        const message = pl.message || "unknown error";\n        deps.log(`Create branch failed (status ${status}): ${message}`);\n        if (pl.samlRequired) {\n          deps.log("This org requires SSO. Open the repo in your browser and authorize SSO for your token.");\n        } else if (status === 403) {\n          if (pl.noPushPermission) {\n            deps.log("You do not have push permission to this repository. Ask a maintainer for write access.");\n          } else {\n            deps.log("Likely a token permission issue:");\n            deps.log(\'\\u2022 Classic PAT: add the "repo" scope (or "public_repo" for public repos).\');\n            deps.log(\'\\u2022 Fine-grained PAT: grant this repository and set "Contents: Read and write".\');\n          }\n        }\n        if (pl.rate && typeof pl.rate.resetEpochSec === "number") {\n          const t = new Date(pl.rate.resetEpochSec * 1e3).toLocaleTimeString();\n          deps.log(`Rate limit issue; resets ~${t}`);\n        }\n        return true;\n      }\n      if (msg.type === "GITHUB_FOLDER_LIST_RESULT") {\n        const pl = msg.payload || {};\n        const path = String(pl.path || "").replace(/^\\/+|\\/+$/g, "");\n        const ok = !!pl.ok;\n        const entries = Array.isArray(pl.entries) ? pl.entries : [];\n        const message = String(pl.message || "");\n        for (let i = 0; i < folderListWaiters.length; i++) {\n          if (folderListWaiters[i].path === path) {\n            const waiter = folderListWaiters.splice(i, 1)[0];\n            if (ok) waiter.resolve({ ok: true, entries });\n            else waiter.reject({\n              ok: false,\n              message: message || `HTTP ${pl.status || 0}`,\n              status: typeof pl.status === "number" ? pl.status : void 0\n            });\n            break;\n          }\n        }\n        return true;\n      }\n      if (msg.type === "GITHUB_CREATE_FOLDER_RESULT") {\n        const pl = msg.payload || {};\n        const fp = String(pl.folderPath || "").replace(/^\\/+|\\/+$/g, "");\n        const ok = !!pl.ok;\n        const message = String(pl.message || "");\n        for (let i = 0; i < folderCreateWaiters.length; i++) {\n          if (folderCreateWaiters[i].folderPath === fp) {\n            const waiter = folderCreateWaiters.splice(i, 1)[0];\n            if (ok) waiter.resolve({ ok: true });\n            else waiter.reject({ ok: false, message: message || `HTTP ${pl.status || 0}`, status: pl.status });\n            break;\n          }\n        }\n        return true;\n      }\n      if (msg.type === "GITHUB_COMMIT_RESULT") {\n        if (msg.payload.ok) {\n          const url = String(msg.payload.commitUrl || "");\n          const branch = msg.payload.branch || "";\n          const destination = formatDestinationForLog(msg.payload.folder, msg.payload.filename);\n          const committedPath = msg.payload.fullPath || destination;\n          deps.log(`Commit succeeded (${branch}): ${url || "(no URL)"}`);\n          deps.log(`Committed ${committedPath}`);\n          if (url) {\n            const logEl2 = deps.getLogElement();\n            if (logEl2 && doc) {\n              const wrap = doc.createElement("div");\n              const a = doc.createElement("a");\n              a.href = url;\n              a.target = "_blank";\n              a.textContent = "View commit";\n              wrap.appendChild(a);\n              logEl2.appendChild(wrap);\n              logEl2.scrollTop = logEl2.scrollHeight;\n            }\n          }\n          if (msg.payload.createdPr) {\n            const pr = msg.payload.createdPr;\n            deps.log(`PR prepared (#${pr.number}) from ${pr.head} \\u2192 ${pr.base}`);\n          }\n        } else {\n          const status = typeof msg.payload.status === "number" ? msg.payload.status : 0;\n          const message = msg.payload.message || "unknown error";\n          const destination = formatDestinationForLog(msg.payload.folder, msg.payload.filename);\n          const committedPath = msg.payload.fullPath || destination;\n          if (status === 304) {\n            deps.log(`Commit skipped: ${message} (${committedPath})`);\n          } else {\n            deps.log(`Commit failed (${status}): ${message} (${committedPath})`);\n          }\n        }\n        return true;\n      }\n      if (msg.type === "GITHUB_PR_RESULT") {\n        if (msg.payload.ok) {\n          deps.log(`PR created: #${msg.payload.number} (${msg.payload.head} \\u2192 ${msg.payload.base})`);\n          const url = msg.payload.url;\n          if (url) {\n            const logEl2 = deps.getLogElement();\n            if (logEl2 && doc) {\n              const wrap = doc.createElement("div");\n              const a = doc.createElement("a");\n              a.href = url;\n              a.target = "_blank";\n              a.textContent = "View PR";\n              wrap.appendChild(a);\n              logEl2.appendChild(wrap);\n              logEl2.scrollTop = logEl2.scrollHeight;\n            }\n          }\n        } else {\n          deps.log(`PR creation failed (${msg.payload.status || 0}): ${msg.payload.message || "unknown error"}`);\n        }\n        return true;\n      }\n      if (msg.type === "GITHUB_FETCH_TOKENS_RESULT") {\n        ghImportInFlight = false;\n        if (msg.payload.ok) {\n          deps.log(`Imported tokens from ${msg.payload.path} (${msg.payload.branch})`);\n          const branch = String(msg.payload.branch || "");\n          const path = String(msg.payload.path || "");\n          lastImportTarget = { branch, path };\n          setImportStatus("success", `Imported tokens from ${branch}:${path}.`);\n        } else {\n          deps.log(`GitHub fetch failed (${msg.payload.status || 0}): ${msg.payload.message || "unknown error"}`);\n          const status = typeof msg.payload.status === "number" ? msg.payload.status : 0;\n          const message = msg.payload.message || "Unknown error";\n          const branch = String(msg.payload.branch || "");\n          const path = String(msg.payload.path || "");\n          lastImportTarget = { branch, path };\n          setImportStatus("error", `GitHub import failed (${status}): ${message}`);\n        }\n        updateFetchButtonEnabled();\n        return true;\n      }\n      return false;\n    }\n    function onSelectionChange() {\n      updateExportCommitEnabled();\n    }\n    function onCollectionsData() {\n      ghCollectionsRefreshing = false;\n      updateExportCommitEnabled();\n    }\n    function applyRememberPrefFromPlugin(pref) {\n      updateRememberPref(pref, false);\n    }\n    return {\n      attach,\n      handleMessage,\n      onSelectionChange,\n      onCollectionsData,\n      setRememberPref: applyRememberPrefFromPlugin\n    };\n  }\n\n  // src/app/ui.ts\n  var logEl = null;\n  var rawEl = null;\n  var exportAllChk = null;\n  var collectionSelect = null;\n  var modeSelect = null;\n  var fileInput = null;\n  var importBtn = null;\n  var exportBtn = null;\n  var exportTypographyBtn = null;\n  var exportPickers = null;\n  var refreshBtn = null;\n  var shellEl = null;\n  var drawerToggleBtn = null;\n  var resizeHandleEl = null;\n  var w3cPreviewEl = null;\n  var copyRawBtn = null;\n  var copyW3cBtn = null;\n  var copyLogBtn = null;\n  var allowHexChk = null;\n  var styleDictionaryChk = null;\n  var flatTokensChk = null;\n  var githubRememberChk = null;\n  var importScopeOverlay = null;\n  var importScopeBody = null;\n  var importScopeConfirmBtn = null;\n  var importScopeCancelBtn = null;\n  var importScopeRememberChk = null;\n  var importScopeMissingEl = null;\n  var importScopeSummaryEl = null;\n  var importScopeSummaryTextEl = null;\n  var importScopeClearBtn = null;\n  var importSkipLogListEl = null;\n  var importSkipLogEmptyEl = null;\n  var IMPORT_PREF_KEY = "dtcg.importPreference.v1";\n  var IMPORT_LOG_KEY = "dtcg.importLog.v1";\n  var importPreference = null;\n  var importLogEntries = [];\n  var importScopeModalState = null;\n  var lastImportSelection = [];\n  var systemDarkMode = false;\n  function applyTheme() {\n    const effective = systemDarkMode ? "dark" : "light";\n    if (effective === "light") {\n      document.documentElement.setAttribute("data-theme", "light");\n    } else {\n      document.documentElement.removeAttribute("data-theme");\n    }\n  }\n  function prettyExportName(original) {\n    const name = original && typeof original === "string" ? original : "tokens.json";\n    const m = name.match(/^(.*)_mode=(.*)\\.tokens\\.json$/);\n    if (m) {\n      const collection = m[1].trim();\n      const mode = m[2].trim();\n      return `${collection} - ${mode}.json`;\n    }\n    return name.endsWith(".json") ? name : name + ".json";\n  }\n  var pendingSave = null;\n  function supportsFilePicker() {\n    return typeof window.showSaveFilePicker === "function";\n  }\n  async function beginPendingSave(suggestedName) {\n    try {\n      if (!supportsFilePicker()) return false;\n      const handle = await window.showSaveFilePicker({\n        suggestedName,\n        types: [{ description: "JSON", accept: { "application/json": [".json"] } }]\n      });\n      const writable = await handle.createWritable();\n      pendingSave = { writable, name: suggestedName };\n      return true;\n    } catch (e) {\n      pendingSave = null;\n      return false;\n    }\n  }\n  async function finishPendingSave(text) {\n    if (!pendingSave) return false;\n    try {\n      await pendingSave.writable.write(new Blob([text], { type: "application/json" }));\n      await pendingSave.writable.close();\n      return true;\n    } catch (e) {\n      try {\n        await pendingSave.writable.close();\n      } catch (e2) {\n      }\n      return false;\n    } finally {\n      pendingSave = null;\n    }\n  }\n  function triggerJsonDownload(filename, text) {\n    try {\n      const blob = new Blob([text], { type: "application/json" });\n      const url = URL.createObjectURL(blob);\n      const a = document.createElement("a");\n      a.href = url;\n      a.download = filename;\n      a.style.position = "absolute";\n      a.style.left = "-9999px";\n      document.body.appendChild(a);\n      a.click();\n      setTimeout(() => {\n        URL.revokeObjectURL(url);\n        a.remove();\n      }, 0);\n    } catch (e) {\n    }\n  }\n  function copyElText(el, label) {\n    var _a;\n    if (!el) return;\n    try {\n      const text = (_a = el.textContent) != null ? _a : "";\n      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {\n        navigator.clipboard.writeText(text).then(() => {\n          log(`Copied ${label} to clipboard.`);\n        }).catch(() => {\n          throw new Error("clipboard write failed");\n        });\n        return;\n      }\n      const ta = document.createElement("textarea");\n      ta.value = text;\n      ta.style.position = "fixed";\n      ta.style.opacity = "0";\n      document.body.appendChild(ta);\n      ta.select();\n      ta.setSelectionRange(0, ta.value.length);\n      const ok = document.execCommand("copy");\n      document.body.removeChild(ta);\n      if (ok) log(`Copied ${label} to clipboard (${text.length} chars).`);\n      else throw new Error("execCommand(copy) returned false");\n    } catch (e) {\n      log(`Could not copy ${label}.`);\n    }\n  }\n  function normalizeContextList(list) {\n    var _a;\n    const seen = /* @__PURE__ */ new Set();\n    const out = [];\n    for (let i = 0; i < list.length; i++) {\n      const raw = String((_a = list[i]) != null ? _a : "").trim();\n      if (!raw) continue;\n      if (seen.has(raw)) continue;\n      seen.add(raw);\n      out.push(raw);\n    }\n    out.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);\n    return out;\n  }\n  function contextsEqual(a, b) {\n    if (a.length !== b.length) return false;\n    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;\n    return true;\n  }\n  function saveImportPreference() {\n    var _a, _b;\n    if (!importPreference || importPreference.contexts.length === 0) {\n      try {\n        (_a = window.localStorage) == null ? void 0 : _a.removeItem(IMPORT_PREF_KEY);\n      } catch (e) {\n      }\n      return;\n    }\n    try {\n      (_b = window.localStorage) == null ? void 0 : _b.setItem(IMPORT_PREF_KEY, JSON.stringify(importPreference));\n    } catch (e) {\n    }\n  }\n  function loadImportPreference() {\n    var _a;\n    importPreference = null;\n    try {\n      const raw = (_a = window.localStorage) == null ? void 0 : _a.getItem(IMPORT_PREF_KEY);\n      if (!raw) return;\n      const parsed = JSON.parse(raw);\n      if (!parsed || typeof parsed !== "object") return;\n      const ctxs = Array.isArray(parsed.contexts) ? normalizeContextList(parsed.contexts) : [];\n      const ts = typeof parsed.updatedAt === "number" ? Number(parsed.updatedAt) : Date.now();\n      if (ctxs.length > 0) importPreference = { contexts: ctxs, updatedAt: ts };\n    } catch (e) {\n      importPreference = null;\n    }\n  }\n  function setImportPreference(contexts) {\n    const normalized = normalizeContextList(contexts);\n    if (normalized.length === 0) {\n      clearImportPreference(false);\n      return;\n    }\n    const same = importPreference && contextsEqual(importPreference.contexts, normalized);\n    importPreference = { contexts: normalized, updatedAt: Date.now() };\n    saveImportPreference();\n    renderImportPreferenceSummary();\n    if (!same) log("Remembered import selection for future imports.");\n  }\n  function clearImportPreference(logChange) {\n    var _a;\n    if (!importPreference) return;\n    importPreference = null;\n    try {\n      (_a = window.localStorage) == null ? void 0 : _a.removeItem(IMPORT_PREF_KEY);\n    } catch (e) {\n    }\n    renderImportPreferenceSummary();\n    if (logChange) log("Cleared remembered import selection. Next import will prompt for modes.");\n  }\n  function formatContextList(contexts) {\n    const normalized = normalizeContextList(contexts);\n    if (normalized.length === 0) return "All contexts";\n    const grouped = /* @__PURE__ */ new Map();\n    for (let i = 0; i < normalized.length; i++) {\n      const ctx = normalized[i];\n      const slash = ctx.indexOf("/");\n      const collection = slash >= 0 ? ctx.slice(0, slash) : ctx;\n      const mode = slash >= 0 ? ctx.slice(slash + 1) : "Mode 1";\n      const coll = collection ? collection : "Tokens";\n      const modes = grouped.get(coll) || [];\n      if (!grouped.has(coll)) grouped.set(coll, modes);\n      if (!modes.includes(mode)) modes.push(mode);\n    }\n    const parts = [];\n    const collections = Array.from(grouped.keys()).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);\n    for (let i = 0; i < collections.length; i++) {\n      const coll = collections[i];\n      const modes = grouped.get(coll) || [];\n      modes.sort((a, b) => a < b ? -1 : a > b ? 1 : 0);\n      parts.push(`${coll} (${modes.join(", ")})`);\n    }\n    return parts.join("; ");\n  }\n  function renderImportPreferenceSummary() {\n    if (!importScopeSummaryEl || !importScopeSummaryTextEl) return;\n    const hasPref = !!importPreference && importPreference.contexts.length > 0;\n    if (importScopeClearBtn) importScopeClearBtn.disabled = !hasPref;\n    if (!hasPref) {\n      importScopeSummaryEl.hidden = true;\n      return;\n    }\n    importScopeSummaryEl.hidden = false;\n    const when = new Date(importPreference.updatedAt).toLocaleString();\n    importScopeSummaryTextEl.textContent = `Remembered import scope (${when}): ${formatContextList(importPreference.contexts)}.`;\n  }\n  function saveImportLog() {\n    var _a;\n    try {\n      (_a = window.localStorage) == null ? void 0 : _a.setItem(IMPORT_LOG_KEY, JSON.stringify(importLogEntries));\n    } catch (e) {\n    }\n  }\n  function loadImportLog() {\n    var _a;\n    importLogEntries = [];\n    try {\n      const raw = (_a = window.localStorage) == null ? void 0 : _a.getItem(IMPORT_LOG_KEY);\n      if (!raw) return;\n      const parsed = JSON.parse(raw);\n      if (!Array.isArray(parsed)) return;\n      for (let i = 0; i < parsed.length; i++) {\n        const entry = parsed[i];\n        if (!entry || typeof entry !== "object") continue;\n        const timestamp = typeof entry.timestamp === "number" ? Number(entry.timestamp) : null;\n        const summary = entry.summary;\n        const source = entry.source === "github" ? "github" : entry.source === "local" ? "local" : void 0;\n        if (!timestamp || !summary || typeof summary !== "object") continue;\n        if (!Array.isArray(summary.appliedContexts) || !Array.isArray(summary.availableContexts)) continue;\n        if (!Array.isArray(summary.tokensWithRemovedContexts)) {\n          summary.tokensWithRemovedContexts = [];\n        }\n        if (!Array.isArray(summary.skippedContexts)) {\n          summary.skippedContexts = [];\n        }\n        if (!Array.isArray(summary.missingRequestedContexts)) {\n          summary.missingRequestedContexts = [];\n        }\n        if (typeof summary.createdStyles !== "number" || !isFinite(summary.createdStyles)) {\n          summary.createdStyles = 0;\n        }\n        importLogEntries.push({ timestamp, summary, source });\n      }\n      importLogEntries.sort((a, b) => a.timestamp - b.timestamp);\n    } catch (e) {\n      importLogEntries = [];\n    }\n  }\n  function renderImportLog() {\n    if (!(importSkipLogListEl && importSkipLogEmptyEl)) return;\n    importSkipLogListEl.innerHTML = "";\n    if (!importLogEntries || importLogEntries.length === 0) {\n      importSkipLogEmptyEl.hidden = false;\n      return;\n    }\n    importSkipLogEmptyEl.hidden = true;\n    for (let idx = importLogEntries.length - 1; idx >= 0; idx--) {\n      const entry = importLogEntries[idx];\n      const container = document.createElement("div");\n      container.className = "import-skip-log-entry";\n      const header = document.createElement("div");\n      header.className = "import-skip-log-entry-header";\n      const label = entry.source === "github" ? "GitHub import" : "Manual import";\n      header.textContent = `${label} \\u2022 ${new Date(entry.timestamp).toLocaleString()}`;\n      container.appendChild(header);\n      const stats = document.createElement("div");\n      stats.className = "import-skip-log-entry-stats";\n      const tokensText = `Imported ${entry.summary.importedTokens} of ${entry.summary.totalTokens} tokens.`;\n      const stylesCreated = typeof entry.summary.createdStyles === "number" ? entry.summary.createdStyles : void 0;\n      if (typeof stylesCreated === "number") {\n        const stylesLabel = stylesCreated === 1 ? "style" : "styles";\n        stats.textContent = `${tokensText} ${stylesCreated} ${stylesLabel} created.`;\n      } else {\n        stats.textContent = tokensText;\n      }\n      container.appendChild(stats);\n      const contextsLine = document.createElement("div");\n      contextsLine.className = "import-skip-log-entry-contexts";\n      contextsLine.textContent = "Applied: " + formatContextList(entry.summary.appliedContexts);\n      container.appendChild(contextsLine);\n      if (entry.summary.skippedContexts.length > 0) {\n        const skippedLine = document.createElement("div");\n        skippedLine.className = "import-skip-log-entry-contexts";\n        skippedLine.textContent = "Skipped modes: " + formatContextList(entry.summary.skippedContexts.map((s) => s.context));\n        container.appendChild(skippedLine);\n      }\n      if (entry.summary.missingRequestedContexts.length > 0) {\n        const missingLine = document.createElement("div");\n        missingLine.className = "import-skip-log-entry-note";\n        missingLine.textContent = "Not found in file: " + formatContextList(entry.summary.missingRequestedContexts);\n        container.appendChild(missingLine);\n      }\n      if (entry.summary.selectionFallbackToAll) {\n        const fallbackLine = document.createElement("div");\n        fallbackLine.className = "import-skip-log-entry-note";\n        fallbackLine.textContent = "Requested modes were missing; imported all contexts instead.";\n        container.appendChild(fallbackLine);\n      }\n      if (entry.summary.tokensWithRemovedContexts.length > 0) {\n        const tokenList = document.createElement("ul");\n        tokenList.className = "import-skip-log-token-list";\n        const maxTokens = Math.min(entry.summary.tokensWithRemovedContexts.length, 10);\n        for (let t = 0; t < maxTokens; t++) {\n          const tok = entry.summary.tokensWithRemovedContexts[t];\n          const li = document.createElement("li");\n          const removedLabel = tok.removedContexts.length > 0 ? formatContextList(tok.removedContexts) : "none";\n          const keptLabel = tok.keptContexts.length > 0 ? formatContextList(tok.keptContexts) : "";\n          li.textContent = `${tok.path} \\u2014 skipped ${removedLabel}${keptLabel ? "; kept " + keptLabel : ""}`;\n          tokenList.appendChild(li);\n        }\n        if (entry.summary.tokensWithRemovedContexts.length > maxTokens) {\n          const more = document.createElement("li");\n          more.textContent = `\\u2026and ${entry.summary.tokensWithRemovedContexts.length - maxTokens} more token(s).`;\n          tokenList.appendChild(more);\n        }\n        container.appendChild(tokenList);\n      }\n      if (entry.summary.skippedContexts.length > 0 && importPreference && importPreference.contexts.length > 0) {\n        const tip = document.createElement("div");\n        tip.className = "import-skip-log-entry-note";\n        tip.textContent = "Tip: Clear the remembered import selection to restore skipped modes.";\n        container.appendChild(tip);\n      }\n      importSkipLogListEl.appendChild(container);\n    }\n  }\n  function addImportLogEntry(entry) {\n    importLogEntries.push(entry);\n    if (importLogEntries.length > 10) {\n      importLogEntries = importLogEntries.slice(importLogEntries.length - 10);\n    }\n    saveImportLog();\n    renderImportLog();\n  }\n  function collectContextsFromJson(root) {\n    const grouped = /* @__PURE__ */ new Map();\n    function visit(node, path) {\n      if (Array.isArray(node)) {\n        for (let i = 0; i < node.length; i++) visit(node[i], path);\n        return;\n      }\n      if (!node || typeof node !== "object") return;\n      const obj = node;\n      if (Object.prototype.hasOwnProperty.call(obj, "$value")) {\n        const rawCollection = path[0] ? String(path[0]).trim() : "Tokens";\n        let mode = "Mode 1";\n        try {\n          const ext = obj["$extensions"];\n          if (ext && typeof ext === "object") {\n            const cf = ext["com.figma"];\n            if (cf && typeof cf === "object" && typeof cf.modeName === "string") {\n              const candidate = String(cf.modeName).trim();\n              if (candidate) mode = candidate;\n            }\n          }\n        } catch (e) {\n        }\n        const collection = rawCollection ? rawCollection : "Tokens";\n        const set = grouped.get(collection) || /* @__PURE__ */ new Set();\n        if (!grouped.has(collection)) grouped.set(collection, set);\n        set.add(mode);\n        return;\n      }\n      for (const key in obj) {\n        if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;\n        if (key.startsWith("$")) continue;\n        visit(obj[key], path.concat(String(key)));\n      }\n    }\n    visit(root, []);\n    const options = [];\n    const collections = Array.from(grouped.keys()).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);\n    for (let i = 0; i < collections.length; i++) {\n      const collection = collections[i];\n      const modes = Array.from(grouped.get(collection) || []).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);\n      for (let j = 0; j < modes.length; j++) {\n        const mode = modes[j];\n        options.push({ context: `${collection}/${mode}`, collection, mode });\n      }\n    }\n    return options;\n  }\n  function updateImportScopeConfirmState() {\n    if (!importScopeModalState) return;\n    const state = importScopeModalState;\n    let allCollectionsSelected = true;\n    for (let i = 0; i < state.collections.length; i++) {\n      const collection = state.collections[i];\n      const inputs = state.inputsByCollection.get(collection) || [];\n      if (!inputs.some((input) => input.checked)) {\n        allCollectionsSelected = false;\n        break;\n      }\n    }\n    if (importScopeConfirmBtn) {\n      importScopeConfirmBtn.disabled = !allCollectionsSelected;\n      const label = state.collections.length > 1 ? "Import selected modes" : "Import selected mode";\n      importScopeConfirmBtn.textContent = label;\n    }\n  }\n  var importScopeKeyListenerAttached = false;\n  function handleImportScopeKeydown(ev) {\n    if (ev.key === "Escape") {\n      ev.preventDefault();\n      closeImportScopeModal();\n    }\n  }\n  function openImportScopeModal(opts) {\n    var _a;\n    if (!importScopeOverlay || !importScopeBody || !importScopeConfirmBtn || !importScopeCancelBtn) {\n      opts.onConfirm(opts.initialSelection, opts.rememberInitially);\n      return;\n    }\n    importScopeBody.innerHTML = "";\n    const grouped = /* @__PURE__ */ new Map();\n    for (let i = 0; i < opts.options.length; i++) {\n      const option = opts.options[i];\n      const list = grouped.get(option.collection) || [];\n      if (!grouped.has(option.collection)) grouped.set(option.collection, list);\n      list.push(option);\n    }\n    const collections = Array.from(grouped.keys()).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);\n    importScopeModalState = {\n      options: opts.options,\n      collections,\n      inputs: [],\n      inputsByCollection: /* @__PURE__ */ new Map(),\n      onConfirm: opts.onConfirm\n    };\n    const initialSelectionsByCollection = /* @__PURE__ */ new Map();\n    for (let i = 0; i < opts.initialSelection.length; i++) {\n      const ctx = opts.initialSelection[i];\n      const match = opts.options.find((opt) => opt.context === ctx);\n      if (match) initialSelectionsByCollection.set(match.collection, match.context);\n    }\n    for (let i = 0; i < collections.length; i++) {\n      const collection = collections[i];\n      const groupEl = document.createElement("div");\n      groupEl.className = "import-scope-group";\n      const heading = document.createElement("h3");\n      heading.textContent = collection;\n      groupEl.appendChild(heading);\n      const modes = (grouped.get(collection) || []).sort((a, b) => a.mode < b.mode ? -1 : a.mode > b.mode ? 1 : 0);\n      const defaultContext = initialSelectionsByCollection.get(collection) || ((_a = modes[0]) == null ? void 0 : _a.context) || null;\n      const radioName = `importScopeMode_${i}`;\n      for (let j = 0; j < modes.length; j++) {\n        const opt = modes[j];\n        const label = document.createElement("label");\n        label.className = "import-scope-mode";\n        const radio = document.createElement("input");\n        radio.type = "radio";\n        radio.name = radioName;\n        radio.value = opt.context;\n        radio.checked = defaultContext === opt.context;\n        radio.addEventListener("change", updateImportScopeConfirmState);\n        importScopeModalState.inputs.push(radio);\n        const list = importScopeModalState.inputsByCollection.get(collection) || [];\n        if (!importScopeModalState.inputsByCollection.has(collection)) {\n          importScopeModalState.inputsByCollection.set(collection, list);\n        }\n        list.push(radio);\n        const span = document.createElement("span");\n        span.textContent = opt.mode;\n        label.appendChild(radio);\n        label.appendChild(span);\n        groupEl.appendChild(label);\n      }\n      importScopeBody.appendChild(groupEl);\n    }\n    if (importScopeRememberChk) importScopeRememberChk.checked = opts.rememberInitially;\n    if (importScopeMissingEl) {\n      if (opts.missingPreferred.length > 0) {\n        importScopeMissingEl.hidden = false;\n        importScopeMissingEl.textContent = "Previously remembered modes not present in this file: " + formatContextList(opts.missingPreferred);\n      } else {\n        importScopeMissingEl.hidden = true;\n        importScopeMissingEl.textContent = "";\n      }\n    }\n    updateImportScopeConfirmState();\n    importScopeOverlay.hidden = false;\n    importScopeOverlay.classList.add("is-open");\n    importScopeOverlay.setAttribute("aria-hidden", "false");\n    if (!importScopeKeyListenerAttached) {\n      window.addEventListener("keydown", handleImportScopeKeydown, true);\n      importScopeKeyListenerAttached = true;\n    }\n    if (importScopeConfirmBtn) importScopeConfirmBtn.focus();\n  }\n  function closeImportScopeModal() {\n    if (!importScopeOverlay) return;\n    importScopeOverlay.classList.remove("is-open");\n    importScopeOverlay.hidden = true;\n    importScopeOverlay.setAttribute("aria-hidden", "true");\n    if (importScopeKeyListenerAttached) {\n      window.removeEventListener("keydown", handleImportScopeKeydown, true);\n      importScopeKeyListenerAttached = false;\n    }\n    importScopeModalState = null;\n  }\n  function performImport(json, allowHex, contexts) {\n    const normalized = normalizeContextList(contexts);\n    const payload = normalized.length > 0 ? { type: "IMPORT_DTCG", payload: { json, allowHexStrings: allowHex, contexts: normalized } } : { type: "IMPORT_DTCG", payload: { json, allowHexStrings: allowHex } };\n    postToPlugin(payload);\n    lastImportSelection = normalized.slice();\n    const label = normalized.length > 0 ? formatContextList(normalized) : "all contexts";\n    log(`Import requested (${label}).`);\n  }\n  function startImportFlow(json, allowHex) {\n    const options = collectContextsFromJson(json);\n    if (options.length === 0) {\n      performImport(json, allowHex, []);\n      return;\n    }\n    const grouped = /* @__PURE__ */ new Map();\n    for (let i = 0; i < options.length; i++) {\n      const option = options[i];\n      const list = grouped.get(option.collection) || [];\n      if (!grouped.has(option.collection)) grouped.set(option.collection, list);\n      list.push(option);\n    }\n    const availableSet = new Set(options.map((opt) => opt.context));\n    const missingPreferred = [];\n    let rememberInitially = false;\n    const initialSelectionsByCollection = /* @__PURE__ */ new Map();\n    if (importPreference && importPreference.contexts.length > 0) {\n      for (let i = 0; i < importPreference.contexts.length; i++) {\n        const ctx = importPreference.contexts[i];\n        if (availableSet.has(ctx)) {\n          const match = options.find((opt) => opt.context === ctx);\n          if (match) {\n            initialSelectionsByCollection.set(match.collection, match.context);\n            rememberInitially = true;\n          }\n        } else {\n          missingPreferred.push(ctx);\n        }\n      }\n    }\n    const collections = Array.from(grouped.keys()).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);\n    for (let i = 0; i < collections.length; i++) {\n      const collection = collections[i];\n      if (!initialSelectionsByCollection.has(collection)) {\n        const modes = (grouped.get(collection) || []).sort((a, b) => a.mode < b.mode ? -1 : a.mode > b.mode ? 1 : 0);\n        if (modes.length > 0) initialSelectionsByCollection.set(collection, modes[0].context);\n      }\n    }\n    const initialSelection = collections.map((collection) => initialSelectionsByCollection.get(collection)).filter((ctx) => typeof ctx === "string");\n    const requiresChoice = collections.some((collection) => {\n      const list = grouped.get(collection) || [];\n      return list.length > 1;\n    });\n    if (!requiresChoice) {\n      performImport(json, allowHex, initialSelection);\n      return;\n    }\n    openImportScopeModal({\n      options,\n      initialSelection,\n      rememberInitially,\n      missingPreferred,\n      onConfirm: (selected, remember) => {\n        if (remember) setImportPreference(selected);\n        else if (importPreference) clearImportPreference(true);\n        performImport(json, allowHex, selected);\n      }\n    });\n  }\n  function getPreferredImportContexts() {\n    if (importPreference && importPreference.contexts.length > 0) return importPreference.contexts.slice();\n    if (lastImportSelection.length > 0) return lastImportSelection.slice();\n    return [];\n  }\n  function postResize(width, height) {\n    const w = Math.max(720, Math.min(1600, Math.floor(width)));\n    const h = Math.max(420, Math.min(1200, Math.floor(height)));\n    postToPlugin({ type: "UI_RESIZE", payload: { width: w, height: h } });\n  }\n  var resizeTracking = null;\n  var resizeQueued = null;\n  var resizeRaf = 0;\n  function queueResize(width, height) {\n    resizeQueued = { width, height };\n    if (resizeRaf !== 0) return;\n    resizeRaf = window.requestAnimationFrame(() => {\n      resizeRaf = 0;\n      if (!resizeQueued) return;\n      postResize(resizeQueued.width, resizeQueued.height);\n      resizeQueued = null;\n    });\n  }\n  function applyResizeDelta(ev) {\n    if (!resizeTracking || ev.pointerId !== resizeTracking.pointerId) return;\n    const dx = ev.clientX - resizeTracking.startX;\n    const dy = ev.clientY - resizeTracking.startY;\n    const nextW = resizeTracking.startWidth + dx;\n    const nextH = resizeTracking.startHeight + dy;\n    queueResize(nextW, nextH);\n    ev.preventDefault();\n  }\n  function endResize(ev) {\n    if (!resizeTracking || ev.pointerId !== resizeTracking.pointerId) return;\n    applyResizeDelta(ev);\n    window.removeEventListener("pointermove", handleResizeMove, true);\n    window.removeEventListener("pointerup", endResize, true);\n    window.removeEventListener("pointercancel", cancelResize, true);\n    if (resizeHandleEl) {\n      try {\n        resizeHandleEl.releasePointerCapture(resizeTracking.pointerId);\n      } catch (e) {\n      }\n    }\n    resizeTracking = null;\n  }\n  function cancelResize(ev) {\n    if (!resizeTracking || ev.pointerId !== resizeTracking.pointerId) return;\n    window.removeEventListener("pointermove", handleResizeMove, true);\n    window.removeEventListener("pointerup", endResize, true);\n    window.removeEventListener("pointercancel", cancelResize, true);\n    if (resizeHandleEl) {\n      try {\n        resizeHandleEl.releasePointerCapture(resizeTracking.pointerId);\n      } catch (e) {\n      }\n    }\n    resizeTracking = null;\n  }\n  function handleResizeMove(ev) {\n    applyResizeDelta(ev);\n  }\n  function autoFitOnce() {\n    if (typeof document === "undefined") return;\n    const contentW = Math.max(\n      document.documentElement.scrollWidth,\n      document.body ? document.body.scrollWidth : 0\n    );\n    const contentH = Math.max(\n      document.documentElement.scrollHeight,\n      document.body ? document.body.scrollHeight : 0\n    );\n    const vw = window.innerWidth;\n    const vh = window.innerHeight;\n    const needsW = contentW > vw ? contentW : vw;\n    const needsH = contentH > vh ? contentH : vh;\n    if (needsW > vw || needsH > vh) postResize(needsW, needsH);\n  }\n  var currentCollections = [];\n  function log(msg) {\n    const t = (/* @__PURE__ */ new Date()).toLocaleTimeString();\n    const line = document.createElement("div");\n    line.textContent = "[" + t + "] " + msg;\n    if (logEl) {\n      logEl.appendChild(line);\n      logEl.scrollTop = logEl.scrollHeight;\n    }\n  }\n  function postToPlugin(message) {\n    parent.postMessage({ pluginMessage: message }, "*");\n  }\n  var githubUi = createGithubUi({\n    postToPlugin: (message) => postToPlugin(message),\n    log: (message) => log(message),\n    getLogElement: () => logEl,\n    getCollectionSelect: () => collectionSelect,\n    getModeSelect: () => modeSelect,\n    getAllowHexCheckbox: () => allowHexChk,\n    getStyleDictionaryCheckbox: () => styleDictionaryChk,\n    getFlatTokensCheckbox: () => flatTokensChk,\n    getImportContexts: () => getPreferredImportContexts()\n  });\n  function clearSelect(sel) {\n    while (sel.options.length > 0) sel.remove(0);\n  }\n  function setDisabledStates() {\n    if (importBtn && fileInput) {\n      const hasFile = !!(fileInput.files && fileInput.files.length > 0);\n      importBtn.disabled = !hasFile;\n    }\n    if (exportBtn && exportAllChk && collectionSelect && modeSelect && exportPickers) {\n      const exportAll = !!exportAllChk.checked;\n      if (exportAll) {\n        exportBtn.disabled = false;\n        exportPickers.style.opacity = "0.5";\n      } else {\n        exportPickers.style.opacity = "1";\n        const hasSelection = !!collectionSelect.value && !!modeSelect.value;\n        exportBtn.disabled = !hasSelection;\n      }\n    }\n    if (exportTypographyBtn) {\n      exportTypographyBtn.disabled = false;\n    }\n  }\n  function populateCollections(data) {\n    currentCollections = data.collections;\n    if (!(collectionSelect && modeSelect)) return;\n    clearSelect(collectionSelect);\n    for (let i = 0; i < data.collections.length; i++) {\n      const c = data.collections[i];\n      const opt = document.createElement("option");\n      opt.value = c.name;\n      opt.textContent = c.name;\n      collectionSelect.appendChild(opt);\n    }\n    onCollectionChange();\n  }\n  function onCollectionChange() {\n    if (!(collectionSelect && modeSelect)) return;\n    const selected = collectionSelect.value;\n    clearSelect(modeSelect);\n    let firstModeSet = false;\n    for (let i = 0; i < currentCollections.length; i++) {\n      const c = currentCollections[i];\n      if (c.name === selected) {\n        for (let j = 0; j < c.modes.length; j++) {\n          const m = c.modes[j];\n          const opt = document.createElement("option");\n          opt.value = m.name;\n          opt.textContent = m.name;\n          modeSelect.appendChild(opt);\n        }\n        if (modeSelect.options.length > 0 && modeSelect.selectedIndex === -1) {\n          modeSelect.selectedIndex = 0;\n          firstModeSet = true;\n        }\n        break;\n      }\n    }\n    setDisabledStates();\n    githubUi.onSelectionChange();\n    if (firstModeSet) requestPreviewForCurrent();\n  }\n  function applyLastSelection(last) {\n    if (!last || !(collectionSelect && modeSelect)) return;\n    let found = false;\n    for (let i = 0; i < collectionSelect.options.length; i++) {\n      if (collectionSelect.options[i].value === last.collection) {\n        collectionSelect.selectedIndex = i;\n        found = true;\n        break;\n      }\n    }\n    onCollectionChange();\n    if (found) {\n      for (let j = 0; j < modeSelect.options.length; j++) {\n        if (modeSelect.options[j].value === last.mode) {\n          modeSelect.selectedIndex = j;\n          break;\n        }\n      }\n    }\n    setDisabledStates();\n  }\n  function prettyJson(obj) {\n    try {\n      return JSON.stringify(obj, null, 2);\n    } catch (e) {\n      return String(obj);\n    }\n  }\n  function requestPreviewForCurrent() {\n    if (!(collectionSelect && modeSelect)) return;\n    const collection = collectionSelect.value || "";\n    const mode = modeSelect.value || "";\n    if (!collection || !mode) {\n      if (w3cPreviewEl) w3cPreviewEl.textContent = "{ /* select a collection & mode to preview */ }";\n      return;\n    }\n    const styleDictionary = !!(styleDictionaryChk && styleDictionaryChk.checked);\n    const flatTokens = !!(flatTokensChk && flatTokensChk.checked);\n    postToPlugin({\n      type: "PREVIEW_REQUEST",\n      payload: { collection, mode, styleDictionary, flatTokens }\n    });\n  }\n  window.addEventListener("message", async (event) => {\n    var _a, _b, _c, _d, _e;\n    const data = event.data;\n    if (!data || typeof data !== "object") return;\n    let msg = null;\n    if (data.pluginMessage && typeof data.pluginMessage === "object") {\n      const maybe = data.pluginMessage;\n      if (maybe && typeof maybe.type === "string") msg = maybe;\n    }\n    if (!msg) return;\n    if (msg.type === "ERROR") {\n      log("ERROR: " + ((_b = (_a = msg.payload) == null ? void 0 : _a.message) != null ? _b : ""));\n      return;\n    }\n    if (msg.type === "INFO") {\n      log((_d = (_c = msg.payload) == null ? void 0 : _c.message) != null ? _d : "");\n      return;\n    }\n    if (msg.type === "IMPORT_SUMMARY") {\n      const summary = msg.payload.summary;\n      if (summary && Array.isArray(summary.appliedContexts)) {\n        lastImportSelection = summary.appliedContexts.slice();\n      } else {\n        lastImportSelection = [];\n      }\n      addImportLogEntry({ timestamp: msg.payload.timestamp, source: msg.payload.source, summary });\n      renderImportPreferenceSummary();\n      return;\n    }\n    if (githubUi.handleMessage(msg)) return;\n    if (msg.type === "EXPORT_RESULT") {\n      const files = Array.isArray((_e = msg.payload) == null ? void 0 : _e.files) ? msg.payload.files : [];\n      if (files.length === 0) {\n        log("Nothing to export.");\n        return;\n      }\n      if (pendingSave && files.length === 1) {\n        const only = files[0];\n        const fname = prettyExportName(only == null ? void 0 : only.name);\n        const text = prettyJson(only == null ? void 0 : only.json);\n        const ok = await finishPendingSave(text);\n        if (ok) {\n          log("Saved " + fname + " via file picker.");\n          const div = document.createElement("div");\n          const link = document.createElement("a");\n          link.href = "#";\n          link.textContent = "Download " + fname + " again";\n          link.addEventListener("click", (e) => {\n            e.preventDefault();\n            triggerJsonDownload(fname, text);\n          });\n          if (logEl) {\n            div.appendChild(link);\n            logEl.appendChild(div);\n            logEl.scrollTop = logEl.scrollHeight;\n          }\n          log("Export ready.");\n          return;\n        }\n        log("Could not write via file picker; falling back to download links.");\n      }\n      setDrawerOpen(true);\n      for (let k = 0; k < files.length; k++) {\n        const f = files[k];\n        const fname = prettyExportName(f == null ? void 0 : f.name);\n        const text = prettyJson(f == null ? void 0 : f.json);\n        triggerJsonDownload(fname, text);\n        const div = document.createElement("div");\n        const link = document.createElement("a");\n        link.href = "#";\n        link.textContent = "Download " + fname;\n        link.addEventListener("click", (e) => {\n          e.preventDefault();\n          triggerJsonDownload(fname, text);\n        });\n        if (logEl) {\n          div.appendChild(link);\n          logEl.appendChild(div);\n          logEl.scrollTop = logEl.scrollHeight;\n        }\n      }\n      log("Export ready.");\n      return;\n    }\n    if (msg.type === "W3C_PREVIEW") {\n      const displayName = prettyExportName(msg.payload.name);\n      const header = `/* ${displayName} */\n`;\n      if (w3cPreviewEl) w3cPreviewEl.textContent = header + prettyJson(msg.payload.json);\n      return;\n    }\n    if (msg.type === "COLLECTIONS_DATA") {\n      githubUi.onCollectionsData();\n      populateCollections({ collections: msg.payload.collections });\n      if (exportAllChk) exportAllChk.checked = !!msg.payload.exportAllPref;\n      if (styleDictionaryChk && typeof msg.payload.styleDictionaryPref === "boolean") {\n        styleDictionaryChk.checked = !!msg.payload.styleDictionaryPref;\n      }\n      if (flatTokensChk && typeof msg.payload.flatTokensPref === "boolean") {\n        flatTokensChk.checked = !!msg.payload.flatTokensPref;\n      }\n      if (allowHexChk && typeof msg.payload.allowHexPref === "boolean") {\n        allowHexChk.checked = !!msg.payload.allowHexPref;\n      }\n      if (typeof msg.payload.githubRememberPref === "boolean") {\n        if (githubRememberChk) githubRememberChk.checked = msg.payload.githubRememberPref;\n      }\n      const last = msg.payload.last;\n      applyLastSelection(last);\n      setDisabledStates();\n      requestPreviewForCurrent();\n      return;\n    }\n    if (msg.type === "RAW_COLLECTIONS_TEXT") {\n      if (rawEl) rawEl.textContent = msg.payload.text;\n      return;\n    }\n  });\n  document.addEventListener("DOMContentLoaded", () => {\n    if (typeof document === "undefined") return;\n    logEl = document.getElementById("log");\n    rawEl = document.getElementById("raw");\n    exportAllChk = document.getElementById("exportAllChk");\n    collectionSelect = document.getElementById("collectionSelect");\n    modeSelect = document.getElementById("modeSelect");\n    fileInput = document.getElementById("file");\n    importBtn = document.getElementById("importBtn");\n    exportBtn = document.getElementById("exportBtn");\n    exportTypographyBtn = document.getElementById("exportTypographyBtn");\n    exportPickers = document.getElementById("exportPickers");\n    refreshBtn = document.getElementById("refreshBtn");\n    shellEl = document.querySelector(".shell");\n    drawerToggleBtn = document.getElementById("drawerToggleBtn");\n    resizeHandleEl = document.getElementById("resizeHandle");\n    w3cPreviewEl = document.getElementById("w3cPreview");\n    copyRawBtn = document.getElementById("copyRawBtn");\n    copyW3cBtn = document.getElementById("copyW3cBtn");\n    copyLogBtn = document.getElementById("copyLogBtn");\n    allowHexChk = document.getElementById("allowHexChk");\n    styleDictionaryChk = document.getElementById("styleDictionaryChk");\n    flatTokensChk = document.getElementById("flatTokensChk");\n    githubRememberChk = document.getElementById("githubRememberChk");\n    if (allowHexChk) {\n      allowHexChk.checked = true;\n      allowHexChk.addEventListener("change", () => {\n        postToPlugin({ type: "SAVE_PREFS", payload: { allowHexStrings: !!allowHexChk.checked } });\n      });\n    }\n    importScopeOverlay = document.getElementById("importScopeOverlay");\n    importScopeBody = document.getElementById("importScopeBody");\n    importScopeConfirmBtn = document.getElementById("importScopeConfirmBtn");\n    importScopeCancelBtn = document.getElementById("importScopeCancelBtn");\n    importScopeRememberChk = document.getElementById("importScopeRememberChk");\n    importScopeMissingEl = document.getElementById("importScopeMissingNotice");\n    importScopeSummaryEl = document.getElementById("importScopeSummary");\n    importScopeSummaryTextEl = document.getElementById("importScopeSummaryText");\n    importScopeClearBtn = document.getElementById("importScopeClearBtn");\n    importSkipLogListEl = document.getElementById("importSkipLogList");\n    importSkipLogEmptyEl = document.getElementById("importSkipLogEmpty");\n    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");\n    systemDarkMode = mediaQuery.matches;\n    mediaQuery.addEventListener("change", (e) => {\n      systemDarkMode = e.matches;\n      applyTheme();\n    });\n    applyTheme();\n    loadImportPreference();\n    loadImportLog();\n    renderImportPreferenceSummary();\n    renderImportLog();\n    if (importScopeClearBtn) {\n      importScopeClearBtn.addEventListener("click", () => clearImportPreference(true));\n    }\n    if (importScopeConfirmBtn) {\n      importScopeConfirmBtn.addEventListener("click", () => {\n        if (!importScopeModalState) {\n          closeImportScopeModal();\n          return;\n        }\n        const state = importScopeModalState;\n        const selections = [];\n        for (let i = 0; i < state.collections.length; i++) {\n          const collection = state.collections[i];\n          const inputs = state.inputsByCollection.get(collection) || [];\n          const selected = inputs.find((input) => input.checked);\n          if (!selected) return;\n          selections.push(selected.value);\n        }\n        const remember = importScopeRememberChk ? !!importScopeRememberChk.checked : false;\n        closeImportScopeModal();\n        state.onConfirm(selections, remember);\n      });\n    }\n    if (importScopeCancelBtn) {\n      importScopeCancelBtn.addEventListener("click", () => closeImportScopeModal());\n    }\n    if (importScopeOverlay) {\n      importScopeOverlay.addEventListener("click", (ev) => {\n        if (ev.target === importScopeOverlay) closeImportScopeModal();\n      });\n    }\n    if (resizeHandleEl) {\n      resizeHandleEl.addEventListener("pointerdown", (event) => {\n        if (event.button !== 0 && event.pointerType === "mouse") return;\n        if (resizeTracking) return;\n        event.preventDefault();\n        resizeTracking = {\n          pointerId: event.pointerId,\n          startX: event.clientX,\n          startY: event.clientY,\n          startWidth: window.innerWidth,\n          startHeight: window.innerHeight\n        };\n        try {\n          resizeHandleEl.setPointerCapture(event.pointerId);\n        } catch (e) {\n        }\n        window.addEventListener("pointermove", handleResizeMove, true);\n        window.addEventListener("pointerup", endResize, true);\n        window.addEventListener("pointercancel", cancelResize, true);\n      });\n    }\n    githubUi.attach({ document, window });\n    if (fileInput) fileInput.addEventListener("change", setDisabledStates);\n    if (exportAllChk) {\n      exportAllChk.addEventListener("change", () => {\n        setDisabledStates();\n        postToPlugin({ type: "SAVE_PREFS", payload: { exportAll: !!exportAllChk.checked } });\n        githubUi.onSelectionChange();\n      });\n    }\n    if (styleDictionaryChk) {\n      styleDictionaryChk.addEventListener("change", () => {\n        postToPlugin({ type: "SAVE_PREFS", payload: { styleDictionary: !!styleDictionaryChk.checked } });\n        requestPreviewForCurrent();\n        githubUi.onSelectionChange();\n      });\n    }\n    if (flatTokensChk) {\n      flatTokensChk.addEventListener("change", () => {\n        postToPlugin({ type: "SAVE_PREFS", payload: { flatTokens: !!flatTokensChk.checked } });\n        requestPreviewForCurrent();\n        githubUi.onSelectionChange();\n      });\n    }\n    if (githubRememberChk) {\n      githubRememberChk.addEventListener("change", () => {\n        postToPlugin({ type: "SAVE_PREFS", payload: { githubRememberToken: !!githubRememberChk.checked } });\n      });\n    }\n    if (refreshBtn) {\n      refreshBtn.addEventListener("click", () => {\n        postToPlugin({ type: "FETCH_COLLECTIONS" });\n      });\n    }\n    if (importBtn && fileInput) {\n      importBtn.addEventListener("click", () => {\n        if (!fileInput.files || fileInput.files.length === 0) {\n          log("Select a JSON file first.");\n          return;\n        }\n        const reader = new FileReader();\n        reader.onload = function() {\n          try {\n            const text = String(reader.result);\n            const json = JSON.parse(text);\n            if (!json || typeof json !== "object" || json instanceof Array) {\n              log("Invalid JSON structure for tokens (expected an object).");\n              return;\n            }\n            const allowHex = !!(allowHexChk && allowHexChk.checked);\n            startImportFlow(json, allowHex);\n          } catch (e) {\n            const msg = e instanceof Error ? e.message : String(e);\n            log("Failed to parse JSON: " + msg);\n          }\n        };\n        reader.readAsText(fileInput.files[0]);\n      });\n    }\n    if (exportBtn) {\n      exportBtn.addEventListener("click", async () => {\n        var _a, _b;\n        let exportAll = false;\n        if (exportAllChk) exportAll = !!exportAllChk.checked;\n        const styleDictionary = !!(styleDictionaryChk && styleDictionaryChk.checked);\n        const flatTokens = !!(flatTokensChk && flatTokensChk.checked);\n        const payload = { exportAll, styleDictionary, flatTokens };\n        if (!exportAll && collectionSelect && modeSelect) {\n          payload.collection = collectionSelect.value;\n          payload.mode = modeSelect.value;\n          if (!(payload.collection && payload.mode)) {\n            log(\'Pick collection and mode or use "Export all".\');\n            return;\n          }\n        }\n        const suggestedName = exportAll ? "tokens.json" : prettyExportName(`${(_a = payload.collection) != null ? _a : "Tokens"}_mode=${(_b = payload.mode) != null ? _b : "Mode 1"}.tokens.json`);\n        await beginPendingSave(suggestedName);\n        postToPlugin({ type: "EXPORT_DTCG", payload });\n        if (exportAll) log("Export all requested.");\n        else log(`Export requested for "${payload.collection || ""}" / "${payload.mode || ""}".`);\n      });\n    }\n    if (exportTypographyBtn) {\n      exportTypographyBtn.addEventListener("click", async () => {\n        await beginPendingSave("typography.json");\n        postToPlugin({ type: "EXPORT_TYPOGRAPHY" });\n        log("Typography export requested.");\n      });\n    }\n    if (drawerToggleBtn) {\n      drawerToggleBtn.addEventListener("click", () => {\n        const current = drawerToggleBtn.getAttribute("aria-expanded") === "true";\n        setDrawerOpen(!current);\n      });\n    }\n    if (collectionSelect) {\n      collectionSelect.addEventListener("change", () => {\n        onCollectionChange();\n        if (collectionSelect && modeSelect) {\n          postToPlugin({ type: "SAVE_LAST", payload: { collection: collectionSelect.value, mode: modeSelect.value } });\n          requestPreviewForCurrent();\n        }\n        githubUi.onSelectionChange();\n      });\n    }\n    if (modeSelect) {\n      modeSelect.addEventListener("change", () => {\n        if (collectionSelect && modeSelect) {\n          postToPlugin({ type: "SAVE_LAST", payload: { collection: collectionSelect.value, mode: modeSelect.value } });\n        }\n        setDisabledStates();\n        requestPreviewForCurrent();\n        githubUi.onSelectionChange();\n      });\n    }\n    if (copyRawBtn) copyRawBtn.addEventListener(\n      "click",\n      () => copyElText(document.getElementById("raw"), "Raw Figma Collections")\n    );\n    if (copyW3cBtn) copyW3cBtn.addEventListener(\n      "click",\n      () => copyElText(document.getElementById("w3cPreview"), "W3C Preview")\n    );\n    if (copyLogBtn) copyLogBtn.addEventListener(\n      "click",\n      () => copyElText(document.getElementById("log"), "Log")\n    );\n    githubUi.onSelectionChange();\n    autoFitOnce();\n    if (rawEl) rawEl.textContent = "Loading variable collections\\u2026";\n    setDisabledStates();\n    setDrawerOpen(getSavedDrawerOpen());\n    postToPlugin({ type: "UI_READY" });\n  });\n  function setDrawerOpen(open) {\n    if (shellEl) {\n      if (open) shellEl.classList.remove("drawer-collapsed");\n      else shellEl.classList.add("drawer-collapsed");\n    }\n    if (drawerToggleBtn) {\n      drawerToggleBtn.setAttribute("aria-expanded", open ? "true" : "false");\n      drawerToggleBtn.textContent = open ? "Hide" : "Show";\n      drawerToggleBtn.title = open ? "Hide log" : "Show log";\n    }\n    try {\n      window.localStorage.setItem("drawerOpen", open ? "1" : "0");\n    } catch (e) {\n    }\n  }\n  function getSavedDrawerOpen() {\n    try {\n      const v = window.localStorage.getItem("drawerOpen");\n      if (v === "0") return false;\n      if (v === "1") return true;\n    } catch (e) {\n    }\n    return true;\n  }\n})();\n//# sourceMappingURL=ui.js.map\n<\/script>\n    <script>\n      // Scope tab behavior PER PANEL so multiple tab groups don\'t interfere.\n      (function () {\n        const panels = Array.from(document.querySelectorAll(\'.panel, .drawer\'));\n        panels.forEach(container => {\n          const tabBtns = Array.from(container.querySelectorAll(\'.tabs .tab-btn\'));\n          if (tabBtns.length === 0) return;\n\n          const body = container.querySelector(\'.panel-body, .drawer-body\') || container;\n          const tabPanels = Array.from(body.querySelectorAll(\'.tab-panel\'));\n\n          function activate(name) {\n            tabBtns.forEach(b => {\n              const on = b.getAttribute(\'data-tab\') === name;\n              b.classList.toggle(\'is-active\', on);\n              b.setAttribute(\'aria-selected\', String(on));\n            });\n            tabPanels.forEach(p => {\n              const on = p.getAttribute(\'data-tab\') === name;\n              p.classList.toggle(\'is-active\', on);\n              if (on) p.scrollTop = 0;\n            });\n          }\n\n          tabBtns.forEach(btn => {\n            btn.addEventListener(\'click\', () => {\n              const name = btn.getAttribute(\'data-tab\');\n              if (name) activate(name);\n            });\n          });\n\n          // Initialize to the first .is-active button, or default to the first button\n          const initial = tabBtns.find(b => b.classList.contains(\'is-active\')) || tabBtns[0];\n          if (initial) {\n            const name = initial.getAttribute(\'data-tab\');\n            if (name) activate(name);\n          }\n        });\n      })();\n    <\/script>\n</body>\n\n</html>\n', { width: w, height: h });
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
      send({ type: "INFO", payload: { message: "Fetched " + String(snap.collections.length) + " collections" + (opts.force ? "" : " (auto)") } });
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
        githubRememberPref: githubRememberPrefVal
      }
    });
    send({ type: "RAW_COLLECTIONS_TEXT", payload: { text: snap.rawText } });
  }
  var pollInterval;
  function startPolling() {
    if (pollInterval) return;
    pollInterval = setInterval(() => {
      broadcastLocalCollections({ force: false, silent: true }).catch((err) => console.error(err));
    }, 500);
    figma.on("documentchange", (event) => {
      const styleChanges = event.documentChanges.filter(
        (c) => c.type === "STYLE_CREATE" || c.type === "STYLE_DELETE" || c.type === "STYLE_PROPERTY_CHANGE"
      );
      if (styleChanges.length > 0) {
        const createdIds = new Set(styleChanges.filter((c) => c.type === "STYLE_CREATE").map((c) => c.id));
        const deletedIds = new Set(styleChanges.filter((c) => c.type === "STYLE_DELETE").map((c) => c.id));
        const ghostIds = new Set([...createdIds].filter((id) => deletedIds.has(id)));
        for (const change of styleChanges) {
          if (ghostIds.has(change.id)) continue;
          if (change.type === "STYLE_CREATE") {
            const style = figma.getStyleById(change.id);
            if (style) {
              send({ type: "INFO", payload: { message: `Style Created: ${style.name}` } });
            }
          } else if (change.type === "STYLE_DELETE") {
            send({ type: "INFO", payload: { message: "Style Deleted" } });
          } else if (change.type === "STYLE_PROPERTY_CHANGE") {
            if (createdIds.has(change.id)) continue;
            const style = figma.getStyleById(change.id);
            if (style) {
              send({ type: "INFO", payload: { message: `Style Updated: ${style.name} (Properties: ${change.properties.join(", ")})` } });
            }
          }
        }
        broadcastLocalCollections({ force: true, silent: true }).catch((err) => console.error(err));
      }
    });
    figma.on("selectionchange", () => {
      broadcastLocalCollections({ force: false, silent: true }).catch((err) => console.error(err));
    });
    figma.on("currentpagechange", () => {
      broadcastLocalCollections({ force: false, silent: true }).catch((err) => console.error(err));
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
    send({ type: "IMPORT_SUMMARY", payload: { summary, timestamp: Date.now(), source: "local" } });
    await broadcastLocalCollections({ force: true, silent: true });
  }
  async function handleExportDtcg(msg) {
    const payload = msg.payload;
    const exportAll = !!payload.exportAll;
    const styleDictionary = !!payload.styleDictionary;
    const flatTokens = !!payload.flatTokens;
    if (exportAll) {
      const all = await exportDtcg({ format: "single", styleDictionary, flatTokens });
      send({ type: "EXPORT_RESULT", payload: { files: all.files } });
      return;
    }
    const collectionName = payload.collection ? payload.collection : "";
    const modeName = payload.mode ? payload.mode : "";
    const per = await exportDtcg({ format: "perMode", styleDictionary, flatTokens });
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
      send({ type: "INFO", payload: { message: `Export: pretty file not found for "${collectionName}" / "${modeName}". Falling back to all per-mode files.` } });
    }
    send({ type: "EXPORT_RESULT", payload: { files: filesToSend } });
  }
  async function handleExportTypography(_msg) {
    const result = await exportDtcg({ format: "typography" });
    send({ type: "EXPORT_RESULT", payload: { files: result.files } });
    if (result.files.length > 0) {
      const first = result.files[0];
      send({ type: "W3C_PREVIEW", payload: { name: first.name, json: first.json } });
    }
  }
  async function handleSaveLast(msg) {
    const payload = msg.payload;
    if (typeof payload.collection === "string" && typeof payload.mode === "string") {
      await figma.clientStorage.setAsync("lastSelection", { collection: payload.collection, mode: payload.mode });
    }
  }
  async function handleSavePrefs(msg) {
    const payload = msg.payload;
    if (typeof payload.exportAll === "boolean") {
      await figma.clientStorage.setAsync("exportAllPref", !!payload.exportAll);
    }
    if (typeof payload.styleDictionary === "boolean") {
      await figma.clientStorage.setAsync("styleDictionaryPref", !!payload.styleDictionary);
    }
    if (typeof payload.flatTokens === "boolean") {
      await figma.clientStorage.setAsync("flatTokensPref", !!payload.flatTokens);
    }
    if (typeof payload.allowHexStrings === "boolean") {
      await figma.clientStorage.setAsync("allowHexPref", !!payload.allowHexStrings);
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
    const per = await exportDtcg({ format: "perMode", styleDictionary, flatTokens });
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
    send({ type: "W3C_PREVIEW", payload: { name: picked.name, json: picked.json } });
  }
  var coreHandlers = /* @__PURE__ */ new Map([
    ["UI_READY", handleUiReady],
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
