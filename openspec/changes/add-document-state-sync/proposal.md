## Change: add-document-state-sync

## Why
The plugin currently snapshots styles and variables when the GitHub tab loads, but it does not notice subsequent document edits unless the user manually restarts the plugin. Designers often tweak color styles or token variables after opening the plugin—especially while preparing an export—and we need to confirm whether the GitHub payload (and any UI consumers) are exporting stale data. Even if GitHub exports remain correct, the plugin UI can easily fall out of sync with the live document without an automatic refresh path. Figma exposes a `documentchange` API for styles but not for variables, so the plugin needs a hybrid strategy: event-driven refreshes for styles and a lightweight poller for variables. Without this, we cannot reliably keep the UI and exported token graphs aligned with the canvas.

## What Changes
- Subscribe to the Figma `documentchange` event while the plugin UI is active, filter for style mutations (create, rename, delete, reassign), and trigger an in-memory refresh of the affected style collections.
- Introduce a throttled background task that polls the Figma variables API every 5 seconds (or slower when throttled) to detect additions, deletions, or edits so the plugin state reflects the latest variable graph even though there is no native event.
- Normalize both event-driven and polled updates into the existing collection cache so downstream GitHub exports/imports always read the most recent document snapshot, reusing the same refresh pathway that the existing “refresh” button (in the Figma collection panel) already uses so we do not duplicate networking logic.
- Surface minimal diagnostic UX via the existing activity log (e.g., a brief “Refreshing...” entry) so users know when the plugin is refreshing and avoid spamming the UI with redundant redraws while keeping the implementation lightweight.

## Success Criteria
- Editing or creating a style anywhere in the document refreshes the plugin’s cached collections within one second without user interaction.
- Creating or editing a variable while the plugin is open is reflected in the plugin state within a single polling cycle and without blocking the UI.
- GitHub exports/imports and other token operations always read the refreshed cache (never a stale snapshot created when the panel first opened).
- When the plugin UI is closed or hidden, listeners/pollers detach so they do not leak memory or consume CPU.

## Non-Goals
- Replacing the GitHub integration or altering how tokens serialize.
- Introducing enterprise-only APIs; the solution must work for standard plugin permissions.
- Building a full diff viewer or history of document changes; we only care about refreshing the active snapshot.

## Risks & Mitigations
- **Event floods from rapid edits**: Document change events can fire frequently → debounce refresh work and coalesce multiple events into one state rebuild.
- **Variable polling overhead**: Polling too often could hurt performance → enforce a minimum 5-second interval and pause polling when the plugin is inactive.
- **API failures mid-refresh**: Fetching styles/variables might fail due to transient Figma issues → wrap refreshes in retries and leave the prior snapshot intact while surfacing a soft warning.
