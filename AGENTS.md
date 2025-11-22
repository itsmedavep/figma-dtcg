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
    -   `npm run watch` – rebuild on file changes (monitors `src/app/` for continuous development).
    -   `npm run typecheck` – run the TypeScript compiler in no-emit mode.
    -   `npm test` – run the Vitest unit test suite (tests in `src/**/*.test.ts` and `tests/__tests__/**/*.test.ts`).
    -   `npm run lint` – check code quality and style with ESLint.
-   Never edit files in `dist/` directly; regenerate them by running the build.
-   **CI/CD**: GitHub Actions runs tests, type checking, and builds on all PRs to `main` and `develop` branches.

## TypeScript & General Code Style

-   Every source file begins with a comment that names the path and states its purpose; include or update that header when creating or significantly changing a file.
-   Prefer explicit `function` declarations and straightforward control flow. The codebase intentionally uses simple `for` loops (often with `var`) for determinism and bundle-friendly output—match this style when working in existing modules.
-   Use `import type` for type-only imports to keep the bundle lean.
-   Preserve existing ordering guarantees (especially in token normalization) and avoid adding helpers that would reorder data implicitly.
-   Guard optional Figma APIs and browser APIs with defensive checks; silent `catch { /* ignore */ }` blocks are used deliberately to keep the plugin resilient.
-   **Keep things modular in the code. No giant "god" functions.** The codebase follows a modular handler pattern (see `src/app/github/handlers/`) where each handler is focused on a single domain (auth, repos, branches, etc.).
-   Avoid using `any` type unless necessary. ESLint warns about `any` usage—use specific types or `unknown` with type guards instead.
-   **Test coverage**: When adding new functionality, include unit tests co-located with source files (`*.test.ts`) or in `tests/__tests__/`.

## Architecture Guidance

-   **Modular Handlers**: GitHub operations are split into domain-specific handlers in `src/app/github/handlers/`. Each handler exports functions for a specific concern (e.g., `auth.ts` for authentication, `repos.ts` for repository operations). When adding new GitHub functionality, create a new handler or extend an existing one—don't add to the dispatcher directly.
-   **UI Components**: Reusable UI components live in `src/app/ui/components/`. The `autocomplete.ts` component demonstrates the pattern: encapsulated state, clear API, and DOM manipulation via helpers. Use `dom-helpers.ts` utilities (`h()`, `clearChildren()`) for consistent DOM operations.
-   **Separation of Concerns**: Maintain clear boundaries:
    -   `src/core/` - Pure logic, no Figma or DOM dependencies
    -   `src/adapters/` - Format conversions only
    -   `src/app/` - Plugin and UI logic
-   **Message Contracts**: All UI ↔ Plugin communication uses typed messages in `src/app/messages.ts`. Add new message types to the discriminated unions (`UiToPlugin` / `PluginToUi`) when extending functionality.

## UI (src/app/ui.\*)

-   The UI is plain DOM manipulation—no frameworks. Keep DOM queries narrow, cache elements once, and prefer helper functions over inline duplication.
-   CSS lives alongside the HTML template. Use the existing custom properties (`--bg`, `--ink`, etc.) and spacing conventions instead of introducing new ad-hoc values unless necessary.
-   When updating UI logic, make sure new postMessage payloads stay in sync with the `UiToPlugin`/`PluginToUi` discriminated unions in `src/app/messages.ts`.

## GitHub / Token Pipelines

-   Token graph helpers (under `src/core/`) rely on deterministic sorting and canonical path utilities. Preserve canonicalization helpers and do not introduce floating-point comparisons without guards.
-   `$extensions` metadata must round-trip untouched. Treat extension objects as opaque unless a transformer is explicitly designed to modify them.
-   GitHub handlers in `src/app/github/handlers/` are independently testable—each handler has a corresponding test file in `__tests__/`.

## Testing Expectations

-   **Framework**: The project uses Vitest for unit testing. Tests run in Node environment.
-   **Test Locations**:
    -   `src/**/*.test.ts` - Unit tests co-located with source files (handlers, UI components)
    -   `tests/__tests__/**/*.test.ts` - Core functionality and integration tests
-   **Writing Tests**: When adding new handlers or components, create a corresponding `*.test.ts` file. See `src/app/github/handlers/__tests__/` for examples of handler testing patterns.
-   **Running Tests**:
    -   `npm test` - Run all tests once
    -   `npm run typecheck` - Validate TypeScript types
    -   `npm run lint` - Check code style and quality
-   **CI Integration**: All tests run automatically on pull requests via GitHub Actions. Ensure tests pass locally before pushing.
-   **Test Coverage**: Focus on:
    -   Handler logic (message routing, state management, API interactions)
    -   Core utilities (normalization, color conversions, token graph operations)
    -   UI component behavior (autocomplete, DOM helpers)
