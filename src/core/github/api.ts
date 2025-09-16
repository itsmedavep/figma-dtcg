// src/core/github/api.ts

/* =========================
 * Common types & helpers
 * ========================= */

export interface GhUser {
    login: string;
    name?: string;
}

export type GhUserResult =
    | { ok: true; user: GhUser }
    | { ok: false; error: string };

function headerGet(h: any, key: string): string | null {
    try {
        if (h && typeof h.get === 'function') return h.get(key);
    } catch { /* noop */ }
    return null;
}

export interface GhRateInfo {
    remaining?: number;
    resetEpochSec?: number;
}

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

/** Base64 encode (Unicode safe) without using Node Buffer. */
function b64(s: string): string {
    try {
        // Convert to UTF-8 first so btoa can handle it.
        // unescape is fine here inside the sandbox and avoids a heavier polyfill.
        return btoa(unescape(encodeURIComponent(s)));
    } catch {
        // Last-ditch fallback: encode bytes manually for btoa.
        const enc = new TextEncoder();
        const bytes = enc.encode(s);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
    }
}

/** Encode a repo *path* but preserve `/` separators. */
function encodePathSegments(path: string): string {
    const norm = String(path || '').replace(/^\/+|\/+$/g, '');
    if (!norm) return '';
    return norm.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

/* =========================
 * Auth / Repos
 * ========================= */

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

async function fetchJsonWithRetry(url: string, init: any, tries = 2) {
    let last: any;
    for (let i = 0; i < tries; i++) {
        try { return await fetch(url, init); }
        catch (e) { last = e; await new Promise(r => setTimeout(r, 150)); }
    }
    throw last;
}

export async function ghListRepos(token: string): Promise<GhListReposResult> {
    try {
        const base =
            'https://api.github.com/user/repos' +
            '?per_page=100&affiliation=owner,collaborator,organization_member&sort=updated';

        const headers = {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
        };

        const all: GhRepo[] = [];
        let page = 1;

        while (true) {
            const res = await fetchJsonWithRetry(`${base}&page=${page}`, { headers }, 2);
            if (res.status === 401) return { ok: false, error: 'bad credentials' };
            if (!res.ok) {
                if (all.length) return { ok: true, repos: all };
                return { ok: false, error: (await res.text()) || `HTTP ${res.status}` };
            }

            const arr = await res.json();
            if (!Array.isArray(arr) || arr.length === 0) break;

            for (const r of arr) {
                if (r?.full_name) {
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

            if (arr.length < 100) break;
            page++;
        }

        return { ok: true, repos: all };
    } catch (e) {
        return { ok: false, error: (e as Error)?.message || 'network error' };
    }
}

/* =========================
 * Branches
 * ========================= */

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

/** List branches; when `force` add a ts param to bypass caches. */
export async function ghListBranches(
    token: string,
    owner: string,
    repo: string,
    page = 1,
    force = false
): Promise<GhListBranchesResult> {
    const baseRepoUrl = `https://api.github.com/repos/${owner}/${repo}`;
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    } as const;

    const ts = force ? `&_ts=${Date.now()}` : '';

    try {
        const branchesUrl = `${baseRepoUrl}/branches?per_page=100&page=${page}${ts}`;
        const res = await fetch(branchesUrl, { headers });

        const rate = parseRate((res as any)?.headers);
        const saml = headerGet((res as any)?.headers, 'x-github-saml');

        if (res.status === 403 && saml) {
            return {
                ok: false, owner, repo, status: 403,
                message: 'SAML/SSO required', samlRequired: true, rate
            };
        }

        if (!res.ok) {
            const text = await safeText(res);
            return { ok: false, owner, repo, status: res.status, message: text || `HTTP ${res.status}`, rate };
        }

        const arr = await res.json();
        const branches: Array<{ name: string }> = Array.isArray(arr)
            ? arr.filter(b => b && typeof b.name === 'string').map(b => ({ name: b.name }))
            : [];

        const link = headerGet((res as any)?.headers, 'link');
        let hasMore = false;
        if (link && /\brel="next"/i.test(link)) hasMore = true;
        else if (branches.length === 100) hasMore = true;

        let defaultBranch: string | undefined;
        if (page === 1) {
            try {
                const repoRes = await fetch(`${baseRepoUrl}${force ? `?_ts=${Date.now()}` : ''}`, { headers });
                if (repoRes.ok) {
                    const j = await repoRes.json();
                    if (j && typeof j.default_branch === 'string') defaultBranch = j.default_branch;
                }
            } catch { /* ignore */ }
        }

        return { ok: true, owner, repo, page, branches, defaultBranch, hasMore, rate };
    } catch (e) {
        return { ok: false, owner, repo, status: 0, message: (e as Error)?.message || 'network error' };
    }
}

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

    const branchName = String(newBranch || '').trim().replace(/^refs\/heads\//, '');
    const baseName = String(baseBranch || '').trim().replace(/^refs\/heads\//, '');
    if (!branchName || !baseName) {
        return { ok: false, owner, repo, baseBranch: baseName, newBranch: branchName, status: 400, message: 'empty branch name(s)' };
    }

    try {
        // Preflight: push permission & SAML hints
        try {
            const repoRes = await fetch(baseRepoUrl, { headers });
            const rate0 = parseRate((repoRes as any)?.headers);
            const saml0 = headerGet((repoRes as any)?.headers, 'x-github-saml');
            if (repoRes.status === 403 && saml0) {
                return { ok: false, owner, repo, baseBranch: baseName, newBranch: branchName, status: 403, message: 'SAML/SSO required', samlRequired: true, rate: rate0 };
            }
            if (!repoRes.ok) {
                const text = await safeText(repoRes);
                return { ok: false, owner, repo, baseBranch: baseName, newBranch: branchName, status: repoRes.status, message: text || `HTTP ${repoRes.status}` };
            }
            const repoJson = await repoRes.json();
            const pushAllowed = !!(repoJson?.permissions?.push);
            if (repoJson?.permissions && pushAllowed !== true) {
                return { ok: false, owner, repo, baseBranch: baseName, newBranch: branchName, status: 403, message: 'Token/user lacks push permission to this repository', noPushPermission: true, rate: rate0 };
            }
        } catch { /* ignore */ }

        // Resolve base → SHA
        const refUrl = `${baseRepoUrl}/git/ref/heads/${encodeURIComponent(baseName)}`;
        const refRes = await fetch(refUrl, { headers });
        const rate1 = parseRate((refRes as any)?.headers);
        const saml1 = headerGet((refRes as any)?.headers, 'x-github-saml');

        if (refRes.status === 403 && saml1) {
            return { ok: false, owner, repo, baseBranch: baseName, newBranch: branchName, status: 403, message: 'SAML/SSO required', samlRequired: true, rate: rate1 };
        }
        if (!refRes.ok) {
            const text = await safeText(refRes);
            return { ok: false, owner, repo, baseBranch: baseName, newBranch: branchName, status: refRes.status, message: text || `HTTP ${refRes.status}`, rate: rate1 };
        }

        const refJson = await refRes.json();
        const sha = (refJson?.object?.sha || refJson?.sha || '').trim();
        if (!sha) {
            return { ok: false, owner, repo, baseBranch: baseName, newBranch: branchName, status: 500, message: 'could not resolve base SHA' };
        }

        // Create ref
        const createUrl = `${baseRepoUrl}/git/refs`;
        const body = JSON.stringify({ ref: `refs/heads/${branchName}`, sha });
        const createRes = await fetch(createUrl, { method: 'POST', headers, body });
        const rate2 = parseRate((createRes as any)?.headers);
        const saml2 = headerGet((createRes as any)?.headers, 'x-github-saml');

        if (createRes.status === 403 && saml2) {
            return { ok: false, owner, repo, baseBranch: baseName, newBranch: branchName, status: 403, message: 'SAML/SSO required', samlRequired: true, rate: rate2 };
        }
        if (!createRes.ok) {
            const text = await safeText(createRes);
            return { ok: false, owner, repo, baseBranch: baseName, newBranch: branchName, status: createRes.status, message: text || `HTTP ${createRes.status}`, rate: rate2 };
        }

        const html_url = `https://github.com/${owner}/${repo}/tree/${encodeURIComponent(branchName)}`;
        return { ok: true, owner, repo, baseBranch: baseName, newBranch: branchName, sha, html_url, rate: rate2 };
    } catch (e) {
        return { ok: false, owner, repo, baseBranch: baseName, newBranch: branchName, status: 0, message: (e as Error)?.message || 'network error' };
    }
}

/* =========================
 * Contents API: list & ensure folder
 * ========================= */

export type GhDirEntry = {
    type: 'dir' | 'file';
    name: string;
    path: string;
};

export type GhListDirResult =
    | {
        ok: true;
        owner: string;
        repo: string;
        ref: string;
        path: string;
        entries: GhDirEntry[];
        rate?: GhRateInfo;
    }
    | {
        ok: false;
        owner: string;
        repo: string;
        ref: string;
        path: string;
        status: number;
        message: string;
        rate?: GhRateInfo;
    };

/** GET /repos/{owner}/{repo}/contents/{path}?ref={ref} */
export async function ghListDir(
    token: string,
    owner: string,
    repo: string,
    path: string,
    ref: string
): Promise<GhListDirResult> {
    const baseRepoUrl = `https://api.github.com/repos/${owner}/${repo}`;
    const rel = encodePathSegments(path);
    const url = rel
        ? `${baseRepoUrl}/contents/${rel}?ref=${encodeURIComponent(ref)}&_ts=${Date.now()}`
        : `${baseRepoUrl}/contents?ref=${encodeURIComponent(ref)}&_ts=${Date.now()}`;
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    } as const;

    try {
        const res = await fetch(url, { headers });
        const rate = parseRate((res as any)?.headers);
        if (!res.ok) {
            const msg = await safeText(res);
            return {
                ok: false,
                owner, repo, ref, path: String(path || '').replace(/^\/+|\/+$/g, ''),
                status: res.status,
                message: msg || `HTTP ${res.status}`,
                rate
            };
        }
        const json = await res.json();
        const arr = Array.isArray(json) ? json : [];
        const entries: GhDirEntry[] = arr.map((it: any) => ({
            type: it?.type === 'dir' ? 'dir' : 'file',
            name: String(it?.name || ''),
            path: String(it?.path || '')
        }));
        return {
            ok: true,
            owner, repo, ref,
            path: String(path || '').replace(/^\/+|\/+$/g, ''),
            entries,
            rate
        };
    } catch (e) {
        return {
            ok: false,
            owner, repo, ref,
            path: String(path || '').replace(/^\/+|\/+$/g, ''),
            status: 0,
            message: (e as Error)?.message || 'network error'
        };
    }
}

/** Wrapper that returns ONLY directories (keeps a legacy `dirs` array). */
export type GhListDirsResult =
    | {
        ok: true;
        owner: string;
        repo: string;
        branch: string;
        path: string;
        entries: GhDirEntry[]; // dirs only
        dirs: Array<{ name: string; path: string }>;
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
        samlRequired?: boolean;
        rate?: GhRateInfo;
    };

export async function ghListDirs(
    token: string,
    owner: string,
    repo: string,
    branch: string,
    path = ''
): Promise<GhListDirsResult> {
    const res = await ghListDir(token, owner, repo, path, branch);
    if (!res.ok) {
        return {
            ok: false,
            owner, repo, branch,
            path: res.path,
            status: res.status,
            message: res.message,
            samlRequired: /SAML|SSO/i.test(res.message || '') || res.status === 403
        };
    }
    const onlyDirs = res.entries.filter(e => e.type === 'dir');
    return {
        ok: true,
        owner, repo, branch,
        path: res.path,
        entries: onlyDirs,
        dirs: onlyDirs.map(d => ({ name: d.name, path: d.path })),
        rate: res.rate
    };
}

/* ---------- Ensure folder (materialize if empty) ---------- */

export type GhEnsureFolderResult =
    | {
        ok: true;
        owner: string;
        repo: string;
        branch: string;
        folderPath: string; // normalized
        created: boolean;   // true if a placeholder commit was needed
        fileSha?: string;
        html_url?: string;
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
        samlRequired?: boolean;
        noPushPermission?: boolean;
        rate?: GhRateInfo;
    };

export async function ghEnsureFolder(
    token: string,
    owner: string,
    repo: string,
    branch: string,
    folderPath: string
): Promise<GhEnsureFolderResult> {
    const baseRepoUrl = `https://api.github.com/repos/${owner}/${repo}`;
    const headers = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    } as const;

    const norm = String(folderPath || '').replace(/^\/+|\/+$/g, '');
    if (!norm) {
        return { ok: false, owner, repo, branch, folderPath: norm, status: 400, message: 'empty folder path' };
    }

    try {
        // Exists already?
        {
            const rel = encodePathSegments(norm);
            const url = `${baseRepoUrl}/contents/${rel}?ref=${encodeURIComponent(branch)}&_ts=${Date.now()}`;
            const res = await fetch(url, { headers });
            const rate = parseRate((res as any)?.headers);
            const saml = headerGet((res as any)?.headers, 'x-github-saml');

            if (res.status === 403 && saml) {
                return { ok: false, owner, repo, branch, folderPath: norm, status: 403, message: 'SAML/SSO required', samlRequired: true, rate };
            }

            if (res.ok) {
                return {
                    ok: true,
                    owner, repo, branch,
                    folderPath: norm,
                    created: false,
                    html_url: `https://github.com/${owner}/${repo}/tree/${encodeURIComponent(branch)}/${encodePathSegments(norm)}`,
                    rate
                };
            }
            if (res.status !== 404) {
                const text = await safeText(res);
                return { ok: false, owner, repo, branch, folderPath: norm, status: res.status, message: text || `HTTP ${res.status}`, rate };
            }
        }

        // Materialize with .gitkeep
        const placeholderRel = `${norm}/.gitkeep`;
        const putUrl = `${baseRepoUrl}/contents/${encodePathSegments(placeholderRel)}`;
        const body = JSON.stringify({
            message: `chore: create folder ${norm}`,
            content: b64('.'),
            branch
        });

        const putRes = await fetch(putUrl, { method: 'PUT', headers, body });
        const rate2 = parseRate((putRes as any)?.headers);
        const saml2 = headerGet((putRes as any)?.headers, 'x-github-saml');

        if (putRes.status === 403 && saml2) {
            return { ok: false, owner, repo, branch, folderPath: norm, status: 403, message: 'SAML/SSO required', samlRequired: true, rate: rate2 };
        }
        if (!putRes.ok) {
            const text = await safeText(putRes);
            return { ok: false, owner, repo, branch, folderPath: norm, status: putRes.status, message: text || `HTTP ${putRes.status}`, rate: rate2 };
        }

        const j = await putRes.json();
        const fileSha = j?.content?.sha || j?.commit?.sha || '';

        return {
            ok: true,
            owner, repo, branch,
            folderPath: norm,
            created: true,
            fileSha,
            html_url: `https://github.com/${owner}/${repo}/tree/${encodeURIComponent(branch)}/${encodePathSegments(norm)}`,
            rate: rate2
        };
    } catch (e) {
        return { ok: false, owner, repo, branch, folderPath: norm, status: 0, message: (e as Error)?.message || 'network error' };
    }
}

// ---------- Single-commit file writer (Git Data API) ----------

export type GhCommitFile = {
    path: string;      // e.g., "tokens/My File.json" (may include subfolders)
    content: string;   // file contents as UTF-8 text (we use blobs with encoding: 'utf-8')
    mode?: '100644';   // normal file; left optional
};

export type GhCommitFilesResult =
    | {
        ok: true;
        owner: string;
        repo: string;
        branch: string;
        commitSha: string;
        commitUrl: string;         // https://github.com/{owner}/{repo}/commit/{sha}
        treeUrl?: string;
        rate?: GhRateInfo;
    }
    | {
        ok: false;
        owner: string;
        repo: string;
        branch: string;
        status: number;
        message: string;
        rate?: GhRateInfo;
    };

/**
 * Writes one or more files to a repo as a single commit on a branch.
 * Uses Git Data API: blobs → tree → commit → update ref.
 * No extra commits to "create folders"; tree paths handle that.
 */
export async function ghCommitFiles(
    token: string,
    owner: string,
    repo: string,
    branch: string,
    message: string,
    files: GhCommitFile[]
): Promise<GhCommitFilesResult> {
    const base = `https://api.github.com/repos/${owner}/${repo}`;
    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28'
    } as const;

    function normPath(p: string): string {
        return String(p || '')
            .replace(/^\/*/, '')    // trim leading /
            .replace(/\/*$/, '');   // trim trailing /
    }

    const cleaned: GhCommitFile[] = files.map(f => ({
        path: normPath(f.path),
        content: f.content,
        mode: f.mode || '100644'
    })).filter(f => f.path && typeof f.content === 'string');

    if (cleaned.length === 0) {
        return { ok: false, owner, repo, branch, status: 400, message: 'no files to commit' };
    }

    try {
        // 1) Resolve branch → commit SHA
        const refRes = await fetch(`${base}/git/ref/heads/${encodeURIComponent(branch)}`, { headers });
        const rate1 = parseRate((refRes as any)?.headers);
        if (!refRes.ok) {
            const text = await safeText(refRes);
            return { ok: false, owner, repo, branch, status: refRes.status, message: text || `HTTP ${refRes.status}`, rate: rate1 };
        }
        const refJson = await refRes.json();
        const baseCommitSha: string = (refJson?.object?.sha || refJson?.sha || '').trim();
        if (!baseCommitSha) {
            return { ok: false, owner, repo, branch, status: 500, message: 'could not resolve branch commit sha', rate: rate1 };
        }

        // 2) Resolve base commit → tree SHA
        const commitRes = await fetch(`${base}/git/commits/${baseCommitSha}`, { headers });
        const rate2 = parseRate((commitRes as any)?.headers);
        if (!commitRes.ok) {
            const text = await safeText(commitRes);
            return { ok: false, owner, repo, branch, status: commitRes.status, message: text || `HTTP ${commitRes.status}`, rate: rate2 };
        }
        const commitJson = await commitRes.json();
        const baseTreeSha: string = (commitJson?.tree?.sha || '').trim();
        if (!baseTreeSha) {
            return { ok: false, owner, repo, branch, status: 500, message: 'could not resolve base tree sha', rate: rate2 };
        }

        // 3) Create blobs for each file
        const blobShas: string[] = [];
        for (let i = 0; i < cleaned.length; i++) {
            const blobRes = await fetch(`${base}/git/blobs`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ content: cleaned[i].content, encoding: 'utf-8' })
            });
            const rateB = parseRate((blobRes as any)?.headers);
            if (!blobRes.ok) {
                const text = await safeText(blobRes);
                return { ok: false, owner, repo, branch, status: blobRes.status, message: text || `HTTP ${blobRes.status}`, rate: rateB };
            }
            const blobJson = await blobRes.json();
            const blobSha: string = (blobJson?.sha || '').trim();
            if (!blobSha) {
                return { ok: false, owner, repo, branch, status: 500, message: 'failed to create blob sha' };
            }
            blobShas.push(blobSha);
        }

        // 4) Create a new tree using those blobs at the desired paths
        const treeEntries = cleaned.map((f, idx) => ({
            path: f.path, type: 'blob', mode: f.mode!, sha: blobShas[idx]
        }));
        const treeRes = await fetch(`${base}/git/trees`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries })
        });
        const rate3 = parseRate((treeRes as any)?.headers);
        if (!treeRes.ok) {
            const text = await safeText(treeRes);
            return { ok: false, owner, repo, branch, status: treeRes.status, message: text || `HTTP ${treeRes.status}`, rate: rate3 };
        }
        const treeJson = await treeRes.json();
        const newTreeSha: string = (treeJson?.sha || '').trim();
        if (!newTreeSha) {
            return { ok: false, owner, repo, branch, status: 500, message: 'failed to create tree sha' };
        }

        // 5) Create a commit with that tree and parent = current branch commit
        const commitCreateRes = await fetch(`${base}/git/commits`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ message, tree: newTreeSha, parents: [baseCommitSha] })
        });
        const rate4 = parseRate((commitCreateRes as any)?.headers);
        if (!commitCreateRes.ok) {
            const text = await safeText(commitCreateRes);
            return { ok: false, owner, repo, branch, status: commitCreateRes.status, message: text || `HTTP ${commitCreateRes.status}`, rate: rate4 };
        }
        const newCommit = await commitCreateRes.json();
        const newCommitSha: string = (newCommit?.sha || '').trim();
        if (!newCommitSha) {
            return { ok: false, owner, repo, branch, status: 500, message: 'failed to create commit sha' };
        }

        // 6) Fast-forward the branch to the new commit
        const updateRefRes = await fetch(`${base}/git/refs/heads/${encodeURIComponent(branch)}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ sha: newCommitSha, force: false })
        });
        const rate5 = parseRate((updateRefRes as any)?.headers);
        if (!updateRefRes.ok) {
            const text = await safeText(updateRefRes);
            return { ok: false, owner, repo, branch, status: updateRefRes.status, message: text || `HTTP ${updateRefRes.status}`, rate: rate5 };
        }

        return {
            ok: true,
            owner, repo, branch,
            commitSha: newCommitSha,
            commitUrl: `https://github.com/${owner}/${repo}/commit/${newCommitSha}`,
            treeUrl: `https://github.com/${owner}/${repo}/tree/${encodeURIComponent(branch)}`,
            rate: rate5
        };
    } catch (e) {
        return { ok: false, owner, repo, branch, status: 0, message: (e as Error)?.message || 'network error' };
    }
}
