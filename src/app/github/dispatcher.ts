import {
    ghGetUser,
    ghListRepos,
    ghListBranches,
    ghCreateBranch,
    ghListDirs,
    ghEnsureFolder,
    ghCommitFiles,
    ghGetFileContents,
    ghCreatePullRequest,
} from "../../core/github/api";
import type { UiToPlugin, PluginToUi, GithubScope } from "../messages";
import {
    normalizeFolderForStorage,
    folderStorageToCommitPath,
} from "./folders";
import { validateGithubFilename, DEFAULT_GITHUB_FILENAME } from "./filenames";

type SnapshotFn = typeof import("../collections").snapshotCollectionsForUi;
type AnalyzeSelectionFn = typeof import("../collections").analyzeSelectionState;
type SafeKeyFn = typeof import("../collections").safeKeyFromCollectionAndMode;
type ImportFn = typeof import("../../core/pipeline").importDtcg;
type ExportFn = typeof import("../../core/pipeline").exportDtcg;

type HandlerDeps = {
    send: (msg: PluginToUi) => void;
    snapshotCollectionsForUi: SnapshotFn;
    analyzeSelectionState: AnalyzeSelectionFn;
    safeKeyFromCollectionAndMode: SafeKeyFn;
    importDtcg: ImportFn;
    exportDtcg: ExportFn;
};

type GhSelected = {
    owner?: string;
    repo?: string;
    branch?: string;
    folder?: string;
    filename?: string;
    commitMessage?: string;
    scope?: GithubScope;
    collection?: string;
    mode?: string;
    styleDictionary?: boolean;
    flatTokens?: boolean;
    createPr?: boolean;
    prBase?: string;
    prTitle?: string;
    prBody?: string;
};

type GithubDispatcher = {
    handle: (msg: UiToPlugin) => Promise<boolean>;
    onUiReady: () => Promise<void>;
};

const GH_SELECTED_KEY = "gh.selected";

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

function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function createGithubDispatcher(deps: HandlerDeps): GithubDispatcher {
    let ghToken: string | null = null;

    async function getSelected(): Promise<GhSelected> {
        try {
            return (await figma.clientStorage.getAsync(GH_SELECTED_KEY)) ?? {};
        } catch {
            return {};
        }
    }

    async function setSelected(sel: GhSelected): Promise<void> {
        try {
            await figma.clientStorage.setAsync(GH_SELECTED_KEY, sel);
        } catch {
            /* ignore */
        }
    }

    async function mergeSelected(
        partial: Partial<GhSelected>
    ): Promise<GhSelected> {
        const current = await getSelected();
        const merged = { ...current, ...partial };
        await setSelected(merged);
        return merged;
    }

    function pickPerModeFile(
        files: Array<{ name: string; json: unknown }>,
        collectionName: string,
        modeName: string
    ): { name: string; json: unknown } | null {
        const prettyExact = `${collectionName} - ${modeName}.json`;
        const prettyLoose = `${collectionName} - ${modeName}`;
        const legacy1 = `${collectionName}_mode=${modeName}`;
        const legacy2 = `${collectionName}/mode=${modeName}`;
        const legacy3 = deps.safeKeyFromCollectionAndMode(
            collectionName,
            modeName
        );

        let picked = files.find((f) => {
            const n = String(f?.name || "");
            return (
                n === prettyExact ||
                n === prettyLoose ||
                n.includes(`${collectionName} - ${modeName}`)
            );
        });
        if (!picked) {
            picked = files.find((f) => {
                const n = String(f?.name || "");
                return (
                    n.includes(legacy1) ||
                    n.includes(legacy2) ||
                    n.includes(legacy3)
                );
            });
        }
        return picked || null;
    }

    async function listAndSendRepos(token: string): Promise<void> {
        await sleep(75);
        let repos = await ghListRepos(token);
        if (
            !repos.ok &&
            /Failed to fetch|network error/i.test(repos.error || "")
        ) {
            await sleep(200);
            repos = await ghListRepos(token);
        }
        if (repos.ok) {
            const minimal = repos.repos.map((r) => ({
                full_name: r.full_name,
                default_branch: r.default_branch,
                private: !!r.private,
            }));
            deps.send({ type: "GITHUB_REPOS", payload: { repos: minimal } });
        } else {
            deps.send({
                type: "ERROR",
                payload: {
                    message: `GitHub: Could not list repos: ${repos.error}`,
                },
            });
            deps.send({ type: "GITHUB_REPOS", payload: { repos: [] } });
        }
    }

    async function restoreGithubTokenAndVerify(): Promise<void> {
        try {
            const rememberPrefStored = await figma.clientStorage
                .getAsync("githubRememberPref")
                .catch(() => null);
            const rememberPref =
                typeof rememberPrefStored === "boolean"
                    ? rememberPrefStored
                    : true;
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
            ghToken = decoded;

            const who = await ghGetUser(decoded);
            if (who.ok) {
                deps.send({
                    type: "GITHUB_AUTH_RESULT",
                    payload: {
                        ok: true,
                        login: who.user.login,
                        name: who.user.name,
                        remember: true,
                    },
                });
                await listAndSendRepos(decoded);
            } else {
                deps.send({
                    type: "ERROR",
                    payload: {
                        message: `GitHub: Authentication failed (stored token): ${who.error}.`,
                    },
                });
                deps.send({
                    type: "GITHUB_AUTH_RESULT",
                    payload: { ok: false, error: who.error, remember: false },
                });
            }
        } catch {
            // ignore
        }
    }

    async function getSelectedFolderForCommit(folderRaw: string) {
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

    async function handle(msg: UiToPlugin): Promise<boolean> {
        switch (msg.type) {
            case "GITHUB_SET_TOKEN": {
                const token = String(msg.payload.token || "").trim();
                const remember = !!msg.payload.remember;

                if (!token) {
                    deps.send({
                        type: "ERROR",
                        payload: { message: "GitHub: Empty token." },
                    });
                    deps.send({
                        type: "GITHUB_AUTH_RESULT",
                        payload: {
                            ok: false,
                            error: "empty token",
                            remember: false,
                        },
                    });
                    return true;
                }

                ghToken = token;
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
                    deps.send({
                        type: "GITHUB_AUTH_RESULT",
                        payload: {
                            ok: true,
                            login: who.user.login,
                            name: who.user.name,
                            remember,
                        },
                    });
                    await listAndSendRepos(token);
                } else {
                    deps.send({
                        type: "ERROR",
                        payload: {
                            message: `GitHub: Authentication failed: ${who.error}.`,
                        },
                    });
                    deps.send({
                        type: "GITHUB_AUTH_RESULT",
                        payload: {
                            ok: false,
                            error: who.error,
                            remember: false,
                        },
                    });
                    deps.send({ type: "GITHUB_REPOS", payload: { repos: [] } });
                }
                return true;
            }

            case "GITHUB_FORGET_TOKEN": {
                ghToken = null;
                await figma.clientStorage
                    .deleteAsync("github_token_b64")
                    .catch(() => {
                        /* ignore */
                    });
                deps.send({
                    type: "INFO",
                    payload: { message: "GitHub: Token cleared." },
                });
                deps.send({
                    type: "GITHUB_AUTH_RESULT",
                    payload: { ok: false, remember: false },
                });
                deps.send({ type: "GITHUB_REPOS", payload: { repos: [] } });
                return true;
            }

            case "GITHUB_SELECT_REPO": {
                const sel = await getSelected();
                await setSelected({
                    owner: msg.payload.owner,
                    repo: msg.payload.repo,
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
                return true;
            }

            case "GITHUB_SELECT_BRANCH": {
                const sel = await getSelected();
                await setSelected({
                    owner: msg.payload.owner || sel.owner,
                    repo: msg.payload.repo || sel.repo,
                    branch: msg.payload.branch,
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
                return true;
            }

            case "GITHUB_SET_FOLDER": {
                const folderResult = normalizeFolderForStorage(
                    String(msg.payload.folder ?? "")
                );
                if (!folderResult.ok) {
                    deps.send({
                        type: "ERROR",
                        payload: { message: folderResult.message },
                    });
                    return true;
                }
                const folder = folderResult.storage;
                const sel = await getSelected();
                await setSelected({
                    owner: msg.payload.owner || sel.owner,
                    repo: msg.payload.repo || sel.repo,
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
                return true;
            }

            case "GITHUB_SAVE_STATE": {
                const update: Partial<GhSelected> = {};
                if (typeof msg.payload.owner === "string")
                    update.owner = msg.payload.owner;
                if (typeof msg.payload.repo === "string")
                    update.repo = msg.payload.repo;
                if (typeof msg.payload.branch === "string")
                    update.branch = msg.payload.branch;
                if (typeof msg.payload.folder === "string") {
                    const folderResult = normalizeFolderForStorage(
                        msg.payload.folder
                    );
                    if (folderResult.ok) update.folder = folderResult.storage;
                    else
                        deps.send({
                            type: "ERROR",
                            payload: { message: folderResult.message },
                        });
                }
                if (typeof msg.payload.filename === "string")
                    update.filename = msg.payload.filename.trim();
                if (typeof msg.payload.commitMessage === "string")
                    update.commitMessage = msg.payload.commitMessage;
                if (
                    msg.payload.scope === "all" ||
                    msg.payload.scope === "selected" ||
                    msg.payload.scope === "typography"
                ) {
                    update.scope = msg.payload.scope;
                }
                if (typeof msg.payload.collection === "string")
                    update.collection = msg.payload.collection;
                if (typeof msg.payload.mode === "string")
                    update.mode = msg.payload.mode;
                if (typeof msg.payload.styleDictionary === "boolean")
                    update.styleDictionary = msg.payload.styleDictionary;
                if (typeof msg.payload.flatTokens === "boolean")
                    update.flatTokens = msg.payload.flatTokens;
                if (typeof msg.payload.createPr === "boolean")
                    update.createPr = msg.payload.createPr;
                if (typeof msg.payload.prBase === "string")
                    update.prBase = msg.payload.prBase;
                if (typeof msg.payload.prTitle === "string")
                    update.prTitle = msg.payload.prTitle;
                if (typeof msg.payload.prBody === "string")
                    update.prBody = msg.payload.prBody;
                await mergeSelected(update);
                return true;
            }

            case "GITHUB_FETCH_BRANCHES": {
                const owner = String(msg.payload.owner || "");
                const repo = String(msg.payload.repo || "");
                const page = Number.isFinite(msg.payload.page)
                    ? Number(msg.payload.page)
                    : 1;
                const force = !!msg.payload.force;

                if (!ghToken) {
                    deps.send({
                        type: "GITHUB_BRANCHES_ERROR",
                        payload: {
                            owner,
                            repo,
                            status: 401,
                            message: "No token",
                        },
                    });
                    return true;
                }

                const res = await ghListBranches(
                    ghToken,
                    owner,
                    repo,
                    page,
                    force
                );
                if (res.ok) {
                    deps.send({ type: "GITHUB_BRANCHES", payload: res });
                    if (page === 1 && res.defaultBranch) {
                        await mergeSelected({
                            owner,
                            repo,
                            branch: res.defaultBranch,
                            prBase: res.defaultBranch,
                        });
                    }
                } else {
                    deps.send({ type: "GITHUB_BRANCHES_ERROR", payload: res });
                }
                return true;
            }

            case "GITHUB_FOLDER_LIST": {
                const owner = String(msg.payload.owner || "");
                const repo = String(msg.payload.repo || "");
                const branch = String(msg.payload.branch || "");
                const pathRaw = String(msg.payload.path || "");

                if (!ghToken) {
                    deps.send({
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
                    return true;
                }

                const normalizedPath = normalizeFolderForStorage(pathRaw);
                if (!normalizedPath.ok) {
                    deps.send({
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
                    return true;
                }
                const commitPathResult = folderStorageToCommitPath(
                    normalizedPath.storage
                );
                if (!commitPathResult.ok) {
                    deps.send({
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
                    return true;
                }

                const folderPath = commitPathResult.path;
                if (folderPath) {
                    const collision = await ensureFolderPathWritable(
                        ghToken,
                        owner,
                        repo,
                        branch,
                        folderPath
                    );
                    if (!collision.ok) {
                        deps.send({
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
                        return true;
                    }
                }

                const res = await ghListDirs(
                    ghToken,
                    owner,
                    repo,
                    branch,
                    commitPathResult.path
                );
                if (res.ok) {
                    deps.send({
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
                    deps.send({
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
                return true;
            }

            case "GITHUB_CREATE_FOLDER": {
                const owner = String(msg.payload.owner || "");
                const repo = String(msg.payload.repo || "");
                const branch = String(msg.payload.branch || "");
                const folderPathRaw = String(
                    (msg.payload as any).folderPath || msg.payload.path || ""
                ).trim();

                if (!ghToken) {
                    deps.send({
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
                    return true;
                }

                const folderNormalized =
                    normalizeFolderForStorage(folderPathRaw);
                if (!folderNormalized.ok) {
                    deps.send({
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
                    return true;
                }

                const folderCommit = folderStorageToCommitPath(
                    folderNormalized.storage
                );
                if (!folderCommit.ok) {
                    deps.send({
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
                    return true;
                }
                if (!folderCommit.path) {
                    deps.send({
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
                    return true;
                }

                const res = await ghEnsureFolder(
                    ghToken,
                    owner,
                    repo,
                    branch,
                    folderCommit.path
                );
                deps.send({
                    type: "GITHUB_CREATE_FOLDER_RESULT",
                    payload: res,
                });
                return true;
            }

            case "GITHUB_CREATE_BRANCH": {
                const owner = String(msg.payload.owner || "");
                const repo = String(msg.payload.repo || "");
                const baseBranch = String(msg.payload.baseBranch || "");
                const newBranch = String(msg.payload.newBranch || "");

                if (!ghToken) {
                    deps.send({
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
                    return true;
                }
                if (!owner || !repo || !baseBranch || !newBranch) {
                    deps.send({
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
                    return true;
                }

                const res = await ghCreateBranch(
                    ghToken,
                    owner,
                    repo,
                    newBranch,
                    baseBranch
                );
                if (res.ok) {
                    await mergeSelected({ owner, repo, branch: newBranch });
                }
                deps.send({
                    type: "GITHUB_CREATE_BRANCH_RESULT",
                    payload: res,
                });
                return true;
            }

            case "GITHUB_FETCH_TOKENS": {
                const owner = String(msg.payload.owner || "");
                const repo = String(msg.payload.repo || "");
                const branch = String(msg.payload.branch || "");
                const pathRaw = String(msg.payload.path || "");
                const allowHex = !!msg.payload.allowHexStrings;

                if (!ghToken) {
                    deps.send({
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
                    return true;
                }
                if (!owner || !repo || !branch || !pathRaw.trim()) {
                    deps.send({
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
                    return true;
                }

                const normalizedPath = normalizeFolderForStorage(pathRaw);
                if (!normalizedPath.ok) {
                    deps.send({
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
                    return true;
                }
                const commitPathResult = folderStorageToCommitPath(
                    normalizedPath.storage
                );
                if (!commitPathResult.ok) {
                    deps.send({
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
                    return true;
                }
                const path = commitPathResult.path;

                const res = await ghGetFileContents(
                    ghToken,
                    owner,
                    repo,
                    branch,
                    path
                );
                if (!res.ok) {
                    deps.send({
                        type: "GITHUB_FETCH_TOKENS_RESULT",
                        payload: res,
                    });
                    if (res.samlRequired) {
                        deps.send({
                            type: "ERROR",
                            payload: {
                                message:
                                    "GitHub: SSO required for this repository. Authorize your PAT and try again.",
                            },
                        });
                    }
                    return true;
                }

                try {
                    const json = JSON.parse(res.contentText || "{}");
                    const contexts = Array.isArray(msg.payload.contexts)
                        ? msg.payload.contexts.map((c) => String(c))
                        : [];
                    const summary = await deps.importDtcg(json, {
                        allowHexStrings: allowHex,
                        contexts,
                    });
                    deps.send({
                        type: "GITHUB_FETCH_TOKENS_RESULT",
                        payload: { ok: true, owner, repo, branch, path, json },
                    });
                    deps.send({
                        type: "INFO",
                        payload: {
                            message: `Imported tokens from ${owner}/${repo}@${branch}:${path}`,
                        },
                    });
                    deps.send({
                        type: "IMPORT_SUMMARY",
                        payload: {
                            summary,
                            timestamp: Date.now(),
                            source: "github",
                        },
                    });

                    const snap = await deps.snapshotCollectionsForUi();
                    const last = await figma.clientStorage
                        .getAsync("lastSelection")
                        .catch(() => null);
                    const exportAllPrefVal = await figma.clientStorage
                        .getAsync("exportAllPref")
                        .catch(() => false);
                    const styleDictionaryPrefVal = await figma.clientStorage
                        .getAsync("styleDictionaryPref")
                        .catch(() => false);
                    const flatTokensPrefVal = await figma.clientStorage
                        .getAsync("flatTokensPref")
                        .catch(() => false);
                    const allowHexPrefStored = await figma.clientStorage
                        .getAsync("allowHexPref")
                        .catch(() => null);
                    const githubRememberPrefStored = await figma.clientStorage
                        .getAsync("githubRememberPref")
                        .catch(() => null);
                    const allowHexPrefVal =
                        typeof allowHexPrefStored === "boolean"
                            ? allowHexPrefStored
                            : true;
                    const githubRememberPrefVal =
                        typeof githubRememberPrefStored === "boolean"
                            ? githubRememberPrefStored
                            : true;
                    const lastOrNull =
                        last &&
                        typeof last.collection === "string" &&
                        typeof last.mode === "string"
                            ? last
                            : null;
                    deps.send({
                        type: "COLLECTIONS_DATA",
                        payload: {
                            collections: snap.collections,
                            last: lastOrNull,
                            exportAllPref: !!exportAllPrefVal,
                            styleDictionaryPref: !!styleDictionaryPrefVal,
                            flatTokensPref: !!flatTokensPrefVal,
                            allowHexPref: allowHexPrefVal,
                            githubRememberPref: githubRememberPrefVal,
                        },
                    });
                    deps.send({
                        type: "RAW_COLLECTIONS_TEXT",
                        payload: { text: snap.rawText },
                    });
                } catch (err) {
                    const msgText = (err as Error)?.message || "Invalid JSON";
                    deps.send({
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
                    deps.send({
                        type: "ERROR",
                        payload: {
                            message: `GitHub import failed: ${msgText}`,
                        },
                    });
                }
                return true;
            }

            case "GITHUB_EXPORT_FILES": {
                const scope: GithubScope =
                    msg.payload.scope === "all"
                        ? "all"
                        : msg.payload.scope === "typography"
                        ? "typography"
                        : "selected";
                const collection = String(msg.payload.collection || "");
                const mode = String(msg.payload.mode || "");
                const styleDictionary = !!msg.payload.styleDictionary;
                const flatTokens = !!msg.payload.flatTokens;

                try {
                    if (scope === "all") {
                        const all = await deps.exportDtcg({
                            format: "single",
                            styleDictionary,
                            flatTokens,
                        });
                        deps.send({
                            type: "GITHUB_EXPORT_FILES_RESULT",
                            payload: { files: all.files },
                        });
                    } else if (scope === "typography") {
                        const typo = await deps.exportDtcg({
                            format: "typography",
                        });
                        deps.send({
                            type: "GITHUB_EXPORT_FILES_RESULT",
                            payload: { files: typo.files },
                        });
                    } else {
                        if (!collection || !mode) {
                            deps.send({
                                type: "GITHUB_EXPORT_FILES_RESULT",
                                payload: { files: [] },
                            });
                            deps.send({
                                type: "ERROR",
                                payload: {
                                    message:
                                        "GitHub: choose collection and mode before exporting.",
                                },
                            });
                            return true;
                        }
                        const per = await deps.exportDtcg({
                            format: "perMode",
                            styleDictionary,
                            flatTokens,
                        });
                        const prettyExact = `${collection} - ${mode}.json`;
                        const prettyLoose = `${collection} - ${mode}`;
                        const legacy1 = `${collection}_mode=${mode}`;
                        const legacy2 = `${collection}/mode=${mode}`;
                        const legacy3 = deps.safeKeyFromCollectionAndMode(
                            collection,
                            mode
                        );
                        let picked = per.files.find((f) => {
                            const n = String(f?.name || "");
                            return (
                                n === prettyExact ||
                                n === prettyLoose ||
                                n.includes(`${collection} - ${mode}`)
                            );
                        });
                        if (!picked) {
                            picked = per.files.find((f) => {
                                const n = String(f?.name || "");
                                return (
                                    n.includes(legacy1) ||
                                    n.includes(legacy2) ||
                                    n.includes(legacy3)
                                );
                            });
                        }
                        const files = picked ? [picked] : per.files;
                        deps.send({
                            type: "GITHUB_EXPORT_FILES_RESULT",
                            payload: { files },
                        });
                    }
                } catch (err) {
                    const msgText =
                        (err as Error)?.message || "Failed to export";
                    deps.send({
                        type: "ERROR",
                        payload: {
                            message: `GitHub export failed: ${msgText}`,
                        },
                    });
                    deps.send({
                        type: "GITHUB_EXPORT_FILES_RESULT",
                        payload: { files: [] },
                    });
                }
                return true;
            }

            case "GITHUB_EXPORT_AND_COMMIT": {
                const owner = String(msg.payload.owner || "");
                const repo = String(msg.payload.repo || "");
                const baseBranch = String(msg.payload.branch || "");
                const folderRaw =
                    typeof msg.payload.folder === "string"
                        ? msg.payload.folder
                        : "";
                const commitMessage = (
                    String(msg.payload.commitMessage || "") ||
                    "Update tokens from Figma"
                ).trim();
                const requestedScope: GithubScope =
                    msg.payload.scope === "all"
                        ? "all"
                        : msg.payload.scope === "typography"
                        ? "typography"
                        : "selected";
                let scope: GithubScope = requestedScope;
                const collection = String(msg.payload.collection || "");
                const mode = String(msg.payload.mode || "");
                const styleDictionary = !!msg.payload.styleDictionary;
                const flatTokens = !!msg.payload.flatTokens;
                const createPr = !!msg.payload.createPr;
                const prBaseBranch = createPr
                    ? String(msg.payload.prBase || "")
                    : "";
                const prTitle =
                    String(msg.payload.prTitle || commitMessage).trim() ||
                    commitMessage;
                const prBody =
                    typeof msg.payload.prBody === "string"
                        ? msg.payload.prBody
                        : undefined;
                const storedSelection = await getSelected();
                const selectionCollection =
                    collection ||
                    (typeof storedSelection.collection === "string"
                        ? storedSelection.collection
                        : "");
                const selectionMode =
                    mode ||
                    (typeof storedSelection.mode === "string"
                        ? storedSelection.mode
                        : "");
                const filenameCandidate =
                    typeof msg.payload.filename === "string"
                        ? msg.payload.filename
                        : typeof storedSelection.filename === "string"
                        ? storedSelection.filename
                        : undefined;
                const filenameCheck = validateGithubFilename(
                    filenameCandidate ?? DEFAULT_GITHUB_FILENAME
                );
                if (!filenameCheck.ok) {
                    deps.send({
                        type: "GITHUB_COMMIT_RESULT",
                        payload: {
                            ok: false,
                            owner,
                            repo,
                            branch: baseBranch,
                            status: 400,
                            message: filenameCheck.message,
                            folder: folderRaw || "",
                            filename: filenameCandidate,
                        },
                    });
                    return true;
                }
                const filenameToCommit = filenameCheck.filename;

                if (!ghToken) {
                    deps.send({
                        type: "GITHUB_COMMIT_RESULT",
                        payload: {
                            ok: false,
                            owner,
                            repo,
                            branch: baseBranch,
                            status: 401,
                            message: "No token",
                            folder: folderRaw || "",
                            filename: filenameToCommit,
                        },
                    });
                    return true;
                }
                if (!owner || !repo || !baseBranch) {
                    deps.send({
                        type: "GITHUB_COMMIT_RESULT",
                        payload: {
                            ok: false,
                            owner,
                            repo,
                            branch: baseBranch,
                            status: 400,
                            message: "Missing owner/repo/branch",
                            folder: folderRaw || "",
                            filename: filenameToCommit,
                        },
                    });
                    return true;
                }
                if (!commitMessage) {
                    deps.send({
                        type: "GITHUB_COMMIT_RESULT",
                        payload: {
                            ok: false,
                            owner,
                            repo,
                            branch: baseBranch,
                            status: 400,
                            message: "Empty commit message",
                            folder: folderRaw || "",
                            filename: filenameToCommit,
                        },
                    });
                    return true;
                }

                const folderInfo = await getSelectedFolderForCommit(folderRaw);
                if (!folderInfo.ok) {
                    deps.send({
                        type: "GITHUB_COMMIT_RESULT",
                        payload: {
                            ok: false,
                            owner,
                            repo,
                            branch: baseBranch,
                            status: 400,
                            message: folderInfo.message,
                            folder: folderRaw || "",
                            filename: filenameToCommit,
                        },
                    });
                    return true;
                }

                if (folderInfo.path) {
                    const folderCheck = await ensureFolderPathWritable(
                        ghToken,
                        owner,
                        repo,
                        baseBranch,
                        folderInfo.path
                    );
                    if (!folderCheck.ok) {
                        deps.send({
                            type: "GITHUB_COMMIT_RESULT",
                            payload: {
                                ok: false,
                                owner,
                                repo,
                                branch: baseBranch,
                                status: folderCheck.status,
                                message: folderCheck.message,
                                folder: folderInfo.storage,
                                filename: filenameToCommit,
                            },
                        });
                        return true;
                    }
                }

                if (createPr && !prBaseBranch) {
                    deps.send({
                        type: "GITHUB_COMMIT_RESULT",
                        payload: {
                            ok: false,
                            owner,
                            repo,
                            branch: baseBranch,
                            status: 400,
                            message:
                                "Unable to determine target branch for pull request.",
                            folder: folderInfo.storage,
                            filename: filenameToCommit,
                        },
                    });
                    return true;
                }
                if (createPr && prBaseBranch === baseBranch) {
                    deps.send({
                        type: "GITHUB_COMMIT_RESULT",
                        payload: {
                            ok: false,
                            owner,
                            repo,
                            branch: baseBranch,
                            status: 400,
                            message:
                                "Selected branch matches PR target branch. Choose a different branch before creating a PR.",
                            folder: folderInfo.storage,
                            filename: filenameToCommit,
                        },
                    });
                    return true;
                }

                const folderStorageValue = folderInfo.storage;
                const folderCommitPath = folderInfo.path;
                const fullPathForCommit = folderCommitPath
                    ? `${folderCommitPath}/${filenameToCommit}`
                    : filenameToCommit;

                const selectionState: Partial<GhSelected> = {
                    owner,
                    repo,
                    branch: baseBranch,
                    folder: folderInfo.storage,
                    filename: filenameToCommit,
                    commitMessage,
                    scope,
                    styleDictionary: msg.payload.styleDictionary,
                    flatTokens: msg.payload.flatTokens,
                    createPr,
                    prBase: createPr ? prBaseBranch : undefined,
                    prTitle: createPr ? prTitle : undefined,
                    prBody: createPr ? prBody : undefined,
                };
                if (selectionCollection)
                    selectionState.collection = selectionCollection;
                if (selectionMode) selectionState.mode = selectionMode;
                await mergeSelected(selectionState);

                try {
                    const files: Array<{ name: string; json: unknown }> = [];

                    if (scope === "all") {
                        const all = await deps.exportDtcg({
                            format: "single",
                            styleDictionary,
                            flatTokens,
                        });
                        for (const f of all.files)
                            files.push({ name: f.name, json: f.json });
                    } else if (scope === "typography") {
                        const typo = await deps.exportDtcg({
                            format: "typography",
                        });
                        for (const f of typo.files)
                            files.push({ name: f.name, json: f.json });
                    } else {
                        if (!selectionCollection || !selectionMode) {
                            deps.send({
                                type: "GITHUB_COMMIT_RESULT",
                                payload: {
                                    ok: false,
                                    owner,
                                    repo,
                                    branch: baseBranch,
                                    status: 400,
                                    message: "Pick a collection and a mode.",
                                    folder: folderStorageValue,
                                    filename: filenameToCommit,
                                    fullPath: fullPathForCommit,
                                },
                            });
                            return true;
                        }
                        const per = await deps.exportDtcg({
                            format: "perMode",
                            styleDictionary,
                            flatTokens,
                        });
                        const picked = pickPerModeFile(
                            per.files,
                            selectionCollection,
                            selectionMode
                        );
                        if (!picked) {
                            const available = per.files
                                .map((f) => f.name)
                                .join(", ");
                            deps.send({
                                type: "GITHUB_COMMIT_RESULT",
                                payload: {
                                    ok: false,
                                    owner,
                                    repo,
                                    branch: baseBranch,
                                    status: 404,
                                    message: `No export found for "${selectionCollection}" / "${selectionMode}". Available: [${available}]`,
                                    folder: folderStorageValue,
                                    filename: filenameToCommit,
                                    fullPath: fullPathForCommit,
                                },
                            });
                            return true;
                        }
                        files.push({ name: picked.name, json: picked.json });
                    }

                    if (files.length > 1) {
                        deps.send({
                            type: "GITHUB_COMMIT_RESULT",
                            payload: {
                                ok: false,
                                owner,
                                repo,
                                branch: baseBranch,
                                status: 400,
                                message:
                                    "GitHub: Custom filename requires a single export file. Adjust scope or disable extra formats.",
                                folder: folderStorageValue,
                                filename: filenameToCommit,
                                fullPath: fullPathForCommit,
                            },
                        });
                        return true;
                    }

                    const isPlainEmptyObject = (v: any) =>
                        v &&
                        typeof v === "object" &&
                        !Array.isArray(v) &&
                        Object.keys(v).length === 0;
                    let exportLooksEmpty =
                        files.length === 0 ||
                        files.every((f) => isPlainEmptyObject(f.json));

                    if (exportLooksEmpty) {
                        if (scope === "typography") {
                            const warningMessage =
                                "GitHub export warning: typography.json is empty (no local text styles). Nothing to commit.";
                            deps.send({
                                type: "GITHUB_COMMIT_RESULT",
                                payload: {
                                    ok: false,
                                    owner,
                                    repo,
                                    branch: baseBranch,
                                    status: 412,
                                    message: warningMessage,
                                    folder: folderStorageValue,
                                    filename: filenameToCommit,
                                    fullPath: fullPathForCommit,
                                },
                            });
                            return true;
                        }
                        if (exportLooksEmpty && scope === "selected") {
                            const diag = await deps.analyzeSelectionState(
                                selectionCollection,
                                selectionMode
                            );
                            const tail = diag.ok
                                ? `Found ${
                                      diag.variableCount
                                  } variable(s) in "${selectionCollection}", but ${
                                      diag.variablesWithValues ?? 0
                                  } with a value in "${selectionMode}".`
                                : diag.message || "No values present.";
                            deps.send({
                                type: "GITHUB_COMMIT_RESULT",
                                payload: {
                                    ok: false,
                                    owner,
                                    repo,
                                    branch: baseBranch,
                                    status: 412,
                                    message: `Export for "${selectionCollection}" / "${selectionMode}" produced an empty tokens file. ${tail}`,
                                    folder: folderStorageValue,
                                    filename: filenameToCommit,
                                    fullPath: fullPathForCommit,
                                },
                            });
                            return true;
                        }
                        if (exportLooksEmpty) {
                            deps.send({
                                type: "GITHUB_COMMIT_RESULT",
                                payload: {
                                    ok: false,
                                    owner,
                                    repo,
                                    branch: baseBranch,
                                    status: 412,
                                    message:
                                        "Export produced an empty tokens file. Ensure this file contains local Variables with values.",
                                    folder: folderStorageValue,
                                    filename: filenameToCommit,
                                    fullPath: fullPathForCommit,
                                },
                            });
                            return true;
                        }
                    }

                    const prettyExportName = (
                        original: string | undefined | null
                    ): string => {
                        const name =
                            original && typeof original === "string"
                                ? original
                                : "tokens.json";
                        const m = name.match(/^(.*)_mode=(.*)\.tokens\.json$/);
                        if (m) return `${m[1].trim()} - ${m[2].trim()}.json`;
                        return name.endsWith(".json") ? name : name + ".json";
                    };
                    const prefix = folderCommitPath
                        ? folderCommitPath + "/"
                        : "";
                    const commitFiles = files.map((f) => {
                        const resolvedName =
                            files.length === 1
                                ? filenameToCommit
                                : prettyExportName(f.name);
                        return {
                            path: prefix + resolvedName,
                            content: JSON.stringify(f.json, null, 2) + "\n",
                        };
                    });

                    const normalizeForCompare = (text: string): string =>
                        text.replace(/\r\n/g, "\n").trimEnd();
                    const tryParseJson = (
                        text: string
                    ): unknown | undefined => {
                        try {
                            return JSON.parse(text);
                        } catch {
                            return undefined;
                        }
                    };
                    const canonicalizeJson = (value: unknown): unknown => {
                        if (Array.isArray(value)) {
                            return value.map((item) => canonicalizeJson(item));
                        }
                        if (value && typeof value === "object") {
                            const proto = Object.getPrototypeOf(value);
                            if (proto === Object.prototype || proto === null) {
                                const record = value as Record<string, unknown>;
                                const sortedKeys = Object.keys(record).sort();
                                const canonical: Record<string, unknown> = {};
                                for (const key of sortedKeys)
                                    canonical[key] = canonicalizeJson(
                                        record[key]
                                    );
                                return canonical;
                            }
                        }
                        return value;
                    };
                    const contentsMatch = (
                        existing: string,
                        nextContent: string
                    ): boolean => {
                        if (existing === nextContent) return true;
                        if (
                            normalizeForCompare(existing) ===
                            normalizeForCompare(nextContent)
                        )
                            return true;
                        const existingJson = tryParseJson(existing);
                        const nextJson = tryParseJson(nextContent);
                        if (
                            existingJson !== undefined &&
                            nextJson !== undefined
                        ) {
                            return (
                                JSON.stringify(
                                    canonicalizeJson(existingJson)
                                ) === JSON.stringify(canonicalizeJson(nextJson))
                            );
                        }
                        return false;
                    };

                    let allFilesIdentical = commitFiles.length > 0;
                    for (const file of commitFiles) {
                        const current = await ghGetFileContents(
                            ghToken,
                            owner,
                            repo,
                            baseBranch,
                            file.path
                        );
                        if (!current.ok) {
                            if (current.status === 404) {
                                allFilesIdentical = false;
                                break;
                            }
                            // If we cannot read the current file (permissions, SAML, etc.), assume changes are needed.
                            allFilesIdentical = false;
                            break;
                        }
                        if (!contentsMatch(current.contentText, file.content)) {
                            allFilesIdentical = false;
                            break;
                        }
                    }

                    if (allFilesIdentical) {
                        const noChangeMessage =
                            scope === "selected"
                                ? `No token values changed for "${selectionCollection}" / "${selectionMode}"; repository already matches the current export.`
                                : "No token values changed; repository already matches the current export.";
                        deps.send({
                            type: "GITHUB_COMMIT_RESULT",
                            payload: {
                                ok: false,
                                owner,
                                repo,
                                branch: baseBranch,
                                status: 304,
                                message: noChangeMessage,
                                folder: folderStorageValue,
                                filename: filenameToCommit,
                                fullPath: fullPathForCommit,
                            },
                        });
                        return true;
                    }

                    const commitRes = await ghCommitFiles(
                        ghToken,
                        owner,
                        repo,
                        baseBranch,
                        commitMessage,
                        commitFiles
                    );
                    if (!commitRes.ok) {
                        const looksLikeFastForwardRace =
                            commitRes.status === 422 &&
                            typeof commitRes.message === "string" &&
                            /not a fast forward/i.test(commitRes.message);
                        if (looksLikeFastForwardRace) {
                            const noChangeMessage =
                                scope === "selected"
                                    ? `No token values changed for "${selectionCollection}" / "${selectionMode}"; repository already matches the current export.`
                                    : "No token values changed; repository already matches the current export.";
                            deps.send({
                                type: "GITHUB_COMMIT_RESULT",
                                payload: {
                                    ok: false,
                                    owner,
                                    repo,
                                    branch: baseBranch,
                                    status: 304,
                                    message: noChangeMessage,
                                    folder: folderStorageValue,
                                    filename: filenameToCommit,
                                    fullPath: fullPathForCommit,
                                },
                            });
                            return true;
                        }
                        deps.send({
                            type: "GITHUB_COMMIT_RESULT",
                            payload: {
                                ...commitRes,
                                folder: folderStorageValue,
                                filename: filenameToCommit,
                                fullPath: fullPathForCommit,
                            },
                        });
                        deps.send({
                            type: "ERROR",
                            payload: {
                                message: `GitHub: Commit failed (${commitRes.status}): ${commitRes.message}`,
                            },
                        });
                        return true;
                    }

                    let prResult:
                        | Awaited<ReturnType<typeof ghCreatePullRequest>>
                        | undefined;
                    if (createPr) {
                        prResult = await ghCreatePullRequest(
                            ghToken,
                            owner,
                            repo,
                            {
                                title: prTitle,
                                head: baseBranch,
                                base: prBaseBranch,
                                body: prBody,
                            }
                        );
                    }

                    const commitOkPayload = {
                        ok: true as const,
                        owner,
                        repo,
                        branch: baseBranch,
                        folder: folderStorageValue,
                        filename: filenameToCommit,
                        fullPath: fullPathForCommit,
                        commitSha: commitRes.commitSha,
                        commitUrl: commitRes.commitUrl,
                        treeUrl: commitRes.treeUrl,
                        rate: commitRes.rate,
                        createdPr:
                            prResult && prResult.ok
                                ? {
                                      number: prResult.number,
                                      url: prResult.url,
                                      base: prResult.base,
                                      head: prResult.head,
                                  }
                                : undefined,
                    };
                    deps.send({
                        type: "GITHUB_COMMIT_RESULT",
                        payload: commitOkPayload,
                    });

                    deps.send({
                        type: "INFO",
                        payload: {
                            message: `Committed ${commitFiles.length} file(s) to ${owner}/${repo}@${baseBranch}`,
                        },
                    });
                    if (createPr) {
                        if (prResult && prResult.ok) {
                            deps.send({
                                type: "GITHUB_PR_RESULT",
                                payload: prResult,
                            });
                            deps.send({
                                type: "INFO",
                                payload: {
                                    message: `PR created: ${prResult.url}`,
                                },
                            });
                        } else if (prResult) {
                            deps.send({
                                type: "GITHUB_PR_RESULT",
                                payload: prResult,
                            });
                            deps.send({
                                type: "ERROR",
                                payload: {
                                    message: `GitHub: PR creation failed (${prResult.status}): ${prResult.message}`,
                                },
                            });
                        }
                    }
                } catch (e) {
                    const msgText = (e as Error)?.message || "unknown error";
                    deps.send({
                        type: "GITHUB_COMMIT_RESULT",
                        payload: {
                            ok: false,
                            owner,
                            repo,
                            branch: baseBranch,
                            status: 0,
                            message: msgText,
                            folder: folderStorageValue,
                            filename: filenameToCommit,
                            fullPath: fullPathForCommit,
                        },
                    });
                }
                return true;
            }

            default:
                return false;
        }
    }

    async function onUiReady(): Promise<void> {
        await restoreGithubTokenAndVerify();
        const sel = await getSelected();
        if (sel.owner && sel.repo) {
            deps.send({ type: "GITHUB_RESTORE_SELECTED", payload: sel });
        }
    }

    return { handle, onUiReady };
}
