# Follow-up Task Suggestions

## Implementation Notes
- Token import/export now relies on `loadCollectionsSnapshot` (`src/core/figma-cache.ts`) to cache `Variable` handles; reuse this helper instead of issuing fresh `getVariableByIdAsync` loops.
- GitHub folder inputs are validated and normalized through `normalizeFolderForStorage`/`folderStorageToCommitPath` (`src/app/main.ts:75-127`); callers should surface the returned error message when `.ok` is `false` rather than persisting raw input.
- Export filenames replace Windows-hostile characters via `sanitizeForFile` (`src/core/pipeline.ts:38-45`), with regression coverage in `tests/sanitizeForFile.test.ts`.

## Spec Compliance Review
- Expand support for the W3C design token types beyond `color|number|string|boolean`; the current IR and adapters drop or mis-type spec-defined primitives and composites such as `dimension`, `duration`, `fontFamily`, `shadow`, etc. (`src/core/ir.ts:7`, `src/adapters/dtcg-reader.ts:152`, `src/adapters/dtcg-writer.ts:205`).
- Emit `$type` values that remain within the registered spec vocabulary and stop rewriting booleans as `$type: "string"` with stringified values; emitted files are currently invalid (§8) (`src/adapters/dtcg-writer.ts:154-215`).
- Broaden color handling to accept all color spaces allowed by the Color Module and enforce their component ranges; the validator currently rejects valid spaces and silently accepts invalid fallbacks (`src/core/color.ts:18-210`, `src/adapters/dtcg-reader.ts:191-205`).
- Enforce the six-digit CSS hex requirement when reading or generating `hex` fallbacks so invalid fallbacks are not persisted (`src/core/color.ts:182-208`, `src/adapters/dtcg-reader.ts:60-107`).
- Remove or gate the heuristic that strips `Collection N` segments while emitting JSON paths; dropping author-provided group names can break canonical alias paths (§5.1) (`src/adapters/dtcg-writer.ts:131-188`).
