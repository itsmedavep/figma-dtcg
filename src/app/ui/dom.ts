/**
 * Centralized DOM element references.
 * Populated during DOMContentLoaded.
 */
export const uiElements = {
    logEl: null as HTMLElement | null,
    rawEl: null as HTMLElement | null,

    exportAllChk: null as HTMLInputElement | null,
    collectionSelect: null as HTMLSelectElement | null,
    modeSelect: null as HTMLSelectElement | null,

    fileInput: null as HTMLInputElement | null,
    importBtn: null as HTMLButtonElement | null,
    exportBtn: null as HTMLButtonElement | null,
    exportTypographyBtn: null as HTMLButtonElement | null,
    exportPickers: null as HTMLElement | null,

    refreshBtn: null as HTMLButtonElement | null,

    shellEl: null as HTMLElement | null,
    drawerToggleBtn: null as HTMLButtonElement | null,
    resizeHandleEl: null as HTMLElement | null,

    w3cPreviewEl: null as HTMLElement | null,

    copyRawBtn: null as HTMLButtonElement | null,
    copyW3cBtn: null as HTMLButtonElement | null,
    copyLogBtn: null as HTMLButtonElement | null,

    allowHexChk: null as HTMLInputElement | null,
    styleDictionaryChk: null as HTMLInputElement | null,
    flatTokensChk: null as HTMLInputElement | null,
    githubRememberChk: null as HTMLInputElement | null,

    importScopeOverlay: null as HTMLElement | null,
    importScopeBody: null as HTMLElement | null,
    importScopeConfirmBtn: null as HTMLButtonElement | null,
    importScopeCancelBtn: null as HTMLButtonElement | null,
    importScopeRememberChk: null as HTMLInputElement | null,
    importScopeMissingEl: null as HTMLElement | null,

    importScopeSummaryEl: null as HTMLElement | null,
    importScopeSummaryTextEl: null as HTMLElement | null,
    importScopeClearBtn: null as HTMLButtonElement | null,

    importSkipLogListEl: null as HTMLElement | null,
    importSkipLogEmptyEl: null as HTMLElement | null,
};

export function initDomElements() {
    if (typeof document === "undefined") return;

    uiElements.logEl = document.getElementById("log");
    uiElements.rawEl = document.getElementById("raw");

    uiElements.exportAllChk = document.getElementById(
        "exportAllChk"
    ) as HTMLInputElement | null;
    uiElements.collectionSelect = document.getElementById(
        "collectionSelect"
    ) as HTMLSelectElement | null;
    uiElements.modeSelect = document.getElementById(
        "modeSelect"
    ) as HTMLSelectElement | null;

    uiElements.fileInput = document.getElementById(
        "file"
    ) as HTMLInputElement | null;
    uiElements.importBtn = document.getElementById(
        "importBtn"
    ) as HTMLButtonElement | null;
    uiElements.exportBtn = document.getElementById(
        "exportBtn"
    ) as HTMLButtonElement | null;
    uiElements.exportTypographyBtn = document.getElementById(
        "exportTypographyBtn"
    ) as HTMLButtonElement | null;
    uiElements.exportPickers = document.getElementById("exportPickers");

    uiElements.refreshBtn = document.getElementById(
        "refreshBtn"
    ) as HTMLButtonElement | null;

    uiElements.shellEl = document.querySelector(".shell") as HTMLElement | null;
    uiElements.drawerToggleBtn = document.getElementById(
        "drawerToggleBtn"
    ) as HTMLButtonElement | null;
    uiElements.resizeHandleEl = document.getElementById("resizeHandle");

    uiElements.w3cPreviewEl = document.getElementById(
        "w3cPreview"
    ) as HTMLElement | null;

    uiElements.copyRawBtn = document.getElementById(
        "copyRawBtn"
    ) as HTMLButtonElement | null;
    uiElements.copyW3cBtn = document.getElementById(
        "copyW3cBtn"
    ) as HTMLButtonElement | null;
    uiElements.copyLogBtn = document.getElementById(
        "copyLogBtn"
    ) as HTMLButtonElement | null;

    uiElements.allowHexChk = document.getElementById(
        "allowHexChk"
    ) as HTMLInputElement | null;
    uiElements.styleDictionaryChk = document.getElementById(
        "styleDictionaryChk"
    ) as HTMLInputElement | null;
    uiElements.flatTokensChk = document.getElementById(
        "flatTokensChk"
    ) as HTMLInputElement | null;
    uiElements.githubRememberChk = document.getElementById(
        "githubRememberChk"
    ) as HTMLInputElement | null;

    uiElements.importScopeOverlay =
        document.getElementById("importScopeOverlay");
    uiElements.importScopeBody = document.getElementById("importScopeBody");
    uiElements.importScopeConfirmBtn = document.getElementById(
        "importScopeConfirmBtn"
    ) as HTMLButtonElement | null;
    uiElements.importScopeCancelBtn = document.getElementById(
        "importScopeCancelBtn"
    ) as HTMLButtonElement | null;
    uiElements.importScopeRememberChk = document.getElementById(
        "importScopeRememberChk"
    ) as HTMLInputElement | null;
    uiElements.importScopeMissingEl = document.getElementById(
        "importScopeMissingNotice"
    );

    uiElements.importScopeSummaryEl =
        document.getElementById("importScopeSummary");
    uiElements.importScopeSummaryTextEl = document.getElementById(
        "importScopeSummaryText"
    );
    uiElements.importScopeClearBtn = document.getElementById(
        "importScopeClearBtn"
    ) as HTMLButtonElement | null;

    uiElements.importSkipLogListEl =
        document.getElementById("importSkipLogList");
    uiElements.importSkipLogEmptyEl =
        document.getElementById("importSkipLogEmpty");
}
