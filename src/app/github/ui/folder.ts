// src/app/github/ui/folder.ts
// Folder picker UI for browsing and selecting repository paths.
import type { PluginToUi } from "../../messages";
import type {
    GithubUiDependencies,
    AttachContext,
    FolderListEntry,
} from "./types";
import { h } from "../../ui/dom-helpers";

const GH_FOLDER_PLACEHOLDER = "Path in repository…";
type FolderPickerState = {
    isOpen: boolean;
    currentPath: string;
    lastFocus: HTMLElement | null;
    refreshNonce: number;
};

export class GithubFolderUi {
    private deps: GithubUiDependencies;
    private doc: Document | null = null;
    private win: Window | null = null;

    // Elements
    private ghFolderInput: HTMLInputElement | null = null;
    private ghFolderDisplay: HTMLElement | null = null;
    private ghPickFolderBtn: HTMLButtonElement | null = null;

    private folderPickerOverlay: HTMLElement | null = null;
    private folderPickerTitleEl: HTMLElement | null = null;
    private folderPickerPathInput: HTMLInputElement | null = null;
    private folderPickerUseBtn: HTMLButtonElement | null = null;
    private folderPickerListEl: HTMLElement | null = null;
    private folderPickerCancelBtn: HTMLButtonElement | null = null;

    // State
    private currentOwner = "";
    private currentRepo = "";
    private currentBranch = "";

    private pickerState: FolderPickerState = {
        isOpen: false,
        currentPath: "",
        lastFocus: null,
        refreshNonce: 0,
    };

    private folderListWaiters: Array<{
        path: string;
        resolve: (v: { ok: true; entries: FolderListEntry[] }) => void;
        reject: (v: { ok: false; message: string; status?: number }) => void;
    }> = [];

    private folderCreateWaiters: Array<{
        folderPath: string;
        resolve: (v: { ok: true }) => void;
        reject: (v: { ok: false; message: string; status?: number }) => void;
    }> = [];

    // Callbacks
    public onFolderChange: ((folder: string) => void) | null = null;

    constructor(deps: GithubUiDependencies) {
        this.deps = deps;
    }

    public attach(context: AttachContext) {
        this.doc = context.document;
        this.win = context.window;

        this.ghFolderInput = this.doc.getElementById(
            "ghFolderInput"
        ) as HTMLInputElement;
        this.ghFolderDisplay = this.doc.getElementById("ghFolderDisplay");
        this.setGhFolderDisplay(this.ghFolderInput?.value || "");
        this.ghPickFolderBtn = this.doc.getElementById(
            "ghPickFolderBtn"
        ) as HTMLButtonElement;

        this.folderPickerOverlay = this.doc.getElementById(
            "folderPickerOverlay"
        );
        this.folderPickerTitleEl = this.doc.getElementById("folderPickerTitle");
        this.folderPickerPathInput = this.doc.getElementById(
            "folderPickerPath"
        ) as HTMLInputElement;
        this.folderPickerUseBtn = this.doc.getElementById(
            "folderPickerUseBtn"
        ) as HTMLButtonElement;
        this.folderPickerListEl = this.doc.getElementById("folderPickerList");
        this.folderPickerCancelBtn = this.doc.getElementById(
            "folderPickerCancelBtn"
        ) as HTMLButtonElement;

        this.setupEventListeners();
    }

    public setContext(owner: string, repo: string, branch: string) {
        this.currentOwner = owner;
        this.currentRepo = repo;
        this.currentBranch = branch;
        this.updateFolderControlsEnabled();
    }

    public reset() {
        this.setGhFolderDisplay("");
        this.pickerState.isOpen = false;
        this.pickerState.currentPath = "";
        this.pickerState.refreshNonce++;
        this.folderListWaiters = [];
        this.folderCreateWaiters = [];
        if (this.folderPickerOverlay) {
            this.folderPickerOverlay.classList.remove("is-open");
            this.folderPickerOverlay.setAttribute("aria-hidden", "true");
            this.folderPickerOverlay.hidden = true;
        }
    }

    public getFolder(): string {
        const raw = this.ghFolderInput ? this.ghFolderInput.value.trim() : "";
        return this.normalizeFolderInput(raw).payload;
    }

    public setFolder(path: string) {
        const normalized = this.normalizeFolderInput(path);
        this.setGhFolderDisplay(normalized.display);
    }

    public handleMessage(msg: PluginToUi): boolean {
        if (msg.type === "GITHUB_FOLDER_LIST_RESULT") {
            const pl = msg.payload;
            const path = String(pl.path || "").replace(/^\/+|\/+$/g, "");
            const ok = pl.ok;
            let entries: FolderListEntry[] = [];
            let message = "";
            let status: number | undefined;

            if (pl.ok) {
                entries = pl.entries;
            } else {
                message = pl.message;
                status = pl.status;
            }

            for (let i = 0; i < this.folderListWaiters.length; i++) {
                if (this.folderListWaiters[i].path === path) {
                    const waiter = this.folderListWaiters.splice(i, 1)[0];
                    if (ok) waiter.resolve({ ok: true, entries });
                    else
                        waiter.reject({
                            ok: false,
                            message: message || `HTTP ${status || 0}`,
                            status: status,
                        });
                    break;
                }
            }
            return true;
        }

        if (msg.type === "GITHUB_CREATE_FOLDER_RESULT") {
            const pl = msg.payload;
            const fp = String(pl.folderPath || "").replace(/^\/+|\/+$/g, "");
            const ok = pl.ok;
            let message = "";
            let status: number | undefined;

            if (!pl.ok) {
                message = pl.message;
                status = pl.status;
            }

            for (let i = 0; i < this.folderCreateWaiters.length; i++) {
                if (this.folderCreateWaiters[i].folderPath === fp) {
                    const waiter = this.folderCreateWaiters.splice(i, 1)[0];
                    if (ok) waiter.resolve({ ok: true });
                    else
                        waiter.reject({
                            ok: false,
                            message: message || `HTTP ${status || 0}`,
                            status: status,
                        });
                    break;
                }
            }
            return true;
        }

        if (msg.type === "GITHUB_RESTORE_SELECTED") {
            const p = msg.payload || {};
            if (typeof p.folder === "string") {
                const normalized = this.normalizeFolderInput(p.folder);
                this.setGhFolderDisplay(normalized.display);
                if (this.onFolderChange)
                    this.onFolderChange(normalized.payload);
            }
            return false;
        }

        return false;
    }

    private setupEventListeners() {
        if (this.ghPickFolderBtn) {
            this.ghPickFolderBtn.addEventListener("click", () =>
                this.openFolderPicker()
            );
        }

        if (this.folderPickerOverlay) {
            this.folderPickerOverlay.addEventListener("click", (event) => {
                if (event.target === this.folderPickerOverlay)
                    this.closeFolderPicker();
            });
            // Prevent clicks inside the overlay content from bubbling to the overlay close handler if they originated there
            // (Though the check above handles it, sometimes structure makes it tricky)
        }

        if (this.folderPickerCancelBtn) {
            this.folderPickerCancelBtn.addEventListener("click", () =>
                this.closeFolderPicker()
            );
        }

        let folderPickerPathDebounce: number | undefined;
        if (this.folderPickerPathInput) {
            this.folderPickerPathInput.addEventListener("input", () => {
                if (folderPickerPathDebounce)
                    this.win?.clearTimeout(folderPickerPathDebounce);
                const value = this.folderPickerPathInput!.value;
                folderPickerPathDebounce = this.win?.setTimeout(() => {
                    this.setFolderPickerPath(value, true, false);
                }, 120) as number | undefined;
            });
            this.folderPickerPathInput.addEventListener("keydown", (event) => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    this.setFolderPickerPath(this.folderPickerPathInput!.value);
                }
            });
            // Removed blur listener to prevent race condition with list item clicks
            // and to prevent closing/refreshing when selecting text.
            this.folderPickerPathInput.addEventListener("click", (e) =>
                e.stopPropagation()
            );
            this.folderPickerPathInput.addEventListener("mousedown", (e) =>
                e.stopPropagation()
            );
        }

        if (this.folderPickerUseBtn) {
            this.folderPickerUseBtn.addEventListener("click", () => {
                if (this.folderPickerPathInput) {
                    this.setFolderPickerPath(
                        this.folderPickerPathInput.value,
                        false
                    );
                }
                const selectionRaw = this.pickerState.currentPath
                    ? `${this.pickerState.currentPath}/`
                    : "/";
                const normalized = this.normalizeFolderInput(selectionRaw);
                this.setGhFolderDisplay(normalized.display);

                this.deps.postToPlugin({
                    type: "GITHUB_SET_FOLDER",
                    payload: {
                        owner: this.currentOwner,
                        repo: this.currentRepo,
                        folder: normalized.payload,
                    },
                });

                this.closeFolderPicker();
                this.deps.log(
                    `Folder selected: ${
                        normalized.display === "/"
                            ? "(repo root)"
                            : normalized.display
                    }`
                );

                if (this.onFolderChange)
                    this.onFolderChange(normalized.payload);
            });
        }

        if (this.doc) {
            this.doc.addEventListener("keydown", (e) =>
                this.handleFolderPickerKeydown(e)
            );
        }
    }

    private normalizeFolderInput(raw: string): {
        display: string;
        payload: string;
    } {
        const trimmed = raw.trim();
        if (!trimmed) return { display: "", payload: "" };

        if (trimmed === "/" || trimmed === "./" || trimmed === ".") {
            return { display: "/", payload: "/" };
        }

        const collapsed = trimmed.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
        const stripped = collapsed.replace(/^\/+/, "").replace(/\/+$/, "");
        if (!stripped) return { display: "/", payload: "/" };
        return { display: stripped + "/", payload: stripped };
    }

    private normalizeFolderPickerPath(raw: string): string {
        const trimmed = (raw || "").trim();
        if (!trimmed || trimmed === "/" || trimmed === "./" || trimmed === ".")
            return "";
        const collapsed = trimmed.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
        return collapsed.replace(/^\/+/, "").replace(/\/+$/, "");
    }

    private setGhFolderDisplay(display: string): void {
        if (this.ghFolderInput) this.ghFolderInput.value = display || "";
        if (!this.ghFolderDisplay) return;
        if (display) {
            this.ghFolderDisplay.textContent = display;
            this.ghFolderDisplay.classList.remove("is-placeholder");
        } else {
            this.ghFolderDisplay.textContent = GH_FOLDER_PLACEHOLDER;
            this.ghFolderDisplay.classList.add("is-placeholder");
        }
    }

    private updateFolderControlsEnabled(): void {
        const enable = !!(
            this.currentOwner &&
            this.currentRepo &&
            this.currentBranch
        );
        if (this.ghPickFolderBtn) this.ghPickFolderBtn.disabled = !enable;
    }

    private listDir(
        path: string
    ): Promise<
        | { ok: true; entries: FolderListEntry[] }
        | { ok: false; message: string; status?: number }
    > {
        return new Promise((resolve) => {
            const req = { path: path.replace(/^\/+|\/+$/g, "") };
            this.folderListWaiters.push({
                path: req.path,
                resolve: (v) => resolve(v),
                reject: (v) => resolve(v),
            });
            this.deps.postToPlugin({
                type: "GITHUB_FOLDER_LIST",
                payload: {
                    owner: this.currentOwner,
                    repo: this.currentRepo,
                    branch: this.currentBranch,
                    path: req.path,
                },
            });
        });
    }

    private openFolderPicker(): void {
        if (!this.currentOwner || !this.currentRepo) {
            this.deps.log("Pick a repository first.");
            return;
        }
        if (!this.currentBranch) {
            this.deps.log("Pick a branch first.");
            return;
        }
        if (
            !(
                this.folderPickerOverlay &&
                this.folderPickerTitleEl &&
                this.folderPickerPathInput &&
                this.folderPickerListEl
            )
        ) {
            this.deps.log("Folder picker UI is unavailable.");
            return;
        }

        this.pickerState.lastFocus =
            this.doc && this.doc.activeElement instanceof HTMLElement
                ? this.doc.activeElement
                : null;

        this.folderPickerOverlay.hidden = false;
        this.folderPickerOverlay.classList.add("is-open");
        this.folderPickerOverlay.setAttribute("aria-hidden", "false");
        this.pickerState.isOpen = true;

        this.updateFolderPickerTitle(this.currentBranch);

        const startNormalized = this.normalizeFolderInput(
            this.ghFolderInput?.value || ""
        );
        const startPath =
            startNormalized.payload === "/" ? "" : startNormalized.payload;
        this.setFolderPickerPath(startPath, true);

        this.win?.setTimeout(() => {
            this.folderPickerPathInput?.focus();
            this.folderPickerPathInput?.select();
        }, 0);
    }

    private closeFolderPicker(): void {
        if (!this.folderPickerOverlay) return;
        this.folderPickerOverlay.classList.remove("is-open");
        this.folderPickerOverlay.setAttribute("aria-hidden", "true");
        this.folderPickerOverlay.hidden = true;
        this.pickerState.isOpen = false;
        this.pickerState.currentPath = "";
        this.pickerState.refreshNonce++;
        if (this.folderPickerListEl) {
            this.folderPickerListEl.replaceChildren(
                this.createFolderPickerRow("Loading…", {
                    muted: true,
                    disabled: true,
                })
            );
        }
        if (
            this.pickerState.lastFocus &&
            this.doc?.contains(this.pickerState.lastFocus)
        ) {
            this.pickerState.lastFocus.focus();
        }
        this.pickerState.lastFocus = null;
    }

    private createFolderPickerRow(
        label: string,
        options?: { onClick?: () => void; muted?: boolean; disabled?: boolean }
    ): HTMLElement {
        const props: Record<string, unknown> = {
            className: `folder-picker-row ${options?.muted ? "is-muted" : ""}`,
            type: "button",
        };

        if (options?.disabled) props.disabled = true;
        if (options?.onClick) {
            props.onmousedown = (event: MouseEvent) => {
                event.preventDefault();
                event.stopPropagation();
                options.onClick?.();
            };
        }

        return h("button", props, label);
    }

    private updateFolderPickerTitle(branch: string): void {
        if (!this.folderPickerTitleEl) return;
        if (this.currentOwner && this.currentRepo) {
            this.folderPickerTitleEl.textContent = `${this.currentOwner}/${this.currentRepo} @ ${branch}`;
        } else {
            this.folderPickerTitleEl.textContent = "Select a repository first";
        }
    }

    private setFolderPickerPath(
        raw: string,
        refresh = true,
        syncInput = true
    ): void {
        const normalized = this.normalizeFolderPickerPath(raw);
        this.pickerState.currentPath = normalized;
        if (syncInput && this.folderPickerPathInput)
            this.folderPickerPathInput.value = normalized;
        if (refresh && this.pickerState.isOpen) {
            void this.refreshFolderPickerList();
        }
    }

    private async refreshFolderPickerList(): Promise<void> {
        if (!(this.folderPickerListEl && this.pickerState.isOpen)) return;
        const listEl = this.folderPickerListEl;
        const requestId = ++this.pickerState.refreshNonce;

        listEl.replaceChildren(
            this.createFolderPickerRow("Loading…", {
                muted: true,
                disabled: true,
            })
        );

        const path = this.pickerState.currentPath;
        const res = await this.listDir(path);
        if (requestId !== this.pickerState.refreshNonce) return;

        if (!res.ok) {
            const status = typeof res.status === "number" ? res.status : 0;
            if (status === 404) {
                listEl.replaceChildren(
                    this.createFolderPickerRow(
                        "Folder not found. It will be created during export.",
                        { muted: true, disabled: true }
                    )
                );
                return;
            }
            if (status === 409) {
                listEl.replaceChildren(
                    this.createFolderPickerRow(
                        "Cannot open this path: an existing file blocks the folder.",
                        { muted: true, disabled: true }
                    )
                );
                return;
            }
            const message = res.message ? res.message : "failed to fetch";
            listEl.replaceChildren(
                this.createFolderPickerRow(`Error: ${message}`, {
                    muted: true,
                    disabled: true,
                })
            );
            return;
        }

        const nodes: HTMLElement[] = [];
        if (path) {
            nodes.push(
                this.createFolderPickerRow(".. (up one level)", {
                    muted: true,
                    onClick: () => {
                        const parentParts = this.pickerState.currentPath
                            .split("/")
                            .filter(Boolean);
                        parentParts.pop();
                        this.setFolderPickerPath(parentParts.join("/"));
                    },
                })
            );
        }

        const entries = Array.isArray(res.entries) ? res.entries : [];

        const dirs = entries
            .filter((e) => e.type === "dir")
            .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        if (dirs.length === 0) {
            nodes.push(
                this.createFolderPickerRow("(no subfolders)", {
                    muted: true,
                    disabled: true,
                })
            );
        } else {
            for (const d of dirs) {
                const name = d.name || "";
                nodes.push(
                    this.createFolderPickerRow(`${name}/`, {
                        onClick: () => {
                            const next = this.pickerState.currentPath
                                ? `${this.pickerState.currentPath}/${name}`
                                : name;
                            this.setFolderPickerPath(next);
                        },
                    })
                );
            }
        }

        listEl.replaceChildren(...nodes);
    }

    private handleFolderPickerKeydown(event: KeyboardEvent): void {
        if (!this.pickerState.isOpen) return;
        if (event.key === "Escape") {
            event.preventDefault();
            this.closeFolderPicker();
        }
    }
}
