import { ghGetUser } from "../../../core/github/api";
import type { DispatcherContext } from "./types";
import { listAndSendRepos } from "./repos";

function encodeToken(s: string): string {
    try {
        return btoa(s);
    } catch {
        return s;
    }
}

function decodeToken(s: string): string {
    try {
        return atob(s);
    } catch {
        return s;
    }
}

export async function restoreGithubTokenAndVerify(
    ctx: DispatcherContext
): Promise<void> {
    try {
        const rememberPrefStored = await figma.clientStorage
            .getAsync("githubRememberPref")
            .catch(() => null);
        const rememberPref =
            typeof rememberPrefStored === "boolean" ? rememberPrefStored : true;
        if (!rememberPref) {
            await figma.clientStorage
                .deleteAsync("github_token_b64")
                .catch(() => {});
            return;
        }

        const stored = await figma.clientStorage
            .getAsync("github_token_b64")
            .catch(() => null);
        if (!stored || typeof stored !== "string" || stored.length === 0)
            return;

        const decoded = decodeToken(stored);
        ctx.state.token = decoded;

        const who = await ghGetUser(decoded);
        if (who.ok) {
            ctx.deps.send({
                type: "GITHUB_AUTH_RESULT",
                payload: {
                    ok: true,
                    login: who.user.login,
                    name: who.user.name,
                    remember: true,
                },
            });
            await listAndSendRepos(ctx, decoded);
        } else {
            ctx.deps.send({
                type: "ERROR",
                payload: {
                    message: `GitHub: Authentication failed (stored token): ${who.error}.`,
                },
            });
            ctx.deps.send({
                type: "GITHUB_AUTH_RESULT",
                payload: { ok: false, error: who.error, remember: false },
            });
        }
    } catch {
        // ignore
    }
}

export async function handleSetToken(
    ctx: DispatcherContext,
    payload: { token?: string; remember?: boolean }
): Promise<void> {
    const token = String(payload.token || "").trim();
    const remember = !!payload.remember;

    if (!token) {
        ctx.deps.send({
            type: "ERROR",
            payload: { message: "GitHub: Empty token." },
        });
        ctx.deps.send({
            type: "GITHUB_AUTH_RESULT",
            payload: {
                ok: false,
                error: "empty token",
                remember: false,
            },
        });
        return;
    }

    ctx.state.token = token;
    if (remember) {
        await figma.clientStorage
            .setAsync("github_token_b64", encodeToken(token))
            .catch(() => {});
    } else {
        await figma.clientStorage
            .deleteAsync("github_token_b64")
            .catch(() => {});
    }

    const who = await ghGetUser(token);
    if (who.ok) {
        ctx.deps.send({
            type: "GITHUB_AUTH_RESULT",
            payload: {
                ok: true,
                login: who.user.login,
                name: who.user.name,
                remember,
            },
        });
        await listAndSendRepos(ctx, token);
    } else {
        ctx.deps.send({
            type: "ERROR",
            payload: {
                message: `GitHub: Authentication failed: ${who.error}.`,
            },
        });
        ctx.deps.send({
            type: "GITHUB_AUTH_RESULT",
            payload: {
                ok: false,
                error: who.error,
                remember: false,
            },
        });
        ctx.deps.send({ type: "GITHUB_REPOS", payload: { repos: [] } });
    }
}

export async function handleForgetToken(ctx: DispatcherContext): Promise<void> {
    ctx.state.token = null;
    await figma.clientStorage.deleteAsync("github_token_b64").catch(() => {
        /* ignore */
    });
    ctx.deps.send({
        type: "INFO",
        payload: { message: "GitHub: Token cleared." },
    });
    ctx.deps.send({
        type: "GITHUB_AUTH_RESULT",
        payload: { ok: false, remember: false },
    });
    ctx.deps.send({ type: "GITHUB_REPOS", payload: { repos: [] } });
}
