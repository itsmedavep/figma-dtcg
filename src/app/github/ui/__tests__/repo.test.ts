import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GithubRepoUi } from "../repo";
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

    // Select specific
    get options() {
        return this.children;
    }
    selectedIndex = -1;

    getAttribute(name: string) {
        return this.attributes[name] || null;
    }
    setAttribute(name: string, val: string) {
        this.attributes[name] = val;
        (this as any)[name] = val;
    }
    removeAttribute(name: string) {
        delete this.attributes[name];
    }

    listeners: Record<string, (e: unknown) => void> = {};
    addEventListener(event: string, cb: (e: unknown) => void) {
        this.listeners[event] = cb;
    }
    click() {
        if (this.listeners["click"])
            this.listeners["click"]({
                preventDefault: () => {},
                target: this,
                stopPropagation: () => {},
            });
    }

    // For list
    appendChild(child: any) {
        if (typeof child === "string") {
            this.textContent += child;
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
    remove(index: number) {
        this.children.splice(index, 1);
    }
    replaceChildren(...children: any[]) {
        this.children = children.filter((c) => typeof c !== "string");
    }
    get firstChild() {
        return this.children[0] || null;
    }

    contains(_node: Node | null) {
        return false;
    }
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

    listeners: Record<string, (e: unknown) => void> = {};
    addEventListener(event: string, cb: (e: unknown) => void) {
        this.listeners[event] = cb;
    }
    contains(_node: Node | null) {
        return false;
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

        mockDoc = new MockDocument();

        // Setup global document for dom-helpers
        (globalThis as any).document = mockDoc;
        (globalThis as any).window = {
            setTimeout: (cb: any) => cb(),
            clearTimeout: () => {},
        };

        repoUi = new GithubRepoUi(deps);
        context = {
            document: mockDoc as unknown as Document,
            window: (globalThis as any).window,
        };

        mockDoc.elements["ghRepoSelect"] = new MockHTMLElement();

        // Mock globals
        (globalThis as any).HTMLElement = MockHTMLElement;
        (globalThis as any).HTMLInputElement = MockHTMLElement;
        (globalThis as any).HTMLButtonElement = MockHTMLElement;
        (globalThis as any).HTMLSelectElement = MockHTMLElement;
        (globalThis as any).HTMLOptionElement = MockHTMLElement;
        (globalThis as any).Node = MockHTMLElement;
    });

    afterEach(() => {
        delete (globalThis as any).document;
        delete (globalThis as any).window;
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
        select.appendChild(opt);
        select.value = "owner/repo1";

        // Simulate change event
        if (select.listeners["change"]) select.listeners["change"]({});

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
