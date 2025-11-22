// src/app/github/ui/branch.ts
// Branch picker UI: search, pagination, selection, and creation flows.
import type { PluginToUi } from "../../messages";
import type { GithubUiDependencies, AttachContext } from "./types";
import {
    Autocomplete,
    AutocompleteItem,
} from "../../ui/components/autocomplete";
import { h } from "../../ui/dom-helpers";

const BRANCH_TTL_MS = 60_000;
const RENDER_STEP = 200;
const BRANCH_INPUT_PLACEHOLDER = "Search branches…";

export class GithubBranchUi {
    private deps: GithubUiDependencies;
    private doc: Document | null = null;
    private win: Window | null = null;

    // Elements
    private ghBranchInput: HTMLInputElement | null = null;
    private ghBranchClearBtn: HTMLButtonElement | null = null;
    private ghBranchToggleBtn: HTMLButtonElement | null = null;
    private ghBranchMenu: HTMLUListElement | null = null;
    private ghBranchCountEl: HTMLElement | null = null;
    private ghBranchRefreshBtn: HTMLButtonElement | null = null;

    private ghNewBranchBtn: HTMLButtonElement | null = null;
    private ghNewBranchRow: HTMLElement | null = null;
    private ghNewBranchName: HTMLInputElement | null = null;
    private ghCreateBranchConfirmBtn: HTMLButtonElement | null = null;
    private ghCancelBranchBtn: HTMLButtonElement | null = null;

    // Components
    private autocomplete: Autocomplete | null = null;

    // State
    private currentOwner = "";
    private currentRepo = "";
    private desiredBranch: string | null = null;
    private defaultBranchFromApi: string | undefined = undefined;
    private loadedPages = 0;
    private hasMorePages = false;
    private isFetchingBranches = false;
    private lastBranchesFetchedAtMs = 0;

    private allBranches: string[] = [];
    private filteredBranches: string[] = [];
    private renderCount = 0;
    private lastQuery = "";
    private inputPristine = true;

    // Callbacks
    public onBranchChange: ((branch: string) => void) | null = null;

    constructor(deps: GithubUiDependencies) {
        this.deps = deps;
    }

    public attach(context: AttachContext) {
        this.doc = context.document;
        this.win = context.window;

        this.ghBranchInput = this.doc.getElementById(
            "ghBranchInput"
        ) as HTMLInputElement;
        this.ghBranchClearBtn = this.doc.getElementById(
            "ghBranchClearBtn"
        ) as HTMLButtonElement;
        this.ghBranchToggleBtn = this.doc.getElementById(
            "ghBranchToggleBtn"
        ) as HTMLButtonElement;
        this.ghBranchMenu = this.doc.getElementById(
            "ghBranchMenu"
        ) as HTMLUListElement;
        this.ghBranchCountEl = this.doc.getElementById("ghBranchCount");
        this.ghBranchRefreshBtn = this.doc.getElementById(
            "ghBranchRefreshBtn"
        ) as HTMLButtonElement;

        this.ghNewBranchBtn = this.doc.getElementById(
            "ghNewBranchBtn"
        ) as HTMLButtonElement;
        this.ghNewBranchRow = this.doc.getElementById("ghNewBranchRow");
        this.ghNewBranchName = this.doc.getElementById(
            "ghNewBranchName"
        ) as HTMLInputElement;
        this.ghCreateBranchConfirmBtn = this.doc.getElementById(
            "ghCreateBranchConfirmBtn"
        ) as HTMLButtonElement;
        this.ghCancelBranchBtn = this.doc.getElementById(
            "ghCancelBranchBtn"
        ) as HTMLButtonElement;

        if (this.ghBranchInput && this.ghBranchMenu) {
            this.autocomplete = new Autocomplete({
                input: this.ghBranchInput,
                menu: this.ghBranchMenu,
                toggleBtn: this.ghBranchToggleBtn || undefined,
                onQuery: (q) => this.handleQuery(q),
                onSelect: (item, fromKeyboard) =>
                    this.handleSelect(item, fromKeyboard),
                renderItem: (item) => this.renderAutocompleteItem(item),
            });
        }

        this.setupEventListeners();
    }

    public setRepo(owner: string, repo: string) {
        this.currentOwner = owner;
        this.currentRepo = repo;
        this.reset();

        if (owner && repo) {
            this.setBranchDisabled(true, "Loading branches…");
            this.updateBranchCount();
            this.cancelNewBranchFlow(false);

            this.deps.log(`GitHub: loading branches for ${owner}/${repo}…`);
            this.isFetchingBranches = true;
            this.deps.postToPlugin({
                type: "GITHUB_FETCH_BRANCHES",
                payload: { owner, repo, page: 1 },
            });
        } else {
            this.setBranchDisabled(true, "Pick a repository first…");
            this.updateBranchCount();
            this.cancelNewBranchFlow(false);
        }
    }

    public getCurrentBranch(): string {
        if (this.desiredBranch) return this.desiredBranch;
        if (this.ghBranchInput && !this.ghBranchInput.disabled) {
            const raw = this.ghBranchInput.value.trim();
            if (raw && raw !== "__more__" && raw !== "__fetch__") {
                if (
                    this.allBranches.includes(raw) ||
                    raw === this.defaultBranchFromApi
                )
                    return raw;
            }
        }
        return this.defaultBranchFromApi || "";
    }

    public getPrBaseBranch(): string {
        return this.defaultBranchFromApi || "";
    }

    public handleMessage(msg: PluginToUi): boolean {
        if (msg.type === "GITHUB_BRANCHES") {
            const pl = (msg.payload || {}) as Record<string, unknown>;
            const owner = String(pl.owner || "");
            const repo = String(pl.repo || "");
            if (owner !== this.currentOwner || repo !== this.currentRepo)
                return true;

            this.lastBranchesFetchedAtMs = Date.now();
            this.loadedPages = Number(pl.page || 1);
            this.hasMorePages = !!pl.hasMore;
            this.isFetchingBranches = false;

            if (
                typeof pl.defaultBranch === "string" &&
                !this.defaultBranchFromApi
            ) {
                this.defaultBranchFromApi = pl.defaultBranch;
            }

            if (this.ghNewBranchBtn) this.ghNewBranchBtn.disabled = false;

            const names = Array.isArray(pl.branches)
                ? (pl.branches as Array<{ name: string }>).map((b) => b.name)
                : [];
            const set = new Set(this.allBranches);
            for (const n of names) if (n) set.add(n);
            this.allBranches = Array.from(set).sort((a, b) =>
                a.localeCompare(b)
            );

            this.applyBranchFilter();
            this.setBranchDisabled(false);

            this.deps.log(
                `Loaded ${names.length} branches (page ${
                    this.loadedPages
                }) for ${repo}${this.hasMorePages ? "…" : ""}`
            );
            return true;
        }

        if (msg.type === "GITHUB_BRANCHES_ERROR") {
            const pl = (msg.payload || {}) as Record<string, unknown>;
            const owner = String(pl.owner || "");
            const repo = String(pl.repo || "");
            if (owner !== this.currentOwner || repo !== this.currentRepo)
                return true;
            this.isFetchingBranches = false;
            this.setBranchDisabled(false);
            this.deps.log(
                `Branch load failed (status ${pl.status}): ${
                    pl.message || "unknown error"
                }`
            );
            return true;
        }

        if (msg.type === "GITHUB_CREATE_BRANCH_RESULT") {
            this.handleCreateBranchResult(msg.payload);
            return true;
        }

        if (msg.type === "GITHUB_RESTORE_SELECTED") {
            const p = msg.payload || {};
            this.desiredBranch = typeof p.branch === "string" ? p.branch : null;
            if (this.desiredBranch && this.ghBranchInput) {
                this.ghBranchInput.value = this.desiredBranch;
                this.lastQuery = this.desiredBranch;
                this.inputPristine = false;
                this.updateClearButtonVisibility();
                if (this.onBranchChange)
                    this.onBranchChange(this.desiredBranch);
            }
            return false;
        }

        return false;
    }

    public reset() {
        this.desiredBranch = null;
        this.defaultBranchFromApi = undefined;
        this.loadedPages = 0;
        this.hasMorePages = false;
        this.isFetchingBranches = false;
        this.allBranches = [];
        this.filteredBranches = [];
        this.renderCount = 0;
        if (this.ghBranchInput) {
            this.ghBranchInput.value = "";
            this.lastQuery = "";
            this.inputPristine = true;
            this.updateClearButtonVisibility();
        }
        if (this.autocomplete) {
            this.autocomplete.setItems([]);
            this.autocomplete.close();
        }
    }

    private setupEventListeners() {
        // Autocomplete handles input, focus, keydown, menu click, outside click.
        // We only need to handle extra buttons.

        if (this.ghBranchInput) {
            // We still need change event for manual typing + blur/enter without menu interaction
            this.ghBranchInput.addEventListener("change", () => {
                // If autocomplete is open, it might handle selection via Enter.
                // But if user types and tabs out, we want to select.
                const val = this.ghBranchInput!.value;
                if (val && val !== "__more__" && val !== "__fetch__") {
                    this.processBranchSelection(val);
                }
            });
        }

        if (this.ghBranchClearBtn) {
            this.ghBranchClearBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this.ghBranchInput) {
                    this.ghBranchInput.value = "";
                    this.lastQuery = "";
                    this.desiredBranch = null;
                    this.inputPristine = false;
                    this.updateClearButtonVisibility();

                    // Trigger refresh of list (show all)
                    this.handleQuery("");
                    this.ghBranchInput.focus();
                }
            });
        }

        if (this.ghBranchRefreshBtn) {
            this.ghBranchRefreshBtn.addEventListener("click", () => {
                this.lastBranchesFetchedAtMs = 0;
                this.revalidateBranchesIfStale(true);
            });
        }

        if (this.ghNewBranchBtn) {
            this.ghNewBranchBtn.addEventListener("click", () => {
                if (this.ghNewBranchBtn!.disabled) return;
                const next = !this.isNewBranchRowVisible();
                if (next) this.showNewBranchRow(true);
                else this.cancelNewBranchFlow(false);
            });
        }

        if (this.ghNewBranchName) {
            this.ghNewBranchName.addEventListener("keydown", (event) => {
                if (event.key === "Enter") {
                    event.preventDefault();
                    this.requestNewBranchCreation();
                } else if (event.key === "Escape") {
                    event.preventDefault();
                    this.cancelNewBranchFlow(true);
                }
            });
        }

        if (this.ghCreateBranchConfirmBtn) {
            this.ghCreateBranchConfirmBtn.addEventListener("click", () =>
                this.requestNewBranchCreation()
            );
        }

        if (this.ghCancelBranchBtn) {
            this.ghCancelBranchBtn.addEventListener("click", () =>
                this.cancelNewBranchFlow(true)
            );
        }
    }

    private handleQuery(query: string) {
        if (query !== "__more__" && query !== "__fetch__") {
            this.lastQuery = query;
        }
        this.inputPristine = false;
        this.updateClearButtonVisibility();
        this.applyBranchFilter();
    }

    private handleSelect(item: AutocompleteItem, _fromKeyboard: boolean) {
        if (item.value === "__more__") {
            this.renderCount = Math.min(
                this.renderCount + RENDER_STEP,
                this.filteredBranches.length
            );
            this.updateAutocompleteItems();
            this.updateBranchCount();
            if (this.ghBranchInput) this.ghBranchInput.value = this.lastQuery;
            if (this.autocomplete) this.autocomplete.open();
            return;
        }

        if (item.value === "__fetch__") {
            this.ensureNextPageIfNeeded();
            if (this.ghBranchInput) this.ghBranchInput.value = this.lastQuery;
            return;
        }

        this.processBranchSelection(item.value);
        if (this.autocomplete) this.autocomplete.close();
    }

    private revalidateBranchesIfStale(forceLog = false): void {
        if (!this.currentOwner || !this.currentRepo) return;

        const stale = Date.now() - this.lastBranchesFetchedAtMs > BRANCH_TTL_MS;
        if (!stale) {
            if (forceLog)
                this.deps.log("Branches are up to date (no refresh needed).");
            return;
        }

        this.desiredBranch = this.desiredBranch || null;
        this.defaultBranchFromApi = undefined;
        this.loadedPages = 0;
        this.hasMorePages = false;
        this.isFetchingBranches = true;
        this.allBranches = [];
        this.filteredBranches = [];
        this.renderCount = 0;

        this.setBranchDisabled(true, "Refreshing branches…");
        this.updateBranchCount();
        if (this.ghBranchInput) {
            this.ghBranchInput.value = "";
            this.lastQuery = "";
            this.inputPristine = true;
        }
        this.deps.log("Refreshing branches…");

        this.deps.postToPlugin({
            type: "GITHUB_FETCH_BRANCHES",
            payload: {
                owner: this.currentOwner,
                repo: this.currentRepo,
                page: 1,
            },
        });
    }

    private updateClearButtonVisibility(): void {
        if (this.ghBranchClearBtn) {
            const hasText = !!(
                this.ghBranchInput && this.ghBranchInput.value.trim()
            );
            this.ghBranchClearBtn.hidden = !hasText;
        }
    }

    private setBranchDisabled(disabled: boolean, placeholder?: string): void {
        const nextPlaceholder =
            placeholder !== undefined ? placeholder : BRANCH_INPUT_PLACEHOLDER;
        if (this.ghBranchInput) {
            this.ghBranchInput.disabled = disabled;
            this.ghBranchInput.placeholder = nextPlaceholder;
            if (disabled) {
                this.ghBranchInput.value = "";
                this.lastQuery = "";
                this.inputPristine = true;
            }
        }
        if (this.ghBranchToggleBtn) {
            this.ghBranchToggleBtn.disabled = disabled;
            this.ghBranchToggleBtn.setAttribute("aria-expanded", "false");
        }
        if (disabled && this.autocomplete) this.autocomplete.close();
    }

    private updateBranchCount(): void {
        if (!this.ghBranchCountEl) return;
        const total = this.allBranches.length;
        const showing = this.filteredBranches.length;
        this.ghBranchCountEl.textContent = `${showing} / ${total}${
            this.hasMorePages ? " +" : ""
        }`;
    }

    private applyBranchFilter(): void {
        const rawInput = (this.ghBranchInput?.value || "").trim();
        const raw =
            rawInput === "__more__" || rawInput === "__fetch__"
                ? this.lastQuery.trim()
                : rawInput;
        const q = raw.toLowerCase();

        const effectiveQuery = q;
        this.filteredBranches = effectiveQuery
            ? this.allBranches.filter((n) =>
                  n.toLowerCase().includes(effectiveQuery)
              )
            : [...this.allBranches];

        this.renderCount = Math.min(RENDER_STEP, this.filteredBranches.length);
        this.updateAutocompleteItems();
        this.updateBranchCount();
    }

    private updateAutocompleteItems() {
        if (!this.autocomplete) return;

        const items: AutocompleteItem[] = [];
        const slice = this.filteredBranches.slice(0, this.renderCount);

        if (slice.length > 0) {
            for (const name of slice) {
                items.push({
                    key: name,
                    label: name,
                    value: name,
                    type: "option",
                });
            }
        } else {
            items.push({
                key: "__empty__",
                label: this.allBranches.length
                    ? "No matching branches"
                    : "No branches loaded yet",
                value: "",
                type: "info",
                disabled: true,
            });
        }

        if (this.filteredBranches.length > this.renderCount) {
            items.push({
                key: "__more__",
                label: `Load more… (${
                    this.filteredBranches.length - this.renderCount
                } more)`,
                value: "__more__",
                type: "action",
            });
        } else if (this.hasMorePages) {
            items.push({
                key: "__fetch__",
                label: "Load next page…",
                value: "__fetch__",
                type: "action",
            });
        }

        this.autocomplete.setItems(items);
    }

    private renderAutocompleteItem(item: AutocompleteItem): HTMLElement {
        if (item.type === "info") {
            return h(
                "li",
                {
                    className: "gh-branch-item gh-branch-item-empty",
                    "aria-disabled": "true",
                },
                item.label
            );
        }
        if (item.type === "action") {
            return h(
                "li",
                {
                    className: "gh-branch-item gh-branch-item-action",
                },
                item.label
            );
        }
        return h(
            "li",
            {
                className: "gh-branch-item",
            },
            item.label
        );
    }

    private processBranchSelection(value: string): void {
        const val = (value || "").trim();
        if (!val) return;
        if (!this.ghBranchInput) return;

        this.desiredBranch = val;
        this.lastQuery = val;
        this.ghBranchInput.value = val;
        this.inputPristine = false;
        this.updateClearButtonVisibility();

        this.deps.postToPlugin({
            type: "GITHUB_SELECT_BRANCH",
            payload: {
                owner: this.currentOwner,
                repo: this.currentRepo,
                branch: val,
            },
        });

        this.applyBranchFilter();

        if (this.onBranchChange) this.onBranchChange(val);
    }

    private ensureNextPageIfNeeded(): void {
        if (!this.ghBranchInput) return;
        if (!this.hasMorePages || this.isFetchingBranches) return;
        if (!this.currentOwner || !this.currentRepo) return;

        this.isFetchingBranches = true;
        this.deps.postToPlugin({
            type: "GITHUB_FETCH_BRANCHES",
            payload: {
                owner: this.currentOwner,
                repo: this.currentRepo,
                page: this.loadedPages + 1,
            },
        });
    }

    // New Branch Flow
    private showNewBranchRow(show: boolean): void {
        if (!this.ghNewBranchRow) return;
        this.ghNewBranchRow.style.display = show ? "flex" : "none";
        if (show && this.ghNewBranchName) {
            if (!this.ghNewBranchName.value) {
                this.ghNewBranchName.value = `tokens/update-${new Date()
                    .toISOString()
                    .replace(/[:.]/g, "-")
                    .slice(0, 19)}`;
            }
            this.ghNewBranchName.focus();
            this.ghNewBranchName.select();
        }
    }

    private isNewBranchRowVisible(): boolean {
        if (!this.ghNewBranchRow) return false;
        return this.ghNewBranchRow.style.display !== "none";
    }

    private cancelNewBranchFlow(refocusBtn: boolean): void {
        this.showNewBranchRow(false);
        if (this.ghNewBranchName) this.ghNewBranchName.value = "";
        if (refocusBtn && this.ghNewBranchBtn) this.ghNewBranchBtn.focus();
    }

    private requestNewBranchCreation(): void {
        if (
            !this.ghCreateBranchConfirmBtn ||
            this.ghCreateBranchConfirmBtn.disabled
        )
            return;
        if (!this.currentOwner || !this.currentRepo) {
            this.deps.log("Pick a repository before creating a branch.");
            return;
        }
        const baseBranch = this.defaultBranchFromApi || "";
        if (!baseBranch) {
            this.deps.log(
                "GitHub: Unable to determine the repository default branch. Refresh branches first."
            );
            return;
        }
        const newBranch = (this.ghNewBranchName?.value || "").trim();
        if (!newBranch) {
            this.deps.log("Enter a branch name to create.");
            if (this.ghNewBranchName) this.ghNewBranchName.focus();
            return;
        }
        if (newBranch === baseBranch) {
            this.deps.log(
                "Enter a branch name that differs from the source branch."
            );
            if (this.ghNewBranchName) this.ghNewBranchName.focus();
            return;
        }

        this.ghCreateBranchConfirmBtn.disabled = true;
        this.deps.log(`GitHub: creating ${newBranch} from ${baseBranch}…`);
        this.deps.postToPlugin({
            type: "GITHUB_CREATE_BRANCH",
            payload: {
                owner: this.currentOwner,
                repo: this.currentRepo,
                baseBranch,
                newBranch,
            },
        });
    }

    private handleCreateBranchResult(payload: unknown) {
        const pl = (payload || {}) as Record<string, unknown>;
        if (this.ghCreateBranchConfirmBtn)
            this.ghCreateBranchConfirmBtn.disabled = false;
        if (typeof pl.ok !== "boolean") return;

        if (pl.ok) {
            const baseBranch = String(pl.baseBranch || "");
            const newBranch = String(pl.newBranch || "");
            const url = String(pl.html_url || "");

            if (newBranch) {
                const s = new Set(this.allBranches);
                if (!s.has(newBranch)) {
                    s.add(newBranch);
                    this.allBranches = Array.from(s).sort((a, b) =>
                        a.localeCompare(b)
                    );
                }
                this.desiredBranch = newBranch;
                if (this.ghBranchInput) {
                    this.ghBranchInput.value = newBranch;
                    this.lastQuery = newBranch;
                    this.inputPristine = false;
                }
                this.applyBranchFilter();
            }

            this.showNewBranchRow(false);
            if (this.ghNewBranchName) this.ghNewBranchName.value = "";

            if (url) {
                this.deps.log(
                    `Branch created: ${newBranch} (from ${baseBranch})`
                );
                const logEl = this.deps.getLogElement();
                if (logEl && this.doc) {
                    const wrap = h(
                        "div",
                        null,
                        h(
                            "a",
                            { href: url, target: "_blank" },
                            "View on GitHub"
                        )
                    );
                    logEl.appendChild(wrap);
                    (logEl as HTMLElement).scrollTop = (
                        logEl as HTMLElement
                    ).scrollHeight;
                }
            } else {
                this.deps.log(
                    `Branch created: ${newBranch} (from ${baseBranch})`
                );
            }

            if (this.onBranchChange && newBranch)
                this.onBranchChange(newBranch);
        } else {
            const status = pl.status ?? 0;
            const message = pl.message || "unknown error";
            this.deps.log(
                `Create branch failed (status ${status}): ${message}`
            );
            if (pl.samlRequired) {
                this.deps.log(
                    "This org requires SSO. Open the repo in your browser and authorize SSO for your token."
                );
            } else if (status === 403) {
                if (pl.noPushPermission) {
                    this.deps.log(
                        "You do not have push permission to this repository. Ask a maintainer for write access."
                    );
                } else {
                    this.deps.log("Likely a token permission issue:");
                    this.deps.log(
                        '• Classic PAT: add the "repo" scope (or "public_repo" for public repos).'
                    );
                    this.deps.log(
                        '• Fine-grained PAT: grant this repository and set "Contents: Read and write".'
                    );
                }
            }
        }
    }
}
