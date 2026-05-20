export type DocSlug = 'overview' | 'oauth-flow' | 'api-reference';

const overview = `# Overview

ROwO provides identity for university communities — your app can let users sign in with their ROwO account and (optionally) read their verified WeChat ID without your app ever seeing their password.

## What you get

- **\`basic\`** — the user's stable ROwO ID and display name.
- **\`verification\`** — whether they have a verified WeChat ID, plus the verification method and time.
- **\`wechat\`** — the actual WeChat ID. Only request this if your app truly needs it.

Users must consent to each scope on the consent screen. The \`basic\` scope is required and always granted.

## How it works

ROwO implements a standard OAuth 2.0 **authorization-code** flow with **refresh tokens**:

1. Your app redirects the user to \`https://rowo.link/oauth/authorize?...\`.
2. The user reviews the requested scopes and approves (or denies).
3. ROwO redirects back to your registered \`redirect_uri\` with a one-time \`code\`.
4. Your server exchanges the code (plus your \`client_secret\`) at \`/oauth/token\` for an **access token** and a **refresh token**.
5. You call \`/oauth/userinfo\` with the access token whenever you need the user's profile.
6. When the access token expires (~1 hour), you swap the refresh token for a fresh pair — no user interaction.

Read the [OAuth code flow](/docs/oauth-flow) doc for a step-by-step walkthrough, or jump to the [API reference](/docs/api-reference).

## Get started

1. [Register an OAuth client](/clients) and copy the \`client_id\` + \`client_secret\`.
2. Use the [Playground](/playground) to try the endpoints with your own credentials before wiring them into your app.
`;

const oauthFlow = `# OAuth code flow

This is the standard OAuth 2.0 authorization-code grant with refresh tokens, adapted for ROwO.

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

## 3. Exchange the code for tokens

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

A successful response:

\`\`\`json
{
  "success": true,
  "access_token": "rao_…",
  "refresh_token": "rro_…",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_expires_in": 2592000,
  "scope": "basic verification"
}
\`\`\`

- \`access_token\` is short-lived (1 hour) and sent on every \`/userinfo\` call.
- \`refresh_token\` is long-lived (30 days) and stays on your server. Treat it like a password — never expose it to the browser.
- Both tokens are bound to a server-side **grant** record. If the user revokes your app from their Connected Apps page, both die immediately.

## 4. Fetch the user profile

Whenever you need the user's profile, call \`/userinfo\` with the access token in the \`Authorization\` header:

\`\`\`
GET https://api.rowo.link/api/oauth/userinfo
Authorization: Bearer rao_…
\`\`\`

Response:

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

If the user granted the \`wechat\` scope, the response also includes \`wechat: { wechat_id: "..." }\`. If they granted \`verification\`/\`wechat\` but their account isn't linked to a WeChat ID, the response includes \`partial: true\` and those fields are omitted.

You can call \`/userinfo\` as often as you like while the access token is valid.

## 5. Refresh when the access token expires

When \`/userinfo\` returns \`401 access_token_expired\`, swap your refresh token for a fresh pair:

\`\`\`
POST https://api.rowo.link/api/oauth/token
Content-Type: application/json

{
  "grant_type": "refresh_token",
  "client_id": "YOUR_CLIENT_ID",
  "client_secret": "YOUR_CLIENT_SECRET",
  "refresh_token": "rro_…"
}
\`\`\`

The response is the same shape as step 3:

\`\`\`json
{
  "success": true,
  "access_token": "rao_…NEW",
  "refresh_token": "rro_…NEW",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_expires_in": 2592000,
  "scope": "basic verification"
}
\`\`\`

> **Important:** refresh tokens are **rotated**. The old \`rro_\` is invalidated the moment a new one is issued. You must persist the new \`refresh_token\` (and \`access_token\`) and discard the old one. If you ever present an already-rotated refresh token, ROwO treats it as token theft and **revokes the entire grant** — your app is signed out and the user has to re-authorize.

## 6. Sign-out / revocation

There's no separate "logout" endpoint. Access stops when one of these happens:

- The user clicks Revoke on your app in their [Connected Apps](https://rowo.link/center) page. Both tokens become invalid on the next call.
- You stop using the tokens. They naturally expire (1 h / 30 d).
- You delete the OAuth client from the developer panel. All grants and tokens are wiped.

## Errors to handle

| When | Status / shape | Meaning |
|---|---|---|
| Wrong \`client_secret\` | \`401 { message: "Invalid client credentials." }\` | Rotate and redeploy your secret. |
| Code already used | \`400 { message: "Authorization code has already been used." }\` | Each code is single-use. |
| Code expired | \`400 { message: "Authorization code has expired." }\` | Restart the flow from step 1. |
| Wrong \`redirect_uri\` at token time | \`400 { message: "redirect_uri does not match the original authorize request." }\` | Must be byte-identical to step 1. |
| Access token expired | \`401 { message: "Access token has expired." }\` on \`/userinfo\` | Refresh per step 5. |
| Refresh token expired | \`401 { message: "Refresh token has expired." }\` | Send the user back through step 1. |
| Refresh token reused | \`401 { message: "Refresh token has already been used." }\` | Treated as theft — grant revoked. Send the user through step 1; warn them if the pattern recurs. |
| User revoked your app | \`401 { message: "Authorization has been revoked." }\` on \`/userinfo\` or refresh | The user pulled access. Send them through step 1 if they come back. |
`;

const apiReference = `# API reference

All endpoints live on \`https://api.rowo.link\`. JSON in, JSON out.

## Authentication

This API has three kinds of authentication:

- **ROwO session JWT** (\`Authorization: Bearer <jwt>\`) — issued when a user signs in to a ROwO frontend (the main site or the dev panel). Used for \`/api/user/*\` and \`/api/developers/*\`.
- **OAuth client credentials** (\`client_id\` + \`client_secret\` in the JSON body) — used by your server at \`/api/oauth/token\`.
- **OAuth access token** (\`Authorization: Bearer rao_…\`) — issued by \`/api/oauth/token\`, used at \`/api/oauth/userinfo\`. Tokens are opaque; do not parse them.

---

## POST /api/oauth/authorize/validate

Validate that a \`(client_id, redirect_uri, scope)\` tuple is acceptable before showing a consent screen. Used internally by the ROwO consent page.

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

**Response:** \`200\` with client metadata and scope classification (\`valid\` / \`not_permitted\` / \`gated_locked\` / \`unknown\`).

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

**Server-to-server.** Authenticated with \`client_id\` + \`client_secret\` in the body. Handles both initial code exchange and refresh.

### grant_type=authorization_code

\`\`\`json
{
  "grant_type": "authorization_code",
  "client_id": "abc...",
  "client_secret": "...",
  "code": "...",
  "redirect_uri": "https://yourapp.example.com/cb"
}
\`\`\`

### grant_type=refresh_token

\`\`\`json
{
  "grant_type": "refresh_token",
  "client_id": "abc...",
  "client_secret": "...",
  "refresh_token": "rro_..."
}
\`\`\`

**Successful response (both grant types):**

\`\`\`json
{
  "success": true,
  "access_token": "rao_…",
  "refresh_token": "rro_…",
  "token_type": "Bearer",
  "expires_in": 3600,
  "refresh_expires_in": 2592000,
  "scope": "basic verification"
}
\`\`\`

**Errors:**
- \`401 Invalid client credentials.\` — bad \`client_id\`/\`client_secret\`.
- \`400 Authorization code has already been used / has expired / not issued to this client.\` — \`authorization_code\` flow.
- \`401 Refresh token has expired / has already been used / not issued to this client.\` — \`refresh_token\` flow.
- \`401 Authorization has been revoked.\` — the user revoked your app from their Connected Apps page.

Refresh-token reuse (presenting an old, already-rotated token) revokes the entire grant.

---

## GET /api/oauth/userinfo

Fetch the user profile granted to your app. Authenticated with a \`Bearer\` access token from \`/api/oauth/token\`.

\`\`\`
GET /api/oauth/userinfo
Authorization: Bearer rao_…
\`\`\`

**Response (200):**
\`\`\`json
{
  "success": true,
  "scope": "basic verification wechat",
  "user": {
    "user_id": "rowo_…",
    "username_display": "alice"
  },
  "verification": {
    "verified_status": true,
    "verification_method": "discord",
    "verification_time": "2026-01-15T08:42:00Z",
    "reverified_at": null
  },
  "wechat": { "wechat_id": "alice_wx" }
}
\`\`\`

The \`verification\` and \`wechat\` blocks are present only when their scopes were granted. If a granted scope can no longer be served (e.g. the user un-bound their WeChat between authorize and call time), the block is omitted and the response includes \`"partial": true\`.

**Errors:**
- \`401 Bearer access token is required.\` — header missing.
- \`401 Invalid access token.\` — unknown or malformed.
- \`401 Access token has expired.\` — refresh and retry.
- \`401 Authorization has been revoked.\` — the user revoked your app.

---

## GET /api/user/me

Returns the currently-signed-in user's profile. Requires a **ROwO session JWT** (not an OAuth access token). Used by ROwO's own frontends.

---

## GET /api/user/oauth/grants

List the third-party apps the current user has authorized. Used by the User Center > Security > Connected Apps card. Requires a ROwO session JWT.

**Response:**
\`\`\`json
{
  "success": true,
  "grants": [
    {
      "client_id": "...",
      "display_name": "Demo App",
      "icon_url": "https://...",
      "allowed_domain": "example.com",
      "scopes": ["basic", "verification"],
      "created_at": "2026-05-01T12:00:00Z",
      "last_used_at": "2026-05-19T07:12:00Z"
    }
  ]
}
\`\`\`

---

## POST /api/user/oauth/grants/revoke

Revoke a grant for the current user. Marks the grant revoked and deletes all access + refresh tokens for it; subsequent \`/userinfo\` and \`refresh_token\` calls return \`401 Authorization has been revoked.\` Requires a ROwO session JWT.

**Request body:**
\`\`\`json
{ "client_id": "..." }
\`\`\`

Idempotent: revoking a non-existent or already-revoked grant returns \`{ success: true, revoked: false }\`.

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
| \`DELETE\` | \`/api/developers/oauth-clients/:id\` | Permanently delete the client. Cascades: every grant, access token, refresh token, and outstanding authorization code for the client is wiped. |

All require a ROwO session JWT. The same calls happen from the [Clients](/clients) UI in this panel.
`;

export const DOCS: Record<DocSlug, string> = {
  overview,
  'oauth-flow': oauthFlow,
  'api-reference': apiReference,
};
