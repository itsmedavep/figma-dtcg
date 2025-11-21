import {
    ImportContextOption,
    ImportLogEntry,
    ImportPreference,
} from "./storage";

export type ImportScopeModalState = {
    options: ImportContextOption[];
    collections: string[];
    inputs: HTMLInputElement[];
    inputsByCollection: Map<string, HTMLInputElement[]>;
    onConfirm: (selected: string[], remember: boolean) => void;
};

export const appState = {
    importPreference: null as ImportPreference | null,
    importLogEntries: [] as ImportLogEntry[],
    importScopeModalState: null as ImportScopeModalState | null,
    lastImportSelection: [] as string[],
    systemDarkMode: false,

    // Export state
    pendingSave: null as {
        writable: FileSystemWritableFileStream;
        name: string;
    } | null,

    // Resize state
    resizeTracking: null as {
        pointerId: number;
        startX: number;
        startY: number;
        startWidth: number;
        startHeight: number;
    } | null,
    resizeQueued: null as { width: number; height: number } | null,
    resizeRaf: 0,

    // Collections state
    currentCollections: [] as Array<{
        id: string;
        name: string;
        modes: Array<{ id: string; name: string }>;
        variables: Array<{ id: string; name: string; type: string }>;
    }>,
};
