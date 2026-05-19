import { authHeaders } from '@rowo/shared/session';

export interface OauthClient {
  client_id: string;
  display_name: string;
  icon_url: string | null;
  allowed_domain: string;
  allowed_redirect_uris: string[];
  allowed_scopes: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ListClientsResponse {
  success: boolean;
  clients?: OauthClient[];
  message?: string;
}

export interface SingleClientResponse {
  success: boolean;
  client?: OauthClient;
  message?: string;
}

export interface CreateClientResponse extends SingleClientResponse {
  client_secret?: string;
}

export interface RotateSecretResponse {
  success: boolean;
  client_secret?: string;
  message?: string;
}

export interface OauthClientInput {
  display_name: string;
  icon_url: string | null;
  allowed_domain: string;
  allowed_redirect_uris: string[];
  allowed_scopes: string[];
  is_active?: boolean;
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${__API_ENDPOINT__}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(init.headers || {}),
    },
  });
  let body: any = null;
  try { body = await res.json(); } catch { /* swallow */ }
  if (!body) {
    return { success: false, message: `Server returned ${res.status}` } as unknown as T;
  }
  return body as T;
}

export const developerApi = {
  list: () => apiFetch<ListClientsResponse>('/api/developers/oauth-clients'),
  get: (id: string) => apiFetch<SingleClientResponse>(`/api/developers/oauth-clients/${encodeURIComponent(id)}`),
  create: (input: OauthClientInput) =>
    apiFetch<CreateClientResponse>('/api/developers/oauth-clients', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  update: (id: string, input: Partial<OauthClientInput>) =>
    apiFetch<SingleClientResponse>(`/api/developers/oauth-clients/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  rotateSecret: (id: string) =>
    apiFetch<RotateSecretResponse>(`/api/developers/oauth-clients/${encodeURIComponent(id)}/rotate-secret`, {
      method: 'POST',
    }),
  remove: (id: string) =>
    apiFetch<{ success: boolean; message?: string }>(`/api/developers/oauth-clients/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
};
