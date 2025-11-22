import {
    ghGetFileContents,
    ghCommitFiles,
    ghCreatePullRequest,
} from "../../../core/github/api";
import type { DispatcherContext, GhSelected } from "./types";
import { validateGithubFilename, DEFAULT_GITHUB_FILENAME } from "../filenames";
import {
    getSelected,
    mergeSelected,
    getLastCommitSignature,
    setLastCommitSignature,
} from "./state";
import {
    ensureFolderPathWritable,
    getSelectedFolderForCommit,
} from "./folders";
import type { GithubScope, UiToPlugin } from "../../messages";

type ExportFilesPayload = Extract<
    UiToPlugin,
    { type: "GITHUB_EXPORT_FILES" }
>["payload"];
type ExportAndCommitPayload = Extract<
    UiToPlugin,
    { type: "GITHUB_EXPORT_AND_COMMIT" }
>["payload"];

function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function pickPerModeFile(
    files: Array<{ name: string; json: unknown }>,
    collectionName: string,
    modeName: string,
    safeKeyFn: (c: string, m: string) => string
): { name: string; json: unknown } | null {
    const prettyExact = `${collectionName} - ${modeName}.json`;
    const prettyLoose = `${collectionName} - ${modeName}`;
    const legacy1 = `${collectionName}_mode=${modeName}`;
    const legacy2 = `${collectionName}/mode=${modeName}`;
    const legacy3 = safeKeyFn(collectionName, modeName);

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

export async function handleExportFiles(
    ctx: DispatcherContext,
    payload: ExportFilesPayload
): Promise<void> {
    const scope: GithubScope =
        payload.scope === "all"
            ? "all"
            : payload.scope === "typography"
            ? "typography"
            : "selected";
    const collection = String(payload.collection || "");
    const mode = String(payload.mode || "");
    const styleDictionary = !!payload.styleDictionary;
    const flatTokens = !!payload.flatTokens;

    try {
        if (scope === "all") {
            const all = await ctx.deps.exportDtcg({
                format: "single",
                styleDictionary,
                flatTokens,
            });
            ctx.deps.send({
                type: "GITHUB_EXPORT_FILES_RESULT",
                payload: { files: all.files },
            });
        } else if (scope === "typography") {
            const typo = await ctx.deps.exportDtcg({
                format: "typography",
            });
            ctx.deps.send({
                type: "GITHUB_EXPORT_FILES_RESULT",
                payload: { files: typo.files },
            });
        } else {
            if (!collection || !mode) {
                ctx.deps.send({
                    type: "GITHUB_EXPORT_FILES_RESULT",
                    payload: { files: [] },
                });
                ctx.deps.send({
                    type: "ERROR",
                    payload: {
                        message:
                            "GitHub: choose collection and mode before exporting.",
                    },
                });
                return;
            }
            const per = await ctx.deps.exportDtcg({
                format: "perMode",
                styleDictionary,
                flatTokens,
            });
            const picked = pickPerModeFile(
                per.files,
                collection,
                mode,
                ctx.deps.safeKeyFromCollectionAndMode
            );
            const files = picked ? [picked] : per.files;
            ctx.deps.send({
                type: "GITHUB_EXPORT_FILES_RESULT",
                payload: { files },
            });
        }
    } catch (err) {
        const msgText = (err as Error)?.message || "Failed to export";
        ctx.deps.send({
            type: "ERROR",
            payload: {
                message: `GitHub export failed: ${msgText}`,
            },
        });
        ctx.deps.send({
            type: "GITHUB_EXPORT_FILES_RESULT",
            payload: { files: [] },
        });
    }
}

export async function handleExportAndCommit(
    ctx: DispatcherContext,
    payload: ExportAndCommitPayload
): Promise<void> {
    const owner = String(payload.owner || "");
    const repo = String(payload.repo || "");
    const baseBranch = String(payload.branch || "");
    const folderRaw = typeof payload.folder === "string" ? payload.folder : "";
    const commitMessage = (
        String(payload.commitMessage || "") || "Update tokens from Figma"
    ).trim();
    const requestedScope: GithubScope =
        payload.scope === "all"
            ? "all"
            : payload.scope === "typography"
            ? "typography"
            : "selected";
    const scope: GithubScope = requestedScope;
    const collection = String(payload.collection || "");
    const mode = String(payload.mode || "");
    const styleDictionary = !!payload.styleDictionary;
    const flatTokens = !!payload.flatTokens;
    const createPr = !!payload.createPr;
    const prBaseBranch = createPr ? String(payload.prBase || "") : "";
    const prTitle =
        String(payload.prTitle || commitMessage).trim() || commitMessage;
    const prBody =
        typeof payload.prBody === "string" ? payload.prBody : undefined;
    const storedSelection = await getSelected();
    const selectionCollection =
        collection ||
        (typeof storedSelection.collection === "string"
            ? storedSelection.collection
            : "");
    const selectionMode =
        mode ||
        (typeof storedSelection.mode === "string" ? storedSelection.mode : "");
    const filenameCandidate =
        typeof payload.filename === "string"
            ? payload.filename
            : typeof storedSelection.filename === "string"
            ? storedSelection.filename
            : undefined;
    const filenameCheck = validateGithubFilename(
        filenameCandidate ?? DEFAULT_GITHUB_FILENAME
    );
    if (!filenameCheck.ok) {
        ctx.deps.send({
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
        return;
    }
    const filenameToCommit = filenameCheck.filename;

    if (!ctx.state.token) {
        ctx.deps.send({
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
        return;
    }
    if (!owner || !repo || !baseBranch) {
        ctx.deps.send({
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
        return;
    }
    if (!commitMessage) {
        ctx.deps.send({
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
        return;
    }

    const folderInfo = await getSelectedFolderForCommit(folderRaw);
    if (!folderInfo.ok) {
        ctx.deps.send({
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
        return;
    }

    if (folderInfo.path) {
        const folderCheck = await ensureFolderPathWritable(
            ctx.state.token,
            owner,
            repo,
            baseBranch,
            folderInfo.path
        );
        if (!folderCheck.ok) {
            ctx.deps.send({
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
            return;
        }
    }

    if (createPr && !prBaseBranch) {
        ctx.deps.send({
            type: "GITHUB_COMMIT_RESULT",
            payload: {
                ok: false,
                owner,
                repo,
                branch: baseBranch,
                status: 400,
                message: "Unable to determine target branch for pull request.",
                folder: folderInfo.storage,
                filename: filenameToCommit,
            },
        });
        return;
    }
    if (createPr && prBaseBranch === baseBranch) {
        ctx.deps.send({
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
        return;
    }

    const folderStorageValue = folderInfo.storage;
    const folderCommitPath = folderInfo.path;
    const fullPathForCommit = folderCommitPath
        ? `${folderCommitPath}/${filenameToCommit}`
        : filenameToCommit;
    const lastCommitSignature = (await getLastCommitSignature()) || null;
    const sameTargetAsLastCommit =
        !!lastCommitSignature &&
        lastCommitSignature.branch === baseBranch &&
        lastCommitSignature.fullPath === fullPathForCommit &&
        lastCommitSignature.scope === scope;

    const selectionState: Partial<GhSelected> = {
        owner,
        repo,
        branch: baseBranch,
        folder: folderInfo.storage,
        filename: filenameToCommit,
        commitMessage,
        scope,
        styleDictionary: payload.styleDictionary,
        flatTokens: payload.flatTokens,
        createPr,
        prBase: createPr ? prBaseBranch : undefined,
        prTitle: createPr ? prTitle : undefined,
        prBody: createPr ? prBody : undefined,
    };
    if (selectionCollection) selectionState.collection = selectionCollection;
    if (selectionMode) selectionState.mode = selectionMode;
    await mergeSelected(selectionState);
    await ctx.deps.broadcastLocalCollections({ force: true });

    try {
        const files: Array<{ name: string; json: unknown }> = [];

        if (scope === "all") {
            const all = await ctx.deps.exportDtcg({
                format: "single",
                styleDictionary,
                flatTokens,
            });
            for (const f of all.files)
                files.push({ name: f.name, json: f.json });
        } else if (scope === "typography") {
            const typo = await ctx.deps.exportDtcg({
                format: "typography",
            });
            for (const f of typo.files)
                files.push({ name: f.name, json: f.json });
        } else {
            if (!selectionCollection || !selectionMode) {
                ctx.deps.send({
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
                return;
            }
            const per = await ctx.deps.exportDtcg({
                format: "perMode",
                styleDictionary,
                flatTokens,
            });
            const picked = pickPerModeFile(
                per.files,
                selectionCollection,
                selectionMode,
                ctx.deps.safeKeyFromCollectionAndMode
            );
            if (!picked) {
                const available = per.files.map((f) => f.name).join(", ");
                ctx.deps.send({
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
                return;
            }
            files.push({ name: picked.name, json: picked.json });
        }

        if (files.length > 1) {
            ctx.deps.send({
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
            return;
        }

        const isPlainEmptyObject = (v: unknown) =>
            v &&
            typeof v === "object" &&
            !Array.isArray(v) &&
            Object.keys(v).length === 0;
        const exportLooksEmpty =
            files.length === 0 ||
            files.every((f) => isPlainEmptyObject(f.json));

        if (exportLooksEmpty) {
            if (scope === "typography") {
                const warningMessage =
                    "GitHub export warning: typography.json is empty (no local text styles). Nothing to commit.";
                ctx.deps.send({
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
                return;
            }
            if (exportLooksEmpty && scope === "selected") {
                const diag = await ctx.deps.analyzeSelectionState(
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
                ctx.deps.send({
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
                return;
            }
            if (exportLooksEmpty) {
                ctx.deps.send({
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
                return;
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
        const prefix = folderCommitPath ? folderCommitPath + "/" : "";
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
        const tryParseJson = (text: string): unknown | undefined => {
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
                        canonical[key] = canonicalizeJson(record[key]);
                    return canonical;
                }
            }
            return value;
        };
        const containsTypographyTokens = (text: string): boolean => {
            const parsed = tryParseJson(text);
            const hasTypography = (value: unknown): boolean => {
                if (!value) return false;
                if (typeof value === "string") {
                    return value.toLowerCase() === "typography";
                }
                if (typeof value === "object") {
                    if (Object.prototype.hasOwnProperty.call(value, "$type")) {
                        const t = (
                            value as {
                                [k: string]: unknown;
                            }
                        )["$type"];
                        if (
                            typeof t === "string" &&
                            t.toLowerCase() === "typography"
                        ) {
                            return true;
                        }
                    }
                    for (const key in value as {
                        [k: string]: unknown;
                    }) {
                        if (
                            Object.prototype.hasOwnProperty.call(value, key) &&
                            hasTypography(
                                (
                                    value as {
                                        [k: string]: unknown;
                                    }
                                )[key]
                            )
                        ) {
                            return true;
                        }
                    }
                }
                return false;
            };
            if (parsed !== undefined) {
                return hasTypography(parsed);
            }
            return /"\$type"\s*:\s*"typography"/i.test(text);
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
            if (existingJson !== undefined && nextJson !== undefined) {
                return (
                    JSON.stringify(canonicalizeJson(existingJson)) ===
                    JSON.stringify(canonicalizeJson(nextJson))
                );
            }
            return false;
        };

        let allFilesIdentical = commitFiles.length > 0;
        for (const file of commitFiles) {
            const current = await ghGetFileContents(
                ctx.state.token!,
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
            if (
                scope === "typography" &&
                containsTypographyTokens(file.content) &&
                !containsTypographyTokens(current.contentText)
            ) {
                allFilesIdentical = false;
                break;
            }
            if (!contentsMatch(current.contentText, file.content)) {
                allFilesIdentical = false;
                break;
            }
        }

        if (allFilesIdentical && !sameTargetAsLastCommit) {
            allFilesIdentical = false;
        }

        if (allFilesIdentical) {
            const noChangeMessage =
                scope === "selected"
                    ? `No token values changed for "${selectionCollection}" / "${selectionMode}"; repository already matches the current export.`
                    : "No token values changed; repository already matches the current export.";
            ctx.deps.send({
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
            return;
        }

        const attemptCommit = async () =>
            ghCommitFiles(
                ctx.state.token!,
                owner,
                repo,
                baseBranch,
                commitMessage,
                commitFiles
            );
        let commitRes = await attemptCommit();
        let fastForwardRetry = false;
        if (
            !commitRes.ok &&
            commitRes.status === 422 &&
            typeof commitRes.message === "string" &&
            /not a fast forward/i.test(commitRes.message)
        ) {
            await sleep(200);
            commitRes = await attemptCommit();
            fastForwardRetry = true;
        }
        if (!commitRes.ok) {
            const looksLikeFastForwardRace =
                commitRes.status === 422 &&
                typeof commitRes.message === "string" &&
                /not a fast forward/i.test(commitRes.message);
            if (looksLikeFastForwardRace && sameTargetAsLastCommit) {
                const noChangeMessage =
                    scope === "selected"
                        ? `No token values changed for "${selectionCollection}" / "${selectionMode}"; repository already matches the current export.`
                        : "No token values changed; repository already matches the current export.";
                ctx.deps.send({
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
                return;
            }
            ctx.deps.send({
                type: "GITHUB_COMMIT_RESULT",
                payload: {
                    ...commitRes,
                    folder: folderStorageValue,
                    filename: filenameToCommit,
                    fullPath: fullPathForCommit,
                },
            });
            ctx.deps.send({
                type: "ERROR",
                payload: {
                    message: `GitHub: Commit failed (${commitRes.status}): ${
                        commitRes.message
                    }${fastForwardRetry ? " (after retry)" : ""}`,
                },
            });
            return;
        }

        await setLastCommitSignature({
            branch: baseBranch,
            fullPath: fullPathForCommit,
            scope,
        });

        let prResult:
            | Awaited<ReturnType<typeof ghCreatePullRequest>>
            | undefined;
        if (createPr) {
            prResult = await ghCreatePullRequest(
                ctx.state.token!,
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
        ctx.deps.send({
            type: "GITHUB_COMMIT_RESULT",
            payload: commitOkPayload,
        });

        ctx.deps.send({
            type: "INFO",
            payload: {
                message: `Committed ${commitFiles.length} file(s) to ${owner}/${repo}@${baseBranch}`,
            },
        });
        if (createPr) {
            if (prResult && prResult.ok) {
                ctx.deps.send({
                    type: "GITHUB_PR_RESULT",
                    payload: prResult,
                });
                ctx.deps.send({
                    type: "INFO",
                    payload: {
                        message: `PR created: ${prResult.url}`,
                    },
                });
            } else if (prResult) {
                ctx.deps.send({
                    type: "GITHUB_PR_RESULT",
                    payload: prResult,
                });
                ctx.deps.send({
                    type: "ERROR",
                    payload: {
                        message: `GitHub: PR creation failed (${prResult.status}): ${prResult.message}`,
                    },
                });
            }
        }
    } catch (e) {
        const msgText = (e as Error)?.message || "unknown error";
        ctx.deps.send({
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
}
