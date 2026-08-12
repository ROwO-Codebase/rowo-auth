export type NexusDocSlug =
  | 'introduction'
  | 'quick-start'
  | 'wallet-flow'
  | 'root-and-device-keys'
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
    slug: 'root-and-device-keys',
    title: 'Root and device keys',
    blurb: 'Understand v2 delegation, revocation, transfer, and v1 compatibility.',
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
- **Root-anchored identity.** Nexus v2 keeps the existing v1 genesis and subject, but treats its Ed25519 signing key as the root authority for the identity.
- **Daily-use device keys.** The root can authorize separate, independently revocable device signing keys that prove the same subject without carrying the root private key.
- **Independent identities.** The wallet creates unrelated keys for different contexts by default.
- **Exact consent.** The wallet shows the requesting origin, action, resource, and identity before signing.
- **Replay resistance.** Every proof is bound to a fresh backend challenge and a maximum 120-second lifetime.
- **Authoritative lifecycle.** RPs check both the identity and exact device authorization before accepting a v2 operation.
- **User-controlled disposal.** Disposal revokes the identity before local key material is removed.

## Production preview services

| Service | URL | Purpose |
|---|---|---|
| Public Nexus API | [nexus.rowo.link](https://nexus.rowo.link/.well-known/nexus-v2.json) | V2 discovery, service keys, identity registration, and device lifecycle |
| Wallet | [wallet.rowo.link](https://wallet.rowo.link) | Local identity and consent UI |
| Reference RP | [notes.rowo.link](https://notes.rowo.link) | Complete challenge, proof, lifecycle, and replay-safe example |
| Transparency | [status.rowo.link](https://status.rowo.link/.well-known/nexus-transparency-keys.json) | Hash-only registry checkpoints |

## What to read next

Start with the [quick start](/nexus/docs/quick-start), then read [root and device keys](/nexus/docs/root-and-device-keys) before accepting v2 proofs. The [Nexus playground](/nexus/playground) builds a negotiated proof request or inspects an identity's public lifecycle status. The complete source is available in the [ROwO Nexus repository](https://github.com/ROwO-Codebase/rowo-nexus).
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

Before opening the wallet, persist a cryptographically random nonce, the operation you intend to authorize, and the exact ordered proof-protocol policy:

\`\`\`ts
const acceptedProofProtocols = [
  'nexus.ownership-proof.v2',
  'nexus.ownership-proof.v1',
] as const;

const challenge = {
  action: 'note:create',
  resource: 'note:draft',
  nonce: secureRandomBase64Url(32),
  expiresAt: Math.floor(Date.now() / 1000) + 120,
  contextHash: sha256Base64Url(canonicalOperationBody),
  acceptedProofProtocols,
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

const result = await nexus.requestProofV2(
  {
    action: challenge.action,
    resource: challenge.resource,
    nonce: challenge.nonce,
    expiresAt: challenge.expiresAt,
    contextHash: challenge.contextHash,
  },
  {
    // Copy this ordered policy from the server-issued challenge.
    acceptedProofProtocols: challenge.acceptedProofProtocols,
  },
);
\`\`\`

There is intentionally no \`aud\` field in the request. The wallet derives the audience from the exact \`MessageEvent.origin\` that delivered the request. The result contains both \`proofProtocol\` and \`proof\`; never infer the protocol from UI labels or attempt a silent fallback.

## 4. Verify on your backend

Submit the negotiated result and challenge identifier to your backend. Enforce the protocol list stored with the challenge, then dispatch to the matching complete verifier:

\`\`\`ts
import { verifyRpOperation, verifyRpOperationV2 } from '@nexus/verifier';

if (!challenge.acceptedProofProtocols.includes(result.proofProtocol)) {
  throw new Error('Proof protocol was not authorized by this challenge');
}

const expected = {
  audience: 'https://your-app.example',
  action: challenge.action,
  resource: challenge.resource,
  nonce: challenge.nonce,
  now: Math.floor(Date.now() / 1000),
  maxClockSkewSeconds: 30,
};

const subject =
  result.proofProtocol === 'nexus.ownership-proof.v2'
    ? await verifyRpOperationV2(
        result.proof,
        { ...expected, contextHash: challenge.contextHash ?? null },
        challengeStore,
        authoritativeIdentityLifecycle,
        authoritativeDeviceLifecycle,
      )
    : await verifyRpOperation(
        result.proof,
        expected,
        challengeStore,
        authoritativeIdentityLifecycle,
      );
\`\`\`

For a v1 fallback, compare the proof's optional context hash with the stored challenge before calling the legacy verifier. Only commit the protected operation after proof verification, exact live lifecycle checking, and atomic challenge consumption all succeed. V2 requires the identity **and** the exact \`{ subject, deviceId, authorizationId }\` tuple to remain active.

## 5. Test failure cases

Your integration is incomplete until it rejects:

- a proof replayed after the challenge was consumed;
- a proof issued to another origin;
- a changed action, resource, nonce, or context hash;
- an expired proof;
- an identity revoked after an older proof was issued;
- a device that is revoked, expired, unknown, or authorized under a different authorization ID;
- a returned proof protocol that was not stored with the challenge;
- a v1 proof offered against a v2-only challenge;
- a malformed proof with extra or incorrectly encoded fields.

Use [notes.rowo.link](https://notes.rowo.link) to see the full flow before building your own UI.
`;

const walletFlow = `# Wallet flow

The wallet runs at a dedicated origin and is the only browser surface that handles identity private keys. Your RP communicates with it through the reviewed \`@nexus/sdk-browser\` popup transport.

## Request sequence

1. Your backend creates and stores a one-time challenge.
2. Your browser calls \`requestProofV2()\` with the ordered protocol policy copied from that challenge.
3. The SDK opens \`https://wallet.rowo.link\`.
4. On the \`nexus.popup.v2\` channel, the wallet advertises the proof protocols it supports.
5. The request is posted to that exact origin.
6. The wallet displays the RP origin, action, resource, and whether the selected credential is a root key or device key.
7. On approval, the wallet returns the signed proof and its selected protocol to the exact opener origin.
8. Your browser sends the proof to your backend for verification.

## V2 protocol negotiation

- The RP sends a non-empty, duplicate-free ordered \`acceptedProofProtocols\` list.
- Prefer \`nexus.ownership-proof.v2\` before \`nexus.ownership-proof.v1\` when both are allowed.
- A device-key installation can return only a v2 proof. A root-key installation can return a v1 proof only when the RP explicitly accepts it.
- The v2 result includes \`proofProtocol\`; the backend must compare it with the policy persisted beside the challenge.
- No common protocol fails with \`UNSUPPORTED_PROOF_PROTOCOL\`. Never retry through the legacy channel as an automatic downgrade.

The legacy \`nexus.popup.v1\` channel and \`requestProof()\` API remain available for unchanged v1 integrations. They do not carry a device proof or v2 negotiation policy.

## Popup safety rules

- Construct the client with an exact HTTPS wallet URL.
- Call it from a click or other user activation so browsers do not block the popup.
- Never use \`postMessage(..., '*')\` for a proof request or result.
- Check both \`event.origin\` and \`event.source\`.
- Match the generated request ID before accepting a response.
- Match the returned proof protocol against both the wallet advertisement and server-issued policy.
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

const rootAndDeviceKeys = `# Root and device keys

Nexus v2 adds device delegation without replacing the v1 identity format. The existing \`IdentityGenesisV1.signingKey\` becomes the **root key** for the identity, and the subject remains the same self-certifying \`nx1_…\` value. A root can authorize any number of independent **device keys** beneath that subject.

> A new root identity does not automatically include a device key. Creating a device is a separate, explicit operation so the user can keep the root for recovery and administration.

## Key roles

| Property | Root key | Device key |
|---|---|---|
| Identity role | Original Ed25519 key committed by the v1 genesis; defines the \`nx1_…\` subject | Independent Ed25519 key representing that same subject through a root-signed authorization |
| Intended use | Offline or infrequently used identity administration and explicit v1 compatibility | Routine v2 proofs on one installed device |
| Export | Private key is non-extractable and cannot be exported | Newly generated key may leave its root wallet only inside an encrypted transfer; it becomes non-extractable after import |
| Proof protocol | \`nexus.ownership-proof.v1\`, only when the RP explicitly accepts v1 | \`nexus.ownership-proof.v2\` |
| Management authority | Authorize new devices and permanently revoke any device | Activate itself and revoke only its own device authorization |
| Compromise impact | Attacker can administer every device under the subject and use the root's legacy authority | Attacker can act only as that device until it expires or is revoked |
| Loss and recovery | Device keys cannot reconstruct or recover a lost root | Root can issue a replacement device with a new key and device ID |

A device key cannot authorize a sibling, revoke another device, replace the root, export the root, or terminally revoke the identity. Root and device keys must also be cryptographically distinct; the registry rejects a “device” authorization that reuses the root public key.

## One identity, distinct proof evidence

A v2 device proof still carries the original genesis and the same subject that an RP already knows. It additionally carries:

- a stable \`nxd2_…\` device ID derived from the subject and device public key;
- an \`nxa2_…\` authorization ID derived from the complete root authorization;
- the root-signed \`nexus.device-authorization.v2\` object; and
- a \`deviceSignature\` over the proof.

The RP can therefore recognize the same identity while checking which exact device authorization exercised it. Store \`proofProtocol\`, \`deviceId\`, and \`authorizationId\` with a v2 session so later protected operations can recheck the same tuple.

## Compatibility matrix

| Credential and integration | Result |
|---|---|
| Existing v1 root with an unchanged v1 RP | Continues to work exactly as before |
| Existing v1 root adopting v2 | Issues a separate device key without re-registering or changing its subject |
| Device key with a v2-aware RP | Produces a v2 proof for the same subject |
| Device key with a v1-only RP | Does not work; a device key cannot forge a root-signed v1 proof |
| V2-aware RP allowing \`[v2, v1]\` | Prefers a device proof and may accept an explicitly selected root/v1 proof |
| V2-only RP | Rejects root/v1 fallback rather than silently downgrading |

The v1 wire schemas, \`/v1/identity/*\` routes, \`nexus.popup.v1\` channel, discovery response, and verifier entry points remain unchanged. V2-aware clients use \`nexus.popup.v2\`, \`/.well-known/nexus-v2.json\`, and the additive device APIs.

## Issue, install, and activate a device

1. The root wallet creates a fresh device signing key and signs \`nexus.device-authorization.v2\`.
2. The authorization binds the subject, genesis hash, device public key and ID, a random authorization nonce, \`validFrom\`, \`activationDeadline\`, and \`expiresAt\`.
3. The target wallet decrypts the transfer locally, verifies every identifier and the root signature, and imports the private key as non-extractable.
4. The target signs \`nexus.device-activation.v2\` to prove possession to the registry.
5. Only a verified activation receipt changes the local device to active and proof-ready.

The activation window is at most 30 days and the authorization lifetime is at most 366 days. Expiry is exclusive: the device is expired when \`now >= expiresAt\` and must be replaced with a newly authorized key.

## Offline transfer methods

- **JSON bundle:** the downloaded encrypted bundle does not contain its 256-bit transfer key. Deliver the file and key through separate channels.
- **Direct QR:** the root wallet can render one QR containing the encrypted bundle and transfer key. Generation and scanning are local and require no QR web service, URL shortener, analytics endpoint, or network retrieval.

The QR is a complete bearer credential. Anyone who photographs or scans it can install an indistinguishable clone. Transfer copies a device key; it cannot guarantee a one-time move. Every clone has the same \`nxd2_…\` ID, and revoking that device invalidates all copies together. Generate a distinct device key for each intended installation when independent revocation matters.

## Revocation and status awareness

- **Device self-revocation** uses \`nexus.device-self-revoke.v2\` and affects only that device ID.
- **Root device revocation** uses \`nexus.device-root-revoke.v2\`, works before or after activation, and permanently tombstones the device ID.
- **Identity revocation** remains a terminal v1 operation and overrides every device under the subject.
- Revocation always wins over activation. A revoked device cannot become active again.

There is no push channel between wallets. A root does not automatically learn that a device self-revoked, and a device does not automatically learn that the root revoked it. Each wallet learns the current state when the user refreshes, when normal use polls the registry, or when an RP rejects a proof. Status lookup is deliberately exact; the public API does not offer “list every device for this subject.”

Deleting a local key is not revocation. The wallet should persist a verified terminal receipt before removing private-key material, and users may then remove a revoked or expired local record from the wallet.

## Security boundary

V2 enforces cryptographic key roles, but “offline root” is an operational property. Keep the root installation out of routine proof use and network exposure where possible. A browser-held non-extractable key cannot be exported as raw bytes, but malicious code running in the wallet origin may still invoke it. Stronger root isolation requires a dedicated root-only device or build with no ordinary RP proof surface.
`;

const ownershipProofs = `# Ownership proofs

An ownership proof says: “the controller of this Nexus subject approved this exact action, on this exact resource, for this exact relying-party origin, during this short time window.”

## Proof versions

| Protocol | Signed by | Live authority required |
|---|---|---|
| \`nexus.ownership-proof.v1\` | Root key committed by the identity genesis | Active identity subject |
| \`nexus.ownership-proof.v2\` | Root-authorized device key | Active identity plus active, unexpired exact device authorization |

Use the v2 popup channel to negotiate an ordered policy. The selected \`proofProtocol\` is part of the result and must match the policy stored with the backend challenge. A device cannot emit v1, and a root cannot emit a v2 device proof without first authorizing and installing a separate device key.

## Proof request fields

| Field | Meaning | Requirement |
|---|---|---|
| \`action\` | Operation being authorized, such as \`note:edit\` | Printable, app-defined, maximum 128 characters |
| \`resource\` | Object or scope being changed, such as \`note:nt_123\` | Printable, app-defined, maximum 512 characters |
| \`nonce\` | One-time backend challenge | Unpadded base64url, 16–64 random bytes |
| \`expiresAt\` | Request expiry in Unix seconds | No more than 120 seconds in the future |
| \`contextHash\` | Hash of exact operation content | Optional 32-byte unpadded base64url value |

The request does not contain an audience. The wallet inserts the exact RP origin as \`payload.aud\`.

## V2 signed proof shape

\`\`\`json
{
  "payload": {
    "protocol": "nexus.ownership-proof.v2",
    "subject": "nx1_...",
    "genesis": { "...": "public identity genesis" },
    "deviceId": "nxd2_...",
    "authorizationId": "nxa2_...",
    "authorization": {
      "payload": {
        "protocol": "nexus.device-authorization.v2",
        "subject": "nx1_...",
        "deviceId": "nxd2_...",
        "expiresAt": 1817965000
      },
      "rootSignature": "base64url Ed25519 signature"
    },
    "aud": "https://your-app.example",
    "act": "note:edit",
    "resource": "note:nt_123",
    "nonce": "base64url challenge",
    "iat": 1786429000,
    "exp": 1786429120,
    "contextHash": "base64url SHA-256"
  },
  "deviceSignature": "base64url Ed25519 signature"
}
\`\`\`

The nested authorization is shown in abbreviated form. Production parsers require its complete strict shape, including \`genesisHash\`, device signing key, authorization nonce, \`validFrom\`, and \`activationDeadline\`.

## V2 verification order

1. Strictly parse the proof and reject unknown fields.
2. Recompute the self-certifying subject from the included genesis.
3. Recompute the genesis hash, \`nxd2_…\` device ID, and \`nxa2_…\` authorization ID.
4. Verify the root signature over the complete device authorization.
5. Enforce the authorization's validity, activation, and expiry bounds and reject root/device key reuse.
6. Verify the device signature over the proof's domain-separated canonical payload.
7. Compare audience, action, resource, nonce, time, and the exact present-or-absent context-hash expectation.
8. Load the stored challenge and reject consumed, expired, or protocol-mismatched records.
9. Check fresh authoritative identity status and exact device status for \`{ subject, deviceId, authorizationId }\`.
10. Atomically consume the challenge, then commit the application operation.

Use \`verifyRpOperationV2()\` to compose the proof, challenge, identity-lifecycle, and device-lifecycle checks. Verify the registry's signed device status statement against pinned service keys and reject it after its \`exp\`. A v1 subject-only status response is insufficient for a v2 proof.

For an explicitly negotiated v1 result, continue using \`verifyRpOperation()\` and the unchanged v1 verification rules. Do not feed a v2 proof to a v1 verifier, reinterpret a device signature as a root signature, or retry v1 after a v2 policy failure.

Do not authorize from the D1 projection, transparency log, cache, or a previously observed status response. Those surfaces are useful for discovery and audit, but the registry Durable Object is lifecycle authority.

## Context binding

For an edit or transaction, canonicalize the exact server-understood operation and hash it before issuing the challenge. A proof for one body must not authorize another body that happens to share the same action and resource labels.
`;

const identityLifecycle = `# Identity lifecycle

Nexus identities are local, independent, and disposable. A relying party should store only the subject and application data it actually needs.

## Create and register

The wallet generates a fresh non-extractable Ed25519 **root** signing key, optional X25519 agreement key, and revocation secret. The subject is derived from the unchanged v1 public genesis. The wallet then registers that subject and retains the signed registry receipt.

If registration fails after local creation, the wallet keeps the identity and offers an idempotent registration retry. It must not use the identity for proofs until registration is confirmed.

Root creation does not create a default device. The user explicitly chooses **Add device** when they are ready to generate, transfer, and activate a separate v2 signing key.

## Live status

RPs query \`POST /v1/identity/status\` before accepting any protected operation. For a v2 proof they additionally query \`POST /v2/device/status\` with the exact subject, device ID, and authorization ID. Both signed status statements must be valid, fresh, and consistent.

Lifecycle is monotonic:

\`\`\`
not found → active → revoked
\`\`\`

A revoked identity never returns to active.

## Device lifecycle

Device state is independent per \`nxd2_…\` ID, but it is always subordinate to identity state:

\`\`\`
unknown → active → revoked
             ↘ expired
\`\`\`

- Activation requires a root-signed authorization and a device-signed proof of possession.
- An active device becomes expired at \`now >= authorization.expiresAt\` even if a cached statement still says active.
- Self-revocation and root revocation affect only that device ID; sibling devices remain usable.
- If two installations copied the same transfer, they share one device ID and are revoked together.
- A terminal identity revocation makes every device ineffective, including an unknown or not-yet-activated device.

The wallet exposes manual refresh rather than a push channel. A root refresh checks all device authorizations it issued; a device refresh checks its exact installed authorization. Remote revocation becomes visible only after a poll or a failed use.

## Rotation

Default rotation creates a completely unrelated identity. This is the privacy-preserving choice and creates no public old-to-new link.

An explicit continuity link is an advanced, opt-in artifact signed by both identities. Publishing it lets observers correlate them, so show that privacy consequence before approval.

## Disposal

Root identity disposal means the subject and all of its devices are cryptographically disabled for future control:

1. Revoke it in the authoritative registry.
2. Verify the terminal registry receipt.
3. Only then remove local private-key material.

If the revocation response is lost after the registry commits it, the wallet retries the idempotent revocation and verifies a fresh receipt. Local keys are preserved until terminal revocation is proven.

Device removal follows the same receipt-first rule but does not dispose of the identity: self-revoke or root-revoke the exact device, verify the terminal device receipt, then remove its local key. A revoked or expired local identity record may be removed from the wallet afterward without changing registry history.

## RP behavior after revocation

Historical application content may remain, but every new create, edit, delete, or session-establishing proof must fail when either the identity or the exact device authorization is no longer active. Never treat possession of an old private key, authorization, proof, or status statement as evidence of current control.
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
| \`GET\` | \`/.well-known/nexus.json\` | Exact legacy v1 discovery document |
| \`GET\` | \`/.well-known/nexus-v2.json\` | V1 and v2 protocols, device registry, popup channels, JWKS, wallet, and a link to v1 discovery |
| \`GET\` | \`/.well-known/jwks.json\` | Current and retained registry receipt/status verification keys |

\`\`\`bash
curl https://nexus.rowo.link/.well-known/nexus.json
curl https://nexus.rowo.link/.well-known/nexus-v2.json
curl https://nexus.rowo.link/.well-known/jwks.json
\`\`\`

Do not extend or reinterpret the v1 discovery response. V2 metadata is intentionally published at its separate URL so existing clients see the exact document they already understand.

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

## V2 device routes

| Method | Path | Caller | Purpose |
|---|---|---|---|
| \`POST\` | \`/v2/device/activate\` | Wallet | Submit root authorization plus device proof of possession |
| \`POST\` | \`/v2/device/status\` | RP or wallet | Fetch the exact combined identity/device state and signed status statement |
| \`POST\` | \`/v2/device/status-batch\` | RP or wallet | Fetch multiple exact device tuples while preserving input order |
| \`POST\` | \`/v2/device/revoke-self\` | Device wallet | Revoke the caller's own exact authorization |
| \`POST\` | \`/v2/device/revoke-root\` | Root wallet | Permanently revoke or pre-emptively tombstone one device ID |

Activation verifies the root signature on \`nexus.device-authorization.v2\`, recomputes every identifier, verifies the device signature on \`nexus.device-activation.v2\`, and returns a service-signed receipt. Exact retries are idempotent; a conflicting authorization for the same device ID fails closed.

A status request has this public, non-secret lookup shape:

\`\`\`json
{
  "subject": "nx1_...",
  "deviceId": "nxd2_...",
  "authorizationId": "nxa2_..."
}
\`\`\`

The successful \`DeviceRegistryStatusV2\` response includes the identity state and sequence, exact device state, authorization expiry, and a short-lived \`nexus.device-status-statement.v2\`. Verify its service signature, freshness, exact tuple, and state. There is no public endpoint to enumerate all devices beneath a subject.

## V2 identifiers

| Prefix | Meaning |
|---|---|
| \`nx1_\` | Unchanged self-certifying identity subject |
| \`nxd2_\` | Device ID derived from subject and device public key |
| \`nxa2_\` | Authorization ID derived from the complete root authorization |
| \`nxo2_\` | Device operation ID |
| \`nxde2_\` | Device registry event ID |

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

V1 protocol errors remain a closed, unchanged set. V2 device responses use the additive device error schema, including \`DEVICE_NOT_FOUND\`, \`DEVICE_REVOKED\`, and \`DEVICE_AUTHORIZATION_CONFLICT\`, plus the documented transport faults. Do not make a v1 parser accept new codes by widening its schema.

## Transparency

Transparency keys are published at [status.rowo.link/.well-known/nexus-transparency-keys.json](https://status.rowo.link/.well-known/nexus-transparency-keys.json). Transparency proves append-only publication of registry event hashes; it does not replace live lifecycle authorization.
`;

const securityChecklist = `# Relying-party security checklist

Use this as a release gate for every Nexus integration.

## Challenge issuance

- Generate nonces with a CSPRNG; never use \`Math.random()\`.
- Store the nonce, action, resource, context hash, expiry, and consumed state on the backend.
- Store the ordered accepted proof protocols with the challenge; never let the browser broaden them.
- Keep proof lifetimes at or below 120 seconds.
- Bind mutable operation bodies with a canonical context hash.
- Apply a bounded outstanding-challenge quota and rate limit challenge creation.

## Wallet transport

- Use the reviewed browser SDK rather than copying popup messaging code.
- Require an exact HTTPS wallet origin in production.
- Validate popup source, origin, request ID, and message schema.
- Use \`nexus.popup.v2\` for negotiation and reject a returned \`proofProtocol\` outside the stored policy.
- Never retry through \`nexus.popup.v1\` after a v2 negotiation failure.
- Never place subjects, proofs, or scopes in URLs.
- Treat denial, close, abort, and timeout as no authorization.

## Server verification

- Parse with the matching strict \`@nexus/protocol\` schema.
- Recompute the subject from genesis.
- For v2, recompute the genesis hash, device ID, and authorization ID; verify the root authorization signature and device proof signature.
- Compare the configured canonical audience, action, resource, nonce, and time window.
- Require an exact present-or-absent v2 context-hash expectation and verify it against the operation body.
- Check authoritative live identity status and the exact device tuple; fail closed on timeout, malformed status, signature failure, or stale status.
- Treat \`now >= authorizationExpiresAt\` as expired even if an active status statement says otherwise.
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
- Reject v2 \`expired\`, wrong-device, and wrong-authorization status; subject-only status is not enough.
- Do not turn a revoked identity active again.
- Remember that revoking one device revokes all clones of that device ID but must not revoke sibling device IDs.
- Treat continuity links as optional correlation artifacts, not automatic account migration.
- Preserve historical data only under your application's explicit retention policy.

## Key and package trust

- Fetch registry/status JWKS from the discovery document and retain required historical verification keys.
- Keep transparency keys separate from registry receipt/status keys.
- Keep root keys non-extractable and out of routine use; never migrate a root by labeling it as a device.
- Treat a direct-display transfer QR as a complete bearer credential and never send it through an online QR service.
- Generate a distinct device key per intended installation when independent revocation is required.
- Pin reviewed \`@nexus/*\` releases once packages are published.
- Re-run deterministic vectors, cross-runtime tests, and two-origin browser tests after protocol or verifier upgrades.
`;

export const NEXUS_DOCS: Record<NexusDocSlug, string> = {
  introduction,
  'quick-start': quickStart,
  'wallet-flow': walletFlow,
  'root-and-device-keys': rootAndDeviceKeys,
  'ownership-proofs': ownershipProofs,
  'identity-lifecycle': identityLifecycle,
  'api-reference': apiReference,
  'security-checklist': securityChecklist,
};
