export interface GhUser {
    login: string;
    name?: string;
}

export type GhUserResult =
    | { ok: true; user: GhUser }
    | { ok: false; error: string };

export async function ghGetUser(token: string): Promise<GhUserResult> {
    try {
        const res = await fetch('https://api.github.com/user', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });
        if (res.status === 401) return { ok: false, error: 'bad credentials' };
        if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };

        const data = await res.json();
        const login = typeof data?.login === 'string' ? data.login : '';
        const name = typeof data?.name === 'string' ? data.name : undefined;
        if (!login) return { ok: false, error: 'response missing login' };
        return { ok: true, user: { login, name } };
    } catch (e) {
        return { ok: false, error: (e as Error)?.message || 'network error' };
    }
}

/* ---------- List repos (owned + member), pagination via ?page= ---------- */
export interface GhRepo {
    id: number;
    name: string;
    full_name: string;       // "owner/repo"
    private: boolean;
    default_branch: string;  // e.g., "main"
    owner?: { login?: string };
    permissions?: { admin?: boolean; push?: boolean; pull?: boolean };
    fork?: boolean;
}

export type GhListReposResult =
    | { ok: true; repos: GhRepo[] }
    | { ok: false; error: string };

export async function ghListRepos(token: string): Promise<GhListReposResult> {
    try {
        const base =
            'https://api.github.com/user/repos' +
            '?per_page=100&affiliation=owner,collaborator,organization_member&sort=updated';

        const all: GhRepo[] = [];
        let page = 1;

        while (true) {
            const res = await fetch(`${base}&page=${page}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            });
            if (res.status === 401) return { ok: false, error: 'bad credentials' };
            if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };

            const arr = await res.json();
            if (!Array.isArray(arr) || arr.length === 0) break;

            for (const r of arr) {
                if (r && typeof r.full_name === 'string') {
                    all.push({
                        id: r.id,
                        name: r.name,
                        full_name: r.full_name,
                        private: !!r.private,
                        default_branch: r.default_branch || 'main',
                        owner: r.owner,
                        permissions: r.permissions,
                        fork: r.fork
                    });
                }
            }

            if (arr.length < 100) break; // last page (or we’d need Link-header pagination)
            page++;
        }

        return { ok: true, repos: all };
    } catch (e) {
        return { ok: false, error: (e as Error)?.message || 'network error' };
    }
}

/* ---------- Branches (safe headers; SAML + rate limit hints) ---------- */

export interface GhRateInfo {
    remaining?: number;
    resetEpochSec?: number;
}

export type GhListBranchesResult =
    | {
        ok: true;
        owner: string;
        repo: string;
        page: number;
        branches: Array<{ name: string }>;
        defaultBranch?: string;
        hasMore: boolean;
        rate?: GhRateInfo;
    }
    | {
        ok: false;
        owner: string;
        repo: string;
        status: number;
        message: string;
        samlRequired?: boolean;
        rate?: GhRateInfo;
    };

function headerGet(h: any, key: string): string | null {
    try {
        if (h && typeof h.get === 'function') return h.get(key);
    } catch { /* noop */ }
    return null;
}

/* ---------- Create branch (POST /git/refs) ---------- */

export type GhCreateBranchResult =
    | {
        ok: true;
        owner: string;
        repo: string;
        baseBranch: string;
        newBranch: string;
        sha: string;
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

function parseRate(h: any): GhRateInfo | undefined {
    const remainingStr = headerGet(h, 'x-ratelimit-remaining');
    const resetStr = headerGet(h, 'x-ratelimit-reset');
    const rate: GhRateInfo = {};
    const rem = remainingStr ? parseInt(remainingStr, 10) : NaN;
    const rst = resetStr ? parseInt(resetStr, 10) : NaN;
    if (Number.isFinite(rem)) rate.remaining = rem;
    if (Number.isFinite(rst)) rate.resetEpochSec = rst;
    return (rate.remaining !== undefined || rate.resetEpochSec !== undefined) ? rate : undefined;
}

async function safeText(res: any): Promise<string> {
    try { return await res.text(); } catch { return ''; }
}

export async function ghListBranches(
    token: string,
    owner: string,
    repo: string,
    page = 1
): Promise<GhListBranchesResult> {
    const baseRepoUrl = `https://api.github.com/repos/${owner}/${repo}`;
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    } as const;

    try {
        // 1) Fetch one page of branches
        const branchesUrl = `${baseRepoUrl}/branches?per_page=100&page=${page}`;
        const res = await fetch(branchesUrl, { headers });

        const rate = parseRate((res as any)?.headers);
        const saml = headerGet((res as any)?.headers, 'x-github-saml');

        if (res.status === 403 && saml) {
            return {
                ok: false,
                owner, repo,
                status: 403,
                message: 'SAML/SSO required',
                samlRequired: true,
                rate
            };
        }

        if (!res.ok) {
            const text = await safeText(res);
            return {
                ok: false,
                owner, repo,
                status: res.status,
                message: text || `HTTP ${res.status}`,
                rate
            };
        }

        const arr = await res.json();
        const branches: Array<{ name: string }> = Array.isArray(arr)
            ? arr.filter(b => b && typeof b.name === 'string').map(b => ({ name: b.name }))
            : [];

        // hasMore: prefer Link: rel="next", fallback to length heuristic
        const link = headerGet((res as any)?.headers, 'link');
        let hasMore = false;
        if (link && /\brel="next"/i.test(link)) hasMore = true;
        else if (branches.length === 100) hasMore = true;

        // 2) Default branch (only on first page, best effort)
        let defaultBranch: string | undefined = undefined;
        if (page === 1) {
            try {
                const repoRes = await fetch(baseRepoUrl, { headers });
                if (repoRes.ok) {
                    const j = await repoRes.json();
                    if (j && typeof j.default_branch === 'string') defaultBranch = j.default_branch;
                }
            } catch { /* ignore; keep undefined */ }
        }

        return {
            ok: true,
            owner, repo, page,
            branches,
            defaultBranch,
            hasMore,
            rate
        };
    } catch (e) {
        // Network fault or fetch threw → no headers available
        return {
            ok: false,
            owner, repo,
            status: 0,
            message: (e as Error)?.message || 'network error'
        };
    }
}

export async function ghCreateBranch(
    token: string,
    owner: string,
    repo: string,
    newBranch: string,
    baseBranch: string
): Promise<GhCreateBranchResult> {
    const baseRepoUrl = `https://api.github.com/repos/${owner}/${repo}`;
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    } as const;

    // Normalize inputs
    const branchName = String(newBranch || '').trim().replace(/^refs\/heads\//, '');
    const baseName = String(baseBranch || '').trim().replace(/^refs\/heads\//, '');
    if (!branchName || !baseName) {
        return {
            ok: false,
            owner, repo,
            baseBranch: baseName,
            newBranch: branchName,
            status: 400,
            message: 'empty branch name(s)'
        };
    }

    try {
        // 0) Preflight: can we push?
        try {
            const repoRes = await fetch(baseRepoUrl, { headers });
            const rate0 = parseRate((repoRes as any)?.headers);
            const saml0 = headerGet((repoRes as any)?.headers, 'x-github-saml');
            if (repoRes.status === 403 && saml0) {
                return {
                    ok: false,
                    owner, repo,
                    baseBranch: baseName,
                    newBranch: branchName,
                    status: 403,
                    message: 'SAML/SSO required',
                    samlRequired: true,
                    rate: rate0
                };
            }
            if (!repoRes.ok) {
                const text = await safeText(repoRes);
                // If we can’t read the repo, we surely can’t push.
                return {
                    ok: false,
                    owner, repo,
                    baseBranch: baseName,
                    newBranch: branchName,
                    status: repoRes.status,
                    message: text || `HTTP ${repoRes.status}`
                };
            }
            const repoJson = await repoRes.json();
            const pushAllowed = !!(repoJson?.permissions?.push);
            // For fine-grained tokens, GitHub *usually* still returns permissions; if not present, we proceed.
            if (repoJson?.permissions && pushAllowed !== true) {
                return {
                    ok: false,
                    owner, repo,
                    baseBranch: baseName,
                    newBranch: branchName,
                    status: 403,
                    message: 'Token/user lacks push permission to this repository',
                    noPushPermission: true,
                    rate: rate0
                };
            }
        } catch {
            // Ignore preflight failure; continue to try creating the branch (downstream errors will be clearer)
        }

        // 1) Resolve base branch → SHA
        const refUrl = `${baseRepoUrl}/git/ref/heads/${encodeURIComponent(baseName)}`;
        const refRes = await fetch(refUrl, { headers });
        const rate1 = parseRate((refRes as any)?.headers);
        const saml1 = headerGet((refRes as any)?.headers, 'x-github-saml');

        if (refRes.status === 403 && saml1) {
            return {
                ok: false,
                owner, repo,
                baseBranch: baseName,
                newBranch: branchName,
                status: 403,
                message: 'SAML/SSO required',
                samlRequired: true,
                rate: rate1
            };
        }
        if (!refRes.ok) {
            const text = await safeText(refRes);
            return {
                ok: false,
                owner, repo,
                baseBranch: baseName,
                newBranch: branchName,
                status: refRes.status,
                message: text || `HTTP ${refRes.status}`,
                rate: rate1
            };
        }

        const refJson = await refRes.json();
        const sha = (refJson?.object?.sha || refJson?.sha || '').trim();
        if (!sha) {
            return {
                ok: false,
                owner, repo,
                baseBranch: baseName,
                newBranch: branchName,
                status: 500,
                message: 'could not resolve base SHA'
            };
        }

        // 2) Create new ref
        const createUrl = `${baseRepoUrl}/git/refs`;
        const body = JSON.stringify({ ref: `refs/heads/${branchName}`, sha });
        const createRes = await fetch(createUrl, { method: 'POST', headers, body });
        const rate2 = parseRate((createRes as any)?.headers);
        const saml2 = headerGet((createRes as any)?.headers, 'x-github-saml');

        if (createRes.status === 403 && saml2) {
            return {
                ok: false,
                owner, repo,
                baseBranch: baseName,
                newBranch: branchName,
                status: 403,
                message: 'SAML/SSO required',
                samlRequired: true,
                rate: rate2
            };
        }
        if (!createRes.ok) {
            const text = await safeText(createRes);
            // 403 here without SAML usually indicates missing scopes/permissions on token
            return {
                ok: false,
                owner, repo,
                baseBranch: baseName,
                newBranch: branchName,
                status: createRes.status,
                message: text || `HTTP ${createRes.status}`,
                rate: rate2
            };
        }

        const html_url = `https://github.com/${owner}/${repo}/tree/${encodeURIComponent(branchName)}`;
        return {
            ok: true,
            owner, repo,
            baseBranch: baseName,
            newBranch: branchName,
            sha,
            html_url,
            rate: rate2
        };
    } catch (e) {
        return {
            ok: false,
            owner, repo,
            baseBranch: baseName,
            newBranch: branchName,
            status: 0,
            message: (e as Error)?.message || 'network error'
        };
    }
}

