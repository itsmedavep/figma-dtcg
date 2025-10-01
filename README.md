# Figma DTCG Plugin

This project bridges Figma variables and the W3C Design Tokens Format by importing and exporting tokens while preserving metadata needed for real-world workflows.

## What It Does
- Reads live variables from a Figma document, converts them into an intermediate token graph, and captures per-mode metadata for round-tripping back to Figma.
- Parses DTCG-compliant JSON, validates values and aliases, and normalizes them into the same intermediate representation.
- Serializes the token graph back to DTCG JSON with deterministic grouping so version-control diffs stay stable.
- Resolves aliases and validates reference graphs, warning about missing targets or cycles before data is pushed back to design tools.
- Preserves `$description` and `$extensions` blocks (notably `com.figma`) so downstream tools retain authoring context.

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
The plugin round-trips metadata stored under the DTCG `$extensions` key to keep parity with the original Figma document. In
practice this means:

- Figma-specific annotations live under the `com.figma` namespace and are written back unchanged so teams can rely on them for
  audit trails, component provenance, or handoff context.
- Additional vendor extensions (for example, `org.example.analytics`) are retained when importing and exporting tokens, allowing
  downstream tools to operate on the same enriched payload without rehydration steps.
- When the pipeline normalizes or merges tokens, `$extensions` blocks are never merged heuristically; instead we surface
  conflicts to users so intent stays explicit.

If you need to evolve the metadata shape, prefer adding new keys inside the existing namespace rather than rewriting or removing
fields to avoid breaking synchronization with external systems.
