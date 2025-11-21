## ADDED Requirements

### Requirement: Allow custom export filename selection

The GitHub export flow MUST let users specify the filename used for the committed token bundle when exporting to a remote branch. The UI MUST present a filename input alongside the folder picker, and the plugin MUST honor the chosen name when assembling commit payloads and the export summary.

#### Scenario: Custom filename export succeeds

-   **GIVEN** the user selects a repository/branch, chooses a destination folder, and enters `design-tokens.json` into the filename field
-   **WHEN** they run the export
-   **THEN** the plugin writes the token payload using exactly `design-tokens.json` in the selected folder without appending mode or variant suffixes
-   **AND** the export summary shows the folder path and `design-tokens.json` as the committed file name

#### Scenario: Invalid filename blocks export

-   **GIVEN** the user enters a filename containing characters GitHub rejects (such as `design:tokens?.json`)
-   **WHEN** they attempt to export
-   **THEN** the export is blocked
-   **AND** the UI surfaces an inline error explaining the filename must use supported characters before retrying
