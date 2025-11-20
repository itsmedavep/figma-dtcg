// src/app/main.ts
// Main-thread controller: wires UI messages into Figma APIs and GitHub helpers.
// - Handles persistence so the iframe can reload without losing settings
// - Wraps GitHub flows with retries and gentle error surfaces

import type { UiToPlugin, PluginToUi, GithubScope } from "./messages";
import {
    snapshotCollectionsForUi,
    analyzeSelectionState,
    safeKeyFromCollectionAndMode,
} from "./collections";
import { importDtcg, exportDtcg } from "../core/pipeline";

import { createGithubDispatcher } from "./github/dispatcher";

// __html__ is injected by your build (esbuild) from dist/ui.html with ui.js inlined.
declare const __html__: string;

// Use saved size if available; fall back to 960×540.
(async function initUI() {
    let w = 960,
        h = 540;
    try {
        const saved = await figma.clientStorage.getAsync("uiSize");
        if (
            saved &&
            typeof saved.width === "number" &&
            typeof saved.height === "number"
        ) {
            const sw = Math.floor(saved.width);
            const sh = Math.floor(saved.height);
            w = Math.max(720, Math.min(1600, sw));
            h = Math.max(420, Math.min(1200, sh));
        }
    } catch {
        /* ignore */
    }
    figma.showUI(__html__, { width: w, height: h });
})();

function send(msg: PluginToUi): void {
    figma.ui.postMessage(msg);
}

const github = createGithubDispatcher({
    send,
    snapshotCollectionsForUi,
    analyzeSelectionState,
    safeKeyFromCollectionAndMode,
    importDtcg,
    exportDtcg,
});

type CollectionsDataPayload = Extract<
    PluginToUi,
    { type: "COLLECTIONS_DATA" }
>["payload"];
type RefreshReason = "initial" | "manual" | "auto";
type AutoRefreshSource = "style-event" | "variable-poll";

// Poll for variable graph changes every 5s, but after a detected change we run a short
// burst of faster polls so repeated edits feel responsive without hammering constantly.
const VARIABLE_POLL_INTERVAL_MS = 5000;
const VARIABLE_POLL_BURST_DELAY_MS = 350;
const VARIABLE_POLL_BURST_LIMIT = 3;
const AUTO_REFRESH_DEBOUNCE_MS = 600;

let autoSyncActive = false;
let autoRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let autoRefreshRequested = false;
let autoRefreshRunning = false;
let variablePollTimer: ReturnType<typeof setTimeout> | null = null;
// Tracks how many burst polls remain after a change so we can fall back to the slower cadence.
let variableBurstRemaining = 0;
let documentChangeHandler: ((event: DocumentChangeEvent) => void) | null = null;
let styleChangeHandler: ((event: StyleChangeEvent) => void) | null = null;
let lastCollectionsSignature: string | null = null;
let pendingSignatureAfterRefresh: string | null = null;
let pendingAutoRefreshSource: AutoRefreshSource | null = null;
const pendingStyleEvents = new Map<
    string,
    {
        create?: boolean;
        update?: boolean;
        delete?: boolean;
        attempts?: number;
        loggedUpdate?: boolean;
    }
>();
const styleDisplayIds = new Map<string, string>();
const knownStyleIds = new Set<string>();

function computeCollectionsSignatureFromPayload(
    payload: CollectionsDataPayload
): string {
    const parts: string[] = [];
    const collections = (payload.collections || [])
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id));
    for (let i = 0; i < collections.length; i++) {
        const col = collections[i];
        if (!col) continue;
        parts.push(col.id, col.name);
        const modes = (col.modes || [])
            .slice()
            .sort((a, b) => a.id.localeCompare(b.id));
        for (let mi = 0; mi < modes.length; mi++) {
            const mode = modes[mi];
            parts.push(mode.id, mode.name);
        }
        const variables = (col.variables || [])
            .slice()
            .sort((a, b) => a.id.localeCompare(b.id));
        for (let vi = 0; vi < variables.length; vi++) {
            const variable = variables[vi];
            parts.push(variable.id, variable.name, variable.type);
        }
    }
    return parts.join("|");
}

async function buildCollectionsPayload(): Promise<{
    payload: CollectionsDataPayload;
    rawText: string;
    count: number;
    signature: string;
}> {
    const snap = await snapshotCollectionsForUi();
    const last = await figma.clientStorage
        .getAsync("lastSelection")
        .catch(() => null);
    const exportAllPrefVal = await figma.clientStorage
        .getAsync("exportAllPref")
        .catch(() => false);
    const styleDictionaryPrefVal = await figma.clientStorage
        .getAsync("styleDictionaryPref")
        .catch(() => false);
    const flatTokensPrefVal = await figma.clientStorage
        .getAsync("flatTokensPref")
        .catch(() => false);
    const allowHexPrefStored = await figma.clientStorage
        .getAsync("allowHexPref")
        .catch(() => null);
    const githubRememberPrefStored = await figma.clientStorage
        .getAsync("githubRememberPref")
        .catch(() => null);
    const allowHexPrefVal =
        typeof allowHexPrefStored === "boolean" ? allowHexPrefStored : true;
    const githubRememberPrefVal =
        typeof githubRememberPrefStored === "boolean"
            ? githubRememberPrefStored
            : true;
    const lastOrNull =
        last &&
        typeof last.collection === "string" &&
        typeof last.mode === "string"
            ? last
            : null;

    const payload: CollectionsDataPayload = {
        collections: snap.collections,
        last: lastOrNull,
        exportAllPref: !!exportAllPrefVal,
        styleDictionaryPref: !!styleDictionaryPrefVal,
        flatTokensPref: !!flatTokensPrefVal,
        allowHexPref: allowHexPrefVal,
        githubRememberPref: githubRememberPrefVal,
    };

    return {
        payload,
        rawText: snap.rawText,
        count: snap.collections.length,
        signature: computeCollectionsSignatureFromPayload(payload),
    };
}

async function refreshCollections(
    reason: RefreshReason,
    autoSource?: AutoRefreshSource | null
): Promise<void> {
    const prevStyleIds = new Set(knownStyleIds);
    try {
        const snap = await buildCollectionsPayload();
        const shouldLog = reason !== "auto";
        if (shouldLog) {
            let message = "";
            if (reason === "initial") {
                message =
                    "Fetched " + String(snap.count) + " collections (initial)";
            } else if (reason === "manual") {
                message = "Fetched " + String(snap.count) + " collections";
            } else if (autoSource === "style-event") {
                message =
                    "Document change detected; refreshed " +
                    String(snap.count) +
                    " collections";
            }
            if (message) {
                send({ type: "INFO", payload: { message } });
            }
        }
        send({ type: "COLLECTIONS_DATA", payload: snap.payload });
        send({ type: "RAW_COLLECTIONS_TEXT", payload: { text: snap.rawText } });
        lastCollectionsSignature = snap.signature;
        pendingSignatureAfterRefresh = null;
        const nextStyleIds = collectCurrentStyleIds();
        knownStyleIds.clear();
        nextStyleIds.forEach((id) => knownStyleIds.add(id));
        flushStyleEventLogs(prevStyleIds, nextStyleIds);
    } catch (err) {
        const message = (err as Error)?.message || "unknown error";
        send({
            type: "ERROR",
            payload: { message: "Failed to refresh collections: " + message },
        });
    }
}

async function computeVariableCollectionsSignature(): Promise<string | null> {
    if (
        !figma.variables ||
        typeof figma.variables.getLocalVariableCollectionsAsync !== "function"
    ) {
        return null;
    }

    const collections =
        await figma.variables.getLocalVariableCollectionsAsync();
    const signatures: string[] = [];
    const sortedCollections = (collections || [])
        .slice()
        .sort((a, b) => a.id.localeCompare(b.id));
    for (let i = 0; i < sortedCollections.length; i++) {
        const col = sortedCollections[i];
        if (!col) continue;
        signatures.push(col.id, col.name, col.defaultModeId);
        const modes = (col.modes || [])
            .slice()
            .sort((a, b) => a.modeId.localeCompare(b.modeId));
        for (let mi = 0; mi < modes.length; mi++) {
            const mode = modes[mi];
            signatures.push(mode.modeId, mode.name);
        }
        const vars = (col.variableIds || []).slice().sort();
        for (let vi = 0; vi < vars.length; vi++) signatures.push(vars[vi]);
    }

    if (typeof figma.variables.getLocalVariablesAsync === "function") {
        const allVars = await figma.variables.getLocalVariablesAsync();
        const sortedVars = (allVars || [])
            .slice()
            .sort((a, b) => a.id.localeCompare(b.id));
        for (let vi = 0; vi < sortedVars.length; vi++) {
            const variable = sortedVars[vi];
            if (!variable) continue;
            signatures.push(
                variable.id,
                variable.name,
                variable.variableCollectionId,
                variable.resolvedType,
                serializeVariableValues(variable.valuesByMode)
            );
        }
    }

    return signatures.join("|");
}

function serializeVariableValues(
    values: Record<string, unknown> | undefined
): string {
    if (!values) return "";
    const parts: string[] = [];
    const modeIds = Object.keys(values).sort();
    for (let mi = 0; mi < modeIds.length; mi++) {
        const modeId = modeIds[mi];
        parts.push(modeId, formatVariableValue(values[modeId]));
    }
    return parts.join("|");
}

function formatVariableValue(value: unknown): string {
    if (value === null || typeof value === "undefined") return "null";
    if (typeof value === "number" || typeof value === "boolean")
        return String(value);
    if (typeof value === "string") return value;
    try {
        return JSON.stringify(value);
    } catch {
        return "[unserializable]";
    }
}

async function variableGraphLikelyChanged(): Promise<boolean> {
    try {
        const signature = await computeVariableCollectionsSignature();
        if (!signature) return false;
        if (lastCollectionsSignature === null) {
            pendingSignatureAfterRefresh = signature;
            return true;
        }
        if (signature === lastCollectionsSignature) return false;
        if (
            pendingSignatureAfterRefresh &&
            pendingSignatureAfterRefresh === signature
        )
            return false;
        pendingSignatureAfterRefresh = signature;
        return true;
    } catch {
        return true;
    }
}

function isStyleDocumentChange(
    change: DocumentChange | null | undefined
): boolean {
    if (!change) return false;
    return (
        change.type === "STYLE_CREATE" ||
        change.type === "STYLE_DELETE" ||
        change.type === "STYLE_PROPERTY_CHANGE"
    );
}

function handleDocumentChangeEvent(event: DocumentChangeEvent): void {
    if (!autoSyncActive || !event || !event.documentChanges) return;
    const list = event.documentChanges;
    let sawStyleChange = false;
    for (let i = 0; i < list.length; i++) {
        const change = list[i];
        if (isStyleDocumentChange(change)) {
            recordStyleEvent(change?.type, change?.id);
            sawStyleChange = true;
        }
    }
    if (sawStyleChange) {
        requestAutoRefresh("style-event");
    }
}

function handleStyleChangeEvent(event: StyleChangeEvent): void {
    if (!autoSyncActive || !event || !event.styleChanges) return;
    const list = event.styleChanges;
    let sawStyleChange = false;
    for (let i = 0; i < list.length; i++) {
        const change = list[i];
        if (!change || !change.type) continue;
        recordStyleEvent(change.type, change.id);
        sawStyleChange = true;
    }
    if (sawStyleChange) {
        requestAutoRefresh("style-event");
    }
}

function normalizeStyleId(raw: string | undefined): string | null {
    if (!raw) return null;
    const idx = raw.indexOf(",");
    return idx >= 0 ? raw.slice(0, idx) : raw;
}

function recordStyleEvent(
    type: string | undefined,
    idRaw: string | undefined
): void {
    if (!type) return;
    const id = normalizeStyleId(idRaw);
    if (!id) return;
    if (
        type !== "STYLE_CREATE" &&
        type !== "STYLE_DELETE" &&
        type !== "STYLE_PROPERTY_CHANGE"
    ) {
        return;
    }
    if (idRaw) styleDisplayIds.set(id, idRaw);
    const entry = pendingStyleEvents.get(id) || {};
    if (type === "STYLE_CREATE") {
        entry.create = true;
        entry.update = false;
        entry.delete = false;
        entry.loggedUpdate = false;
    } else if (type === "STYLE_PROPERTY_CHANGE") {
        if (!entry.create) {
            entry.update = true;
            if (!entry.loggedUpdate && knownStyleIds.has(id)) {
                logStyleMessage("Style updated", styleDisplayIds.get(id) || id);
                entry.loggedUpdate = true;
            }
        }
    } else if (type === "STYLE_DELETE") {
        entry.delete = true;
    }
    entry.attempts = entry.attempts || 0;
    pendingStyleEvents.set(id, entry);
}

function collectCurrentStyleIds(): Set<string> {
    const ids = new Set<string>();
    try {
        const collect = (
            styles: BaseStyle[] | ReadonlyArray<BaseStyle> | undefined
        ) => {
            if (!styles) return;
            for (let i = 0; i < styles.length; i++) {
                const style = styles[i];
                if (!style || typeof style.id !== "string") continue;
                const norm = normalizeStyleId(style.id) || style.id;
                ids.add(norm);
            }
        };
        if (typeof figma.getLocalPaintStyles === "function")
            collect(figma.getLocalPaintStyles());
        if (typeof figma.getLocalTextStyles === "function")
            collect(figma.getLocalTextStyles());
        if (typeof figma.getLocalEffectStyles === "function")
            collect(figma.getLocalEffectStyles());
        if (typeof figma.getLocalGridStyles === "function")
            collect(figma.getLocalGridStyles());
    } catch {
        // ignore
    }
    return ids;
}

function flushStyleEventLogs(prev: Set<string>, next: Set<string>): void {
    if (pendingStyleEvents.size === 0) return;
    const survivors = new Map<
        string,
        {
            create?: boolean;
            update?: boolean;
            delete?: boolean;
            attempts?: number;
        }
    >();
    pendingStyleEvents.forEach((entry, id) => {
        const hadPrev = prev.has(id);
        const hasNext = next.has(id);
        let handled = false;
        if (entry.delete && hadPrev && !hasNext) {
            logStyleMessage("Style deleted", styleDisplayIds.get(id) || id);
            handled = true;
        } else if (entry.create && !hadPrev && hasNext) {
            logStyleMessage("Style created", styleDisplayIds.get(id) || id);
            handled = true;
        } else if (
            entry.update &&
            !entry.create &&
            !entry.loggedUpdate &&
            hadPrev &&
            hasNext
        ) {
            logStyleMessage("Style updated", styleDisplayIds.get(id) || id);
            handled = true;
        }
        if (!handled) {
            const attempts = (entry.attempts || 0) + 1;
            if (attempts < 4) {
                survivors.set(id, { ...entry, attempts });
            }
        }
    });
    pendingStyleEvents.clear();
    survivors.forEach((value, key) => pendingStyleEvents.set(key, value));
}

function logStyleMessage(prefix: string, _id: string): void {
    send({ type: "INFO", payload: { message: prefix } });
}

function requestAutoRefresh(source: AutoRefreshSource): void {
    if (!autoSyncActive) return;
    autoRefreshRequested = true;
    if (source === "style-event") {
        pendingAutoRefreshSource = "style-event";
    } else if (pendingAutoRefreshSource !== "style-event") {
        pendingAutoRefreshSource = "variable-poll";
    }
    if (autoRefreshTimer !== null) return;
    autoRefreshTimer = setTimeout(runAutoRefresh, AUTO_REFRESH_DEBOUNCE_MS);
}

async function runAutoRefresh(): Promise<void> {
    autoRefreshTimer = null;
    if (!autoSyncActive) {
        autoRefreshRequested = false;
        return;
    }
    if (!autoRefreshRequested) return;
    if (autoRefreshRunning) {
        if (autoRefreshTimer === null) {
            autoRefreshTimer = setTimeout(
                runAutoRefresh,
                AUTO_REFRESH_DEBOUNCE_MS
            );
        }
        return;
    }

    autoRefreshRequested = false;
    autoRefreshRunning = true;
    try {
        const source = pendingAutoRefreshSource;
        pendingAutoRefreshSource = null;
        await refreshCollections("auto", source);
    } finally {
        autoRefreshRunning = false;
        if (
            autoSyncActive &&
            autoRefreshRequested &&
            autoRefreshTimer === null
        ) {
            autoRefreshTimer = setTimeout(
                runAutoRefresh,
                AUTO_REFRESH_DEBOUNCE_MS
            );
        }
    }
}

// Run the variable graph sampler on a steady cadence, but when a change is detected we
// execute a short burst of faster polls so multiple edits settle quickly.
function scheduleVariablePoll(
    delayMs: number = VARIABLE_POLL_INTERVAL_MS
): void {
    if (!autoSyncActive || variablePollTimer !== null) return;
    variablePollTimer = setTimeout(async () => {
        variablePollTimer = null;
        if (!autoSyncActive) return;
        let needsRefresh = true;
        try {
            needsRefresh = await variableGraphLikelyChanged();
        } catch {
            needsRefresh = true;
        }
        if (needsRefresh) {
            requestAutoRefresh("variable-poll");
            variableBurstRemaining = VARIABLE_POLL_BURST_LIMIT;
            scheduleVariablePoll(VARIABLE_POLL_BURST_DELAY_MS);
        } else {
            if (variableBurstRemaining > 0) {
                variableBurstRemaining--;
                scheduleVariablePoll(VARIABLE_POLL_BURST_DELAY_MS);
            } else {
                scheduleVariablePoll(VARIABLE_POLL_INTERVAL_MS);
            }
        }
    }, delayMs);
}

function startDocumentStateSync(): void {
    if (autoSyncActive) return;
    autoSyncActive = true;
    documentChangeHandler = handleDocumentChangeEvent;
    figma.on("documentchange", handleDocumentChangeEvent);
    if (typeof figma.on === "function") {
        styleChangeHandler = handleStyleChangeEvent;
        figma.on("stylechange", handleStyleChangeEvent);
    }
    scheduleVariablePoll();
}

function stopDocumentStateSync(): void {
    if (!autoSyncActive) return;
    autoSyncActive = false;
    if (documentChangeHandler) {
        figma.off("documentchange", documentChangeHandler);
        documentChangeHandler = null;
    }
    if (styleChangeHandler) {
        figma.off("stylechange", styleChangeHandler);
        styleChangeHandler = null;
    }
    if (variablePollTimer !== null) {
        clearTimeout(variablePollTimer);
        variablePollTimer = null;
    }
    autoRefreshRequested = false;
    if (autoRefreshTimer !== null) {
        clearTimeout(autoRefreshTimer);
        autoRefreshTimer = null;
    }
    autoRefreshRunning = false;
    pendingAutoRefreshSource = null;
    pendingStyleEvents.clear();
    styleDisplayIds.clear();
    knownStyleIds.clear();
}

figma.on("close", () => {
    stopDocumentStateSync();
});

type MessageOfType<T extends UiToPlugin["type"]> = Extract<
    UiToPlugin,
    { type: T }
>;
type Handler = (msg: UiToPlugin) => Promise<void> | void;

// Prime the UI with cached state and fresh collections so the iframe can render immediately.
async function handleUiReady(_msg: UiToPlugin): Promise<void> {
    await refreshCollections("initial");
    await github.onUiReady();
    startDocumentStateSync();
}

// Refresh the collection snapshot on demand, mirroring the bootstrap payload.
async function handleFetchCollections(_msg: UiToPlugin): Promise<void> {
    await refreshCollections("manual");
}

// Apply an uploaded DTCG payload to the document and broadcast the resulting summary back to the UI.
async function handleImportDtcg(msg: UiToPlugin): Promise<void> {
    const payload = (msg as MessageOfType<"IMPORT_DTCG">).payload;
    const contexts = Array.isArray(payload.contexts)
        ? payload.contexts.map((c) => String(c))
        : [];
    const summary = await importDtcg(payload.json, {
        allowHexStrings: !!payload.allowHexStrings,
        contexts,
    });

    const skippedCount = summary.skippedContexts.length;
    if (skippedCount > 0) {
        send({
            type: "INFO",
            payload: {
                message: `Import completed. Applied ${summary.appliedContexts.length} context(s); skipped ${skippedCount}.`,
            },
        });
    } else {
        send({ type: "INFO", payload: { message: "Import completed." } });
    }

    send({
        type: "IMPORT_SUMMARY",
        payload: { summary, timestamp: Date.now(), source: "local" },
    });

    const snap = await snapshotCollectionsForUi();
    const last = await figma.clientStorage
        .getAsync("lastSelection")
        .catch(() => null);
    const exportAllPrefVal = await figma.clientStorage
        .getAsync("exportAllPref")
        .catch(() => false);
    const styleDictionaryPrefVal = await figma.clientStorage
        .getAsync("styleDictionaryPref")
        .catch(() => false);
    const flatTokensPrefVal = await figma.clientStorage
        .getAsync("flatTokensPref")
        .catch(() => false);
    const allowHexPrefStored = await figma.clientStorage
        .getAsync("allowHexPref")
        .catch(() => null);
    const githubRememberPrefStored = await figma.clientStorage
        .getAsync("githubRememberPref")
        .catch(() => null);
    const allowHexPrefVal =
        typeof allowHexPrefStored === "boolean" ? allowHexPrefStored : true;
    const githubRememberPrefVal =
        typeof githubRememberPrefStored === "boolean"
            ? githubRememberPrefStored
            : true;
    const lastOrNull =
        last &&
        typeof last.collection === "string" &&
        typeof last.mode === "string"
            ? last
            : null;

    send({
        type: "COLLECTIONS_DATA",
        payload: {
            collections: snap.collections,
            last: lastOrNull,
            exportAllPref: !!exportAllPrefVal,
            styleDictionaryPref: !!styleDictionaryPrefVal,
            flatTokensPref: !!flatTokensPrefVal,
            allowHexPref: allowHexPrefVal,
            githubRememberPref: githubRememberPrefVal,
        },
    });
    send({ type: "RAW_COLLECTIONS_TEXT", payload: { text: snap.rawText } });
}

// Export tokens either per mode or as a single bundle, matching the UI's requested scope.
async function handleExportDtcg(msg: UiToPlugin): Promise<void> {
    const payload = (msg as MessageOfType<"EXPORT_DTCG">).payload;
    const exportAll = !!payload.exportAll;
    const styleDictionary = !!payload.styleDictionary;
    const flatTokens = !!payload.flatTokens;
    if (exportAll) {
        const all = await exportDtcg({
            format: "single",
            styleDictionary,
            flatTokens,
        });
        send({ type: "EXPORT_RESULT", payload: { files: all.files } });
        return;
    }

    const collectionName = payload.collection ? payload.collection : "";
    const modeName = payload.mode ? payload.mode : "";
    const per = await exportDtcg({
        format: "perMode",
        styleDictionary,
        flatTokens,
    });

    const prettyExact = `${collectionName} - ${modeName}.json`;
    const prettyLoose = `${collectionName} - ${modeName}`;
    const legacy1 = `${collectionName}_mode=${modeName}`;
    const legacy2 = `${collectionName}/mode=${modeName}`;
    const legacy3 = safeKeyFromCollectionAndMode(collectionName, modeName);

    let picked = per.files.find((f) => {
        const n = String(f?.name || "");
        return (
            n === prettyExact ||
            n === prettyLoose ||
            n.includes(`${collectionName} - ${modeName}`)
        );
    });
    if (!picked) {
        picked = per.files.find((f) => {
            const n = String(f?.name || "");
            return (
                n.includes(legacy1) ||
                n.includes(legacy2) ||
                n.includes(legacy3)
            );
        });
    }

    const filesToSend = picked ? [picked] : per.files;
    if (!picked) {
        send({
            type: "INFO",
            payload: {
                message: `Export: pretty file not found for "${collectionName}" / "${modeName}". Falling back to all per-mode files.`,
            },
        });
    }
    send({ type: "EXPORT_RESULT", payload: { files: filesToSend } });
}

// Convert local text styles into typography tokens and surface the preview payload to the UI.
async function handleExportTypography(_msg: UiToPlugin): Promise<void> {
    const result = await exportDtcg({ format: "typography" });
    send({ type: "EXPORT_RESULT", payload: { files: result.files } });
    if (result.files.length > 0) {
        const first = result.files[0];
        send({
            type: "W3C_PREVIEW",
            payload: { name: first.name, json: first.json },
        });
    }
}

// Persist the last selected collection/mode pair so the UI can restore the user's focus.
async function handleSaveLast(msg: UiToPlugin): Promise<void> {
    const payload = (msg as MessageOfType<"SAVE_LAST">).payload;
    if (
        typeof payload.collection === "string" &&
        typeof payload.mode === "string"
    ) {
        await figma.clientStorage.setAsync("lastSelection", {
            collection: payload.collection,
            mode: payload.mode,
        });
    }
}

// Store persistent export preferences (currently the "export all" toggle).
async function handleSavePrefs(msg: UiToPlugin): Promise<void> {
    const payload = (msg as MessageOfType<"SAVE_PREFS">).payload;
    if (typeof payload.exportAll === "boolean") {
        await figma.clientStorage.setAsync(
            "exportAllPref",
            !!payload.exportAll
        );
    }
    if (typeof payload.styleDictionary === "boolean") {
        await figma.clientStorage.setAsync(
            "styleDictionaryPref",
            !!payload.styleDictionary
        );
    }
    if (typeof payload.flatTokens === "boolean") {
        await figma.clientStorage.setAsync(
            "flatTokensPref",
            !!payload.flatTokens
        );
    }
    if (typeof payload.allowHexStrings === "boolean") {
        await figma.clientStorage.setAsync(
            "allowHexPref",
            !!payload.allowHexStrings
        );
    }
    if (typeof payload.githubRememberToken === "boolean") {
        const rememberPref = !!payload.githubRememberToken;
        await figma.clientStorage.setAsync("githubRememberPref", rememberPref);
        if (!rememberPref) {
            await figma.clientStorage
                .deleteAsync("github_token_b64")
                .catch(() => {});
        }
    }
}

// Remember the iframe size so subsequent launches reopen with the user's preferred bounds.
async function handleUiResize(msg: UiToPlugin): Promise<void> {
    const payload = (msg as MessageOfType<"UI_RESIZE">).payload;
    const w = Math.max(720, Math.min(1600, Math.floor(payload.width)));
    const h = Math.max(420, Math.min(1200, Math.floor(payload.height)));
    figma.ui.resize(w, h);
    try {
        await figma.clientStorage.setAsync("uiSize", { width: w, height: h });
    } catch {}
}

// Respond to preview requests by exporting the closest match and pushing it to the W3C preview pane.
async function handlePreviewRequest(msg: UiToPlugin): Promise<void> {
    const payload = (msg as MessageOfType<"PREVIEW_REQUEST">).payload;
    const collectionName = payload.collection ? String(payload.collection) : "";
    const modeName = payload.mode ? String(payload.mode) : "";
    const styleDictionary = !!payload.styleDictionary;
    const flatTokens = !!payload.flatTokens;

    const per = await exportDtcg({
        format: "perMode",
        styleDictionary,
        flatTokens,
    });

    const prettyExact = `${collectionName} - ${modeName}.json`;
    const prettyLoose = `${collectionName} - ${modeName}`;
    const legacy1 = `${collectionName}_mode=${modeName}`;
    const legacy2 = `${collectionName}/mode=${modeName}`;
    const legacy3 = safeKeyFromCollectionAndMode(collectionName, modeName);

    const picked = per.files.find((f) => {
        const n = String(f?.name || "");
        return (
            n === prettyExact ||
            n === prettyLoose ||
            n.includes(`${collectionName} - ${modeName}`)
        );
    }) ||
        per.files.find((f) => {
            const n = String(f?.name || "");
            return (
                n.includes(legacy1) ||
                n.includes(legacy2) ||
                n.includes(legacy3)
            );
        }) ||
        per.files[0] || { name: "tokens-empty.json", json: {} };

    send({
        type: "W3C_PREVIEW",
        payload: { name: picked.name, json: picked.json },
    });
}

const coreHandlers = new Map<UiToPlugin["type"], Handler>([
    ["UI_READY", handleUiReady],
    ["FETCH_COLLECTIONS", handleFetchCollections],
    ["IMPORT_DTCG", handleImportDtcg],
    ["EXPORT_DTCG", handleExportDtcg],
    ["EXPORT_TYPOGRAPHY", handleExportTypography],
    ["SAVE_LAST", handleSaveLast],
    ["SAVE_PREFS", handleSavePrefs],
    ["UI_RESIZE", handleUiResize],
    ["PREVIEW_REQUEST", handlePreviewRequest],
]);

figma.ui.onmessage = async (msg: UiToPlugin) => {
    try {
        const handler = coreHandlers.get(msg.type as UiToPlugin["type"]);
        if (handler) {
            await handler(msg);
            return;
        }

        if (await github.handle(msg)) return;
    } catch (e) {
        let message = "Unknown error";
        if (e && (e as Error).message) message = (e as Error).message;
        figma.notify("Plugin error: " + message, { timeout: 4000 });
        send({ type: "ERROR", payload: { message } });
        // eslint-disable-next-line no-console
        console.error(e);
    }
};
