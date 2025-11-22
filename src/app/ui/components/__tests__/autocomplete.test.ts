import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Autocomplete, AutocompleteItem } from "../autocomplete";

// Minimal DOM mocks
class MockHTMLElement {
    tagName = "";
    _className = "";
    dataset: Record<string, string> = {};
    style: Record<string, string> = {};
    attributes: Record<string, string> = {};
    children: any[] = [];
    listeners: Record<string, any> = {};
    type = "";
    disabled = false;
    textContent = "";
    value = "";
    hidden = false;

    constructor(tagName: string) {
        this.tagName = tagName.toUpperCase();
    }

    get className() {
        return this._className;
    }
    set className(v: string) {
        this._className = v;
    }

    getAttribute(name: string) {
        return this.attributes[name];
    }
    setAttribute(name: string, val: string) {
        this.attributes[name] = val;
    }
    removeAttribute(name: string) {
        delete this.attributes[name];
    }

    addEventListener(event: string, cb: any) {
        this.listeners[event] = cb;
    }
    removeEventListener(event: string, cb: any) {
        delete this.listeners[event];
    }
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
    contains() {
        return false;
    }

    closest(selector: string) {
        if (selector.toUpperCase() === this.tagName) return this;
        return null;
    }

    appendChild(child: any) {
        if (typeof child === "string") {
            this.textContent += child;
        } else {
            this.children.push(child);
        }
        return child;
    }

    get childNodes() {
        return this.children;
    }
    get firstElementChild() {
        return this.children.find((c) => typeof c !== "string");
    }
    get firstChild() {
        return this.children[0];
    }

    removeChild(child: any) {
        const idx = this.children.indexOf(child);
        if (idx > -1) this.children.splice(idx, 1);
    }
    replaceChildren(...children: any[]) {
        this.children = children.filter((c) => typeof c !== "string");
    }
}

class MockDocument {
    listeners: Record<string, any> = {};
    createElement(tag: string) {
        return new MockHTMLElement(tag);
    }
    createTextNode(text: string) {
        return text;
    }
    addEventListener(event: string, cb: any) {
        this.listeners[event] = cb;
    }
    removeEventListener(event: string, cb: any) {
        if (this.listeners[event] === cb) delete this.listeners[event];
    }
}

class MockEvent {
    type: string;
    target: any;
    constructor(type: string) {
        this.type = type;
    }
    preventDefault() {}
    stopPropagation() {}
}

class MockKeyboardEvent extends MockEvent {
    key: string;
    constructor(type: string, init: { key: string }) {
        super(type);
        this.key = init.key;
    }
}

describe("Autocomplete", () => {
    let input: HTMLInputElement;
    let menu: HTMLElement;
    let toggleBtn: HTMLButtonElement;
    let onQuery: any;
    let onSelect: any;
    let autocomplete: Autocomplete;

    beforeEach(() => {
        vi.stubGlobal("document", new MockDocument());
        vi.stubGlobal("window", {
            setTimeout: (cb: any) => cb(),
            clearTimeout: () => {},
        });
        vi.stubGlobal("Event", MockEvent);
        vi.stubGlobal("MouseEvent", MockEvent);
        vi.stubGlobal("KeyboardEvent", MockKeyboardEvent);
        vi.stubGlobal("Node", MockHTMLElement);

        input = document.createElement("input") as any;
        menu = document.createElement("ul") as any;
        toggleBtn = document.createElement("button") as any;
        onQuery = vi.fn();
        onSelect = vi.fn();

        autocomplete = new Autocomplete({
            input,
            menu,
            toggleBtn,
            onQuery,
            onSelect,
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("should open menu on focus", () => {
        input.focus();
        expect(menu.hidden).toBe(false);
        expect(onQuery).toHaveBeenCalledWith("");
    });

    it("should trigger onQuery on input", async () => {
        input.value = "test";
        input.dispatchEvent(new Event("input"));

        // Wait for debounce (mocked to immediate)
        await new Promise((r) => setTimeout(r, 0));

        expect(onQuery).toHaveBeenCalledWith("test");
    });

    it("should render items", () => {
        const items: AutocompleteItem[] = [
            { key: "1", label: "Item 1", value: "1", type: "option" },
            { key: "2", label: "Item 2", value: "2", type: "option" },
        ];
        autocomplete.setItems(items);

        expect(menu.children.length).toBe(2);
        expect(menu.children[0].textContent).toBe("Item 1");
        expect(menu.children[1].textContent).toBe("Item 2");
    });

    it("should handle selection via click", () => {
        const items: AutocompleteItem[] = [
            { key: "1", label: "Item 1", value: "val1", type: "option" },
        ];
        autocomplete.setItems(items);
        autocomplete.open();

        const li = menu.children[0] as any;
        // Mock target property on event
        const event = new MouseEvent("click") as any;
        event.target = li;

        // Dispatch on menu because listener is on menu
        menu.dispatchEvent(event);

        expect(onSelect).toHaveBeenCalledWith(items[0], false);
    });

    it("should handle keyboard navigation", () => {
        const items: AutocompleteItem[] = [
            { key: "1", label: "Item 1", value: "val1", type: "option" },
            { key: "2", label: "Item 2", value: "val2", type: "option" },
        ];
        autocomplete.setItems(items);
        autocomplete.open();
        // open() auto-selects the first item (index 0)

        expect(menu.children[0].getAttribute("data-active")).toBe("1");

        // Arrow Down -> Select second (index 1)
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
        expect(menu.children[1].getAttribute("data-active")).toBe("1");

        // Arrow Down -> Wrap to first (index 0)
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
        expect(menu.children[0].getAttribute("data-active")).toBe("1");

        // Arrow Up -> Wrap to last (index 1)
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));
        expect(menu.children[1].getAttribute("data-active")).toBe("1");

        // Enter -> Select
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
        expect(onSelect).toHaveBeenCalledWith(items[1], true);
    });

    it("should toggle menu with button", () => {
        toggleBtn.click();
        expect(menu.hidden).toBe(false);

        toggleBtn.click();
        expect(menu.hidden).toBe(true);
    });

    it("should detach document listener on destroy", () => {
        const doc = document as any as MockDocument;
        expect(typeof doc.listeners["mousedown"]).toBe("function");
        autocomplete.destroy();
        expect(doc.listeners["mousedown"]).toBeUndefined();
    });
});
