<!-- OPENSPEC:START -->

# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:

-   Mentions planning or proposals (words like proposal, spec, change, plan)
-   Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
-   Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:

-   How to create and apply change proposals
-   Spec format and conventions
-   Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# Repository Guidelines

## Tooling

-   Use Node.js 18+ (matches the version esbuild/TypeScript expect).
-   Install deps with `npm install`.
-   Available project scripts:
    -   `npm run build` – bundle the plugin once (generates `dist/main.js` and inlines the UI markup).
    -   `npm run watch` – rebuild on file changes.
    -   `npm run typecheck` – run the TypeScript compiler in no-emit mode.
-   Never edit files in `dist/` directly; regenerate them by running the build.

## TypeScript & General Code Style

-   Every source file begins with a comment that names the path and states its purpose; include or update that header when creating or significantly changing a file.
-   Prefer explicit `function` declarations and straightforward control flow. The codebase intentionally uses simple `for` loops (often with `var`) for determinism and bundle-friendly output—match this style when working in existing modules.
-   Use `import type` for type-only imports to keep the bundle lean.
-   Preserve existing ordering guarantees (especially in token normalization) and avoid adding helpers that would reorder data implicitly.
-   Guard optional Figma APIs and browser APIs with defensive checks; silent `catch { /* ignore */ }` blocks are used deliberately to keep the plugin resilient.

## UI (src/app/ui.\*)

-   The UI is plain DOM manipulation—no frameworks. Keep DOM queries narrow, cache elements once, and prefer helper functions over inline duplication.
-   CSS lives alongside the HTML template. Use the existing custom properties (`--bg`, `--ink`, etc.) and spacing conventions instead of introducing new ad-hoc values unless necessary.
-   When updating UI logic, make sure new postMessage payloads stay in sync with the `UiToPlugin`/`PluginToUi` discriminated unions in `src/app/messages.ts`.

## GitHub / Token Pipelines

-   Token graph helpers (under `src/core/`) rely on deterministic sorting and canonical path utilities. Preserve canonicalization helpers and do not introduce floating-point comparisons without guards.
-   `$extensions` metadata must round-trip untouched. Treat extension objects as opaque unless a transformer is explicitly designed to modify them.

## Testing Expectations

-   Run `npm run typecheck` after modifying TypeScript.
-   When changes affect the compiled output or manifest wiring, run `npm run build` to ensure assets emit successfully.
