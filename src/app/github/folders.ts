// src/app/github/folders.ts
// Shared helpers for normalizing GitHub folder inputs.

/**
 * Regex to detect invalid characters in GitHub folder path segments.
 * Includes ASCII control characters (\u0000-\u001F) which are not allowed in
 * folder paths and could cause filesystem or security issues.
 */
// eslint-disable-next-line no-control-regex -- Intentionally filtering control characters for path safety
const INVALID_FOLDER_SEGMENT = /[<>:"\\|?*\u0000-\u001F]/;

type FolderNormalization =
    | { ok: true; storage: string }
    | { ok: false; message: string };

type FolderCommitPath =
    | { ok: true; path: string }
    | { ok: false; message: string };

function validateFolderSegments(segments: string[]): string | null {
    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        if (!seg) return "GitHub: Folder path has an empty segment.";
        if (seg === "." || seg === "..") {
            return 'GitHub: Folder path cannot include "." or ".." segments.';
        }
        if (INVALID_FOLDER_SEGMENT.test(seg)) {
            return `GitHub: Folder segment "${seg}" contains invalid characters.`;
        }
    }
    return null;
}

export function normalizeFolderForStorage(raw: string): FolderNormalization {
    const trimmed = (raw ?? "").trim();
    if (!trimmed) return { ok: true, storage: "" };
    if (trimmed === "/" || trimmed === "./" || trimmed === ".")
        return { ok: true, storage: "/" };

    const collapsed = trimmed.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
    const stripped = collapsed.replace(/^\/+/, "").replace(/\/+$/, "");
    if (!stripped) return { ok: true, storage: "/" };

    const segments = stripped.split("/").filter(Boolean);
    const err = validateFolderSegments(segments);
    if (err) return { ok: false, message: err };
    return { ok: true, storage: segments.join("/") };
}

export function folderStorageToCommitPath(stored: string): FolderCommitPath {
    if (!stored) return { ok: true, path: "" };
    if (stored === "/" || stored === "./" || stored === ".")
        return { ok: true, path: "" };

    const collapsed = stored.replace(/\\/g, "/").replace(/\/{2,}/g, "/");
    const stripped = collapsed.replace(/^\/+/, "").replace(/\/+$/, "");
    if (!stripped) return { ok: true, path: "" };

    const segments = stripped.split("/").filter(Boolean);
    const err = validateFolderSegments(segments);
    if (err) return { ok: false, message: err };
    return { ok: true, path: segments.join("/") };
}
