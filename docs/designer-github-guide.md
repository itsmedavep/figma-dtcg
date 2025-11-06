# Figma DTCG Plugin for Designers

## Why this plugin matters
You do not need to be a developer to keep design tokens in sync. The plugin reads the variables you already manage in Figma and turns them into the open Design Tokens format, keeping names, descriptions, and metadata intact so teams downstream can trust the files.【F:README.md†L1-L25】 It can also go the other direction: import a JSON token file and write the values into your current file, all while keeping context about which collection and mode each value came from.【F:README.md†L20-L25】【F:src/core/pipeline.ts†L262-L276】

On the GitHub side, the plugin remembers the repository, branch, and folder you last used so each sync builds on the last one without extra setup.【F:README.md†L46-L51】【F:src/app/github/dispatcher.ts†L20-L72】【F:src/app/github/dispatcher.ts†L232-L265】 That reliability lets you focus on reviewing the actual token values.

## Before you start
1. Ask your developer partner or admin for a GitHub personal access token (PAT) that has **repo** access. The plugin needs that scope to list repositories, look at branches, and save token files for you.【F:README.md†L46-L51】
2. Open the plugin in Figma. If the team shares a manifest, make sure you have imported it once so the plugin is available from the Development menu.【F:README.md†L34-L39】
3. Decide which collection and mode you want to work with. The plugin supports exporting everything, but this guide focuses on the “one collection, one mode” flow.

## Connect the plugin to GitHub
1. In the GitHub panel, paste your PAT into the token field and choose whether the plugin should remember it. Selecting “remember” stores an encrypted copy so you do not have to re-enter it next time.【F:src/app/github/dispatcher.ts†L135-L167】
2. Press **Connect**. The plugin verifies the token with GitHub and immediately loads a list of repositories you can reach. If the token ever stops working, you’ll see a friendly error and an empty list so you know to refresh your access.【F:src/app/github/dispatcher.ts†L74-L166】
3. If you ever want to clear the token (for example, when switching accounts), use the **Forget** action. The plugin wipes the stored token and resets the GitHub panel so you can start fresh.【F:src/app/github/dispatcher.ts†L170-L176】

## Choose where your tokens live
1. Pick a repository from the dropdown. The plugin remembers your choice and keeps the branch, folder, and scope aligned with it.【F:src/app/github/dispatcher.ts†L179-L213】【F:src/app/github/dispatcher.ts†L232-L265】
2. Fetch branches. When you open the branch picker the plugin asks GitHub for branch names, falling back to the repository’s default branch if you do not pick one. That same branch is reused as the base for pull requests unless you choose another target.【F:src/app/github/dispatcher.ts†L268-L289】
3. Use the folder picker to point at the place where design tokens live in the repo. The plugin validates your entry, helps you browse existing folders, and even creates a new folder if you need one before exporting.【F:src/app/github/dispatcher.ts†L291-L365】
4. Type a simple, human-readable commit message. The plugin keeps the most recent message handy so you can reuse it on your next sync.【F:src/app/github/dispatcher.ts†L242-L265】【F:src/app/github/dispatcher.ts†L501-L518】

## Import a single collection and mode from GitHub
1. In the GitHub panel, make sure the scope is set to **Selected collection & mode**. Enter the collection and mode names exactly as they appear in Figma.
2. Click **Fetch tokens** and point the plugin at the JSON file in your repository. The plugin reads the file, filters it down to only the contexts you requested, and writes those values into Figma variables for you.【F:src/app/github/dispatcher.ts†L391-L449】【F:src/core/pipeline.ts†L135-L236】【F:src/core/pipeline.ts†L262-L276】
3. Once the import finishes, the plugin refreshes the collection list in the UI so you can immediately preview what changed or switch to another mode if needed.【F:src/app/github/dispatcher.ts†L438-L444】

## Export one collection and one mode back to GitHub
1. With the same scope selected, press **Export preview** (optional) to see the JSON the plugin will create. Behind the scenes it generates per-mode files and tries to match one whose name lines up with your collection and mode, falling back to legacy naming patterns if necessary.【F:src/app/github/dispatcher.ts†L452-L492】【F:src/core/pipeline.ts†L316-L406】
2. Ready to commit? Click **Export & Commit**. The plugin filters the export down to just the chosen collection and mode, sanitizes the file name, and stages a single JSON file for GitHub.【F:src/app/github/dispatcher.ts†L501-L603】【F:src/core/pipeline.ts†L316-L406】
3. The plugin safeguards you from no-op commits: it compares the new JSON to what already exists on the branch (ignoring harmless formatting differences) and cancels the commit if nothing changed.【F:src/app/github/dispatcher.ts†L621-L701】
4. If everything looks good, the plugin pushes the commit and lets you create a pull request in the same step. Provide a title and optional description—otherwise the commit message doubles as the PR title—and the plugin reports back with the link once GitHub confirms it.【F:src/app/github/dispatcher.ts†L509-L744】
5. When exports come out empty (for example, a mode without values), the plugin explains why so you can fix the data before pushing changes.【F:src/app/github/dispatcher.ts†L603-L618】

## Tips for confident iteration
- You can toggle **Style Dictionary JSON** or **Flatten collections** when exporting; the plugin remembers those preferences for future sessions so your workflow stays consistent.【F:README.md†L53-L59】【F:src/app/github/dispatcher.ts†L242-L265】
- Imports and exports always keep `$extensions` and descriptions intact, so developers receive the same context you see in Figma.【F:README.md†L20-L26】
- If you switch collections or modes often, let the plugin store your last choice—those fields repopulate automatically every time you open the GitHub panel.【F:src/app/github/dispatcher.ts†L20-L72】【F:src/app/github/dispatcher.ts†L232-L265】

With these steps you can confidently steward your design tokens without touching a terminal. The plugin handles the technical heavy lifting; you bring the design decisions.
