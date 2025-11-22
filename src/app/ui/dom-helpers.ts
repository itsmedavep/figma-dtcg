// src/app/ui/dom-helpers.ts
// Helpers for creating DOM elements and clearing child nodes.
/**
 * Helper to create DOM elements with attributes and children.
 *
 * @param tag The tag name (e.g. "div", "span", "li")
 * @param props Optional attributes and properties (e.g. { className: "foo", onclick: ... })
 * @param children Optional children (strings or Nodes)
 * @returns The created HTMLElement
 */
export function h<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    props?: Record<string, any> | null,
    ...children: (string | Node | null | undefined)[]
): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);

    if (props) {
        for (const key in props) {
            if (Object.prototype.hasOwnProperty.call(props, key)) {
                const val = props[key];
                if (key === "className") {
                    el.className = val;
                } else if (key === "dataset" && typeof val === "object") {
                    for (const dKey in val) {
                        el.dataset[dKey] = val[dKey];
                    }
                } else if (key === "style" && typeof val === "object") {
                    Object.assign(el.style, val);
                } else if (key.startsWith("on") && typeof val === "function") {
                    // Event listener
                    el.addEventListener(key.substring(2).toLowerCase(), val);
                } else if (key === "textContent") {
                    (el as HTMLElement).textContent = val;
                } else if (val === true) {
                    if (key in el && typeof (el as any)[key] === "boolean") {
                        (el as any)[key] = true;
                    }
                    el.setAttribute(key, "");
                } else if (val === false || val === null || val === undefined) {
                    // skip
                } else {
                    el.setAttribute(key, String(val));
                }
            }
        }
    }

    for (const child of children) {
        if (typeof child === "string") {
            el.appendChild(document.createTextNode(child));
        } else if (child instanceof Node) {
            el.appendChild(child);
        }
    }

    return el;
}

/**
 * Removes all child nodes from an element.
 */
export function clearChildren(el: HTMLElement): void {
    while (el.firstChild) {
        el.removeChild(el.firstChild);
    }
}
