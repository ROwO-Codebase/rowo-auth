-- OAuth access + refresh token model. Authorization codes still mint user-facing
-- access. Each (client, user) authorization is recorded as a long-lived
-- oauth_grants row; access and refresh tokens reference it. Revoking the grant
-- cascades (tokens are deleted) so the next /token or /userinfo call fails.
-- See plans/add-a-oauth-flow-noble-turtle.md (refresh-token addendum).

CREATE TABLE oauth_grants (
  id TEXT PRIMARY KEY,                       -- random hex; not user-facing
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id),
  user_id TEXT NOT NULL REFERENCES user_accounts(id),
  scopes TEXT NOT NULL,                      -- JSON array
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE UNIQUE INDEX idx_oauth_grants_client_user
  ON oauth_grants(client_id, user_id);

CREATE INDEX idx_oauth_grants_user_active
  ON oauth_grants(user_id) WHERE revoked_at IS NULL;

CREATE TABLE oauth_access_tokens (
  token_hash TEXT PRIMARY KEY,               -- sha256Hex(token)
  grant_id TEXT NOT NULL REFERENCES oauth_grants(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_oauth_access_tokens_grant_id
  ON oauth_access_tokens(grant_id);

CREATE INDEX idx_oauth_access_tokens_expires_at
  ON oauth_access_tokens(expires_at);

CREATE TABLE oauth_refresh_tokens (
  token_hash TEXT PRIMARY KEY,               -- sha256Hex(token)
  grant_id TEXT NOT NULL REFERENCES oauth_grants(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT,                           -- set on rotation OR grant revoke
  replaced_by_hash TEXT                      -- audit chain when rotated
);

CREATE INDEX idx_oauth_refresh_tokens_grant_id
  ON oauth_refresh_tokens(grant_id);
