// src/app/github/ui/types.ts
// Shared GitHub tab UI contracts for orchestration and feature modules.
import type { PluginToUi, UiToPlugin } from "../../messages";

export type FolderListEntry = {
    type: "dir" | "file";
    name: string;
    path?: string;
};

export type GithubUiDependencies = {
    postToPlugin(message: UiToPlugin): void;
    log(message: string): void;
    getLogElement(): HTMLElement | null;
    getCollectionSelect(): HTMLSelectElement | null;
    getModeSelect(): HTMLSelectElement | null;
    getAllowHexCheckbox(): HTMLInputElement | null;
    getStyleDictionaryCheckbox(): HTMLInputElement | null;
    getFlatTokensCheckbox(): HTMLInputElement | null;
    getImportContexts(): string[];
};

export type AttachContext = {
    document: Document;
    window: Window;
};

export type GithubUiApi = {
    attach(context: AttachContext): void;
    handleMessage(msg: PluginToUi): boolean;
    onSelectionChange(): void;
    onCollectionsData(data?: {
        collections?: Array<{
            id: string;
            name: string;
            modes: Array<{ id: string; name: string }>;
            variables: Array<{ id: string; name: string; type: string }>;
        }>;
        textStyles?: Array<{ id: string; name: string }>;
    }): void;
};
