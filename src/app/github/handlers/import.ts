import { ghGetFileContents } from "../../../core/github/api";
import type { DispatcherContext } from "./types";
import {
    normalizeFolderForStorage,
    folderStorageToCommitPath,
} from "../folders";

import type { UiToPlugin } from "../../messages";

type FetchTokensPayload = Extract<
    UiToPlugin,
    { type: "GITHUB_FETCH_TOKENS" }
>["payload"];

export async function handleFetchTokens(
    ctx: DispatcherContext,
    payload: FetchTokensPayload
): Promise<void> {
    const owner = String(payload.owner || "");
    const repo = String(payload.repo || "");
    const branch = String(payload.branch || "");
    const pathRaw = String(payload.path || "");
    const allowHex = !!payload.allowHexStrings;

    if (!ctx.state.token) {
        ctx.deps.send({
            type: "GITHUB_FETCH_TOKENS_RESULT",
            payload: {
                ok: false,
                owner,
                repo,
                branch,
                path: pathRaw,
                status: 401,
                message: "No token",
            },
        });
        return;
    }
    if (!owner || !repo || !branch || !pathRaw.trim()) {
        ctx.deps.send({
            type: "GITHUB_FETCH_TOKENS_RESULT",
            payload: {
                ok: false,
                owner,
                repo,
                branch,
                path: pathRaw,
                status: 400,
                message: "Missing owner/repo/branch/path",
            },
        });
        return;
    }

    const normalizedPath = normalizeFolderForStorage(pathRaw);
    if (!normalizedPath.ok) {
        ctx.deps.send({
            type: "GITHUB_FETCH_TOKENS_RESULT",
            payload: {
                ok: false,
                owner,
                repo,
                branch,
                path: pathRaw,
                status: 400,
                message: normalizedPath.message,
            },
        });
        return;
    }
    const commitPathResult = folderStorageToCommitPath(normalizedPath.storage);
    if (!commitPathResult.ok) {
        ctx.deps.send({
            type: "GITHUB_FETCH_TOKENS_RESULT",
            payload: {
                ok: false,
                owner,
                repo,
                branch,
                path: pathRaw,
                status: 400,
                message: commitPathResult.message,
            },
        });
        return;
    }
    const path = commitPathResult.path;

    const res = await ghGetFileContents(
        ctx.state.token,
        owner,
        repo,
        branch,
        path
    );
    if (!res.ok) {
        ctx.deps.send({
            type: "GITHUB_FETCH_TOKENS_RESULT",
            payload: res,
        });
        if (res.samlRequired) {
            ctx.deps.send({
                type: "ERROR",
                payload: {
                    message:
                        "GitHub: SSO required for this repository. Authorize your PAT and try again.",
                },
            });
        }
        return;
    }

    try {
        const json = JSON.parse(res.contentText || "{}");
        const contexts = Array.isArray(payload.contexts)
            ? payload.contexts.map((c) => String(c))
            : [];
        const summary = await ctx.deps.importDtcg(json, {
            allowHexStrings: allowHex,
            contexts,
        });
        ctx.deps.send({
            type: "GITHUB_FETCH_TOKENS_RESULT",
            payload: { ok: true, owner, repo, branch, path, json },
        });
        ctx.deps.send({
            type: "INFO",
            payload: {
                message: `Imported tokens from ${owner}/${repo}@${branch}:${path}`,
            },
        });
        ctx.deps.send({
            type: "IMPORT_SUMMARY",
            payload: {
                summary,
                timestamp: Date.now(),
                source: "github",
            },
        });
    } catch (err) {
        const msgText = (err as Error)?.message || "Invalid JSON";
        ctx.deps.send({
            type: "GITHUB_FETCH_TOKENS_RESULT",
            payload: {
                ok: false,
                owner,
                repo,
                branch,
                path,
                status: 422,
                message: msgText,
            },
        });
        ctx.deps.send({
            type: "ERROR",
            payload: {
                message: `GitHub import failed: ${msgText}`,
            },
        });
        return;
    }

    // Refresh UI safely after import
    try {
        await ctx.deps.broadcastLocalCollections({ force: true });
    } catch {
        // ignore refresh errors, import succeeded
    }
}
