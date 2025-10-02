# Typography Round-Trip Implementation Plan

## Objectives
- Normalize typography tokens to comply with the Design Tokens Community Group (DTCG) composite `typography` definition while retaining Figma-only metadata for round-tripping.
- Preserve all raw Figma text style properties via `$extensions.com.figma` so imports can faithfully reconstruct document styles.
- Expand automated coverage to ensure edge cases such as percentage-based and negative letter spacing continue to round-trip.
- Honor the DTCG dimension constraint that only `px` and `rem` units are allowed in exported payloads, mapping Figma-specific units into extensions when necessary.

## 1. Audit Current Pipelines
1. Review `src/core/typography.ts` to document how typography values are parsed/serialized today (units, optional fields, extension passthrough).
2. Trace typography handling through adapters:
   - DTCG import/export (`src/adapters/dtcg-reader.ts`, `src/adapters/dtcg-writer.ts`).
   - Figma import/export (`src/adapters/figma-reader.ts`, `src/adapters/figma-writer.ts`).
3. Identify where `$extensions.com.figma` blocks are constructed and merged during round-trip to scope required metadata changes.

## 2. Extend Shared Types & Validation
1. Update `TypographyValue` (and supporting types) to capture the richer metadata needed for extensions, e.g. raw unit/value pairs for letter spacing and line height.
2. Add explicit TypeScript interfaces for `$extensions.com.figma.typography`, covering:
   - `letterSpacing`: `{ value: number; unit: 'PIXELS' | 'PERCENT' }` (mirroring Figma API naming) while keeping DTCG-facing dimensions constrained to `'px' | 'rem'`.
   - `lineHeight`: `{ value: number; unit: 'PIXELS' | 'PERCENT' } | 'AUTO'`.
   - Buckets for other raw Figma text props (paragraph spacing/indent, text decoration, casing, alignment, ligatures, opentype features, fills, strokes, `hyperlink`, etc.).
3. Wire new types into validation helpers so adapters guarantee the extension payload matches expectations.

## 3. Normalize Exported `$value`
1. In the DTCG writer, ensure `$value.letterSpacing` is emitted as a DTCG dimension using the supported `px` unit:
   - Convert raw percent inputs to pixels using the resolved `fontSize` (or omit if `fontSize` is missing), outputting `{ value: <number>, unit: 'px' }`.
   - Convert existing pixel inputs from Figma to the same `{ value, unit: 'px' }` structure without leaking the Figma-specific `PIXELS` enum.
   - Allow negative and fractional values; clamp only if required by spec.
2. Transform `$value.lineHeight` into a numeric multiplier relative to `fontSize`:
   - Percent inputs become `value / 100`.
   - Pixel inputs become `value / fontSize` when `fontSize` is available; fall back to 0 or omit when not computable, while retaining raw data in extensions.
   - Preserve `'auto'` verbatim when encountered.
3. Strip all Figma-only properties from `$value` (paragraph spacing, alignment, decorations, fills, strokes, opentype flags, etc.) and collect them into the extension payload.

## 4. Populate `$extensions.com.figma`
1. Mirror the exact Figma API unit/value pairs for `letterSpacing` and `lineHeight` inside the extension block.
2. Store untouched copies of additional text-style props (paragraph spacing/indent, textCase, textDecoration, textAlign*, ligatures, `textAutoResize`, `textTransform`, `fills`, `strokes`, `hyperlink`, `listOptions`, etc.) following the Figma API response schema.
3. Ensure context-specific overrides are also represented (e.g., nested `perContext` blocks) so multi-mode styles round-trip correctly.

## 5. Update Importers
1. When reconstructing Figma text styles, read extension metadata first:
   - Apply `letterSpacing` from `$extensions.com.figma.letterSpacing`; fall back to `$value` conversion only if extension data is absent.
   - Rehydrate `lineHeight`, paragraph spacing, alignment, and other props directly from the stored metadata.
2. When populating the IR from DTCG payloads, populate both normalized values and extension hints so subsequent exports remain spec-compliant.
3. Guarantee backward compatibility by gracefully handling legacy tokens without the new extension fields.

## 6. Testing Strategy
1. Extend unit tests under `tests/` to cover:
   - Export of typography tokens with positive, negative, and percentage letter spacing (asserting pixel normalization and extension mirroring).
   - Line height exports for pixel, percent, and `auto` inputs.
   - Import round-trips ensuring extension data restores original units and raw values.
2. Add fixture-based integration tests simulating real Figma text styles, ensuring adapters write/read the enriched extension data.
3. Include regression tests for legacy payloads lacking the new metadata to verify graceful fallbacks.

## 7. Documentation & DX
1. Update `README.md` (and any CLI help) to describe the new typography handling, highlighting spec compliance and extension payloads.
2. Capture any migration notes in `TASKS.md` or release notes so downstream consumers know how to interpret the enriched tokens.
3. If relevant, surface lints/warnings in the plugin UI when conversions require assumptions (e.g., missing `fontSize` prevents percent → px conversion).

## 8. Rollout Considerations
1. Evaluate whether existing stored tokens require automated migration; if so, provide a script or describe manual steps.
2. Coordinate testing with sample Figma documents containing complex typography (ligatures, list options, mixed alignment) to confirm nothing regresses.
3. Plan incremental rollout (behind a feature flag or beta channel) if necessary, monitoring for precision regressions reported by users.
