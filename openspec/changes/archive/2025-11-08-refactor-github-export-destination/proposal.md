## Change: refactor-github-export-destination

## Why

Designers exporting tokens to GitHub often need to publish into a new release folder or feature branch directory. The current plugin flow already exposes a text input for the destination path, but the "Create new folder" modal button in the picker fails and users believe they can only target folders that already exist in the repository tree. They end up leaving Figma to pre-create directories in GitHub, then return to export. This extra round-trip slows down releases and breaks automation scenarios where the export job should create the directory on demand. Refactoring the picker to rely solely on the path input while making folder creation reliable keeps exports unblocked and lets designers manage release folders entirely from the plugin.

## What Changes

-   Refactor the GitHub export destination picker so that the path text field is the primary control: users can type a new folder path or reuse an existing one without needing a separate modal.
-   Adjust the export pipeline to create any missing nested folders in the target branch before writing the token files.
-   Preserve existing validation and confirmation messaging so users still see the final export path and commit metadata.

## Success Criteria

-   Users can enter a folder path that does not exist in the repository and complete an export without leaving the plugin, even without a "Create new folder" button.
-   The export flow creates the missing folder structure in the selected branch and commits the token files in that new path.
-   Existing exports to pre-existing folders continue to work without regression, including commit messaging and token serialization.

## Non-Goals

-   Changing how branches or repositories are selected in the GitHub tab.
-   Altering the token serialization format, commit message templates, or pull request automation.
-   Adding bulk folder management UI beyond the ability to specify a new path inline.

## Risks & Mitigations

-   **Git tree conflicts**: Creating folders that overlap with files may cause commit failures → detect path collisions and surface actionable errors before attempting the export.
-   **GitHub API limits**: Additional folder-creation calls might increase API usage → batch tree updates in the existing commit payload so only one GitHub write occurs.
-   **User confusion about path format**: Free-form text inputs can lead to malformed paths → reuse existing path validation helpers and display inline guidance for acceptable folder formats.
