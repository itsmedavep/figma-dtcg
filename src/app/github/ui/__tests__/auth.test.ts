import { describe, it, expect, vi, beforeEach } from "vitest";
import { GithubAuthUi } from "../auth";
import type { GithubUiDependencies, AttachContext } from "../types";

// Minimal DOM mocks
class MockHTMLElement {
    id = "";
    value = "";
    textContent = "";
    disabled = false;
    type = "text";
    checked = false;
    hidden = false;
    classList = {
        add: vi.fn(),
        remove: vi.fn(),
        contains: vi.fn(),
    };
    style = { display: "" };
    dataset: Record<string, string> = {};
    attributes: Record<string, string> = {};

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
    addEventListener(event: string, cb: any) {
        this.listeners[event] = cb;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listeners: Record<string, any> = {};
    click() {
        if (this.listeners["click"]) this.listeners["click"]();
    }
    change() {
        if (this.listeners["change"]) this.listeners["change"]();
    }
    input() {
        if (this.listeners["input"]) this.listeners["input"]();
    }
}

class MockDocument {
    elements: Record<string, MockHTMLElement> = {};

    getElementById(id: string) {
        return this.elements[id] || null;
    }
    querySelector(sel: string) {
        // Simple mock for querySelector used in findTokenInput
        if (sel === 'input[name="githubToken"]')
            return this.elements["githubTokenInput"];
        if (sel === 'input[type="password"]')
            return this.elements["githubTokenInput"];
        return null;
    }
}

describe("GithubAuthUi", () => {
    let deps: GithubUiDependencies;
    let authUi: GithubAuthUi;
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
        authUi = new GithubAuthUi(deps);
        mockDoc = new MockDocument();
        context = {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            document: mockDoc as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            window: {} as any,
        };

        // Setup common elements
        mockDoc.elements["githubTokenInput"] = new MockHTMLElement();
        mockDoc.elements["githubRememberChk"] = new MockHTMLElement();
        mockDoc.elements["githubConnectBtn"] = new MockHTMLElement();
        mockDoc.elements["githubVerifyBtn"] = new MockHTMLElement();
        mockDoc.elements["ghLogoutBtn"] = new MockHTMLElement();
        mockDoc.elements["ghAuthStatus"] = new MockHTMLElement();
        mockDoc.elements["ghTokenMeta"] = new MockHTMLElement();
    });

    it("should attach and initialize UI", () => {
        authUi.attach(context);
        expect(mockDoc.elements["ghAuthStatus"].textContent).toBe(
            "GitHub: not authenticated."
        );
    });

    it("should handle login click", () => {
        authUi.attach(context);
        const tokenInput = mockDoc.elements["githubTokenInput"];
        tokenInput.value = "ghp_test123";

        const connectBtn = mockDoc.elements["githubConnectBtn"];
        connectBtn.click();

        expect(deps.postToPlugin).toHaveBeenCalledWith({
            type: "GITHUB_SET_TOKEN",
            payload: { token: "ghp_test123", remember: true }, // default remember is true
        });
    });

    it("should handle auth success message", () => {
        authUi.attach(context);
        authUi.handleMessage({
            type: "GITHUB_AUTH_RESULT",
            payload: { ok: true, login: "testuser" },
        });

        expect(authUi.isAuthed()).toBe(true);
        expect(mockDoc.elements["ghAuthStatus"].textContent).toBe(
            "GitHub: authenticated."
        );
        expect(deps.log).toHaveBeenCalledWith(
            "GitHub: Authenticated as testuser."
        );

        // Check obfuscation
        const tokenInput = mockDoc.elements["githubTokenInput"];
        expect(tokenInput.type).toBe("password");
        expect(tokenInput.value).toBe("••••••••••");
    });

    it("should handle logout", () => {
        authUi.attach(context);
        // Login first
        authUi.handleMessage({
            type: "GITHUB_AUTH_RESULT",
            payload: { ok: true, login: "testuser" },
        });

        const logoutBtn = mockDoc.elements["ghLogoutBtn"];
        logoutBtn.click();

        expect(deps.postToPlugin).toHaveBeenCalledWith({
            type: "GITHUB_FORGET_TOKEN",
        });
        expect(authUi.isAuthed()).toBe(false);
        expect(mockDoc.elements["ghAuthStatus"].textContent).toBe(
            "GitHub: not authenticated."
        );
    });
});
