## ADDED Requirements

### Requirement: Style collections refresh via document change events

The plugin runtime MUST subscribe to Figma’s `documentchange` event while the UI is active, filter for style mutations, and rebuild the cached style collections without requiring user interaction.

#### Scenario: Style edit refreshes cache

-   **GIVEN** the plugin UI is open and the user modifies an existing color or text style outside the plugin
-   **WHEN** Figma emits the corresponding document change event
-   **THEN** the plugin debounces the event and refreshes the cached style collections within one second so downstream exports use the updated style metadata

#### Scenario: Listener detaches when UI closes

-   **GIVEN** the plugin registered the document change listener while active
-   **WHEN** the user closes the plugin UI or it otherwise unloads
-   **THEN** the listener is removed so the plugin stops receiving document change events and does not leak resources

### Requirement: Variable collections stay current through polling

Because variables lack document change events, the plugin MUST run a background poller (minimum 5-second interval) while active that reloads variable collections, detects adds/updates/removals, and updates the cache without visibly blocking the UI.

#### Scenario: Polling captures new variable

-   **GIVEN** the plugin UI is open and a collaborator creates a new variable in a collection outside the plugin
-   **WHEN** the next polling interval elapses
-   **THEN** the plugin reloads variables, adds the new variable to its cache, and notifies the UI/runtime without requiring a manual refresh

#### Scenario: Polling respects minimum interval and pauses when inactive

-   **GIVEN** the plugin poller is running with a 5-second baseline interval
-   **WHEN** the UI becomes hidden/closed
-   **THEN** the poller stops running until the UI resumes, ensuring the document is not polled more frequently than every five seconds overall

### Requirement: GitHub and token actions use the refreshed snapshot

Any GitHub import/export action or token processing MUST read from the refreshed cache so the payload always mirrors the latest style and variable state surfaced by the listeners/poller.

#### Scenario: Export after document edits uses latest data

-   **GIVEN** the plugin detected style and variable changes via the mechanisms above
-   **WHEN** the user immediately runs a GitHub export
-   **THEN** the export serializes tokens using the refreshed cache (including the edits) without needing to reload the plugin
