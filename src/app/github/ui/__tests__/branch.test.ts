import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GithubBranchUi } from "../branch";
import type { GithubUiDependencies, AttachContext } from "../types";

// Minimal DOM mocks
class MockHTMLElement {
    id = "";
    _value = "";
    textContent = "";
    disabled = false;
    hidden = false;
    _className = "";

    get value() {
        return this._value;
    }
    set value(v: string) {
        this._value = v;
    }

    get className() {
        return this._className;
    }
    set className(v: string) {
        this._className = v;
    }

    classList = {
        add: (c: string) => {
            this._className += " " + c;
        },
        remove: (c: string) => {
            this._className = this._className.replace(c, "").trim();
        },
        contains: (c: string) => this._className.includes(c),
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listeners: Record<string, any> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addEventListener(event: string, cb: any) {
        this.listeners[event] = cb;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    removeEventListener(event: string, _cb: any) {
        delete this.listeners[event];
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dispatchEvent(event: any) {
        if (this.listeners[event.type]) {
            this.listeners[event.type](event);
        }
    }
    click() {
        if (this.listeners["click"])
            this.listeners["click"]({
                preventDefault: () => {},
                stopPropagation: () => {},
                target: this,
            });
    }
    focus() {
        if (this.listeners["focus"]) this.listeners["focus"]();
    }
    select() {}
    scrollIntoView() {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    contains(_node: any) {
        return false;
    }

    // For list
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    appendChild(child: any) {
        if (typeof child === "string") {
            // ignore text nodes for now or wrap
        } else {
            this.children.push(child);
        }
        return child;
    }
    removeChild(child: MockHTMLElement) {
        const idx = this.children.indexOf(child);
        if (idx > -1) this.children.splice(idx, 1);
        return child;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    replaceChildren(...nodes: any[]) {
        this.children = nodes.filter((n) => typeof n !== "string");
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

    closest(_sel: string) {
        return this;
    } // Simplified
}

class MockDocument {
    elements: Record<string, MockHTMLElement> = {};
    getElementById(id: string) {
        return this.elements[id] || null;
    }
    createElement(_tag: string) {
        return new MockHTMLElement();
    }
    createTextNode(text: string) {
        return text;
    }
    activeElement: MockHTMLElement | null = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listeners: Record<string, any> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    addEventListener(event: string, cb: any) {
        this.listeners[event] = cb;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    removeEventListener(event: string, _cb: any) {
        delete this.listeners[event];
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

        mockDoc = new MockDocument();

        // Setup global document for dom-helpers
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).document = mockDoc;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).window = {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            setTimeout: (cb: any) => cb(),
            clearTimeout: () => {},
        };

        branchUi = new GithubBranchUi(deps);
        context = {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            document: mockDoc as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            window: (globalThis as any).window,
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
            "ghBranchClearBtn",
        ].forEach((id) => (mockDoc.elements[id] = new MockHTMLElement()));

        // Mock globals
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).HTMLLIElement = MockHTMLElement;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).HTMLInputElement = MockHTMLElement;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).HTMLButtonElement = MockHTMLElement;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).HTMLUListElement = MockHTMLElement;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).HTMLElement = MockHTMLElement;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).Node = MockHTMLElement;
    });

    afterEach(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (globalThis as any).document;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (globalThis as any).window;
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
        // Autocomplete renders items.
        // We need to trigger a query or ensure items are set.
        // handleMessage calls applyBranchFilter which calls updateAutocompleteItems.

        expect(menu.children.length).toBe(2);
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
