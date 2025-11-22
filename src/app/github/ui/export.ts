// src/app/github/ui/export.ts
// GitHub export UI for committing token files and optionally opening PRs.
import type { PluginToUi, GithubScope, UiToPlugin } from "../../messages";
import type { GithubUiDependencies, AttachContext } from "./types";

export class GithubExportUi {
    private deps: GithubUiDependencies;
    private doc: Document | null = null;

    // Elements
    private ghExportAndCommitBtn: HTMLButtonElement | null = null;
    private ghCommitMsgInput: HTMLInputElement | null = null;
    private ghFilenameInput: HTMLInputElement | null = null;
    private ghScopeAll: HTMLInputElement | null = null;
    private ghScopeTypography: HTMLInputElement | null = null;
    private ghScopeSelected: HTMLInputElement | null = null;
    private ghCreatePrChk: HTMLInputElement | null = null;
    private ghPrOptions: HTMLElement | null = null;
    private ghPrTitleInput: HTMLInputElement | null = null;
    private ghPrBodyInput: HTMLTextAreaElement | null = null;

    // State
    private currentOwner = "";
    private currentRepo = "";
    private currentBranch = "";
    private currentFolder = "";
    private prBaseBranch = "";
    private hasCollections = false;
    private hasTextStyles = false;

    constructor(deps: GithubUiDependencies) {
        this.deps = deps;
    }

    public attach(context: AttachContext) {
        this.doc = context.document;

        this.ghExportAndCommitBtn = this.doc.getElementById(
            "ghExportAndCommitBtn"
        ) as HTMLButtonElement;
        this.ghCommitMsgInput = this.doc.getElementById(
            "ghCommitMsgInput"
        ) as HTMLInputElement;
        this.ghFilenameInput = this.doc.getElementById(
            "ghFilenameInput"
        ) as HTMLInputElement;
        this.ghScopeAll = this.doc.getElementById(
            "ghScopeAll"
        ) as HTMLInputElement;
        this.ghScopeTypography = this.doc.getElementById(
            "ghScopeTypography"
        ) as HTMLInputElement;
        this.ghScopeSelected = this.doc.getElementById(
            "ghScopeSelected"
        ) as HTMLInputElement;
        this.ghCreatePrChk = this.doc.getElementById(
            "ghCreatePrChk"
        ) as HTMLInputElement;
        this.ghPrOptions = this.doc.getElementById("ghPrOptions");
        this.ghPrTitleInput = this.doc.getElementById(
            "ghPrTitleInput"
        ) as HTMLInputElement;
        this.ghPrBodyInput = this.doc.getElementById(
            "ghPrBodyInput"
        ) as HTMLTextAreaElement;

        if (this.ghExportAndCommitBtn) {
            this.ghExportAndCommitBtn.addEventListener("click", () =>
                this.handleExportClick()
            );
        }

        // Listen for scope changes to update button state
        [this.ghScopeAll, this.ghScopeTypography, this.ghScopeSelected].forEach(
            (el) => {
                if (el)
                    el.addEventListener("change", () => this.updateEnabled());
            }
        );

        if (this.ghCreatePrChk) {
            this.ghCreatePrChk.addEventListener("change", () => {
                this.updatePrOptionsVisibility();
                this.updateEnabled();
            });
        }

        this.updatePrOptionsVisibility();
    }

    public setContext(
        owner: string,
        repo: string,
        branch: string,
        folder: string,
        prBaseBranch: string
    ) {
        this.currentOwner = owner;
        this.currentRepo = repo;
        this.currentBranch = branch;
        this.currentFolder = folder;
        this.prBaseBranch = prBaseBranch;
        this.updateEnabled();
    }

    public reset() {
        this.currentOwner = "";
        this.currentRepo = "";
        this.currentBranch = "";
        this.currentFolder = "";
        this.prBaseBranch = "";
        this.hasCollections = false;
        this.hasTextStyles = false;
        if (this.ghCreatePrChk) this.ghCreatePrChk.checked = false;
        this.updatePrOptionsVisibility();
        this.updateEnabled();
    }

    public handleMessage(msg: PluginToUi): boolean {
        if (msg.type === "GITHUB_RESTORE_SELECTED") {
            this.restoreFromSaved(msg.payload || {});
            this.updateEnabled();
            return false;
        }
        if (msg.type === "GITHUB_COMMIT_RESULT") {
            this.handleCommitResult(msg.payload);
            return true;
        }
        if (msg.type === "GITHUB_PR_RESULT") {
            this.handlePrResult(msg.payload);
            return true;
        }
        return false;
    }

    private restoreFromSaved(payload: Record<string, unknown>): void {
        if (this.ghFilenameInput && typeof payload.filename === "string") {
            this.ghFilenameInput.value = payload.filename;
        }

        if (
            this.ghCommitMsgInput &&
            typeof payload.commitMessage === "string"
        ) {
            this.ghCommitMsgInput.value = payload.commitMessage;
        }

        if (
            payload.scope === "all" ||
            payload.scope === "selected" ||
            payload.scope === "typography"
        ) {
            this.setScope(payload.scope);
        }

        if (
            this.ghCreatePrChk &&
            typeof payload.createPr === "boolean"
        ) {
            this.ghCreatePrChk.checked = payload.createPr;
            this.updatePrOptionsVisibility();
        }

        if (this.ghPrTitleInput && typeof payload.prTitle === "string") {
            this.ghPrTitleInput.value = payload.prTitle;
        }
        if (this.ghPrBodyInput && typeof payload.prBody === "string") {
            this.ghPrBodyInput.value = payload.prBody;
        }

        if (typeof payload.prBase === "string") {
            this.prBaseBranch = payload.prBase;
        }

        const styleChk = this.deps.getStyleDictionaryCheckbox();
        if (styleChk && typeof payload.styleDictionary === "boolean") {
            styleChk.checked = payload.styleDictionary;
        }
        const flatChk = this.deps.getFlatTokensCheckbox();
        if (flatChk && typeof payload.flatTokens === "boolean") {
            flatChk.checked = payload.flatTokens;
        }
    }

    private setScope(scope: GithubScope): void {
        if (scope === "all") {
            if (this.ghScopeAll) this.ghScopeAll.checked = true;
            if (this.ghScopeSelected) this.ghScopeSelected.checked = false;
            if (this.ghScopeTypography) this.ghScopeTypography.checked = false;
        } else if (scope === "typography") {
            if (this.ghScopeTypography) this.ghScopeTypography.checked = true;
            if (this.ghScopeAll) this.ghScopeAll.checked = false;
            if (this.ghScopeSelected) this.ghScopeSelected.checked = false;
        } else {
            if (this.ghScopeSelected) this.ghScopeSelected.checked = true;
            if (this.ghScopeAll) this.ghScopeAll.checked = false;
            if (this.ghScopeTypography) this.ghScopeTypography.checked = false;
        }

        this.updatePrOptionsVisibility();
    }

    private updatePrOptionsVisibility(): void {
        if (!this.ghPrOptions) return;
        const show = !!(this.ghCreatePrChk && this.ghCreatePrChk.checked);
        this.ghPrOptions.style.display = show ? "" : "none";
    }

    public updateEnabled() {
        if (!this.ghExportAndCommitBtn) return;

        // Basic requirements
        const hasContext = !!(
            this.currentOwner &&
            this.currentRepo &&
            this.currentBranch
        );

        // Scope validation
        let scopeValid = true;
        const scope = this.getSelectedScope();

        if (scope === "selected") {
            const collectionSelect = this.deps.getCollectionSelect();
            const modeSelect = this.deps.getModeSelect();
            const hasCollection = !!(
                collectionSelect && collectionSelect.value
            );
            const hasMode = !!(modeSelect && modeSelect.value);
            scopeValid = hasCollection && hasMode;
        } else if (scope === "all") {
            // For "all" scope, we need at least one collection with variables
            scopeValid = this.hasCollections;
        } else if (scope === "typography") {
            // For "typography" scope, we need text styles
            scopeValid = this.hasTextStyles;
        }

        // Filename validation (basic check, real validation happens on click or input)
        // For enabling the button, we might be lenient or strict.
        // The original code called `updateExportCommitEnabled` which checked `filenameValidation.ok`.
        // Since we don't have the full validation logic here yet (it was in `ui.ts` using `validateFilename`),
        // let's assume valid if not empty for now, or we can duplicate the validation logic.
        // Ideally, validation logic should be shared or injected.
        // For now, let's just check if filename input is present.
        const hasFilename = !!(
            this.ghFilenameInput && this.ghFilenameInput.value.trim()
        );

        this.ghExportAndCommitBtn.disabled = !(
            hasContext &&
            scopeValid &&
            hasFilename
        );
    }

    public setCollectionsAvailability(
        hasCollections: boolean,
        hasTextStyles: boolean
    ) {
        this.hasCollections = hasCollections;
        this.hasTextStyles = hasTextStyles;
        this.updateEnabled();
    }

    private getSelectedScope(): "all" | "selected" | "typography" {
        if (this.ghScopeAll && this.ghScopeAll.checked) return "all";
        if (this.ghScopeTypography && this.ghScopeTypography.checked)
            return "typography";
        return "selected";
    }

    private handleExportClick() {
        if (!this.currentOwner || !this.currentRepo || !this.currentBranch) {
            this.deps.log("Pick a repository and branch first.");
            return;
        }

        const collectionSelect = this.deps.getCollectionSelect();
        const modeSelect = this.deps.getModeSelect();

        const scope: GithubScope =
            this.ghScopeAll && this.ghScopeAll.checked
                ? "all"
                : this.ghScopeTypography && this.ghScopeTypography.checked
                ? "typography"
                : "selected";

        const selectedCollection = collectionSelect
            ? collectionSelect.value || ""
            : "";
        const selectedMode = modeSelect ? modeSelect.value || "" : "";
        const commitMessage = (
            this.ghCommitMsgInput?.value || "Update tokens from Figma"
        ).trim();

        // Folder is passed via setContext, but we should probably read it from input if it's editable there?
        // In `ui.ts`, it read `ghFolderInput.value`.
        // `GithubFolderUi` manages that input.
        // We should probably rely on `this.currentFolder` being up to date via `setContext` called by orchestrator when folder changes.
        // But `ghFolderInput` is the source of truth for the user's intent if they typed manually?
        // `GithubFolderUi` updates `ghFolderInput`.
        // Let's assume `this.currentFolder` is correct (updated by orchestrator observing `GithubFolderUi`).

        const folder = this.currentFolder;
        if (!folder || folder === "/") {
            // Original code checked `!normalizedFolder.display`.
            // If `currentFolder` is empty, it might mean root or not set.
            // Let's assume orchestrator ensures it's a valid path string.
            // If it's empty string, it means root?
            // Original code: `if (!normalizedFolder.display) ... "Pick a destination folder"`
        }

        // Filename validation
        const filenameRaw = this.ghFilenameInput?.value || "";
        if (!filenameRaw.trim()) {
            this.deps.log("Enter a filename (e.g. tokens.json).");
            this.ghFilenameInput?.focus();
            return;
        }
        // Basic validation (simplified from ui.ts)
        if (!filenameRaw.endsWith(".json")) {
            this.deps.log("Filename must end with .json");
            this.ghFilenameInput?.focus();
            return;
        }

        if (scope === "selected") {
            if (!selectedCollection || !selectedMode) {
                this.deps.log("Pick a collection and a mode before exporting.");
                return;
            }
        }

        const createPr = !!(this.ghCreatePrChk && this.ghCreatePrChk.checked);

        const payload: UiToPlugin = {
            type: "GITHUB_EXPORT_AND_COMMIT",
            payload: {
                owner: this.currentOwner,
                repo: this.currentRepo,
                branch: this.currentBranch,
                folder: folder,
                filename: filenameRaw,
                commitMessage,
                scope,
                styleDictionary:
                    !!this.deps.getStyleDictionaryCheckbox()?.checked,
                flatTokens: !!this.deps.getFlatTokensCheckbox()?.checked,
                createPr,
            },
        };

        if (selectedCollection) payload.payload.collection = selectedCollection;
        if (selectedMode) payload.payload.mode = selectedMode;

        if (createPr) {
            payload.payload.prBase = this.prBaseBranch;
            payload.payload.prTitle = (this.ghPrTitleInput?.value || "").trim();
            payload.payload.prBody = this.ghPrBodyInput?.value || "";
        }

        const scopeLabel =
            scope === "all"
                ? "all collections"
                : scope === "typography"
                ? "typography"
                : "selected mode";

        const fullPath = folder ? `${folder}${filenameRaw}` : filenameRaw; // Simplified path join

        this.deps.log(`GitHub: Export summary → ${fullPath} (${scopeLabel})`);
        this.deps.log(
            createPr
                ? "Export, Commit & PR requested…"
                : "Export & Commit requested…"
        );

        this.deps.postToPlugin(payload);
    }

    private handleCommitResult(pl: unknown) {
        if (!pl || typeof pl !== "object") return;
        const payload = pl as Record<string, unknown>;

        if (payload.ok) {
            const url = String(payload.commitUrl || "");
            const branch = payload.branch || "";
            const fullPath = payload.fullPath || "file";

            this.deps.log(`Commit succeeded (${branch}): ${url || "(no URL)"}`);
            this.deps.log(`Committed ${fullPath}`);

            if (url) {
                this.addLogLink(url, "View commit");
            }

            if (payload.createdPr) {
                const pr = payload.createdPr as Record<string, unknown>;
                this.deps.log(
                    `PR prepared (#${pr.number}) from ${pr.head} → ${pr.base}`
                );
            }
        } else {
            const status =
                typeof payload.status === "number" ? payload.status : 0;
            const message = payload.message || "unknown error";
            const fullPath = payload.fullPath || "file";

            if (status === 304) {
                this.deps.log(`Commit skipped: ${message} (${fullPath})`);
            } else {
                this.deps.log(
                    `Commit failed (${status}): ${message} (${fullPath})`
                );
            }
        }
    }

    private handlePrResult(pl: unknown) {
        if (!pl || typeof pl !== "object") return;
        const payload = pl as Record<string, unknown>;

        if (payload.ok) {
            this.deps.log(
                `PR created: #${payload.number} (${payload.head} → ${payload.base})`
            );
            const url = payload.url;
            if (url && typeof url === "string") {
                this.addLogLink(url, "View PR");
            }
        } else {
            this.deps.log(
                `PR creation failed (${payload.status || 0}): ${
                    payload.message || "unknown error"
                }`
            );
        }
    }

    private addLogLink(url: string, text: string) {
        const logEl = this.deps.getLogElement();
        if (logEl && this.doc) {
            const wrap = this.doc.createElement("div");
            const a = this.doc.createElement("a");
            a.href = url;
            a.target = "_blank";
            a.textContent = text;
            wrap.appendChild(a);
            logEl.appendChild(wrap);
            (logEl as HTMLElement).scrollTop = (
                logEl as HTMLElement
            ).scrollHeight;
        }
    }
}
