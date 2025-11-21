import type { DispatcherContext, GhSelected } from "./types";
import { normalizeFolderForStorage } from "../folders";
import type { GithubScope } from "../../messages";

const GH_SELECTED_KEY = "gh.selected";
const GH_LAST_COMMIT_KEY = "gh.lastCommitSignature";

export async function getSelected(): Promise<GhSelected> {
    try {
        return (await figma.clientStorage.getAsync(GH_SELECTED_KEY)) ?? {};
    } catch {
        return {};
    }
}

export async function setSelected(sel: GhSelected): Promise<void> {
    try {
        await figma.clientStorage.setAsync(GH_SELECTED_KEY, sel);
    } catch {
        /* ignore */
    }
}

export async function mergeSelected(
    partial: Partial<GhSelected>
): Promise<GhSelected> {
    const current = await getSelected();
    const merged = { ...current, ...partial };
    await setSelected(merged);
    return merged;
}

export type CommitSignature = {
    branch: string;
    fullPath: string;
    scope: GithubScope;
};

export async function getLastCommitSignature(): Promise<CommitSignature | null> {
    try {
        const stored = await figma.clientStorage.getAsync(GH_LAST_COMMIT_KEY);
        if (
            stored &&
            typeof stored === "object" &&
            typeof (stored as { branch?: unknown }).branch === "string" &&
            typeof (stored as { fullPath?: unknown }).fullPath === "string"
        ) {
            return {
                branch: (stored as { branch: string }).branch,
                fullPath: (stored as { fullPath: string }).fullPath,
                scope:
                    typeof (stored as { scope?: unknown }).scope === "string" &&
                    ((stored as { scope?: unknown }).scope === "all" ||
                        (stored as { scope?: unknown }).scope === "selected" ||
                        (stored as { scope?: unknown }).scope === "typography")
                        ? ((stored as { scope: GithubScope })
                              .scope as GithubScope)
                        : "selected",
            };
        }
    } catch {
        /* ignore */
    }
    return null;
}

export async function setLastCommitSignature(
    sig: CommitSignature
): Promise<void> {
    try {
        await figma.clientStorage.setAsync(GH_LAST_COMMIT_KEY, sig);
    } catch {
        /* ignore */
    }
}

export async function handleSaveState(
    ctx: DispatcherContext,
    payload: any
): Promise<void> {
    const update: Partial<GhSelected> = {};
    if (typeof payload.owner === "string") update.owner = payload.owner;
    if (typeof payload.repo === "string") update.repo = payload.repo;
    if (typeof payload.branch === "string") update.branch = payload.branch;
    if (typeof payload.folder === "string") {
        const folderResult = normalizeFolderForStorage(payload.folder);
        if (folderResult.ok) update.folder = folderResult.storage;
        else
            ctx.deps.send({
                type: "ERROR",
                payload: { message: folderResult.message },
            });
    }
    if (typeof payload.filename === "string")
        update.filename = payload.filename.trim();
    if (typeof payload.commitMessage === "string")
        update.commitMessage = payload.commitMessage;
    if (
        payload.scope === "all" ||
        payload.scope === "selected" ||
        payload.scope === "typography"
    ) {
        update.scope = payload.scope;
    }
    if (typeof payload.collection === "string")
        update.collection = payload.collection;
    if (typeof payload.mode === "string") update.mode = payload.mode;
    if (typeof payload.styleDictionary === "boolean")
        update.styleDictionary = payload.styleDictionary;
    if (typeof payload.flatTokens === "boolean")
        update.flatTokens = payload.flatTokens;
    if (typeof payload.createPr === "boolean")
        update.createPr = payload.createPr;
    if (typeof payload.prBase === "string") update.prBase = payload.prBase;
    if (typeof payload.prTitle === "string") update.prTitle = payload.prTitle;
    if (typeof payload.prBody === "string") update.prBody = payload.prBody;
    await mergeSelected(update);
}
