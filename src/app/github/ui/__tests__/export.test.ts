import { describe, it, expect, vi, beforeEach } from "vitest";
import { GithubExportUi } from "../export";
import type { GithubUiDependencies, AttachContext } from "../types";

// Minimal DOM mocks
class MockHTMLElement {
    id = "";
    value = "";
    checked = false;
    disabled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    style: Record<string, any> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listeners: Record<string, any> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    appendChild(_child: MockHTMLElement) {}
    scrollHeight = 100;
    scrollTop = 0;
}

class MockDocument {
    elements: Record<string, MockHTMLElement> = {};
    getElementById(id: string) {
        return this.elements[id] || null;
    }
    createElement(_tag: string) {
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
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return el as any;
            }),
            getModeSelect: vi.fn(() => {
                const el = new MockHTMLElement();
                el.value = "mode-1";
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            document: mockDoc as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
            "ghPrOptions",
        ].forEach((id) => (mockDoc.elements[id] = new MockHTMLElement()));
        mockDoc.elements["ghPrOptions"].style.display = "none";

        // Shared option checkboxes returned via deps
        const styleChk = new MockHTMLElement();
        const flatChk = new MockHTMLElement();
        mockDoc.elements["styleDictionaryChk"] = styleChk;
        mockDoc.elements["flatTokensChk"] = flatChk;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (deps.getStyleDictionaryCheckbox as any).mockImplementation(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            () => styleChk as any
        );
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (deps.getFlatTokensCheckbox as any).mockImplementation(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            () => flatChk as any
        );
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

    it("shows and hides PR fields when toggling create PR checkbox", () => {
        exportUi.attach(context);

        const prChk = mockDoc.elements["ghCreatePrChk"];
        const prOptions = mockDoc.elements["ghPrOptions"];

        expect(prOptions.style.display).toBe("none");

        prChk.checked = true;
        prChk.change();
        expect(prOptions.style.display).toBe("");

        prChk.checked = false;
        prChk.change();
        expect(prOptions.style.display).toBe("none");
    });

    it("restores saved commit fields", () => {
        exportUi.attach(context);
        exportUi.setContext("owner", "repo", "main", "tokens/", "main");
        exportUi.setCollectionsAvailability(true, true);

        exportUi.handleMessage({
            type: "GITHUB_RESTORE_SELECTED",
            payload: {
                filename: "saved.json",
                commitMessage: "Saved commit",
                scope: "all",
                createPr: true,
                prTitle: "Restore PR",
                prBody: "Body",
                styleDictionary: true,
                flatTokens: true,
            },
        });

        expect(mockDoc.elements["ghFilenameInput"].value).toBe("saved.json");
        expect(mockDoc.elements["ghCommitMsgInput"].value).toBe("Saved commit");
        expect(mockDoc.elements["ghScopeAll"].checked).toBe(true);
        expect(mockDoc.elements["ghScopeSelected"].checked).toBe(false);
        expect(mockDoc.elements["ghCreatePrChk"].checked).toBe(true);
        expect(mockDoc.elements["ghPrTitleInput"].value).toBe("Restore PR");
        expect(mockDoc.elements["ghPrBodyInput"].value).toBe("Body");
        expect(mockDoc.elements["styleDictionaryChk"].checked).toBe(true);
        expect(mockDoc.elements["flatTokensChk"].checked).toBe(true);
        expect(mockDoc.elements["ghPrOptions"].style.display).toBe("");
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
