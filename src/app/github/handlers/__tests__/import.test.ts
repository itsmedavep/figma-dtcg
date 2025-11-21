import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleFetchTokens } from "../import";
import { ghGetFileContents } from "../../../../core/github/api";
import type { DispatcherContext } from "../types";

// Mock dependencies
vi.mock("../../../../core/github/api", () => ({
    ghGetFileContents: vi.fn(),
}));

vi.mock("../../folders", () => ({
    normalizeFolderForStorage: vi.fn((f) => ({ ok: true, storage: f })),
    folderStorageToCommitPath: vi.fn((f) => ({ ok: true, path: f })),
}));

describe("Import Handlers", () => {
    let ctx: DispatcherContext;
    const sendMock = vi.fn();
    const importDtcgMock = vi.fn();
    const broadcastMock = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        ctx = {
            deps: {
                send: sendMock,
                snapshotCollectionsForUi: vi.fn(),
                analyzeSelectionState: vi.fn(),
                safeKeyFromCollectionAndMode: vi.fn(),
                importDtcg: importDtcgMock,
                exportDtcg: vi.fn(),
                broadcastLocalCollections: broadcastMock,
            },
            state: {
                token: "test-token",
            },
        };
    });

    describe("handleFetchTokens", () => {
        it("should fetch and import tokens", async () => {
            (ghGetFileContents as any).mockResolvedValue({
                ok: true,
                contentText: '{"foo": "bar"}',
            });
            importDtcgMock.mockResolvedValue({ changes: [] });

            await handleFetchTokens(ctx, {
                owner: "owner",
                repo: "repo",
                branch: "main",
                path: "tokens.json",
            });

            expect(ghGetFileContents).toHaveBeenCalledWith(
                "test-token",
                "owner",
                "repo",
                "main",
                "tokens.json"
            );
            expect(importDtcgMock).toHaveBeenCalledWith(
                { foo: "bar" },
                expect.anything()
            );
            expect(sendMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "GITHUB_FETCH_TOKENS_RESULT",
                    payload: expect.objectContaining({ ok: true }),
                })
            );
            expect(broadcastMock).toHaveBeenCalled();
        });

        it("should handle invalid JSON", async () => {
            (ghGetFileContents as any).mockResolvedValue({
                ok: true,
                contentText: "invalid-json",
            });

            await handleFetchTokens(ctx, {
                owner: "owner",
                repo: "repo",
                branch: "main",
                path: "tokens.json",
            });

            expect(sendMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "GITHUB_FETCH_TOKENS_RESULT",
                    payload: expect.objectContaining({
                        ok: false,
                        status: 422,
                    }),
                })
            );
        });
    });
});
