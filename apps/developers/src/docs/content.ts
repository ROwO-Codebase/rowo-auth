export type DocSlug = 'overview' | 'oauth-flow' | 'api-reference';

const overview = `# Overview

ROwO provides identity for university communities — your app can let users sign in with their ROwO account and (optionally) read their verified WeChat ID without your app ever seeing their password.

## What you get

- **\`basic\`** — the user's stable ROwO ID and display name.
- **\`verification\`** — whether they have a verified WeChat ID, plus the verification method and time.
- **\`wechat\`** — the actual WeChat ID. Only request this if your app truly needs it.

Users must consent to each scope on the consent screen. The \`basic\` scope is required and always granted.

## How it works

ROwO implements a standard OAuth 2.0 **authorization-code** flow:

1. Your app redirects the user to \`https://rowo.link/oauth/authorize?...\`.
2. The user reviews the requested scopes and approves (or denies).
3. ROwO redirects back to your registered \`redirect_uri\` with a one-time \`code\`.
4. Your server exchanges that code (plus your \`client_secret\`) for the user's profile.

Read the [OAuth code flow](/docs/oauth-flow) doc for a step-by-step walkthrough, or jump to the [API reference](/docs/api-reference).

## Get started

1. [Register an OAuth client](/clients) and copy the \`client_id\` + \`client_secret\`.
2. Use the [Playground](/playground) to try the endpoints with your own credentials before wiring them into your app.
`;

const oauthFlow = `# OAuth code flow

This is the standard OAuth 2.0 authorization-code grant, adapted for ROwO.

## 1. Send the user to the authorize URL

Build a URL like this and redirect the user's browser:

\`\`\`
https://rowo.link/oauth/authorize
  ?client_id=YOUR_CLIENT_ID
  &redirect_uri=https://yourapp.example.com/oauth/callback
  &response_type=code
  &scope=basic verification
  &state=RANDOM_OPAQUE_STRING
\`\`\`

- \`redirect_uri\` **must exactly match** one of the URIs you registered for this client.
- \`scope\` is space-separated. \`basic\` is always implicit.
- \`state\` is round-tripped back to you — use it to defeat CSRF.

If the user is not signed in to ROwO yet, they'll be prompted to sign in first.

## 2. The user consents (or denies)

ROwO shows a consent screen listing your app's name, icon, and each scope. Required scopes (\`basic\`) cannot be unchecked; optional ones can.

- **On approve:** ROwO redirects the browser to
  \`<your redirect_uri>?code=<one_time_code>&state=<your_state>\`.
- **On deny:** ROwO redirects to
  \`<your redirect_uri>?error=access_denied&state=<your_state>\`.

The \`code\` is single-use and expires in 15 minutes.

## 3. Exchange the code for a user profile

From your **server** (never the browser — your \`client_secret\` must stay private), POST to the token endpoint:

\`\`\`
POST https://api.rowo.link/api/oauth/token
Content-Type: application/json

{
  "grant_type": "authorization_code",
  "client_id": "YOUR_CLIENT_ID",
  "client_secret": "YOUR_CLIENT_SECRET",
  "code": "<the code from step 2>",
  "redirect_uri": "<the same redirect_uri from step 1>"
}
\`\`\`

A successful response looks like:

\`\`\`json
{
  "success": true,
  "scope": "basic verification",
  "user": {
    "user_id": "rowo_abc123…",
    "username_display": "alice"
  },
  "verification": {
    "verified_status": true,
    "verification_method": "discord",
    "verification_time": "2026-01-15T08:42:00Z",
    "reverified_at": "2026-03-20T11:05:00Z"
  }
}
\`\`\`

If the user granted the \`wechat\` scope, the response also includes \`wechat: { wechat_id: "..." }\`.

If they granted \`verification\` or \`wechat\` but their account isn't linked to a WeChat ID, you'll see \`partial: true\` and those fields will be omitted.

## Errors to handle

| When | Response | Meaning |
|---|---|---|
| Wrong \`client_secret\` | \`401 { success: false, message: "Invalid client credentials." }\` | Rotate and redeploy your secret. |
| Code already used | \`400 { success: false, message: "Authorization code has already been used." }\` | Each code is single-use. |
| Code expired | \`400 { success: false, message: "Authorization code has expired." }\` | Restart the flow from step 1. |
| Wrong \`redirect_uri\` at token time | \`400 { success: false, message: "redirect_uri does not match the original authorize request." }\` | Must be byte-identical to the one used in step 1. |
`;

const apiReference = `# API reference

All endpoints live on \`https://api.rowo.link\`. JSON in, JSON out.

## Authentication

There are two kinds of authentication in this API:

- **Bearer JWT** (from \`Authorization: Bearer <token>\`) — used by the browser-facing endpoints called by ROwO's own sites. The dev panel uses this when you call \`/api/developers/*\`.
- **Client credentials** (\`client_id\` + \`client_secret\` in the body) — used by \`/api/oauth/token\` from your server.

The OAuth authorize flow itself does not give you an access token for arbitrary API calls — the token response *is* the user profile.

---

## POST /api/oauth/authorize/validate

Validate that an \`(client_id, redirect_uri, scope)\` tuple is acceptable before showing a consent screen. Used internally by the ROwO consent page.

Requires a user Bearer JWT.

**Request body:**
\`\`\`json
{
  "client_id": "abc...",
  "redirect_uri": "https://yourapp.example.com/cb",
  "response_type": "code",
  "scope": "basic verification"
}
\`\`\`

**Response:** \`200\` with client metadata and scope classification (valid / not_permitted / gated_locked / unknown).

---

## POST /api/oauth/authorize/grant

Exchange a user's consent for a one-time authorization code. Returns a \`redirect_url\` that the browser should be sent to (it embeds \`?code=...&state=...\`).

Requires a user Bearer JWT.

---

## POST /api/oauth/authorize/deny

Build a redirect URL with \`?error=access_denied\` for the user-denied case.

Requires a user Bearer JWT.

---

## POST /api/oauth/token

**This is the only OAuth endpoint your server calls directly.**

**Request body:**
\`\`\`json
{
  "grant_type": "authorization_code",
  "client_id": "abc...",
  "client_secret": "...",
  "code": "...",
  "redirect_uri": "https://yourapp.example.com/cb"
}
\`\`\`

**Response:** \`200\` with the user's profile (see [OAuth code flow](/docs/oauth-flow) for the shape). \`401\` if credentials are wrong; \`400\` if the code is invalid, used, or expired.

---

## GET /api/user/me

Returns the currently-signed-in user's profile. Requires a user Bearer JWT.

**Response:**
\`\`\`json
{
  "success": true,
  "user": {
    "id": "rowo_...",
    "username": "alice",
    "wechat_id": "alice_wx",
    "role": "user",
    "created_at": "2026-01-01T00:00:00Z",
    "last_login_at": "2026-05-19T07:12:00Z"
  },
  "verification": {
    "wechat_id": "alice_wx",
    "verified_status": true,
    "verification_method": "discord",
    "verification_time": "2026-01-15T08:42:00Z"
  }
}
\`\`\`

Note: this endpoint does **not** accept the OAuth-issued token from \`/api/oauth/token\`. That token response *is* the profile — there's no separate "user info" call for OAuth clients.

---

## Developer endpoints

These are scoped to your own ROwO account and only operate on clients you own.

| Method | Path | Purpose |
|---|---|---|
| \`GET\` | \`/api/developers/oauth-clients\` | List your clients (no secrets). |
| \`POST\` | \`/api/developers/oauth-clients\` | Create a new client. Response includes the one-time \`client_secret\`. |
| \`GET\` | \`/api/developers/oauth-clients/:id\` | Fetch one client. |
| \`PATCH\` | \`/api/developers/oauth-clients/:id\` | Update display name, icon, domain, redirect URIs, scopes, or active flag. |
| \`POST\` | \`/api/developers/oauth-clients/:id/rotate-secret\` | Mint a new \`client_secret\`; old one stops working immediately. |
| \`DELETE\` | \`/api/developers/oauth-clients/:id\` | Permanently delete the client. |

All require a user Bearer JWT. The same calls happen from the [Clients](/clients) UI in this panel.
`;

export const DOCS: Record<DocSlug, string> = {
  overview,
  'oauth-flow': oauthFlow,
  'api-reference': apiReference,
};
