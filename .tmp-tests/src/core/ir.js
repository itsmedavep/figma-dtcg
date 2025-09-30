"use strict";
// src/core/ir.ts
// Central token graph types shared between adapters.
// - Defines the minimal shape needed to round-trip DTCG and Figma
// - Keeps primitive helpers colocated with the structural types
Object.defineProperty(exports, "__esModule", { value: true });
exports.ctxKey = ctxKey;
/** Build a context key like `Collection/Mode`. */
function ctxKey(collection, mode) {
    return collection + '/' + mode;
}
