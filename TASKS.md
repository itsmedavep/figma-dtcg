# Follow-up Task Suggestions

## Implementation Notes
- Token import/export now relies on `loadCollectionsSnapshot` (`src/core/figma-cache.ts`) to cache `Variable` handles; reuse this helper instead of issuing fresh `getVariableByIdAsync` loops.
- GitHub folder inputs are validated and normalized through `normalizeFolderForStorage`/`folderStorageToCommitPath` (`src/app/main.ts:75-127`); callers should surface the returned error message when `.ok` is `false` rather than persisting raw input.
- Export filenames replace Windows-hostile characters via `sanitizeForFile` (`src/core/pipeline.ts:38-45`), with regression coverage in `tests/sanitizeForFile.test.ts`.

## Spec Compliance Review
- Expand support for the W3C design token type vocabulary beyond `color|number|string|boolean`; IR and adapters currently drop or mis-type spec-defined primitives and composites (e.g. `dimension`, `duration`, `fontFamily`, `shadow`, `gradient`) (`src/core/ir.ts:7`, `src/adapters/dtcg-reader.ts:152`, `src/adapters/dtcg-writer.ts:205`).
- Emit `$type` values that remain inside the registered spec vocabulary. Revisit the boolean round-trip hack that rewrites `$type: "string"` with stringified values; the spec (§8) treats those tokens as invalid (`src/adapters/dtcg-writer.ts:154-215`).
- Broaden color handling to accept the Color Module’s allowed spaces and component ranges; today only `srgb`/`display-p3` pass validation, and invalid fallbacks sneak through unchecked (`src/core/color.ts:18-210`, `src/adapters/dtcg-reader.ts:191-205`).
- Enforce the six-digit CSS hex fallback requirement from the Color Module when reading or emitting `hex` so malformed values aren’t preserved (`src/core/color.ts:182-208`, `src/adapters/dtcg-reader.ts:60-107`).

## Bridging Spec Gaps for Figma Variables
- Maintain a spec-valid export path: only emit tokens whose `$type` exists in the DTCG vocabulary and whose `$value` conforms. Anything else (Figma string/boolean) must be represented out-of-band.
- Record dropped variables in `$extensions.com.figma` (or a companion artifact) with canonical path, mode metadata, raw value, and `variableType` so the plugin can faithfully rehydrate them during import.
- On import, rebuild string/boolean Figma variables from the extension payload and merge them with the canonical token graph before syncing back to Figma.
- Offer an explicit “permissive” export mode that keeps `$type:"string"` / `$type:"boolean"` tokens for teams that prefer a single-file round trip, and surface a compliance warning when it’s enabled.
- Document the strict vs. permissive modes in README/CLI copy and explain how downstream consumers should treat the `com.figma` extension block.
- Track an outreach task with the Design Tokens Community Group requesting first-class support for generic string/boolean primitives so we can eventually retire the workaround.

## Decision Log / Next Actions
- Decide whether string/boolean storage should live inside `$extensions.com.figma` or in a distinct companion file; update the export surface accordingly.
- Align the team on default export mode (strict vs. permissive) and add configuration toggles where needed.
- Once the strategy is finalized, schedule implementation work to update the adapters, pipeline validation, and documentation.

## Testing Suite
- Review codebase and add tests to ensure that everything is correct and we dont have regressions.
