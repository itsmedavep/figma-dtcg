import { ghListDirs, ghEnsureFolder } from "../../../core/github/api";
import type { DispatcherContext } from "./types";
import {
    normalizeFolderForStorage,
    folderStorageToCommitPath,
} from "../folders";
import type { GithubFolderPayload, GithubRepoTarget } from "../../messages";
import { getSelected, setSelected } from "./state";

async function ensureFolderPathWritable(
    token: string,
    owner: string,
    repo: string,
    branch: string,
    folderPath: string
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
    if (!folderPath) return { ok: true };
    const segments = folderPath.split("/").filter(Boolean);
    let prefix = "";
    for (let i = 0; i < segments.length; i++) {
        prefix = prefix ? `${prefix}/${segments[i]}` : segments[i];
        const res = await ghListDirs(token, owner, repo, branch, prefix);
        if (res.ok) continue;
        const status = typeof res.status === "number" ? res.status : 0;
        if (status === 404) break;
        if (status === 409) {
            return {
                ok: false,
                status: 409,
                message: `GitHub: "${prefix}" is already a file. Choose a different export folder.`,
            };
        }
        if (res.samlRequired) {
            return {
                ok: false,
                status: 403,
                message:
                    "GitHub: Authorize SSO for this repository to export into that folder.",
            };
        }
        const message = res.message || `HTTP ${status}`;
        return { ok: false, status: status || 400, message };
    }
    return { ok: true };
}

export async function getSelectedFolderForCommit(folderRaw: string) {
    const folderStoredResult = normalizeFolderForStorage(folderRaw);
    if (!folderStoredResult.ok) {
        return folderStoredResult;
    }
    const folderCommitResult = folderStorageToCommitPath(
        folderStoredResult.storage
    );
    if (!folderCommitResult.ok) {
        return folderCommitResult;
    }
    return {
        ok: true as const,
        storage: folderStoredResult.storage,
        path: folderCommitResult.path,
    };
}

export { ensureFolderPathWritable }; // Export for use in commits.ts if needed

export async function handleSetFolder(
    ctx: DispatcherContext,
    payload: GithubFolderPayload
): Promise<void> {
    const folderResult = normalizeFolderForStorage(
        String(payload.folder ?? "")
    );
    if (!folderResult.ok) {
        ctx.deps.send({
            type: "ERROR",
            payload: { message: folderResult.message },
        });
        return;
    }
    const folder = folderResult.storage;
    const sel = await getSelected();
    await setSelected({
        owner: payload.owner || sel.owner,
        repo: payload.repo || sel.repo,
        branch: sel.branch,
        folder,
        filename: sel.filename,
        commitMessage: sel.commitMessage,
        scope: sel.scope,
        collection: sel.collection,
        mode: sel.mode,
        createPr: sel.createPr,
        prBase: sel.prBase,
        prTitle: sel.prTitle,
        prBody: sel.prBody,
    });
}

export async function handleFolderList(
    ctx: DispatcherContext,
    payload: GithubRepoTarget & { branch: string; path: string }
): Promise<void> {
    const owner = String(payload.owner || "");
    const repo = String(payload.repo || "");
    const branch = String(payload.branch || "");
    const pathRaw = String(payload.path || "");

    if (!ctx.state.token) {
        ctx.deps.send({
            type: "GITHUB_FOLDER_LIST_RESULT",
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

    const normalizedPath = normalizeFolderForStorage(pathRaw);
    if (!normalizedPath.ok) {
        ctx.deps.send({
            type: "GITHUB_FOLDER_LIST_RESULT",
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
            type: "GITHUB_FOLDER_LIST_RESULT",
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

    const folderPath = commitPathResult.path;
    if (folderPath) {
        const collision = await ensureFolderPathWritable(
            ctx.state.token,
            owner,
            repo,
            branch,
            folderPath
        );
        if (!collision.ok) {
            ctx.deps.send({
                type: "GITHUB_FOLDER_LIST_RESULT",
                payload: {
                    ok: false,
                    owner,
                    repo,
                    branch,
                    path: folderPath,
                    status: collision.status,
                    message: collision.message,
                },
            });
            return;
        }
    }

    const res = await ghListDirs(
        ctx.state.token,
        owner,
        repo,
        branch,
        commitPathResult.path
    );
    if (res.ok) {
        ctx.deps.send({
            type: "GITHUB_FOLDER_LIST_RESULT",
            payload: {
                ok: true,
                owner,
                repo,
                branch,
                path: res.path,
                entries: res.dirs.map((d) => ({
                    type: "dir",
                    name: d.name,
                    path: d.path,
                })),
                rate: res.rate,
            },
        });
    } else {
        ctx.deps.send({
            type: "GITHUB_FOLDER_LIST_RESULT",
            payload: {
                ok: false,
                owner,
                repo,
                branch,
                path: res.path,
                status: res.status,
                message: res.message,
                rate: res.rate,
            },
        });
    }
}

export async function handleCreateFolder(
    ctx: DispatcherContext,
    payload: GithubRepoTarget & {
        branch: string;
        path?: string;
        folderPath?: string;
    }
): Promise<void> {
    const owner = String(payload.owner || "");
    const repo = String(payload.repo || "");
    const branch = String(payload.branch || "");
    const folderPathRaw = String(
        payload.folderPath || payload.path || ""
    ).trim();

    if (!ctx.state.token) {
        ctx.deps.send({
            type: "GITHUB_CREATE_FOLDER_RESULT",
            payload: {
                ok: false,
                owner,
                repo,
                branch,
                folderPath: folderPathRaw,
                status: 401,
                message: "No token",
            },
        });
        return;
    }

    const folderNormalized = normalizeFolderForStorage(folderPathRaw);
    if (!folderNormalized.ok) {
        ctx.deps.send({
            type: "GITHUB_CREATE_FOLDER_RESULT",
            payload: {
                ok: false,
                owner,
                repo,
                branch,
                folderPath: folderPathRaw,
                status: 400,
                message: folderNormalized.message,
            },
        });
        return;
    }

    const folderCommit = folderStorageToCommitPath(folderNormalized.storage);
    if (!folderCommit.ok) {
        ctx.deps.send({
            type: "GITHUB_CREATE_FOLDER_RESULT",
            payload: {
                ok: false,
                owner,
                repo,
                branch,
                folderPath: folderPathRaw,
                status: 400,
                message: folderCommit.message,
            },
        });
        return;
    }
    if (!folderCommit.path) {
        ctx.deps.send({
            type: "GITHUB_CREATE_FOLDER_RESULT",
            payload: {
                ok: false,
                owner,
                repo,
                branch,
                folderPath: folderPathRaw,
                status: 400,
                message: "GitHub: Choose a subfolder name.",
            },
        });
        return;
    }

    const res = await ghEnsureFolder(
        ctx.state.token,
        owner,
        repo,
        branch,
        folderCommit.path
    );
    ctx.deps.send({
        type: "GITHUB_CREATE_FOLDER_RESULT",
        payload: res,
    });
}
