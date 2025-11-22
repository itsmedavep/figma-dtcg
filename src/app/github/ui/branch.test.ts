import { describe, it, expect, vi, beforeEach } from "vitest";
import { GithubBranchUi } from "./branch";
import type { GithubUiDependencies, AttachContext } from "./types";

// Minimal DOM mocks
class MockHTMLElement {
    id = "";
    value = "";
    textContent = "";
    disabled = false;
    hidden = false;
    classList = {
        add: vi.fn(),
        remove: vi.fn(),
        contains: vi.fn(),
    };
    style = { display: "" };
    dataset: Record<string, string> = {};
    attributes: Record<string, string> = {};
    children: MockHTMLElement[] = [];

    getAttribute(name: string) {
        return this.attributes[name] || null;
    }
    setAttribute(name: string, val: string) {
        this.attributes[name] = val;
    }
    removeAttribute(name: string) {
        delete this.attributes[name];
    }

    listeners: Record<string, any> = {};
    addEventListener(event: string, cb: any) {
        this.listeners[event] = cb;
    }
    click() {
        if (this.listeners["click"]) this.listeners["click"]();
    }
    focus() {}
    select() {}

    // For list
    appendChild(child: MockHTMLElement) {
        this.children.push(child);
    }
    removeChild(child: MockHTMLElement) {
        const idx = this.children.indexOf(child);
        if (idx > -1) this.children.splice(idx, 1);
    }
    get firstChild() {
        return this.children[0] || null;
    }
    get firstElementChild() {
        return this.children[0] || null;
    }
    get nextElementSibling() {
        return null;
    } // Simplified
    get childElementCount() {
        return this.children.length;
    }

    closest(sel: string) {
        return this;
    } // Simplified
}

class MockDocument {
    elements: Record<string, MockHTMLElement> = {};
    getElementById(id: string) {
        return this.elements[id] || null;
    }
    createElement(tag: string) {
        return new MockHTMLElement();
    }
    activeElement: MockHTMLElement | null = null;

    listeners: Record<string, any> = {};
    addEventListener(event: string, cb: any) {
        this.listeners[event] = cb;
    }
}

describe("GithubBranchUi", () => {
    let deps: GithubUiDependencies;
    let branchUi: GithubBranchUi;
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
        branchUi = new GithubBranchUi(deps);
        mockDoc = new MockDocument();
        context = {
            document: mockDoc as any,
            window: { setTimeout: vi.fn(), clearTimeout: vi.fn() } as any,
        };

        // Setup elements
        [
            "ghBranchInput",
            "ghBranchToggleBtn",
            "ghBranchMenu",
            "ghBranchCount",
            "ghBranchRefreshBtn",
            "ghNewBranchBtn",
            "ghNewBranchRow",
            "ghNewBranchName",
            "ghCreateBranchConfirmBtn",
            "ghCancelBranchBtn",
        ].forEach((id) => (mockDoc.elements[id] = new MockHTMLElement()));

        // Mock globals
        (globalThis as any).HTMLLIElement = MockHTMLElement;
        (globalThis as any).HTMLInputElement = MockHTMLElement;
        (globalThis as any).HTMLButtonElement = MockHTMLElement;
        (globalThis as any).HTMLUListElement = MockHTMLElement;
    });

    it("should fetch branches when repo is set", () => {
        branchUi.attach(context);
        branchUi.setRepo("owner", "repo");

        expect(deps.postToPlugin).toHaveBeenCalledWith({
            type: "GITHUB_FETCH_BRANCHES",
            payload: { owner: "owner", repo: "repo", page: 1 },
        });
        expect(mockDoc.elements["ghBranchInput"].disabled).toBe(true);
    });

    it("should populate branches on message", () => {
        branchUi.attach(context);
        branchUi.setRepo("owner", "repo");

        branchUi.handleMessage({
            type: "GITHUB_BRANCHES",
            payload: {
                owner: "owner",
                repo: "repo",
                branches: [{ name: "main" }, { name: "dev" }],
                defaultBranch: "main",
                page: 1,
                hasMore: false,
            },
        });

        expect(mockDoc.elements["ghBranchInput"].disabled).toBe(false);
        expect(branchUi.getCurrentBranch()).toBe("main"); // Default
    });

    it("renders branch options and count after load and clears on reset", () => {
        branchUi.attach(context);
        branchUi.setRepo("owner", "repo");

        branchUi.handleMessage({
            type: "GITHUB_BRANCHES",
            payload: {
                owner: "owner",
                repo: "repo",
                branches: [{ name: "zeta" }, { name: "alpha" }],
                defaultBranch: "alpha",
                page: 1,
                hasMore: false,
            },
        });

        const menu = mockDoc.elements["ghBranchMenu"];
        expect(menu.children.length).toBe(2); // renderOptions ran
        expect(mockDoc.elements["ghBranchCount"].textContent).toContain("2");

        branchUi.reset();
        expect(menu.children.length).toBe(0);
        expect(mockDoc.elements["ghBranchInput"].value).toBe("");
    });

    it("should handle branch selection", () => {
        branchUi.attach(context);
        branchUi.setRepo("owner", "repo");
        branchUi.handleMessage({
            type: "GITHUB_BRANCHES",
            payload: {
                owner: "owner",
                repo: "repo",
                branches: [{ name: "main" }, { name: "dev" }],
                defaultBranch: "main",
                page: 1,
                hasMore: false,
            },
        });

        // Simulate typing "dev"
        const input = mockDoc.elements["ghBranchInput"];
        input.value = "dev";

        // Trigger change logic manually since we can't easily simulate full DOM event flow with mocks
        // But we can call the internal method via `handleMessage` RESTORE or just rely on the fact
        // that `processBranchSelection` is called on change.

        // Let's simulate the change event listener
        if (input.listeners["change"]) input.listeners["change"]();

        expect(deps.postToPlugin).toHaveBeenCalledWith({
            type: "GITHUB_SELECT_BRANCH",
            payload: { owner: "owner", repo: "repo", branch: "dev" },
        });
        expect(branchUi.getCurrentBranch()).toBe("dev");
    });

    it("should handle new branch creation", () => {
        branchUi.attach(context);
        branchUi.setRepo("owner", "repo");
        // Load branches first so we have a base
        branchUi.handleMessage({
            type: "GITHUB_BRANCHES",
            payload: {
                owner: "owner",
                repo: "repo",
                branches: [{ name: "main" }],
                defaultBranch: "main",
                page: 1,
                hasMore: false,
            },
        });

        const newBtn = mockDoc.elements["ghNewBranchBtn"];
        newBtn.click();

        const row = mockDoc.elements["ghNewBranchRow"];
        expect(row.style.display).toBe("flex");

        const nameInput = mockDoc.elements["ghNewBranchName"];
        nameInput.value = "feature/test";

        const confirmBtn = mockDoc.elements["ghCreateBranchConfirmBtn"];
        confirmBtn.click();

        expect(deps.postToPlugin).toHaveBeenCalledWith({
            type: "GITHUB_CREATE_BRANCH",
            payload: {
                owner: "owner",
                repo: "repo",
                baseBranch: "main",
                newBranch: "feature/test",
            },
        });
    });
});
