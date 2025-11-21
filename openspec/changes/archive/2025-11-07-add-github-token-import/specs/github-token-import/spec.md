## ADDED Requirements

### Requirement: GitHub Tab Token Import Controls

The GitHub tab MUST expose controls to import a W3C Design Token JSON file from the currently selected repository/branch.

#### Scenario: Controls visible after repo selection

-   **GIVEN** the user authenticated with GitHub and selected a repository/branch in the plugin
-   **WHEN** they open the GitHub tab
-   **THEN** the UI shows fields to enter the token file path plus an Import action and status area
-   **AND** the control state reuses the existing repo/branch selection without additional authentication prompts

#### Scenario: Controls disabled without repo

-   **GIVEN** the user has not selected a repository or branch
-   **WHEN** they view the GitHub tab
-   **THEN** the import controls are disabled and the UI instructs them to pick a repository/branch first

### Requirement: Fetch and validate token files from GitHub

The plugin MUST fetch the specified file from the chosen repository/branch using the stored GitHub credentials and validate that it is a DTCG-compliant JSON payload before mutating Figma variables.

#### Scenario: Successful fetch and validation

-   **GIVEN** the user provides a valid file path that points to a W3C DTCG token JSON file
-   **WHEN** they press Import
-   **THEN** the plugin downloads the file via the GitHub REST API, validates it against the DTCG schema + normalization rules, and only proceeds when the payload passes

#### Scenario: Validation failure blocks import

-   **GIVEN** the fetched file is missing required DTCG fields or fails normalization
-   **WHEN** validation runs
-   **THEN** the plugin stops the import, surfaces a blocking error message on the GitHub tab, and performs no Figma variable updates

### Requirement: Apply imported tokens to Figma variables

Validated tokens MUST update existing Figma variables (matching by canonical token path/name) and create missing variables within the appropriate collections/modes, preserving `$extensions`, aliases, and per-mode values.

#### Scenario: Update and create variables from import

-   **GIVEN** validation succeeded and the plugin mapped tokens to collections/modes
-   **WHEN** the import completes
-   **THEN** existing variables receive updated values, missing variables are created, alias and `$extensions` metadata round-trip unchanged, and the UI reports counts of created/updated variables plus any warnings
