"use strict";
(() => {
  var __defProp = Object.defineProperty;
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

  // src/core/normalize.ts
  function slugSegment(s) {
    var cleaned = s.replace(/\s+/g, "-").trim().toLowerCase();
    var out = "";
    var i = 0;
    for (i = 0; i < cleaned.length; i++) {
      var ch = cleaned.charAt(i);
      if (ch === "{" || ch === "}" || ch === "." || ch === ":" || ch === "\\" || ch === "/") ch = "-";
      var ok = ch >= "a" && ch <= "z" || ch >= "0" && ch <= "9" || ch === "-";
      out += ok ? ch : "-";
    }
    out = out.replace(/-+/g, "-");
    if (out.length > 0 && out.charAt(0) === "$") out = "dollar" + out.substring(1);
    if (out.length === 0) out = "unnamed";
    return out;
  }
  function canonicalPath(collectionName, variableName) {
    var segs = variableName.split("/");
    var out = [];
    out.push(slugSegment(collectionName));
    var i = 0;
    for (i = 0; i < segs.length; i++) out.push(slugSegment(segs[i]));
    return out;
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

  // src/core/color.ts
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
    if (profile === "DISPLAY_P3") return "display-p3";
    return "srgb";
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
  function isDtcgColorInUnitRange(input) {
    if (!input || !Array.isArray(input.components) || input.components.length < 3) {
      return { ok: false, reason: "components missing" };
    }
    for (let i = 0; i < 3; i++) {
      const n = Number(input.components[i]);
      if (!Number.isFinite(n) || n < 0 || n > 1) {
        return { ok: false, reason: `component[${i}] out of range (${input.components[i]})` };
      }
    }
    if (typeof input.alpha === "number") {
      const a = Number(input.alpha);
      if (!Number.isFinite(a) || a < 0 || a > 1) {
        return { ok: false, reason: `alpha out of range (${input.alpha})` };
      }
    }
    return { ok: true };
  }

  // src/adapters/dtcg-reader.ts
  function logInfo(msg) {
    var _a;
    try {
      (_a = figma.ui) == null ? void 0 : _a.postMessage({ type: "INFO", payload: { message: msg } });
    } catch (e) {
    }
  }
  function logWarn(msg) {
    logInfo("Warning: " + msg);
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
  function toNumber(x, def) {
    return typeof x === "number" ? x : def;
  }
  function parseColorSpaceUnion(x) {
    if (x === "display-p3") return "display-p3";
    return "srgb";
  }
  function readColorValue(raw) {
    if (typeof raw === "string") {
      if (!isLikelyHexString(raw)) return null;
      try {
        return hexToDtcgColor(raw);
      } catch (e) {
        return null;
      }
    }
    const obj = raw;
    const cs = parseColorSpaceUnion(obj == null ? void 0 : obj.colorSpace);
    let comps = [0, 0, 0];
    if (Array.isArray(obj == null ? void 0 : obj.components) && obj.components.length >= 3) {
      comps = [
        toNumber(obj.components[0], 0),
        toNumber(obj.components[1], 0),
        toNumber(obj.components[2], 0)
      ];
    }
    const alpha = typeof (obj == null ? void 0 : obj.alpha) === "number" ? obj.alpha : void 0;
    const hex = typeof (obj == null ? void 0 : obj.hex) === "string" ? obj.hex : void 0;
    return { colorSpace: cs, components: comps, alpha, hex };
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
  function guessTypeFromValue(v) {
    if (typeof v === "number") return "number";
    if (typeof v === "boolean") return "boolean";
    if (typeof v === "string") return "string";
    return "string";
  }
  function readDtcgToIR(root) {
    const tokens = [];
    function visit(obj, path, inheritedType) {
      var _a;
      if (!obj || typeof obj !== "object") return;
      let groupType = inheritedType;
      if (hasKey(obj, "$type") && typeof obj.$type === "string") {
        const t = String(obj.$type);
        if (t === "color" || t === "number" || t === "string" || t === "boolean") {
          groupType = t;
        }
      }
      if (hasKey(obj, "$value")) {
        const rawVal = obj.$value;
        if (isAliasString(rawVal)) {
          const segs = parseAliasToSegments(rawVal);
          const { irPath, ctx } = computePathAndCtx(path, obj);
          const byCtx = {};
          byCtx[ctx] = { kind: "alias", path: segs };
          const ext = hasKey(obj, "$extensions") ? obj["$extensions"] : void 0;
          const comFigma = ext && typeof ext === "object" && ext["com.figma"] && typeof ext["com.figma"] === "object" ? ext["com.figma"] : ext ? (ext["com.figma"] = {}, ext["com.figma"]) : {};
          comFigma.__jsonCollection = (_a = path[0]) != null ? _a : "";
          comFigma.__jsonKey = path.slice(1).join("/");
          tokens.push(__spreadValues({
            path: irPath,
            type: groupType != null ? groupType : "string",
            byContext: byCtx
          }, hasKey(obj, "$extensions") ? { extensions: obj["$extensions"] } : {}));
          return;
        }
        if (groupType === "color") {
          const parsed = readColorValue(rawVal);
          const { irPath, ctx } = computePathAndCtx(path, obj);
          if (!parsed) {
            logWarn(`Skipped invalid color for \u201C${irPath.join("/")}\u201D \u2014 expected hex or color object.`);
            return;
          }
          const range = isDtcgColorInUnitRange(parsed);
          if (!range.ok) {
            logWarn(`Skipped invalid color for \u201C${irPath.join("/")}\u201D \u2014 ${range.reason}; components/alpha must be within [0..1].`);
            return;
          }
          const byCtx = {};
          byCtx[ctx] = { kind: "color", value: parsed };
          tokens.push(__spreadValues({
            path: irPath,
            type: "color",
            byContext: byCtx
          }, hasKey(obj, "$extensions") ? { extensions: obj["$extensions"] } : {}));
          return;
        }
        const t2 = groupType != null ? groupType : guessTypeFromValue(rawVal);
        let valObj = null;
        if (t2 === "number" && typeof rawVal === "number") {
          valObj = { kind: "number", value: rawVal };
        } else if (t2 === "boolean" && typeof rawVal === "boolean") {
          valObj = { kind: "boolean", value: rawVal };
        } else if (t2 === "string" && typeof rawVal === "string") {
          valObj = { kind: "string", value: rawVal };
        } else {
          if (typeof rawVal === "string") valObj = { kind: "string", value: rawVal };
          else if (typeof rawVal === "number") valObj = { kind: "number", value: rawVal };
          else if (typeof rawVal === "boolean") valObj = { kind: "boolean", value: rawVal };
        }
        if (valObj) {
          const { irPath, ctx } = computePathAndCtx(path, obj);
          const byCtx = {};
          byCtx[ctx] = valObj;
          tokens.push(__spreadValues({
            path: irPath,
            type: t2,
            byContext: byCtx
          }, hasKey(obj, "$extensions") ? { extensions: obj["$extensions"] } : {}));
        }
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
    return { tokens };
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
      const displaySegs = [collection, ...variable.split("/")];
      byKey.set(dotRaw(displaySegs), entry);
      const slugSegs = [slugForMatch(collection), ...variable.split("/").map((s) => slugForMatch(s))];
      byKey.set(dotRaw(slugSegs), entry);
    }
    return byKey;
  }
  function serialize(graph, _opts) {
    const root = {};
    const displayIndex = buildDisplayNameIndex(graph);
    for (const t of graph.tokens) {
      writeTokenInto(root, t, displayIndex);
    }
    return { json: root };
  }
  function writeTokenInto(root, t, displayIndex) {
    var _a;
    const ctxKeys = keysOf(t.byContext);
    const chosenCtx = ctxKeys.length > 0 ? ctxKeys[0] : void 0;
    const chosen = chosenCtx !== void 0 ? (_a = t.byContext[chosenCtx]) != null ? _a : null : null;
    const { collection: collectionDisplay, variable: variableDisplay } = getFigmaDisplayNames(t, chosenCtx);
    let groupSegments = t.path.slice(0, t.path.length - 1);
    if (groupSegments.length > 0) groupSegments[0] = collectionDisplay;
    if (groupSegments.length > 1) {
      const firstChild = groupSegments[1].toLowerCase();
      if (/^collection(\s|-)?\d+/.test(firstChild)) {
        groupSegments = [groupSegments[0], ...groupSegments.slice(2)];
      }
    }
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
    const leaf = variableDisplay;
    const tokenObj = {};
    tokenObj["$type"] = t.type;
    if (chosen !== null) {
      switch (chosen.kind) {
        case "alias": {
          const segs = Array.isArray(chosen.path) ? chosen.path.slice() : String(chosen.path).split(".").map((p) => p.trim()).filter(Boolean);
          let refDisp = displayIndex.get(dotRaw(segs));
          if (!refDisp) {
            refDisp = displayIndex.get(dotRaw(segs.map((s) => slugForMatch(s))));
          }
          if (!refDisp && segs.length > 0) {
            const firstSlug = slugForMatch(segs[0]);
            for (const [k, v] of displayIndex.entries()) {
              const parts = k.split(".");
              if (parts.length === 0) continue;
              if (slugForMatch(parts[0]) === firstSlug) {
                const cand1 = [parts[0], ...segs.slice(1)];
                const cand2 = [parts[0], ...segs.slice(1).map((s) => slugForMatch(s))];
                refDisp = displayIndex.get(dotRaw(cand1)) || displayIndex.get(dotRaw(cand2));
                if (refDisp) break;
              }
            }
          }
          tokenObj["$value"] = refDisp ? `{${[refDisp.collection, ...refDisp.variable.split("/")].join(".")}}` : `{${segs.join(".")}}`;
          break;
        }
        case "color": {
          const cv = chosen.value;
          const out = {
            colorSpace: cv.colorSpace,
            components: [cv.components[0], cv.components[1], cv.components[2]]
          };
          if (typeof cv.alpha === "number") out["alpha"] = cv.alpha;
          if (typeof cv.hex === "string") out["hex"] = cv.hex;
          tokenObj["$value"] = out;
          break;
        }
        case "number":
        case "string":
        case "boolean": {
          tokenObj["$value"] = chosen.value;
          break;
        }
      }
    }
    if (t.description) tokenObj["$description"] = t.description;
    if (t.extensions) {
      const flattened = flattenFigmaExtensionsForCtx(t.extensions, chosenCtx);
      tokenObj["$extensions"] = flattened != null ? flattened : t.extensions;
    }
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
    var _a;
    const profile = figma.root.documentColorProfile;
    const variablesApi = figma.variables;
    const collections = await variablesApi.getLocalVariableCollectionsAsync();
    const varMeta = {};
    for (let ci = 0; ci < collections.length; ci++) {
      const col = collections[ci];
      for (let vi = 0; vi < col.variableIds.length; vi++) {
        const id = col.variableIds[vi];
        const v = await variablesApi.getVariableByIdAsync(id);
        if (v) varMeta[v.id] = { name: v.name, collectionId: col.id };
      }
    }
    const tokens = [];
    for (let ci = 0; ci < collections.length; ci++) {
      const c = collections[ci];
      const modeNameById = {};
      for (let mi = 0; mi < c.modes.length; mi++) modeNameById[c.modes[mi].modeId] = c.modes[mi].name;
      for (let vi2 = 0; vi2 < c.variableIds.length; vi2++) {
        const vid = c.variableIds[vi2];
        const v2 = await variablesApi.getVariableByIdAsync(vid);
        if (!v2) continue;
        const path = canonicalPath(c.name, v2.name);
        const type = mapType(v2.resolvedType);
        const byContext = {};
        const perContext = {};
        for (let mi2 = 0; mi2 < c.modes.length; mi2++) {
          const md = c.modes[mi2];
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
            const target = await variablesApi.getVariableByIdAsync(mv.id);
            if (target) {
              const meta = varMeta[target.id];
              const collName = meta ? ((_a = collections.find((cc) => cc.id === meta.collectionId)) == null ? void 0 : _a.name) || c.name : c.name;
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
        const token = {
          path,
          type,
          byContext,
          // NEW: attach $extensions payload so it shows in preview and exports
          extensions: {
            "com.figma": { perContext }
          }
        };
        tokens.push(token);
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
  function tokenHasAtLeastOneValidDirectValue(t) {
    const byCtx = t.byContext || {};
    for (const ctx in byCtx) {
      const v = byCtx[ctx];
      if (!v || v.kind === "alias") continue;
      if (t.type === "color") {
        if (v.kind !== "color") continue;
        if (!isValidDtcgColorValueObject(v.value)) continue;
        const range = isDtcgColorInUnitRange(v.value);
        if (range.ok) return true;
      } else if (t.type === "number" || t.type === "string" || t.type === "boolean") {
        if (v.kind === t.type) return true;
      }
    }
    return false;
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
    const variablesApi = figma.variables;
    const existingCollections = await variablesApi.getLocalVariableCollectionsAsync();
    const colByName = {};
    for (const c of existingCollections) colByName[c.name] = c;
    const existing = await variablesApi.getLocalVariableCollectionsAsync();
    const existingVarIdByPathDot = {};
    for (const c of existing) {
      const cDisplay = c.name;
      for (const vid of c.variableIds) {
        const v = await variablesApi.getVariableByIdAsync(vid);
        if (!v) continue;
        const varSegs = v.name.split("/");
        indexVarKeys(existingVarIdByPathDot, cDisplay, varSegs, v.id);
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
    for (const t of graph.tokens) {
      const hasDirect = tokenHasDirectValue(t);
      const hasAlias = tokenHasAlias(t);
      if (hasDirect) {
        directTokens.push(t);
      } else if (hasAlias) {
        aliasOnlyTokens.push(t);
      } else {
        logWarn2(`Skipped ${t.type} token \u201C${t.path.join("/")}\u201D \u2014 needs a ${t.type} $value or an alias reference.`);
      }
      if (!tokenHasAtLeastOneValidDirectValue(t)) {
        logWarn2(`Skipped ${t.type} token \u201C${t.path.join("/")}\u201D \u2014 no valid direct values in any context; not creating variable or collection.`);
        continue;
      }
    }
    function ensureCollection(name) {
      let col = colByName[name];
      if (!col) {
        col = variablesApi.createVariableCollection(name);
        colByName[name] = col;
        knownCollections.add(name);
        displayBySlug[slugSegment(name)] = name;
      }
      return col;
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
      if (!tokenHasAtLeastOneValidDirectValue(t)) {
        logWarn2(`Skipped ${t.type} token \u201C${t.path.join("/")}\u201D \u2014 no valid direct values in any context; not creating variable or collection.`);
        continue;
      }
      const col = ensureCollection(collectionName);
      let existingVarId = null;
      for (const vid of col.variableIds) {
        const cand = await variablesApi.getVariableByIdAsync(vid);
        if (cand && cand.name === varName) {
          existingVarId = cand.id;
          break;
        }
      }
      let v;
      if (existingVarId) {
        const got = await variablesApi.getVariableByIdAsync(existingVarId);
        if (!got) continue;
        v = got;
      } else {
        v = variablesApi.createVariable(varName, col, resolvedTypeFor(t.type));
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
          const cand = await variablesApi.getVariableByIdAsync(vid);
          if (cand && cand.name === varName) {
            existingVarId = cand.id;
            break;
          }
        }
        let v;
        if (existingVarId) {
          const got = await variablesApi.getVariableByIdAsync(existingVarId);
          if (!got) continue;
          v = got;
        } else {
          v = variablesApi.createVariable(varName, col, resolvedTypeFor(t.type));
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
      const targetVar = await variablesApi.getVariableByIdAsync(varId);
      if (!targetVar) continue;
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
            modeId = found ? found.modeId : col.addMode(mName);
            modeIdByKey[ctx] = modeId;
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
          if (!isValidDtcgColorValueObject(val.value)) {
            logWarn2(`Skipped setting color for \u201C${node.path.join("/")}\u201D in ${ctx} \u2014 $value must be a color object with { colorSpace, components[3] }.`);
            continue;
          }
          const range = isDtcgColorInUnitRange(val.value);
          if (!range.ok) {
            logWarn2(`Skipped setting color for \u201C${node.path.join("/")}\u201D in ${ctx} \u2014 ${range.reason}; components/alpha must be within [0..1].`);
            continue;
          }
          const norm = normalizeDtcgColorValue(val.value);
          maybeWarnColorMismatch(node, ctx, typeof norm.hex === "string" ? norm.hex : null);
          const rgba = dtcgToFigmaRGBA(norm, profile);
          targetVar.setValueForMode(modeId, { r: rgba.r, g: rgba.g, b: rgba.b, a: rgba.a });
        } else if (val.kind === "number" || val.kind === "string" || val.kind === "boolean") {
          targetVar.setValueForMode(modeId, val.value);
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
    }
  }

  // src/core/pipeline.ts
  function keysOf2(obj) {
    var out = [];
    var k;
    for (k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) out.push(k);
    return out;
  }
  function sanitizeForFile(s) {
    var out = "";
    var i = 0;
    for (i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (ch === "/" || ch === "\\" || ch === ":") out += "_";
      else out += ch;
    }
    return out;
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
  async function importDtcg(json) {
    var desired = normalize(readDtcgToIR(json));
    await writeIRToFigma(desired);
  }
  async function exportDtcg(opts) {
    var current = await readFigmaToIR();
    var graph = normalize(current);
    if (opts.format === "single") {
      var single = serialize(graph);
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
      var out = serialize(filtered);
      var slash = ctx.indexOf("/");
      var collection = slash >= 0 ? ctx.substring(0, slash) : ctx;
      var mode = slash >= 0 ? ctx.substring(slash + 1) : "default";
      var fname = sanitizeForFile(collection) + "_mode=" + sanitizeForFile(mode) + ".tokens.json";
      files.push({ name: fname, json: out.json });
    }
    if (files.length === 0) {
      var fallback = serialize(graph);
      files.push({ name: "tokens.json", json: fallback.json });
    }
    return { files };
  }

  // src/app/main.ts
  (async function initUI() {
    var w = 960, h = 540;
    try {
      var saved = await figma.clientStorage.getAsync("uiSize");
      if (saved && typeof saved.width === "number" && typeof saved.height === "number") {
        var sw = Math.floor(saved.width);
        var sh = Math.floor(saved.height);
        w = Math.max(720, Math.min(1600, sw));
        h = Math.max(420, Math.min(1200, sh));
      }
    } catch (_e) {
    }
    figma.showUI('<!doctype html>\n<html>\n\n<head>\n  <meta charset="utf-8" />\n  <meta name="viewport" content="width=device-width, initial-scale=1" />\n  <title>DTCG Import/Export</title>\n  <style>\n    :root {\n      --bg: #ffffff;\n      --ink: #111827;\n      --ink-subtle: #4b5563;\n      --ink-muted: #6b7280;\n      --surface: #f9fafb;\n      --accent: #0051ff;\n      --accent-ink: #dfdfdf;\n      --border: #e5e7eb;\n      --drawer-h: 260px;\n      /* bottom log drawer height */\n      --drawer-collapsed-h: 2rem;\n      /* slim bar height when collapsed */\n    }\n\n    html,\n    body {\n      height: 100%;\n      margin: 0;\n    }\n\n    body {\n      background: var(--bg);\n      color: var(--ink);\n      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;\n      line-height: 1.4;\n    }\n\n    /* Two-row grid: main content + bottom drawer */\n    .shell {\n      height: 100vh;\n      width: 100%;\n      display: grid;\n      grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 1fr);\n      grid-template-rows: 1fr var(--drawer-h);\n      gap: 12px;\n      padding: 12px;\n      box-sizing: border-box;\n      grid-auto-flow: row;\n      /* rows fill before columns */\n    }\n\n    .shell.drawer-collapsed {\n      grid-template-rows: 1fr var(--drawer-collapsed-h);\n    }\n\n    /* Hide drawer body when collapsed */\n    .shell.drawer-collapsed .drawer .drawer-body {\n      display: none;\n    }\n\n    /* Drawer toggle button */\n    .drawer-toggle {\n      padding: 6px 10px;\n      border: 1px solid var(--border);\n      border-radius: 8px;\n      background: #fff;\n      color: var(--ink);\n      font-size: 12px;\n      cursor: pointer;\n    }\n\n    .drawer-toggle:hover {\n      background: #f3f4f6;\n    }\n\n    .col {\n      display: flex;\n      flex-direction: column;\n      min-width: 0;\n      min-height: 0;\n    }\n\n    .panel {\n      display: flex;\n      flex-direction: column;\n      min-width: 0;\n      min-height: 0;\n      flex: 1;\n      border: 1px solid var(--border);\n      background: var(--surface);\n      border-radius: 10px;\n      padding: .5rem;\n    }\n\n    .panel-header {\n      display: flex;\n      align-items: center;\n      justify-content: space-between;\n      padding: 10px 12px 4px 12px;\n      border-bottom: 1px solid var(--border);\n    }\n\n    .eyebrow {\n      font-size: 11px;\n      letter-spacing: .06em;\n      text-transform: uppercase;\n      color: var(--ink-muted);\n      margin: 0 0 2px 0;\n    }\n\n    .title {\n      font-size: 16px;\n      font-weight: 700;\n      margin: 0;\n    }\n\n    .panel-body {\n      padding: .25rem;\n      display: flex;\n      flex-direction: column;\n      gap: 12px;\n      min-width: 0;\n      min-height: 0;\n      flex: 1;\n    }\n\n    .row {\n      display: flex;\n      gap: 8px;\n      align-items: center;\n    }\n\n    .row>* {\n      flex: 1;\n      min-width: 0;\n    }\n\n    label {\n      font-size: 12px;\n      color: var(--ink-subtle);\n      display: block;\n      margin-bottom: 4px;\n    }\n\n    input[type="text"],\n    select,\n    input[type="file"] {\n      width: 100%;\n      padding: 8px;\n      border: 1px solid var(--border);\n      border-radius: 8px;\n      background: #fff;\n      color: var(--ink);\n      font-size: 12px;\n      box-sizing: border-box;\n    }\n\n    button {\n      padding: 10px 12px;\n      border: 2;\n      border-radius: .25rem;\n      border-color: var(--accent);\n      color: #000000;\n      font-weight: 600;\n      cursor: pointer;\n      font-size: 16px;\n      background: ffffff;\n    }\n\n    button[disabled] {\n      opacity: .5;\n      cursor: not-allowed;\n    }\n\n    .css-button-neumorphic {\n      min-width: 130px;\n      height: 40px;\n      color: #fff;\n      padding: 5px 10px;\n      font-weight: bold;\n      cursor: pointer;\n      transition: all 0.3s ease;\n      position: relative;\n      display: inline-block;\n      outline: none;\n      border-radius: .25rem;\n      border: none;\n      background: #efefef;\n      box-shadow: 2px 2px 4px #c8d0e7, -1px -1px 4px #fff;\n      color: #123456;\n      font-family: system-ui, -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, Oxygen, Ubuntu, Cantarell, \'Open Sans\', \'Helvetica Neue\', sans-serif;\n      font-weight: 500;\n    }\n\n    .css-button-neumorphic:active {\n      box-shadow: inset 1px 1px 3px #c8d0e7, inset -1px -1px 3px #fff;\n    }\n\n    .muted {\n      color: var(--ink-muted);\n      font-size: 12px;\n    }\n\n    /* Monospace content panes (raw + preview) */\n    pre {\n      margin: 0;\n      padding: .5rem;\n      background: #fff;\n      border: 1px solid var(--border);\n      border-radius: 8px;\n      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;\n      font-size: 11px;\n      white-space: pre-wrap;\n      /* preserve newlines but allow wrapping */\n      overflow-wrap: anywhere;\n      /* break long tokens/paths */\n      word-break: break-word;\n      overflow: auto;\n      min-width: 0;\n      min-height: 0;\n      flex: 1;\n      height: 100%;\n    }\n\n    .stack {\n      display: flex;\n      flex-direction: column;\n      gap: 10px;\n    }\n\n    .row-center {\n      display: flex;\n      gap: 8px;\n      align-items: center;\n      justify-content: space-between;\n    }\n\n\n    /* Bottom drawer (Log) spans all columns */\n    .drawer {\n      grid-column: 1 / -1;\n      grid-row: 2;\n      display: flex;\n      flex-direction: column;\n      min-height: 0;\n      min-width: 0;\n      border: 1px solid var(--border);\n      background: var(--surface);\n      border-radius: 10px;\n      padding: .5rem;\n    }\n\n    .drawer .panel-header {\n      border-bottom: 1px solid var(--border);\n    }\n\n    .drawer-body {\n      padding: .25rem;\n      min-height: 0;\n      min-width: 0;\n      flex: 1;\n      display: flex;\n      flex-direction: column;\n    }\n\n    /* Log content area */\n    #log {\n      padding: .5rem;\n      background: #fff;\n      border: 1px solid var(--border);\n      border-radius: 8px;\n      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;\n      font-size: 11px;\n      white-space: pre-wrap;\n      overflow-wrap: anywhere;\n      word-break: break-word;\n      overflow: auto;\n      min-width: 0;\n      min-height: 0;\n      flex: 1;\n      height: 100%;\n    }\n\n    /* Allow an on-canvas resize handle */\n    .resize-handle {\n      position: fixed;\n      /* inside the iframe viewport */\n      right: 6px;\n      bottom: 6px;\n      width: 14px;\n      height: 14px;\n      /* border-right: 1px solid var(--border);\n      border-bottom: 1px solid var(--border); */\n      /* background: #fff; */\n      border-radius: 3px;\n      /* box-shadow: 0 1px 2px rgba(0, 0, 0, .06); */\n      cursor: nwse-resize;\n      display: grid;\n      place-items: center;\n      z-index: 2147483647;\n      /* on top of everything inside the iframe */\n    }\n\n    .resize-handle::after {\n      content: "";\n      width: 8px;\n      height: 8px;\n      border-right: 2px solid #9ca3af;\n      /* subtle diagonal corner */\n      border-bottom: 2px solid #9ca3af;\n      transform: translate(1px, 1px);\n      pointer-events: none;\n    }\n\n    #exportBtn {\n      margin-top: .5rem;\n      width: 100%;\n    }\n\n    /* Collapsed drawer: turn the outer container into a thin row with no chrome,\n   and let the header itself render the small pill/bar. */\n    .shell.drawer-collapsed .drawer {\n      padding: 0;\n      /* remove outer padding that created the white strip */\n      background: transparent;\n      /* no background/plinth */\n      border: 0;\n      /* no outer border */\n    }\n\n    /* Make the header itself look like a compact pill */\n    .shell.drawer-collapsed .drawer .panel-header {\n      padding: 4px 8px;\n      /* tighter */\n      border: 1px solid var(--border);\n      border-radius: 10px;\n      background: var(--surface);\n      /* remove the normal header divider line */\n      border-bottom: 1px solid var(--border);\n      /* keep a hairline if you like */\n    }\n\n    /* Save vertical space: only keep the eyebrow, hide the big title in collapsed mode */\n    .shell.drawer-collapsed .drawer .title {\n      display: none;\n    }\n\n    .shell.drawer-collapsed .drawer .eyebrow {\n      margin: 0;\n    }\n\n    /* (Already present) */\n    .shell.drawer-collapsed {\n      grid-template-rows: 1fr var(--drawer-collapsed-h);\n    }\n\n    .shell.drawer-collapsed .drawer .drawer-body {\n      display: none;\n    }\n\n    /* Add this */\n    .panel-header .actions {\n      display: flex;\n      gap: 8px;\n      align-items: center;\n    }\n\n    /* Change these two existing rules: target any button inside the header,\n   not just direct children */\n    .panel-header button {\n      font-size: 11px;\n      padding: 6px 8px;\n      border: 1px solid var(--border);\n      background: #fff;\n      color: var(--ink);\n      border-radius: 6px;\n      cursor: pointer;\n    }\n\n    .panel-header button:hover {\n      background: #f3f4f6;\n    }\n  </style>\n</head>\n\n<body>\n  <div class="shell">\n    <!-- Left: Actions -->\n    <div class="col">\n      <div class="panel">\n        <div class="panel-header">\n          <div>\n            <div class="eyebrow">Actions</div>\n            <h2 class="title">Import & Export</h2>\n          </div>\n        </div>\n        <div class="panel-body">\n          <!-- Import -->\n          <div class="stack">\n            <div class="eyebrow">Import DTCG</div>\n            <div>\n              <label>Choose a DTCG JSON file</label>\n              <input id="file" type="file" accept=".json,application/json" />\n            </div>\n            <div class="row">\n              <button id="importBtn" class="css-button-neumorphic">Import</button>\n            </div>\n            <div class="muted">Imports collections/modes as defined in the file.</div>\n          </div>\n\n          <!-- Export -->\n          <div class="stack" style="border-top:1px solid var(--border);padding-top:12px;">\n            <div class="eyebrow">Export DTCG</div>\n            <div class="row-center"></div>\n            <div class="stack" id="exportPickers">\n              <div>\n                <label>Collection</label>\n                <select id="collectionSelect"></select>\n              </div>\n              <div>\n                <label>Mode (within collection)</label>\n                <select id="modeSelect"></select>\n              </div>\n              <div>\n                <label><input type="checkbox" id="exportAllChk" /> Export all collections &amp; modes into a single\n                  file</label>\n                <div class="muted">Select a collection and mode, or check \u201CExport all\u201D.</div>\n                <button id="exportBtn" class="css-button-neumorphic">Export</button>\n              </div>\n            </div>\n          </div>\n        </div>\n      </div>\n    </div>\n\n    <!-- Middle: Raw Figma Collections -->\n    <div class="col">\n      <div class="panel">\n        <div class="panel-header">\n          <div>\n            <div class="eyebrow">Reference</div>\n            <h2 class="title">Raw Figma Collections</h2>\n          </div>\n          <div id="actions">\n            <button id="copyRawBtn" title="Copy raw collections">Copy</button>\n            <button id="refreshBtn">Refresh</button>\n          </div>\n        </div>\n        <div class="panel-body">\n          <pre id="raw"></pre>\n        </div>\n\n      </div>\n    </div>\n\n    <!-- Right: W3C Preview -->\n    <div class="col">\n      <div class="panel">\n        <div class="panel-header">\n          <div>\n            <div class="eyebrow">Preview</div>\n            <h2 class="title">W3C Design Tokens (JSON)</h2>\n          </div>\n          <button id="copyW3cBtn" title="Copy W3C JSON">Copy</button>\n        </div>\n        <div class="panel-body">\n          <!-- Placeholder; we\u2019ll wire this later -->\n          <pre id="w3cPreview">{ /* preview will render here */ }</pre>\n        </div>\n      </div>\n    </div>\n\n    <!-- Bottom drawer: Log (spans all columns) -->\n    <div class="drawer">\n      <div class="panel-header">\n        <div>\n          <div class="eyebrow">Diagnostics</div>\n          <h2 class="title">Log</h2>\n        </div>\n        <div class="actions">\n          <button id="copyLogBtn" title="Copy log">Copy</button>\n          <button id="drawerToggleBtn" class="drawer-toggle" aria-expanded="true" title="Hide log">Hide</button>\n        </div>\n      </div>\n\n      <div class="drawer-body">\n        <div id="log"></div>\n      </div>\n    </div>\n  </div>\n  <div class="resize-handle" id="resizeHandle" title="Drag to resize"></div>\n  <script>"use strict";\n(() => {\n  // src/app/ui.ts\n  var logEl = document.getElementById("log");\n  var rawEl = document.getElementById("raw");\n  var exportAllChk = document.getElementById("exportAllChk");\n  var collectionSelect = document.getElementById("collectionSelect");\n  var modeSelect = document.getElementById("modeSelect");\n  var fileInput = document.getElementById("file");\n  var importBtn = document.getElementById("importBtn");\n  var exportBtn = document.getElementById("exportBtn");\n  var exportPickers = document.getElementById("exportPickers");\n  var refreshBtn = document.getElementById("refreshBtn");\n  var shellEl = document.querySelector(".shell");\n  var drawerToggleBtn = document.getElementById("drawerToggleBtn");\n  var w3cPreviewEl = document.getElementById("w3cPreview");\n  var copyRawBtn = document.getElementById("copyRawBtn");\n  var copyW3cBtn = document.getElementById("copyW3cBtn");\n  var copyLogBtn = document.getElementById("copyLogBtn");\n  function postResize(width, height) {\n    var w = Math.max(720, Math.min(1600, Math.floor(width)));\n    var h = Math.max(420, Math.min(1200, Math.floor(height)));\n    postToPlugin({ type: "UI_RESIZE", payload: { width: w, height: h } });\n  }\n  async function copyElText(el, label) {\n    var _a, _b;\n    try {\n      const text = el ? (_a = el.textContent) != null ? _a : "" : "";\n      if (!text) {\n        log(`Nothing to copy for ${label}.`);\n        return;\n      }\n      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {\n        await navigator.clipboard.writeText(text);\n        log(`Copied ${label} to clipboard (${text.length} chars).`);\n        return;\n      }\n      const ta = document.createElement("textarea");\n      ta.value = text;\n      ta.setAttribute("readonly", "");\n      ta.style.position = "fixed";\n      ta.style.top = "-9999px";\n      ta.style.opacity = "0";\n      document.body.appendChild(ta);\n      ta.select();\n      ta.setSelectionRange(0, ta.value.length);\n      const ok = document.execCommand("copy");\n      document.body.removeChild(ta);\n      if (ok) {\n        log(`Copied ${label} to clipboard (${text.length} chars).`);\n      } else {\n        throw new Error("execCommand(copy) returned false");\n      }\n    } catch (_err) {\n      try {\n        const anyNavigator = navigator;\n        if (anyNavigator.permissions && anyNavigator.permissions.query) {\n          const perm = await anyNavigator.permissions.query({ name: "clipboard-write" });\n          if (perm.state === "granted" || perm.state === "prompt") {\n            await navigator.clipboard.writeText((_b = el == null ? void 0 : el.textContent) != null ? _b : "");\n            log(`Copied ${label} to clipboard.`);\n            return;\n          }\n        }\n      } catch (e) {\n      }\n      log(`Could not copy ${label}.`);\n    }\n  }\n  function autoFitOnce() {\n    var contentW = Math.max(\n      document.documentElement.scrollWidth,\n      document.body ? document.body.scrollWidth : 0\n    );\n    var contentH = Math.max(\n      document.documentElement.scrollHeight,\n      document.body ? document.body.scrollHeight : 0\n    );\n    var vw = window.innerWidth;\n    var vh = window.innerHeight;\n    var needsW = contentW > vw ? contentW : vw;\n    var needsH = contentH > vh ? contentH : vh;\n    if (needsW > vw || needsH > vh) {\n      postResize(needsW, needsH);\n    }\n  }\n  (function wireDragHandle() {\n    var handle = document.getElementById("resizeHandle");\n    if (!handle) return;\n    var dragging = false;\n    var startX = 0, startY = 0;\n    var startW = 0, startH = 0;\n    var raf = 0;\n    var loggedOnce = false;\n    function onMouseMove(e) {\n      if (!dragging) return;\n      if (raf) return;\n      raf = window.requestAnimationFrame(function() {\n        var _a, _b;\n        raf = 0;\n        var dx = e.clientX - startX;\n        var dy = e.clientY - startY;\n        var targetW = startW + dx;\n        var targetH = startH + dy;\n        if (!loggedOnce) {\n          loggedOnce = true;\n          try {\n            (_b = (_a = window.console) == null ? void 0 : _a.log) == null ? void 0 : _b.call(_a, "UI_RESIZE \\u2192", targetW, targetH);\n          } catch (_e) {\n          }\n        }\n        postResize(targetW, targetH);\n      });\n    }\n    function onMouseUp() {\n      if (!dragging) return;\n      dragging = false;\n      document.body.style.userSelect = "";\n      window.removeEventListener("mousemove", onMouseMove);\n      window.removeEventListener("mouseup", onMouseUp);\n    }\n    handle.addEventListener("mousedown", function(e) {\n      dragging = true;\n      startX = e.clientX;\n      startY = e.clientY;\n      startW = window.innerWidth;\n      startH = window.innerHeight;\n      loggedOnce = false;\n      document.body.style.userSelect = "none";\n      window.addEventListener("mousemove", onMouseMove);\n      window.addEventListener("mouseup", onMouseUp);\n      e.preventDefault();\n    });\n  })();\n  var currentCollections = [];\n  function log(msg) {\n    const t = (/* @__PURE__ */ new Date()).toLocaleTimeString();\n    const line = document.createElement("div");\n    line.textContent = "[" + t + "] " + msg;\n    if (logEl && logEl instanceof HTMLElement) {\n      logEl.appendChild(line);\n      logEl.scrollTop = logEl.scrollHeight;\n    }\n  }\n  function postToPlugin(message) {\n    parent.postMessage({ pluginMessage: message }, "*");\n  }\n  function clearSelect(sel) {\n    while (sel.options.length > 0) sel.remove(0);\n  }\n  function setDisabledStates() {\n    if (importBtn && fileInput && importBtn instanceof HTMLButtonElement && fileInput instanceof HTMLInputElement) {\n      const hasFile = !!(fileInput.files && fileInput.files.length > 0);\n      importBtn.disabled = !hasFile;\n    }\n    if (exportBtn && exportAllChk && collectionSelect && modeSelect && exportPickers && exportBtn instanceof HTMLButtonElement && exportAllChk instanceof HTMLInputElement && collectionSelect instanceof HTMLSelectElement && modeSelect instanceof HTMLSelectElement && exportPickers instanceof HTMLElement) {\n      const exportAll = !!exportAllChk.checked;\n      if (exportAll) {\n        exportBtn.disabled = false;\n        exportPickers.style.opacity = "0.5";\n      } else {\n        exportPickers.style.opacity = "1";\n        const hasSelection = collectionSelect.value.length > 0 && modeSelect.value.length > 0;\n        exportBtn.disabled = !hasSelection;\n      }\n    }\n  }\n  function populateCollections(data) {\n    currentCollections = data.collections;\n    if (!(collectionSelect && modeSelect)) return;\n    if (!(collectionSelect instanceof HTMLSelectElement && modeSelect instanceof HTMLSelectElement)) return;\n    clearSelect(collectionSelect);\n    let i = 0;\n    for (i = 0; i < data.collections.length; i++) {\n      const c = data.collections[i];\n      const opt = document.createElement("option");\n      opt.value = c.name;\n      opt.textContent = c.name;\n      collectionSelect.appendChild(opt);\n    }\n    onCollectionChange();\n  }\n  function onCollectionChange() {\n    if (!(collectionSelect && modeSelect)) return;\n    if (!(collectionSelect instanceof HTMLSelectElement && modeSelect instanceof HTMLSelectElement)) return;\n    const selected = collectionSelect.value;\n    clearSelect(modeSelect);\n    let i = 0;\n    for (i = 0; i < currentCollections.length; i++) {\n      const c = currentCollections[i];\n      if (c.name === selected) {\n        let j = 0;\n        for (j = 0; j < c.modes.length; j++) {\n          const m = c.modes[j];\n          const opt = document.createElement("option");\n          opt.value = m.name;\n          opt.textContent = m.name;\n          modeSelect.appendChild(opt);\n        }\n        break;\n      }\n    }\n    setDisabledStates();\n  }\n  function applyLastSelection(last) {\n    if (!last) return;\n    if (!(collectionSelect && modeSelect)) return;\n    if (!(collectionSelect instanceof HTMLSelectElement && modeSelect instanceof HTMLSelectElement)) return;\n    let i = 0;\n    let found = false;\n    for (i = 0; i < collectionSelect.options.length; i++) {\n      if (collectionSelect.options[i].value === last.collection) {\n        collectionSelect.selectedIndex = i;\n        found = true;\n        break;\n      }\n    }\n    onCollectionChange();\n    if (found) {\n      let j = 0;\n      for (j = 0; j < modeSelect.options.length; j++) {\n        if (modeSelect.options[j].value === last.mode) {\n          modeSelect.selectedIndex = j;\n          break;\n        }\n      }\n    }\n    setDisabledStates();\n  }\n  function prettyJson(obj) {\n    try {\n      return JSON.stringify(obj, null, 2);\n    } catch (_e) {\n      return String(obj);\n    }\n  }\n  function requestPreviewForCurrent() {\n    if (!(collectionSelect instanceof HTMLSelectElement) || !(modeSelect instanceof HTMLSelectElement)) return;\n    const collection = collectionSelect.value || "";\n    const mode = modeSelect.value || "";\n    if (!collection || !mode) {\n      if (w3cPreviewEl) w3cPreviewEl.textContent = "{ /* select a collection & mode to preview */ }";\n      return;\n    }\n    postToPlugin({ type: "PREVIEW_REQUEST", payload: { collection, mode } });\n  }\n  if (fileInput && fileInput instanceof HTMLInputElement) {\n    fileInput.addEventListener("change", setDisabledStates);\n  }\n  if (exportAllChk && exportAllChk instanceof HTMLInputElement) {\n    exportAllChk.addEventListener("change", function() {\n      setDisabledStates();\n      postToPlugin({ type: "SAVE_PREFS", payload: { exportAll: !!exportAllChk.checked } });\n    });\n  }\n  if (refreshBtn && refreshBtn instanceof HTMLButtonElement) {\n    refreshBtn.addEventListener("click", function() {\n      postToPlugin({ type: "FETCH_COLLECTIONS" });\n    });\n  }\n  if (importBtn && importBtn instanceof HTMLButtonElement && fileInput && fileInput instanceof HTMLInputElement) {\n    importBtn.addEventListener("click", function() {\n      if (!fileInput.files || fileInput.files.length === 0) {\n        log("Select a JSON file first.");\n        return;\n      }\n      const reader = new FileReader();\n      reader.onload = function() {\n        try {\n          const text = String(reader.result);\n          const json = JSON.parse(text);\n          if (json && typeof json === "object" && !(json instanceof Array)) {\n            postToPlugin({ type: "IMPORT_DTCG", payload: { json } });\n            log("Import requested.");\n          } else {\n            log("Invalid JSON structure for tokens (expected an object).");\n          }\n        } catch (e) {\n          const msg = e instanceof Error ? e.message : String(e);\n          log("Failed to parse JSON: " + msg);\n        }\n      };\n      reader.readAsText(fileInput.files[0]);\n    });\n  }\n  if (exportBtn && exportBtn instanceof HTMLButtonElement) {\n    exportBtn.addEventListener("click", function() {\n      let exportAll = false;\n      if (exportAllChk && exportAllChk instanceof HTMLInputElement) exportAll = !!exportAllChk.checked;\n      const payload = { exportAll };\n      if (!exportAll && collectionSelect && modeSelect && collectionSelect instanceof HTMLSelectElement && modeSelect instanceof HTMLSelectElement) {\n        payload.collection = collectionSelect.value;\n        payload.mode = modeSelect.value;\n        if (!(payload.collection && payload.mode)) {\n          log(\'Pick collection and mode or use "Export all".\');\n          return;\n        }\n      }\n      postToPlugin({ type: "EXPORT_DTCG", payload });\n      if (exportAll) log("Export all requested.");\n      else log(\'Export requested for "\' + (payload.collection || "") + \'" / "\' + (payload.mode || "") + \'".\');\n    });\n  }\n  if (drawerToggleBtn && drawerToggleBtn instanceof HTMLButtonElement) {\n    drawerToggleBtn.addEventListener("click", function() {\n      var current = drawerToggleBtn.getAttribute("aria-expanded") === "true";\n      setDrawerOpen(!current);\n    });\n  }\n  if (collectionSelect && collectionSelect instanceof HTMLSelectElement) {\n    collectionSelect.addEventListener("change", function() {\n      onCollectionChange();\n      if (collectionSelect instanceof HTMLSelectElement && modeSelect instanceof HTMLSelectElement) {\n        postToPlugin({ type: "SAVE_LAST", payload: { collection: collectionSelect.value, mode: modeSelect.value } });\n        requestPreviewForCurrent();\n      }\n    });\n  }\n  if (modeSelect && modeSelect instanceof HTMLSelectElement) {\n    modeSelect.addEventListener("change", function() {\n      if (collectionSelect instanceof HTMLSelectElement && modeSelect instanceof HTMLSelectElement) {\n        postToPlugin({ type: "SAVE_LAST", payload: { collection: collectionSelect.value, mode: modeSelect.value } });\n      }\n      setDisabledStates();\n      requestPreviewForCurrent();\n    });\n  }\n  if (copyRawBtn) copyRawBtn.addEventListener(\n    "click",\n    () => copyElText(document.getElementById("raw"), "Raw Figma Collections")\n  );\n  if (copyW3cBtn) copyW3cBtn.addEventListener(\n    "click",\n    () => copyElText(document.getElementById("w3cPreview"), "W3C Preview")\n  );\n  if (copyLogBtn) copyLogBtn.addEventListener(\n    "click",\n    () => copyElText(document.getElementById("log"), "Log")\n  );\n  function setDrawerOpen(open) {\n    if (shellEl && shellEl instanceof HTMLElement) {\n      if (open) {\n        shellEl.classList.remove("drawer-collapsed");\n      } else {\n        shellEl.classList.add("drawer-collapsed");\n      }\n    }\n    if (drawerToggleBtn && drawerToggleBtn instanceof HTMLButtonElement) {\n      drawerToggleBtn.setAttribute("aria-expanded", open ? "true" : "false");\n      drawerToggleBtn.textContent = open ? "Hide" : "Show";\n      drawerToggleBtn.title = open ? "Hide log" : "Show log";\n    }\n    try {\n      window.localStorage.setItem("drawerOpen", open ? "1" : "0");\n    } catch (_e) {\n    }\n  }\n  function getSavedDrawerOpen() {\n    try {\n      var v = window.localStorage.getItem("drawerOpen");\n      if (v === "0") return false;\n      if (v === "1") return true;\n    } catch (_e) {\n    }\n    return true;\n  }\n  window.onmessage = function(event) {\n    const data = event.data;\n    if (!data || typeof data !== "object") return;\n    let msg = null;\n    if (data.pluginMessage && typeof data.pluginMessage === "object") {\n      const maybe = data.pluginMessage;\n      if (maybe && typeof maybe.type === "string") {\n        msg = data.pluginMessage;\n      }\n    }\n    if (!msg) return;\n    if (msg.type === "ERROR") {\n      log("ERROR: " + msg.payload.message);\n      return;\n    }\n    if (msg.type === "INFO") {\n      log(msg.payload.message);\n      return;\n    }\n    if (msg.type === "EXPORT_RESULT") {\n      for (let k = 0; k < msg.payload.files.length; k++) {\n        const f = msg.payload.files[k];\n        const a = document.createElement("a");\n        const blob = new Blob([prettyJson(f.json)], { type: "application/json" });\n        a.href = URL.createObjectURL(blob);\n        a.download = f.name;\n        a.textContent = "Download " + f.name;\n        const div = document.createElement("div");\n        div.appendChild(a);\n        if (logEl && logEl instanceof HTMLElement) logEl.appendChild(div);\n      }\n      log("Export ready.");\n      return;\n    }\n    if (msg.type === "W3C_PREVIEW") {\n      const header = `/* ${msg.payload.name} */\n`;\n      if (w3cPreviewEl) w3cPreviewEl.textContent = header + prettyJson(msg.payload.json);\n      return;\n    }\n    if (msg.type === "COLLECTIONS_DATA") {\n      populateCollections({ collections: msg.payload.collections });\n      if (exportAllChk && exportAllChk instanceof HTMLInputElement) {\n        exportAllChk.checked = !!msg.payload.exportAllPref;\n      }\n      if (typeof msg.payload.drawerOpenPref === "boolean") {\n        setDrawerOpen(msg.payload.drawerOpenPref);\n      }\n      applyLastSelection(msg.payload.last);\n      setDisabledStates();\n      requestPreviewForCurrent();\n      return;\n    }\n    if (msg.type === "RAW_COLLECTIONS_TEXT") {\n      if (rawEl && rawEl instanceof HTMLElement) rawEl.textContent = msg.payload.text;\n      return;\n    }\n  };\n  document.addEventListener("DOMContentLoaded", function() {\n    if (rawEl && rawEl instanceof HTMLElement) rawEl.textContent = "Loading variable collections\\u2026";\n    setDisabledStates();\n    setDrawerOpen(getSavedDrawerOpen());\n    postToPlugin({ type: "UI_READY" });\n    autoFitOnce();\n  });\n})();\n//# sourceMappingURL=ui.js.map\n<\/script>\n</body>\n\n</html>', { width: w, height: h });
  })();
  function send(msg) {
    figma.ui.postMessage(msg);
  }
  async function snapshotCollectionsForUi() {
    if (typeof figma.editorType !== "string" || figma.editorType !== "figma") {
      return {
        collections: [],
        rawText: "Variables API is not available in this editor.\nOpen a Figma Design file (not FigJam) and try again."
      };
    }
    if (typeof figma.variables === "undefined" || typeof figma.variables.getLocalVariableCollectionsAsync !== "function" || typeof figma.variables.getVariableByIdAsync !== "function") {
      return {
        collections: [],
        rawText: "Variables API methods not found. Ensure your Figma version supports Variables and try again."
      };
    }
    const locals = await figma.variables.getLocalVariableCollectionsAsync();
    const out = [];
    const rawLines = [];
    let i = 0;
    for (i = 0; i < locals.length; i++) {
      const c = locals[i];
      if (!c) continue;
      const modes = [];
      let mi = 0;
      for (mi = 0; mi < c.modes.length; mi++) {
        const m = c.modes[mi];
        modes.push({ id: m.modeId, name: m.name });
      }
      const varsList = [];
      let vi = 0;
      for (vi = 0; vi < c.variableIds.length; vi++) {
        const varId = c.variableIds[vi];
        const v = await figma.variables.getVariableByIdAsync(varId);
        if (!v) continue;
        varsList.push({ id: v.id, name: v.name, type: v.resolvedType });
      }
      out.push({ id: c.id, name: c.name, modes, variables: varsList });
      rawLines.push("Collection: " + c.name + " (" + c.id + ")");
      const modeNames = [];
      let zi = 0;
      for (zi = 0; zi < modes.length; zi++) modeNames.push(modes[zi].name);
      rawLines.push("  Modes: " + (modeNames.length > 0 ? modeNames.join(", ") : "(none)"));
      rawLines.push("  Variables (" + String(varsList.length) + "):");
      let qi = 0;
      for (qi = 0; qi < varsList.length; qi++) rawLines.push("    - " + varsList[qi].name + " [" + varsList[qi].type + "]");
      rawLines.push("");
    }
    if (out.length === 0) {
      rawLines.push("No local Variable Collections found.");
      rawLines.push("Create one in the Variables panel, then press Refresh.");
    }
    return { collections: out, rawText: rawLines.join("\n") };
  }
  function safeKeyFromCollectionAndMode(collectionName, modeName) {
    const base = collectionName + "/mode=" + modeName;
    let i = 0, out = "";
    for (i = 0; i < base.length; i++) {
      const ch = base.charAt(i);
      if (ch === "/" || ch === "\\" || ch === ":") out += "_";
      else out += ch;
    }
    return out;
  }
  figma.ui.onmessage = async (msg) => {
    try {
      if (msg.type === "UI_READY") {
        const snap = await snapshotCollectionsForUi();
        const last = await figma.clientStorage.getAsync("lastSelection").catch(function() {
          return null;
        });
        const exportAllPrefVal = await figma.clientStorage.getAsync("exportAllPref").catch(function() {
          return false;
        });
        const lastOrNull = last && typeof last.collection === "string" && typeof last.mode === "string" ? last : null;
        send({ type: "INFO", payload: { message: "Fetched " + String(snap.collections.length) + " collections (initial)" } });
        send({ type: "COLLECTIONS_DATA", payload: { collections: snap.collections, last: lastOrNull, exportAllPref: !!exportAllPrefVal } });
        send({ type: "RAW_COLLECTIONS_TEXT", payload: { text: snap.rawText } });
        return;
      }
      if (msg.type === "FETCH_COLLECTIONS") {
        const snapshot = await snapshotCollectionsForUi();
        const last = await figma.clientStorage.getAsync("lastSelection").catch(function() {
          return null;
        });
        const exportAllPrefVal = await figma.clientStorage.getAsync("exportAllPref").catch(function() {
          return false;
        });
        const lastOrNull = last && typeof last.collection === "string" && typeof last.mode === "string" ? last : null;
        send({ type: "INFO", payload: { message: "Fetched " + String(snapshot.collections.length) + " collections" } });
        send({ type: "COLLECTIONS_DATA", payload: { collections: snapshot.collections, last: lastOrNull, exportAllPref: !!exportAllPrefVal } });
        send({ type: "RAW_COLLECTIONS_TEXT", payload: { text: snapshot.rawText } });
        return;
      }
      if (msg.type === "IMPORT_DTCG") {
        await importDtcg(msg.payload.json);
        send({ type: "INFO", payload: { message: "Import completed." } });
        const snap2 = await snapshotCollectionsForUi();
        const last = await figma.clientStorage.getAsync("lastSelection").catch(function() {
          return null;
        });
        const exportAllPrefVal = await figma.clientStorage.getAsync("exportAllPref").catch(function() {
          return false;
        });
        const lastOrNull = last && typeof last.collection === "string" && typeof last.mode === "string" ? last : null;
        send({ type: "COLLECTIONS_DATA", payload: { collections: snap2.collections, last: lastOrNull, exportAllPref: !!exportAllPrefVal } });
        send({ type: "RAW_COLLECTIONS_TEXT", payload: { text: snap2.rawText } });
        return;
      }
      if (msg.type === "EXPORT_DTCG") {
        const exportAll = !!msg.payload.exportAll;
        if (exportAll) {
          const all = await exportDtcg({ format: "single" });
          send({ type: "EXPORT_RESULT", payload: { files: all.files } });
          return;
        }
        const collectionName = msg.payload.collection ? msg.payload.collection : "";
        const modeName = msg.payload.mode ? msg.payload.mode : "";
        const per = await exportDtcg({ format: "perMode" });
        const key = safeKeyFromCollectionAndMode(collectionName, modeName);
        const picked = [];
        let i2 = 0;
        for (i2 = 0; i2 < per.files.length; i2++) if (per.files[i2].name.indexOf(key) !== -1) picked.push(per.files[i2]);
        send({ type: "EXPORT_RESULT", payload: { files: picked.length > 0 ? picked : per.files } });
        return;
      }
      if (msg.type === "SAVE_LAST") {
        if (msg.payload && typeof msg.payload.collection === "string" && typeof msg.payload.mode === "string") {
          await figma.clientStorage.setAsync("lastSelection", { collection: msg.payload.collection, mode: msg.payload.mode });
        }
        return;
      }
      if (msg.type === "SAVE_PREFS") {
        await figma.clientStorage.setAsync("exportAllPref", !!msg.payload.exportAll);
        return;
      }
      if (msg.type === "UI_RESIZE") {
        var w = Math.max(720, Math.min(1600, Math.floor(msg.payload.width)));
        var h = Math.max(420, Math.min(1200, Math.floor(msg.payload.height)));
        figma.ui.resize(w, h);
        try {
          await figma.clientStorage.setAsync("uiSize", { width: w, height: h });
        } catch (_err) {
        }
        return;
      }
      if (msg.type === "PREVIEW_REQUEST") {
        const collectionName = msg.payload.collection ? String(msg.payload.collection) : "";
        const modeName = msg.payload.mode ? String(msg.payload.mode) : "";
        const per = await exportDtcg({ format: "perMode" });
        const key = safeKeyFromCollectionAndMode(collectionName, modeName);
        let picked = per.files.find((f) => f.name.indexOf(key) !== -1);
        if (!picked) picked = per.files[0];
        if (!picked) picked = { name: "tokens-empty.json", json: {} };
        send({ type: "W3C_PREVIEW", payload: { name: picked.name, json: picked.json } });
        return;
      }
    } catch (e) {
      var message = "Unknown error";
      if (e && e.message) message = e.message;
      figma.notify("Plugin error: " + message, { timeout: 4e3 });
      send({ type: "ERROR", payload: { message } });
      console.error(e);
    }
  };
})();
//# sourceMappingURL=main.js.map
