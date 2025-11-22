import { UiToPlugin } from "../../messages";
import { uiElements } from "../dom";
import { appState } from "../state";
import {
    ImportContextOption,
    ImportLogEntry,
    writeImportPreference,
    removeImportPreference,
    writeImportLog,
    normalizeContextList,
    contextsEqual,
} from "../storage";
import { log, postToPlugin } from "../utils";

export function formatContextList(contexts: string[]): string {
    const normalized = normalizeContextList(contexts);
    if (normalized.length === 0) return "All contexts";
    const grouped = new Map<string, string[]>();
    for (let i = 0; i < normalized.length; i++) {
        const ctx = normalized[i];
        const slash = ctx.indexOf("/");
        const collection = slash >= 0 ? ctx.slice(0, slash) : ctx;
        const mode = slash >= 0 ? ctx.slice(slash + 1) : "Mode 1";
        const coll = collection ? collection : "Tokens";
        const modes = grouped.get(coll) || [];
        if (!grouped.has(coll)) grouped.set(coll, modes);
        if (!modes.includes(mode)) modes.push(mode);
    }
    const parts: string[] = [];
    const collections = Array.from(grouped.keys()).sort((a, b) =>
        a < b ? -1 : a > b ? 1 : 0
    );
    for (let i = 0; i < collections.length; i++) {
        const coll = collections[i];
        const modes = grouped.get(coll) || [];
        modes.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
        parts.push(`${coll} (${modes.join(", ")})`);
    }
    return parts.join("; ");
}

export function renderImportPreferenceSummary(): void {
    if (
        !uiElements.importScopeSummaryEl ||
        !uiElements.importScopeSummaryTextEl
    )
        return;
    const hasPref =
        !!appState.importPreference &&
        appState.importPreference.contexts.length > 0;
    if (uiElements.importScopeClearBtn)
        uiElements.importScopeClearBtn.disabled = !hasPref;
    if (!hasPref) {
        uiElements.importScopeSummaryEl.hidden = true;
        return;
    }
    uiElements.importScopeSummaryEl.hidden = false;
    const when = new Date(
        appState.importPreference!.updatedAt
    ).toLocaleString();
    uiElements.importScopeSummaryTextEl.textContent = `Remembered import scope (${when}): ${formatContextList(
        appState.importPreference!.contexts
    )}.`;
}

export function renderImportLog(): void {
    if (!(uiElements.importSkipLogListEl && uiElements.importSkipLogEmptyEl))
        return;
    uiElements.importSkipLogListEl.innerHTML = "";
    if (!appState.importLogEntries || appState.importLogEntries.length === 0) {
        uiElements.importSkipLogEmptyEl.hidden = false;
        return;
    }
    uiElements.importSkipLogEmptyEl.hidden = true;

    for (let idx = appState.importLogEntries.length - 1; idx >= 0; idx--) {
        const entry = appState.importLogEntries[idx];
        const container = document.createElement("div");
        container.className = "import-skip-log-entry";

        const header = document.createElement("div");
        header.className = "import-skip-log-entry-header";
        const label =
            entry.source === "github" ? "GitHub import" : "Manual import";
        header.textContent = `${label} • ${new Date(
            entry.timestamp
        ).toLocaleString()}`;
        container.appendChild(header);

        const stats = document.createElement("div");
        stats.className = "import-skip-log-entry-stats";
        const tokensText = `Imported ${entry.summary.importedTokens} of ${entry.summary.totalTokens} tokens.`;
        const stylesCreated =
            typeof entry.summary.createdStyles === "number"
                ? entry.summary.createdStyles
                : undefined;
        if (typeof stylesCreated === "number") {
            const stylesLabel = stylesCreated === 1 ? "style" : "styles";
            stats.textContent = `${tokensText} ${stylesCreated} ${stylesLabel} created.`;
        } else {
            stats.textContent = tokensText;
        }
        container.appendChild(stats);

        const contextsLine = document.createElement("div");
        contextsLine.className = "import-skip-log-entry-contexts";
        contextsLine.textContent =
            "Applied: " + formatContextList(entry.summary.appliedContexts);
        container.appendChild(contextsLine);

        if (entry.summary.skippedContexts.length > 0) {
            const skippedLine = document.createElement("div");
            skippedLine.className = "import-skip-log-entry-contexts";
            skippedLine.textContent =
                "Skipped modes: " +
                formatContextList(
                    entry.summary.skippedContexts.map((s) => s.context)
                );
            container.appendChild(skippedLine);
        }

        if (entry.summary.missingRequestedContexts.length > 0) {
            const missingLine = document.createElement("div");
            missingLine.className = "import-skip-log-entry-note";
            missingLine.textContent =
                "Not found in file: " +
                formatContextList(entry.summary.missingRequestedContexts);
            container.appendChild(missingLine);
        }

        if (entry.summary.selectionFallbackToAll) {
            const fallbackLine = document.createElement("div");
            fallbackLine.className = "import-skip-log-entry-note";
            fallbackLine.textContent =
                "Requested modes were missing; imported all contexts instead.";
            container.appendChild(fallbackLine);
        }

        if (entry.summary.tokensWithRemovedContexts.length > 0) {
            const tokenList = document.createElement("ul");
            tokenList.className = "import-skip-log-token-list";
            const maxTokens = Math.min(
                entry.summary.tokensWithRemovedContexts.length,
                10
            );
            for (let t = 0; t < maxTokens; t++) {
                const tok = entry.summary.tokensWithRemovedContexts[t];
                const li = document.createElement("li");
                const removedLabel =
                    tok.removedContexts.length > 0
                        ? formatContextList(tok.removedContexts)
                        : "none";
                const keptLabel =
                    tok.keptContexts.length > 0
                        ? formatContextList(tok.keptContexts)
                        : "";
                li.textContent = `${tok.path} — skipped ${removedLabel}${
                    keptLabel ? "; kept " + keptLabel : ""
                }`;
                tokenList.appendChild(li);
            }
            if (entry.summary.tokensWithRemovedContexts.length > maxTokens) {
                const more = document.createElement("li");
                more.textContent = `…and ${
                    entry.summary.tokensWithRemovedContexts.length - maxTokens
                } more token(s).`;
                tokenList.appendChild(more);
            }
            container.appendChild(tokenList);
        }

        if (
            entry.summary.skippedContexts.length > 0 &&
            appState.importPreference &&
            appState.importPreference.contexts.length > 0
        ) {
            const tip = document.createElement("div");
            tip.className = "import-skip-log-entry-note";
            tip.textContent =
                "Tip: Clear the remembered import selection to restore skipped modes.";
            container.appendChild(tip);
        }

        uiElements.importSkipLogListEl.appendChild(container);
    }
}

export function addImportLogEntry(entry: ImportLogEntry): void {
    appState.importLogEntries.push(entry);
    if (appState.importLogEntries.length > 10) {
        appState.importLogEntries = appState.importLogEntries.slice(
            appState.importLogEntries.length - 10
        );
    }
    writeImportLog(appState.importLogEntries);
    renderImportLog();
}

export function setImportPreference(contexts: string[]): void {
    const normalized = normalizeContextList(contexts);
    if (normalized.length === 0) {
        clearImportPreference(false);
        return;
    }
    const same =
        appState.importPreference &&
        contextsEqual(appState.importPreference.contexts, normalized);
    appState.importPreference = { contexts: normalized, updatedAt: Date.now() };
    writeImportPreference(appState.importPreference);
    renderImportPreferenceSummary();
    if (!same) log("Remembered import selection for future imports.");
}

export function clearImportPreference(logChange: boolean): void {
    if (!appState.importPreference) return;
    appState.importPreference = null;
    removeImportPreference();
    renderImportPreferenceSummary();
    if (logChange)
        log(
            "Cleared remembered import selection. Next import will prompt for modes."
        );
}

function collectContextsFromJson(root: unknown): ImportContextOption[] {
    const grouped = new Map<string, Set<string>>();

    function visit(node: unknown, path: string[]): void {
        if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) visit(node[i], path);
            return;
        }
        if (!node || typeof node !== "object") return;

        const obj = node as Record<string, unknown>;
        if (Object.prototype.hasOwnProperty.call(obj, "$value")) {
            const rawCollection = path[0] ? String(path[0]).trim() : "Tokens";
            let mode = "Mode 1";
            try {
                const ext = obj["$extensions"];
                if (ext && typeof ext === "object") {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const cf = (ext as any)["com.figma"];
                    if (
                        cf &&
                        typeof cf === "object" &&
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        typeof (cf as any).modeName === "string"
                    ) {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        const candidate = String((cf as any).modeName).trim();
                        if (candidate) mode = candidate;
                    }
                }
            } catch {
                /* ignore */
            }
            const collection = rawCollection ? rawCollection : "Tokens";
            const set = grouped.get(collection) || new Set<string>();
            if (!grouped.has(collection)) grouped.set(collection, set);
            set.add(mode);
            return;
        }

        for (const key in obj) {
            if (!Object.prototype.hasOwnProperty.call(obj, key)) continue;
            if (key.startsWith("$")) continue;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            visit((obj as any)[key], path.concat(String(key)));
        }
    }

    visit(root, []);

    const options: ImportContextOption[] = [];
    const collections = Array.from(grouped.keys()).sort((a, b) =>
        a < b ? -1 : a > b ? 1 : 0
    );
    for (let i = 0; i < collections.length; i++) {
        const collection = collections[i];
        const modes = Array.from(grouped.get(collection) || []).sort((a, b) =>
            a < b ? -1 : a > b ? 1 : 0
        );
        for (let j = 0; j < modes.length; j++) {
            const mode = modes[j];
            options.push({
                context: `${collection}/${mode}`,
                collection,
                mode,
            });
        }
    }
    return options;
}

export function updateImportScopeConfirmState(): void {
    if (!appState.importScopeModalState) return;
    const state = appState.importScopeModalState;
    let allCollectionsSelected = true;
    for (let i = 0; i < state.collections.length; i++) {
        const collection = state.collections[i];
        const inputs = state.inputsByCollection.get(collection) || [];
        if (!inputs.some((input) => input.checked)) {
            allCollectionsSelected = false;
            break;
        }
    }
    if (uiElements.importScopeConfirmBtn) {
        uiElements.importScopeConfirmBtn.disabled = !allCollectionsSelected;
        const label =
            state.collections.length > 1
                ? "Import selected modes"
                : "Import selected mode";
        uiElements.importScopeConfirmBtn.textContent = label;
    }
}

let importScopeKeyListenerAttached = false;

export function handleImportScopeKeydown(ev: KeyboardEvent): void {
    if (ev.key === "Escape") {
        ev.preventDefault();
        closeImportScopeModal();
    }
}

export function openImportScopeModal(opts: {
    options: ImportContextOption[];
    initialSelection: string[];
    rememberInitially: boolean;
    missingPreferred: string[];
    onConfirm: (selected: string[], remember: boolean) => void;
}): void {
    if (
        !uiElements.importScopeOverlay ||
        !uiElements.importScopeBody ||
        !uiElements.importScopeConfirmBtn ||
        !uiElements.importScopeCancelBtn
    ) {
        opts.onConfirm(opts.initialSelection, opts.rememberInitially);
        return;
    }

    uiElements.importScopeBody.innerHTML = "";

    const grouped = new Map<string, ImportContextOption[]>();
    for (let i = 0; i < opts.options.length; i++) {
        const option = opts.options[i];
        const list = grouped.get(option.collection) || [];
        if (!grouped.has(option.collection))
            grouped.set(option.collection, list);
        list.push(option);
    }

    const collections = Array.from(grouped.keys()).sort((a, b) =>
        a < b ? -1 : a > b ? 1 : 0
    );
    appState.importScopeModalState = {
        options: opts.options,
        collections,
        inputs: [],
        inputsByCollection: new Map(),
        onConfirm: opts.onConfirm,
    };

    const initialSelectionsByCollection = new Map<string, string>();
    for (let i = 0; i < opts.initialSelection.length; i++) {
        const ctx = opts.initialSelection[i];
        const match = opts.options.find((opt) => opt.context === ctx);
        if (match)
            initialSelectionsByCollection.set(match.collection, match.context);
    }

    for (let i = 0; i < collections.length; i++) {
        const collection = collections[i];
        const groupEl = document.createElement("div");
        groupEl.className = "import-scope-group";
        const heading = document.createElement("h3");
        heading.textContent = collection;
        groupEl.appendChild(heading);

        const modes = (grouped.get(collection) || []).sort((a, b) =>
            a.mode < b.mode ? -1 : a.mode > b.mode ? 1 : 0
        );
        const defaultContext =
            initialSelectionsByCollection.get(collection) ||
            modes[0]?.context ||
            null;
        const radioName = `importScopeMode_${i}`;
        for (let j = 0; j < modes.length; j++) {
            const opt = modes[j];
            const label = document.createElement("label");
            label.className = "import-scope-mode";
            const radio = document.createElement("input");
            radio.type = "radio";
            radio.name = radioName;
            radio.value = opt.context;
            radio.checked = defaultContext === opt.context;
            radio.addEventListener("change", updateImportScopeConfirmState);
            appState.importScopeModalState.inputs.push(radio);
            const list =
                appState.importScopeModalState.inputsByCollection.get(
                    collection
                ) || [];
            if (
                !appState.importScopeModalState.inputsByCollection.has(
                    collection
                )
            ) {
                appState.importScopeModalState.inputsByCollection.set(
                    collection,
                    list
                );
            }
            list.push(radio);

            const span = document.createElement("span");
            span.textContent = opt.mode;

            label.appendChild(radio);
            label.appendChild(span);
            groupEl.appendChild(label);
        }

        uiElements.importScopeBody.appendChild(groupEl);
    }

    if (uiElements.importScopeRememberChk)
        uiElements.importScopeRememberChk.checked = opts.rememberInitially;
    if (uiElements.importScopeMissingEl) {
        if (opts.missingPreferred.length > 0) {
            uiElements.importScopeMissingEl.hidden = false;
            uiElements.importScopeMissingEl.textContent =
                "Previously remembered modes not present in this file: " +
                formatContextList(opts.missingPreferred);
        } else {
            uiElements.importScopeMissingEl.hidden = true;
            uiElements.importScopeMissingEl.textContent = "";
        }
    }

    updateImportScopeConfirmState();

    uiElements.importScopeOverlay.hidden = false;
    uiElements.importScopeOverlay.classList.add("is-open");
    uiElements.importScopeOverlay.setAttribute("aria-hidden", "false");
    if (!importScopeKeyListenerAttached) {
        window.addEventListener("keydown", handleImportScopeKeydown, true);
        importScopeKeyListenerAttached = true;
    }
    if (uiElements.importScopeConfirmBtn)
        uiElements.importScopeConfirmBtn.focus();
}

export function closeImportScopeModal(): void {
    if (!uiElements.importScopeOverlay) return;
    uiElements.importScopeOverlay.classList.remove("is-open");
    uiElements.importScopeOverlay.hidden = true;
    uiElements.importScopeOverlay.setAttribute("aria-hidden", "true");
    if (importScopeKeyListenerAttached) {
        window.removeEventListener("keydown", handleImportScopeKeydown, true);
        importScopeKeyListenerAttached = false;
    }
    appState.importScopeModalState = null;
}

export function performImport(
    json: unknown,
    allowHex: boolean,
    contexts: string[]
): void {
    const normalized = normalizeContextList(contexts);
    const payload: UiToPlugin =
        normalized.length > 0
            ? {
                  type: "IMPORT_DTCG",
                  payload: {
                      json,
                      allowHexStrings: allowHex,
                      contexts: normalized,
                  },
              }
            : {
                  type: "IMPORT_DTCG",
                  payload: { json, allowHexStrings: allowHex },
              };
    postToPlugin(payload);
    appState.lastImportSelection = normalized.slice();
    const label =
        normalized.length > 0 ? formatContextList(normalized) : "all contexts";
    log(`Import requested (${label}).`);
}

export function startImportFlow(json: unknown, allowHex: boolean): void {
    const options = collectContextsFromJson(json);
    if (options.length === 0) {
        performImport(json, allowHex, []);
        return;
    }

    const grouped = new Map<string, ImportContextOption[]>();
    for (let i = 0; i < options.length; i++) {
        const option = options[i];
        const list = grouped.get(option.collection) || [];
        if (!grouped.has(option.collection))
            grouped.set(option.collection, list);
        list.push(option);
    }

    const availableSet = new Set(options.map((opt) => opt.context));
    const missingPreferred: string[] = [];
    let rememberInitially = false;
    const initialSelectionsByCollection = new Map<string, string>();

    if (
        appState.importPreference &&
        appState.importPreference.contexts.length > 0
    ) {
        for (let i = 0; i < appState.importPreference.contexts.length; i++) {
            const ctx = appState.importPreference.contexts[i];
            if (availableSet.has(ctx)) {
                const match = options.find((opt) => opt.context === ctx);
                if (match) {
                    initialSelectionsByCollection.set(
                        match.collection,
                        match.context
                    );
                    rememberInitially = true;
                }
            } else {
                missingPreferred.push(ctx);
            }
        }
    }

    const collections = Array.from(grouped.keys()).sort((a, b) =>
        a < b ? -1 : a > b ? 1 : 0
    );
    for (let i = 0; i < collections.length; i++) {
        const collection = collections[i];
        if (!initialSelectionsByCollection.has(collection)) {
            const modes = (grouped.get(collection) || []).sort((a, b) =>
                a.mode < b.mode ? -1 : a.mode > b.mode ? 1 : 0
            );
            if (modes.length > 0)
                initialSelectionsByCollection.set(collection, modes[0].context);
        }
    }

    const initialSelection = collections
        .map((collection) => initialSelectionsByCollection.get(collection))
        .filter((ctx): ctx is string => typeof ctx === "string");

    const requiresChoice = collections.some((collection) => {
        const list = grouped.get(collection) || [];
        return list.length > 1;
    });

    if (!requiresChoice) {
        performImport(json, allowHex, initialSelection);
        return;
    }

    openImportScopeModal({
        options,
        initialSelection,
        rememberInitially,
        missingPreferred,
        onConfirm: (selected, remember) => {
            if (remember) setImportPreference(selected);
            else if (appState.importPreference) clearImportPreference(true);
            performImport(json, allowHex, selected);
        },
    });
}

export function getPreferredImportContexts(): string[] {
    if (
        appState.importPreference &&
        appState.importPreference.contexts.length > 0
    )
        return appState.importPreference.contexts.slice();
    if (appState.lastImportSelection.length > 0)
        return appState.lastImportSelection.slice();
    return [];
}
