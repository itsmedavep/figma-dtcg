# Follow-up Task Suggestions

## Implementation Notes
- Token import/export now relies on `loadCollectionsSnapshot` (`src/core/figma-cache.ts`) to cache `Variable` handles; reuse this helper instead of issuing fresh `getVariableByIdAsync` loops.
- GitHub folder inputs are validated and normalized through `normalizeFolderForStorage`/`folderStorageToCommitPath` (`src/app/main.ts:75-127`); callers should surface the returned error message when `.ok` is `false` rather than persisting raw input.
- Export filenames replace Windows-hostile characters via `sanitizeForFile` (`src/core/pipeline.ts:38-45`), with regression coverage in `tests/sanitizeForFile.test.ts`.
