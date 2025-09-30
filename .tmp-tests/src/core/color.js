"use strict";
// src/core/color.ts
// Accurate, spec-aligned color handling for DTCG <-> Figma.
// - Validates incoming data so we never write impossible color spaces
// - Converts between srgb/display-p3 while keeping precision intact
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeDocumentProfile = normalizeDocumentProfile;
exports.isDtcgColorShapeValid = isDtcgColorShapeValid;
exports.isColorSpaceRepresentableInDocument = isColorSpaceRepresentableInDocument;
exports.parseHexToSrgbRGBA = parseHexToSrgbRGBA;
exports.dtcgToFigmaRGBA = dtcgToFigmaRGBA;
exports.figmaRGBAToDtcg = figmaRGBAToDtcg;
exports.srgbToFigma = srgbToFigma;
exports.figmaToSrgb = figmaToSrgb;
exports.toHex6FromSrgb = toHex6FromSrgb;
exports.toHex8FromSrgb = toHex8FromSrgb;
exports.hexToDtcgColor = hexToDtcgColor;
exports.isValidDtcgColorValueObject = isValidDtcgColorValueObject;
exports.normalizeDtcgColorValue = normalizeDtcgColorValue;
exports.isDtcgColorInUnitRange = isDtcgColorInUnitRange;
/** Normalize the various document profile strings Figma can return. */
function normalizeDocumentProfile(profile) {
    const upper = String(profile).toUpperCase();
    return upper.includes('DISPLAY_P3') ? 'DISPLAY_P3' : 'SRGB';
}
// Only accept these DTCG color spaces in this plugin:
const SUPPORTED_DTCG_COLOR_SPACES = new Set(['srgb', 'display-p3']);
/**
 * Strict shape validator for a DTCG color object.
 * Expects: { colorSpace: 'srgb'|'display-p3', components: [r,g,b], alpha?: number, hex?: string }
 */
function isDtcgColorShapeValid(input) {
    if (!input || typeof input !== 'object') {
        return { ok: false, reason: 'not an object' };
    }
    const cs = String(input.colorSpace || '').toLowerCase();
    if (!SUPPORTED_DTCG_COLOR_SPACES.has(cs)) {
        return { ok: false, reason: `unsupported colorSpace (“${input.colorSpace}”)` };
    }
    if (!Array.isArray(input.components) || input.components.length !== 3) {
        return { ok: false, reason: 'components must be an array of length 3' };
    }
    // components must be finite numbers in [0..1]
    for (let i = 0; i < 3; i++) {
        const v = input.components[i];
        if (typeof v !== 'number' || !Number.isFinite(v)) {
            return { ok: false, reason: `component ${i} is not a finite number` };
        }
        if (v < 0 || v > 1) {
            return { ok: false, reason: `component ${i} out of range (${v})` };
        }
    }
    // alpha, if present, must be finite number in [0..1]
    if (typeof input.alpha !== 'undefined') {
        if (typeof input.alpha !== 'number' || !Number.isFinite(input.alpha)) {
            return { ok: false, reason: 'alpha is not a finite number' };
        }
        if (input.alpha < 0 || input.alpha > 1) {
            return { ok: false, reason: `alpha out of range (${input.alpha})` };
        }
    }
    return { ok: true };
}
/**
 * Gate colorSpace by document profile: SRGB docs only allow 'srgb',
 * Display-P3 docs allow both 'srgb' and 'display-p3'.
 */
function isColorSpaceRepresentableInDocument(colorSpace, profile) {
    const cs = String(colorSpace).toLowerCase();
    const normalized = normalizeDocumentProfile(profile);
    if (normalized === 'DISPLAY_P3')
        return cs === 'srgb' || cs === 'display-p3';
    return cs === 'srgb';
}
function clamp01(x) {
    if (x < 0)
        return 0;
    if (x > 1)
        return 1;
    return x;
}
function clamp01Array(v) {
    var out = [];
    var i = 0;
    for (i = 0; i < v.length; i++)
        out.push(clamp01(v[i]));
    return out;
}
// sRGB / P3 TRC
function srgbEncode(linear) {
    if (linear <= 0.0031308)
        return 12.92 * linear;
    return 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
}
function srgbDecode(encoded) {
    if (encoded <= 0.04045)
        return encoded / 12.92;
    return Math.pow((encoded + 0.055) / 1.055, 2.4);
}
var p3Encode = srgbEncode;
var p3Decode = srgbDecode;
function mul3(m, v) {
    return [
        m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
        m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
        m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
    ];
}
// D65 matrices
const M_SRGB_TO_XYZ = [
    [0.4124564, 0.3575761, 0.1804375],
    [0.2126729, 0.7151522, 0.0721750],
    [0.0193339, 0.1191920, 0.9503041],
];
const M_XYZ_TO_SRGB = [
    [3.2404542, -1.5371385, -0.4985314],
    [-0.9692660, 1.8760108, 0.0415560],
    [0.0556434, -0.2040259, 1.0572252],
];
const M_P3_TO_XYZ = [
    [0.4865709486482162, 0.26566769316909306, 0.1982172852343625],
    [0.2289745640697488, 0.6917385218365064, 0.0792869140937450],
    [0.0000000000000000, 0.04511338185890264, 1.0439443689009760],
];
const M_XYZ_TO_P3 = [
    [2.493496911941425, -0.9313836179191239, -0.40271078445071684],
    [-0.8294889695615747, 1.7626640603183463, 0.02362468584194358],
    [0.03584583024378447, -0.07617238926804182, 0.9568845240076872],
];
function encode(space, linearRGB) {
    if (space === 'display-p3')
        return [p3Encode(linearRGB[0]), p3Encode(linearRGB[1]), p3Encode(linearRGB[2])];
    return [srgbEncode(linearRGB[0]), srgbEncode(linearRGB[1]), srgbEncode(linearRGB[2])];
}
function decode(space, encodedRGB) {
    if (space === 'display-p3')
        return [p3Decode(encodedRGB[0]), p3Decode(encodedRGB[1]), p3Decode(encodedRGB[2])];
    return [srgbDecode(encodedRGB[0]), srgbDecode(encodedRGB[1]), srgbDecode(encodedRGB[2])];
}
function convertRgbSpace(rgb, src, dst) {
    if (src === dst)
        return clamp01Array(rgb);
    var lin = decode(src, clamp01Array(rgb));
    var xyz = src === 'srgb' ? mul3(M_SRGB_TO_XYZ, lin) : mul3(M_P3_TO_XYZ, lin);
    var linDst = dst === 'srgb' ? mul3(M_XYZ_TO_SRGB, xyz) : mul3(M_XYZ_TO_P3, xyz);
    var enc = encode(dst, linDst);
    return clamp01Array(enc);
}
function srgbToHex6(rgb) {
    var r = Math.round(clamp01(rgb[0]) * 255);
    var g = Math.round(clamp01(rgb[1]) * 255);
    var b = Math.round(clamp01(rgb[2]) * 255);
    function to2(n) { var s = n.toString(16); return s.length === 1 ? '0' + s : s; }
    return '#' + to2(r) + to2(g) + to2(b);
}
function srgbToHex8(rgba) {
    var r = Math.round(clamp01(rgba.r) * 255);
    var g = Math.round(clamp01(rgba.g) * 255);
    var b = Math.round(clamp01(rgba.b) * 255);
    var a = Math.round(clamp01(rgba.a) * 255);
    function to2(n) { var s = n.toString(16); return s.length === 1 ? '0' + s : s; }
    return '#' + to2(r) + to2(g) + to2(b) + to2(a);
}
function isHexCharCode(code) {
    if (code >= 48 && code <= 57)
        return true;
    if (code >= 65 && code <= 70)
        return true;
    if (code >= 97 && code <= 102)
        return true;
    return false;
}
function hexPairToByte(h1, h2) {
    function val(c) {
        if (c >= 48 && c <= 57)
            return c - 48;
        if (c >= 65 && c <= 70)
            return c - 55;
        if (c >= 97 && c <= 102)
            return c - 87;
        return 0;
    }
    return (val(h1) << 4) | val(h2);
}
function parseHexToSrgbRGBA(hex) {
    var s = hex;
    if (s.length > 0 && s.charAt(0) === '#')
        s = s.substring(1);
    var i = 0;
    for (i = 0; i < s.length; i++) {
        if (!isHexCharCode(s.charCodeAt(i)))
            throw new Error('Invalid hex color: ' + hex);
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
    }
    else if (s.length === 6 || s.length === 8) {
        r = hexPairToByte(s.charCodeAt(0), s.charCodeAt(1));
        g = hexPairToByte(s.charCodeAt(2), s.charCodeAt(3));
        b = hexPairToByte(s.charCodeAt(4), s.charCodeAt(5));
        if (s.length === 8)
            a = hexPairToByte(s.charCodeAt(6), s.charCodeAt(7));
    }
    else {
        throw new Error('Invalid hex length: ' + hex);
    }
    return { r: clamp01(r / 255), g: clamp01(g / 255), b: clamp01(b / 255), a: clamp01(a / 255) };
}
function docProfileToSpaceKey(profile) {
    return normalizeDocumentProfile(profile) === 'DISPLAY_P3' ? 'display-p3' : 'srgb';
}
/** DTCG -> Figma RGBA in current doc profile. */
function dtcgToFigmaRGBA(value, docProfile) {
    var alpha = typeof value.alpha === 'number' ? value.alpha : 1;
    var dst = docProfileToSpaceKey(docProfile);
    var comps = value.components;
    if (comps && comps.length >= 3) {
        var space = value.colorSpace;
        if (space === 'srgb' || space === 'display-p3') {
            var converted = convertRgbSpace([comps[0], comps[1], comps[2]], space, dst);
            return { r: converted[0], g: converted[1], b: converted[2], a: clamp01(alpha) };
        }
        throw new Error('Unsupported colorSpace: ' + space + '. Supported: srgb, display-p3.');
    }
    if (value.hex && typeof value.hex === 'string') {
        var fromHex = parseHexToSrgbRGBA(value.hex);
        var a = typeof value.alpha === 'number' ? clamp01(value.alpha) : fromHex.a;
        if (dst === 'srgb')
            return { r: fromHex.r, g: fromHex.g, b: fromHex.b, a: a };
        var toDst = convertRgbSpace([fromHex.r, fromHex.g, fromHex.b], 'srgb', dst);
        return { r: toDst[0], g: toDst[1], b: toDst[2], a: a };
    }
    throw new Error('Color has neither components nor hex.');
}
/** Figma -> DTCG in document-native space + sRGB hex fallback. */
function figmaRGBAToDtcg(rgba, docProfile) {
    var src = docProfileToSpaceKey(docProfile);
    var rgb = [clamp01(rgba.r), clamp01(rgba.g), clamp01(rgba.b)];
    var a = clamp01(rgba.a);
    var colorSpace = src;
    var components = [rgb[0], rgb[1], rgb[2]];
    var srgbRgb = src === 'srgb' ? rgb : convertRgbSpace(rgb, 'display-p3', 'srgb');
    var hex = srgbToHex6(srgbRgb);
    return { colorSpace: colorSpace, components: components, alpha: a, hex: hex };
}
// Legacy wrappers kept for existing callers
function srgbToFigma(color) {
    return dtcgToFigmaRGBA(color, 'SRGB');
}
function figmaToSrgb(r, g, b, a) {
    var comps = [clamp01(r), clamp01(g), clamp01(b)];
    return { colorSpace: 'srgb', components: comps, alpha: clamp01(a) };
}
// Hex helpers for tooling
function toHex6FromSrgb(rgb) {
    return srgbToHex6([clamp01(rgb.r), clamp01(rgb.g), clamp01(rgb.b)]);
}
function toHex8FromSrgb(rgba) {
    return srgbToHex8({ r: clamp01(rgba.r), g: clamp01(rgba.g), b: clamp01(rgba.b), a: clamp01(rgba.a) });
}
function hexToDtcgColor(hex) {
    var rgba = parseHexToSrgbRGBA(hex);
    var comps = [rgba.r, rgba.g, rgba.b];
    return { colorSpace: 'srgb', components: comps, alpha: rgba.a, hex: toHex6FromSrgb({ r: rgba.r, g: rgba.g, b: rgba.b }) };
}
// ==== DTCG color guards & normalization ===================================
/**
 * Lightweight structural check for a DTCG color object.
 * Accepts { components[3], colorSpace?, alpha?, hex? }.
 * (colorSpace may be absent; we'll default it during normalization.)
 */
function isValidDtcgColorValueObject(v) {
    if (!v || typeof v !== "object")
        return false;
    const o = v;
    if (!Array.isArray(o.components) || o.components.length < 3)
        return false;
    if (typeof o.components[0] !== "number" ||
        typeof o.components[1] !== "number" ||
        typeof o.components[2] !== "number")
        return false;
    return true;
}
/**
 * Normalize a DTCG color object into your internal ColorValue:
 * - clamps components/alpha to [0,1]
 * - preserves hex when present (no rounding/quantization)
 * - defaults missing colorSpace to "srgb"
 */
function normalizeDtcgColorValue(input) {
    function clamp01(x) {
        if (!Number.isFinite(x))
            return 0;
        if (x < 0)
            return 0;
        if (x > 1)
            return 1;
        return x;
    }
    const comps = [
        clamp01(Number(input.components[0])),
        clamp01(Number(input.components[1])),
        clamp01(Number(input.components[2]))
    ];
    const alpha = typeof input.alpha === "number" ? clamp01(input.alpha) : undefined;
    // Honor provided colorSpace when it's one of the supported ones; default to srgb
    const cs = input.colorSpace === "display-p3" ? "display-p3" : "srgb";
    return {
        colorSpace: cs,
        components: comps,
        ...(alpha !== undefined ? { alpha } : {}),
        ...(typeof input.hex === "string" ? { hex: input.hex } : {})
    };
}
// STRICT range check: components and alpha must be in [0..1] with no clamping.
function isDtcgColorInUnitRange(input) {
    if (!input || !Array.isArray(input.components) || input.components.length < 3) {
        return { ok: false, reason: 'components missing' };
    }
    for (let i = 0; i < 3; i++) {
        const n = Number(input.components[i]);
        if (!Number.isFinite(n) || n < 0 || n > 1) {
            return { ok: false, reason: `component[${i}] out of range (${input.components[i]})` };
        }
    }
    if (typeof input.alpha === 'number') {
        const a = Number(input.alpha);
        if (!Number.isFinite(a) || a < 0 || a > 1) {
            return { ok: false, reason: `alpha out of range (${input.alpha})` };
        }
    }
    return { ok: true };
}
