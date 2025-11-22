import type { PluginToUi } from "../../messages";
import type { GithubUiDependencies, AttachContext } from "./types";

const BRANCH_TTL_MS = 60_000;
const RENDER_STEP = 200;
const BRANCH_INPUT_PLACEHOLDER = "Search branches…";

type BranchSelectionResult = "selected" | "more" | "fetch" | "noop";

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
    private branchMenuVisible = false;
    private branchHighlightIndex = -1;
    private branchLastQuery = "";
    private branchInputPristine = true;

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

            // Notify change if we auto-selected something (like default branch)
            // But usually we wait for user action.
            // However, if we just loaded, we might want to ensure the UI reflects the default if nothing selected.

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
                this.branchLastQuery = this.desiredBranch;
                this.branchInputPristine = false;
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
            this.branchLastQuery = "";
            this.branchInputPristine = true;
            this.updateClearButtonVisibility();
        }
        if (this.ghBranchMenu)
            while (this.ghBranchMenu.firstChild)
                this.ghBranchMenu.removeChild(this.ghBranchMenu.firstChild);
        this.closeBranchMenu();
    }

    private setupEventListeners() {
        if (this.ghBranchInput) {
            let timeout: number | undefined;
            this.ghBranchInput.addEventListener("focus", () => {
                if (this.ghBranchInput!.disabled) return;
                // Show all branches when focusing (not filtered by current value)
                this.showAllBranches();
                this.openBranchMenu();
            });
            this.ghBranchInput.addEventListener("input", () => {
                if (timeout) this.win?.clearTimeout(timeout);
                const value = this.ghBranchInput!.value;
                if (value !== "__more__" && value !== "__fetch__") {
                    this.branchLastQuery = value;
                }
                this.branchInputPristine = false;
                this.updateClearButtonVisibility();
                if (!this.branchMenuVisible) this.openBranchMenu();
                timeout = this.win?.setTimeout(() => {
                    this.applyBranchFilter();
                }, 120) as number | undefined;
            });
            this.ghBranchInput.addEventListener("keydown", (e: KeyboardEvent) =>
                this.handleInputKeydown(e)
            );
            this.ghBranchInput.addEventListener("change", () => {
                const result = this.processBranchSelection(
                    this.ghBranchInput!.value,
                    false
                );
                if (result === "selected") this.closeBranchMenu();
                else if (result === "more" || result === "fetch")
                    this.syncBranchHighlightAfterRender();
            });
        }

        if (this.ghBranchClearBtn) {
            this.ghBranchClearBtn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (this.ghBranchInput) {
                    this.ghBranchInput.value = "";
                    this.branchLastQuery = "";
                    this.desiredBranch = null;
                    this.branchInputPristine = false;
                    this.updateClearButtonVisibility();
                    this.showAllBranches();
                    this.ghBranchInput.focus();
                }
            });
        }

        if (this.ghBranchToggleBtn) {
            this.ghBranchToggleBtn.addEventListener("click", () => {
                if (this.ghBranchToggleBtn!.disabled) return;
                if (this.branchMenuVisible) {
                    this.closeBranchMenu();
                    return;
                }
                // Show all branches when opening dropdown
                this.showAllBranches();
                this.openBranchMenu();
                if (
                    this.ghBranchInput &&
                    this.doc?.activeElement !== this.ghBranchInput
                )
                    this.ghBranchInput.focus();
            });
        }

        if (this.ghBranchMenu) {
            this.ghBranchMenu.addEventListener("mousedown", (event) =>
                event.preventDefault()
            );
            this.ghBranchMenu.addEventListener("click", (event) =>
                this.handleMenuClick(event)
            );
        }

        if (this.doc) {
            this.doc.addEventListener("mousedown", (event) =>
                this.handleOutsideClick(event)
            );
            this.doc.addEventListener("focusin", (event) =>
                this.handleOutsideClick(event)
            );
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

    private handleInputKeydown(e: KeyboardEvent) {
        if (e.key === "ArrowDown") {
            this.openBranchMenu();
            this.moveBranchHighlight(1);
            e.preventDefault();
            return;
        }
        if (e.key === "ArrowUp") {
            this.openBranchMenu();
            this.moveBranchHighlight(-1);
            e.preventDefault();
            return;
        }
        if (e.key === "Enter") {
            if (this.branchMenuVisible && this.branchHighlightIndex >= 0) {
                const items = this.getBranchMenuItems();
                const item = items[this.branchHighlightIndex];
                if (item && item.dataset.selectable === "1") {
                    const value = item.getAttribute("data-value") || "";
                    if (value) {
                        const result = this.processBranchSelection(value, true);
                        if (result === "selected") this.closeBranchMenu();
                        else if (result === "more" || result === "fetch") {
                            this.syncBranchHighlightAfterRender();
                            this.openBranchMenu();
                        }
                    }
                }
            } else {
                const result = this.processBranchSelection(
                    this.ghBranchInput!.value,
                    false
                );
                if (result === "selected") this.closeBranchMenu();
                else if (result === "more" || result === "fetch")
                    this.syncBranchHighlightAfterRender();
            }
            // Removed revalidateBranchesIfStale(true) here as per user request.
            // Enter now only selects if something is valid, otherwise does nothing (or just closes menu if empty).
            e.preventDefault();
            return;
        }
        if (e.key === "Escape") {
            if (this.branchMenuVisible) {
                this.closeBranchMenu();
                e.preventDefault();
            }
        }
    }

    private handleMenuClick(event: Event) {
        const target = event.target as HTMLElement | null;
        if (!target) return;
        const item = target.closest("li");
        if (!item || !(item instanceof HTMLLIElement)) return;
        if (item.getAttribute("aria-disabled") === "true") return;
        const value = item.getAttribute("data-value") || "";
        if (!value) return;
        const result = this.processBranchSelection(value, true);
        if (result === "selected") this.closeBranchMenu();
        else if (result === "more" || result === "fetch") {
            this.syncBranchHighlightAfterRender();
            this.openBranchMenu();
        }
        if (this.ghBranchInput) this.ghBranchInput.focus();
    }

    private handleOutsideClick(event: Event) {
        if (!this.branchMenuVisible) return;
        const target = event.target as Node | null;
        if (!target) {
            this.closeBranchMenu();
            return;
        }
        if (this.ghBranchMenu && this.ghBranchMenu.contains(target)) return;
        if (this.ghBranchInput && target === this.ghBranchInput) return;
        if (this.ghBranchToggleBtn && this.ghBranchToggleBtn.contains(target))
            return;
        this.closeBranchMenu();
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
            this.branchLastQuery = "";
            this.branchInputPristine = true;
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

    private showAllBranches(): void {
        // Show all branches without filtering
        this.filteredBranches = [...this.allBranches];
        this.renderCount = Math.min(RENDER_STEP, this.filteredBranches.length);
        this.renderOptions();
        this.updateBranchCount();
    }

    private setBranchDisabled(disabled: boolean, placeholder?: string): void {
        const nextPlaceholder =
            placeholder !== undefined ? placeholder : BRANCH_INPUT_PLACEHOLDER;
        if (this.ghBranchInput) {
            this.ghBranchInput.disabled = disabled;
            this.ghBranchInput.placeholder = nextPlaceholder;
            if (disabled) {
                this.ghBranchInput.value = "";
                this.branchLastQuery = "";
                this.branchInputPristine = true;
            }
        }
        if (this.ghBranchToggleBtn) {
            this.ghBranchToggleBtn.disabled = disabled;
            this.ghBranchToggleBtn.setAttribute("aria-expanded", "false");
        }
        if (disabled) this.closeBranchMenu();
    }

    private updateBranchCount(): void {
        if (!this.ghBranchCountEl) return;
        const total = this.allBranches.length;
        const showing = this.filteredBranches.length;
        this.ghBranchCountEl.textContent = `${showing} / ${total}${
            this.hasMorePages ? " +" : ""
        }`;
    }

    private getBranchMenuItems(): HTMLLIElement[] {
        if (!this.ghBranchMenu) return [];
        const items: HTMLLIElement[] = [];
        let node = this.ghBranchMenu.firstElementChild;
        while (node) {
            if (node instanceof HTMLLIElement) items.push(node);
            node = node.nextElementSibling;
        }
        return items;
    }

    private setBranchHighlight(index: number, scrollIntoView: boolean): void {
        const items = this.getBranchMenuItems();
        this.branchHighlightIndex = index;
        for (let i = 0; i < items.length; i++) {
            if (i === this.branchHighlightIndex)
                items[i].setAttribute("data-active", "1");
            else items[i].removeAttribute("data-active");
        }
        if (
            scrollIntoView &&
            this.branchHighlightIndex >= 0 &&
            this.branchHighlightIndex < items.length
        ) {
            try {
                items[this.branchHighlightIndex].scrollIntoView({
                    block: "nearest",
                });
            } catch {
                /* ignore */
            }
        }
    }

    private findNextSelectable(
        startIndex: number,
        delta: number,
        items: HTMLLIElement[]
    ): number {
        if (!items.length) return -1;
        let index = startIndex;
        for (let i = 0; i < items.length; i++) {
            index += delta;
            if (index < 0) index = items.length - 1;
            else if (index >= items.length) index = 0;
            const item = items[index];
            if (!item) continue;
            if (
                item.dataset.selectable === "1" &&
                item.getAttribute("aria-disabled") !== "true"
            )
                return index;
        }
        return -1;
    }

    private moveBranchHighlight(delta: number): void {
        const items = this.getBranchMenuItems();
        if (!items.length) {
            this.setBranchHighlight(-1, false);
            return;
        }
        const next = this.findNextSelectable(
            this.branchHighlightIndex,
            delta,
            items
        );
        if (next >= 0) this.setBranchHighlight(next, true);
    }

    private syncBranchHighlightAfterRender(): void {
        const items = this.getBranchMenuItems();
        if (!this.branchMenuVisible) {
            this.setBranchHighlight(-1, false);
            return;
        }
        if (!items.length) {
            this.setBranchHighlight(-1, false);
            return;
        }
        if (
            this.branchHighlightIndex >= 0 &&
            this.branchHighlightIndex < items.length
        ) {
            const current = items[this.branchHighlightIndex];
            if (
                current &&
                current.dataset.selectable === "1" &&
                current.getAttribute("aria-disabled") !== "true"
            ) {
                this.setBranchHighlight(this.branchHighlightIndex, false);
                return;
            }
        }
        const first = this.findNextSelectable(-1, 1, items);
        this.setBranchHighlight(first, false);
    }

    private setBranchMenuVisible(show: boolean): void {
        if (!this.ghBranchMenu) {
            this.branchMenuVisible = false;
            this.branchHighlightIndex = -1;
            return;
        }
        if (show && this.ghBranchInput && this.ghBranchInput.disabled)
            show = false;
        this.branchMenuVisible = show;
        if (this.branchMenuVisible) {
            this.ghBranchMenu.hidden = false;
            this.ghBranchMenu.setAttribute("data-open", "1");
            if (this.ghBranchToggleBtn)
                this.ghBranchToggleBtn.setAttribute("aria-expanded", "true");
            if (this.ghBranchInput)
                this.ghBranchInput.setAttribute("aria-expanded", "true");
        } else {
            this.ghBranchMenu.hidden = true;
            this.ghBranchMenu.removeAttribute("data-open");
            if (this.ghBranchToggleBtn)
                this.ghBranchToggleBtn.setAttribute("aria-expanded", "false");
            if (this.ghBranchInput)
                this.ghBranchInput.setAttribute("aria-expanded", "false");
            this.setBranchHighlight(-1, false);
        }
    }

    private openBranchMenu(): void {
        if (!this.ghBranchMenu) return;
        if (!this.branchMenuVisible) {
            if (!this.ghBranchMenu.childElementCount) this.renderOptions();
            this.setBranchMenuVisible(true);
        }
        this.syncBranchHighlightAfterRender();
    }

    private closeBranchMenu(): void {
        this.setBranchMenuVisible(false);
    }

    private renderOptions(): void {
        if (!this.ghBranchMenu || !this.doc) return;

        while (this.ghBranchMenu.firstChild)
            this.ghBranchMenu.removeChild(this.ghBranchMenu.firstChild);

        const slice = this.filteredBranches.slice(0, this.renderCount);
        if (slice.length > 0) {
            for (let i = 0; i < slice.length; i++) {
                const name = slice[i];
                const item = this.doc.createElement("li");
                item.className = "gh-branch-item";
                item.dataset.value = name;
                item.dataset.selectable = "1";
                item.setAttribute("role", "option");
                item.textContent = name;
                if (i === this.branchHighlightIndex)
                    item.setAttribute("data-active", "1");
                this.ghBranchMenu.appendChild(item);
            }
        } else {
            const empty = this.doc.createElement("li");
            empty.className = "gh-branch-item gh-branch-item-empty";
            empty.setAttribute("aria-disabled", "true");
            empty.dataset.selectable = "0";
            empty.textContent = this.allBranches.length
                ? "No matching branches"
                : "No branches loaded yet";
            this.ghBranchMenu.appendChild(empty);
        }

        if (this.filteredBranches.length > this.renderCount) {
            const more = this.doc.createElement("li");
            more.className = "gh-branch-item gh-branch-item-action";
            more.dataset.value = "__more__";
            more.dataset.selectable = "1";
            more.textContent = `Load more… (${
                this.filteredBranches.length - this.renderCount
            } more)`;
            this.ghBranchMenu.appendChild(more);
        } else if (this.hasMorePages) {
            const fetch = this.doc.createElement("li");
            fetch.className = "gh-branch-item gh-branch-item-action";
            fetch.dataset.value = "__fetch__";
            fetch.dataset.selectable = "1";
            fetch.textContent = "Load next page…";
            this.ghBranchMenu.appendChild(fetch);
        }

        if (this.ghBranchInput) {
            const want = this.desiredBranch || this.defaultBranchFromApi || "";
            if (!this.ghBranchInput.value && want && this.branchInputPristine) {
                this.ghBranchInput.value = want;
                this.branchLastQuery = want;
                this.updateClearButtonVisibility();
            }
        }

        if (this.branchMenuVisible) {
            this.syncBranchHighlightAfterRender();
        }
    }

    private applyBranchFilter(): void {
        const rawInput = (this.ghBranchInput?.value || "").trim();
        const raw =
            rawInput === "__more__" || rawInput === "__fetch__"
                ? this.branchLastQuery.trim()
                : rawInput;
        const q = raw.toLowerCase();
        // Always filter by the query, even if it matches the selection.
        // This allows users to refine their search (e.g. "main" -> "maintenance").
        const effectiveQuery = q;
        this.filteredBranches = effectiveQuery
            ? this.allBranches.filter((n) =>
                  n.toLowerCase().includes(effectiveQuery)
              )
            : [...this.allBranches];

        this.renderCount = Math.min(RENDER_STEP, this.filteredBranches.length);
        this.renderOptions();
        this.updateBranchCount();

        if (
            !this.branchMenuVisible &&
            this.ghBranchInput &&
            !this.ghBranchInput.disabled
        ) {
            const isFocused =
                !!this.doc && this.doc.activeElement === this.ghBranchInput;
            if (isFocused) {
                this.setBranchMenuVisible(true);
                this.syncBranchHighlightAfterRender();
            }
        }
    }

    private processBranchSelection(
        rawValue: string,
        fromMenu: boolean
    ): BranchSelectionResult {
        const value = (rawValue || "").trim();
        if (!this.ghBranchInput) return "noop";

        if (value === "__more__") {
            this.renderCount = Math.min(
                this.renderCount + RENDER_STEP,
                this.filteredBranches.length
            );
            this.renderOptions();
            this.updateBranchCount();
            this.ghBranchInput.value = this.branchLastQuery;
            if (fromMenu && !this.branchMenuVisible)
                this.setBranchMenuVisible(true);
            return "more";
        }

        if (value === "__fetch__") {
            this.ensureNextPageIfNeeded();
            this.ghBranchInput.value = this.branchLastQuery;
            return "fetch";
        }

        if (!value) return "noop";

        this.desiredBranch = value;
        this.branchLastQuery = value;
        this.ghBranchInput.value = value;
        this.branchInputPristine = false;
        this.updateClearButtonVisibility();
        this.deps.postToPlugin({
            type: "GITHUB_SELECT_BRANCH",
            payload: {
                owner: this.currentOwner,
                repo: this.currentRepo,
                branch: value,
            },
        });

        this.applyBranchFilter();

        if (this.onBranchChange) this.onBranchChange(value);

        return "selected";
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
                    this.branchLastQuery = newBranch;
                    this.branchInputPristine = false;
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
                    const wrap = this.doc.createElement("div");
                    const a = this.doc.createElement("a");
                    a.href = url;
                    a.target = "_blank";
                    a.textContent = "View on GitHub";
                    wrap.appendChild(a);
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
