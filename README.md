# ROwO Auth

ROwO Auth is a student verification portal that links WeChat IDs to verified student identities using multiple verification methods (ADFS, university email, Discord, GitHub, and manual review).

## What This Project Contains

- A React + Vite frontend for:
  - public verification lookup
  - user verification flows
  - admin/moderator account management
- A Cloudflare Worker backend (`backend/worker.js`) for:
  - verification APIs
  - admin APIs
  - rename token flow
  - email sending, Discord, and GitHub integrations

## Tech Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS
- Backend: Cloudflare Worker (JavaScript), D1 database binding (`auth_database`)
- Integrations: AWS SES (email), Discord OAuth/API, GitHub OAuth/API

## Project Structure

This repo is an npm workspaces monorepo:

- `apps/main/`: the consumer-facing site (`rowo.link`) — verification flows, admin panel, user center
- `apps/developers/`: the developer panel (`developers.rowo.link`) — OAuth client CRUD, API docs, playground
- `packages/shared/`: code shared by both frontends (session/JWT utilities, common types)
- `backend/worker.js`: Cloudflare Worker — single API backend serving both apps at `api.rowo.link`
- `backend/migrations/`: ordered D1 schema migrations
- `package.json`: workspace root with cross-workspace scripts

## Prerequisites

- Node.js 20+ (recommended)
- npm
- A deployed backend API endpoint (or local Worker endpoint) for frontend calls

## Quick Start (Frontend)

1. Install dependencies from the repo root (wires the workspaces together):
   - `npm install`
2. Configure each app's API target in its own `package.json`:
   - `apps/main/package.json` → `config.api_endpoint`, `config.icon_url`
   - `apps/developers/package.json` → same fields
3. Start a dev server:
   - `npm run dev:main` (port 5173)
   - `npm run dev:developers` (port 5174)
4. Open the local Vite URL shown in terminal.

## Configuration

### Frontend Build-Time Config

Each app reads constants from **its own** `package.json` (`apps/main/package.json`, `apps/developers/package.json`):

- `config.api_endpoint`: base URL used by frontend API requests
- `config.icon_url`: icon URL injected into HTML

These values are exposed as `__API_ENDPOINT__` and `__ICON_URL__` at build time. All OAuth client IDs, scopes, and redirect URIs live on the backend (see `GET /api/oauth/redirect/:provider`); the frontend never constructs OAuth authorize URLs.

### Environment Variables

`.env.example` includes:

- `APP_URL`: public URL where the app is hosted

Backend `backend/worker.js` expects runtime bindings/secrets such as:

- Database binding: `auth_database`
- Security: `SENSITIVE_DATA_HASH_SECRET`, `ADFS_JWT_SECRET`
- Email (AWS SES): `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `SES_FROM_EMAIL`, `SES_FROM_NAME`
- Discord: `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_REDIRECT_URI`, `DISCORD_BOT_TOKEN`
- GitHub: `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
- Policy/rate-limit options: `EMAIL_SENDS_PER_MINUTE`, `CORS_ALLOW_ORIGINS`, `ALLOWED_EMAIL_DOMAIN`, `ADFS_PROVIDER_ENDPOINT`

## Available Scripts

- `npm run dev:main`: start the main site dev server (port 5173)
- `npm run dev:developers`: start the developer panel dev server (port 5174)
- `npm run build:main` / `npm run build:developers`: build each frontend to `apps/<name>/dist`
- `npm run preview:main` / `npm run preview:developers`: preview a production build locally
- `npm run lint`: TypeScript project-references build (`tsc -b`) across all workspaces
- `npm run dev:worker`: run Worker locally with Wrangler config
- `npm run deploy:worker`: deploy Worker using `backend/wrangler.toml`
- `npm run deploy:worker:prod`: deploy Worker to `production` environment

## Cloudflare Pages Deploy (two projects)

Each frontend deploys as its own Cloudflare Pages project, both connected to this repo:

| CF Pages project | Build command | Output directory | Custom domain |
|---|---|---|---|
| `rowo-main` | `npm run build:main` | `apps/main/dist` | `rowo.link` |
| `rowo-developers` | `npm run build:developers` | `apps/developers/dist` | `developers.rowo.link` |

Leave the *Root directory* setting blank — builds must run from the repo root so npm workspaces resolve. Cloudflare auto-spawns preview deployments for non-production branches.

## Cloudflare Worker Deploy (CI/CD Ready)

This repository includes Worker deployment config at `backend/wrangler.toml` for `backend/worker.js`.

### One-time setup

1. Update placeholders in `backend/wrangler.toml`:
   - `account_id`
   - `database_id` values under `d1_databases`
2. Authenticate Wrangler locally:
   - `npx wrangler login`
3. Add required Worker secrets (encrypted values):
   - `npx wrangler secret put SENSITIVE_DATA_HASH_SECRET --config backend/wrangler.toml --env production`
   - `npx wrangler secret put ADFS_JWT_SECRET --config backend/wrangler.toml --env production`
   - `npx wrangler secret put AWS_ACCESS_KEY_ID --config backend/wrangler.toml --env production`
   - `npx wrangler secret put AWS_SECRET_ACCESS_KEY --config backend/wrangler.toml --env production`
   - `npx wrangler secret put DISCORD_CLIENT_SECRET --config backend/wrangler.toml --env production`
   - `npx wrangler secret put DISCORD_BOT_TOKEN --config backend/wrangler.toml --env production`
   - `npx wrangler secret put GITHUB_CLIENT_SECRET --config backend/wrangler.toml --env production`
4. Set plaintext variables in `backend/wrangler.toml` under `[vars]` and `[env.production.vars]` (already scaffolded in this repo).

### Environment variable catalog

#### Secrets (encrypted via `wrangler secret put`)

- `ADFS_JWT_SECRET`: Authenticate requests and ensure they come from the ADFS provider.
- `AWS_ACCESS_KEY_ID`: Send verification emails through AWS SES.
- `AWS_SECRET_ACCESS_KEY`: Send verification emails through AWS SES.
- `DISCORD_BOT_TOKEN`: Configure the Discord bot for Discord-based verification workflow.
- `DISCORD_CLIENT_SECRET`: Configure Discord OAuth for Discord-based verification workflow.
- `GITHUB_CLIENT_SECRET`: Configure GitHub OAuth for GitHub-based verification workflow.
- `SENSITIVE_DATA_HASH_SECRET`: Hash identifiable student information for privacy compliance.

#### Plaintext variables (configured in `wrangler.toml`)

- `ALLOWED_EMAIL_DOMAIN = "uwaterloo.ca"`: Allow email domain for email-based verification.
- `ADFS_PROVIDER_ENDPOINT = "https://adfs.example.edu/login"`: External ADFS provider endpoint the unified `/api/oauth/redirect/adfs` route 302s to.
- `AWS_REGION = "us-east-1"`: AWS SES region for verification email sending.
- `CORS_ALLOW_ORIGINS = "*"`: Configure CORS allowlist.
- `DISCORD_CLIENT_ID = "..."`: Public Discord OAuth client ID used to build the authorize URL.
- `DISCORD_REDIRECT_URI = "https://rowo.link/verify/discord/callback"`: Callback URL for Discord-based verification workflow.
- `EMAIL_SENDS_PER_MINUTE = "60"`: Email send rate limit for email-based verification workflow.
- `GITHUB_CLIENT_ID = ""`: Public GitHub OAuth client ID used to build the authorize URL.
- `GITHUB_REDIRECT_URI = "https://rowo.link/verify/github/callback"`: Callback URL for GitHub-based verification workflow.
- `SES_FROM_EMAIL = "verification@rowo.link"`: Sender address for verification emails.
- `SES_FROM_NAME = "ROwO Auth"`: Sender display name for verification emails.

Trusted Discord guild/role pairs are configured in D1 (`discord_trusted_servers` table), not in environment variables.

### Deploy commands

- Default deploy:
  - `npm run deploy:worker`
- Production deploy (for `main` branch release pipeline):
  - `npm run deploy:worker:prod`

For Cloudflare CI/CD, use the same production command (`npx wrangler deploy --config backend/wrangler.toml --env production`) in your `main` branch pipeline.

### D1 schema migration

Apply `backend/schema.sql` to initialize or migrate the `auth_database` D1 database:

- Local/default database:
  - `npx wrangler d1 execute rowo-auth-db --file backend/schema.sql --config backend/wrangler.toml`
- Production environment database:
  - `npx wrangler d1 execute rowo-auth-db --file backend/schema.sql --config backend/wrangler.toml --env production`

If your D1 database name differs from `rowo-auth-db`, replace it in the command accordingly.

The schema includes `discord_trusted_servers` and seeds one active trusted guild/role pair. Update that table in D1 to manage trusted Discord sources.

For an existing deployment upgrading to admin notification preferences, run the following ALTER statements (skip if `backend/schema.sql` was applied fresh):

```sh
npx wrangler d1 execute rowo-auth-db --command "ALTER TABLE admins ADD COLUMN notification_email TEXT;" --config backend/wrangler.toml --env production
npx wrangler d1 execute rowo-auth-db --command "ALTER TABLE admins ADD COLUMN manual_notification_enabled INTEGER NOT NULL DEFAULT 0;" --config backend/wrangler.toml --env production
```

## API Route Overview

Core verification routes:

- `GET /api/verify/:wechatId`
- `POST /api/adfs/create-code`
- `POST /api/verify/adfs`
- `POST /api/verify/email`
- `POST /api/verify/discord/callback`
- `POST /api/verify/discord/connect`
- `POST /api/verify/github/callback`
- `POST /api/verify/github/connect`
- `POST /api/verify/manual`

ROwO Account routes (username + password):

- `POST /api/user/register`
- `POST /api/user/login`
- `POST /api/user/logout`
- `GET /api/user/me`
- `POST /api/user/bind-wechat`
- `POST /api/user/change-wechat`
- `POST /api/user/change-password`

Admin routes:

- `POST /api/admin/login`
- `POST /api/admin/rotate-token`
- `GET /api/admin/preferences`
- `POST /api/admin/preferences`
- `GET /api/admin/accounts`
- `GET /api/admin/stats`
- `GET /api/admin/blacklist`
- `POST /api/admin/batch/verify`
- `POST /api/admin/batch/blacklist`
- `GET|POST /api/admin/accounts/:wechatId/info`
- `PUT|DELETE /api/admin/info/:id`
- `POST /api/admin/accounts/:wechatId/(revoke|unrevoke|manual|blacklist|unblacklist)`
- `GET /api/admin/users`
- `POST /api/admin/users/:id/reset-password`
- `POST /api/admin/users/:id/unbind-wechat`

Developer panel routes (any logged-in user; scoped to their own clients):

- `GET /api/developers/oauth-clients`
- `POST /api/developers/oauth-clients`
- `GET /api/developers/oauth-clients/:client_id`
- `PATCH /api/developers/oauth-clients/:client_id`
- `POST /api/developers/oauth-clients/:client_id/rotate-secret`
- `DELETE /api/developers/oauth-clients/:client_id`

## Security Notes

- Never commit real secrets or tokens.
- Keep admin tokens private and rotate them when exposed.
- Restrict `CORS_ALLOW_ORIGINS` in production (avoid `*` where possible).
- Configure `ALLOWED_EMAIL_DOMAIN` to enforce institutional email domain policy.
- Internal backend exceptions are logged server-side and returned to clients as generic error messages.

## Data Handling Notes

- Core account identity correlation fields are stored using SHA-256 based keyed hashing.
- Some operational values are plaintext by design (for example WeChat IDs and moderation/admin metadata).
- Pending email verification data includes plaintext normalized email until verification completes or expires.
- Subprocessors/services used by this project:
  - Cloudflare Workers + D1 (runtime and database)
  - AWS SES (verification email delivery)
  - Discord APIs (OAuth and guild/role verification)
  - GitHub APIs (OAuth and verified-email domain check)
- Retention behavior:
  - verification artifacts and rename tokens are short-lived
  - rate-limit rows are pruned periodically
  - account/moderation records persist until updated or manually removed

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

## Development and Contribution

1. Create a feature branch.
2. Make focused changes with clear commit messages.
3. Run:
   - `npm run lint`
   - any local verification flows you changed
4. Open a pull request with:
   - change summary
   - test/verification notes
   - any config migration notes

## Troubleshooting

- Frontend cannot reach backend:
  - verify `config.api_endpoint` in the relevant app's `package.json` (`apps/main/package.json` or `apps/developers/package.json`)
  - ensure backend `CORS_ALLOW_ORIGINS` includes your frontend origin
- Email verification fails:
  - check AWS SES credentials, sender identity, and region
- Discord verification fails:
  - check OAuth redirect URI and guild/role related env vars
- GitHub verification fails:
  - check `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` and `GITHUB_REDIRECT_URI` in `backend/wrangler.toml`
  - ensure the GitHub OAuth App's "Authorization callback URL" matches `GITHUB_REDIRECT_URI`
  - user's GitHub account must have at least one verified email under `ALLOWED_EMAIL_DOMAIN`
- Admin panel cannot authenticate:
  - ensure admin token exists in backend data and is sent as Bearer token
