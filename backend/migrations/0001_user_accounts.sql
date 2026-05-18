-- ROwO Accounts: username + password user accounts that optionally bind to a wechat_id.
-- See plans/add-a-rowo-account-humming-anchor.md for design.

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
  password_changed_at TEXT
);

CREATE UNIQUE INDEX idx_user_accounts_wechat_id
  ON user_accounts(wechat_id) WHERE wechat_id IS NOT NULL;

CREATE INDEX idx_user_accounts_created_at
  ON user_accounts(created_at);

CREATE TABLE login_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_login_rate_limits_updated_at
  ON login_rate_limits(updated_at);
