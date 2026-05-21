PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE accounts (
  wechat_id TEXT PRIMARY KEY,
  verified_status BOOLEAN DEFAULT 0,
  verification_method TEXT,
  verification_time DATETIME,
  student_id TEXT,
  student_name TEXT,
  email TEXT,
  discord_id TEXT,
  github_id TEXT,
  manual_status TEXT,
  manual_reason TEXT,
  manual_admin TEXT,
  manual_time DATETIME,
  reverified_at DATETIME
);
CREATE TABLE account_info (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wechat_id TEXT,
  color TEXT,
  icon TEXT,
  title TEXT,
  body TEXT,
  creator TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  visibility TEXT,
  FOREIGN KEY(wechat_id) REFERENCES accounts(wechat_id)
);
CREATE TABLE email_verification_codes (
  wechat_id TEXT NOT NULL,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at DATETIME NOT NULL,
  attempts INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (wechat_id, email)
);
CREATE TABLE email_send_rate_limits (
  minute_key TEXT PRIMARY KEY,
  send_count INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE discord_verified_identities (
  discord_id TEXT PRIMARY KEY,
  discord_name TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  matched_email_hash TEXT
);
CREATE TABLE github_verified_identities (
  github_id TEXT PRIMARY KEY,
  github_login TEXT NOT NULL,
  matched_email_domain TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  matched_email_hash TEXT
);
CREATE TABLE discord_trusted_servers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  invite_code TEXT,
  label TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(guild_id, role_id)
);
CREATE TABLE account_blacklist (
  wechat_id TEXT PRIMARY KEY,
  reason TEXT NOT NULL,
  added_by TEXT NOT NULL,
  added_at TEXT NOT NULL DEFAULT (datetime('now')),
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE adfs_verification_codes (
  code_hash TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  student_name TEXT,
  email TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT
);
CREATE TABLE stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  value INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE user_accounts (
  id TEXT PRIMARY KEY,
  username_normalized TEXT NOT NULL UNIQUE,
  username_display TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  wechat_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT,
  last_wechat_change_at TEXT,
  password_changed_at TEXT,
  role TEXT NOT NULL DEFAULT 'user'
    CHECK(role IN ('user','moderator','admin','super_admin')),
  role_assigned_by TEXT REFERENCES user_accounts(id),
  role_assigned_at TEXT,
  notification_email TEXT,
  manual_notification_enabled INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE login_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE oauth_clients (
  client_id TEXT PRIMARY KEY,
  client_secret_hmac TEXT NOT NULL,
  display_name TEXT NOT NULL,
  icon_url TEXT,
  allowed_domain TEXT NOT NULL,
  allowed_redirect_uris TEXT NOT NULL,
  allowed_scopes TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  owner_user_id TEXT REFERENCES user_accounts(id),
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
CREATE TABLE oauth_grants (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL REFERENCES oauth_clients(client_id),
  user_id TEXT NOT NULL REFERENCES user_accounts(id),
  scopes TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT,
  revoked_at TEXT
);
CREATE TABLE oauth_access_tokens (
  token_hash TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL REFERENCES oauth_grants(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE oauth_refresh_tokens (
  token_hash TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL REFERENCES oauth_grants(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT,
  replaced_by_hash TEXT
);
DELETE FROM sqlite_sequence;
CREATE INDEX idx_email_verification_expires_at
  ON email_verification_codes (expires_at);
CREATE INDEX idx_email_send_rate_limits_updated_at
  ON email_send_rate_limits (updated_at);
CREATE INDEX idx_accounts_discord_id
ON accounts(discord_id);
CREATE INDEX idx_accounts_github_id
ON accounts(github_id);
CREATE INDEX idx_account_blacklist_active
ON account_blacklist(is_active);
CREATE INDEX idx_discord_trusted_servers_active_guild
ON discord_trusted_servers(is_active, guild_id);
CREATE INDEX idx_discord_trusted_servers_invite_code
ON discord_trusted_servers(invite_code);
CREATE UNIQUE INDEX idx_user_accounts_wechat_id
  ON user_accounts(wechat_id) WHERE wechat_id IS NOT NULL;
CREATE INDEX idx_user_accounts_created_at
  ON user_accounts(created_at);
CREATE INDEX idx_login_rate_limits_updated_at
  ON login_rate_limits(updated_at);
CREATE INDEX idx_user_accounts_role_assigned_by
  ON user_accounts(role_assigned_by)
  WHERE role_assigned_by IS NOT NULL;
CREATE INDEX idx_oauth_codes_expires_at
  ON oauth_authorization_codes(expires_at);
CREATE INDEX idx_oauth_codes_user_id
  ON oauth_authorization_codes(user_id);
CREATE UNIQUE INDEX idx_oauth_grants_client_user
  ON oauth_grants(client_id, user_id);
CREATE INDEX idx_oauth_grants_user_active
  ON oauth_grants(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_oauth_access_tokens_grant_id
  ON oauth_access_tokens(grant_id);
CREATE INDEX idx_oauth_access_tokens_expires_at
  ON oauth_access_tokens(expires_at);
CREATE INDEX idx_oauth_refresh_tokens_grant_id
  ON oauth_refresh_tokens(grant_id);
CREATE INDEX idx_oauth_clients_owner
  ON oauth_clients(owner_user_id)
  WHERE owner_user_id IS NOT NULL;
CREATE TABLE user_totp_credentials (
  user_id TEXT PRIMARY KEY REFERENCES user_accounts(id) ON DELETE CASCADE,
  secret_ciphertext TEXT NOT NULL,
  digits INTEGER NOT NULL DEFAULT 6,
  period_seconds INTEGER NOT NULL DEFAULT 30,
  algorithm TEXT NOT NULL DEFAULT 'SHA1' CHECK(algorithm IN ('SHA1','SHA256')),
  last_used_counter INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  confirmed_at TEXT
);
CREATE TABLE user_passkey_credentials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  credential_id_b64url TEXT NOT NULL UNIQUE,
  public_key_b64url TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  transports TEXT,
  device_type TEXT,
  backed_up INTEGER NOT NULL DEFAULT 0,
  aaguid TEXT,
  nickname TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT
);
CREATE INDEX idx_user_passkey_user
  ON user_passkey_credentials(user_id);
CREATE TABLE user_recovery_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  batch_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  used_at TEXT
);
CREATE INDEX idx_user_recovery_user_unused
  ON user_recovery_codes(user_id) WHERE used_at IS NULL;
CREATE TABLE two_factor_attempts (
  bucket_key TEXT PRIMARY KEY,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_two_factor_attempts_updated_at
  ON two_factor_attempts(updated_at);
