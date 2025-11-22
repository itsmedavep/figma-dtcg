import { ImportSummary } from "../messages";

export const IMPORT_PREF_KEY = "dtcg.importPreference.v1";
export const IMPORT_LOG_KEY = "dtcg.importLog.v1";

export type ImportContextOption = {
    context: string;
    collection: string;
    mode: string;
};

export type ImportPreference = { contexts: string[]; updatedAt: number };

export type ImportLogEntry = {
    timestamp: number;
    source?: "local" | "github";
    summary: ImportSummary;
};

export function normalizeContextList(list: string[]): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (let i = 0; i < list.length; i++) {
        const raw = String(list[i] ?? "").trim();
        if (!raw) continue;
        if (seen.has(raw)) continue;
        seen.add(raw);
        out.push(raw);
    }
    out.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    return out;
}

export function contextsEqual(a: string[], b: string[]): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

export function readImportPreference(): ImportPreference | null {
    try {
        const raw = window.localStorage?.getItem(IMPORT_PREF_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ctxs = Array.isArray((parsed as any).contexts)
            ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
              normalizeContextList((parsed as any).contexts as string[])
            : [];
        const ts =
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            typeof (parsed as any).updatedAt === "number"
                ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  Number((parsed as any).updatedAt)
                : Date.now();
        if (ctxs.length > 0) return { contexts: ctxs, updatedAt: ts };
    } catch {
        /* ignore */
    }
    return null;
}

export function writeImportPreference(pref: ImportPreference): void {
    try {
        window.localStorage?.setItem(IMPORT_PREF_KEY, JSON.stringify(pref));
    } catch {
        /* ignore */
    }
}

export function removeImportPreference(): void {
    try {
        window.localStorage?.removeItem(IMPORT_PREF_KEY);
    } catch {
        /* ignore */
    }
}

export function readImportLog(): ImportLogEntry[] {
    try {
        const raw = window.localStorage?.getItem(IMPORT_LOG_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        const entries: ImportLogEntry[] = [];
        for (let i = 0; i < parsed.length; i++) {
            const entry = parsed[i];
            if (!entry || typeof entry !== "object") continue;
            const timestamp =
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                typeof (entry as any).timestamp === "number"
                    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      Number((entry as any).timestamp)
                    : null;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const summary = (entry as any).summary as ImportSummary | undefined;
            const source =
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (entry as any).source === "github"
                    ? "github"
                    : // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (entry as any).source === "local"
                    ? "local"
                    : undefined;
            if (!timestamp || !summary || typeof summary !== "object") continue;
            if (
                !Array.isArray(summary.appliedContexts) ||
                !Array.isArray(summary.availableContexts)
            )
                continue;
            if (!Array.isArray(summary.tokensWithRemovedContexts)) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (summary as any).tokensWithRemovedContexts = [];
            }
            if (!Array.isArray(summary.skippedContexts)) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (summary as any).skippedContexts = [];
            }
            if (!Array.isArray(summary.missingRequestedContexts)) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (summary as any).missingRequestedContexts = [];
            }
            if (
                typeof summary.createdStyles !== "number" ||
                !isFinite(summary.createdStyles)
            ) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (summary as any).createdStyles = 0;
            }
            entries.push({ timestamp, summary, source });
        }
        entries.sort((a, b) => a.timestamp - b.timestamp);
        return entries;
    } catch {
        return [];
    }
}

export function writeImportLog(entries: ImportLogEntry[]): void {
    try {
        window.localStorage?.setItem(IMPORT_LOG_KEY, JSON.stringify(entries));
    } catch {
        /* ignore */
    }
}
