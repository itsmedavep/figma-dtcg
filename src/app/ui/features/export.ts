import { appState } from "../state";

export function prettyExportName(original: string | undefined | null): string {
    const name =
        original && typeof original === "string" ? original : "tokens.json";
    const m = name.match(/^(.*)_mode=(.*)\.tokens\.json$/);
    if (m) {
        const collection = m[1].trim();
        const mode = m[2].trim();
        return `${collection} - ${mode}.json`;
    }
    return name.endsWith(".json") ? name : name + ".json";
}

export function supportsFilePicker(): boolean {
    return typeof (window as any).showSaveFilePicker === "function";
}

export async function beginPendingSave(
    suggestedName: string
): Promise<boolean> {
    try {
        if (!supportsFilePicker()) return false;
        const handle = await (window as any).showSaveFilePicker({
            suggestedName,
            types: [
                {
                    description: "JSON",
                    accept: { "application/json": [".json"] },
                },
            ],
        });
        const writable: FileSystemWritableFileStream =
            await handle.createWritable();
        appState.pendingSave = { writable, name: suggestedName };
        return true;
    } catch {
        appState.pendingSave = null;
        return false;
    }
}

export async function finishPendingSave(text: string): Promise<boolean> {
    if (!appState.pendingSave) return false;
    try {
        await appState.pendingSave.writable.write(
            new Blob([text], { type: "application/json" })
        );
        await appState.pendingSave.writable.close();
        return true;
    } catch {
        try {
            await appState.pendingSave.writable.close();
        } catch {
            /* ignore */
        }
        return false;
    } finally {
        appState.pendingSave = null;
    }
}

export function triggerJsonDownload(filename: string, text: string): void {
    try {
        const blob = new Blob([text], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.style.position = "absolute";
        a.style.left = "-9999px";
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            URL.revokeObjectURL(url);
            a.remove();
        }, 0);
    } catch {
        /* ignore */
    }
}
