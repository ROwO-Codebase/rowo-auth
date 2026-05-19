const STORAGE_KEY = 'rowo_user_token';
const listeners = new Set<() => void>();

export function getSessionToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setSessionToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(STORAGE_KEY, token);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  for (const l of listeners) l();
}

export function clearSession(): void {
  setSessionToken(null);
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export type RowoRole = 'user' | 'moderator' | 'admin' | 'super_admin';

export interface SessionUser {
  id: string;
  username: string;
  wechat_id: string | null;
  created_at: string;
  last_login_at: string | null;
  last_wechat_change_at: string | null;
  password_changed_at: string | null;
  role: RowoRole;
}

export const ROLE_RANK: Record<RowoRole, number> = {
  user: 0,
  moderator: 1,
  admin: 2,
  super_admin: 3,
};

export function hasMinRole(role: RowoRole | undefined | null, min: RowoRole): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export interface SessionVerification {
  wechat_id: string;
  verified_status?: boolean;
  verification_method?: string | null;
  verification_time?: string | null;
  manual_status?: string | null;
  reverified_at?: string | null;
  missing?: boolean;
}

export interface BlacklistInfo {
  wechat_id: string;
  reason: string;
  added_by: string;
  added_at: string;
}

export interface MeResponse {
  success: boolean;
  user: SessionUser | null;
  verification: SessionVerification | null;
  message?: string;
  blacklisted?: boolean;
  blacklist?: BlacklistInfo | null;
}

function base64UrlDecodeToString(input: string): string {
  let b64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4;
  if (pad) b64 += '===='.slice(0, 4 - pad);
  return atob(b64);
}

export function decodeJwtPayload<T = Record<string, unknown>>(token: string): T | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(base64UrlDecodeToString(parts[1])) as T;
  } catch {
    return null;
  }
}

export function authHeaders(): HeadersInit {
  const token = getSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchMe(): Promise<MeResponse | null> {
  const token = getSessionToken();
  if (!token) return null;
  try {
    const res = await fetch(`${__API_ENDPOINT__}/api/user/me`, {
      headers: { ...authHeaders() },
    });
    if (res.status === 401) {
      clearSession();
      return null;
    }
    return (await res.json()) as MeResponse;
  } catch {
    return null;
  }
}
