import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    handleFetchBranches,
    handleSelectBranch,
    handleCreateBranch,
} from "../branches";
import { ghListBranches, ghCreateBranch } from "../../../../core/github/api";
import { getSelected, setSelected, mergeSelected } from "../state";
import type { DispatcherContext } from "../types";

// Mock dependencies
vi.mock("../../../../core/github/api", () => ({
    ghListBranches: vi.fn(),
    ghCreateBranch: vi.fn(),
}));

vi.mock("../state", () => ({
    getSelected: vi.fn(),
    setSelected: vi.fn(),
    mergeSelected: vi.fn(),
}));

describe("Branch Handlers", () => {
    let ctx: DispatcherContext;
    const sendMock = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        ctx = {
            deps: {
                send: sendMock,
                snapshotCollectionsForUi: vi.fn(),
                analyzeSelectionState: vi.fn(),
                safeKeyFromCollectionAndMode: vi.fn(),
                importDtcg: vi.fn(),
                exportDtcg: vi.fn(),
                broadcastLocalCollections: vi.fn(),
            },
            state: {
                token: "test-token",
            },
        };
    });

    describe("handleFetchBranches", () => {
        it("should fetch branches and update state", async () => {
            (ghListBranches as any).mockResolvedValue({
                ok: true,
                defaultBranch: "main",
            });
            await handleFetchBranches(ctx, {
                owner: "owner",
                repo: "repo",
                page: 1,
            });

            expect(ghListBranches).toHaveBeenCalledWith(
                "test-token",
                "owner",
                "repo",
                1,
                false
            );
            expect(sendMock).toHaveBeenCalledWith(
                expect.objectContaining({ type: "GITHUB_BRANCHES" })
            );
            expect(mergeSelected).toHaveBeenCalledWith(
                expect.objectContaining({ branch: "main" })
            );
        });

        it("should handle error", async () => {
            (ghListBranches as any).mockResolvedValue({ ok: false });
            await handleFetchBranches(ctx, { owner: "owner", repo: "repo" });

            expect(sendMock).toHaveBeenCalledWith(
                expect.objectContaining({ type: "GITHUB_BRANCHES_ERROR" })
            );
        });

        it("should handle no token", async () => {
            ctx.state.token = null;
            await handleFetchBranches(ctx, { owner: "owner", repo: "repo" });
            expect(sendMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "GITHUB_BRANCHES_ERROR",
                    payload: expect.objectContaining({
                        status: 401,
                        message: "No token",
                    }),
                })
            );
        });
    });

    describe("handleSelectBranch", () => {
        it("should update selected branch", async () => {
            (getSelected as any).mockResolvedValue({
                owner: "owner",
                repo: "repo",
            });
            await handleSelectBranch(ctx, { branch: "feature" });

            expect(setSelected).toHaveBeenCalledWith(
                expect.objectContaining({
                    owner: "owner",
                    repo: "repo",
                    branch: "feature",
                    folder: undefined,
                })
            );
        });
    });

    describe("handleCreateBranch", () => {
        it("should create branch and update state", async () => {
            (ghCreateBranch as any).mockResolvedValue({ ok: true });
            await handleCreateBranch(ctx, {
                owner: "owner",
                repo: "repo",
                baseBranch: "main",
                newBranch: "feature",
            });

            expect(ghCreateBranch).toHaveBeenCalledWith(
                "test-token",
                "owner",
                "repo",
                "feature",
                "main"
            );
            expect(mergeSelected).toHaveBeenCalledWith({
                owner: "owner",
                repo: "repo",
                branch: "feature",
            });
            expect(sendMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "GITHUB_CREATE_BRANCH_RESULT",
                    payload: { ok: true },
                })
            );
        });

        it("should handle missing args", async () => {
            await handleCreateBranch(ctx, { owner: "owner" });
            expect(sendMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "GITHUB_CREATE_BRANCH_RESULT",
                    payload: expect.objectContaining({
                        status: 400,
                        message: "Missing owner/repo/base/new",
                    }),
                })
            );
        });
    });
});
