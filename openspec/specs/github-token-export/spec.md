# github-token-export Specification

## Purpose
TBD - created by archiving change refactor-github-export-destination. Update Purpose after archive.
## Requirements
### Requirement: Refactor GitHub Export Destination Handling
This refactor MUST keep the GitHub export flow's "Use this folder" confirmation while allowing two ways to select a destination: users can click a folder from the repository tree in the modal and then confirm, or they can type a path into the existing `folderPickerPath` text field before confirming. The plugin MUST create any missing nested folders before writing token files and MUST remove the broken "Create new folder" modal button.

#### Scenario: Export to new folder succeeds via text entry
- **GIVEN** the user selects a repository/branch and types an export folder path that does not exist into the `folderPickerPath` input
- **WHEN** they click "Use this folder" and run the export
- **THEN** the plugin creates the required folder hierarchy in the target branch and commits the token files at the specified path
- **AND** the export summary shows the final folder path alongside the commit information

#### Scenario: Existing folder is reused from the tree
- **GIVEN** the user selects a repository/branch and clicks an existing folder in the repository tree presented in the modal
- **WHEN** they click "Use this folder" and run the export
- **THEN** the plugin writes the token files into that folder
- **AND** the UI does not surface a separate "Create new folder" modal button for this flow

#### Scenario: Conflicting file blocks folder creation
- **GIVEN** the user enters an export folder path where one of the segments is already a file in the repository
- **WHEN** the plugin prepares the export
- **THEN** the export is blocked
- **AND** the UI explains that the path cannot be created because it conflicts with an existing file

### Requirement: Allow custom export filename selection
The GitHub export flow MUST let users specify the filename used for the committed token bundle when exporting to a remote branch. The UI MUST present a filename input alongside the folder picker, and the plugin MUST honor the chosen name when assembling commit payloads and the export summary.

#### Scenario: Custom filename export succeeds
- **GIVEN** the user selects a repository/branch, chooses a destination folder, and enters `design-tokens.json` into the filename field
- **WHEN** they run the export
- **THEN** the plugin writes the token payload using exactly `design-tokens.json` in the selected folder without appending mode or variant suffixes
- **AND** the export summary shows the folder path and `design-tokens.json` as the committed file name

#### Scenario: Invalid filename blocks export
- **GIVEN** the user enters a filename containing characters GitHub rejects (such as `design:tokens?.json`)
- **WHEN** they attempt to export
- **THEN** the export is blocked
- **AND** the UI surfaces an inline error explaining the filename must use supported characters before retrying

