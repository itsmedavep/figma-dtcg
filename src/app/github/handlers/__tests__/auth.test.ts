import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    handleSetToken,
    handleForgetToken,
    restoreGithubTokenAndVerify,
} from "../auth";
import { ghGetUser } from "../../../../core/github/api";
import { listAndSendRepos } from "../repos";
import type { DispatcherContext } from "../types";

// Mock dependencies
vi.mock("../../../../core/github/api", () => ({
    ghGetUser: vi.fn(),
}));

vi.mock("../repos", () => ({
    listAndSendRepos: vi.fn(),
}));

// Mock figma global
const mockClientStorage = {
    getAsync: vi.fn().mockResolvedValue(null),
    setAsync: vi.fn().mockResolvedValue(undefined),
    deleteAsync: vi.fn().mockResolvedValue(undefined),
};

vi.stubGlobal("figma", {
    clientStorage: mockClientStorage,
});

describe("Auth Handlers", () => {
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

    describe("handleSetToken", () => {
        it("should set token and verify user", async () => {
            const token = "test-token";
            (ghGetUser as any).mockResolvedValue({
                ok: true,
                user: { login: "testuser", name: "Test User" },
            });

            await handleSetToken(ctx, { token, remember: true });

            expect(ctx.state.token).toBe(token);
            expect(mockClientStorage.setAsync).toHaveBeenCalledWith(
                "github_token_b64",
                expect.any(String)
            );
            expect(ghGetUser).toHaveBeenCalledWith(token);
            expect(sendMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "GITHUB_AUTH_RESULT",
                    payload: {
                        ok: true,
                        login: "testuser",
                        name: "Test User",
                        remember: true,
                    },
                })
            );
            expect(listAndSendRepos).toHaveBeenCalledWith(ctx, token);
        });

        it("should handle invalid token", async () => {
            (ghGetUser as any).mockResolvedValue({
                ok: false,
                error: "Bad credentials",
            });

            await handleSetToken(ctx, { token: "bad-token" });

            expect(sendMock).toHaveBeenCalledWith(
                expect.objectContaining({ type: "ERROR" })
            );
            expect(sendMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "GITHUB_AUTH_RESULT",
                    payload: {
                        ok: false,
                        error: "Bad credentials",
                        remember: false,
                    },
                })
            );
        });

        it("should handle empty token", async () => {
            await handleSetToken(ctx, { token: "" });
            expect(sendMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "ERROR",
                    payload: { message: "GitHub: Empty token." },
                })
            );
        });
    });

    describe("handleForgetToken", () => {
        it("should clear token and storage", async () => {
            ctx.state.token = "old-token";
            await handleForgetToken(ctx);

            expect(ctx.state.token).toBeNull();
            expect(mockClientStorage.deleteAsync).toHaveBeenCalledWith(
                "github_token_b64"
            );
            expect(sendMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "INFO",
                    payload: { message: "GitHub: Token cleared." },
                })
            );
        });
    });

    describe("restoreGithubTokenAndVerify", () => {
        it("should restore token if remember pref is true", async () => {
            mockClientStorage.getAsync.mockImplementation((key) => {
                if (key === "githubRememberPref") return Promise.resolve(true);
                if (key === "github_token_b64")
                    return Promise.resolve(btoa("stored-token"));
                return Promise.resolve(null);
            });
            (ghGetUser as any).mockResolvedValue({
                ok: true,
                user: { login: "storeduser", name: "Stored User" },
            });

            await restoreGithubTokenAndVerify(ctx);

            expect(ctx.state.token).toBe("stored-token");
            expect(ghGetUser).toHaveBeenCalledWith("stored-token");
            expect(sendMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: "GITHUB_AUTH_RESULT",
                    payload: {
                        ok: true,
                        login: "storeduser",
                        name: "Stored User",
                        remember: true,
                    },
                })
            );
        });

        it("should not restore if remember pref is false", async () => {
            mockClientStorage.getAsync.mockImplementation((key) => {
                if (key === "githubRememberPref") return Promise.resolve(false);
                return Promise.resolve(null);
            });

            await restoreGithubTokenAndVerify(ctx);

            expect(ctx.state.token).toBeNull();
            expect(mockClientStorage.deleteAsync).toHaveBeenCalledWith(
                "github_token_b64"
            );
        });
    });
});
