import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    handleSetFolder,
    handleFolderList,
    handleCreateFolder,
} from "../folders";
import { ghListDirs, ghEnsureFolder } from "../../../../core/github/api";
import { getSelected, setSelected } from "../state";
import type { DispatcherContext } from "../types";

// Mock dependencies
vi.mock("../../../../core/github/api", () => ({
    ghListDirs: vi.fn(),
    ghEnsureFolder: vi.fn(),
}));

vi.mock("../state", () => ({
    getSelected: vi.fn(),
    setSelected: vi.fn(),
}));

vi.mock("../../folders", () => ({
    normalizeFolderForStorage: vi.fn((f) => ({ ok: true, storage: f })),
    folderStorageToCommitPath: vi.fn((f) => ({ ok: true, path: f })),
}));

describe("Folder Handlers", () => {
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

    describe("handleSetFolder", () => {
        it("should set folder", async () => {
            (getSelected as any).mockResolvedValue({ owner: "owner" });
            await handleSetFolder(ctx, { folder: "new-folder" });

            expect(setSelected).toHaveBeenCalledWith(
                expect.objectContaining({
                    owner: "owner",
                    folder: "new-folder",
                })
            );
        });
    });

    describe("handleFolderList", () => {
        it("should list folders", async () => {
            (ghListDirs as any).mockResolvedValue({
                ok: true,
                dirs: [],
                path: "",
            });
            await handleFolderList(ctx, {
                owner: "owner",
                repo: "repo",
                branch: "main",
                path: "",
            });

            expect(ghListDirs).toHaveBeenCalledWith(
                "test-token",
                "owner",
                "repo",
                "main",
                ""
            );
            expect(sendMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "GITHUB_FOLDER_LIST_RESULT",
                    payload: expect.objectContaining({ ok: true }),
                })
            );
        });

        it("should handle no token", async () => {
            ctx.state.token = null;
            await handleFolderList(ctx, { owner: "owner" });
            expect(sendMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "GITHUB_FOLDER_LIST_RESULT",
                    payload: expect.objectContaining({ status: 401 }),
                })
            );
        });
    });

    describe("handleCreateFolder", () => {
        it("should create folder", async () => {
            (ghEnsureFolder as any).mockResolvedValue({ ok: true });
            await handleCreateFolder(ctx, {
                owner: "owner",
                repo: "repo",
                branch: "main",
                folderPath: "new-folder",
            });

            expect(ghEnsureFolder).toHaveBeenCalledWith(
                "test-token",
                "owner",
                "repo",
                "main",
                "new-folder"
            );
            expect(sendMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "GITHUB_CREATE_FOLDER_RESULT",
                    payload: { ok: true },
                })
            );
        });
    });
});
