-- Two-Factor Authentication: TOTP, WebAuthn passkeys, recovery codes.
-- TOTP secrets are AES-GCM encrypted with env.TWO_FACTOR_ENC_KEY (server must
-- decrypt to compute rolling codes). Recovery codes are PBKDF2-SHA256 hashed
-- (same v1: format as user_accounts.password_hash). Passkey public keys are
-- base64url COSE blobs returned by @simplewebauthn/server.

CREATE TABLE user_totp_credentials (
  user_id TEXT PRIMARY KEY REFERENCES user_accounts(id) ON DELETE CASCADE,
  -- "v1:aesgcm:<iv_b64>:<ciphertext_b64>". Plaintext = 20-byte TOTP secret.
  secret_ciphertext TEXT NOT NULL,
  digits INTEGER NOT NULL DEFAULT 6,
  period_seconds INTEGER NOT NULL DEFAULT 30,
  algorithm TEXT NOT NULL DEFAULT 'SHA1' CHECK(algorithm IN ('SHA1','SHA256')),
  -- Highest time-step counter we've accepted; rejects replay within drift window.
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

-- Separate from login_rate_limits so 2FA failures don't lock out fresh
-- password sign-ins for other users sharing the IP.
CREATE TABLE two_factor_attempts (
  bucket_key TEXT PRIMARY KEY,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_two_factor_attempts_updated_at
  ON two_factor_attempts(updated_at);
