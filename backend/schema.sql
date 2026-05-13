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
  reverified_at DATETIME, 
  last_rename_at DATETIME
);
CREATE TABLE admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE,
  access_token TEXT UNIQUE,
  role TEXT DEFAULT 'admin',
  notification_email TEXT,
  manual_notification_enabled INTEGER NOT NULL DEFAULT 0
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
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE github_verified_identities (
  github_id TEXT PRIMARY KEY,
  github_login TEXT NOT NULL,
  matched_email_domain TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
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
CREATE TABLE rename_tokens (
  token_hash TEXT PRIMARY KEY,
  wechat_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT
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
