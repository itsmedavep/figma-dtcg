# Figma DTCG Plugin

This project bridges Figma variables and the W3C Design Tokens Format by importing and exporting tokens while preserving metadata needed for real-world workflows.

## Table of Contents
- [Overview](#overview)
- [Quickstart](#quickstart)
- [Loading the Plugin in Figma](#loading-the-plugin-in-figma)
- [GitHub Integration Guide](#github-integration-guide)
- [Import & Export Behavior](#import--export-behavior)
- [Token Support & Limitations](#token-support--limitations)
- [Testing & Validation](#testing--validation)
- [Repository Tour](#repository-tour)
- [Typical Flow](#typical-flow)
- [Working With The Plugin](#working-with-the-plugin)
- [`$extensions` Metadata](#extensions-metadata)

## Overview

### What It Does
- Reads live variables from a Figma document, converts them into an intermediate token graph, and captures per-mode metadata for round-tripping back to Figma.
- Parses DTCG-compliant JSON, validates values and aliases, and normalizes them into the same intermediate representation.
- Serializes the token graph back to DTCG JSON with deterministic grouping so version-control diffs stay stable.
- Resolves aliases and validates reference graphs, warning about missing targets or cycles before data is pushed back to design tools.
- Preserves `$description` and `$extensions` blocks (notably `com.figma`) so downstream tools retain authoring context.

## Quickstart
1. **Install prerequisites.** Use a recent Node.js LTS release (v18+) so esbuild and the TypeScript configuration behave consistently.
2. **Install dependencies.** Run `npm install` to fetch plugin, build, and test dependencies.
3. **Build the plugin.** Execute `npm run build` for a one-off compile or `npm run watch` to continuously rebuild during development.
4. **Check types.** Run `npm run typecheck` before loading the plugin to confirm the core project is type-safe.

## Loading the Plugin in Figma
- Builds emit `dist/main.js` and `dist/ui.html`, which are referenced by the bundled `manifest.json`.
- Register the repository directory as a development plugin in Figma so the manifest continues to point at the compiled `dist/` artifacts.
- The manifest enables GitHub network access; review the allowed domains if your organization applies additional sandbox restrictions.

## GitHub Integration Guide
- Generate a personal access token (PAT) with `repo` scope so the plugin can list repositories, enumerate branches, and write commits or pull requests.
- The integration remembers your last-selected repository, branch, and folder to streamline iterative syncs.
- When exporting tokens, choose whether to commit directly to the configured branch or open a pull request without leaving Figma.
- The plugin fetches token files from the target repository; verify that the folder structure matches the expected layout before importing.
- Exports honor the active selection—current collection/mode or the entire token graph—so double-check the scope prior to pushing updates upstream.

## Import & Export Behavior
- Importers let you filter by Figma collection, mode, or GitHub context, and remember preferred combinations for faster iteration.
- Color normalization supports hex, RGB, and other DTCG-compliant formats. Enable the **Allow hex strings** toggle to keep raw hex values when downstream tooling requires them.
- Partial imports surface validation warnings yet still populate the intermediate graph so you can iterate in Figma before running a full sync.
- Exports normalize token paths and ordering to keep version-control diffs minimal when committing back to source control.

## Token Support & Limitations
- `$type` values for color, number, string, and boolean are fully supported for round-tripping between Figma and DTCG.
- Aliases are maintained when the target token exists and passes validation; unresolved references are flagged before export.
- Unsupported primitives or complex alias chains are preserved in the intermediate representation when possible but may be omitted from final exports. Review plugin warnings to understand what was skipped.

## Testing & Validation
- `npm run typecheck` runs the primary TypeScript validation pass against the plugin source.
- Additional deterministic helpers have tests compiled through `tsc -p tests/tsconfig.test.json`; execute the emitted JavaScript in `tests/dist/` to verify behavior when evolving normalization logic.

## Repository Tour
- `src/core/` holds the shared infrastructure: token graph types, color conversions, normalization helpers, and the staged pipeline logic.
- `src/adapters/` implements format boundaries for DTCG and Figma, translating between raw platform data and the core representation.
- `src/app/` contains the plugin UI logic, GitHub integration, and top-level command handlers.
- `tests/` houses automated coverage for utilities that must stay deterministic across environments.

## Typical Flow
1. Figma variables are read into the core IR, capturing per-mode values and alias relationships.
2. The pipeline normalizes paths, deduplicates nodes, and runs validation passes (alias analysis, color checks, etc.).
3. Depending on user action, results are either written back to Figma, exported as DTCG JSON, or committed via the GitHub integration.

## Working With The Plugin
- Maintain deterministic ordering and canonical paths so exports remain stable.
- Preserve `$extensions` data verbatim; treat it as opaque vendor metadata unless transformers explicitly need to augment it.
- Prefer the helpers in `src/core/normalize.ts` for path and alias handling to avoid divergence between adapters.

## `$extensions` Metadata
The plugin round-trips metadata stored under the DTCG `$extensions` key to keep parity with the original Figma document. In practice this means:

- Figma-specific annotations live under the `com.figma` namespace and are written back unchanged so teams can rely on them for audit trails, component provenance, or handoff context.
- Additional vendor extensions (for example, `org.example.analytics`) are retained when importing and exporting tokens, allowing downstream tools to operate on the same enriched payload without rehydration steps.
- When the pipeline normalizes or merges tokens, `$extensions` blocks are never merged heuristically; instead we surface conflicts to users so intent stays explicit.

If you need to evolve the metadata shape, prefer adding new keys inside the existing namespace rather than rewriting or removing fields to avoid breaking synchronization with external systems.
