// src/app/github/ui.ts
// Orchestrates the GitHub tab UI modules and routes plugin messages.
import type { PluginToUi } from "../messages";
import {
    GithubUiDependencies,
    AttachContext,
    GithubUiApi,
} from "./ui/types";
import { GithubAuthUi } from "./ui/auth";
import { GithubRepoUi } from "./ui/repo";
import { GithubBranchUi } from "./ui/branch";
import { GithubFolderUi } from "./ui/folder";
import { GithubImportUi } from "./ui/import";
import { GithubExportUi } from "./ui/export";

export function createGithubUi(deps: GithubUiDependencies): GithubUiApi {
    const authUi = new GithubAuthUi(deps);
    const repoUi = new GithubRepoUi(deps);
    const branchUi = new GithubBranchUi(deps);
    const folderUi = new GithubFolderUi(deps);
    const importUi = new GithubImportUi(deps);
    const exportUi = new GithubExportUi(deps);

    wireDependencies();

    function wireDependencies(): void {
        repoUi.onRepoChange = () => {
            const { owner, repo } = repoUi.getSelected();
            branchUi.setRepo(owner, repo);
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
            const contexts = deps.getImportContexts();
            if (!contexts.length) {
                deps.log(
                    "No import configuration found. Please set up import settings."
                );
                return;
            }
            deps.log("Importing tokens into Figma…");
            deps.postToPlugin({
                type: "IMPORT_DTCG",
                payload: { json: tokens, contexts },
            });
        };
    }

    function attach(context: AttachContext): void {
        authUi.attach(context);
        repoUi.attach(context);
        branchUi.attach(context);
        folderUi.attach(context);
        importUi.attach(context);
        exportUi.attach(context);
    }

    function handleMessage(msg: PluginToUi): boolean {
        let handled = false;
        handled = authUi.handleMessage(msg) || handled;
        handled = repoUi.handleMessage(msg) || handled;
        handled = branchUi.handleMessage(msg) || handled;
        handled = folderUi.handleMessage(msg) || handled;
        handled = importUi.handleMessage(msg) || handled;
        handled = exportUi.handleMessage(msg) || handled;
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
        const hasCollections =
            !!data?.collections &&
            data.collections.length > 0 &&
            data.collections.some((c) => c.variables && c.variables.length > 0);
        const hasTextStyles = !!(data?.textStyles && data.textStyles.length);
        exportUi.setCollectionsAvailability(hasCollections, hasTextStyles);
        exportUi.updateEnabled();
    }

    return {
        attach,
        handleMessage,
        onSelectionChange,
        onCollectionsData,
    };
}
