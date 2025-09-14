// src/core/github/api.ts

export type GhUser = {
    login: string;
    name?: string;
    avatar_url?: string;
};

/** Base64 helpers – browser safe (no Node Buffer). */
export function encodeToken(token: string): string {
    // PATs are ASCII, so btoa/atob are safe.
    return btoa(token);
}
export function decodeToken(b64: string): string {
    return atob(b64);
}

/** GET /user — verify a PAT and return minimal identity */
export async function ghGetUser(token: string): Promise<
    | { ok: true; user: GhUser; exp?: string }
    | { ok: false; error: string; status?: number }
> {
    try {
        const res = await fetch('https://api.github.com/user', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });

        if (res.status === 401) return { ok: false, error: 'bad credentials', status: 401 };
        if (!res.ok) return { ok: false, error: `HTTP ${res.status}`, status: res.status };

        const data = await res.json();
        const user: GhUser = {
            login: typeof data?.login === 'string' ? data.login : '',
            name: typeof data?.name === 'string' ? data.name : undefined,
            avatar_url: typeof data?.avatar_url === 'string' ? data.avatar_url : undefined
        };
        if (!user.login) return { ok: false, error: 'response missing login' };

        return { ok: true, user };
    } catch (e) {
        const msg = (e && (e as Error).message) ? (e as Error).message : 'network error';
        return { ok: false, error: msg };
    }
}
