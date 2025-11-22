import { describe, it, expect, vi, beforeEach } from "vitest";
import { GithubImportUi } from "./import";
import type { GithubUiDependencies, AttachContext } from "./types";

// Minimal DOM mocks
class MockHTMLElement {
    id = "";
    disabled = false;
    value = "";
    listeners: Record<string, any> = {};
    addEventListener(event: string, cb: any) {
        this.listeners[event] = cb;
    }
    click() {
        if (this.listeners["click"]) this.listeners["click"]();
    }
    trigger(type: string) {
        if (this.listeners[type]) this.listeners[type]();
    }
}

class MockDocument {
    elements: Record<string, MockHTMLElement> = {};
    getElementById(id: string) {
        return this.elements[id] || null;
    }
}

describe("GithubImportUi", () => {
    let deps: GithubUiDependencies;
    let importUi: GithubImportUi;
    let mockDoc: MockDocument;
    let context: AttachContext;

    beforeEach(() => {
        deps = {
            postToPlugin: vi.fn(),
            log: vi.fn(),
            getLogElement: vi.fn(),
            getCollectionSelect: vi.fn(),
            getModeSelect: vi.fn(),
            getAllowHexCheckbox: vi.fn(),
            getStyleDictionaryCheckbox: vi.fn(),
            getFlatTokensCheckbox: vi.fn(),
            getImportContexts: vi.fn(() => []),
        };
        importUi = new GithubImportUi(deps);
        mockDoc = new MockDocument();
        context = {
            document: mockDoc as any,
            window: {} as any,
        };

        mockDoc.elements["ghFetchBtn"] = new MockHTMLElement();
        mockDoc.elements["ghFetchTokensBtn"] = mockDoc.elements["ghFetchBtn"];
        const pathInput = new MockHTMLElement() as any;
        (pathInput as any).value = "tokens/tokens.json";
        mockDoc.elements["ghFetchPathInput"] = pathInput;
    });

    it("should disable fetch button initially", () => {
        importUi.attach(context);
        const btn = mockDoc.elements["ghFetchBtn"];
        // Initially might be enabled or disabled depending on HTML default,
        // but setContext updates it.
        // Let's verify setContext updates it.
        importUi.setContext("", "", "", "");
        expect(btn.disabled).toBe(true);
    });

    it("should enable fetch button when context is set", () => {
        importUi.attach(context);
        importUi.setContext("owner", "repo", "main", "tokens");
        const btn = mockDoc.elements["ghFetchBtn"];
        expect(btn.disabled).toBe(false);
    });

    it("should fetch tokens on click", () => {
        importUi.attach(context);
        importUi.setContext("owner", "repo", "main", "tokens");

        const btn = mockDoc.elements["ghFetchBtn"];
        btn.click();

        expect(deps.postToPlugin).toHaveBeenCalledWith({
            type: "GITHUB_FETCH_TOKENS",
            payload: {
                owner: "owner",
                repo: "repo",
                branch: "main",
                path: "tokens/tokens.json",
                allowHexStrings: false,
                contexts: [],
            },
        });
        expect(btn.disabled).toBe(true); // Should disable during flight
    });

    it("should handle fetch result success", () => {
        importUi.attach(context);
        importUi.setContext("owner", "repo", "main", "tokens");

        const onTokensFetched = vi.fn();
        importUi.onTokensFetched = onTokensFetched;

        importUi.handleMessage({
            type: "GITHUB_FETCH_TOKENS_RESULT",
            payload: {
                ok: true,
                owner: "owner",
                repo: "repo",
                json: { color: "red" },
                path: "tokens/tokens.json",
                branch: "main",
            },
        });

        expect(mockDoc.elements["ghFetchBtn"].disabled).toBe(false);
        expect(onTokensFetched).toHaveBeenCalledWith({ color: "red" });
        expect(deps.log).toHaveBeenCalledWith(
            expect.stringContaining("Successfully fetched")
        );
    });

    it("should handle fetch result failure", () => {
        importUi.attach(context);
        importUi.setContext("owner", "repo", "main", "tokens");

        importUi.handleMessage({
            type: "GITHUB_FETCH_TOKENS_RESULT",
            payload: {
                ok: false,
                owner: "owner",
                repo: "repo",
                status: 404,
                message: "Not Found",
                path: "tokens/tokens.json",
                branch: "main",
            },
        });

        expect(mockDoc.elements["ghFetchBtn"].disabled).toBe(false);
        expect(deps.log).toHaveBeenCalledWith(
            expect.stringContaining("Fetch failed")
        );
    });
});
