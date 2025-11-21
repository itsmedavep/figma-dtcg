import type { PluginToUi, GithubScope } from "../../messages";
import type {
    snapshotCollectionsForUi,
    analyzeSelectionState,
    safeKeyFromCollectionAndMode,
} from "../../collections";
import type { importDtcg, exportDtcg } from "../../../core/pipeline";

export type HandlerDeps = {
    send: (msg: PluginToUi) => void;
    snapshotCollectionsForUi: typeof snapshotCollectionsForUi;
    analyzeSelectionState: typeof analyzeSelectionState;
    safeKeyFromCollectionAndMode: typeof safeKeyFromCollectionAndMode;
    importDtcg: typeof importDtcg;
    exportDtcg: typeof exportDtcg;
    broadcastLocalCollections: (opts?: {
        force?: boolean;
        silent?: boolean;
    }) => Promise<void>;
};

export type DispatcherState = {
    token: string | null;
};

export type DispatcherContext = {
    deps: HandlerDeps;
    state: DispatcherState;
};

export type GhSelected = {
    owner?: string;
    repo?: string;
    branch?: string;
    folder?: string;
    filename?: string;
    commitMessage?: string;
    scope?: GithubScope;
    collection?: string;
    mode?: string;
    styleDictionary?: boolean;
    flatTokens?: boolean;
    createPr?: boolean;
    prBase?: string;
    prTitle?: string;
    prBody?: string;
};
