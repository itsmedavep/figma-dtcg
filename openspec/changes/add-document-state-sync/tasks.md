## Tasks

-   [ ] Audit current plugin initialization flow to document where style and variable collections are cached, including how GitHub exports/imports read them.
-   [ ] Implement a `figma.on('documentchange', …)` listener scoped to the plugin session that filters for style mutations and triggers a debounced refresh of style collections.
-   [ ] Build a shared refresh scheduler that coalesces style events and variable polling results into a single cache update to avoid redundant UI work.
-   [ ] Add a background poller for variables that runs every ≥5 seconds while the plugin UI is visible, fetches the latest variable collections, and detects changes.
-   [ ] Update the UI/runtime messaging layer so exports/imports always await the refreshed cache and optionally display a lightweight “refreshing…” indicator when sync is underway.
-   [ ] Guard all listeners/pollers so they detach when the plugin UI closes and add error handling for failed refresh attempts; run `npm run typecheck`.
