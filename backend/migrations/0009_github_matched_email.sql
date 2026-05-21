-- Cache the HMAC-hashed GitHub-verified email alongside the matched domain so
-- /api/verify/github/connect can persist accounts.email without re-fetching
-- GitHub user emails (the OAuth access token is gone by then).
ALTER TABLE github_verified_identities ADD COLUMN matched_email_hash TEXT;
