import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { h, clearChildren } from "./dom-helpers";

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
    private _textContent = "";

    constructor(tagName: string) {
        this.tagName = tagName.toUpperCase();
        if (tagName.toLowerCase() === "input") {
            this.type = "text";
        }
    }

    get className() {
        return this._className;
    }
    set className(v: string) {
        this._className = v;
    }

    get textContent() {
        if (this._textContent) return this._textContent;
        let acc = "";
        for (const child of this.children) {
            if (typeof child === "string") acc += child;
            else if (child && typeof child.textContent === "string")
                acc += child.textContent;
        }
        return acc;
    }
    set textContent(v: string) {
        this._textContent = v;
    }

    getAttribute(name: string) {
        return this.attributes[name];
    }
    setAttribute(name: string, val: string) {
        this.attributes[name] = val;
        if (typeof (this as any)[name] === "boolean") {
            (this as any)[name] = val === "" ? true : Boolean(val);
        } else {
            (this as any)[name] = val;
        }
    }

    addEventListener(event: string, cb: any) {
        this.listeners[event] = cb;
    }
    click() {
        if (this.listeners["click"]) this.listeners["click"]();
    }

    appendChild(child: any) {
        if (typeof child === "string") {
            this._textContent += child;
        } else {
            this.children.push(child);
            if (child && typeof child.textContent === "string") {
                this._textContent += child.textContent;
            }
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
}

class MockDocument {
    createElement(tag: string) {
        return new MockHTMLElement(tag);
    }
    createTextNode(text: string) {
        return text;
    }
}

describe("dom-helpers", () => {
    beforeEach(() => {
        vi.stubGlobal("document", new MockDocument());
        vi.stubGlobal("Node", MockHTMLElement);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    describe("h()", () => {
        it("should create an element with the given tag", () => {
            const el = h("div");
            expect(el.tagName).toBe("DIV");
        });

        it("should set properties and attributes", () => {
            const el = h("input", {
                type: "text",
                className: "my-input",
                disabled: true,
                "data-test": "123",
            });
            expect(el.type).toBe("text");
            expect(el.className).toBe("my-input");
            expect(el.disabled).toBe(true);
            expect(el.getAttribute("data-test")).toBe("123");
        });

        it("should handle dataset property object", () => {
            const el = h("div", {
                dataset: { foo: "bar", baz: "qux" },
            });
            expect(el.dataset.foo).toBe("bar");
            expect(el.dataset.baz).toBe("qux");
        });

        it("should handle style property object", () => {
            const el = h("div", {
                style: { color: "red", display: "none" },
            });
            expect(el.style.color).toBe("red");
            expect(el.style.display).toBe("none");
        });

        it("should attach event listeners", () => {
            let clicked = false;
            const el = h("button", {
                onclick: () => {
                    clicked = true;
                },
            });
            el.click();
            expect(clicked).toBe(true);
        });

        it("should append string children as text nodes", () => {
            const el = h("div", null, "Hello", " ", "World");
            expect(el.textContent).toBe("Hello World");
        });

        it("should append node children", () => {
            const child = h("span", null, "Child");
            const el = h("div", null, child);
            expect(el.firstElementChild).toBe(child);
            expect(el.textContent).toBe("Child"); // Mock implementation detail
        });
    });

    describe("clearChildren()", () => {
        it("should remove all children from an element", () => {
            const el = document.createElement("div");
            el.appendChild(document.createElement("span"));
            el.appendChild(document.createElement("p"));
            expect(el.childNodes.length).toBe(2);

            clearChildren(el);
            expect(el.childNodes.length).toBe(0);
        });
    });
});
