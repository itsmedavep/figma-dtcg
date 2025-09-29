# Follow-up Task Suggestions

## Typo Fix
- **Issue**: The fixture name and collection label "Tokens - Color pallets" in the test data are misspelled.
- **File**: `tests/Tokens - Color pallets - Mode 1.json`
- **Suggested Fix**: Rename the collection and file references to "Tokens - Color palettes" to match the proper spelling.

## Bug Fix
- **Issue**: `readDtcgToIR` can emit a token whose declared `$type` (e.g., `number`) disagrees with the coerced value kind because the fallback branch writes whatever JS type it sees, even when a stricter type was declared.
- **File**: `src/adapters/dtcg-reader.ts`
- **Suggested Fix**: Guard the fallback branch so that it only runs when the declared type is unknown, or coerce the final `TokenNode.type` to match the emitted `valObj.kind` to keep type/value in sync.

## Comment/Documentation Fix
- **Issue**: The inline comment `// Primitives (respect declared type; no color coercion here)` in `readDtcgToIR` does not match the implementation, which currently overwrites the declared type when the fallback branch runs.
- **File**: `src/adapters/dtcg-reader.ts`
- **Suggested Fix**: Update the comment (and/or adjust surrounding code) so the documentation matches the actual coercion rules.

## Test Improvement
- **Issue**: There is no automated coverage ensuring `readDtcgToIR` rejects or preserves numeric tokens when `$type` is `number` but `$value` is a string, so the regression above could recur silently.
- **Suggested Fix**: Add a unit test around `readDtcgToIR` that feeds a `$type: "number"` token with a string `$value` and asserts that the importer either preserves the string type or surfaces a validation error.
- **Files**: Add a new test under `tests/` or a dedicated test suite exercising `src/adapters/dtcg-reader.ts`.
