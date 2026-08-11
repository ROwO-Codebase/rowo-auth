export type NexusDocSlug =
  | 'introduction'
  | 'quick-start'
  | 'wallet-flow'
  | 'ownership-proofs'
  | 'identity-lifecycle'
  | 'api-reference'
  | 'security-checklist';

export const NEXUS_DOC_LIST: { slug: NexusDocSlug; title: string; blurb: string }[] = [
  {
    slug: 'introduction',
    title: 'Introduction',
    blurb: 'What Nexus proves, and how it differs from OAuth.',
  },
  {
    slug: 'quick-start',
    title: 'Quick start',
    blurb: 'Run the reference flow and map it into your app.',
  },
  {
    slug: 'wallet-flow',
    title: 'Wallet flow',
    blurb: 'Request consent through the isolated wallet origin.',
  },
  {
    slug: 'ownership-proofs',
    title: 'Ownership proofs',
    blurb: 'Bind a proof to an audience, action, resource, and challenge.',
  },
  {
    slug: 'identity-lifecycle',
    title: 'Identity lifecycle',
    blurb: 'Registration, status, rotation, continuity, and disposal.',
  },
  {
    slug: 'api-reference',
    title: 'API reference',
    blurb: 'Public Nexus endpoints and media types.',
  },
  {
    slug: 'security-checklist',
    title: 'Security checklist',
    blurb: 'The relying-party checks that must fail closed.',
  },
];

const introduction = `# ROwO Nexus

Nexus lets a person prove control of a **pseudonymous cryptographic identity** for one exact operation. The identity lives in a dedicated browser wallet and does not require a ROwO account, username, password, or profile record.

> **Preview status:** Nexus is a pre-production reference implementation. Its protocol, wallet, registry, verifier, and reference relying party are running for evaluation, but independent cryptographic, privacy, and operational reviews are still required before protecting real users or valuable resources.

## Nexus is not OAuth

ROwO offers two deliberately separate developer products:

| Choose | Use it when you need | What your app receives |
|---|---|---|
| **ROwO OAuth** | Account sign-in and consented ROwO profile data | Access/refresh tokens and selected profile claims |
| **ROwO Nexus** | Pseudonymous control of an app resource | A short-lived ownership proof for one action and resource |

Nexus does **not** authenticate a ROwO account, issue OAuth tokens, expose profile claims, use OAuth client IDs, or redirect through an OAuth callback URI. An RP may support both products, but it must keep their sessions and authorization decisions separate.

## Core properties

- **Self-certifying subjects.** A subject such as \`nx1_…\` is derived from its public identity genesis.
- **Independent identities.** The wallet creates unrelated keys for different contexts by default.
- **Exact consent.** The wallet shows the requesting origin, action, resource, and identity before signing.
- **Replay resistance.** Every proof is bound to a fresh backend challenge and a maximum 120-second lifetime.
- **Authoritative lifecycle.** RPs check the live registry before accepting a protected operation.
- **User-controlled disposal.** Disposal revokes the identity before local key material is removed.

## Production preview services

| Service | URL | Purpose |
|---|---|---|
| Public Nexus API | [nexus.rowo.link](https://nexus.rowo.link/.well-known/nexus.json) | Discovery, service keys, registration, status, and revocation |
| Wallet | [wallet.rowo.link](https://wallet.rowo.link) | Local identity and consent UI |
| Reference RP | [notes.rowo.link](https://notes.rowo.link) | Complete challenge, proof, lifecycle, and replay-safe example |
| Transparency | [status.rowo.link](https://status.rowo.link/.well-known/nexus-transparency-keys.json) | Hash-only registry checkpoints |

## What to read next

Start with the [quick start](/nexus/docs/quick-start), then use the [Nexus playground](/nexus/playground) to build a proof request or inspect an identity's public lifecycle status. The complete source is available in the [ROwO Nexus repository](https://github.com/ROwO-Codebase/rowo-nexus).
`;

const quickStart = `# Quick start

The safest starting point is the deployable Notes reference RP. It demonstrates the complete browser and backend boundary instead of only the wallet popup.

## 1. Run the reference implementation

The public packages are prepared for release but are **not yet published to npm**. For the preview, clone the source repository:

\`\`\`bash
git clone https://github.com/ROwO-Codebase/rowo-nexus.git
cd rowo-nexus
corepack enable
pnpm install --frozen-lockfile
pnpm build:packages
pnpm dev:rp
\`\`\`

The local RP uses an untrusted development certificate because proof audiences must be exact HTTPS origins. Follow the repository README before accepting that certificate.

Do not install the unrelated unscoped \`nexus\` package from npm. Release instructions for the scoped \`@nexus/*\` packages will be added here when publication is complete.

## 2. Issue a challenge on your backend

Before opening the wallet, persist a cryptographically random nonce with the operation you intend to authorize:

\`\`\`ts
const challenge = {
  action: 'note:create',
  resource: 'note:draft',
  nonce: secureRandomBase64Url(32),
  expiresAt: Math.floor(Date.now() / 1000) + 120,
  contextHash: sha256Base64Url(canonicalOperationBody),
};

await challengeStore.insert({ ...challenge, consumed: false });
\`\`\`

The browser must receive the challenge from your backend. Do not let the browser invent the authoritative action, resource, or content hash.

## 3. Ask the wallet for a proof

Inside the Nexus source workspace, the browser integration is:

\`\`\`ts
import { createNexusClient } from '@nexus/sdk-browser';

const nexus = createNexusClient({
  walletUrl: 'https://wallet.rowo.link',
});

const result = await nexus.requestProof({
  action: challenge.action,
  resource: challenge.resource,
  nonce: challenge.nonce,
  expiresAt: challenge.expiresAt,
  contextHash: challenge.contextHash,
});
\`\`\`

There is intentionally no \`aud\` field in the request. The wallet derives the audience from the exact \`MessageEvent.origin\` that delivered the request.

## 4. Verify on your backend

Submit the proof and challenge identifier to your backend. A complete RP uses \`verifyRpOperation\` with a durable challenge store and the authoritative registry:

\`\`\`ts
import { verifyRpOperation } from '@nexus/verifier';

const subject = await verifyRpOperation(
  proof,
  {
    audience: 'https://your-app.example',
    action: challenge.action,
    resource: challenge.resource,
    nonce: challenge.nonce,
    now: Math.floor(Date.now() / 1000),
    maxClockSkewSeconds: 30,
  },
  challengeStore,
  authoritativeLifecycleProvider,
);
\`\`\`

Before this call, compare the proof's nonce hash and optional context hash with the stored challenge. Only commit the protected operation after proof verification, live lifecycle checking, and atomic challenge consumption all succeed.

## 5. Test failure cases

Your integration is incomplete until it rejects:

- a proof replayed after the challenge was consumed;
- a proof issued to another origin;
- a changed action, resource, nonce, or context hash;
- an expired proof;
- an identity revoked after an older proof was issued;
- a malformed proof with extra or incorrectly encoded fields.

Use [notes.rowo.link](https://notes.rowo.link) to see the full flow before building your own UI.
`;

const walletFlow = `# Wallet flow

The wallet runs at a dedicated origin and is the only browser surface that handles identity private keys. Your RP communicates with it through the reviewed \`@nexus/sdk-browser\` popup transport.

## Request sequence

1. Your backend creates and stores a one-time challenge.
2. Your browser calls \`requestProof()\` in direct response to a user action.
3. The SDK opens \`https://wallet.rowo.link\`.
4. The SDK waits for a non-sensitive \`NEXUS_READY\` message from the exact wallet origin and popup window.
5. The request is posted to that exact origin.
6. The wallet displays the RP origin, action, resource, and selected local identity.
7. On approval, the wallet returns a signed proof to the exact opener origin.
8. Your browser sends the proof to your backend for verification.

## Popup safety rules

- Construct the client with an exact HTTPS wallet URL.
- Call it from a click or other user activation so browsers do not block the popup.
- Never use \`postMessage(..., '*')\` for a proof request or result.
- Check both \`event.origin\` and \`event.source\`.
- Match the generated request ID before accepting a response.
- Treat popup close, timeout, denial, and cancellation as normal non-authorizing outcomes.
- Use \`AbortSignal\` when navigation or component teardown should cancel the request.

## Audience binding

The wallet ignores any caller-supplied audience. It derives \`proof.payload.aud\` from the browser origin that sent the message. Your backend must compare that value with its own configured canonical origin, for example:

\`\`\`ts
const expectedAudience = 'https://your-app.example';
\`\`\`

Do not derive the expected audience from \`Host\`, \`Origin\`, or forwarded headers on each incoming request unless a reviewed proxy boundary guarantees them. Configure one canonical HTTPS audience per deployment.

## Local development

Production wallet URLs must use HTTPS. The SDK's \`allowInsecureLocalhost\` option is only for loopback development and accepts HTTP only on \`localhost\`, \`127.0.0.1\`, or \`[::1]\`:

\`\`\`ts
const nexus = createNexusClient({
  walletUrl: import.meta.env.DEV
    ? 'http://127.0.0.1:5173'
    : 'https://wallet.rowo.link',
  allowInsecureLocalhost: import.meta.env.DEV,
});
\`\`\`
`;

const ownershipProofs = `# Ownership proofs

An ownership proof says: “the controller of this Nexus subject approved this exact action, on this exact resource, for this exact relying-party origin, during this short time window.”

## Proof request fields

| Field | Meaning | Requirement |
|---|---|---|
| \`action\` | Operation being authorized, such as \`note:edit\` | Printable, app-defined, maximum 128 characters |
| \`resource\` | Object or scope being changed, such as \`note:nt_123\` | Printable, app-defined, maximum 512 characters |
| \`nonce\` | One-time backend challenge | Unpadded base64url, 16–64 random bytes |
| \`expiresAt\` | Request expiry in Unix seconds | No more than 120 seconds in the future |
| \`contextHash\` | Hash of exact operation content | Optional 32-byte unpadded base64url value |

The request does not contain an audience. The wallet inserts the exact RP origin as \`payload.aud\`.

## Signed proof shape

\`\`\`json
{
  "payload": {
    "protocol": "nexus.ownership-proof.v1",
    "subject": "nx1_...",
    "genesis": { "...": "public identity genesis" },
    "aud": "https://your-app.example",
    "act": "note:edit",
    "resource": "note:nt_123",
    "nonce": "base64url challenge",
    "iat": 1786429000,
    "exp": 1786429120,
    "contextHash": "base64url SHA-256"
  },
  "signature": "base64url Ed25519 signature"
}
\`\`\`

## Verification order

1. Strictly parse the proof and reject unknown fields.
2. Recompute the self-certifying subject from the included genesis.
3. Verify the Ed25519 signature over the Nexus domain-separated canonical payload.
4. Compare audience, action, resource, nonce, and time expectations.
5. Load the stored challenge and reject consumed or expired records.
6. Check the subject's authoritative live registry state.
7. Atomically consume the challenge.
8. Commit the application operation.

Do not authorize from the D1 projection, transparency log, cache, or a previously observed status response. Those surfaces are useful for discovery and audit, but the registry Durable Object is lifecycle authority.

## Context binding

For an edit or transaction, canonicalize the exact server-understood operation and hash it before issuing the challenge. A proof for one body must not authorize another body that happens to share the same action and resource labels.
`;

const identityLifecycle = `# Identity lifecycle

Nexus identities are local, independent, and disposable. A relying party should store only the subject and application data it actually needs.

## Create and register

The wallet generates a fresh Ed25519 signing key, optional X25519 agreement key, and revocation secret. The subject is derived from the public genesis. The wallet then registers that subject and retains the signed registry receipt.

If registration fails after local creation, the wallet keeps the identity and offers an idempotent registration retry. It must not use the identity for proofs until registration is confirmed.

## Live status

RPs query \`POST /v1/identity/status\` before accepting a protected operation. The response contains the public genesis, lifecycle sequence, timestamps, and a short-lived signed status statement.

Lifecycle is monotonic:

\`\`\`
not found → active → revoked
\`\`\`

A revoked identity never returns to active.

## Rotation

Default rotation creates a completely unrelated identity. This is the privacy-preserving choice and creates no public old-to-new link.

An explicit continuity link is an advanced, opt-in artifact signed by both identities. Publishing it lets observers correlate them, so show that privacy consequence before approval.

## Disposal

Disposal means the identity is cryptographically disabled for future control:

1. Revoke it in the authoritative registry.
2. Verify the terminal registry receipt.
3. Only then remove local private-key material.

If the revocation response is lost after the registry commits it, the wallet retries the idempotent revocation and verifies a fresh receipt. Local keys are preserved until terminal revocation is proven.

## RP behavior after revocation

Historical application content may remain, but every new create, edit, delete, or session-establishing proof must fail. Never treat possession of an old private key or proof as evidence that the identity is still active.
`;

const apiReference = `# Nexus API reference

The public API origin is \`https://nexus.rowo.link\`. Nexus protocol requests use:

\`\`\`
Content-Type: application/nexus+json
\`\`\`

All JSON schemas are strict. Unknown fields, padded base64url, duplicate JSON keys, unsupported protocol versions, and malformed subjects are rejected.

## Discovery and service keys

| Method | Path | Purpose |
|---|---|---|
| \`GET\` | \`/.well-known/nexus.json\` | Protocols, suites, registry base URL, JWKS, and wallet URL |
| \`GET\` | \`/.well-known/jwks.json\` | Current and retained registry receipt/status verification keys |

\`\`\`bash
curl https://nexus.rowo.link/.well-known/nexus.json
curl https://nexus.rowo.link/.well-known/jwks.json
\`\`\`

## POST /v1/identity/status

Public, credential-free lifecycle lookup. This is the only mutation-like POST intentionally available to arbitrary browser origins.

\`\`\`bash
curl https://nexus.rowo.link/v1/identity/status \\
  -H 'Content-Type: application/nexus+json' \\
  -d '{"subject":"nx1_..."}'
\`\`\`

A successful response is a strict \`RegistryStatusV1\` object containing \`subject\`, \`state\`, \`sequence\`, \`registeredAt\`, \`revokedAt\`, \`genesis\`, and \`statusStatement\`.

## POST /v1/identity/status-batch

Looks up 1–100 subjects while preserving input order:

\`\`\`json
{
  "subjects": ["nx1_...", "nx1_..."]
}
\`\`\`

Batch results can include per-subject neutral errors. Do not infer identities or user records from an unknown-subject response.

## POST /v1/identity/register

Wallet-only mutation. The edge API accepts browser mutation requests only from the configured wallet origin.

\`\`\`json
{
  "subject": "nx1_...",
  "genesis": {
    "protocol": "nexus.identity.v1",
    "suite": "NX-25519-SHA256-JCS-v1",
    "signingKey": { "alg": "Ed25519", "publicKey": "..." },
    "revocationCommitment": "..."
  }
}
\`\`\`

The API recomputes the subject from the genesis and returns a signed registry receipt. RPs do not register identities on a user's behalf.

## POST /v1/identity/revoke

Wallet-only mutation. Revocation uses either a signed request from the current identity key or the committed revocation secret. Both modes include the expected lifecycle sequence so races fail safely.

## Errors and rate limits

Errors use a neutral envelope:

\`\`\`json
{
  "error": {
    "code": "IDENTITY_NOT_FOUND",
    "message": "The requested Nexus identity was not found.",
    "requestId": "opaque-id"
  }
}
\`\`\`

Public endpoints are rate limited. Handle \`429 RATE_LIMITED\` and respect \`Retry-After\`. Do not automatically retry mutations unless the operation is explicitly idempotent and retains the same sequence/challenge semantics.

## Transparency

Transparency keys are published at [status.rowo.link/.well-known/nexus-transparency-keys.json](https://status.rowo.link/.well-known/nexus-transparency-keys.json). Transparency proves append-only publication of registry event hashes; it does not replace live lifecycle authorization.
`;

const securityChecklist = `# Relying-party security checklist

Use this as a release gate for every Nexus integration.

## Challenge issuance

- Generate nonces with a CSPRNG; never use \`Math.random()\`.
- Store the nonce, action, resource, context hash, expiry, and consumed state on the backend.
- Keep proof lifetimes at or below 120 seconds.
- Bind mutable operation bodies with a canonical context hash.
- Apply a bounded outstanding-challenge quota and rate limit challenge creation.

## Wallet transport

- Use the reviewed browser SDK rather than copying popup messaging code.
- Require an exact HTTPS wallet origin in production.
- Validate popup source, origin, request ID, and message schema.
- Never place subjects, proofs, or scopes in URLs.
- Treat denial, close, abort, and timeout as no authorization.

## Server verification

- Parse with the matching strict \`@nexus/protocol\` schema.
- Recompute the subject from genesis.
- Verify the domain-separated Ed25519 signature.
- Compare the configured canonical audience, action, resource, nonce, and time window.
- Verify any context hash against the exact operation body.
- Check authoritative live lifecycle status; fail closed on timeout or malformed status.
- Atomically consume the challenge before committing the protected change.
- Keep application authorization separate from proof validity: control of a subject does not automatically grant access to every resource.

## Privacy and data handling

- Do not build a global controller or user table from Nexus subjects.
- Do not ask the wallet for unrelated identities.
- Store the minimum subject/resource relationship your application requires.
- Avoid routine logs containing subjects, proofs, nonces, keys, or operation content.
- Remember that Nexus does not provide network anonymity; infrastructure and timing can still correlate traffic.

## Lifecycle

- Never authorize from D1, KV, R2, Queue state, or transparency data.
- Reject \`revoked\` and \`not-found\` status.
- Do not turn a revoked identity active again.
- Treat continuity links as optional correlation artifacts, not automatic account migration.
- Preserve historical data only under your application's explicit retention policy.

## Key and package trust

- Fetch registry/status JWKS from the discovery document and retain required historical verification keys.
- Keep transparency keys separate from registry receipt/status keys.
- Pin reviewed \`@nexus/*\` releases once packages are published.
- Re-run deterministic vectors, cross-runtime tests, and two-origin browser tests after protocol or verifier upgrades.
`;

export const NEXUS_DOCS: Record<NexusDocSlug, string> = {
  introduction,
  'quick-start': quickStart,
  'wallet-flow': walletFlow,
  'ownership-proofs': ownershipProofs,
  'identity-lifecycle': identityLifecycle,
  'api-reference': apiReference,
  'security-checklist': securityChecklist,
};
