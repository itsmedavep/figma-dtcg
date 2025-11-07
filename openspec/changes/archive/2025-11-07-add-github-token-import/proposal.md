## Change: add-github-token-import

## Why
Partners need to hydrate Figma variables with the latest canonical tokens without manually copying JSON. Today the GitHub tab only syncs exports, so designers must download files locally and run the CLI to update Figma, which causes drift and errors when `$extensions` or per-mode metadata are lost. An earlier attempt to import tokens exists but fails to actually create/update Figma variables, so this change is a refactor that replaces that broken flow with a working pipeline. Shipping an in-plugin importer unlocks round-trips and keeps token graphs consistent with the source repo.

## What Changes
- Extend the GitHub tab with controls to choose a repository, branch, and token file path to import a DTCG-compliant JSON payload directly from GitHub.
- Validate the fetched file against the W3C Design Tokens schema plus existing normalization rules so malformed payloads are rejected with actionable errors.
- Convert the imported tokens into Figma variable collections/modes, updating existing variables when names match and creating new ones when needed while preserving `$extensions`, aliases, and per-mode values.
- Provide an import summary (created/updated counts + warnings) so designers can confirm the applied changes.

## Success Criteria
- Designers can select a repo/branch/file on the GitHub tab, trigger an import, and see the expected variables updated inside Figma without leaving the plugin.
- Invalid token files produce clear blocking errors before any Figma mutations occur.
- `$extensions`, alias relationships, and per-mode values are preserved after import.
- Imports respect the selected repo/branch configuration that already exists for exports, avoiding new auth surfaces.

## Non-Goals
- Export improvements, pull-request creation, or bidirectional diff tooling are out of scope.
- Supporting non-GitHub git providers or non-DTCG token files is out of scope.

## Risks & Mitigations
- **Large token files** could slow imports → stream parsing and progress feedback mitigate perceived stalls.
- **Schema drift** could reject legit payloads → reuse existing normalization + versioned schema pins and allow `$extensions` passthrough.
- **Figma API rate limits** when creating many variables → batch updates and reuse existing throttling helpers.
