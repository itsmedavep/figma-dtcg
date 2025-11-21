import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleExportFiles, handleExportAndCommit } from "../commits";
import {
    ghGetFileContents,
    ghCommitFiles,
    ghCreatePullRequest,
} from "../../../../core/github/api";
import {
    getSelected,
    mergeSelected,
    getLastCommitSignature,
    setLastCommitSignature,
} from "../state";
import {
    ensureFolderPathWritable,
    getSelectedFolderForCommit,
} from "../folders";
import type { DispatcherContext } from "../types";

// Mock dependencies
vi.mock("../../../../core/github/api", () => ({
    ghGetFileContents: vi.fn(),
    ghCommitFiles: vi.fn(),
    ghCreatePullRequest: vi.fn(),
}));

vi.mock("../state", () => ({
    getSelected: vi.fn(),
    mergeSelected: vi.fn(),
    getLastCommitSignature: vi.fn(),
    setLastCommitSignature: vi.fn(),
    setSelected: vi.fn(),
}));

vi.mock("../folders", () => ({
    ensureFolderPathWritable: vi.fn(),
    getSelectedFolderForCommit: vi.fn(),
}));

vi.mock("../filenames", () => ({
    validateGithubFilename: vi.fn((n) => ({ ok: true, filename: n })),
    DEFAULT_GITHUB_FILENAME: "tokens.json",
}));

describe("Commit Handlers", () => {
    let ctx: DispatcherContext;
    const sendMock = vi.fn();
    const exportDtcgMock = vi.fn();
    const broadcastMock = vi.fn();
    const analyzeSelectionStateMock = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        ctx = {
            deps: {
                send: sendMock,
                snapshotCollectionsForUi: vi.fn(),
                analyzeSelectionState: analyzeSelectionStateMock,
                safeKeyFromCollectionAndMode: vi.fn((c, m) => `${c}_${m}`),
                importDtcg: vi.fn(),
                exportDtcg: exportDtcgMock,
                broadcastLocalCollections: broadcastMock,
            },
            state: {
                token: "test-token",
            },
        };
    });

    describe("handleExportFiles", () => {
        it("should export all files", async () => {
            exportDtcgMock.mockResolvedValue({
                files: [{ name: "f1", json: {} }],
            });
            await handleExportFiles(ctx, { scope: "all" });

            expect(exportDtcgMock).toHaveBeenCalledWith(
                expect.objectContaining({ format: "single" })
            );
            expect(sendMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "GITHUB_EXPORT_FILES_RESULT",
                    payload: { files: [{ name: "f1", json: {} }] },
                })
            );
        });
    });

    describe("handleExportAndCommit", () => {
        beforeEach(() => {
            (getSelected as any).mockResolvedValue({});
            (getSelectedFolderForCommit as any).mockResolvedValue({
                ok: true,
                storage: "",
                path: "",
            });
            (ensureFolderPathWritable as any).mockResolvedValue({ ok: true });
            exportDtcgMock.mockResolvedValue({
                files: [{ name: "tokens.json", json: { foo: "bar" } }],
            });
            (ghGetFileContents as any).mockResolvedValue({
                ok: false,
                status: 404,
            }); // File doesn't exist, so commit proceeds
            (ghCommitFiles as any).mockResolvedValue({
                ok: true,
                commitSha: "sha",
            });
        });

        it("should commit files", async () => {
            await handleExportAndCommit(ctx, {
                owner: "owner",
                repo: "repo",
                branch: "main",
                scope: "all",
                commitMessage: "msg",
            });

            expect(ghCommitFiles).toHaveBeenCalled();
            expect(sendMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "GITHUB_COMMIT_RESULT",
                    payload: expect.objectContaining({ ok: true }),
                })
            );
        });

        it("should handle no token", async () => {
            ctx.state.token = null;
            await handleExportAndCommit(ctx, { owner: "owner" });
            expect(sendMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "GITHUB_COMMIT_RESULT",
                    payload: expect.objectContaining({ status: 401 }),
                })
            );
        });
    });
});
