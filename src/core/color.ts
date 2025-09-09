// src/core/color.ts
// Accurate, spec-aligned color handling for DTCG <-> Figma.
// No optional chaining, no nullish coalescing, no spread.

// Types
import type { ColorValue } from './ir';

export type DocumentProfile = 'SRGB' | 'DISPLAY_P3' | 'LEGACY';

// ---------- Basics ----------

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function clamp01Array(v: number[]): number[] {
  var out: number[] = [];
  var i = 0;
  for (i = 0; i < v.length; i++) out.push(clamp01(v[i]));
  return out;
}

// sRGB / P3 transfer (CSS Color 4 uses the same ~2.4 gamma TRC for P3)
function srgbEncode(linear: number): number {
  if (linear <= 0.0031308) return 12.92 * linear;
  return 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
}
function srgbDecode(encoded: number): number {
  if (encoded <= 0.04045) return encoded / 12.92;
  return Math.pow((encoded + 0.055) / 1.055, 2.4);
}
var p3Encode = srgbEncode;
var p3Decode = srgbDecode;

// Matrix multiply 3x3 * 3x1
function mul3(m: number[][], v: number[]): number[] {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

// D65 matrices (CSS Color 4)
// sRGB <-> XYZ
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

// Display-P3 <-> XYZ (D65)
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

function encode(space: 'srgb' | 'display-p3', linearRGB: number[]): number[] {
  if (space === 'display-p3') {
    return [p3Encode(linearRGB[0]), p3Encode(linearRGB[1]), p3Encode(linearRGB[2])];
  }
  return [srgbEncode(linearRGB[0]), srgbEncode(linearRGB[1]), srgbEncode(linearRGB[2])];
}
function decode(space: 'srgb' | 'display-p3', encodedRGB: number[]): number[] {
  if (space === 'display-p3') {
    return [p3Decode(encodedRGB[0]), p3Decode(encodedRGB[1]), p3Decode(encodedRGB[2])];
  }
  return [srgbDecode(encodedRGB[0]), srgbDecode(encodedRGB[1]), srgbDecode(encodedRGB[2])];
}

function convertRgbSpace(
  rgb: number[],
  src: 'srgb' | 'display-p3',
  dst: 'srgb' | 'display-p3'
): number[] {
  if (src === dst) return clamp01Array(rgb);

  var lin = decode(src, clamp01Array(rgb));
  var xyz: number[];
  if (src === 'srgb') xyz = mul3(M_SRGB_TO_XYZ, lin);
  else xyz = mul3(M_P3_TO_XYZ, lin);

  var linDst: number[];
  if (dst === 'srgb') linDst = mul3(M_XYZ_TO_SRGB, xyz);
  else linDst = mul3(M_XYZ_TO_P3, xyz);

  var enc = encode(dst, linDst);
  return clamp01Array(enc);
}

function srgbToHex6(rgb: number[]): string {
  // rgb expected in encoded sRGB 0..1
  var r = Math.round(clamp01(rgb[0]) * 255);
  var g = Math.round(clamp01(rgb[1]) * 255);
  var b = Math.round(clamp01(rgb[2]) * 255);
  function to2(n: number): string {
    var s = n.toString(16);
    if (s.length === 1) return '0' + s;
    return s;
  }
  return '#' + to2(r) + to2(g) + to2(b);
}

function srgbToHex8(rgba: { r: number; g: number; b: number; a: number }): string {
  var r = Math.round(clamp01(rgba.r) * 255);
  var g = Math.round(clamp01(rgba.g) * 255);
  var b = Math.round(clamp01(rgba.b) * 255);
  var a = Math.round(clamp01(rgba.a) * 255);
  function to2(n: number): string {
    var s = n.toString(16);
    if (s.length === 1) return '0' + s;
    return s;
  }
  return '#' + to2(r) + to2(g) + to2(b) + to2(a);
}

function isHexCharCode(code: number): boolean {
  // 0-9, A-F, a-f
  if (code >= 48 && code <= 57) return true;
  if (code >= 65 && code <= 70) return true;
  if (code >= 97 && code <= 102) return true;
  return false;
}
function hexPairToByte(h1: number, h2: number): number {
  function val(c: number): number {
    if (c >= 48 && c <= 57) return c - 48;
    if (c >= 65 && c <= 70) return c - 55;
    if (c >= 97 && c <= 102) return c - 87;
    return 0;
  }
  return (val(h1) << 4) | val(h2);
}

/**
 * Parse hex forms: #RGB, #RGBA, #RRGGBB, #RRGGBBAA (case-insensitive).
 * Returns encoded sRGB floats (0..1) plus alpha.
 */
export function parseHexToSrgbRGBA(hex: string): { r: number; g: number; b: number; a: number } {
  var s = hex;
  if (s.length > 0 && s.charAt(0) === '#') s = s.substring(1);

  var i = 0;
  for (i = 0; i < s.length; i++) {
    if (!isHexCharCode(s.charCodeAt(i))) {
      throw new Error('Invalid hex color: ' + hex);
    }
  }

  var r = 0, g = 0, b = 0, a = 255;

  if (s.length === 3 || s.length === 4) {
    // #RGB or #RGBA -> duplicate nibbles
    var rNib = s.charCodeAt(0);
    var gNib = s.charCodeAt(1);
    var bNib = s.charCodeAt(2);
    var aNib = s.length === 4 ? s.charCodeAt(3) : 102; // 'f'
    r = hexPairToByte(rNib, rNib);
    g = hexPairToByte(gNib, gNib);
    b = hexPairToByte(bNib, bNib);
    a = hexPairToByte(aNib, aNib);
  } else if (s.length === 6 || s.length === 8) {
    // #RRGGBB or #RRGGBBAA
    r = hexPairToByte(s.charCodeAt(0), s.charCodeAt(1));
    g = hexPairToByte(s.charCodeAt(2), s.charCodeAt(3));
    b = hexPairToByte(s.charCodeAt(4), s.charCodeAt(5));
    if (s.length === 8) a = hexPairToByte(s.charCodeAt(6), s.charCodeAt(7));
  } else {
    throw new Error('Invalid hex length: ' + hex);
  }

  return {
    r: clamp01(r / 255),
    g: clamp01(g / 255),
    b: clamp01(b / 255),
    a: clamp01(a / 255)
  };
}

// Map Figma document profile to DTCG colorSpace key
function docProfileToSpaceKey(profile: DocumentProfile): 'srgb' | 'display-p3' {
  if (profile === 'DISPLAY_P3') return 'display-p3';
  // Treat LEGACY as sRGB
  return 'srgb';
}

// ---------- Public converters ----------

/**
 * DTCG -> Figma RGBA in current document profile.
 * If both components and hex exist, components win (hex is a fallback).
 * Supports colorSpace: 'srgb' | 'display-p3'. Others -> explicit error (single code path).
 */
export function dtcgToFigmaRGBA(
  value: ColorValue,
  docProfile: DocumentProfile
): { r: number; g: number; b: number; a: number } {
  var alpha = typeof value.alpha === 'number' ? value.alpha : 1;

  var dst = docProfileToSpaceKey(docProfile);

  // Prefer components if present
  var comps = value.components;
  if (comps && comps.length >= 3) {
    var space = value.colorSpace;
    if (space === 'srgb' || space === 'display-p3') {
      var converted = convertRgbSpace([comps[0], comps[1], comps[2]], space, dst);
      return { r: converted[0], g: converted[1], b: converted[2], a: clamp01(alpha) };
    }
    throw new Error('Unsupported colorSpace: ' + space + '. Supported: srgb, display-p3.');
  }

  // Fallback: hex (interpreted as sRGB)
  if (value.hex && typeof value.hex === 'string') {
    var fromHex = parseHexToSrgbRGBA(value.hex);
    // If alpha property provided, it overrides hex alpha (useful for 6-digit hex + alpha)
    var a = typeof value.alpha === 'number' ? clamp01(value.alpha) : fromHex.a;
    if (dst === 'srgb') return { r: fromHex.r, g: fromHex.g, b: fromHex.b, a: a };
    var toDst = convertRgbSpace([fromHex.r, fromHex.g, fromHex.b], 'srgb', dst);
    return { r: toDst[0], g: toDst[1], b: toDst[2], a: a };
  }

  throw new Error('Color has neither components nor hex.');
}

/**
 * Figma -> DTCG ColorValue in the document’s native space (for best round-trip).
 * Always includes 6-digit sRGB `hex` fallback (alpha remains separate).
 */
export function figmaRGBAToDtcg(
  rgba: { r: number; g: number; b: number; a: number },
  docProfile: DocumentProfile
): ColorValue {
  var src = docProfileToSpaceKey(docProfile);
  var rgb = [clamp01(rgba.r), clamp01(rgba.g), clamp01(rgba.b)];
  var a = clamp01(rgba.a);

  // Emit in document-native space
  var colorSpace = src;
  var components = [rgb[0], rgb[1], rgb[2]];

  // Hex fallback must be sRGB
  var srgbRgb = src === 'srgb' ? rgb : convertRgbSpace(rgb, 'display-p3', 'srgb');
  var hex = srgbToHex6(srgbRgb);

  return { colorSpace: colorSpace, components: components, alpha: a, hex: hex };
}

// ---------- Convenience helpers (optional but handy) ----------

/**
 * Return 6-digit sRGB hex (#RRGGBB) from an encoded sRGB triple (0..1).
 */
export function toHex6FromSrgb(rgb: { r: number; g: number; b: number }): string {
  return srgbToHex6([clamp01(rgb.r), clamp01(rgb.g), clamp01(rgb.b)]);
}

/**
 * Return 8-digit sRGB hex (#RRGGBBAA) from encoded sRGB RGBA (0..1).
 * Not part of the DTCG spec; useful for tooling/UX.
 */
export function toHex8FromSrgb(rgba: { r: number; g: number; b: number; a: number }): string {
  return srgbToHex8({ r: clamp01(rgba.r), g: clamp01(rgba.g), b: clamp01(rgba.b), a: clamp01(rgba.a) });
}

/**
 * Convert any sRGB hex (#RGB/#RGBA/#RRGGBB/#RRGGBBAA) to a DTCG ColorValue (srgb).
 * Alpha is captured from hex if present.
 */
export function hexToDtcgColor(hex: string): ColorValue {
  var rgba = parseHexToSrgbRGBA(hex);
  return { colorSpace: 'srgb', components: [rgba.r, rgba.g, rgba.b], alpha: rgba.a, hex: srgbToHex6([rgba.r, rgba.g, rgba.b]) };
}
