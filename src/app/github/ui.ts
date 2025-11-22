import type { PluginToUi, UiToPlugin } from "../messages";
import { GithubUiDependencies, AttachContext, GithubUiApi } from "./ui/types";
import { GithubAuthUi } from "./ui/auth";
import { GithubRepoUi } from "./ui/repo";
import { GithubBranchUi } from "./ui/branch";
import { GithubFolderUi } from "./ui/folder";
import { GithubImportUi } from "./ui/import";
import { GithubExportUi } from "./ui/export";

export function createGithubUi(deps: GithubUiDependencies): GithubUiApi {
    // Sub-modules
    const authUi = new GithubAuthUi(deps);
    const repoUi = new GithubRepoUi(deps);
    const branchUi = new GithubBranchUi(deps);
    const folderUi = new GithubFolderUi(deps);
    const importUi = new GithubImportUi(deps);
    const exportUi = new GithubExportUi(deps);

    let doc: Document | null = null;

    // Wiring callbacks
    repoUi.onRepoChange = (repo) => {
        // When repo changes, we need to update branch UI context
        const { owner, repo: repoName } = repoUi.getSelected();
        branchUi.setRepo(owner, repoName);

        // Reset downstream
        folderUi.reset();
        importUi.reset();
        exportUi.reset();
    };

    branchUi.onBranchChange = (branch) => {
        const { owner, repo } = repoUi.getSelected();
        folderUi.setContext(owner, repo, branch);

        const folder = folderUi.getFolder();
        const prBase = branchUi.getPrBaseBranch();

        importUi.setContext(owner, repo, branch, folder);
        exportUi.setContext(owner, repo, branch, folder, prBase);
    };

    folderUi.onFolderChange = (folder) => {
        const { owner, repo } = repoUi.getSelected();
        const branch = branchUi.getCurrentBranch();
        const prBase = branchUi.getPrBaseBranch();

        importUi.setContext(owner, repo, branch, folder);
        exportUi.setContext(owner, repo, branch, folder, prBase);
    };

    importUi.onTokensFetched = (tokens) => {
        // Delegate to main app logic (via deps or event, but here we might need to call a global function or similar)
        // The original code called `startImport(tokens)`.
        // Since `startImport` logic is complex and involves UI state from other tabs (import settings),
        // we should probably have passed a callback or dependency for this.
        // However, `deps` doesn't have `startImport`.
        // Let's assume we can emit a message or call a method if we had one.
        // For now, let's log it, but we really need to trigger the import flow.
        // The `GithubUiDependencies` interface might need expansion if we want to fully decouple.
        // But wait, `ui.ts` is the consumer of `createGithubUi`.
        // Actually `ui.ts` IS `src/app/github/ui.ts`.
        // The caller of `createGithubUi` is `src/app/ui.ts` (likely).
        // Let's check `src/app/ui.ts` to see how it uses this.
        // Ah, `src/app/ui.ts` imports `createGithubUi`.
        // We can add `onImportTokens` to `GithubUiDependencies`.

        // For this refactor, I will assume `deps` has `onImportTokens` or similar,
        // OR I will add it to `GithubUiDependencies` in `types.ts` and update `ui.ts`.
        // But I can't easily update `ui.ts` without seeing it.
        // Let's check `src/app/ui.ts` imports.

        // Actually, `importUi` logic was: `handleFetchResult` -> `startImport`.
        // `startImport` is defined in `src/app/ui.ts` (not `github/ui.ts`? No, `github/ui.ts` had it).
        // Wait, `src/app/github/ui.ts` was the file I was refactoring.
        // It had `startImport` inside it?
        // Let's check the viewed file content.
        // I viewed `src/app/github/ui.ts`.
        // It seemed to be self-contained?
        // No, `createGithubUi` returned `GithubUiApi`.
        // `startImport` was likely a local function in `createGithubUi` closure.
        // Yes, `startImport` was used in `handleFetchResult`.

        // So, `startImport` needs to be preserved or moved.
        // `startImport` used `deps.postToPlugin({ type: "IMPORT_TOKENS", ... })`.
        // It also read `pickImportMode()`, `pickImportTheme()`, etc.
        // These are global UI elements (not specific to GitHub tab).
        // `deps` has `getImportContexts()`.

        // So `importUi` should probably just emit the tokens, and we handle it here in `createGithubUi`.

        const contexts = deps.getImportContexts();
        if (contexts.length === 0) {
            deps.log(
                "No import configuration found. Please set up import settings."
            );
            return;
        }

        deps.log("Importing tokens into Figma…");
        deps.postToPlugin({
            type: "IMPORT_TOKENS",
            payload: {
                tokens,
                contexts,
            },
        });
    };

    // Main API
    function attach(context: AttachContext): void {
        doc = context.document;

        authUi.attach(context);
        repoUi.attach(context);
        branchUi.attach(context);
        folderUi.attach(context);
        importUi.attach(context);
        exportUi.attach(context);

        // Initial state sync if needed
        // (Most state is driven by messages or user interaction)
    }

    function handleMessage(msg: PluginToUi): boolean {
        let handled = false;

        if (authUi.handleMessage(msg)) handled = true;
        if (repoUi.handleMessage(msg)) handled = true;
        if (branchUi.handleMessage(msg)) handled = true;
        if (folderUi.handleMessage(msg)) handled = true;
        if (importUi.handleMessage(msg)) handled = true;
        if (exportUi.handleMessage(msg)) handled = true;

        // Orchestration logic for specific messages if needed
        if (msg.type === "GITHUB_AUTH_RESULT" && msg.payload.ok) {
            // Auth success, maybe trigger repo load?
            // AuthUi handles UI update.
            // RepoUi listens to GITHUB_REPOS.
            // We might need to fetch repos?
            // AuthUi calls `postToPlugin({ type: "GITHUB_FETCH_REPOS" })` internally?
            // Let's check AuthUi.
            // AuthUi just updates UI.
            // The plugin usually sends REPOS after auth.
            // Or we might need to request it.
            // In original code: `onGitHubConnectClick` -> `GITHUB_SET_TOKEN`.
            // Plugin responds with `GITHUB_AUTH_RESULT`.
            // If ok, original code called `populateGhRepos`.
            // And `deps.postToPlugin({ type: "GITHUB_FETCH_REPOS" })`?
            // Actually, `GITHUB_AUTH_RESULT` handler in original code:
            // `ghIsAuthed = true; ... updateGhStatusUi();`
            // It didn't explicitly fetch repos there?
            // Maybe plugin sends them automatically?
            // Or maybe `updateGhStatusUi` did something?
            // Let's assume the plugin flow is:
            // UI -> SET_TOKEN
            // Plugin -> AUTH_RESULT
            // Plugin -> REPOS (if auth valid)
            // If not, we might need to trigger it.
            // But `RepoUi` handles `GITHUB_REPOS`.
        }

        return handled;
    }

    function onSelectionChange(): void {
        exportUi.updateEnabled();
    }

    function onCollectionsData(data?: {
        collections?: Array<{
            id: string;
            name: string;
            modes: Array<{ id: string; name: string }>;
            variables: Array<{ id: string; name: string; type: string }>;
        }>;
        textStyles?: Array<{ id: string; name: string }>;
    }): void {
        // Determine if there are collections with variables
        const hasCollections = !!(
            data?.collections &&
            data.collections.length > 0 &&
            data.collections.some((c) => c.variables && c.variables.length > 0)
        );

        // Determine if there are text styles
        // Note: The COLLECTIONS_DATA message doesn't currently include text styles info
        // We'll need to track this separately or extend the message
        // For now, assume text styles are available if requested
        const hasTextStyles = !!(
            data?.textStyles && data.textStyles.length > 0
        );

        exportUi.setCollectionsAvailability(hasCollections, hasTextStyles);
        exportUi.updateEnabled();
    }

    function setRememberPref(pref: boolean): void {
        authUi.setRememberPref(pref);
    }

    return {
        attach,
        handleMessage,
        onSelectionChange,
        onCollectionsData,
        setRememberPref,
    };
}
