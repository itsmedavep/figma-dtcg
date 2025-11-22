import { describe, it, expect, vi, beforeEach } from "vitest";
import { GithubFolderUi } from "./folder";
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
    mousedown() {
        if (this.listeners["mousedown"])
            this.listeners["mousedown"]({
                preventDefault: () => {},
                target: this,
                stopPropagation: () => {},
            });
    }
    focus() {}
    select() {}

    // For list
    appendChild(child: MockHTMLElement) {
        this.children.push(child);
    }
    replaceChildren(...children: MockHTMLElement[]) {
        this.children = children;
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
    activeElement: MockHTMLElement | null = null;

    listeners: Record<string, (e: unknown) => void> = {};
    addEventListener(event: string, cb: (e: unknown) => void) {
        this.listeners[event] = cb;
    }
    contains(_node: Node | null) {
        return false;
    }
}

describe("GithubFolderUi", () => {
    let deps: GithubUiDependencies;
    let folderUi: GithubFolderUi;
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
        folderUi = new GithubFolderUi(deps);
        mockDoc = new MockDocument();
        context = {
            document: mockDoc as unknown as Document,
            window: {
                setTimeout: vi.fn((cb) => cb()),
                clearTimeout: vi.fn(),
            } as unknown as Window,
        };

        // Setup elements
        [
            "ghFolderInput",
            "ghFolderDisplay",
            "ghPickFolderBtn",
            "folderPickerOverlay",
            "folderPickerTitle",
            "folderPickerPath",
            "folderPickerUseBtn",
            "folderPickerList",
            "folderPickerCancelBtn",
        ].forEach((id) => (mockDoc.elements[id] = new MockHTMLElement()));

        // Mock globals
        (
            globalThis as unknown as { HTMLElement: typeof MockHTMLElement }
        ).HTMLElement = MockHTMLElement;
        (
            globalThis as unknown as {
                HTMLInputElement: typeof MockHTMLElement;
            }
        ).HTMLInputElement = MockHTMLElement;
        (
            globalThis as unknown as {
                HTMLButtonElement: typeof MockHTMLElement;
            }
        ).HTMLButtonElement = MockHTMLElement;
    });

    it("should open picker and list root folders", async () => {
        folderUi.attach(context);
        folderUi.setContext("owner", "repo", "main");

        const btn = mockDoc.elements["ghPickFolderBtn"];
        btn.click();

        expect(mockDoc.elements["folderPickerOverlay"].hidden).toBe(false);
        expect(deps.postToPlugin).toHaveBeenCalledWith({
            type: "GITHUB_FOLDER_LIST",
            payload: { owner: "owner", repo: "repo", branch: "main", path: "" },
        });

        // Simulate response
        folderUi.handleMessage({
            type: "GITHUB_FOLDER_LIST_RESULT",
            payload: {
                owner: "owner",
                repo: "repo",
                branch: "main",
                path: "",
                ok: true,
                entries: [
                    { name: "src", type: "dir" },
                    { name: "README.md", type: "file" },
                ],
            },
        });

        // Wait for promise resolution (microtask)
        await new Promise((r) => setTimeout(r, 0));

        const list = mockDoc.elements["folderPickerList"];
        expect(list.children.length).toBe(1); // Only dirs
        expect(list.children[0].textContent).toBe("src/");
    });

    it("should trigger onFolderChange when restoring selected folder", () => {
        const spy = vi.fn();
        folderUi.onFolderChange = spy;

        folderUi.handleMessage({
            type: "GITHUB_RESTORE_SELECTED",
            payload: { folder: "src/app" },
        });

        expect(spy).toHaveBeenCalledWith("src/app");
    });

    it("should navigate into folder", async () => {
        folderUi.attach(context);
        folderUi.setContext("owner", "repo", "main");

        // Open picker
        mockDoc.elements["ghPickFolderBtn"].click();

        // Respond to root list
        folderUi.handleMessage({
            type: "GITHUB_FOLDER_LIST_RESULT",
            payload: {
                owner: "owner",
                repo: "repo",
                branch: "main",
                path: "",
                ok: true,
                entries: [{ name: "src", type: "dir" }],
            },
        });
        await new Promise((r) => setTimeout(r, 0));

        // Click "src/" (mousedown now)
        const list = mockDoc.elements["folderPickerList"];
        const srcBtn = list.children[0];
        srcBtn.mousedown();

        expect(deps.postToPlugin).toHaveBeenCalledWith({
            type: "GITHUB_FOLDER_LIST",
            payload: {
                owner: "owner",
                repo: "repo",
                branch: "main",
                path: "src",
            },
        });

        // Check input update
        expect(mockDoc.elements["folderPickerPath"].value).toBe("src");
    });

    it("should select folder", () => {
        folderUi.attach(context);
        folderUi.setContext("owner", "repo", "main");

        // Open picker
        mockDoc.elements["ghPickFolderBtn"].click();

        // Set path manually
        const input = mockDoc.elements["folderPickerPath"];
        input.value = "dist";

        // Click Use
        const useBtn = mockDoc.elements["folderPickerUseBtn"];
        useBtn.click();

        expect(deps.postToPlugin).toHaveBeenCalledWith({
            type: "GITHUB_SET_FOLDER",
            payload: { owner: "owner", repo: "repo", folder: "dist" },
        });

        expect(mockDoc.elements["folderPickerOverlay"].hidden).toBe(true);
        expect(folderUi.getFolder()).toBe("dist");
    });

    it("resets picker state after use", () => {
        folderUi.attach(context);
        folderUi.setContext("owner", "repo", "main");
        mockDoc.elements["ghPickFolderBtn"].click();

        const overlay = mockDoc.elements["folderPickerOverlay"];
        expect(overlay.hidden).toBe(false);

        folderUi.reset();
        expect(overlay.hidden).toBe(true);
        expect(mockDoc.elements["folderPickerPath"].value).toBe("");
    });

    it("should navigate deep into folders", async () => {
        folderUi.attach(context);
        folderUi.setContext("owner", "repo", "main");

        // Open picker
        const btn = mockDoc.elements["ghPickFolderBtn"];
        btn.click();

        // Root list
        folderUi.handleMessage({
            type: "GITHUB_FOLDER_LIST_RESULT",
            payload: {
                ok: true,
                owner: "owner",
                repo: "repo",
                branch: "main",
                path: "",
                entries: [{ name: "src", type: "dir" }],
            },
        });
        await new Promise((r) => setTimeout(r, 0));

        // Click "src/"
        const list = mockDoc.elements["folderPickerList"];
        const srcBtn = list.children[0];
        srcBtn.mousedown();

        expect(deps.postToPlugin).toHaveBeenLastCalledWith({
            type: "GITHUB_FOLDER_LIST",
            payload: {
                owner: "owner",
                repo: "repo",
                branch: "main",
                path: "src",
            },
        });

        // Respond with src contents
        folderUi.handleMessage({
            type: "GITHUB_FOLDER_LIST_RESULT",
            payload: {
                ok: true,
                owner: "owner",
                repo: "repo",
                branch: "main",
                path: "src",
                entries: [{ name: "app", type: "dir" }],
            },
        });
        await new Promise((r) => setTimeout(r, 0));

        // Click "app/"
        const appBtn = list.children[1]; // 0 is ".."
        appBtn.mousedown();

        expect(deps.postToPlugin).toHaveBeenLastCalledWith({
            type: "GITHUB_FOLDER_LIST",
            payload: {
                owner: "owner",
                repo: "repo",
                branch: "main",
                path: "src/app",
            },
        });
    });
});
