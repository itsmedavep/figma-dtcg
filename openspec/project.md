# Project Context

## Purpose

Bridge Figma variables and the W3C Design Tokens Format (DTCG) so designers and developers can import, validate, edit, and export canonical token graphs without losing `$extensions`, per-mode metadata, or GitHub history. The plugin streamlines day-to-day token ops by round-tripping data among Figma, local JSON, and GitHub repos with deterministic outputs.

## Tech Stack

-   TypeScript (ESM) targeting the Figma plugin runtime plus a plain DOM UI
-   Node.js 18+, esbuild, and tsc for bundling/type-checking
-   GitHub REST access for repo/branch operations initiated from the plugin
-   DTCG JSON schemas + custom normalization helpers for token serialization

## Project Conventions

### Code Style

-   Every source file starts with a comment noting its path + purpose; keep ASCII-only unless the file already uses Unicode.
-   Prefer explicit `function` declarations, deterministic `for` loops (often with `var`), and simple control flow to keep the bundle lean.
-   Use `import type` for type-only pulls, guard optional Figma/browser APIs, and avoid helper abstractions that would reorder tokens.
-   UI code is plain DOM manipulation: cache queried nodes, reuse helper functions, and stick to existing CSS custom properties.

### Architecture Patterns

-   `src/core` hosts the token graph IR plus normalization/validation passes; keep ordering + canonical path guarantees intact.
-   `src/adapters` translates between Figma variables, GitHub payloads, and DTCG JSON while treating `$extensions` blocks as opaque.
-   `src/app` splits between plugin runtime logic and DOM UI (`ui.html` + `ui.ts`), communicating via the discriminated unions in `src/app/messages.ts`.
-   Build output lives in `dist/`; never edit generated files directly—rerun `npm run build` after changes.

### Testing Strategy

-   Run `npm run typecheck` after code edits; TypeScript is the primary safety net.
-   Deterministic helpers have targeted tests compiled via `tsc -p tests/tsconfig.test.json`; execute the emitted JS in `tests/dist/` when touching normalization logic.
-   Manual verification inside the Figma desktop app is expected for UI + plugin flow changes (import/export, GitHub actions, typography exports).

### Git Workflow

-   Use OpenSpec proposals (under `openspec/changes/<change-id>/`) for any net-new capability, architectural shift, or behavioral change; follow the add/plan/validate workflow in `openspec/AGENTS.md`.
-   Keep feature work on short-lived branches that reference the associated change ID; run `openspec validate <change-id> --strict` before requesting reviews.
-   Avoid rewriting unrelated history; deterministic outputs and stable ordering keep diffs reviewable.

## Domain Context

-   Figma variables, modes, and typography styles convert into an intermediate token graph that must preserve alias relationships and per-mode metadata.
-   DTCG JSON exports require canonical ordering and path normalization so downstream Style Dictionary and GitHub diffs stay stable.
-   `$extensions` metadata—especially `com.figma`—is treated as opaque payload that must round-trip untouched.
-   GitHub integration lets users pull/push token files, open PRs, and sync specific collections/modes directly from the plugin UI.

## Important Constraints

-   Deterministic ordering + canonical path rules are mandatory; never introduce behavior that reorders tokens implicitly.
-   Preserve `$extensions`, `$description`, and alias relationships exactly; warn instead of mutating unknown metadata.
-   Guard Figma APIs (desktop vs. browser contexts) and GitHub calls to avoid runtime crashes; prefer silent `catch {}` blocks for resilience.
-   Stick to Node 18+ features supported by esbuild; avoid runtime dependencies that Figma’s sandbox cannot load.

## External Dependencies

-   Figma Plugin API (variables, typography styles, UI messaging)
-   GitHub REST API (repositories, branches, commits, pull requests) via personal access tokens
-   W3C Design Tokens Community Group (DTCG) JSON schema + downstream Style Dictionary-compatible consumers
