import { describe, it, expect, vi, beforeEach } from "vitest";
import { listAndSendRepos, handleSelectRepo } from "../repos";
import { ghListRepos } from "../../../../core/github/api";
import { getSelected, setSelected } from "../state";
import type { DispatcherContext } from "../types";

// Mock dependencies
vi.mock("../../../../core/github/api", () => ({
    ghListRepos: vi.fn(),
}));

vi.mock("../state", () => ({
    getSelected: vi.fn(),
    setSelected: vi.fn(),
}));

describe("Repo Handlers", () => {
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
                token: null,
            },
        };
    });

    describe("listAndSendRepos", () => {
        it("should list and send repos", async () => {
            (ghListRepos as any).mockResolvedValue({
                ok: true,
                repos: [
                    {
                        full_name: "owner/repo",
                        default_branch: "main",
                        private: false,
                    },
                ],
            });

            await listAndSendRepos(ctx, "token");

            expect(ghListRepos).toHaveBeenCalledWith("token");
            expect(sendMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "GITHUB_REPOS",
                    payload: {
                        repos: [
                            {
                                full_name: "owner/repo",
                                default_branch: "main",
                                private: false,
                            },
                        ],
                    },
                })
            );
        });

        it("should handle error", async () => {
            (ghListRepos as any).mockResolvedValue({
                ok: false,
                error: "Network error",
            });

            await listAndSendRepos(ctx, "token");

            expect(sendMock).toHaveBeenCalledWith(
                expect.objectContaining({ type: "ERROR" })
            );
            expect(sendMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "GITHUB_REPOS",
                    payload: { repos: [] },
                })
            );
        });
    });

    describe("handleSelectRepo", () => {
        it("should update selected repo", async () => {
            (getSelected as any).mockResolvedValue({ branch: "main" });
            await handleSelectRepo(ctx, {
                owner: "new-owner",
                repo: "new-repo",
            });

            expect(setSelected).toHaveBeenCalledWith(
                expect.objectContaining({
                    owner: "new-owner",
                    repo: "new-repo",
                    branch: "main",
                    folder: undefined,
                })
            );
        });
    });
});
