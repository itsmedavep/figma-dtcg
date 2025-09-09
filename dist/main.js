"use strict";
(() => {
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
  function toAliasString(path) {
    return "{" + toDot(path) + "}";
  }
  function parseAliasString(s) {
    if (typeof s !== "string") return null;
    if (s.length < 3) return null;
    if (s.charAt(0) !== "{" || s.charAt(s.length - 1) !== "}") return null;
    var inner = s.substring(1, s.length - 1);
    if (!inner) return null;
    return inner.split(".");
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

  // src/core/ir.ts
  function ctxKey(collection, mode) {
    return collection + "/" + mode;
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

  // src/adapters/dtcg-reader.ts
  function guessTypeFromValue(v) {
    if (typeof v === "number") return "number";
    if (typeof v === "string") return "string";
    if (typeof v === "boolean") return "boolean";
    return "string";
  }
  function isColorObject(obj) {
    return !!obj && typeof obj === "object" && (typeof obj.colorSpace === "string" || obj.components instanceof Array || typeof obj.hex === "string");
  }
  function hasKey(o, k) {
    return !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);
  }
  function toNumber(x, def) {
    return typeof x === "number" ? x : def;
  }
  function parseColorSpaceUnion(x) {
    if (x === "srgb") return "srgb";
    if (x === "display-p3") return "display-p3";
    return "srgb";
  }
  function readColorValue(raw) {
    if (typeof raw === "string") {
      return hexToDtcgColor(raw);
    }
    var obj = raw;
    var cs = parseColorSpaceUnion(obj.colorSpace);
    var comps = [0, 0, 0];
    if (obj.components && obj.components.length >= 3) {
      comps = [toNumber(obj.components[0], 0), toNumber(obj.components[1], 0), toNumber(obj.components[2], 0)];
    }
    var alpha = typeof obj.alpha === "number" ? obj.alpha : void 0;
    var hex = typeof obj.hex === "string" ? obj.hex : void 0;
    return { colorSpace: cs, components: comps, alpha, hex };
  }
  function readDtcgToIR(root) {
    var tokens = [];
    var defaultCtx = ctxKey("tokens", "default");
    function visit(obj, path, inheritedType) {
      if (!obj || typeof obj !== "object") return;
      var groupType = inheritedType;
      if (hasKey(obj, "$type") && typeof obj.$type === "string") {
        var t = String(obj.$type);
        if (t === "color" || t === "number" || t === "string" || t === "boolean") groupType = t;
      }
      if (hasKey(obj, "$value")) {
        var rawVal = obj.$value;
        if (typeof rawVal === "string") {
          var ref = parseAliasString(rawVal);
          if (ref && ref.length > 0) {
            tokens.push({
              path: path.slice(0),
              type: groupType ? groupType : "string",
              byContext: (function() {
                var o = {};
                o[defaultCtx] = { kind: "alias", path: ref };
                return o;
              })()
            });
            return;
          }
        }
        if (isColorObject(rawVal) || typeof rawVal === "string") {
          var value = readColorValue(rawVal);
          tokens.push({
            path: path.slice(0),
            type: "color",
            byContext: (function() {
              var o = {};
              o[defaultCtx] = { kind: "color", value };
              return o;
            })()
          });
          return;
        }
        var t2 = groupType ? groupType : guessTypeFromValue(rawVal);
        var valObj = null;
        if (t2 === "number" && typeof rawVal === "number") valObj = { kind: "number", value: rawVal };
        else if (t2 === "boolean" && typeof rawVal === "boolean") valObj = { kind: "boolean", value: rawVal };
        else if (t2 === "string" && typeof rawVal === "string") valObj = { kind: "string", value: rawVal };
        else if (typeof rawVal === "string") valObj = { kind: "string", value: rawVal };
        else if (typeof rawVal === "number") valObj = { kind: "number", value: rawVal };
        else if (typeof rawVal === "boolean") valObj = { kind: "boolean", value: rawVal };
        if (valObj) {
          tokens.push({
            path: path.slice(0),
            type: t2,
            byContext: (function() {
              var o = {};
              o[defaultCtx] = valObj;
              return o;
            })()
          });
        }
        return;
      }
      var k;
      for (k in obj) {
        if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
        if (k.length > 0 && k.charAt(0) === "$") continue;
        var child = obj[k];
        var newPath = path.concat([slugSegment(k)]);
        visit(child, newPath, groupType);
      }
    }
    visit(root, [], null);
    return { tokens };
  }

  // src/adapters/dtcg-writer.ts
  function serialize(graph, _opts) {
    var root = {};
    var i = 0;
    for (i = 0; i < graph.tokens.length; i++) {
      var t = graph.tokens[i];
      writeTokenInto(root, t);
    }
    return { json: root };
  }
  function writeTokenInto(root, t) {
    var obj = root;
    var i = 0;
    for (i = 0; i < t.path.length - 1; i++) {
      var seg = t.path[i];
      var next = obj[seg];
      if (!next || typeof next !== "object") {
        next = {};
        obj[seg] = next;
      }
      obj = next;
    }
    var leaf = t.path[t.path.length - 1];
    var tokenObj = {};
    tokenObj["$type"] = t.type;
    var ctxKeys = keysOf(t.byContext);
    var chosen = ctxKeys.length > 0 ? t.byContext[ctxKeys[0]] : null;
    if (chosen) {
      if (chosen.kind === "alias") {
        tokenObj["$value"] = toAliasString(chosen.path);
      } else if (chosen.kind === "color") {
        var cv = chosen.value;
        var out = {};
        out["colorSpace"] = cv.colorSpace;
        out["components"] = [cv.components[0], cv.components[1], cv.components[2]];
        if (typeof cv.alpha === "number") out["alpha"] = cv.alpha;
        if (typeof cv.hex === "string") out["hex"] = cv.hex;
        tokenObj["$value"] = out;
      } else if (chosen.kind === "number") {
        tokenObj["$value"] = chosen.value;
      } else if (chosen.kind === "string") {
        tokenObj["$value"] = chosen.value;
      } else if (chosen.kind === "boolean") {
        tokenObj["$value"] = chosen.value;
      }
    }
    if (t.description) tokenObj["$description"] = t.description;
    if (t.extensions) tokenObj["$extensions"] = t.extensions;
    obj[leaf] = tokenObj;
  }
  function keysOf(o) {
    var out = [];
    var k;
    for (k in o) if (Object.prototype.hasOwnProperty.call(o, k)) out.push(k);
    return out;
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
    var profile = figma.root.documentColorProfile;
    var variablesApi = figma.variables;
    var collections = await variablesApi.getLocalVariableCollectionsAsync();
    var varMeta = {};
    var ci = 0;
    for (ci = 0; ci < collections.length; ci++) {
      var col = collections[ci];
      var vi = 0;
      for (vi = 0; vi < col.variableIds.length; vi++) {
        var id = col.variableIds[vi];
        var v = await variablesApi.getVariableByIdAsync(id);
        if (v) varMeta[v.id] = { name: v.name, collectionId: col.id };
      }
    }
    var tokens = [];
    for (ci = 0; ci < collections.length; ci++) {
      var c = collections[ci];
      var mi = 0;
      var modeNameById = {};
      for (mi = 0; mi < c.modes.length; mi++) modeNameById[c.modes[mi].modeId] = c.modes[mi].name;
      var vi2 = 0;
      for (vi2 = 0; vi2 < c.variableIds.length; vi2++) {
        var vid = c.variableIds[vi2];
        var v2 = await variablesApi.getVariableByIdAsync(vid);
        if (!v2) continue;
        var path = canonicalPath(c.name, v2.name);
        var type = mapType(v2.resolvedType);
        var byContext = {};
        var mi2 = 0;
        for (mi2 = 0; mi2 < c.modes.length; mi2++) {
          var md = c.modes[mi2];
          var ctx = ctxKey(c.name, md.name);
          var mv = v2.valuesByMode[md.modeId];
          if (isAliasValue(mv)) {
            var target = await variablesApi.getVariableByIdAsync(mv.id);
            if (target) {
              var meta = varMeta[target.id];
              var collName = meta ? collections.filter(function(cc) {
                return cc.id === meta.collectionId;
              }).map(function(cc) {
                return cc.name;
              })[0] : c.name;
              var aPath = canonicalPath(collName, target.name);
              byContext[ctx] = { kind: "alias", path: aPath };
            }
            continue;
          }
          if (type === "color" && isRGBA(mv)) {
            var cv = figmaRGBAToDtcg({ r: mv.r, g: mv.g, b: mv.b, a: mv.a }, profile);
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
        tokens.push({ path, type, byContext });
      }
    }
    return { tokens };
  }

  // src/adapters/figma-writer.ts
  function resolvedTypeFor(t) {
    if (t === "color") return "COLOR";
    if (t === "number") return "FLOAT";
    if (t === "string") return "STRING";
    return "BOOLEAN";
  }
  function forEachKey(obj) {
    var out = [];
    var k;
    for (k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) out.push(k);
    return out;
  }
  async function writeIRToFigma(graph) {
    var profile = figma.root.documentColorProfile;
    var variablesApi = figma.variables;
    var existing = await variablesApi.getLocalVariableCollectionsAsync();
    var colByName = {};
    var ci = 0;
    for (ci = 0; ci < existing.length; ci++) colByName[existing[ci].name] = existing[ci];
    var idByPath = {};
    var i = 0;
    for (i = 0; i < graph.tokens.length; i++) {
      var t = graph.tokens[i];
      if (t.path.length < 1) continue;
      var collectionName = t.path[0];
      var collection = colByName[collectionName];
      if (!collection) {
        collection = variablesApi.createVariableCollection(collectionName);
        colByName[collectionName] = collection;
      }
      var j = 1, varName = "";
      for (j = 1; j < t.path.length; j++) {
        if (j > 1) varName += "/";
        varName += t.path[j];
      }
      var existingVarId = null;
      var k = 0;
      for (k = 0; k < collection.variableIds.length; k++) {
        var cand = await variablesApi.getVariableByIdAsync(collection.variableIds[k]);
        if (cand && cand.name === varName) {
          existingVarId = cand.id;
          break;
        }
      }
      var createdOrFound;
      if (existingVarId) {
        var got = await variablesApi.getVariableByIdAsync(existingVarId);
        if (!got) continue;
        createdOrFound = got;
      } else {
        var variableType = resolvedTypeFor(t.type);
        createdOrFound = variablesApi.createVariable(varName, collection, variableType);
      }
      idByPath[toDot(t.path)] = createdOrFound.id;
    }
    var modeIdByKey = {};
    var cols = await variablesApi.getLocalVariableCollectionsAsync();
    var cii = 0;
    for (cii = 0; cii < cols.length; cii++) {
      var c = cols[cii];
      var mi = 0;
      for (mi = 0; mi < c.modes.length; mi++) {
        var k2 = c.name + "/" + c.modes[mi].name;
        modeIdByKey[k2] = c.modes[mi].modeId;
      }
    }
    for (i = 0; i < graph.tokens.length; i++) {
      var node = graph.tokens[i];
      var dot = toDot(node.path);
      var varId = idByPath[dot];
      if (!varId) continue;
      var targetVar = await variablesApi.getVariableByIdAsync(varId);
      if (!targetVar) continue;
      var ctxKeys = forEachKey(node.byContext);
      var z = 0;
      for (z = 0; z < ctxKeys.length; z++) {
        var ctx = ctxKeys[z];
        var val = node.byContext[ctx];
        var modeId = modeIdByKey[ctx];
        if (!modeId) continue;
        if (val.kind === "alias") {
          var targetId = idByPath[toDot(val.path)];
          if (!targetId) continue;
          var alias = await variablesApi.createVariableAliasByIdAsync(targetId);
          targetVar.setValueForMode(modeId, alias);
        } else if (val.kind === "color") {
          var rgba = dtcgToFigmaRGBA(val.value, profile);
          targetVar.setValueForMode(modeId, { r: rgba.r, g: rgba.g, b: rgba.b, a: rgba.a });
        } else if (val.kind === "number") {
          targetVar.setValueForMode(modeId, val.value);
        } else if (val.kind === "string") {
          targetVar.setValueForMode(modeId, val.value);
        } else if (val.kind === "boolean") {
          targetVar.setValueForMode(modeId, val.value);
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
    figma.showUI(`<!doctype html>
<html>

<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>DTCG Import/Export</title>
  <style>
    :root {
      --bg: #ffffff;
      --ink: #111827;
      --ink-subtle: #4b5563;
      --ink-muted: #6b7280;
      --surface: #f9fafb;
      --accent: #0051ff;
      --accent-ink: #dfdfdf;
      --border: #e5e7eb;
      --drawer-h: 260px;
      /* bottom log drawer height */
      --drawer-collapsed-h: 28px;
      /* slim bar height when collapsed */
    }

    html,
    body {
      height: 100%;
      margin: 0;
    }

    body {
      background: var(--bg);
      color: var(--ink);
      font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
      line-height: 1.4;
    }

    /* Two-row grid: main content + bottom drawer */
    .shell {
      height: 100vh;
      width: 100%;
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr) minmax(0, 1fr);
      grid-template-rows: 1fr var(--drawer-h);
      gap: 12px;
      padding: 12px;
      box-sizing: border-box;
      grid-auto-flow: row;
      /* rows fill before columns */
    }

    .shell.drawer-collapsed {
      grid-template-rows: 1fr var(--drawer-collapsed-h);
    }

    /* Hide drawer body when collapsed */
    .shell.drawer-collapsed .drawer .drawer-body {
      display: none;
    }

    /* Drawer toggle button */
    .drawer-toggle {
      padding: 6px 10px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: #fff;
      color: var(--ink);
      font-size: 12px;
      cursor: pointer;
    }

    .drawer-toggle:hover {
      background: #f3f4f6;
    }

    .col {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
    }

    .panel {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      flex: 1;
      border: 1px solid var(--border);
      background: var(--surface);
      border-radius: 10px;
      padding: .5rem;
    }

    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 12px 4px 12px;
      border-bottom: 1px solid var(--border);
    }

    .eyebrow {
      font-size: 11px;
      letter-spacing: .06em;
      text-transform: uppercase;
      color: var(--ink-muted);
      margin: 0 0 2px 0;
    }

    .title {
      font-size: 16px;
      font-weight: 700;
      margin: 0;
    }

    .panel-body {
      padding: .25rem;
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-width: 0;
      min-height: 0;
      flex: 1;
    }

    .row {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .row>* {
      flex: 1;
      min-width: 0;
    }

    label {
      font-size: 12px;
      color: var(--ink-subtle);
      display: block;
      margin-bottom: 4px;
    }

    input[type="text"],
    select,
    input[type="file"] {
      width: 100%;
      padding: 8px;
      border: 1px solid var(--border);
      border-radius: 8px;
      background: #fff;
      color: var(--ink);
      font-size: 12px;
      box-sizing: border-box;
    }

    button {
      padding: 10px 12px;
      border: 0;
      border-radius: 10px;
      background: var(--accent);
      color: var(--accent-ink);
      font-weight: 600;
      cursor: pointer;
      font-size: 13px;
    }

    button[disabled] {
      opacity: .5;
      cursor: not-allowed;
    }

    .muted {
      color: var(--ink-muted);
      font-size: 12px;
    }

    /* Monospace content panes (raw + preview) */
    pre {
      margin: 0;
      padding: .5rem;
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 8px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
      font-size: 11px;
      white-space: pre-wrap;
      /* preserve newlines but allow wrapping */
      overflow-wrap: anywhere;
      /* break long tokens/paths */
      word-break: break-word;
      overflow: auto;
      min-width: 0;
      min-height: 0;
      flex: 1;
      height: 100%;
    }

    .stack {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .row-center {
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: space-between;
    }

    #refreshBtn {
      margin: .5rem auto;
      width: 45%;
      border-radius: .25rem;
      background: #6b7280;
    }

    /* Bottom drawer (Log) spans all columns */
    .drawer {
      grid-column: 1 / -1;
      grid-row: 2;
      display: flex;
      flex-direction: column;
      min-height: 0;
      min-width: 0;
      border: 1px solid var(--border);
      background: var(--surface);
      border-radius: 10px;
      padding: .5rem;
    }

    .drawer .panel-header {
      border-bottom: 1px solid var(--border);
    }

    .drawer-body {
      padding: .25rem;
      min-height: 0;
      min-width: 0;
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    /* Log content area */
    #log {
      padding: .5rem;
      background: #fff;
      border: 1px solid var(--border);
      border-radius: 8px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
      font-size: 11px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      word-break: break-word;
      overflow: auto;
      min-width: 0;
      min-height: 0;
      flex: 1;
      height: 100%;
    }

    /* Allow an on-canvas resize handle */
    .resize-handle {
      position: fixed;
      /* inside the iframe viewport */
      right: 6px;
      bottom: 6px;
      width: 14px;
      height: 14px;
      border: 1px solid var(--border);
      background: #fff;
      border-radius: 3px;
      box-shadow: 0 1px 2px rgba(0, 0, 0, .06);
      cursor: nwse-resize;
      display: grid;
      place-items: center;
      z-index: 2147483647;
      /* on top of everything inside the iframe */
    }

    .resize-handle::after {
      content: "";
      width: 8px;
      height: 8px;
      border-right: 2px solid #9ca3af;
      /* subtle diagonal corner */
      border-bottom: 2px solid #9ca3af;
      transform: translate(1px, 1px);
      pointer-events: none;
    }

    #exportBtn {
      margin-top: .5rem;
      width: 100%;
    }

    /* Collapsed drawer: turn the outer container into a thin row with no chrome,
   and let the header itself render the small pill/bar. */
    .shell.drawer-collapsed .drawer {
      padding: 0;
      /* remove outer padding that created the white strip */
      background: transparent;
      /* no background/plinth */
      border: 0;
      /* no outer border */
    }

    /* Make the header itself look like a compact pill */
    .shell.drawer-collapsed .drawer .panel-header {
      padding: 4px 8px;
      /* tighter */
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--surface);
      /* remove the normal header divider line */
      border-bottom: 1px solid var(--border);
      /* keep a hairline if you like */
    }

    /* Save vertical space: only keep the eyebrow, hide the big title in collapsed mode */
    .shell.drawer-collapsed .drawer .title {
      display: none;
    }

    .shell.drawer-collapsed .drawer .eyebrow {
      margin: 0;
    }

    /* (Already present) */
    .shell.drawer-collapsed {
      grid-template-rows: 1fr var(--drawer-collapsed-h);
    }

    .shell.drawer-collapsed .drawer .drawer-body {
      display: none;
    }
  </style>
</head>

<body>
  <div class="shell">
    <!-- Left: Actions -->
    <div class="col">
      <div class="panel">
        <div class="panel-header">
          <div>
            <div class="eyebrow">Actions</div>
            <h2 class="title">Import & Export</h2>
          </div>
        </div>
        <div class="panel-body">
          <!-- Import -->
          <div class="stack">
            <div class="eyebrow">Import DTCG</div>
            <div>
              <label>Choose a DTCG JSON file</label>
              <input id="file" type="file" accept=".json,application/json" />
            </div>
            <div class="row">
              <button id="importBtn" disabled>Import</button>
            </div>
            <div class="muted">Imports collections/modes as defined in the file.</div>
          </div>

          <!-- Export -->
          <div class="stack" style="border-top:1px solid var(--border);padding-top:12px;">
            <div class="eyebrow">Export DTCG</div>
            <div class="row-center"></div>
            <div class="stack" id="exportPickers">
              <div>
                <label>Collection</label>
                <select id="collectionSelect"></select>
              </div>
              <div>
                <label>Mode (within collection)</label>
                <select id="modeSelect"></select>
              </div>
              <div>
                <label><input type="checkbox" id="exportAllChk" /> Export all collections &amp; modes into a single
                  file</label>
                <div class="muted">Select a collection and mode, or check \u201CExport all\u201D.</div>
                <button id="exportBtn" disabled>Export</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Middle: Raw Figma Collections -->
    <div class="col">
      <div class="panel">
        <div class="panel-header">
          <div>
            <div class="eyebrow">Reference</div>
            <h2 class="title">Raw Figma Collections</h2>
          </div>
        </div>
        <div class="panel-body">
          <pre id="raw"></pre>
        </div>
        <button id="refreshBtn">Refresh</button>
      </div>
    </div>

    <!-- Right: W3C Preview -->
    <div class="col">
      <div class="panel">
        <div class="panel-header">
          <div>
            <div class="eyebrow">Preview</div>
            <h2 class="title">W3C Design Tokens (JSON)</h2>
          </div>
        </div>
        <div class="panel-body">
          <!-- Placeholder; we\u2019ll wire this later -->
          <pre id="w3cPreview">{ /* preview will render here */ }</pre>
        </div>
      </div>
    </div>

    <!-- Bottom drawer: Log (spans all columns) -->
    <div class="drawer">
      <div class="panel-header">
        <div>
          <div class="eyebrow">Diagnostics</div>
          <h2 class="title">Log</h2>
        </div>
        <button id="drawerToggleBtn" class="drawer-toggle" aria-expanded="true" title="Hide log">Hide</button>
      </div>

      <div class="drawer-body">
        <div id="log"></div>
      </div>
    </div>
  </div>
  <div class="resize-handle" id="resizeHandle" title="Drag to resize"></div>
  <script>"use strict";
(() => {
  // src/app/ui.ts
  var logEl = document.getElementById("log");
  var rawEl = document.getElementById("raw");
  var exportAllChk = document.getElementById("exportAllChk");
  var collectionSelect = document.getElementById("collectionSelect");
  var modeSelect = document.getElementById("modeSelect");
  var fileInput = document.getElementById("file");
  var importBtn = document.getElementById("importBtn");
  var exportBtn = document.getElementById("exportBtn");
  var exportPickers = document.getElementById("exportPickers");
  var refreshBtn = document.getElementById("refreshBtn");
  var shellEl = document.querySelector(".shell");
  var drawerToggleBtn = document.getElementById("drawerToggleBtn");
  var w3cPreviewEl = document.getElementById("w3cPreview");
  function postResize(width, height) {
    var w = Math.max(720, Math.min(1600, Math.floor(width)));
    var h = Math.max(420, Math.min(1200, Math.floor(height)));
    postToPlugin({ type: "UI_RESIZE", payload: { width: w, height: h } });
  }
  function autoFitOnce() {
    var contentW = Math.max(
      document.documentElement.scrollWidth,
      document.body ? document.body.scrollWidth : 0
    );
    var contentH = Math.max(
      document.documentElement.scrollHeight,
      document.body ? document.body.scrollHeight : 0
    );
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var needsW = contentW > vw ? contentW : vw;
    var needsH = contentH > vh ? contentH : vh;
    if (needsW > vw || needsH > vh) {
      postResize(needsW, needsH);
    }
  }
  (function wireDragHandle() {
    var handle = document.getElementById("resizeHandle");
    if (!handle) return;
    var dragging = false;
    var startX = 0, startY = 0;
    var startW = 0, startH = 0;
    var raf = 0;
    var loggedOnce = false;
    function onMouseMove(e) {
      if (!dragging) return;
      if (raf) return;
      raf = window.requestAnimationFrame(function() {
        var _a, _b;
        raf = 0;
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        var targetW = startW + dx;
        var targetH = startH + dy;
        if (!loggedOnce) {
          loggedOnce = true;
          try {
            (_b = (_a = window.console) == null ? void 0 : _a.log) == null ? void 0 : _b.call(_a, "UI_RESIZE \\u2192", targetW, targetH);
          } catch (_e) {
          }
        }
        postResize(targetW, targetH);
      });
    }
    function onMouseUp() {
      if (!dragging) return;
      dragging = false;
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }
    handle.addEventListener("mousedown", function(e) {
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startW = window.innerWidth;
      startH = window.innerHeight;
      loggedOnce = false;
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      e.preventDefault();
    });
  })();
  var currentCollections = [];
  function log(msg) {
    const t = (/* @__PURE__ */ new Date()).toLocaleTimeString();
    const line = document.createElement("div");
    line.textContent = "[" + t + "] " + msg;
    if (logEl && logEl instanceof HTMLElement) {
      logEl.appendChild(line);
      logEl.scrollTop = logEl.scrollHeight;
    }
  }
  function postToPlugin(message) {
    parent.postMessage({ pluginMessage: message }, "*");
  }
  function clearSelect(sel) {
    while (sel.options.length > 0) sel.remove(0);
  }
  function setDisabledStates() {
    if (importBtn && fileInput && importBtn instanceof HTMLButtonElement && fileInput instanceof HTMLInputElement) {
      const hasFile = !!(fileInput.files && fileInput.files.length > 0);
      importBtn.disabled = !hasFile;
    }
    if (exportBtn && exportAllChk && collectionSelect && modeSelect && exportPickers && exportBtn instanceof HTMLButtonElement && exportAllChk instanceof HTMLInputElement && collectionSelect instanceof HTMLSelectElement && modeSelect instanceof HTMLSelectElement && exportPickers instanceof HTMLElement) {
      const exportAll = !!exportAllChk.checked;
      if (exportAll) {
        exportBtn.disabled = false;
        exportPickers.style.opacity = "0.5";
      } else {
        exportPickers.style.opacity = "1";
        const hasSelection = collectionSelect.value.length > 0 && modeSelect.value.length > 0;
        exportBtn.disabled = !hasSelection;
      }
    }
  }
  function populateCollections(data) {
    currentCollections = data.collections;
    if (!(collectionSelect && modeSelect)) return;
    if (!(collectionSelect instanceof HTMLSelectElement && modeSelect instanceof HTMLSelectElement)) return;
    clearSelect(collectionSelect);
    let i = 0;
    for (i = 0; i < data.collections.length; i++) {
      const c = data.collections[i];
      const opt = document.createElement("option");
      opt.value = c.name;
      opt.textContent = c.name;
      collectionSelect.appendChild(opt);
    }
    onCollectionChange();
  }
  function onCollectionChange() {
    if (!(collectionSelect && modeSelect)) return;
    if (!(collectionSelect instanceof HTMLSelectElement && modeSelect instanceof HTMLSelectElement)) return;
    const selected = collectionSelect.value;
    clearSelect(modeSelect);
    let i = 0;
    for (i = 0; i < currentCollections.length; i++) {
      const c = currentCollections[i];
      if (c.name === selected) {
        let j = 0;
        for (j = 0; j < c.modes.length; j++) {
          const m = c.modes[j];
          const opt = document.createElement("option");
          opt.value = m.name;
          opt.textContent = m.name;
          modeSelect.appendChild(opt);
        }
        break;
      }
    }
    setDisabledStates();
  }
  function applyLastSelection(last) {
    if (!last) return;
    if (!(collectionSelect && modeSelect)) return;
    if (!(collectionSelect instanceof HTMLSelectElement && modeSelect instanceof HTMLSelectElement)) return;
    let i = 0;
    let found = false;
    for (i = 0; i < collectionSelect.options.length; i++) {
      if (collectionSelect.options[i].value === last.collection) {
        collectionSelect.selectedIndex = i;
        found = true;
        break;
      }
    }
    onCollectionChange();
    if (found) {
      let j = 0;
      for (j = 0; j < modeSelect.options.length; j++) {
        if (modeSelect.options[j].value === last.mode) {
          modeSelect.selectedIndex = j;
          break;
        }
      }
    }
    setDisabledStates();
  }
  function prettyJson(obj) {
    try {
      return JSON.stringify(obj, null, 2);
    } catch (_e) {
      return String(obj);
    }
  }
  function requestPreviewForCurrent() {
    if (!(collectionSelect instanceof HTMLSelectElement) || !(modeSelect instanceof HTMLSelectElement)) return;
    const collection = collectionSelect.value || "";
    const mode = modeSelect.value || "";
    if (!collection || !mode) {
      if (w3cPreviewEl) w3cPreviewEl.textContent = "{ /* select a collection & mode to preview */ }";
      return;
    }
    postToPlugin({ type: "PREVIEW_REQUEST", payload: { collection, mode } });
  }
  if (fileInput && fileInput instanceof HTMLInputElement) {
    fileInput.addEventListener("change", setDisabledStates);
  }
  if (exportAllChk && exportAllChk instanceof HTMLInputElement) {
    exportAllChk.addEventListener("change", function() {
      setDisabledStates();
      postToPlugin({ type: "SAVE_PREFS", payload: { exportAll: !!exportAllChk.checked } });
    });
  }
  if (refreshBtn && refreshBtn instanceof HTMLButtonElement) {
    refreshBtn.addEventListener("click", function() {
      postToPlugin({ type: "FETCH_COLLECTIONS" });
    });
  }
  if (importBtn && importBtn instanceof HTMLButtonElement && fileInput && fileInput instanceof HTMLInputElement) {
    importBtn.addEventListener("click", function() {
      if (!fileInput.files || fileInput.files.length === 0) {
        log("Select a JSON file first.");
        return;
      }
      const reader = new FileReader();
      reader.onload = function() {
        try {
          const text = String(reader.result);
          const json = JSON.parse(text);
          if (json && typeof json === "object" && !(json instanceof Array)) {
            postToPlugin({ type: "IMPORT_DTCG", payload: { json } });
            log("Import requested.");
          } else {
            log("Invalid JSON structure for tokens (expected an object).");
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          log("Failed to parse JSON: " + msg);
        }
      };
      reader.readAsText(fileInput.files[0]);
    });
  }
  if (exportBtn && exportBtn instanceof HTMLButtonElement) {
    exportBtn.addEventListener("click", function() {
      let exportAll = false;
      if (exportAllChk && exportAllChk instanceof HTMLInputElement) exportAll = !!exportAllChk.checked;
      const payload = { exportAll };
      if (!exportAll && collectionSelect && modeSelect && collectionSelect instanceof HTMLSelectElement && modeSelect instanceof HTMLSelectElement) {
        payload.collection = collectionSelect.value;
        payload.mode = modeSelect.value;
        if (!(payload.collection && payload.mode)) {
          log('Pick collection and mode or use "Export all".');
          return;
        }
      }
      postToPlugin({ type: "EXPORT_DTCG", payload });
      if (exportAll) log("Export all requested.");
      else log('Export requested for "' + (payload.collection || "") + '" / "' + (payload.mode || "") + '".');
    });
  }
  if (drawerToggleBtn && drawerToggleBtn instanceof HTMLButtonElement) {
    drawerToggleBtn.addEventListener("click", function() {
      var current = drawerToggleBtn.getAttribute("aria-expanded") === "true";
      setDrawerOpen(!current);
    });
  }
  if (collectionSelect && collectionSelect instanceof HTMLSelectElement) {
    collectionSelect.addEventListener("change", function() {
      onCollectionChange();
      if (collectionSelect instanceof HTMLSelectElement && modeSelect instanceof HTMLSelectElement) {
        postToPlugin({ type: "SAVE_LAST", payload: { collection: collectionSelect.value, mode: modeSelect.value } });
        requestPreviewForCurrent();
      }
    });
  }
  if (modeSelect && modeSelect instanceof HTMLSelectElement) {
    modeSelect.addEventListener("change", function() {
      if (collectionSelect instanceof HTMLSelectElement && modeSelect instanceof HTMLSelectElement) {
        postToPlugin({ type: "SAVE_LAST", payload: { collection: collectionSelect.value, mode: modeSelect.value } });
      }
      setDisabledStates();
      requestPreviewForCurrent();
    });
  }
  function setDrawerOpen(open) {
    if (shellEl && shellEl instanceof HTMLElement) {
      if (open) {
        shellEl.classList.remove("drawer-collapsed");
      } else {
        shellEl.classList.add("drawer-collapsed");
      }
    }
    if (drawerToggleBtn && drawerToggleBtn instanceof HTMLButtonElement) {
      drawerToggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
      drawerToggleBtn.textContent = open ? "Hide" : "Show";
      drawerToggleBtn.title = open ? "Hide log" : "Show log";
    }
    try {
      window.localStorage.setItem("drawerOpen", open ? "1" : "0");
    } catch (_e) {
    }
  }
  function getSavedDrawerOpen() {
    try {
      var v = window.localStorage.getItem("drawerOpen");
      if (v === "0") return false;
      if (v === "1") return true;
    } catch (_e) {
    }
    return true;
  }
  window.onmessage = function(event) {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    let msg = null;
    if (data.pluginMessage && typeof data.pluginMessage === "object") {
      const maybe = data.pluginMessage;
      if (maybe && typeof maybe.type === "string") {
        msg = data.pluginMessage;
      }
    }
    if (!msg) return;
    if (msg.type === "ERROR") {
      log("ERROR: " + msg.payload.message);
      return;
    }
    if (msg.type === "INFO") {
      log(msg.payload.message);
      return;
    }
    if (msg.type === "EXPORT_RESULT") {
      for (let k = 0; k < msg.payload.files.length; k++) {
        const f = msg.payload.files[k];
        const a = document.createElement("a");
        const blob = new Blob([prettyJson(f.json)], { type: "application/json" });
        a.href = URL.createObjectURL(blob);
        a.download = f.name;
        a.textContent = "Download " + f.name;
        const div = document.createElement("div");
        div.appendChild(a);
        if (logEl && logEl instanceof HTMLElement) logEl.appendChild(div);
      }
      log("Export ready.");
      return;
    }
    if (msg.type === "W3C_PREVIEW") {
      const header = \`/* \${msg.payload.name} */
\`;
      if (w3cPreviewEl) w3cPreviewEl.textContent = header + prettyJson(msg.payload.json);
      return;
    }
    if (msg.type === "COLLECTIONS_DATA") {
      populateCollections({ collections: msg.payload.collections });
      if (exportAllChk && exportAllChk instanceof HTMLInputElement) {
        exportAllChk.checked = !!msg.payload.exportAllPref;
      }
      if (typeof msg.payload.drawerOpenPref === "boolean") {
        setDrawerOpen(msg.payload.drawerOpenPref);
      }
      applyLastSelection(msg.payload.last);
      setDisabledStates();
      requestPreviewForCurrent();
      return;
    }
    if (msg.type === "RAW_COLLECTIONS_TEXT") {
      if (rawEl && rawEl instanceof HTMLElement) rawEl.textContent = msg.payload.text;
      return;
    }
  };
  document.addEventListener("DOMContentLoaded", function() {
    if (rawEl && rawEl instanceof HTMLElement) rawEl.textContent = "Loading variable collections\\u2026";
    setDisabledStates();
    setDrawerOpen(getSavedDrawerOpen());
    postToPlugin({ type: "UI_READY" });
    autoFitOnce();
  });
})();
//# sourceMappingURL=ui.js.map
<\/script>
</body>

</html>s
  var logEl = document.getElementById("log");
  var rawEl = document.getElementById("raw");
  var exportAllChk = document.getElementById("exportAllChk");
  var collectionSelect = document.getElementById("collectionSelect");
  var modeSelect = document.getElementById("modeSelect");
  var fileInput = document.getElementById("file");
  var importBtn = document.getElementById("importBtn");
  var exportBtn = document.getElementById("exportBtn");
  var exportPickers = document.getElementById("exportPickers");
  var refreshBtn = document.getElementById("refreshBtn");
  var shellEl = document.querySelector(".shell");
  var drawerToggleBtn = document.getElementById("drawerToggleBtn");
  var w3cPreviewEl = document.getElementById("w3cPreview");
  function postResize(width, height) {
    var w = Math.max(720, Math.min(1600, Math.floor(width)));
    var h = Math.max(420, Math.min(1200, Math.floor(height)));
    postToPlugin({ type: "UI_RESIZE", payload: { width: w, height: h } });
  }
  function autoFitOnce() {
    var contentW = Math.max(
      document.documentElement.scrollWidth,
      document.body ? document.body.scrollWidth : 0
    );
    var contentH = Math.max(
      document.documentElement.scrollHeight,
      document.body ? document.body.scrollHeight : 0
    );
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var needsW = contentW > vw ? contentW : vw;
    var needsH = contentH > vh ? contentH : vh;
    if (needsW > vw || needsH > vh) {
      postResize(needsW, needsH);
    }
  }
  (function wireDragHandle() {
    var handle = document.getElementById("resizeHandle");
    if (!handle) return;
    var dragging = false;
    var startX = 0, startY = 0;
    var startW = 0, startH = 0;
    var raf = 0;
    var loggedOnce = false;
    function onMouseMove(e) {
      if (!dragging) return;
      if (raf) return;
      raf = window.requestAnimationFrame(function() {
        var _a, _b;
        raf = 0;
        var dx = e.clientX - startX;
        var dy = e.clientY - startY;
        var targetW = startW + dx;
        var targetH = startH + dy;
        if (!loggedOnce) {
          loggedOnce = true;
          try {
            (_b = (_a = window.console) == null ? void 0 : _a.log) == null ? void 0 : _b.call(_a, "UI_RESIZE \\u2192", targetW, targetH);
          } catch (_e) {
          }
        }
        postResize(targetW, targetH);
      });
    }
    function onMouseUp() {
      if (!dragging) return;
      dragging = false;
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    }
    handle.addEventListener("mousedown", function(e) {
      dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startW = window.innerWidth;
      startH = window.innerHeight;
      loggedOnce = false;
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
      e.preventDefault();
    });
  })();
  var currentCollections = [];
  function log(msg) {
    const t = (/* @__PURE__ */ new Date()).toLocaleTimeString();
    const line = document.createElement("div");
    line.textContent = "[" + t + "] " + msg;
    if (logEl && logEl instanceof HTMLElement) {
      logEl.appendChild(line);
      logEl.scrollTop = logEl.scrollHeight;
    }
  }
  function postToPlugin(message) {
    parent.postMessage({ pluginMessage: message }, "*");
  }
  function clearSelect(sel) {
    while (sel.options.length > 0) sel.remove(0);
  }
  function setDisabledStates() {
    if (importBtn && fileInput && importBtn instanceof HTMLButtonElement && fileInput instanceof HTMLInputElement) {
      const hasFile = !!(fileInput.files && fileInput.files.length > 0);
      importBtn.disabled = !hasFile;
    }
    if (exportBtn && exportAllChk && collectionSelect && modeSelect && exportPickers && exportBtn instanceof HTMLButtonElement && exportAllChk instanceof HTMLInputElement && collectionSelect instanceof HTMLSelectElement && modeSelect instanceof HTMLSelectElement && exportPickers instanceof HTMLElement) {
      const exportAll = !!exportAllChk.checked;
      if (exportAll) {
        exportBtn.disabled = false;
        exportPickers.style.opacity = "0.5";
      } else {
        exportPickers.style.opacity = "1";
        const hasSelection = collectionSelect.value.length > 0 && modeSelect.value.length > 0;
        exportBtn.disabled = !hasSelection;
      }
    }
  }
  function populateCollections(data) {
    currentCollections = data.collections;
    if (!(collectionSelect && modeSelect)) return;
    if (!(collectionSelect instanceof HTMLSelectElement && modeSelect instanceof HTMLSelectElement)) return;
    clearSelect(collectionSelect);
    let i = 0;
    for (i = 0; i < data.collections.length; i++) {
      const c = data.collections[i];
      const opt = document.createElement("option");
      opt.value = c.name;
      opt.textContent = c.name;
      collectionSelect.appendChild(opt);
    }
    onCollectionChange();
  }
  function onCollectionChange() {
    if (!(collectionSelect && modeSelect)) return;
    if (!(collectionSelect instanceof HTMLSelectElement && modeSelect instanceof HTMLSelectElement)) return;
    const selected = collectionSelect.value;
    clearSelect(modeSelect);
    let i = 0;
    for (i = 0; i < currentCollections.length; i++) {
      const c = currentCollections[i];
      if (c.name === selected) {
        let j = 0;
        for (j = 0; j < c.modes.length; j++) {
          const m = c.modes[j];
          const opt = document.createElement("option");
          opt.value = m.name;
          opt.textContent = m.name;
          modeSelect.appendChild(opt);
        }
        break;
      }
    }
    setDisabledStates();
  }
  function applyLastSelection(last) {
    if (!last) return;
    if (!(collectionSelect && modeSelect)) return;
    if (!(collectionSelect instanceof HTMLSelectElement && modeSelect instanceof HTMLSelectElement)) return;
    let i = 0;
    let found = false;
    for (i = 0; i < collectionSelect.options.length; i++) {
      if (collectionSelect.options[i].value === last.collection) {
        collectionSelect.selectedIndex = i;
        found = true;
        break;
      }
    }
    onCollectionChange();
    if (found) {
      let j = 0;
      for (j = 0; j < modeSelect.options.length; j++) {
        if (modeSelect.options[j].value === last.mode) {
          modeSelect.selectedIndex = j;
          break;
        }
      }
    }
    setDisabledStates();
  }
  function prettyJson(obj) {
    try {
      return JSON.stringify(obj, null, 2);
    } catch (_e) {
      return String(obj);
    }
  }
  function requestPreviewForCurrent() {
    if (!(collectionSelect instanceof HTMLSelectElement) || !(modeSelect instanceof HTMLSelectElement)) return;
    const collection = collectionSelect.value || "";
    const mode = modeSelect.value || "";
    if (!collection || !mode) {
      if (w3cPreviewEl) w3cPreviewEl.textContent = "{ /* select a collection & mode to preview */ }";
      return;
    }
    postToPlugin({ type: "PREVIEW_REQUEST", payload: { collection, mode } });
  }
  if (fileInput && fileInput instanceof HTMLInputElement) {
    fileInput.addEventListener("change", setDisabledStates);
  }
  if (exportAllChk && exportAllChk instanceof HTMLInputElement) {
    exportAllChk.addEventListener("change", function() {
      setDisabledStates();
      postToPlugin({ type: "SAVE_PREFS", payload: { exportAll: !!exportAllChk.checked } });
    });
  }
  if (refreshBtn && refreshBtn instanceof HTMLButtonElement) {
    refreshBtn.addEventListener("click", function() {
      postToPlugin({ type: "FETCH_COLLECTIONS" });
    });
  }
  if (importBtn && importBtn instanceof HTMLButtonElement && fileInput && fileInput instanceof HTMLInputElement) {
    importBtn.addEventListener("click", function() {
      if (!fileInput.files || fileInput.files.length === 0) {
        log("Select a JSON file first.");
        return;
      }
      const reader = new FileReader();
      reader.onload = function() {
        try {
          const text = String(reader.result);
          const json = JSON.parse(text);
          if (json && typeof json === "object" && !(json instanceof Array)) {
            postToPlugin({ type: "IMPORT_DTCG", payload: { json } });
            log("Import requested.");
          } else {
            log("Invalid JSON structure for tokens (expected an object).");
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          log("Failed to parse JSON: " + msg);
        }
      };
      reader.readAsText(fileInput.files[0]);
    });
  }
  if (exportBtn && exportBtn instanceof HTMLButtonElement) {
    exportBtn.addEventListener("click", function() {
      let exportAll = false;
      if (exportAllChk && exportAllChk instanceof HTMLInputElement) exportAll = !!exportAllChk.checked;
      const payload = { exportAll };
      if (!exportAll && collectionSelect && modeSelect && collectionSelect instanceof HTMLSelectElement && modeSelect instanceof HTMLSelectElement) {
        payload.collection = collectionSelect.value;
        payload.mode = modeSelect.value;
        if (!(payload.collection && payload.mode)) {
          log('Pick collection and mode or use "Export all".');
          return;
        }
      }
      postToPlugin({ type: "EXPORT_DTCG", payload });
      if (exportAll) log("Export all requested.");
      else log('Export requested for "' + (payload.collection || "") + '" / "' + (payload.mode || "") + '".');
    });
  }
  if (drawerToggleBtn && drawerToggleBtn instanceof HTMLButtonElement) {
    drawerToggleBtn.addEventListener("click", function() {
      var current = drawerToggleBtn.getAttribute("aria-expanded") === "true";
      setDrawerOpen(!current);
    });
  }
  if (collectionSelect && collectionSelect instanceof HTMLSelectElement) {
    collectionSelect.addEventListener("change", function() {
      onCollectionChange();
      if (collectionSelect instanceof HTMLSelectElement && modeSelect instanceof HTMLSelectElement) {
        postToPlugin({ type: "SAVE_LAST", payload: { collection: collectionSelect.value, mode: modeSelect.value } });
        requestPreviewForCurrent();
      }
    });
  }
  if (modeSelect && modeSelect instanceof HTMLSelectElement) {
    modeSelect.addEventListener("change", function() {
      if (collectionSelect instanceof HTMLSelectElement && modeSelect instanceof HTMLSelectElement) {
        postToPlugin({ type: "SAVE_LAST", payload: { collection: collectionSelect.value, mode: modeSelect.value } });
      }
      setDisabledStates();
      requestPreviewForCurrent();
    });
  }
  function setDrawerOpen(open) {
    if (shellEl && shellEl instanceof HTMLElement) {
      if (open) {
        shellEl.classList.remove("drawer-collapsed");
      } else {
        shellEl.classList.add("drawer-collapsed");
      }
    }
    if (drawerToggleBtn && drawerToggleBtn instanceof HTMLButtonElement) {
      drawerToggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
      drawerToggleBtn.textContent = open ? "Hide" : "Show";
      drawerToggleBtn.title = open ? "Hide log" : "Show log";
    }
    try {
      window.localStorage.setItem("drawerOpen", open ? "1" : "0");
    } catch (_e) {
    }
  }
  function getSavedDrawerOpen() {
    try {
      var v = window.localStorage.getItem("drawerOpen");
      if (v === "0") return false;
      if (v === "1") return true;
    } catch (_e) {
    }
    return true;
  }
  window.onmessage = function(event) {
    const data = event.data;
    if (!data || typeof data !== "object") return;
    let msg = null;
    if (data.pluginMessage && typeof data.pluginMessage === "object") {
      const maybe = data.pluginMessage;
      if (maybe && typeof maybe.type === "string") {
        msg = data.pluginMessage;
      }
    }
    if (!msg) return;
    if (msg.type === "ERROR") {
      log("ERROR: " + msg.payload.message);
      return;
    }
    if (msg.type === "INFO") {
      log(msg.payload.message);
      return;
    }
    if (msg.type === "EXPORT_RESULT") {
      for (let k = 0; k < msg.payload.files.length; k++) {
        const f = msg.payload.files[k];
        const a = document.createElement("a");
        const blob = new Blob([prettyJson(f.json)], { type: "application/json" });
        a.href = URL.createObjectURL(blob);
        a.download = f.name;
        a.textContent = "Download " + f.name;
        const div = document.createElement("div");
        div.appendChild(a);
        if (logEl && logEl instanceof HTMLElement) logEl.appendChild(div);
      }
      log("Export ready.");
      return;
    }
    if (msg.type === "W3C_PREVIEW") {
      const header = \`/* \${msg.payload.name} */
\`;
      if (w3cPreviewEl) w3cPreviewEl.textContent = header + prettyJson(msg.payload.json);
      return;
    }
    if (msg.type === "COLLECTIONS_DATA") {
      populateCollections({ collections: msg.payload.collections });
      if (exportAllChk && exportAllChk instanceof HTMLInputElement) {
        exportAllChk.checked = !!msg.payload.exportAllPref;
      }
      if (typeof msg.payload.drawerOpenPref === "boolean") {
        setDrawerOpen(msg.payload.drawerOpenPref);
      }
      applyLastSelection(msg.payload.last);
      setDisabledStates();
      requestPreviewForCurrent();
      return;
    }
    if (msg.type === "RAW_COLLECTIONS_TEXT") {
      if (rawEl && rawEl instanceof HTMLElement) rawEl.textContent = msg.payload.text;
      return;
    }
  };
  document.addEventListener("DOMContentLoaded", function() {
    if (rawEl && rawEl instanceof HTMLElement) rawEl.textContent = "Loading variable collections\\u2026";
    setDisabledStates();
    setDrawerOpen(getSavedDrawerOpen());
    postToPlugin({ type: "UI_READY" });
    autoFitOnce();
  });
})();
//# sourceMappingURL=ui.js.map
<\/script>
</body>

</html>`, { width: w, height: h });
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
