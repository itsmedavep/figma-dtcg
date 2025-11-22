import { describe, it, expect, vi, beforeEach } from "vitest";
import { GithubExportUi } from "../export";
import type { GithubUiDependencies, AttachContext } from "../types";

// Minimal DOM mocks
class MockHTMLElement {
    id = "";
    value = "";
    checked = false;
    disabled = false;
    listeners: Record<string, any> = {};
    addEventListener(event: string, cb: any) {
        this.listeners[event] = cb;
    }
    click() {
        if (this.listeners["click"]) this.listeners["click"]();
    }
    change() {
        if (this.listeners["change"]) this.listeners["change"]();
    }
    focus() {}

    // For log
    appendChild(child: MockHTMLElement) {}
    scrollHeight = 100;
    scrollTop = 0;
}

class MockDocument {
    elements: Record<string, MockHTMLElement> = {};
    getElementById(id: string) {
        return this.elements[id] || null;
    }
    createElement(tag: string) {
        return new MockHTMLElement();
    }
}

describe("GithubExportUi", () => {
    let deps: GithubUiDependencies;
    let exportUi: GithubExportUi;
    let mockDoc: MockDocument;
    let context: AttachContext;

    beforeEach(() => {
        deps = {
            postToPlugin: vi.fn(),
            log: vi.fn(),
            getLogElement: vi.fn(() => null),
            getCollectionSelect: vi.fn(() => {
                const el = new MockHTMLElement();
                el.value = "coll-1";
                return el as any;
            }),
            getModeSelect: vi.fn(() => {
                const el = new MockHTMLElement();
                el.value = "mode-1";
                return el as any;
            }),
            getAllowHexCheckbox: vi.fn(),
            getStyleDictionaryCheckbox: vi.fn(),
            getFlatTokensCheckbox: vi.fn(),
            getImportContexts: vi.fn(() => []),
        };
        exportUi = new GithubExportUi(deps);
        mockDoc = new MockDocument();
        context = {
            document: mockDoc as any,
            window: {} as any,
        };

        // Setup elements
        [
            "ghExportAndCommitBtn",
            "ghCommitMsgInput",
            "ghFilenameInput",
            "ghScopeAll",
            "ghScopeTypography",
            "ghScopeSelected",
            "ghCreatePrChk",
            "ghPrTitleInput",
            "ghPrBodyInput",
        ].forEach((id) => (mockDoc.elements[id] = new MockHTMLElement()));
    });

    it("should disable export button initially", () => {
        exportUi.attach(context);
        const btn = mockDoc.elements["ghExportAndCommitBtn"];
        // Need to trigger updateEnabled logic
        exportUi.setContext("", "", "", "", "");
        expect(btn.disabled).toBe(true);
    });

    it("should enable export button when context and filename are set", () => {
        exportUi.attach(context);

        const filename = mockDoc.elements["ghFilenameInput"];
        filename.value = "tokens.json";

        exportUi.setContext("owner", "repo", "main", "tokens/", "main");

        const btn = mockDoc.elements["ghExportAndCommitBtn"];
        expect(btn.disabled).toBe(false);
    });

    it("should clear context on reset and disable export", () => {
        exportUi.attach(context);

        const filename = mockDoc.elements["ghFilenameInput"];
        filename.value = "tokens.json";

        const btn = mockDoc.elements["ghExportAndCommitBtn"];

        exportUi.setContext("owner", "repo", "main", "tokens/", "main");
        expect(btn.disabled).toBe(false);

        exportUi.reset();
        expect(btn.disabled).toBe(true);
    });

    it("should export with correct payload", () => {
        exportUi.attach(context);

        const filename = mockDoc.elements["ghFilenameInput"];
        filename.value = "tokens.json";

        const scopeAll = mockDoc.elements["ghScopeAll"];
        scopeAll.checked = true;

        exportUi.setContext("owner", "repo", "main", "tokens/", "main");

        const btn = mockDoc.elements["ghExportAndCommitBtn"];
        btn.click();

        expect(deps.postToPlugin).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "GITHUB_EXPORT_AND_COMMIT",
                payload: expect.objectContaining({
                    owner: "owner",
                    repo: "repo",
                    branch: "main",
                    folder: "tokens/",
                    filename: "tokens.json",
                    scope: "all",
                }),
            })
        );
    });

    it("should handle PR creation option", () => {
        exportUi.attach(context);

        const filename = mockDoc.elements["ghFilenameInput"];
        filename.value = "tokens.json";

        const prChk = mockDoc.elements["ghCreatePrChk"];
        prChk.checked = true;

        const prTitle = mockDoc.elements["ghPrTitleInput"];
        prTitle.value = "My PR";

        exportUi.setContext("owner", "repo", "feature", "tokens/", "main");

        const btn = mockDoc.elements["ghExportAndCommitBtn"];
        btn.click();

        expect(deps.postToPlugin).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "GITHUB_EXPORT_AND_COMMIT",
                payload: expect.objectContaining({
                    createPr: true,
                    prBase: "main",
                    prTitle: "My PR",
                }),
            })
        );
    });

    it("should handle commit result", () => {
        exportUi.attach(context);
        exportUi.handleMessage({
            type: "GITHUB_COMMIT_RESULT",
            payload: {
                ok: true,
                owner: "owner",
                repo: "repo",
                commitUrl: "http://github.com/commit",
                commitSha: "sha",
                branch: "main",
                fullPath: "tokens/tokens.json",
            },
        });

        expect(deps.log).toHaveBeenCalledWith(
            expect.stringContaining("Commit succeeded")
        );
    });
});
