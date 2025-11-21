import { UiToPlugin } from "../messages";
import { uiElements } from "./dom";

/** Append a message to the log panel and console. */
export function log(msg: string): void {
    const t = new Date().toLocaleTimeString();
    const line = document.createElement("div");
    line.textContent = "[" + t + "] " + msg;
    if (uiElements.logEl) {
        uiElements.logEl.appendChild(line);
        (uiElements.logEl as HTMLElement).scrollTop = (
            uiElements.logEl as HTMLElement
        ).scrollHeight;
    }
}

/** Send a typed message to the plugin controller. */
export function postToPlugin(message: UiToPlugin): void {
    (
        parent as unknown as { postMessage: (m: unknown, t: string) => void }
    ).postMessage({ pluginMessage: message }, "*");
}

/** Format JSON with indentation while collapsing undefined/null gracefully. */
export function prettyJson(obj: unknown): string {
    try {
        return JSON.stringify(obj, null, 2);
    } catch {
        return String(obj);
    }
}

export function copyElText(el: HTMLElement | null, label: string): void {
    if (!el) return;
    try {
        const text = el.textContent ?? "";
        if (
            navigator.clipboard &&
            typeof navigator.clipboard.writeText === "function"
        ) {
            navigator.clipboard
                .writeText(text)
                .then(() => {
                    log(`Copied ${label} to clipboard.`);
                })
                .catch(() => {
                    throw new Error("clipboard write failed");
                });
            return;
        }

        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, ta.value.length);

        const ok = document.execCommand("copy");
        document.body.removeChild(ta);

        if (ok) log(`Copied ${label} to clipboard (${text.length} chars).`);
        else throw new Error("execCommand(copy) returned false");
    } catch {
        log(`Could not copy ${label}.`);
    }
}
