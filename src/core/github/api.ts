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

            if (arr.length < 100) break; // last page
            page++;
        }

        return { ok: true, repos: all };
    } catch (e) {
        return { ok: false, error: (e as Error)?.message || 'network error' };
    }
}
