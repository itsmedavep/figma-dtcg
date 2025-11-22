import type { UiToPlugin } from "../messages";
import type {
    HandlerDeps,
    DispatcherState,
    DispatcherContext,
} from "./handlers/types";
import {
    handleSetToken,
    handleForgetToken,
    restoreGithubTokenAndVerify,
} from "./handlers/auth";
import { handleSelectRepo } from "./handlers/repos";
import {
    handleFetchBranches,
    handleSelectBranch,
    handleCreateBranch,
} from "./handlers/branches";
import {
    handleFolderList,
    handleCreateFolder,
    handleSetFolder,
} from "./handlers/folders";
import { handleSaveState, getSelected } from "./handlers/state";
import { handleExportFiles, handleExportAndCommit } from "./handlers/commits";
import { handleFetchTokens } from "./handlers/import";

type GithubDispatcher = {
    handle: (msg: UiToPlugin) => Promise<boolean>;
    onUiReady: () => Promise<void>;
};

export function createGithubDispatcher(deps: HandlerDeps): GithubDispatcher {
    const state: DispatcherState = {
        token: null,
    };

    const ctx: DispatcherContext = {
        deps,
        state,
    };

    async function handle(msg: UiToPlugin): Promise<boolean> {
        switch (msg.type) {
            case "GITHUB_SET_TOKEN":
                await handleSetToken(ctx, msg.payload);
                return true;
            case "GITHUB_FORGET_TOKEN":
                await handleForgetToken(ctx);
                return true;
            case "GITHUB_SELECT_REPO":
                await handleSelectRepo(ctx, msg.payload);
                return true;
            case "GITHUB_FETCH_BRANCHES":
                await handleFetchBranches(ctx, msg.payload);
                return true;
            case "GITHUB_SELECT_BRANCH":
                await handleSelectBranch(ctx, msg.payload);
                return true;
            case "GITHUB_CREATE_BRANCH":
                await handleCreateBranch(ctx, msg.payload);
                return true;
            case "GITHUB_FOLDER_LIST":
                await handleFolderList(ctx, msg.payload);
                return true;
            case "GITHUB_CREATE_FOLDER":
                await handleCreateFolder(ctx, msg.payload);
                return true;
            case "GITHUB_SET_FOLDER":
                await handleSetFolder(ctx, msg.payload);
                return true;
            case "GITHUB_SAVE_STATE":
                await handleSaveState(ctx, msg.payload);
                return true;
            case "GITHUB_EXPORT_FILES":
                await handleExportFiles(ctx, msg.payload);
                return true;
            case "GITHUB_EXPORT_AND_COMMIT":
                await handleExportAndCommit(ctx, msg.payload);
                return true;
            case "GITHUB_FETCH_TOKENS":
                await handleFetchTokens(ctx, msg.payload);
                return true;
            default:
                return false;
        }
    }

    async function onUiReady(): Promise<void> {
        await restoreGithubTokenAndVerify(ctx);
        const sel = await getSelected();
        if (sel.owner && sel.repo) {
            deps.send({ type: "GITHUB_RESTORE_SELECTED", payload: sel });
        }
    }

    return { handle, onUiReady };
}
