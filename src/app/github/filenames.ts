// src/app/github/filenames.ts
// Shared helpers for validating GitHub export filenames so UI and plugin stay in sync.

export const DEFAULT_GITHUB_FILENAME = "tokens.json";
/**
 * Regex to detect invalid characters in GitHub filenames.
 * Includes ASCII control characters (\u0000-\u001F) which are not allowed in
 * filenames and could cause filesystem or security issues.
 */
// eslint-disable-next-line no-control-regex -- Intentionally filtering control characters for filename safety
const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001F]/;
const MAX_FILENAME_LENGTH = 128;

export type GithubFilenameValidation =
    | { ok: true; filename: string }
    | { ok: false; message: string };

export function validateGithubFilename(
    raw: string | null | undefined
): GithubFilenameValidation {
    const initial = typeof raw === "string" ? raw : DEFAULT_GITHUB_FILENAME;
    const trimmed = initial.trim();
    if (!trimmed) {
        return {
            ok: false,
            message: "GitHub: Enter a filename (e.g., tokens.json).",
        };
    }
    if (trimmed === "." || trimmed === "..") {
        return {
            ok: false,
            message: 'GitHub: Filename cannot be "." or "..".',
        };
    }
    if (trimmed.length > MAX_FILENAME_LENGTH) {
        return {
            ok: false,
            message: `GitHub: Filename must be ${MAX_FILENAME_LENGTH} characters or fewer.`,
        };
    }
    if (INVALID_FILENAME_CHARS.test(trimmed)) {
        return {
            ok: false,
            message:
                'GitHub: Filename contains unsupported characters like / \\ : * ? " < > |.',
        };
    }
    if (!/\.json$/i.test(trimmed)) {
        return { ok: false, message: "GitHub: Filename must end with .json." };
    }
    return { ok: true, filename: trimmed };
}
