-- Per-user ownership for OAuth clients so developers can self-manage their
-- apps from the developer panel (developers.rowo.link). Rows with NULL owner
-- remain maintainer-managed (originally created via direct D1 insert).

ALTER TABLE oauth_clients
  ADD COLUMN owner_user_id TEXT REFERENCES user_accounts(id);

CREATE INDEX idx_oauth_clients_owner
  ON oauth_clients(owner_user_id)
  WHERE owner_user_id IS NOT NULL;
