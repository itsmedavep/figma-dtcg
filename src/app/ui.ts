// src/app/ui.ts
// In-panel UI logic for the plugin: dom wiring, GitHub workflows, and export helpers.
// - Mirrors plugin state via postMessage so the UI can function offline
// - Provides guarded DOM helpers to survive partial renders or optional features

import type { PluginToUi } from "./messages";
import "./ui.css";
import { createGithubUi } from "./github/ui";

/* -------------------------------------------------------
 * Globals (assigned after DOMContentLoaded)
 * ----------------------------------------------------- */
import { uiElements, initDomElements } from "./ui/dom";
import { log, postToPlugin, prettyJson, copyElText } from "./ui/utils";
import { appState } from "./ui/state";
import { readImportPreference, readImportLog } from "./ui/storage";
import {
    renderImportPreferenceSummary,
    renderImportLog,
    addImportLogEntry,
    clearImportPreference,
    closeImportScopeModal,
    startImportFlow,
    getPreferredImportContexts,
} from "./ui/features/import";
import {
    prettyExportName,
    beginPendingSave,
    finishPendingSave,
    triggerJsonDownload,
} from "./ui/features/export";
import {
    endResize,
    cancelResize,
    handleResizeMove,
    autoFitOnce,
} from "./ui/features/resize";

/* -------------------------------------------------------
 * Shared helpers
 * ----------------------------------------------------- */

function applyTheme(): void {
    const effective = appState.systemDarkMode ? "dark" : "light";
    if (effective === "light") {
        document.documentElement.setAttribute("data-theme", "light");
    } else {
        document.documentElement.removeAttribute("data-theme");
    }
}

/* -------------------------------------------------------
 * Collections / logging
 * ----------------------------------------------------- */

const githubUi = createGithubUi({
    postToPlugin: (message) => postToPlugin(message),
    log: (message) => log(message),
    getLogElement: () => uiElements.logEl,
    getCollectionSelect: () => uiElements.collectionSelect,
    getModeSelect: () => uiElements.modeSelect,
    getAllowHexCheckbox: () => uiElements.allowHexChk,
    getStyleDictionaryCheckbox: () => uiElements.styleDictionaryChk,
    getFlatTokensCheckbox: () => uiElements.flatTokensChk,
    getImportContexts: () => getPreferredImportContexts(),
});

/** Remove every option from a select without replacing the node. */
function clearSelect(sel: HTMLSelectElement): void {
    while (sel.options.length > 0) sel.remove(0);
}

/** Update button/checkbox disabled states based on current selections. */
function setDisabledStates(): void {
    if (uiElements.importBtn && uiElements.fileInput) {
        const hasFile = !!(
            uiElements.fileInput.files && uiElements.fileInput.files.length > 0
        );
        uiElements.importBtn.disabled = !hasFile;
    }

    if (
        uiElements.exportBtn &&
        uiElements.exportAllChk &&
        uiElements.collectionSelect &&
        uiElements.modeSelect &&
        uiElements.exportPickers
    ) {
        const exportAll = !!uiElements.exportAllChk.checked;
        if (exportAll) {
            uiElements.exportBtn.disabled = false;
            (uiElements.exportPickers as HTMLElement).style.opacity = "0.5";
        } else {
            (uiElements.exportPickers as HTMLElement).style.opacity = "1";
            const hasSelection =
                !!uiElements.collectionSelect.value &&
                !!uiElements.modeSelect.value;
            uiElements.exportBtn.disabled = !hasSelection;
        }
    }

    if (uiElements.exportTypographyBtn) {
        uiElements.exportTypographyBtn.disabled = false;
    }
}

/** Render the collections/modes dropdowns from plugin-provided data. */
function populateCollections(data: {
    collections: Array<{
        id: string;
        name: string;
        modes: Array<{ id: string; name: string }>;
        variables: Array<{ id: string; name: string; type: string }>;
    }>;
}): void {
    appState.currentCollections = data.collections;
    if (!(uiElements.collectionSelect && uiElements.modeSelect)) return;

    clearSelect(uiElements.collectionSelect);
    for (let i = 0; i < data.collections.length; i++) {
        const c = data.collections[i];
        const opt = document.createElement("option");
        opt.value = c.name;
        opt.textContent = c.name;
        uiElements.collectionSelect.appendChild(opt);
    }
    onCollectionChange();
}

/** Update mode selection and preview when the collection dropdown changes. */
function onCollectionChange(): void {
    if (!(uiElements.collectionSelect && uiElements.modeSelect)) return;

    const selected = uiElements.collectionSelect.value;
    clearSelect(uiElements.modeSelect);

    let firstModeSet = false;
    for (let i = 0; i < appState.currentCollections.length; i++) {
        const c = appState.currentCollections[i];
        if (c.name === selected) {
            for (let j = 0; j < c.modes.length; j++) {
                const m = c.modes[j];
                const opt = document.createElement("option");
                opt.value = m.name;
                opt.textContent = m.name;
                uiElements.modeSelect.appendChild(opt);
            }
            // ensure a default mode is selected for enablement logic
            if (
                uiElements.modeSelect.options.length > 0 &&
                uiElements.modeSelect.selectedIndex === -1
            ) {
                uiElements.modeSelect.selectedIndex = 0;
                firstModeSet = true;
            }
            break;
        }
    }

    setDisabledStates();
    githubUi.onSelectionChange();

    // If we auto-set a mode (firstModeSet), update the preview as well
    if (firstModeSet) requestPreviewForCurrent();
}

/** Restore the most recently used collection/mode pair. */
function applyLastSelection(
    last: { collection: string; mode: string } | null
): void {
    if (!last || !(uiElements.collectionSelect && uiElements.modeSelect))
        return;

    let found = false;
    for (let i = 0; i < uiElements.collectionSelect.options.length; i++) {
        if (uiElements.collectionSelect.options[i].value === last.collection) {
            uiElements.collectionSelect.selectedIndex = i;
            found = true;
            break;
        }
    }

    onCollectionChange();

    if (found) {
        for (let j = 0; j < uiElements.modeSelect.options.length; j++) {
            if (uiElements.modeSelect.options[j].value === last.mode) {
                uiElements.modeSelect.selectedIndex = j;
                break;
            }
        }
    }

    setDisabledStates();
}

/** Ask the plugin for a preview of the currently selected token scope. */
function requestPreviewForCurrent(): void {
    if (!(uiElements.collectionSelect && uiElements.modeSelect)) return;
    const collection = uiElements.collectionSelect.value || "";
    const mode = uiElements.modeSelect.value || "";
    if (!collection || !mode) {
        if (uiElements.w3cPreviewEl)
            uiElements.w3cPreviewEl.textContent =
                "{ /* select a collection & mode to preview */ }";
        return;
    }
    const styleDictionary = !!(
        uiElements.styleDictionaryChk && uiElements.styleDictionaryChk.checked
    );
    const flatTokens = !!(
        uiElements.flatTokensChk && uiElements.flatTokensChk.checked
    );
    postToPlugin({
        type: "PREVIEW_REQUEST",
        payload: { collection, mode, styleDictionary, flatTokens },
    });
}

/* -------------------------------------------------------
 * GitHub: Branch helpers (Variant 4)
 * ----------------------------------------------------- */
/** Toggle the branch select and associated placeholders. */

/* -------------------------------------------------------
 * Message pump
 * ----------------------------------------------------- */
window.addEventListener("message", async (event: MessageEvent) => {
    const data: unknown = (event as unknown as { data?: unknown }).data;
    if (!data || typeof data !== "object") return;

    let msg: PluginToUi | any | null = null;
    if (
        (data as any).pluginMessage &&
        typeof (data as any).pluginMessage === "object"
    ) {
        const maybe = (data as any).pluginMessage;
        if (maybe && typeof maybe.type === "string") msg = maybe;
    }
    if (!msg) return;

    // Keep generic INFO/ERROR logs visible
    if (msg.type === "ERROR") {
        log("ERROR: " + (msg.payload?.message ?? ""));
        return;
    }
    if (msg.type === "INFO") {
        log(msg.payload?.message ?? "");
        return;
    }

    if (msg.type === "IMPORT_SUMMARY") {
        const summary = msg.payload.summary;
        if (summary && Array.isArray(summary.appliedContexts)) {
            appState.lastImportSelection = summary.appliedContexts.slice();
        } else {
            appState.lastImportSelection = [];
        }
        addImportLogEntry({
            timestamp: msg.payload.timestamp,
            source: msg.payload.source,
            summary,
        });
        renderImportPreferenceSummary();
        return;
    }

    if (githubUi.handleMessage(msg)) return;

    if (msg.type === "EXPORT_RESULT") {
        const files = Array.isArray(msg.payload?.files)
            ? msg.payload.files
            : [];
        if (files.length === 0) {
            log("Nothing to export.");
            return;
        }

        if (appState.pendingSave && files.length === 1) {
            const only = files[0];
            const fname = prettyExportName(only?.name);
            const text = prettyJson(only?.json);

            const ok = await finishPendingSave(text);
            if (ok) {
                log("Saved " + fname + " via file picker.");
                const div = document.createElement("div");
                const link = document.createElement("a");
                link.href = "#";
                link.textContent = "Download " + fname + " again";
                link.addEventListener("click", (e) => {
                    e.preventDefault();
                    triggerJsonDownload(fname, text);
                });
                if (uiElements.logEl) {
                    div.appendChild(link);
                    uiElements.logEl.appendChild(div);
                    (uiElements.logEl as HTMLElement).scrollTop = (
                        uiElements.logEl as HTMLElement
                    ).scrollHeight;
                }
                log("Export ready.");
                return;
            }
            log(
                "Could not write via file picker; falling back to download links."
            );
        }

        setDrawerOpen(true);
        for (let k = 0; k < files.length; k++) {
            const f = files[k];
            const fname = prettyExportName(f?.name);
            const text = prettyJson(f?.json);
            triggerJsonDownload(fname, text);

            const div = document.createElement("div");
            const link = document.createElement("a");
            link.href = "#";
            link.textContent = "Download " + fname;
            link.addEventListener("click", (e) => {
                e.preventDefault();
                triggerJsonDownload(fname, text);
            });
            if (uiElements.logEl) {
                div.appendChild(link);
                uiElements.logEl.appendChild(div);
                (uiElements.logEl as HTMLElement).scrollTop = (
                    uiElements.logEl as HTMLElement
                ).scrollHeight;
            }
        }
        log("Export ready.");
        return;
    }

    if (msg.type === "W3C_PREVIEW") {
        const displayName = prettyExportName(msg.payload.name);
        const header = `/* ${displayName} */\n`;
        if (uiElements.w3cPreviewEl)
            uiElements.w3cPreviewEl.textContent =
                header + prettyJson(msg.payload.json);
        return;
    }

    if (msg.type === "COLLECTIONS_DATA") {
        githubUi.onCollectionsData({
            collections: msg.payload.collections,
            textStyles: msg.payload.textStylesCount
                ? new Array(msg.payload.textStylesCount).fill({
                      id: "",
                      name: "",
                  })
                : [],
        });
        populateCollections({ collections: msg.payload.collections });
        if (uiElements.exportAllChk)
            uiElements.exportAllChk.checked = !!msg.payload.exportAllPref;
        if (
            uiElements.styleDictionaryChk &&
            typeof msg.payload.styleDictionaryPref === "boolean"
        ) {
            uiElements.styleDictionaryChk.checked =
                !!msg.payload.styleDictionaryPref;
        }
        if (
            uiElements.flatTokensChk &&
            typeof msg.payload.flatTokensPref === "boolean"
        ) {
            uiElements.flatTokensChk.checked = !!msg.payload.flatTokensPref;
        }
        if (
            uiElements.allowHexChk &&
            typeof msg.payload.allowHexPref === "boolean"
        ) {
            uiElements.allowHexChk.checked = !!msg.payload.allowHexPref;
        }
        if (typeof msg.payload.githubRememberPref === "boolean") {
            if (uiElements.githubRememberChk)
                uiElements.githubRememberChk.checked =
                    msg.payload.githubRememberPref;
        }
        const last = (msg.payload as any).last as {
            collection: string;
            mode: string;
        } | null;
        applyLastSelection(last);
        setDisabledStates();
        requestPreviewForCurrent();
        return;
    }

    if (msg.type === "RAW_COLLECTIONS_TEXT") {
        if (uiElements.rawEl) uiElements.rawEl.textContent = msg.payload.text;
        return;
    }
});

/* -------------------------------------------------------
 * DOM wiring (runs when document exists)
 * ----------------------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
    if (typeof document === "undefined") return;

    initDomElements();

    // System theme listener
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    appState.systemDarkMode = mediaQuery.matches;
    mediaQuery.addEventListener("change", (e) => {
        appState.systemDarkMode = e.matches;
        applyTheme();
    });
    // Initial apply (defaults to auto/system until we get prefs)
    applyTheme();

    appState.importPreference = readImportPreference();
    appState.importLogEntries = readImportLog();
    renderImportPreferenceSummary();
    renderImportLog();

    if (uiElements.importScopeClearBtn) {
        uiElements.importScopeClearBtn.addEventListener("click", () =>
            clearImportPreference(true)
        );
    }

    if (uiElements.importScopeConfirmBtn) {
        uiElements.importScopeConfirmBtn.addEventListener("click", () => {
            if (!appState.importScopeModalState) {
                closeImportScopeModal();
                return;
            }
            const state = appState.importScopeModalState;
            const selections: string[] = [];
            for (let i = 0; i < state.collections.length; i++) {
                const collection = state.collections[i];
                const inputs = state.inputsByCollection.get(collection) || [];
                const selected = inputs.find((input) => input.checked);
                if (!selected) return;
                selections.push(selected.value);
            }
            const remember = uiElements.importScopeRememberChk
                ? !!uiElements.importScopeRememberChk.checked
                : false;
            closeImportScopeModal();
            state.onConfirm(selections, remember);
        });
    }

    if (uiElements.importScopeCancelBtn) {
        uiElements.importScopeCancelBtn.addEventListener("click", () =>
            closeImportScopeModal()
        );
    }

    if (uiElements.importScopeOverlay) {
        uiElements.importScopeOverlay.addEventListener("click", (ev) => {
            if (ev.target === uiElements.importScopeOverlay)
                closeImportScopeModal();
        });
    }

    if (uiElements.resizeHandleEl) {
        uiElements.resizeHandleEl.addEventListener(
            "pointerdown",
            (event: PointerEvent) => {
                if (event.button !== 0 && event.pointerType === "mouse") return;
                if (appState.resizeTracking) return;
                event.preventDefault();
                appState.resizeTracking = {
                    pointerId: event.pointerId,
                    startX: event.clientX,
                    startY: event.clientY,
                    startWidth: window.innerWidth,
                    startHeight: window.innerHeight,
                };
                try {
                    uiElements.resizeHandleEl!.setPointerCapture(
                        event.pointerId
                    );
                } catch {
                    /* ignore */
                }
                window.addEventListener("pointermove", handleResizeMove, true);
                window.addEventListener("pointerup", endResize, true);
                window.addEventListener("pointercancel", cancelResize, true);
            }
        );
    }

    githubUi.attach({ document, window });

    if (uiElements.fileInput)
        uiElements.fileInput.addEventListener("change", setDisabledStates);

    if (uiElements.exportAllChk) {
        uiElements.exportAllChk.addEventListener("change", () => {
            setDisabledStates();
            postToPlugin({
                type: "SAVE_PREFS",
                payload: { exportAll: !!uiElements.exportAllChk!.checked },
            });
            githubUi.onSelectionChange();
        });
    }

    if (uiElements.styleDictionaryChk) {
        uiElements.styleDictionaryChk.addEventListener("change", () => {
            postToPlugin({
                type: "SAVE_PREFS",
                payload: {
                    styleDictionary: !!uiElements.styleDictionaryChk!.checked,
                },
            });
            requestPreviewForCurrent();
            githubUi.onSelectionChange();
        });
    }

    if (uiElements.flatTokensChk) {
        uiElements.flatTokensChk.addEventListener("change", () => {
            postToPlugin({
                type: "SAVE_PREFS",
                payload: { flatTokens: !!uiElements.flatTokensChk!.checked },
            });
            requestPreviewForCurrent();
            githubUi.onSelectionChange();
        });
    }

    if (uiElements.githubRememberChk) {
        uiElements.githubRememberChk.addEventListener("change", () => {
            postToPlugin({
                type: "SAVE_PREFS",
                payload: {
                    githubRememberToken:
                        !!uiElements.githubRememberChk!.checked,
                },
            });
        });
    }

    if (uiElements.refreshBtn) {
        uiElements.refreshBtn.addEventListener("click", () => {
            postToPlugin({ type: "FETCH_COLLECTIONS" });
        });
    }

    if (uiElements.importBtn && uiElements.fileInput) {
        uiElements.importBtn.addEventListener("click", () => {
            if (
                !uiElements.fileInput!.files ||
                uiElements.fileInput!.files.length === 0
            ) {
                log("Select a JSON file first.");
                return;
            }
            const reader = new FileReader();
            reader.onload = function () {
                try {
                    const text = String(reader.result);
                    const json = JSON.parse(text);
                    if (
                        !json ||
                        typeof json !== "object" ||
                        json instanceof Array
                    ) {
                        log(
                            "Invalid JSON structure for tokens (expected an object)."
                        );
                        return;
                    }
                    const allowHex = !!(
                        uiElements.allowHexChk && uiElements.allowHexChk.checked
                    );
                    startImportFlow(json, allowHex);
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    log("Failed to parse JSON: " + msg);
                }
            };
            reader.readAsText(uiElements.fileInput!.files[0]);
        });
    }

    if (uiElements.exportBtn) {
        uiElements.exportBtn.addEventListener("click", async () => {
            let exportAll = false;
            if (uiElements.exportAllChk)
                exportAll = !!uiElements.exportAllChk.checked;

            const styleDictionary = !!(
                uiElements.styleDictionaryChk &&
                uiElements.styleDictionaryChk.checked
            );
            const flatTokens = !!(
                uiElements.flatTokensChk && uiElements.flatTokensChk.checked
            );

            const payload: {
                exportAll: boolean;
                collection?: string;
                mode?: string;
                styleDictionary?: boolean;
                flatTokens?: boolean;
            } = { exportAll, styleDictionary, flatTokens };
            if (
                !exportAll &&
                uiElements.collectionSelect &&
                uiElements.modeSelect
            ) {
                payload.collection = uiElements.collectionSelect.value;
                payload.mode = uiElements.modeSelect.value;
                if (!(payload.collection && payload.mode)) {
                    log('Pick collection and mode or use "Export all".');
                    return;
                }
            }

            const suggestedName = exportAll
                ? "tokens.json"
                : prettyExportName(
                      `${payload.collection ?? "Tokens"}_mode=${
                          payload.mode ?? "Mode 1"
                      }.tokens.json`
                  );

            await beginPendingSave(suggestedName);

            postToPlugin({ type: "EXPORT_DTCG", payload });
            if (exportAll) log("Export all requested.");
            else
                log(
                    `Export requested for "${payload.collection || ""}" / "${
                        payload.mode || ""
                    }".`
                );
        });
    }

    if (uiElements.exportTypographyBtn) {
        uiElements.exportTypographyBtn.addEventListener("click", async () => {
            await beginPendingSave("typography.json");
            postToPlugin({ type: "EXPORT_TYPOGRAPHY" });
            log("Typography export requested.");
        });
    }

    if (uiElements.drawerToggleBtn) {
        uiElements.drawerToggleBtn.addEventListener("click", () => {
            const current =
                uiElements.drawerToggleBtn!.getAttribute("aria-expanded") ===
                "true";
            setDrawerOpen(!current);
        });
    }

    if (uiElements.collectionSelect) {
        uiElements.collectionSelect.addEventListener("change", () => {
            onCollectionChange();
            if (uiElements.collectionSelect && uiElements.modeSelect) {
                postToPlugin({
                    type: "SAVE_LAST",
                    payload: {
                        collection: uiElements.collectionSelect.value,
                        mode: uiElements.modeSelect.value,
                    },
                });
                requestPreviewForCurrent();
            }
            githubUi.onSelectionChange();
        });
    }

    if (uiElements.modeSelect) {
        uiElements.modeSelect.addEventListener("change", () => {
            if (uiElements.collectionSelect && uiElements.modeSelect) {
                postToPlugin({
                    type: "SAVE_LAST",
                    payload: {
                        collection: uiElements.collectionSelect.value,
                        mode: uiElements.modeSelect.value,
                    },
                });
            }
            setDisabledStates();
            requestPreviewForCurrent();
            githubUi.onSelectionChange();
        });
    }

    if (uiElements.copyRawBtn)
        uiElements.copyRawBtn.addEventListener("click", () =>
            copyElText(uiElements.rawEl, "Raw Figma Collections")
        );
    if (uiElements.copyW3cBtn)
        uiElements.copyW3cBtn.addEventListener("click", () =>
            copyElText(uiElements.w3cPreviewEl, "W3C Preview")
        );
    if (uiElements.copyLogBtn)
        uiElements.copyLogBtn.addEventListener("click", () =>
            copyElText(uiElements.logEl, "Log")
        );

    githubUi.onSelectionChange();
    autoFitOnce();

    if (uiElements.rawEl)
        uiElements.rawEl.textContent = "Loading variable collections…";
    setDisabledStates();
    setDrawerOpen(getSavedDrawerOpen());
    postToPlugin({ type: "UI_READY" });

    // Poll for updates (heartbeat)
    setInterval(() => {
        postToPlugin({ type: "PING" });
    }, 500);
});

/* -------------------------------------------------------
 * Drawer helpers
 * ----------------------------------------------------- */
/** Persist drawer state and adjust CSS hooks so the UI animates correctly. */
function setDrawerOpen(open: boolean): void {
    if (uiElements.shellEl) {
        if (open) uiElements.shellEl.classList.remove("drawer-collapsed");
        else uiElements.shellEl.classList.add("drawer-collapsed");
    }
    if (uiElements.drawerToggleBtn) {
        uiElements.drawerToggleBtn.setAttribute(
            "aria-expanded",
            open ? "true" : "false"
        );
        uiElements.drawerToggleBtn.textContent = open ? "Hide" : "Show";
        uiElements.drawerToggleBtn.title = open ? "Hide log" : "Show log";
    }
    try {
        window.localStorage.setItem("drawerOpen", open ? "1" : "0");
    } catch {
        /* ignore */
    }
}

/** Load the saved drawer state flag from local storage. */
function getSavedDrawerOpen(): boolean {
    try {
        const v = window.localStorage.getItem("drawerOpen");
        if (v === "0") return false;
        if (v === "1") return true;
    } catch {
        /* ignore */
    }
    return true;
}
