import { ghListRepos } from "../../../core/github/api";
import type { DispatcherContext } from "./types";
import { getSelected, setSelected } from "./state";

function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function listAndSendRepos(
    ctx: DispatcherContext,
    token: string
): Promise<void> {
    await sleep(75);
    let repos = await ghListRepos(token);
    if (!repos.ok && /Failed to fetch|network error/i.test(repos.error || "")) {
        await sleep(200);
        repos = await ghListRepos(token);
    }
    if (repos.ok) {
        const minimal = repos.repos.map((r) => ({
            full_name: r.full_name,
            default_branch: r.default_branch,
            private: !!r.private,
        }));
        ctx.deps.send({ type: "GITHUB_REPOS", payload: { repos: minimal } });
    } else {
        ctx.deps.send({
            type: "ERROR",
            payload: {
                message: `GitHub: Could not list repos: ${repos.error}`,
            },
        });
        ctx.deps.send({ type: "GITHUB_REPOS", payload: { repos: [] } });
    }
}

import type { GithubRepoTarget } from "../../messages";

export async function handleSelectRepo(
    ctx: DispatcherContext,
    payload: GithubRepoTarget
): Promise<void> {
    const sel = await getSelected();
    await setSelected({
        owner: payload.owner,
        repo: payload.repo,
        branch: sel.branch,
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
