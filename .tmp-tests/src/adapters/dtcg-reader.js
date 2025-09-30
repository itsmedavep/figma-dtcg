"use strict";
// src/adapters/dtcg-reader.ts
// Parse raw DTCG token JSON into our IR without losing metadata or alias structure.
// - Validates values strictly so we fail fast on malformed input
// - Preserves $extensions fields to keep Figma round-trips intact
Object.defineProperty(exports, "__esModule", { value: true });
exports.readDtcgToIR = readDtcgToIR;
// ---------- color parsing (strict) ----------
const color_1 = require("../core/color");
// ---------- lightweight logging (no toasts) ----------
function logInfo(msg) {
    try {
        figma.ui?.postMessage({ type: 'INFO', payload: { message: msg } });
    }
    catch { /* ignore */ }
}
function logWarn(msg) { logInfo('Warning: ' + msg); }
// ---------- helpers ----------
/** Guard for plain-object own keys without letting sneaky prototypes through. */
function hasKey(o, k) {
    return !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
}
/** True when the value looks like an alias string: "{collection.group.token}". */
function isAliasString(v) {
    return typeof v === 'string' && v.startsWith('{') && v.endsWith('}') && v.length > 2;
}
/** Split an alias string into raw segments while keeping user formatting intact. */
function parseAliasToSegments(v) {
    // exact segments, keep spacing/punctuation as-is (only trim around the dot delimiter)
    return v.slice(1, -1).split('.').map(s => s.trim());
}
/** Quick heuristic for hex strings so we only attempt conversions on plausible inputs. */
function isLikelyHexString(v) {
    return typeof v === 'string'
        && /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v.trim());
}
/** Extract a trimmed $description if present; avoids emitting empty strings. */
function readDescription(obj) {
    if (!obj || typeof obj !== 'object')
        return undefined;
    const d = obj['$description'];
    if (typeof d === 'string') {
        const s = d.trim();
        if (s.length > 0)
            return s;
    }
    return undefined;
}
/**
 * Flexible color parser:
 * - Strict by default (reject all string forms).
 * - When allowHexStrings = true, accept hex strings -> DTCG object via hexToDtcgColor (srgb).
 * - Always accept objects only if shape is valid (supported colorSpace, 3 numeric components, alpha number in [0..1] or undefined).
 * - Do NOT coerce object member types (alpha:"1" stays string -> rejected by validator).
 */
function readColorValueFlexible(raw, allowHexStrings) {
    // String form
    if (typeof raw === 'string') {
        if (!allowHexStrings)
            return null;
        if (!isLikelyHexString(raw))
            return null;
        try {
            return { value: (0, color_1.hexToDtcgColor)(raw), coercedFromHex: true };
        }
        catch {
            return null;
        }
    }
    // Object form (no coercion)
    if (raw && typeof raw === 'object') {
        const obj = raw;
        const candidate = {
            // keep as-is; validator will check allowed spaces (srgb/display-p3)
            ...(typeof obj.colorSpace === 'string' ? { colorSpace: obj.colorSpace } : {}),
            ...(Array.isArray(obj.components) ? { components: obj.components.slice(0, 3) } : {}),
            // preserve provided alpha *as-is*; validator will reject non-number/out-of-range
            ...(('alpha' in obj) ? { alpha: obj.alpha } : {}),
            ...(typeof obj.hex === 'string' ? { hex: obj.hex } : {})
        };
        const shape = (0, color_1.isDtcgColorShapeValid)(candidate);
        if (!shape.ok)
            return null;
        return { value: candidate, coercedFromHex: false };
    }
    return null;
}
/**
 * Compute IR path and ctx for a token based on:
 *  - $extensions.com.figma.modeName (if present, use EXACT string)
 *  - otherwise the JSON group path literally (no normalization)
 *  - default Figma mode when missing = "Mode 1"
 */
function computePathAndCtx(path, obj) {
    const irPath = path.slice(); // EXACT JSON path
    let mode = 'Mode 1';
    const ext = hasKey(obj, '$extensions') ? obj['$extensions'] : undefined;
    const cf = ext && typeof ext === 'object' ? ext['com.figma'] : undefined;
    if (cf && typeof cf === 'object' && typeof cf.modeName === 'string') {
        mode = cf.modeName;
    }
    const collection = irPath[0] ?? 'Tokens';
    return { irPath, ctx: `${collection}/${mode}` };
}
function guessTypeFromValue(v) {
    if (typeof v === 'number')
        return 'number';
    if (typeof v === 'boolean')
        return 'boolean';
    if (typeof v === 'string')
        return 'string';
    return 'string';
}
function readDtcgToIR(root, opts = {}) {
    const allowHexStrings = !!opts.allowHexStrings;
    const tokens = [];
    function visit(obj, path, inheritedType) {
        if (!obj || typeof obj !== 'object')
            return;
        // group-level $type inheritance (DTCG)
        let groupType = inheritedType;
        if (hasKey(obj, '$type') && typeof obj.$type === 'string') {
            const t = String(obj.$type);
            if (t === 'color' || t === 'number' || t === 'string' || t === 'boolean') {
                groupType = t;
            }
        }
        // Token node?
        if (hasKey(obj, '$value')) {
            const rawVal = obj.$value;
            // Optional $description (DTCG)
            const desc = readDescription(obj);
            // Aliases are always strings of the form {a.b.c}
            if (isAliasString(rawVal)) {
                const segs = parseAliasToSegments(rawVal);
                const { irPath, ctx } = computePathAndCtx(path, obj);
                const byCtx = {};
                byCtx[ctx] = { kind: 'alias', path: segs };
                tokens.push({
                    path: irPath,
                    type: groupType ?? 'string',
                    byContext: byCtx,
                    ...(desc ? { description: desc } : {}),
                    ...(hasKey(obj, '$extensions') ? { extensions: obj['$extensions'] } : {})
                });
                return;
            }
            // Colors: ONLY when $type (inherited or local) is 'color'
            if (groupType === 'color') {
                const { irPath, ctx } = computePathAndCtx(path, obj);
                const parsed = readColorValueFlexible(rawVal, allowHexStrings);
                if (!parsed) {
                    if (typeof rawVal === 'string') {
                        if (allowHexStrings) {
                            logWarn(`Skipped invalid color for “${irPath.join('/')}” — expected hex string or a valid DTCG color object (srgb/display-p3, 3 numeric components, alpha in [0..1]).`);
                        }
                        else {
                            logWarn(`Skipped invalid color for “${irPath.join('/')}” — expected a DTCG color object (srgb/display-p3, 3 numeric components, optional numeric alpha in [0..1]); strings like "#RRGGBB" are not accepted.`);
                        }
                    }
                    else {
                        logWarn(`Skipped invalid color for “${irPath.join('/')}” — expected a valid DTCG color object (srgb/display-p3, 3 numeric components, alpha in [0..1]).`);
                    }
                    return;
                }
                if (parsed.coercedFromHex) {
                    logInfo(`Coerced string hex to DTCG color object for “${irPath.join('/')}”.`);
                }
                const byCtx = {};
                byCtx[ctx] = { kind: 'color', value: parsed.value };
                tokens.push({
                    path: irPath,
                    type: 'color',
                    byContext: byCtx,
                    ...(desc ? { description: desc } : {}),
                    ...(hasKey(obj, '$extensions') ? { extensions: obj['$extensions'] } : {})
                });
                return;
            }
            // Primitives (respect declared type; no color coercion here)
            const t2 = groupType ?? guessTypeFromValue(rawVal);
            let valObj = null;
            if (t2 === 'number' && typeof rawVal === 'number') {
                valObj = { kind: 'number', value: rawVal };
            }
            else if (t2 === 'boolean' && typeof rawVal === 'boolean') {
                valObj = { kind: 'boolean', value: rawVal };
            }
            else if (t2 === 'string' && typeof rawVal === 'string') {
                valObj = { kind: 'string', value: rawVal };
            }
            // DTCG-compliant boolean round-trip:
            // If $type is (or resolves to) "string" and $extensions.com.figma.variableType == "BOOLEAN"
            // and $value is "true"/"false", coerce back to boolean with a mild note.
            if (!valObj && (t2 === 'string') && typeof rawVal === 'string') {
                const ext = hasKey(obj, '$extensions') ? obj['$extensions'] : undefined;
                const com = ext && typeof ext === 'object' ? ext['com.figma'] : undefined;
                const varType = com && typeof com === 'object' ? com['variableType'] : undefined;
                if (varType === 'BOOLEAN') {
                    const raw = rawVal.trim().toLowerCase();
                    if (raw === 'true' || raw === 'false') {
                        valObj = { kind: 'boolean', value: (raw === 'true') };
                        // mild note in the plugin log
                        logInfo(`Note: coerced string “${rawVal}” to boolean due to $extensions.com.figma.variableType=BOOLEAN at “${path.join('/')}”.`);
                        // also set the effective token type to boolean
                        groupType = 'boolean';
                    }
                }
            }
            else {
                // Fallback: minimally coerce by JS type (but still never to color)
                if (typeof rawVal === 'string')
                    valObj = { kind: 'string', value: rawVal };
                else if (typeof rawVal === 'number')
                    valObj = { kind: 'number', value: rawVal };
                else if (typeof rawVal === 'boolean')
                    valObj = { kind: 'boolean', value: rawVal };
            }
            if (valObj) {
                const { irPath, ctx } = computePathAndCtx(path, obj);
                const byCtx = {};
                byCtx[ctx] = valObj;
                const finalType = (groupType ?? t2);
                tokens.push({
                    path: irPath,
                    type: finalType,
                    byContext: byCtx,
                    ...(desc ? { description: desc } : {}),
                    ...(hasKey(obj, '$extensions') ? { extensions: obj['$extensions'] } : {})
                });
            }
            return;
        }
        // Group: recurse children with *exact* key names (no slugging/canonicalization)
        for (const k in obj) {
            if (!Object.prototype.hasOwnProperty.call(obj, k))
                continue;
            if (k.startsWith('$'))
                continue; // skip metadata keys
            const child = obj[k];
            const newPath = path.concat([k]); // preserve key *exactly*
            visit(child, newPath, groupType);
        }
    }
    visit(root, [], null);
    return { tokens };
}
