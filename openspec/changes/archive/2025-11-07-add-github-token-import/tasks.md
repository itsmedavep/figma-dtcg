## Implementation Tasks
- [x] Audit current GitHub tab flows and identify existing repo/branch selection state and messaging contracts.
- [x] Add UI controls + messaging (UiToPlugin/PluginToUi) for selecting the token file path and triggering the import action on the GitHub tab.
- [x] Implement plugin-side GitHub fetch + schema validation pipeline that reuses DTCG normalization helpers and surfaces actionable errors.
- [x] Map imported tokens onto Figma variable collections/modes, updating existing variables and creating missing ones while preserving `$extensions` and alias metadata.
- [x] Emit import summaries + warnings back to the UI and add basic progress feedback to prevent timeouts for large payloads.
- [x] Add/extend tests or type-check coverage (`npm run typecheck`) and document manual verification steps for GitHub imports.
