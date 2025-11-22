import type { PluginToUi, UiToPlugin, GithubScope } from "../../messages";

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
