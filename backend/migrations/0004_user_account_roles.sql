-- Unify admin/moderator authority onto ROwO accounts.
-- Drops the separate `admins` table; ROwO session JWTs now carry permissions
-- via `user_accounts.role`. See plans/user-rowo-user-role-hazy-dijkstra.md.

ALTER TABLE user_accounts ADD COLUMN role TEXT NOT NULL DEFAULT 'user'
  CHECK(role IN ('user','moderator','admin','super_admin'));

ALTER TABLE user_accounts ADD COLUMN role_assigned_by TEXT
  REFERENCES user_accounts(id);

ALTER TABLE user_accounts ADD COLUMN role_assigned_at TEXT;

ALTER TABLE user_accounts ADD COLUMN notification_email TEXT;

ALTER TABLE user_accounts ADD COLUMN manual_notification_enabled INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_user_accounts_role_assigned_by
  ON user_accounts(role_assigned_by)
  WHERE role_assigned_by IS NOT NULL;

DROP TABLE IF EXISTS admins;
