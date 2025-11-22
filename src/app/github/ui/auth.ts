import type { PluginToUi } from "../../messages";
import type { GithubUiDependencies, AttachContext } from "./types";

const GH_MASK = "••••••••••";

export class GithubAuthUi {
    private deps: GithubUiDependencies;
    private doc: Document | null = null;

    private ghTokenInput: HTMLInputElement | null = null;
    private ghRememberChk: HTMLInputElement | null = null;
    private ghConnectBtn: HTMLButtonElement | null = null;
    private ghVerifyBtn: HTMLButtonElement | null = null;
    private ghLogoutBtn: HTMLButtonElement | null = null;
    private ghAuthStatusEl: HTMLElement | null = null;
    private ghTokenMetaEl: HTMLElement | null = null;

    private ghIsAuthed = false;
    private ghTokenExpiresAt: string | number | null = null;
    private ghRememberPref = true;

    constructor(deps: GithubUiDependencies) {
        this.deps = deps;
    }

    public attach(context: AttachContext) {
        this.doc = context.document;

        this.ghTokenInput = this.findTokenInput();
        this.ghRememberChk =
            (this.doc.getElementById(
                "githubRememberChk"
            ) as HTMLInputElement) ||
            (this.doc.getElementById("ghRememberChk") as HTMLInputElement);
        this.ghConnectBtn =
            (this.doc.getElementById(
                "githubConnectBtn"
            ) as HTMLButtonElement) ||
            (this.doc.getElementById("ghConnectBtn") as HTMLButtonElement);
        this.ghVerifyBtn =
            (this.doc.getElementById("githubVerifyBtn") as HTMLButtonElement) ||
            (this.doc.getElementById("ghVerifyBtn") as HTMLButtonElement);
        this.ghLogoutBtn = this.doc.getElementById(
            "ghLogoutBtn"
        ) as HTMLButtonElement;

        this.ensureGhStatusElements();

        if (this.ghRememberChk) {
            this.ghRememberChk.checked = this.ghRememberPref;
            this.ghRememberChk.addEventListener("change", () => {
                this.updateRememberPref(!!this.ghRememberChk!.checked, true);
            });
        }

        if (this.ghConnectBtn) {
            this.ghConnectBtn.addEventListener("click", () =>
                this.onGitHubConnectClick()
            );
        }
        if (this.ghVerifyBtn) {
            this.ghVerifyBtn.addEventListener("click", () =>
                this.onGitHubVerifyClick()
            );
        }
        if (this.ghLogoutBtn) {
            this.ghLogoutBtn.addEventListener("click", () =>
                this.onGitHubLogoutClick()
            );
        }

        // Initial UI update
        this.updateGhStatusUi();
    }

    public handleMessage(msg: PluginToUi): boolean {
        if (msg.type === "GITHUB_AUTH_RESULT") {
            const p = msg.payload;
            this.ghIsAuthed = !!p.ok;
            this.ghTokenExpiresAt =
                typeof p.exp !== "undefined" && p.exp !== null
                    ? p.exp
                    : typeof p.tokenExpiration !== "undefined" &&
                      p.tokenExpiration !== null
                    ? p.tokenExpiration
                    : null;

            if (typeof p.remember === "boolean") {
                this.updateRememberPref(p.remember, false);
            }

            if (this.ghIsAuthed) {
                this.setPatFieldObfuscated(true);
                const who = p.login || "unknown";
                const name = p.name ? ` (${p.name})` : "";
                this.deps.log(`GitHub: Authenticated as ${who}${name}.`);
            } else {
                this.setPatFieldObfuscated(false);
                const why = p.error ? `: ${p.error}` : ".";
                this.deps.log(`GitHub: Authentication failed${why}`);
            }

            this.updateGhStatusUi();
            return true;
        }
        return false;
    }

    public isAuthed(): boolean {
        return this.ghIsAuthed;
    }

    public logout() {
        this.onGitHubLogoutClick();
    }

    private findTokenInput(): HTMLInputElement | null {
        if (!this.doc) return null;
        return (
            (this.doc.getElementById("githubTokenInput") as HTMLInputElement) ||
            (this.doc.getElementById("ghTokenInput") as HTMLInputElement) ||
            (this.doc.getElementById("githubPatInput") as HTMLInputElement) ||
            (this.doc.querySelector(
                'input[name="githubToken"]'
            ) as HTMLInputElement) ||
            (this.doc.querySelector(
                'input[type="password"]'
            ) as HTMLInputElement)
        );
    }

    private readPatFromUi(): string {
        if (!this.ghTokenInput) this.ghTokenInput = this.findTokenInput();
        if (!this.ghTokenInput) return "";
        if (this.ghTokenInput.getAttribute("data-filled") === "1")
            return GH_MASK;
        return (this.ghTokenInput.value || "").trim();
    }

    private updateRememberPref(pref: boolean, persist = false): void {
        const next = !!pref;
        this.ghRememberPref = next;
        if (this.ghRememberChk) {
            this.ghRememberChk.checked = this.ghRememberPref;
        }
        this.updateGhStatusUi();
        if (persist) {
            this.deps.postToPlugin({
                type: "SAVE_PREFS",
                payload: { githubRememberToken: this.ghRememberPref },
            });
        }
    }

    private ensureGhStatusElements(): void {
        if (!this.doc) return;
        if (!this.ghAuthStatusEl)
            this.ghAuthStatusEl = this.doc.getElementById("ghAuthStatus");
        if (!this.ghTokenMetaEl)
            this.ghTokenMetaEl = this.doc.getElementById("ghTokenMeta");
        if (!this.ghLogoutBtn)
            this.ghLogoutBtn = this.doc.getElementById(
                "ghLogoutBtn"
            ) as HTMLButtonElement;
    }

    private formatTimeLeft(expInput: string | number): string {
        const exp =
            typeof expInput === "number" ? expInput : Date.parse(expInput);
        if (!isFinite(exp)) return "expiration: unknown";
        const now = Date.now();
        const ms = exp - now;
        if (ms <= 0) return "expired";
        const days = Math.floor(ms / (24 * 60 * 60 * 1000));
        const hours = Math.floor(
            (ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)
        );
        if (days > 0) return `${days}d ${hours}h left`;
        const mins = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
        if (hours > 0) return `${hours}h ${mins}m left`;
        const secs = Math.floor((ms % (60 * 1000)) / 1000);
        if (mins > 0) return `${mins}m ${secs}s left`;
        return `${secs}s left`;
    }

    private setPatFieldObfuscated(filled: boolean): void {
        if (!this.ghTokenInput) this.ghTokenInput = this.findTokenInput();
        if (!this.ghTokenInput) return;
        this.ghTokenInput.type = "password";
        if (filled) {
            this.ghTokenInput.value = GH_MASK;
            this.ghTokenInput.setAttribute("data-filled", "1");
        } else {
            this.ghTokenInput.value = "";
            this.ghTokenInput.removeAttribute("data-filled");
        }
    }

    private updateGhStatusUi(): void {
        this.ensureGhStatusElements();

        if (this.ghAuthStatusEl) {
            this.ghAuthStatusEl.textContent = this.ghIsAuthed
                ? "GitHub: authenticated."
                : "GitHub: not authenticated.";
        }

        if (this.ghTokenMetaEl) {
            const rememberTxt = this.ghRememberPref
                ? "Remember me: on"
                : "Remember me: off";
            const expTxt = this.ghTokenExpiresAt
                ? `Token ${this.formatTimeLeft(this.ghTokenExpiresAt)}`
                : "Token expiration: unknown";
            this.ghTokenMetaEl.textContent = `${expTxt} • ${rememberTxt}`;
        }

        if (this.ghTokenInput) {
            this.ghTokenInput.oninput = () => {
                if (
                    this.ghTokenInput &&
                    this.ghTokenInput.getAttribute("data-filled") === "1"
                ) {
                    this.ghTokenInput.removeAttribute("data-filled");
                }
                if (this.ghConnectBtn) this.ghConnectBtn.disabled = false;
            };
        }

        if (this.ghConnectBtn && this.ghTokenInput) {
            const isMasked =
                this.ghTokenInput.getAttribute("data-filled") === "1";
            this.ghConnectBtn.disabled = this.ghIsAuthed && isMasked;
        }

        if (this.ghLogoutBtn) {
            this.ghLogoutBtn.disabled = !this.ghIsAuthed;
        }

        if (this.ghRememberChk) {
            this.ghRememberChk.checked = this.ghRememberPref;
        }
    }

    private onGitHubConnectClick(): void {
        const tokenRaw = this.readPatFromUi();
        const isMasked = this.ghTokenInput?.getAttribute("data-filled") === "1";
        if (this.ghIsAuthed && isMasked) return;
        if (!tokenRaw) {
            this.deps.log("GitHub: Paste a Personal Access Token first.");
            return;
        }
        const remember = !!(this.ghRememberChk && this.ghRememberChk.checked);
        this.deps.log("GitHub: Verifying token…");
        this.deps.postToPlugin({
            type: "GITHUB_SET_TOKEN",
            payload: { token: tokenRaw, remember },
        });
    }

    private onGitHubVerifyClick(): void {
        this.onGitHubConnectClick();
    }

    private onGitHubLogoutClick(): void {
        this.deps.postToPlugin({ type: "GITHUB_FORGET_TOKEN" });
        this.ghIsAuthed = false;
        this.ghTokenExpiresAt = null;
        this.setPatFieldObfuscated(false);
        this.updateGhStatusUi();
        this.deps.log("GitHub: Logged out.");

        // Dispatch a custom event so other modules can react
        // We can't easily dispatch DOM events from here without a target,
        // but the main UI orchestrator can call this.logout() and then do cleanup.
        // Alternatively, we can expose an event emitter or callback.
        // For now, the orchestrator will handle the side effects of logout
        // by observing the state or we can add a callback to the constructor/method.
    }
}
