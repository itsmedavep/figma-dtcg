import { describe, it, expect, vi, beforeEach } from "vitest";
import { GithubRepoUi } from "./repo";
import type { GithubUiDependencies, AttachContext } from "./types";

// Minimal DOM mocks
class MockHTMLElement {
    id = "";
    value = "";
    textContent = "";
    disabled = false;
    options: MockHTMLElement[] = [];
    selectedIndex = -1;

    appendChild(child: MockHTMLElement) {
        this.options.push(child);
    }
    remove(index: number) {
        this.options.splice(index, 1);
    }

    listeners: Record<string, any> = {};
    addEventListener(event: string, cb: any) {
        this.listeners[event] = cb;
    }
    dispatchEvent(event: any) {
        if (this.listeners[event.type]) this.listeners[event.type]();
    }

    // For createElement
    createElement(tag: string) {
        return new MockHTMLElement();
    }
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

describe("GithubRepoUi", () => {
    let deps: GithubUiDependencies;
    let repoUi: GithubRepoUi;
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
        repoUi = new GithubRepoUi(deps);
        mockDoc = new MockDocument();
        context = {
            document: mockDoc as any,
            window: {} as any,
        };

        mockDoc.elements["ghRepoSelect"] = new MockHTMLElement();
    });

    it("should populate repos", () => {
        repoUi.attach(context);
        repoUi.handleMessage({
            type: "GITHUB_REPOS",
            payload: {
                repos: [
                    {
                        full_name: "owner/repo1",
                        default_branch: "main",
                        private: false,
                    },
                    {
                        full_name: "owner/repo2",
                        default_branch: "dev",
                        private: true,
                    },
                ],
            },
        });

        const select = mockDoc.elements["ghRepoSelect"];
        expect(select.options.length).toBe(2);
        expect(select.options[0].value).toBe("owner/repo1");
        expect(select.options[1].value).toBe("owner/repo2");
        expect(deps.log).toHaveBeenCalledWith(
            "GitHub: Repository list updated (2)."
        );
    });

    it("should handle selection change", () => {
        repoUi.attach(context);
        const select = mockDoc.elements["ghRepoSelect"];

        // Simulate population
        const opt = new MockHTMLElement();
        opt.value = "owner/repo1";
        select.options.push(opt);
        select.value = "owner/repo1";

        // Simulate change event
        if (select.listeners["change"]) select.listeners["change"]();

        expect(deps.postToPlugin).toHaveBeenCalledWith({
            type: "GITHUB_SELECT_REPO",
            payload: { owner: "owner", repo: "repo1" },
        });
        expect(repoUi.getSelected()).toEqual({ owner: "owner", repo: "repo1" });
    });

    it("should restore selected repo", () => {
        repoUi.attach(context);
        repoUi.handleMessage({
            type: "GITHUB_RESTORE_SELECTED",
            payload: { owner: "owner", repo: "repo1" },
        });

        expect(repoUi.getSelected()).toEqual({ owner: "owner", repo: "repo1" });
    });
});
