## Change: add-github-export-filename

## Why

Designers exporting tokens to GitHub often need to tweak the file naming when committing to a remote branch. Today the plugin always writes `tokens.json` (and related mode files) with a fixed filename, so designers must rename the files manually after the export or maintain repo-side workflows that move or rename files. Allowing the filename to be set from the GitHub tab keeps exports aligned with downstream automation and saves manual cleanup.

## What Changes

-   Extend the GitHub export flow so users can enter a filename before committing token changes to a remote branch.
-   Include the chosen filename in the export summary and commit payload alongside the folder destination.
-   Validate the filename and prevent export when it contains unsupported characters or would overwrite multiple files unexpectedly.

## Success Criteria

-   Users can supply a filename through the GitHub tab UI before running an export.
-   The export writes token content using that filename (respecting mode/variant suffix behavior) in the selected folder and branch.
-   The export summary and commit metadata confirm the folder and filename used for the export.

## Non-Goals

-   Changing how branches or repositories are selected.
-   Introducing new token formats or altering how multiple mode files are generated.
-   Supporting multi-file renaming or pattern templates beyond specifying the base filename for the export.

## Risks & Mitigations

-   **Invalid filenames**: Users might enter characters GitHub rejects → reuse existing validation helpers and show inline errors before committing.
-   **Overwrite confusion**: Renaming could unintentionally replace files → surface a confirmation when overwriting existing files in the chosen folder.
-   **UI complexity**: Additional controls could clutter the GitHub tab → reuse existing layout patterns and label pairing to keep the form clear.
