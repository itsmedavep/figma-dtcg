import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    handleSaveState,
    getSelected,
    setSelected,
    mergeSelected,
} from "../state";
import type { DispatcherContext } from "../types";

// Mock figma global
const mockClientStorage = {
    getAsync: vi.fn().mockResolvedValue(null),
    setAsync: vi.fn().mockResolvedValue(undefined),
};

vi.stubGlobal("figma", {
    clientStorage: mockClientStorage,
});

// Mock normalizeFolderForStorage
vi.mock("../folders", () => ({
    normalizeFolderForStorage: vi.fn((f) => ({ ok: true, storage: f })),
}));

describe("State Handlers", () => {
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

    describe("getSelected", () => {
        it("should return stored state", async () => {
            mockClientStorage.getAsync.mockResolvedValue({ owner: "foo" });
            const res = await getSelected();
            expect(res).toEqual({ owner: "foo" });
        });

        it("should return empty object if nothing stored", async () => {
            mockClientStorage.getAsync.mockResolvedValue(null);
            const res = await getSelected();
            expect(res).toEqual({});
        });
    });

    describe("setSelected", () => {
        it("should save state", async () => {
            await setSelected({ owner: "bar" });
            expect(mockClientStorage.setAsync).toHaveBeenCalledWith(
                "gh.selected",
                { owner: "bar" }
            );
        });
    });

    describe("mergeSelected", () => {
        it("should merge and save", async () => {
            mockClientStorage.getAsync.mockResolvedValue({
                owner: "foo",
                repo: "baz",
            });
            const res = await mergeSelected({ repo: "qux" });
            expect(res).toEqual({ owner: "foo", repo: "qux" });
            expect(mockClientStorage.setAsync).toHaveBeenCalledWith(
                "gh.selected",
                { owner: "foo", repo: "qux" }
            );
        });
    });

    describe("handleSaveState", () => {
        it("should update state from payload", async () => {
            mockClientStorage.getAsync.mockResolvedValue({});
            await handleSaveState(ctx, {
                owner: "new-owner",
                repo: "new-repo",
            });
            expect(mockClientStorage.setAsync).toHaveBeenCalledWith(
                "gh.selected",
                expect.objectContaining({
                    owner: "new-owner",
                    repo: "new-repo",
                })
            );
        });

        it("should handle folder normalization", async () => {
            mockClientStorage.getAsync.mockResolvedValue({});
            await handleSaveState(ctx, { folder: "my-folder" });
            expect(mockClientStorage.setAsync).toHaveBeenCalledWith(
                "gh.selected",
                expect.objectContaining({ folder: "my-folder" })
            );
        });
    });
});
