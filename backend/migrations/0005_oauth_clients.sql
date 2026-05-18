-- "Sign in with ROwO" OAuth provider tables.
-- Confidential clients (client_id + client_secret) and short-lived authorization
-- codes for the auth-code grant. See plans/add-a-oauth-flow-noble-turtle.md.

CREATE TABLE oauth_clients (
  client_id TEXT PRIMARY KEY,
  client_secret_hmac TEXT NOT NULL,
  display_name TEXT NOT NULL,
  icon_url TEXT,
  allowed_domain TEXT NOT NULL,
  allowed_redirect_uris TEXT NOT NULL,
  allowed_scopes TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE oauth_authorization_codes (
  code_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id),
  user_id TEXT NOT NULL REFERENCES user_accounts(id),
  redirect_uri TEXT NOT NULL,
  granted_scopes TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_oauth_codes_expires_at
  ON oauth_authorization_codes(expires_at);

CREATE INDEX idx_oauth_codes_user_id
  ON oauth_authorization_codes(user_id);
