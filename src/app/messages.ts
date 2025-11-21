// src/app/messages.ts
// Message contracts between the iframe UI and plugin controller.
// - Keeps cross-thread communication type-safe
// - Documents payload shapes for GitHub workflows and token sync

import type { ImportSummary } from "../core/pipeline";
export type { ImportSummary } from "../core/pipeline";

// UI -> Plugin
export interface GithubRepoTarget {
    owner: string;
    repo: string;
}

/** Scope for export/commit actions coming from the UI. */
export type GithubScope = "all" | "selected" | "typography";

export interface GithubBranchPayload extends GithubRepoTarget {
    branch: string;
}

export interface GithubFolderPayload extends GithubRepoTarget {
    folder: string;
}

export type UiToPlugin =
    | { type: "UI_READY" }
    | { type: "FETCH_COLLECTIONS" }
    | {
          type: "IMPORT_DTCG";
          payload: {
              json: unknown;
              allowHexStrings?: boolean;
              contexts?: string[];
          };
      }
    | {
          type: "EXPORT_DTCG";
          payload: {
              exportAll: boolean;
              collection?: string;
              mode?: string;
              styleDictionary?: boolean;
              flatTokens?: boolean;
          };
      }
    | { type: "EXPORT_TYPOGRAPHY" }
    | { type: "SAVE_LAST"; payload: { collection: string; mode: string } }
    | {
          type: "SAVE_PREFS";
          payload: {
              exportAll?: boolean;
              drawerOpen?: boolean;
              styleDictionary?: boolean;
              flatTokens?: boolean;
              allowHexStrings?: boolean;
              githubRememberToken?: boolean;
          };
      }
    | { type: "UI_RESIZE"; payload: { width: number; height: number } }
    | {
          type: "PREVIEW_REQUEST";
          payload: {
              collection: string;
              mode: string;
              styleDictionary?: boolean;
              flatTokens?: boolean;
          };
      }
    // GitHub integration (UI → plugin)
    | {
          type: "GITHUB_SET_TOKEN";
          payload: { token: string; remember: boolean };
      }
    | { type: "GITHUB_FORGET_TOKEN" }
    | { type: "GITHUB_SELECT_REPO"; payload: GithubRepoTarget }
    | { type: "GITHUB_SELECT_BRANCH"; payload: GithubBranchPayload }
    | { type: "GITHUB_SET_FOLDER"; payload: GithubFolderPayload }
    | {
          type: "GITHUB_FETCH_BRANCHES";
          payload: GithubRepoTarget & { page?: number; force?: boolean };
      }
    | {
          type: "GITHUB_CREATE_BRANCH";
          payload: GithubRepoTarget & { baseBranch: string; newBranch: string };
      }
    | {
          type: "GITHUB_FOLDER_LIST";
          payload: GithubRepoTarget & { branch: string; path: string };
      }
    | {
          type: "GITHUB_CREATE_FOLDER";
          payload: GithubRepoTarget & {
              branch: string;
              path?: string;
              folderPath?: string;
          };
      }
    | {
          type: "GITHUB_EXPORT_AND_COMMIT";
          payload: GithubRepoTarget & {
              branch: string; // target/base branch
              folder?: string;
              filename?: string;
              commitMessage: string;
              scope: GithubScope;
              collection?: string;
              mode?: string;
              styleDictionary?: boolean;
              flatTokens?: boolean;
              createPr?: boolean;
              prBase?: string;
              prTitle?: string;
              prBody?: string;
          };
      }
    | {
          type: "GITHUB_EXPORT_FILES";
          payload: {
              scope: GithubScope;
              collection?: string;
              mode?: string;
              styleDictionary?: boolean;
              flatTokens?: boolean;
          };
      }
    | {
          type: "GITHUB_FETCH_TOKENS";
          payload: GithubRepoTarget & {
              branch: string;
              path: string;
              allowHexStrings?: boolean;
              contexts?: string[];
          };
      }
    | {
          type: "GITHUB_SAVE_STATE";
          payload: Partial<{
              owner: string;
              repo: string;
              branch: string;
              folder: string;
              filename: string;
              commitMessage: string;
              scope: GithubScope;
              collection: string;
              mode: string;
              styleDictionary: boolean;
              flatTokens: boolean;
              createPr: boolean;
              prBase: string;
              prTitle: string;
              prBody: string;
          }>;
      };

// Plugin -> UI
export interface GithubBranchListEntry {
    name: string;
}

export type GithubFolderEntry =
    | { type: "file"; name: string; path?: string }
    | { type: "dir"; name: string; path?: string };

export type PluginToUi =
    | { type: "ERROR"; payload: { message: string } }
    | { type: "INFO"; payload: { message: string } }
    | {
          type: "IMPORT_SUMMARY";
          payload: {
              summary: ImportSummary;
              timestamp: number;
              source?: "local" | "github";
          };
      }
    | {
          type: "COLLECTIONS_DATA";
          payload: {
              collections: Array<{
                  id: string;
                  name: string;
                  modes: Array<{ id: string; name: string }>;
                  variables: Array<{ id: string; name: string; type: string }>;
              }>;
              last: { collection: string; mode: string } | null;
              exportAllPref: boolean;
              styleDictionaryPref?: boolean;
              flatTokensPref?: boolean;
              drawerOpenPref?: boolean;
              allowHexPref?: boolean;
              githubRememberPref?: boolean;
          };
      }
    | { type: "RAW_COLLECTIONS_TEXT"; payload: { text: string } }
    | {
          type: "EXPORT_RESULT";
          payload: { files: Array<{ name: string; json: unknown }> };
      }
    | { type: "W3C_PREVIEW"; payload: { name: string; json: unknown } }
    | {
          type: "GITHUB_AUTH_RESULT";
          payload: {
              ok: boolean;
              login?: string;
              name?: string;
              remember?: boolean;
              error?: string;
              tokenExpiration?: number | null;
              exp?: number | null;
          };
      }
    | {
          type: "GITHUB_REPOS";
          payload: {
              repos: Array<{
                  full_name: string;
                  default_branch?: string;
                  private?: boolean;
              }>;
          };
      }
    | {
          type: "GITHUB_RESTORE_SELECTED";
          payload: {
              owner?: string;
              repo?: string;
              branch?: string;
              folder?: string;
              filename?: string;
              commitMessage?: string;
              scope?: GithubScope;
              collection?: string;
              mode?: string;
              styleDictionary?: boolean;
              flatTokens?: boolean;
              createPr?: boolean;
              prBase?: string;
              prTitle?: string;
              prBody?: string;
          };
      }
    | {
          type: "GITHUB_BRANCHES";
          payload: {
              owner: string;
              repo: string;
              page: number;
              branches: GithubBranchListEntry[];
              defaultBranch?: string;
              hasMore: boolean;
              rate?: GhRateInfo;
          };
      }
    | {
          type: "GITHUB_BRANCHES_ERROR";
          payload: {
              owner: string;
              repo: string;
              status: number;
              message: string;
              samlRequired?: boolean;
              rate?: GhRateInfo;
          };
      }
    | {
          type: "GITHUB_CREATE_BRANCH_RESULT";
          payload:
              | {
                    ok: true;
                    owner: string;
                    repo: string;
                    baseBranch: string;
                    newBranch: string;
                    html_url: string;
                    rate?: GhRateInfo;
                }
              | {
                    ok: false;
                    owner: string;
                    repo: string;
                    baseBranch: string;
                    newBranch: string;
                    status: number;
                    message: string;
                    samlRequired?: boolean;
                    noPushPermission?: boolean;
                    rate?: GhRateInfo;
                };
      }
    | {
          type: "GITHUB_FOLDER_LIST_RESULT";
          payload:
              | {
                    ok: true;
                    owner: string;
                    repo: string;
                    branch: string;
                    path: string;
                    entries: GithubFolderEntry[];
                    rate?: GhRateInfo;
                }
              | {
                    ok: false;
                    owner: string;
                    repo: string;
                    branch: string;
                    path: string;
                    status: number;
                    message: string;
                    rate?: GhRateInfo;
                };
      }
    | {
          type: "GITHUB_CREATE_FOLDER_RESULT";
          payload:
              | {
                    ok: true;
                    owner: string;
                    repo: string;
                    branch: string;
                    folderPath: string;
                    rate?: GhRateInfo;
                }
              | {
                    ok: false;
                    owner: string;
                    repo: string;
                    branch: string;
                    folderPath: string;
                    status: number;
                    message: string;
                    rate?: GhRateInfo;
                };
      }
    | {
          type: "GITHUB_COMMIT_RESULT";
          payload:
              | {
                    ok: true;
                    owner: string;
                    repo: string;
                    branch: string;
                    folder?: string;
                    filename?: string;
                    fullPath?: string;
                    commitSha: string;
                    commitUrl: string;
                    treeUrl?: string;
                    rate?: GhRateInfo;
                    createdPr?: {
                        number: number;
                        url: string;
                        base: string;
                        head: string;
                    };
                }
              | {
                    ok: false;
                    owner: string;
                    repo: string;
                    branch: string;
                    status: number;
                    message: string;
                    rate?: GhRateInfo;
                    folder?: string;
                    filename?: string;
                    fullPath?: string;
                };
      }
    | {
          type: "GITHUB_PR_RESULT";
          payload:
              | {
                    ok: true;
                    owner: string;
                    repo: string;
                    number: number;
                    url: string;
                    head: string;
                    base: string;
                    rate?: GhRateInfo;
                }
              | {
                    ok: false;
                    owner: string;
                    repo: string;
                    head: string;
                    base: string;
                    status: number;
                    message: string;
                    rate?: GhRateInfo;
                };
      }
    | {
          type: "GITHUB_EXPORT_FILES_RESULT";
          payload: { files: Array<{ name: string; json: unknown }> };
      }
    | {
          type: "GITHUB_FETCH_TOKENS_RESULT";
          payload:
              | {
                    ok: true;
                    owner: string;
                    repo: string;
                    branch: string;
                    path: string;
                    json: unknown;
                }
              | {
                    ok: false;
                    owner: string;
                    repo: string;
                    branch: string;
                    path: string;
                    status: number;
                    message: string;
                };
      };

// These are imported from github/api.ts but referenced here for typing.
// Re-export minimal shape to avoid circular import.
export interface GhRateInfo {
    remaining?: number;
    resetEpochSec?: number;
}
