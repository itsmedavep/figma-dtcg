// src/app/github/ui/import.ts
// Token import UI for fetching repository token files.
import type { PluginToUi } from "../../messages";
import type { GithubUiDependencies, AttachContext } from "./types";

export class GithubImportUi {
    private deps: GithubUiDependencies;
    private doc: Document | null = null;

    // Elements
    private ghFetchBtn: HTMLButtonElement | null = null;
    private ghFetchPathInput: HTMLInputElement | null = null;

    // State
    private currentOwner = "";
    private currentRepo = "";
    private currentBranch = "";
    private currentFolder = "";

    constructor(deps: GithubUiDependencies) {
        this.deps = deps;
    }

    public attach(context: AttachContext) {
        this.doc = context.document;
        this.ghFetchBtn = this.doc.getElementById(
            "ghFetchTokensBtn"
        ) as HTMLButtonElement;
        this.ghFetchPathInput = this.doc.getElementById(
            "ghFetchPathInput"
        ) as HTMLInputElement;

        if (this.ghFetchBtn) {
            this.ghFetchBtn.addEventListener("click", () => this.fetchTokens());
        }

        if (this.ghFetchPathInput) {
            this.ghFetchPathInput.addEventListener("input", () =>
                this.updateEnabled()
            );
        }
    }

    public setContext(
        owner: string,
        repo: string,
        branch: string,
        folder: string
    ) {
        this.currentOwner = owner;
        this.currentRepo = repo;
        this.currentBranch = branch;
        this.currentFolder = folder;
        this.updateEnabled();
    }

    public reset() {
        this.currentOwner = "";
        this.currentRepo = "";
        this.currentBranch = "";
        this.currentFolder = "";
        this.updateEnabled();
    }

    public handleMessage(msg: PluginToUi): boolean {
        if (msg.type === "GITHUB_FETCH_TOKENS_RESULT") {
            this.handleFetchResult(msg.payload);
            return true;
        }
        return false;
    }

    private updateEnabled() {
        if (this.ghFetchBtn) {
            const hasContext = !!(
                this.currentOwner &&
                this.currentRepo &&
                this.currentBranch
            );
            const hasPath = !!(
                this.ghFetchPathInput && this.ghFetchPathInput.value.trim()
            );
            this.ghFetchBtn.disabled = !(hasContext && hasPath);
        }
    }

    private fetchTokens() {
        if (!this.currentOwner || !this.currentRepo || !this.currentBranch) {
            this.deps.log("Please select a repository and branch first.");
            return;
        }

        const pathInput = this.ghFetchPathInput?.value.trim() || "";
        if (!pathInput) {
            this.deps.log("Please enter a path to the tokens file.");
            return;
        }

        // Normalize the path - remove leading/trailing slashes
        const path = pathInput.replace(/^\/+|\/+$/g, "");

        this.deps.log(
            `Fetching ${path} from ${this.currentOwner}/${this.currentRepo} (${this.currentBranch})…`
        );
        if (this.ghFetchBtn) this.ghFetchBtn.disabled = true;

        const allowHex = !!(
            this.deps.getAllowHexCheckbox() &&
            this.deps.getAllowHexCheckbox()!.checked
        );
        const contexts = this.deps.getImportContexts();

        this.deps.postToPlugin({
            type: "GITHUB_FETCH_TOKENS",
            payload: {
                owner: this.currentOwner,
                repo: this.currentRepo,
                branch: this.currentBranch,
                path,
                allowHexStrings: allowHex,
                contexts,
            },
        });
    }

    private handleFetchResult(pl: unknown) {
        if (this.ghFetchBtn) this.ghFetchBtn.disabled = false;

        if (!pl || typeof pl !== "object") return;
        const payload = pl as Record<string, unknown>;

        const status = typeof payload.status === "number" ? payload.status : 0;
        const message = payload.message || "unknown error";

        if (payload.ok) {
            const json = payload.json;
            if (!json) {
                this.deps.log("Fetched file is empty or invalid JSON.");
                return;
            }
            this.deps.log(
                `Successfully fetched tokens file (${
                    JSON.stringify(json).length
                } bytes).`
            );
            // GitHub fetch handler already applies imports; do not repost to avoid double imports.
        } else {
            this.deps.log(`Fetch failed (status ${status}): ${message}`);
            if (status === 404) {
                this.deps.log("File not found. Check if the path is correct.");
            }
        }
    }
}
