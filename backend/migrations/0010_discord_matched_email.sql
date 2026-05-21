-- Cache the HMAC-hashed Discord-verified email alongside guild/role so the
-- /api/verify/discord/connect path can persist accounts.email and run the
-- cross-method email auto-connect check without re-fetching Discord identity.
ALTER TABLE discord_verified_identities ADD COLUMN matched_email_hash TEXT;
