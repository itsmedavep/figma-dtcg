// src/app/github/ui/repo.ts
// Repository picker UI: select and restore GitHub repositories.
import type { PluginToUi } from "../../messages";
import type { GithubUiDependencies, AttachContext } from "./types";
import { h, clearChildren } from "../../ui/dom-helpers";

export class GithubRepoUi {
    private deps: GithubUiDependencies;
    private doc: Document | null = null;
    private ghRepoSelect: HTMLSelectElement | null = null;

    private currentOwner = "";
    private currentRepo = "";

    // Callbacks
    public onRepoChange: ((owner: string, repo: string) => void) | null = null;

    constructor(deps: GithubUiDependencies) {
        this.deps = deps;
    }

    public attach(context: AttachContext) {
        this.doc = context.document;
        this.ghRepoSelect = this.doc.getElementById(
            "ghRepoSelect"
        ) as HTMLSelectElement;

        if (this.ghRepoSelect) {
            let lastRepoKey = "";
            this.ghRepoSelect.addEventListener("change", () => {
                const value = this.ghRepoSelect!.value;
                if (!value) return;
                if (value === lastRepoKey) return;
                lastRepoKey = value;

                const parts = value.split("/");
                this.currentOwner = parts[0] || "";
                this.currentRepo = parts[1] || "";

                this.deps.postToPlugin({
                    type: "GITHUB_SELECT_REPO",
                    payload: {
                        owner: this.currentOwner,
                        repo: this.currentRepo,
                    },
                });

                if (this.onRepoChange) {
                    this.onRepoChange(this.currentOwner, this.currentRepo);
                }
            });
        }
    }

    public handleMessage(msg: PluginToUi): boolean {
        if (msg.type === "GITHUB_REPOS") {
            const repos = (msg.payload?.repos ?? []) as Array<{
                full_name: string;
                default_branch: string;
                private: boolean;
            }>;
            this.populateGhRepos(repos);
            this.deps.log(`GitHub: Repository list updated (${repos.length}).`);
            return true;
        }

        if (msg.type === "GITHUB_RESTORE_SELECTED") {
            const p = msg.payload || {};
            const newOwner = typeof p.owner === "string" ? p.owner : "";
            const newRepo = typeof p.repo === "string" ? p.repo : "";

            if (
                newOwner === this.currentOwner &&
                newRepo === this.currentRepo
            ) {
                return false;
            }

            this.currentOwner = newOwner;
            this.currentRepo = newRepo;
            // If repos are already populated, we should select it.
            this.syncSelect();

            // Notify listeners so downstream UIs know a repo is selected
            if (this.currentOwner && this.currentRepo && this.onRepoChange) {
                this.onRepoChange(this.currentOwner, this.currentRepo);
            }
            return false; // Allow other modules to handle RESTORE_SELECTED too
        }

        return false;
    }

    public reset() {
        this.populateGhRepos([]);
        this.currentOwner = "";
        this.currentRepo = "";
    }

    public getSelected(): { owner: string; repo: string } {
        return { owner: this.currentOwner, repo: this.currentRepo };
    }

    private populateGhRepos(
        list: Array<{
            full_name: string;
            default_branch: string;
            private: boolean;
        }>
    ): void {
        if (!this.ghRepoSelect || !this.doc) return;
        clearChildren(this.ghRepoSelect);

        for (const r of list) {
            this.ghRepoSelect.appendChild(
                h("option", { value: r.full_name }, r.full_name)
            );
        }
        this.ghRepoSelect.disabled = list.length === 0;

        if (list.length > 0) {
            const prevOwner = this.currentOwner;
            const prevRepo = this.currentRepo;

            this.syncSelect();

            // Only notify if the repo actually changed (e.g. we defaulted to a new one,
            // or the previously selected one is no longer available).
            // If it didn't change, it means we restored it correctly and already notified.
            if (
                (this.currentOwner !== prevOwner ||
                    this.currentRepo !== prevRepo) &&
                this.onRepoChange
            ) {
                this.onRepoChange(this.currentOwner, this.currentRepo);
            }
        }
    }

    private syncSelect() {
        if (!this.ghRepoSelect) return;
        if (this.currentOwner && this.currentRepo) {
            const want = `${this.currentOwner}/${this.currentRepo}`;
            let matched = false;
            for (let i = 0; i < this.ghRepoSelect.options.length; i++) {
                if (this.ghRepoSelect.options[i].value === want) {
                    this.ghRepoSelect.selectedIndex = i;
                    matched = true;
                    break;
                }
            }
            // console.log(`[RepoUi] syncSelect: want=${want}, matched=${matched}`);
            if (matched) {
                // We don't dispatch change event here to avoid loops.
            }
        } else {
            // Default to first
            if (this.ghRepoSelect.options.length > 0) {
                this.ghRepoSelect.selectedIndex = 0;
                // If we default to first, we should update state and notify
                const val = this.ghRepoSelect.options[0].value;
                const parts = val.split("/");
                if (parts.length === 2) {
                    this.currentOwner = parts[0];
                    this.currentRepo = parts[1];
                    // We'll notify in populateGhRepos if this was called from there.
                    // If called from elsewhere, we might need to notify.
                    // But syncSelect is mostly internal.
                }
            }
        }
    }
}
