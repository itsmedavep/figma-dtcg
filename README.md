# Figma DTCG Plugin [![Unit Tests](https://github.com/itsmedavep/figma-dtcg/actions/workflows/unit-tests.yml/badge.svg?event=pull_request)](https://github.com/itsmedavep/figma-dtcg/actions/workflows/unit-tests.yml)

This project bridges Figma variables and the W3C Design Tokens Format by importing and exporting tokens while preserving metadata needed for real-world workflows.

## Table of Contents

-   [Overview](#overview)
-   [Quickstart](#quickstart)
-   [Loading the Plugin in Figma](#loading-the-plugin-in-figma)
-   [GitHub Integration Guide](#github-integration-guide)
-   [Import & Export Behavior](#import--export-behavior)
-   [Token Support & Limitations](#token-support--limitations)
-   [Testing & Validation](#testing--validation)
-   [Repository Tour](#repository-tour)
-   [Typical Flow](#typical-flow)
-   [Working With The Plugin](#working-with-the-plugin)
-   [`$extensions` Metadata](#extensions-metadata)

## Overview

### What It Does

-   Reads live variables from a Figma document, converts them into an intermediate token graph, and captures per-mode metadata for round-tripping back to Figma.
-   Parses DTCG-compliant JSON, validates values and aliases, and normalizes them into the same intermediate representation.
-   Serializes the token graph back to DTCG JSON with deterministic grouping so version-control diffs stay stable.
-   Resolves aliases and validates reference graphs, warning about missing targets or cycles before data is pushed back to design tools.
-   Preserves `$description` and `$extensions` blocks (notably `com.figma`) so downstream tools retain authoring context.

## Quickstart

1. **Install prerequisites.** Use a recent Node.js LTS release (v18+) so esbuild and the TypeScript configuration behave consistently.
2. **Review the Figma Plugin Quickstart.** The official guide at <https://developers.figma.com/docs/plugins/plugin-quickstart-guide/> outlines the broader environment setup and how Figma expects development plugins to be structured.
3. **Install dependencies.** Run `npm install` to fetch plugin, build, and test dependencies.
4. **Build the plugin.** Execute `npm run build` for a one-off compile or `npm run watch` to continuously rebuild during development. While `npm run watch` is active you can keep the Figma desktop app pointed at the same folder and see updates after each rebuild.
5. **Check types.** Run `npm run typecheck` before loading the plugin to confirm the core project is type-safe.

## Loading the Plugin in Figma

1. **Build first.** Ensure `npm run build` (or the `watch` task) has produced the `dist/main.js` and `dist/ui.html` files that the bundled `manifest.json` references.
2. **Add as a development plugin.** In the Figma desktop app, **Right click in document → Plugins → Development → Import plugin from manifest…** and select this repository’s `manifest.json`.
3. **Keep the folder synced.** Leave the manifest pointing at this working directory so every rebuild is immediately reflected when you relaunch the plugin.
4. **Share with testers.** Testers can repeat the same import-from-manifest flow against a local clone or zipped copy of the repository. After importing, they can run the plugin from **Right click in document → Plugins → Development**, even without Node.js installed.
5. **Network permissions.** The manifest enables GitHub network access; review the allowed domains if your organization applies additional sandbox restrictions.

## Typography Style Functionality

-   **Export typography tokens.** Use the **Export typography.json** action to capture every local text style, even when no variables exist. The export leverages `src/core/typography.ts` to normalize units, retain `$extensions`, and emit a DTCG-compliant payload.
-   **Preview typography data.** When the plugin exports typography tokens it also streams the first file back to the UI so reviewers can inspect the generated JSON without leaving Figma.
-   **Round-trip support.** Imported typography tokens map back onto Figma text styles, honoring preserved metadata and surfacing warnings whenever unsupported units need manual intervention.

## GitHub Integration Guide

-   Generate a personal access token (PAT) with `repo` scope so the plugin can list repositories, enumerate branches, and write commits or pull requests.
-   The integration remembers your last-selected repository, branch, and folder to streamline iterative syncs.
-   When exporting tokens, choose whether to commit directly to the configured branch or open a pull request without leaving Figma.
-   The plugin fetches token files from the target repository; verify that the folder structure matches the expected layout before importing.
-   Exports honor the active selection—current collection/mode or the entire token graph—so double-check the scope prior to pushing updates upstream.

## Import & Export Behavior

-   Importers let you filter by Figma collection, mode, or GitHub context, and remember preferred combinations for faster iteration.
-   Color normalization supports hex, RGB, and other DTCG-compliant formats. Enable the **Allow hex strings** toggle to keep raw hex values when downstream tooling requires them.
-   When exporting, toggle **Style Dictionary JSON** to emit `#RRGGBB` color strings instead of W3C color objects for easier ingestion by Style Dictionary pipelines.
-   Enable **Flatten collections** during export to drop the top-level collection grouping so tokens appear as a single hierarchy rooted at their variable paths.
-   Partial imports surface validation warnings yet still populate the intermediate graph so you can iterate in Figma before running a full sync.
-   Exports normalize token paths and ordering to keep version-control diffs minimal when committing back to source control.

## Token Support & Limitations

-   `$type` values for color, number, string, and boolean are fully supported for round-tripping between Figma and DTCG.
-   Aliases are maintained when the target token exists and passes validation; unresolved references are flagged before export.
-   Unsupported primitives or complex alias chains are preserved in the intermediate representation when possible but may be omitted from final exports. Review plugin warnings to understand what was skipped.

## Architecture

The plugin follows a modular, layered architecture:

-   **Core Layer** (`src/core/`) - Framework-agnostic token graph types, color conversions, normalization helpers, and the staged pipeline logic. This layer has no dependencies on Figma or UI concerns.
-   **Adapter Layer** (`src/adapters/`) - Format boundaries for DTCG and Figma, translating between raw platform data and the core intermediate representation.
-   **Application Layer** (`src/app/`) - Plugin UI logic, GitHub integration, and top-level command handlers.
    -   **GitHub Handlers** (`src/app/github/handlers/`) - Modular, domain-specific handlers for authentication, repositories, branches, folders, commits, imports, and state management. Each handler is independently testable.
    -   **UI Components** (`src/app/ui/`) - Reusable UI components including autocomplete, DOM helpers, and feature modules for import, export, and resize functionality.

## Testing & Validation

-   **Unit Tests**: Run `npm test` to execute the Vitest test suite. Tests are located in:
    -   `src/**/*.test.ts` - Component and handler unit tests co-located with source files
    -   `tests/__tests__/**/*.test.ts` - Core functionality and integration tests
-   **Type Checking**: Run `npm run typecheck` to validate TypeScript types across the entire codebase.
-   **Linting**: Run `npm run lint` to check code quality and style with ESLint. The configuration enforces TypeScript best practices and warns about `any` types and unused variables.
-   **CI/CD**: GitHub Actions automatically runs tests, type checking, and builds on all pull requests targeting `main` and `develop` branches.

## Repository Tour

-   **`src/core/`** - Shared infrastructure independent of Figma or UI:
    -   `ir.ts` - Intermediate representation types for the token graph
    -   `color.ts` - Color space conversions and normalization
    -   `typography.ts` - Typography token handling and text style conversions
    -   `normalize.ts` - Path canonicalization and token normalization utilities
    -   `pipeline.ts` - Staged processing pipeline for token transformations
-   **`src/adapters/`** - Format boundaries:
    -   `dtcg-reader.ts` / `dtcg-writer.ts` - DTCG JSON parsing and serialization
    -   `figma-reader.ts` / `figma-writer.ts` - Figma variable and style conversions
-   **`src/app/`** - Plugin application logic:
    -   `main.ts` - Plugin entry point and command handlers
    -   `ui.ts` - Main UI controller and message handling
    -   `messages.ts` - Type-safe message contracts between UI and plugin
    -   **`github/`** - GitHub integration:
        -   `dispatcher.ts` - Routes GitHub messages to domain handlers
        -   **`handlers/`** - Modular handlers for auth, repos, branches, folders, commits, imports, and state
    -   **`ui/`** - UI component library:
        -   `dom-helpers.ts` - DOM manipulation utilities
        -   `components/autocomplete.ts` - Reusable autocomplete component
        -   `features/` - Feature-specific UI modules (import, export, resize)
-   **`tests/`** - Automated test coverage:
    -   `__tests__/` - Core functionality tests (DTCG writer, color profiles, type validation)
    -   Test fixtures for round-trip validation

## Development Workflow

1. **Initial Setup**: Run `npm install` to install dependencies.
2. **Development Mode**: Use `npm run watch` to continuously rebuild the plugin as you make changes. The watch mode monitors `src/app/` and rebuilds both UI and main bundles automatically.
3. **Type Safety**: Run `npm run typecheck` frequently to catch type errors early.
4. **Code Quality**: Run `npm run lint` to ensure code follows project conventions.
5. **Testing**: Run `npm test` to execute the full test suite before committing changes.
6. **Building**: Run `npm run build` for a one-time production build.
7. **CI/CD**: All pull requests automatically run tests, type checking, and builds via GitHub Actions.

## Typical Flow

1. Figma variables are read into the core IR, capturing per-mode values and alias relationships.
2. The pipeline normalizes paths, deduplicates nodes, and runs validation passes (alias analysis, color checks, etc.).
3. Depending on user action, results are either written back to Figma, exported as DTCG JSON, or committed via the GitHub integration.

## Working With The Plugin

-   Maintain deterministic ordering and canonical paths so exports remain stable.
-   Preserve `$extensions` data verbatim; treat it as opaque vendor metadata unless transformers explicitly need to augment it.
-   Prefer the helpers in `src/core/normalize.ts` for path and alias handling to avoid divergence between adapters.

## `$extensions` Metadata

The plugin round-trips metadata stored under the DTCG `$extensions` key to keep parity with the original Figma document. In practice this means:

-   Figma-specific annotations live under the `com.figma` namespace and are written back unchanged so teams can rely on them for audit trails, component provenance, or handoff context.
-   Additional vendor extensions (for example, `org.example.analytics`) are retained when importing and exporting tokens, allowing downstream tools to operate on the same enriched payload without rehydration steps.
-   When the pipeline normalizes or merges tokens, `$extensions` blocks are never merged heuristically; instead we surface conflicts to users so intent stays explicit.

If you need to evolve the metadata shape, prefer adding new keys inside the existing namespace rather than rewriting or removing fields to avoid breaking synchronization with external systems.
