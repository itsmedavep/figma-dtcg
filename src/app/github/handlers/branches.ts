import { ghListBranches, ghCreateBranch } from "../../../core/github/api";
import type { DispatcherContext } from "./types";
import { mergeSelected, getSelected, setSelected } from "./state";

export async function handleFetchBranches(
    ctx: DispatcherContext,
    payload: any
): Promise<void> {
    const owner = String(payload.owner || "");
    const repo = String(payload.repo || "");
    const page = Number.isFinite(payload.page) ? Number(payload.page) : 1;
    const force = !!payload.force;

    if (!ctx.state.token) {
        ctx.deps.send({
            type: "GITHUB_BRANCHES_ERROR",
            payload: {
                owner,
                repo,
                status: 401,
                message: "No token",
            },
        });
        return;
    }

    const res = await ghListBranches(ctx.state.token, owner, repo, page, force);
    if (res.ok) {
        ctx.deps.send({ type: "GITHUB_BRANCHES", payload: res });
        if (page === 1 && res.defaultBranch) {
            await mergeSelected({
                owner,
                repo,
                branch: res.defaultBranch,
                prBase: res.defaultBranch,
            });
        }
    } else {
        ctx.deps.send({ type: "GITHUB_BRANCHES_ERROR", payload: res });
    }
}

export async function handleSelectBranch(
    ctx: DispatcherContext,
    payload: any
): Promise<void> {
    const sel = await getSelected();
    await setSelected({
        owner: payload.owner || sel.owner,
        repo: payload.repo || sel.repo,
        branch: payload.branch,
        folder: undefined,
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

export async function handleCreateBranch(
    ctx: DispatcherContext,
    payload: any
): Promise<void> {
    const owner = String(payload.owner || "");
    const repo = String(payload.repo || "");
    const baseBranch = String(payload.baseBranch || "");
    const newBranch = String(payload.newBranch || "");

    if (!ctx.state.token) {
        ctx.deps.send({
            type: "GITHUB_CREATE_BRANCH_RESULT",
            payload: {
                ok: false,
                owner,
                repo,
                baseBranch,
                newBranch,
                status: 401,
                message: "No token",
            },
        });
        return;
    }
    if (!owner || !repo || !baseBranch || !newBranch) {
        ctx.deps.send({
            type: "GITHUB_CREATE_BRANCH_RESULT",
            payload: {
                ok: false,
                owner,
                repo,
                baseBranch,
                newBranch,
                status: 400,
                message: "Missing owner/repo/base/new",
            },
        });
        return;
    }

    const res = await ghCreateBranch(
        ctx.state.token,
        owner,
        repo,
        newBranch,
        baseBranch
    );
    if (res.ok) {
        await mergeSelected({ owner, repo, branch: newBranch });
    }
    ctx.deps.send({
        type: "GITHUB_CREATE_BRANCH_RESULT",
        payload: res,
    });
}
