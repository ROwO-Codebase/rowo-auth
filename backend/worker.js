function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function logServerError(context, error, metadata = {}) {
  console.error(`[${context}]`, {
    message: String(error?.message || error),
    stack: error?.stack || null,
    ...metadata,
  });
}

function genericError(context, error, status = 500, message = 'Internal server error.', metadata = {}) {
  logServerError(context, error, metadata);
  return jsonResponse({ success: false, message }, status);
}

async function parseJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function queryFirst(env, sql, params = []) {
  return env.auth_database.prepare(sql).bind(...params).first();
}

async function queryAll(env, sql, params = []) {
  const result = await env.auth_database.prepare(sql).bind(...params).all();
  return result.results || [];
}

async function execRun(env, sql, params = []) {
  return env.auth_database.prepare(sql).bind(...params).run();
}

function generateVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function generateAdfsCode() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/** Legacy v1 hash: SHA-256(secret + field + ':' + value). Kept only as a comparator for lazy migration to v2. New writes should use hmacSensitive. */
async function hashSensitive(env, field, value) {
  if (value == null || String(value).trim() === '') return null;
  const secret = env.SENSITIVE_DATA_HASH_SECRET;
  if (!secret) throw new Error('SENSITIVE_DATA_HASH_SECRET is required for hashing sensitive data.');
  const payload = String(secret) + field + ':' + String(value).trim();
  return sha256Hex(payload);
}

async function hmacSha256Raw(key, message) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(message));
  return new Uint8Array(signature);
}

/** v2 hash: HMAC-SHA-256(key=SENSITIVE_DATA_HASH_SECRET, msg=field+':'+value). Returns 'v2:' + hex. Null for empty value. */
async function hmacSensitive(env, field, value) {
  if (value == null || String(value).trim() === '') return null;
  const secret = env.SENSITIVE_DATA_HASH_SECRET;
  if (!secret) throw new Error('SENSITIVE_DATA_HASH_SECRET is required for hashing sensitive data.');
  const keyBytes = new TextEncoder().encode(String(secret));
  const sig = await hmacSha256Raw(keyBytes, field + ':' + String(value).trim());
  return 'v2:' + Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Compute both v1 (legacy SHA-256) and v2 (HMAC) hashes for a value. Used at every lookup site so old and new rows can both be matched during migration. */
async function dualHashSensitive(env, field, value) {
  const v1 = await hashSensitive(env, field, value);
  const v2 = await hmacSensitive(env, field, value);
  return { v1, v2 };
}

const HASHED_ACCOUNT_COLUMNS = new Set(['email', 'student_id', 'student_name', 'discord_id', 'github_id']);

/** Replace a row's v1 hash with the v2 hash after a successful lookup matched on v1. Column is allowlist-checked to keep the dynamic identifier safe. */
async function lazyUpgradeAccountColumn(env, column, wechatId, v2Hash) {
  if (!HASHED_ACCOUNT_COLUMNS.has(column) || !v2Hash || !wechatId) return;
  try {
    await execRun(
      env,
      `UPDATE accounts SET ${column} = ? WHERE wechat_id = ? AND ${column} IS NOT NULL AND ${column} != ?`,
      [v2Hash, wechatId, v2Hash]
    );
  } catch (error) {
    logServerError('lazy_upgrade_account', error, { column, wechatId });
  }
}

/** Encode {v1, v2} as a single TEXT value for short-lived tables (adfs_verification_codes) that can't take a schema change. Format: 'v1hex|v2:hex'. Empty halves allowed. */
function encodeDualHash(hashes) {
  if (!hashes) return null;
  const v1 = hashes.v1 || '';
  const v2 = hashes.v2 || '';
  if (!v1 && !v2) return null;
  return `${v1}|${v2}`;
}

/** Decode a stored dual-hash TEXT value. Accepts legacy bare-hex (treated as v1 only) so pre-migration rows still read correctly. */
function decodeDualHash(stored) {
  if (stored == null) return { v1: null, v2: null };
  const s = String(stored);
  if (s.includes('|')) {
    const [v1Part, v2Part] = s.split('|', 2);
    return { v1: v1Part || null, v2: v2Part || null };
  }
  return { v1: s, v2: null };
}

/** Base64url encode bytes (no padding, URL-safe). Used for JWT. */
function base64UrlEncode(bytes) {
  const bin = Array.from(bytes, (b) => String.fromCodePoint(b)).join('');
  const b64 = btoa(bin);
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Base64url decode to string (for JSON payload). */
function base64UrlDecode(str) {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4;
  if (pad) b64 += '===='.slice(0, 4 - pad);
  return atob(b64);
}

/**
 * Verify JWT for ADFS create-code: must be Bearer token, HS256, valid signature, not expired.
 * Uses env.ADFS_JWT_SECRET. Returns true if valid; throws or returns false otherwise.
 */
async function verifyAdfsCreateCodeJwt(env, authHeader) {
  const secret = env.ADFS_JWT_SECRET;
  if (!secret || typeof secret !== 'string') return false;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7).trim();
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const payloadJson = base64UrlDecode(parts[1]);
    const payload = JSON.parse(payloadJson);
    if (payload.exp != null && typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) return false;
    const signingInput = `${parts[0]}.${parts[1]}`;
    const keyBytes = new TextEncoder().encode(secret);
    const sigBytes = await hmacSha256Raw(keyBytes, signingInput);
    const expectedSig = base64UrlEncode(sigBytes);
    if (parts[2] !== expectedSig) return false;
    return true;
  } catch {
    return false;
  }
}

// ----------------------------------------------------------------------------
// ROwO Account: PBKDF2 password hashing + HS256 JWTs (sessions and bind tokens).
// See plans/add-a-rowo-account-humming-anchor.md.
// ----------------------------------------------------------------------------

// Cloudflare Workers caps PBKDF2 iterations at 100_000 in Web Crypto. NIST baseline is
// 10k; OWASP 2023 guidance is 600k+. We sit at the Workers ceiling; if the limit is
// raised, bump this constant — old hashes still verify because the iteration count is
// embedded in the stored format. To strengthen further within the cap, consider WASM
// argon2/bcrypt as a follow-up.
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_SALT_BYTES = 16;
const PBKDF2_HASH_BYTES = 32;
const USER_SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const BIND_TOKEN_TTL_SECONDS = 10 * 60;
const OAUTH_CODE_TTL_SECONDS = 15 * 60;
const OAUTH_VALID_SCOPES = new Set(['basic', 'verification', 'wechat']);
const OAUTH_GATED_SCOPES = new Set(['verification', 'wechat']);
const LOGIN_ATTEMPTS_PER_MINUTE = 10;
const RESERVED_USERNAMES = new Set([
  'admin', 'root', 'system', 'api', 'support', 'security', 'rowo', 'null', 'undefined', 'me',
]);
// Placeholder hash used to keep timing flat when a username does not exist.
// Verify against this on user-miss; PBKDF2 work is identical to the real path.
// Iteration count here MUST match PBKDF2_ITERATIONS or verifyPassword will throw.
const DUMMY_PASSWORD_HASH = 'v1:pbkdf2-sha256:100000:AAAAAAAAAAAAAAAAAAAAAA==:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

function bytesToBase64(bytes) {
  const bin = Array.from(bytes, (b) => String.fromCodePoint(b)).join('');
  return btoa(bin);
}

function base64ToBytes(str) {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function randomHex(byteLength) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function pbkdf2Derive(password, salt, iterations, hashBytes) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    hashBytes * 8
  );
  return new Uint8Array(bits);
}

async function hashPassword(plain) {
  const salt = crypto.getRandomValues(new Uint8Array(PBKDF2_SALT_BYTES));
  const hash = await pbkdf2Derive(plain, salt, PBKDF2_ITERATIONS, PBKDF2_HASH_BYTES);
  return `v1:pbkdf2-sha256:${PBKDF2_ITERATIONS}:${bytesToBase64(salt)}:${bytesToBase64(hash)}`;
}

async function verifyPassword(plain, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split(':');
  if (parts.length !== 5) return false;
  const [version, alg, iterStr, saltB64, hashB64] = parts;
  if (version !== 'v1' || alg !== 'pbkdf2-sha256') return false;
  const iterations = Number(iterStr);
  if (!Number.isFinite(iterations) || iterations < 1000) return false;
  let salt, expected;
  try {
    salt = base64ToBytes(saltB64);
    expected = base64ToBytes(hashB64);
  } catch {
    return false;
  }
  if (expected.length === 0) return false;
  const derived = await pbkdf2Derive(plain, salt, iterations, expected.length);
  return timingSafeEqual(derived, expected);
}

function getRowoJwtSecret(env) {
  const secret = env.ROWO_AUTH_JWT_SECRET;
  if (!secret || typeof secret !== 'string') {
    throw new Error('ROWO_AUTH_JWT_SECRET is required for ROwO Account auth.');
  }
  return secret;
}

async function signRowoJwt(env, payload) {
  const secret = getRowoJwtSecret(env);
  const header = { alg: 'HS256', typ: 'JWT', kid: 'v1' };
  const headerB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = await hmacSha256Raw(new TextEncoder().encode(secret), signingInput);
  return `${signingInput}.${base64UrlEncode(sig)}`;
}

async function verifyRowoJwt(env, token, expectedSub) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  let header, payload;
  try {
    header = JSON.parse(base64UrlDecode(parts[0]));
    payload = JSON.parse(base64UrlDecode(parts[1]));
  } catch {
    return null;
  }
  if (!header || header.alg !== 'HS256') return null;
  const secret = getRowoJwtSecret(env);
  const signingInput = `${parts[0]}.${parts[1]}`;
  const expectedSig = base64UrlEncode(await hmacSha256Raw(new TextEncoder().encode(secret), signingInput));
  if (parts[2] !== expectedSig) return null;
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp != null && typeof payload.exp === 'number' && payload.exp < now) return null;
  if (payload.nbf != null && typeof payload.nbf === 'number' && payload.nbf > now + 5) return null;
  if (expectedSub != null && payload.sub !== expectedSub) return null;
  return payload;
}

async function issueUserSessionToken(env, userId, usernameDisplay) {
  const now = Math.floor(Date.now() / 1000);
  return signRowoJwt(env, {
    iss: 'rowo-auth',
    sub: 'session',
    uid: userId,
    u: usernameDisplay,
    iat: now,
    exp: now + USER_SESSION_TTL_SECONDS,
  });
}

async function issueBindToken(env, wechatId, method) {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + BIND_TOKEN_TTL_SECONDS;
  const token = await signRowoJwt(env, {
    iss: 'rowo-auth',
    sub: 'bind',
    wechat_id: String(wechatId),
    method: String(method || 'unknown'),
    iat: now,
    exp,
    jti: randomHex(16),
  });
  return { token, expiresAt: new Date(exp * 1000).toISOString() };
}

async function isWechatIdLinkedToRowoAccount(env, wechatId) {
  if (!wechatId) return false;
  const row = await queryFirst(
    env,
    'SELECT id FROM user_accounts WHERE wechat_id = ? LIMIT 1',
    [String(wechatId)]
  );
  return Boolean(row);
}

// Look up the existing wechat_id for a verified identity (re-verify auto-fill).
// Caller supplies the v1/v2 dual hashes (from dualHashSensitive or decodeDualHash).
async function findVerifiedWechatIdByIdentityHashes(env, columnName, hashes) {
  if (!HASHED_ACCOUNT_COLUMNS.has(columnName)) return null;
  if (!hashes) return null;
  const candidates = [hashes.v1, hashes.v2].filter((h) => h != null && h !== '');
  if (candidates.length === 0) return null;
  const placeholders = candidates.map(() => '?').join(', ');
  const row = await queryFirst(
    env,
    `SELECT wechat_id FROM accounts
       WHERE ${columnName} IN (${placeholders}) AND verified_status = 1
       LIMIT 1`,
    candidates
  );
  return row ? row.wechat_id : null;
}

async function consumeBindToken(env, token) {
  if (!env.ROWO_AUTH_JWT_SECRET) return null;
  const payload = await verifyRowoJwt(env, token, 'bind');
  if (!payload) return null;
  const wechatId = typeof payload.wechat_id === 'string' ? payload.wechat_id.trim() : '';
  if (!wechatId) return null;
  return { wechatId, method: payload.method || null };
}

async function requireUserAuth(request, env) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return { response: jsonResponse({ success: false, message: 'Unauthorized' }, 401) };
  }
  let payload;
  try {
    payload = await verifyRowoJwt(env, token, 'session');
  } catch (error) {
    logServerError('require_user_auth', error);
    return { response: jsonResponse({ success: false, message: 'Authentication unavailable.' }, 500) };
  }
  if (!payload) {
    return { response: jsonResponse({ success: false, message: 'Invalid or expired session.' }, 401) };
  }
  const user = await queryFirst(env, 'SELECT * FROM user_accounts WHERE id = ?', [payload.uid]);
  if (!user) {
    return { response: jsonResponse({ success: false, message: 'Account no longer exists.' }, 401) };
  }
  return { user };
}

function normalizeUsername(input) {
  return String(input == null ? '' : input).trim().toLowerCase().normalize('NFKC');
}

function validateUsername(displayInput) {
  const display = String(displayInput == null ? '' : displayInput).trim();
  if (!display) return { ok: false, message: 'Username is required.' };
  if (display.length > 32) return { ok: false, message: 'Username must be at most 32 characters.' };
  const normalized = normalizeUsername(display);
  if (!/^[a-z0-9_-]{3,32}$/.test(normalized)) {
    return { ok: false, message: 'Username must be 3-32 characters: lowercase letters, digits, underscore, or dash.' };
  }
  if (RESERVED_USERNAMES.has(normalized)) {
    return { ok: false, message: 'That username is reserved.' };
  }
  return { ok: true, normalized, display };
}

function validatePassword(input) {
  const pw = String(input == null ? '' : input);
  if (pw.length < 10) return { ok: false, message: 'Password must be at least 10 characters.' };
  if (pw.length > 200) return { ok: false, message: 'Password is too long.' };
  if (!/[A-Za-z]/.test(pw)) return { ok: false, message: 'Password must include at least one letter.' };
  if (!/[0-9]/.test(pw)) return { ok: false, message: 'Password must include at least one digit.' };
  return { ok: true };
}

function getClientIp(request) {
  return request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
}

async function consumeLoginRateLimit(env, bucketKey) {
  await execRun(
    env,
    `
      INSERT INTO login_rate_limits (bucket_key, attempt_count, created_at, updated_at)
      VALUES (?, 0, datetime('now'), datetime('now'))
      ON CONFLICT(bucket_key) DO NOTHING
    `,
    [bucketKey]
  );
  const updateResult = await execRun(
    env,
    `
      UPDATE login_rate_limits
      SET attempt_count = attempt_count + 1, updated_at = datetime('now')
      WHERE bucket_key = ? AND attempt_count < ?
    `,
    [bucketKey, LOGIN_ATTEMPTS_PER_MINUTE]
  );
  const changed = Number(updateResult?.meta?.changes || 0);
  if (changed === 0) {
    return { allowed: false, retryAfterSeconds: 60 - new Date().getSeconds() };
  }
  await execRun(
    env,
    `DELETE FROM login_rate_limits WHERE updated_at < ?`,
    [new Date(Date.now() - 10 * 60 * 1000).toISOString()]
  );
  return { allowed: true };
}

function publicUserShape(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username_display,
    wechat_id: user.wechat_id || null,
    created_at: user.created_at,
    last_login_at: user.last_login_at || null,
    last_wechat_change_at: user.last_wechat_change_at || null,
    password_changed_at: user.password_changed_at || null,
    role: user.role || 'user',
  };
}

function formatAmzDate(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

async function getSignatureKey(secretAccessKey, dateStamp, region, service) {
  const kDate = await hmacSha256Raw(new TextEncoder().encode(`AWS4${secretAccessKey}`), dateStamp);
  const kRegion = await hmacSha256Raw(kDate, region);
  const kService = await hmacSha256Raw(kRegion, service);
  return hmacSha256Raw(kService, 'aws4_request');
}

async function sendEmailWithSes(env, toEmail, subject, bodyText) {
  const accessKeyId = env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = env.AWS_SECRET_ACCESS_KEY;
  const region = env.AWS_REGION || 'us-east-1';
  const fromEmail = env.SES_FROM_EMAIL;
  const fromName = env.SES_FROM_NAME || 'Verification Service';

  if (!accessKeyId || !secretAccessKey || !fromEmail) {
    throw new Error('Missing SES configuration in Worker environment variables');
  }

  const endpoint = `https://email.${region}.amazonaws.com/`;
  const host = `email.${region}.amazonaws.com`;
  const service = 'ses';
  const now = new Date();
  const amzDate = formatAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);

  const payload = new URLSearchParams({
    Action: 'SendEmail',
    Version: '2010-12-01',
    'Source': `${fromName} <${fromEmail}>`,
    'Destination.ToAddresses.member.1': toEmail,
    'Message.Subject.Data': subject,
    'Message.Body.Text.Data': bodyText,
  }).toString();

  const contentType = 'application/x-www-form-urlencoded; charset=utf-8';
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'content-type;host;x-amz-date';
  const payloadHash = await sha256Hex(payload);
  const canonicalRequest = `POST\n/\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${await sha256Hex(canonicalRequest)}`;

  const signingKey = await getSignatureKey(secretAccessKey, dateStamp, region, service);
  const signatureRaw = await hmacSha256Raw(signingKey, stringToSign);
  const signature = Array.from(signatureRaw)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  const authorizationHeader = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': contentType,
      'x-amz-date': amzDate,
      'authorization': authorizationHeader,
    },
    body: payload,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`SES send failed: ${response.status} ${errText}`);
  }
}

async function sendVerificationEmailWithSes(env, toEmail, code) {
  return sendEmailWithSes(
    env,
    toEmail,
    'Your Verification Code',
    `Your verification code is: ${code}. This code expires in 10 minutes.`
  );
}

async function consumeGlobalEmailSendQuota(env) {
  const limit = Number(env.EMAIL_SENDS_PER_MINUTE || 30);
  const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 30;
  const minuteKey = new Date().toISOString().slice(0, 16);

  await execRun(
    env,
    `
      INSERT INTO email_send_rate_limits (minute_key, send_count, created_at, updated_at)
      VALUES (?, 0, datetime('now'), datetime('now'))
      ON CONFLICT(minute_key) DO NOTHING
    `,
    [minuteKey]
  );

  const updateResult = await execRun(
    env,
    `
      UPDATE email_send_rate_limits
      SET send_count = send_count + 1, updated_at = datetime('now')
      WHERE minute_key = ? AND send_count < ?
    `,
    [minuteKey, normalizedLimit]
  );

  const changed = Number(updateResult?.meta?.changes || 0);
  if (changed === 0) {
    return {
      allowed: false,
      limit: normalizedLimit,
      retryAfterSeconds: 60 - new Date().getSeconds(),
    };
  }

  await execRun(
    env,
    `
      DELETE FROM email_send_rate_limits
      WHERE minute_key < ?
    `,
    [new Date(Date.now() - 5 * 60 * 1000).toISOString().slice(0, 16)]
  );

  return { allowed: true, limit: normalizedLimit };
}

async function checkVerified(env, wechatId) {
  const account = await queryFirst(
    env,
    'SELECT verified_status FROM accounts WHERE wechat_id = ?',
    [wechatId]
  );
  return account && Number(account.verified_status) === 1;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function getEmailDomain(email) {
  const atIndex = email.lastIndexOf('@');
  if (atIndex <= 0 || atIndex === email.length - 1) {
    return '';
  }
  return email.slice(atIndex + 1);
}

async function discordApiJson(url, options, errorPrefix) {
  const response = await fetch(url, options);
  const rawBody = await response.text();

  let parsedBody;
  try {
    parsedBody = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    parsedBody = { raw: rawBody };
  }

  if (!response.ok) {
    const message = parsedBody?.error_description || parsedBody?.message || rawBody || 'Unknown error';
    throw new Error(`${errorPrefix}: ${response.status} ${message}`);
  }

  return parsedBody;
}

async function exchangeDiscordOauthCode(env, code) {
  const clientId = env.DISCORD_CLIENT_ID;
  const clientSecret = env.DISCORD_CLIENT_SECRET;
  const redirectUri = env.DISCORD_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Missing Discord OAuth configuration in environment variables');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code: String(code || ''),
    redirect_uri: redirectUri,
  }).toString();

  const tokenResult = await discordApiJson(
    'https://discord.com/api/oauth2/token',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
      },
      body,
    },
    'Discord OAuth token exchange failed'
  );

  if (!tokenResult?.access_token) {
    throw new Error('Discord OAuth token exchange returned no access_token');
  }

  return tokenResult.access_token;
}

async function fetchDiscordIdentity(accessToken) {
  return discordApiJson(
    'https://discord.com/api/users/@me',
    {
      method: 'GET',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    },
    'Discord identity lookup failed'
  );
}

async function fetchDiscordGuildMember(env, guildId, discordId) {
  const botToken = env.DISCORD_BOT_TOKEN;

  if (!botToken || !guildId) {
    throw new Error('Missing Discord bot configuration in environment variables');
  }

  return discordApiJson(
    `https://discord.com/api/guilds/${guildId}/members/${discordId}`,
    {
      method: 'GET',
      headers: {
        authorization: `Bot ${botToken}`,
      },
    },
    'Discord guild membership check failed'
  );
}

async function getTrustedDiscordServers(env) {
  return queryAll(
    env,
    `
      SELECT guild_id, role_id, invite_code
      FROM discord_trusted_servers
      WHERE is_active = 1
      ORDER BY id ASC
    `
  );
}

async function getTrustedDiscordInviteCodes(env) {
  const rows = await queryAll(
    env,
    `
      SELECT DISTINCT invite_code
      FROM discord_trusted_servers
      WHERE is_active = 1
        AND invite_code IS NOT NULL
        AND TRIM(invite_code) != ''
      ORDER BY invite_code ASC
    `
  );
  return rows.map((row) => String(row.invite_code || '').trim()).filter(Boolean);
}

function isDiscordMembershipNotFoundError(error) {
  const message = String(error?.message || '');
  return message.includes(': 404 ');
}

async function resolveTrustedDiscordMembership(env, discordId) {
  const trustedServers = await getTrustedDiscordServers(env);
  if (trustedServers.length === 0) {
    throw new Error('No active trusted Discord servers configured in database');
  }

  for (const server of trustedServers) {
    const guildId = String(server.guild_id || '').trim();
    const roleId = String(server.role_id || '').trim();
    if (!guildId || !roleId) {
      continue;
    }

    let guildMember;
    try {
      guildMember = await fetchDiscordGuildMember(env, guildId, discordId);
    } catch (error) {
      if (isDiscordMembershipNotFoundError(error)) {
        continue;
      }
      throw error;
    }

    const roles = Array.isArray(guildMember?.roles) ? guildMember.roles : [];
    if (roles.includes(roleId)) {
      return { guildId, roleId };
    }
  }

  return null;
}

async function getCachedDiscordVerification(env, plainDiscordId) {
  const { v1, v2 } = await dualHashSensitive(env, 'discord_id', plainDiscordId);
  if (!v1 && !v2) return null;

  const row = await queryFirst(
    env,
    `
      SELECT discord_id, discord_name, guild_id, role_id
      FROM discord_verified_identities
      WHERE discord_id IN (?, ?)
      LIMIT 1
    `,
    [v2, v1]
  );
  if (!row) return null;

  if (v2 && v1 && row.discord_id === v1) {
    try {
      await execRun(env, 'DELETE FROM discord_verified_identities WHERE discord_id = ?', [v1]);
      await execRun(
        env,
        `
          INSERT INTO discord_verified_identities (discord_id, discord_name, guild_id, role_id, created_at, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
          ON CONFLICT(discord_id) DO UPDATE SET
            discord_name = excluded.discord_name,
            guild_id = excluded.guild_id,
            role_id = excluded.role_id,
            updated_at = datetime('now')
        `,
        [v2, row.discord_name, row.guild_id, row.role_id]
      );
      row.discord_id = v2;
    } catch (error) {
      logServerError('discord_lazy_upgrade', error);
    }
  }
  return row;
}

async function cacheDiscordVerification(env, discordId, discordName, guildId, roleId) {
  const idHashes = await dualHashSensitive(env, 'discord_id', discordId);
  const nameV2 = await hmacSensitive(env, 'discord_name', discordName || '');
  if (!idHashes.v2) return;

  if (idHashes.v1 && idHashes.v1 !== idHashes.v2) {
    await execRun(env, 'DELETE FROM discord_verified_identities WHERE discord_id = ?', [idHashes.v1]);
  }

  await execRun(
    env,
    `
      INSERT INTO discord_verified_identities (discord_id, discord_name, guild_id, role_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(discord_id) DO UPDATE SET
        discord_name = excluded.discord_name,
        guild_id = excluded.guild_id,
        role_id = excluded.role_id,
        updated_at = datetime('now')
    `,
    [idHashes.v2, nameV2, guildId, roleId]
  );
}

async function githubApiJson(url, options, errorPrefix) {
  const response = await fetch(url, options);
  const rawBody = await response.text();

  let parsedBody;
  try {
    parsedBody = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    parsedBody = { raw: rawBody };
  }

  if (!response.ok) {
    const message = parsedBody?.error_description || parsedBody?.message || rawBody || 'Unknown error';
    throw new Error(`${errorPrefix}: ${response.status} ${message}`);
  }

  return parsedBody;
}

function buildOAuthRedirectUrl(env, provider) {
  if (provider === 'github') {
    if (!env.GITHUB_CLIENT_ID || !env.GITHUB_REDIRECT_URI) return null;
    const params = new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      redirect_uri: env.GITHUB_REDIRECT_URI,
      scope: 'user:email',
    });
    return `https://github.com/login/oauth/authorize?${params}`;
  }
  if (provider === 'discord') {
    if (!env.DISCORD_CLIENT_ID || !env.DISCORD_REDIRECT_URI) return null;
    const params = new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      redirect_uri: env.DISCORD_REDIRECT_URI,
      response_type: 'code',
      scope: 'identify',
    });
    return `https://discord.com/api/oauth2/authorize?${params}`;
  }
  if (provider === 'adfs') {
    const endpoint = String(env.ADFS_PROVIDER_ENDPOINT || '').trim();
    return endpoint || null;
  }
  return undefined;
}

async function exchangeGithubOauthCode(env, code) {
  const clientId = env.GITHUB_CLIENT_ID;
  const clientSecret = env.GITHUB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Missing GitHub OAuth configuration in environment variables');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code: String(code || ''),
  }).toString();

  const tokenResult = await githubApiJson(
    'https://github.com/login/oauth/access_token',
    {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'accept': 'application/json',
        'user-agent': 'rowo-auth',
      },
      body,
    },
    'GitHub OAuth token exchange failed'
  );

  if (tokenResult?.error) {
    throw new Error(
      `GitHub OAuth token exchange rejected: ${tokenResult.error}${
        tokenResult.error_description ? ` - ${tokenResult.error_description}` : ''
      }`
    );
  }

  if (!tokenResult?.access_token) {
    const snapshot = typeof tokenResult === 'object' && tokenResult !== null
      ? JSON.stringify(tokenResult).slice(0, 500)
      : String(tokenResult).slice(0, 500);
    throw new Error(`GitHub OAuth token exchange returned no access_token. Body: ${snapshot}`);
  }

  return tokenResult.access_token;
}

async function fetchGithubUser(accessToken) {
  return githubApiJson(
    'https://api.github.com/user',
    {
      method: 'GET',
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'rowo-auth',
        'x-github-api-version': '2022-11-28',
      },
    },
    'GitHub user lookup failed'
  );
}

async function fetchGithubUserEmails(accessToken) {
  const emails = await githubApiJson(
    'https://api.github.com/user/emails',
    {
      method: 'GET',
      headers: {
        authorization: `Bearer ${accessToken}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'rowo-auth',
        'x-github-api-version': '2022-11-28',
      },
    },
    'GitHub user emails lookup failed'
  );
  return Array.isArray(emails) ? emails : [];
}

/** Returns the allowed domain if any verified GitHub email's domain matches ALLOWED_EMAIL_DOMAIN; else null. */
async function resolveGithubAllowedDomain(env, accessToken) {
  const allowedDomain = String(env.ALLOWED_EMAIL_DOMAIN || '').trim().toLowerCase();
  if (!allowedDomain) {
    throw new Error('ALLOWED_EMAIL_DOMAIN is not configured');
  }

  const emails = await fetchGithubUserEmails(accessToken);
  for (const entry of emails) {
    if (!entry || entry.verified !== true) continue;
    const normalized = normalizeEmail(entry.email);
    if (!normalized) continue;
    const domain = getEmailDomain(normalized);
    if (domain === allowedDomain) {
      return allowedDomain;
    }
  }
  return null;
}

async function getCachedGithubVerification(env, plainGithubId) {
  const { v1, v2 } = await dualHashSensitive(env, 'github_id', plainGithubId);
  if (!v1 && !v2) return null;

  const row = await queryFirst(
    env,
    `
      SELECT github_id, github_login, matched_email_domain
      FROM github_verified_identities
      WHERE github_id IN (?, ?)
      LIMIT 1
    `,
    [v2, v1]
  );
  if (!row) return null;

  if (v2 && v1 && row.github_id === v1) {
    try {
      await execRun(env, 'DELETE FROM github_verified_identities WHERE github_id = ?', [v1]);
      await execRun(
        env,
        `
          INSERT INTO github_verified_identities (github_id, github_login, matched_email_domain, created_at, updated_at)
          VALUES (?, ?, ?, datetime('now'), datetime('now'))
          ON CONFLICT(github_id) DO UPDATE SET
            github_login = excluded.github_login,
            matched_email_domain = excluded.matched_email_domain,
            updated_at = datetime('now')
        `,
        [v2, row.github_login, row.matched_email_domain]
      );
      row.github_id = v2;
    } catch (error) {
      logServerError('github_lazy_upgrade', error);
    }
  }
  return row;
}

async function cacheGithubVerification(env, githubId, githubLogin, matchedDomain) {
  const idHashes = await dualHashSensitive(env, 'github_id', githubId);
  const loginV2 = await hmacSensitive(env, 'github_login', githubLogin || '');
  if (!idHashes.v2) return;

  if (idHashes.v1 && idHashes.v1 !== idHashes.v2) {
    await execRun(env, 'DELETE FROM github_verified_identities WHERE github_id = ?', [idHashes.v1]);
  }

  await execRun(
    env,
    `
      INSERT INTO github_verified_identities (github_id, github_login, matched_email_domain, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(github_id) DO UPDATE SET
        github_login = excluded.github_login,
        matched_email_domain = excluded.matched_email_domain,
        updated_at = datetime('now')
    `,
    [idHashes.v2, loginV2, matchedDomain]
  );
}

async function getActiveBlacklistRecord(env, wechatId) {
  return queryFirst(
    env,
    `
      SELECT wechat_id, reason, added_by, added_at
      FROM account_blacklist
      WHERE wechat_id = ? AND is_active = 1
      LIMIT 1
    `,
    [wechatId]
  );
}

function buildBlacklistPayload(blacklistRecord) {
  if (!blacklistRecord) {
    return null;
  }

  return {
    wechat_id: blacklistRecord.wechat_id,
    reason: blacklistRecord.reason,
    added_by: blacklistRecord.added_by,
    added_at: blacklistRecord.added_at,
  };
}

async function ensureNotBlacklisted(env, wechatId) {
  if (!wechatId) {
    return null;
  }

  const blacklistRecord = await getActiveBlacklistRecord(env, wechatId);
  if (!blacklistRecord) {
    return null;
  }

  return jsonResponse(
    {
      success: false,
      message: 'This account is in blacklist and cannot be verified.',
      blacklisted: true,
      blacklist: buildBlacklistPayload(blacklistRecord),
    },
    403
  );
}

async function notifyAdminsOfManualVerification(env, wechatId, reason) {
  let recipients;
  try {
    recipients = await queryAll(
      env,
      `
        SELECT notification_email
        FROM user_accounts
        WHERE manual_notification_enabled = 1
          AND notification_email IS NOT NULL
          AND TRIM(notification_email) != ''
          AND role IN ('moderator','admin','super_admin')
      `
    );
  } catch (error) {
    logServerError('notify_admin_manual_lookup', error);
    return;
  }
  if (recipients.length === 0) return;

  const subject = 'New manual verification request';
  const body =
    `A new manual verification request has been submitted.\n\n` +
    `WeChat ID: ${wechatId}\n` +
    `Reason: ${reason}\n\n` +
    `Review at: https://rowo.link/admin\n\n` +
    `You are receiving this because you subscribed to manual verification notifications. ` +
    `To unsubscribe, sign in to the admin panel and open the Settings tab.`;

  for (const row of recipients) {
    let quota;
    try {
      quota = await consumeGlobalEmailSendQuota(env);
    } catch (error) {
      logServerError('notify_admin_manual_quota', error);
      return;
    }
    if (!quota.allowed) {
      logServerError(
        'notify_admin_manual_quota_exhausted',
        new Error('Email send quota exhausted; skipping remaining notifications.'),
        { retry_after_seconds: quota.retryAfterSeconds }
      );
      return;
    }
    try {
      await sendEmailWithSes(env, row.notification_email, subject, body);
    } catch (error) {
      logServerError('notify_admin_manual_send', error);
    }
  }
}

const ROLE_RANK = { user: 0, moderator: 1, admin: 2, super_admin: 3 };

function rolesAtLeast(role, minRole) {
  return (ROLE_RANK[role] ?? -1) >= (ROLE_RANK[minRole] ?? Infinity);
}

// Shapes a user_accounts row into the `auth.admin` object the legacy admin
// endpoints expect (username, id, role, notification_email, ...). This lets
// us delete the `admins` table without rewriting every endpoint body.
function userToAdminShape(user) {
  return {
    id: user.id,
    username: user.username_display,
    role: user.role,
    notification_email: user.notification_email || null,
    manual_notification_enabled: Number(user.manual_notification_enabled || 0),
  };
}

async function requireRole(request, env, minRole) {
  const auth = await requireUserAuth(request, env);
  if (auth.response) return auth;
  if (!rolesAtLeast(auth.user.role, minRole)) {
    return { response: jsonResponse({ success: false, message: 'Forbidden' }, 403) };
  }
  return { user: auth.user, admin: userToAdminShape(auth.user) };
}

// Parses ?page=&page_size=&q= into validated values plus a ready-to-bind LIKE
// pattern. `like` is null when q is empty, so callers can skip the WHERE clause.
function parsePaginationParams(url, { defaultPageSize = 50, maxPageSize = 200 } = {}) {
  const rawPage = Number(url.searchParams.get('page'));
  const rawSize = Number(url.searchParams.get('page_size'));
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const pageSize = Number.isFinite(rawSize) && rawSize >= 1
    ? Math.min(Math.floor(rawSize), maxPageSize)
    : defaultPageSize;
  const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
  const like = q ? `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%` : null;
  return { page, pageSize, q, like };
}

function resolveAllowedOrigin(request, env) {
  const configured = String(env.CORS_ALLOW_ORIGINS || '*')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configured.length === 0 || configured.includes('*')) {
    return '*';
  }

  const requestOrigin = request.headers.get('origin') || '';
  if (requestOrigin && configured.includes(requestOrigin)) {
    return requestOrigin;
  }

  return configured[0];
}

function buildCorsHeaders(request, env) {
  const allowOrigin = resolveAllowedOrigin(request, env);
  const requestedHeaders = request.headers.get('access-control-request-headers');

  return {
    'access-control-allow-origin': allowOrigin,
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'access-control-allow-headers': requestedHeaders || 'Content-Type, Authorization',
    'access-control-max-age': '86400',
    'vary': 'Origin, Access-Control-Request-Headers',
  };
}

function withCors(response, request, env) {
  const headers = new Headers(response.headers);
  const corsHeaders = buildCorsHeaders(request, env);

  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function corsPreflightResponse(request, env) {
  const headers = new Headers(buildCorsHeaders(request, env));
  return new Response(null, { status: 204, headers });
}

// ----------------------------------------------------------------------------
// OAuth provider helpers ("Sign in with ROwO"). Authorization codes are stored
// hashed (sha256Hex) so a leaked DB doesn't yield replayable codes; client
// secrets are HMAC-hashed via hmacSensitive (v2:hex). See plans/add-a-oauth-flow-noble-turtle.md.
// ----------------------------------------------------------------------------

function parseJsonArrayField(value, field) {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) throw new Error('not an array');
    return parsed;
  } catch {
    throw new Error(`invalid ${field}`);
  }
}

function parseScopeParam(rawScope) {
  if (rawScope == null) return [];
  const tokens = String(rawScope).split(/\s+/).map((s) => s.trim()).filter(Boolean);
  return Array.from(new Set(tokens));
}

function validateRedirectUri(uri, allowedList) {
  if (!uri || typeof uri !== 'string') return false;
  if (!Array.isArray(allowedList)) return false;
  return allowedList.includes(uri);
}

function classifyScopes(requestedScopes, allowedScopes, userHasWechat) {
  const valid = [];
  const gatedLocked = [];
  const unknown = [];
  const notPermitted = [];
  const allowed = new Set(allowedScopes);
  for (const scope of requestedScopes) {
    if (!OAUTH_VALID_SCOPES.has(scope)) {
      unknown.push(scope);
      continue;
    }
    if (!allowed.has(scope)) {
      notPermitted.push(scope);
      continue;
    }
    if (OAUTH_GATED_SCOPES.has(scope) && !userHasWechat) {
      gatedLocked.push(scope);
      continue;
    }
    valid.push(scope);
  }
  return { valid, gated_locked: gatedLocked, unknown, not_permitted: notPermitted };
}

function buildOAuthRedirect(redirectUri, params) {
  const url = new URL(redirectUri);
  if (params.code) url.searchParams.set('code', params.code);
  if (params.error) url.searchParams.set('error', params.error);
  if (params.state != null && params.state !== '') url.searchParams.set('state', String(params.state));
  return url.toString();
}

function serializeDeveloperOauthClient(row) {
  if (!row) return null;
  let allowedRedirectUris = [];
  let allowedScopes = [];
  try { allowedRedirectUris = parseJsonArrayField(row.allowed_redirect_uris, 'allowed_redirect_uris'); } catch { /* keep [] */ }
  try { allowedScopes = parseJsonArrayField(row.allowed_scopes, 'allowed_scopes'); } catch { /* keep [] */ }
  return {
    client_id: row.client_id,
    display_name: row.display_name,
    icon_url: row.icon_url || null,
    allowed_domain: row.allowed_domain,
    allowed_redirect_uris: allowedRedirectUris,
    allowed_scopes: allowedScopes,
    is_active: Number(row.is_active) === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// Allowed_domain is a bare hostname (e.g. "example.com"). Redirect URIs must:
//   - parse as a URL
//   - use https:// OR http://localhost(:port) (dev exception)
//   - hostname equals allowed_domain or is a subdomain of it (https only;
//     localhost http URIs ignore this check)
function isAcceptableHostname(host) {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(host);
}

function validateDeveloperRedirectUri(uri, allowedDomain) {
  if (typeof uri !== 'string' || uri.length === 0 || uri.length > 2048) return false;
  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }
  if (parsed.username || parsed.password || parsed.hash) return false;
  const host = parsed.hostname.toLowerCase();
  if (parsed.protocol === 'http:') {
    return host === 'localhost' || host === '127.0.0.1';
  }
  if (parsed.protocol !== 'https:') return false;
  const domain = String(allowedDomain || '').toLowerCase();
  return host === domain || host.endsWith('.' + domain);
}

function validateDeveloperOauthClientInput(input) {
  const value = {};

  const displayName = typeof input?.display_name === 'string' ? input.display_name.trim() : '';
  if (!displayName) return { ok: false, message: 'display_name is required.' };
  if (displayName.length > 200) return { ok: false, message: 'display_name must be 200 characters or less.' };
  value.display_name = displayName;

  let iconUrl = null;
  if (input?.icon_url != null && String(input.icon_url).trim() !== '') {
    const raw = String(input.icon_url).trim();
    if (raw.length > 500) return { ok: false, message: 'icon_url must be 500 characters or less.' };
    let parsed;
    try { parsed = new URL(raw); } catch { return { ok: false, message: 'icon_url must be a valid URL.' }; }
    if (parsed.protocol !== 'https:') return { ok: false, message: 'icon_url must use https://.' };
    iconUrl = raw;
  }
  value.icon_url = iconUrl;

  const allowedDomain = typeof input?.allowed_domain === 'string' ? input.allowed_domain.trim().toLowerCase() : '';
  if (!allowedDomain) return { ok: false, message: 'allowed_domain is required.' };
  if (!isAcceptableHostname(allowedDomain)) {
    return { ok: false, message: 'allowed_domain must be a valid hostname (e.g. example.com).' };
  }
  value.allowed_domain = allowedDomain;

  const rawUris = input?.allowed_redirect_uris;
  if (!Array.isArray(rawUris) || rawUris.length === 0) {
    return { ok: false, message: 'allowed_redirect_uris must be a non-empty array.' };
  }
  if (rawUris.length > 10) {
    return { ok: false, message: 'allowed_redirect_uris may contain at most 10 entries.' };
  }
  const uris = [];
  for (const entry of rawUris) {
    const uri = typeof entry === 'string' ? entry.trim() : '';
    if (!validateDeveloperRedirectUri(uri, allowedDomain)) {
      return { ok: false, message: `Redirect URI "${uri}" must be https:// and match ${allowedDomain} (or http://localhost for dev).` };
    }
    if (!uris.includes(uri)) uris.push(uri);
  }
  value.allowed_redirect_uris = uris;

  const rawScopes = input?.allowed_scopes;
  if (!Array.isArray(rawScopes) || rawScopes.length === 0) {
    return { ok: false, message: 'allowed_scopes must be a non-empty array.' };
  }
  const scopes = [];
  for (const entry of rawScopes) {
    const scope = typeof entry === 'string' ? entry.trim() : '';
    if (!OAUTH_VALID_SCOPES.has(scope)) {
      return { ok: false, message: `Unknown scope "${scope}".` };
    }
    if (!scopes.includes(scope)) scopes.push(scope);
  }
  if (!scopes.includes('basic')) scopes.unshift('basic');
  value.allowed_scopes = scopes;

  return { ok: true, value };
}

async function handleRequest(request, env, ctx) {

    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method.toUpperCase();

    if (method === 'GET' && pathname === '/api/verify/discord/trusted-invites') {
      const invites = await getTrustedDiscordInviteCodes(env);
      return jsonResponse({ success: true, invites });
    }

    const oauthRedirectMatch = pathname.match(/^\/api\/oauth\/redirect\/([^/]+)$/);
    if (method === 'GET' && oauthRedirectMatch) {
      const provider = decodeURIComponent(oauthRedirectMatch[1]).toLowerCase();
      const target = buildOAuthRedirectUrl(env, provider);
      if (target === undefined) {
        return jsonResponse({ success: false, message: 'Unknown OAuth provider.' }, 404);
      }
      if (target === null) {
        return jsonResponse({ success: false, message: `${provider} OAuth is not configured.` }, 500);
      }
      return Response.redirect(target, 302);
    }

    const verifyMatch = pathname.match(/^\/api\/verify\/([^/]+)$/);
    if (method === 'GET' && verifyMatch) {
      const wechatId = decodeURIComponent(verifyMatch[1]);
      await execRun(env, "UPDATE stats SET value = value + 1 WHERE key = 'account_queries'");
      const account = await queryFirst(env, 'SELECT wechat_id, verified_status, verification_method, verification_time, reverified_at, manual_status, manual_reason, manual_admin, manual_time, email, student_id, student_name, discord_id, github_id FROM accounts WHERE wechat_id = ?', [wechatId]);
      const blacklistRecord = await getActiveBlacklistRecord(env, wechatId);
      const blacklist = buildBlacklistPayload(blacklistRecord);

      if (blacklist) {
        return jsonResponse({
          success: false,
          message: 'Account is in blacklist.',
          blacklisted: true,
          blacklist,
        });
      }

      if (account) {
        const hashedCols = ['email', 'student_id', 'student_name', 'discord_id', 'github_id'];
        let anyHashed = false;
        let anyLegacy = false;
        for (const col of hashedCols) {
          const val = account[col];
          if (val != null) {
            anyHashed = true;
            if (!String(val).startsWith('v2:')) anyLegacy = true;
          }
          delete account[col];
        }
        account.hash_version = anyHashed ? (anyLegacy ? 'sha256' : 'hmac-sha256') : null;

        if(account['verification_method'] != "Manual") {
          delete account['manual_status'];
          delete account['manual_reason'];
          delete account['manual_admin'];
          delete account['manual_time'];
        }
        const info = await queryAll(
          env,
          'SELECT * FROM account_info WHERE wechat_id = ? AND visibility = ? ORDER BY created_at DESC',
          [wechatId, 'public']
        );
        return jsonResponse({ success: true, account, info });
      }

      return jsonResponse({ success: false, message: 'Account not found or not verified.' });
    }

    if (method === 'POST' && pathname === '/api/adfs/create-code') {
      const adfsProviderEndpoint = String(env.ADFS_PROVIDER_ENDPOINT || '').trim();
      if (!adfsProviderEndpoint) {
        return jsonResponse({ success: false, message: 'ADFS provider is not configured.' }, 500);
      }
      const authHeader = request.headers.get('authorization') || '';
      const jwtValid = await verifyAdfsCreateCodeJwt(env, authHeader);
      if (!jwtValid) {
        return jsonResponse({ success: false, message: 'Request must be made from ADFS.' }, 401);
      }
      const body = await parseJson(request);
      const student_id = body.student_id != null ? String(body.student_id).trim() : '';
      const student_name = body.student_name != null ? String(body.student_name).trim() : null;
      const email = body.email != null ? String(body.email).trim() : null;

      if (!student_id) {
        return jsonResponse({ success: false, message: 'student_id is required.' }, 400);
      }

      let studentIdDual, studentNameDual, emailDual;
      try {
        studentIdDual = encodeDualHash(await dualHashSensitive(env, 'student_id', student_id));
        studentNameDual = encodeDualHash(await dualHashSensitive(env, 'student_name', student_name || ''));
        emailDual = encodeDualHash(await dualHashSensitive(env, 'email', email ? normalizeEmail(email) : ''));
      } catch (error) {
        return genericError('adfs_create_code_hash', error, 500, 'Server configuration error.');
      }

      const code = generateAdfsCode();
      const codeHash = await sha256Hex(code);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      await execRun(
        env,
        `
          INSERT INTO adfs_verification_codes (code_hash, student_id, student_name, email, expires_at, created_at)
          VALUES (?, ?, ?, ?, ?, datetime('now'))
        `,
        [codeHash, studentIdDual, studentNameDual, emailDual, expiresAt]
      );

      return jsonResponse({ success: true, code });
    }

    if (method === 'POST' && pathname === '/api/verify/adfs/preview') {
      const body = await parseJson(request);
      const { code } = body;
      if (!code) {
        return jsonResponse({ success: false, message: 'code is required.' }, 400);
      }
      const codeHash = await sha256Hex(String(code));
      const row = await queryFirst(
        env,
        'SELECT student_id, expires_at FROM adfs_verification_codes WHERE code_hash = ?',
        [codeHash]
      );
      if (!row) {
        return jsonResponse({ success: true, existing_wechat_id: null, code_valid: false });
      }
      if (new Date(row.expires_at) < new Date()) {
        return jsonResponse({ success: true, existing_wechat_id: null, code_valid: false });
      }
      const studentIdHashes = decodeDualHash(row.student_id);
      const existingWechatId = await findVerifiedWechatIdByIdentityHashes(env, 'student_id', studentIdHashes);
      return jsonResponse({
        success: true,
        code_valid: true,
        existing_wechat_id: existingWechatId,
      });
    }

    if (method === 'POST' && pathname === '/api/verify/adfs') {
      const body = await parseJson(request);
      const { wechat_id, code } = body;

      if (!wechat_id) {
        return jsonResponse({ success: false, message: 'wechat_id is required.' }, 400);
      }

      const blacklistResponse = await ensureNotBlacklisted(env, wechat_id);
      if (blacklistResponse) {
        return blacklistResponse;
      }

      let studentIdHashes, studentNameHashes, emailHashes;

      if (code) {
        const codeHash = await sha256Hex(String(code));
        const row = await queryFirst(
          env,
          `SELECT student_id, student_name, email, expires_at FROM adfs_verification_codes WHERE code_hash = ?`,
          [codeHash]
        );
        if (!row) {
          return jsonResponse({ success: false, message: 'ADFS Verfication Failed, please try again or contact support.' }, 400);
        }
        if (new Date(row.expires_at) < new Date()) {
          await execRun(env, 'DELETE FROM adfs_verification_codes WHERE code_hash = ?', [codeHash]);
          return jsonResponse({ success: false, message: 'ADFS Verification has expired, please try again or contact support.' }, 400);
        }
        studentIdHashes = decodeDualHash(row.student_id);
        studentNameHashes = decodeDualHash(row.student_name);
        emailHashes = decodeDualHash(row.email);
        await execRun(env, 'DELETE FROM adfs_verification_codes WHERE code_hash = ?', [codeHash]);
      } else {
        return jsonResponse({ success: false, message: 'code is required.' }, 400);
      }

      const existingAccount = await queryFirst(
        env,
        'SELECT verified_status, verification_method FROM accounts WHERE wechat_id = ?',
        [wechat_id]
      );
      if (existingAccount && Number(existingAccount.verified_status) === 1) {
        const method = String(existingAccount.verification_method || '');
        if (method === 'Manual' || method === 'Batch') {
          return jsonResponse({ success: false, message: 'Account is already verified. Reverification is not available for this account.' }, 400);
        }
        if (method === 'ADFS') {
          const reverifyStudentIdConflict = studentIdHashes.v2
            ? await queryFirst(env, 'SELECT wechat_id, student_id FROM accounts WHERE wechat_id != ? AND student_id IN (?, ?) LIMIT 1', [wechat_id, studentIdHashes.v1, studentIdHashes.v2])
            : null;
          if (reverifyStudentIdConflict) {
            if (reverifyStudentIdConflict.student_id === studentIdHashes.v1) {
              await lazyUpgradeAccountColumn(env, 'student_id', reverifyStudentIdConflict.wechat_id, studentIdHashes.v2);
            }
            return jsonResponse({ success: false, message: 'This student ID is already linked to another account.' }, 400);
          }
          const reverifyStudentNameConflict = studentNameHashes.v2
            ? await queryFirst(env, 'SELECT wechat_id, student_name FROM accounts WHERE wechat_id != ? AND student_name IN (?, ?) LIMIT 1', [wechat_id, studentNameHashes.v1, studentNameHashes.v2])
            : null;
          if (reverifyStudentNameConflict) {
            if (reverifyStudentNameConflict.student_name === studentNameHashes.v1) {
              await lazyUpgradeAccountColumn(env, 'student_name', reverifyStudentNameConflict.wechat_id, studentNameHashes.v2);
            }
            return jsonResponse({ success: false, message: 'This name is already linked to another account.' }, 400);
          }
          const reverifyEmailConflict = emailHashes.v2
            ? await queryFirst(env, 'SELECT wechat_id, email FROM accounts WHERE wechat_id != ? AND email IN (?, ?) LIMIT 1', [wechat_id, emailHashes.v1, emailHashes.v2])
            : null;
          if (reverifyEmailConflict) {
            if (reverifyEmailConflict.email === emailHashes.v1) {
              await lazyUpgradeAccountColumn(env, 'email', reverifyEmailConflict.wechat_id, emailHashes.v2);
            }
            return jsonResponse({ success: false, message: 'This email is already linked to another account.' }, 400);
          }
          await execRun(
            env,
            "UPDATE accounts SET reverified_at = datetime('now'), student_id = ?, student_name = ?, email = ? WHERE wechat_id = ?",
            [studentIdHashes.v2, studentNameHashes.v2, emailHashes.v2, wechat_id]
          );
          const bind = await issueBindToken(env, wechat_id, 'ADFS');
          const alreadyLinkedToRowo = await isWechatIdLinkedToRowoAccount(env, wechat_id);
          const reverifiedAt = new Date().toISOString();
          await execRun(
            env,
            `
              INSERT INTO account_info (wechat_id, color, icon, title, body, creator, visibility)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            [wechat_id, 'emerald', 'refresh', 'Account reverified', `Account reverified at ${reverifiedAt}.`, 'SYSTEM', 'private']
          );
          return jsonResponse({
            success: true,
            message: 'Account reverified successfully.',
            reverified: true,
            wechat_id,
            bind_token: bind.token,
            bind_token_expires_at: bind.expiresAt,
            already_linked_to_rowo: alreadyLinkedToRowo,
          });
        }
        return jsonResponse({ success: false, message: 'Account is already verified.' }, 400);
      }

      const existingByStudentId = studentIdHashes.v2
        ? await queryFirst(env, 'SELECT wechat_id, student_id FROM accounts WHERE wechat_id != ? AND student_id IN (?, ?) LIMIT 1', [wechat_id, studentIdHashes.v1, studentIdHashes.v2])
        : null;
      if (existingByStudentId) {
        if (existingByStudentId.student_id === studentIdHashes.v1) {
          await lazyUpgradeAccountColumn(env, 'student_id', existingByStudentId.wechat_id, studentIdHashes.v2);
        }
        return jsonResponse({ success: false, message: 'This student ID is already linked to another account.' }, 400);
      }
      const existingByStudentName = studentNameHashes.v2
        ? await queryFirst(env, 'SELECT wechat_id, student_name FROM accounts WHERE wechat_id != ? AND student_name IN (?, ?) LIMIT 1', [wechat_id, studentNameHashes.v1, studentNameHashes.v2])
        : null;
      if (existingByStudentName) {
        if (existingByStudentName.student_name === studentNameHashes.v1) {
          await lazyUpgradeAccountColumn(env, 'student_name', existingByStudentName.wechat_id, studentNameHashes.v2);
        }
        return jsonResponse({ success: false, message: 'This name is already linked to another account.' }, 400);
      }
      const existingByEmail = emailHashes.v2
        ? await queryFirst(env, 'SELECT wechat_id, email FROM accounts WHERE wechat_id != ? AND email IN (?, ?) LIMIT 1', [wechat_id, emailHashes.v1, emailHashes.v2])
        : null;
      if (existingByEmail) {
        if (existingByEmail.email === emailHashes.v1) {
          await lazyUpgradeAccountColumn(env, 'email', existingByEmail.wechat_id, emailHashes.v2);
        }
        return jsonResponse({ success: false, message: 'This email is already linked to another account.' }, 400);
      }

      await execRun(
        env,
        `
          INSERT INTO accounts (wechat_id, verified_status, verification_method, verification_time, student_id, student_name, email)
          VALUES (?, 1, 'ADFS', datetime('now'), ?, ?, ?)
          ON CONFLICT(wechat_id) DO UPDATE SET
            verified_status = 1,
            verification_method = 'ADFS',
            verification_time = datetime('now'),
            student_id = excluded.student_id,
            student_name = excluded.student_name,
            email = excluded.email
        `,
        [wechat_id, studentIdHashes.v2, studentNameHashes.v2, emailHashes.v2]
      );

      const bind = await issueBindToken(env, wechat_id, 'ADFS');
      const alreadyLinkedToRowo = await isWechatIdLinkedToRowoAccount(env, wechat_id);
      return jsonResponse({
        success: true,
        message: 'Verified successfully via ADFS.',
        wechat_id,
        bind_token: bind.token,
        bind_token_expires_at: bind.expiresAt,
        already_linked_to_rowo: alreadyLinkedToRowo,
      });
    }

    if (method === 'POST' && pathname === '/api/verify/email') {
      const body = await parseJson(request);
      const { wechat_id, email, code } = body;
      const normalizedEmail = normalizeEmail(email);
      const allowedEmailDomain = String(env.ALLOWED_EMAIL_DOMAIN || '').trim().toLowerCase();

      if (!wechat_id || !normalizedEmail) {
        return jsonResponse({ success: false, message: 'wechat_id and email are required.' }, 400);
      }

      const blacklistResponse = await ensureNotBlacklisted(env, wechat_id);
      if (blacklistResponse) {
        return blacklistResponse;
      }

      if (allowedEmailDomain) {
        const incomingDomain = getEmailDomain(normalizedEmail);
        if (incomingDomain !== allowedEmailDomain) {
          return jsonResponse(
            {
              success: false,
              message: `Email must use the allowed domain: ${allowedEmailDomain}`,
            },
            400
          );
        }
      }

      if (!code) {
        if (await checkVerified(env, wechat_id)) {
          return jsonResponse({ success: false, message: 'Account is already verified.' }, 400);
        }
        let emailHashes;
        try {
          emailHashes = await dualHashSensitive(env, 'email', normalizedEmail);
        } catch (error) {
          return genericError('verify_email_hash', error, 500, 'Server configuration error.');
        }
        const emailUsedByOtherWechat = await queryFirst(
          env,
          `
            SELECT wechat_id, email
            FROM accounts
            WHERE email IN (?, ?)
              AND verification_method = 'Email'
              AND wechat_id <> ?
            LIMIT 1
          `,
          [emailHashes.v1, emailHashes.v2, wechat_id]
        );

        if (emailUsedByOtherWechat) {
          if (emailUsedByOtherWechat.email === emailHashes.v1) {
            await lazyUpgradeAccountColumn(env, 'email', emailUsedByOtherWechat.wechat_id, emailHashes.v2);
          }
          return jsonResponse(
            {
              success: false,
              message: 'This email has already been used to verify another WeChat ID.',
            },
            409
          );
        }

        const recentSend = await queryFirst(
          env,
          `
            SELECT wechat_id, email
            FROM email_verification_codes
            WHERE (
              email = ?
              OR wechat_id = ?
            )
              AND datetime(expires_at, '-10 minutes') > datetime('now', '-1 minute')
            LIMIT 1
          `,
          [normalizedEmail, wechat_id]
        );

        if (recentSend) {
          return jsonResponse(
            {
              success: false,
              message: 'Please wait at least 1 minute before requesting another verification email.',
            },
            429
          );
        }

        const quota = await consumeGlobalEmailSendQuota(env);
        if (!quota.allowed) {
          return jsonResponse(
            {
              success: false,
              message: `Email send rate limit reached. Max ${quota.limit} verification emails per minute globally.`,
            },
            429
          );
        }

        const newCode = generateVerificationCode();
        const codeHash = await sha256Hex(newCode);

        await execRun(
          env,
          `
            INSERT INTO email_verification_codes (wechat_id, email, code_hash, expires_at, attempts, updated_at)
            VALUES (?, ?, ?, datetime('now', '+10 minutes'), 0, datetime('now'))
            ON CONFLICT(wechat_id, email) DO UPDATE SET
              code_hash = excluded.code_hash,
              expires_at = datetime('now', '+10 minutes'),
              attempts = 0,
              updated_at = datetime('now')
          `,
          [wechat_id, normalizedEmail, codeHash]
        );

        try {
          await sendVerificationEmailWithSes(env, normalizedEmail, newCode);
        } catch (error) {
          return genericError('verify_email_send', error, 500, 'Failed to send verification email.');
        }

        return jsonResponse({
          success: true,
          message: 'Verification code sent to email.',
        });
      }

      const verification = await queryFirst(
        env,
        `
          SELECT code_hash, expires_at, attempts
          FROM email_verification_codes
          WHERE wechat_id = ? AND email = ?
        `,
        [wechat_id, normalizedEmail]
      );

      if (!verification) {
        return jsonResponse({ success: false, message: 'No verification code found. Please request a new code.' }, 400);
      }

      if (Number(verification.attempts || 0) >= 5) {
        return jsonResponse({ success: false, message: 'Too many failed attempts. Please request a new code.' }, 429);
      }

      const expiryMs = Date.parse(String(verification.expires_at));
      if (!Number.isNaN(expiryMs) && Date.now() > expiryMs) {
        return jsonResponse({ success: false, message: 'Verification code expired. Please request a new code.' }, 400);
      }

      const incomingCodeHash = await sha256Hex(String(code));
      if (incomingCodeHash !== verification.code_hash) {
        await execRun(
          env,
          `
            UPDATE email_verification_codes
            SET attempts = COALESCE(attempts, 0) + 1, updated_at = datetime('now')
            WHERE wechat_id = ? AND email = ?
          `,
          [wechat_id, normalizedEmail]
        );
        return jsonResponse({ success: false, message: 'Invalid verification code.' }, 400);
      }

      const existingAccountEmail = await queryFirst(
        env,
        'SELECT verified_status, verification_method FROM accounts WHERE wechat_id = ?',
        [wechat_id]
      );
      if (existingAccountEmail && Number(existingAccountEmail.verified_status) === 1) {
        const method = String(existingAccountEmail.verification_method || '');
        if (method === 'Manual' || method === 'Batch') {
          return jsonResponse({ success: false, message: 'Account is already verified. Reverification is not available for this account.' }, 400);
        }
        if (method === 'Email') {
          const reverifyEmailDual = await dualHashSensitive(env, 'email', normalizedEmail);
          const reverifyEmailConflict = reverifyEmailDual.v2
            ? await queryFirst(env, 'SELECT wechat_id, email FROM accounts WHERE wechat_id != ? AND email IN (?, ?) LIMIT 1', [wechat_id, reverifyEmailDual.v1, reverifyEmailDual.v2])
            : null;
          if (reverifyEmailConflict) {
            if (reverifyEmailConflict.email === reverifyEmailDual.v1) {
              await lazyUpgradeAccountColumn(env, 'email', reverifyEmailConflict.wechat_id, reverifyEmailDual.v2);
            }
            await execRun(env, 'DELETE FROM email_verification_codes WHERE wechat_id = ? AND email = ?', [wechat_id, normalizedEmail]);
            return jsonResponse({ success: false, message: 'This email is already linked to another account.' }, 409);
          }
          await execRun(
            env,
            "UPDATE accounts SET reverified_at = datetime('now'), email = ? WHERE wechat_id = ?",
            [reverifyEmailDual.v2, wechat_id]
          );
          const bind = await issueBindToken(env, wechat_id, 'Email');
          const alreadyLinkedToRowo = await isWechatIdLinkedToRowoAccount(env, wechat_id);
          const reverifiedAt = new Date().toISOString();
          await execRun(
            env,
            `
              INSERT INTO account_info (wechat_id, color, icon, title, body, creator, visibility)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            [wechat_id, 'emerald', 'refresh', 'Account reverified', `Account reverified at ${reverifiedAt}.`, 'SYSTEM', 'private']
          );
          await execRun(env, 'DELETE FROM email_verification_codes WHERE wechat_id = ? AND email = ?', [wechat_id, normalizedEmail]);
          return jsonResponse({
            success: true,
            message: 'Account reverified successfully.',
            reverified: true,
            wechat_id,
            bind_token: bind.token,
            bind_token_expires_at: bind.expiresAt,
            already_linked_to_rowo: alreadyLinkedToRowo,
          });
        }
        return jsonResponse({ success: false, message: 'Account is already verified.' }, 400);
      }

      let emailHashForStorage;
      try {
        emailHashForStorage = await hmacSensitive(env, 'email', normalizedEmail);
      } catch (error) {
        return genericError('verify_email_store_hash', error, 500, 'Server configuration error.');
      }
      await execRun(
        env,
        `
          INSERT INTO accounts (wechat_id, verified_status, verification_method, verification_time, email)
          VALUES (?, 1, 'Email', datetime('now'), ?)
          ON CONFLICT(wechat_id) DO UPDATE SET
            verified_status = 1,
            verification_method = 'Email',
            verification_time = datetime('now'),
            email = excluded.email
        `,
        [wechat_id, emailHashForStorage]
      );

      await execRun(
        env,
        'DELETE FROM email_verification_codes WHERE wechat_id = ? AND email = ?',
        [wechat_id, normalizedEmail]
      );

      const bind = await issueBindToken(env, wechat_id, 'Email');
      const alreadyLinkedToRowo = await isWechatIdLinkedToRowoAccount(env, wechat_id);
      return jsonResponse({
        success: true,
        message: 'Verified successfully via Email.',
        wechat_id,
        bind_token: bind.token,
        bind_token_expires_at: bind.expiresAt,
        already_linked_to_rowo: alreadyLinkedToRowo,
      });
    }

    if (method === 'POST' && pathname === '/api/verify/discord/callback') {
      const body = await parseJson(request);
      const { code } = body;

      if (!code) {
        return jsonResponse({ success: false, message: 'code is required.' }, 400);
      }

      let discordIdentity;
      try {
        const accessToken = await exchangeDiscordOauthCode(env, code);
        discordIdentity = await fetchDiscordIdentity(accessToken);
      } catch (error) {
        return genericError('discord_oauth_callback', error, 400, 'Failed to validate Discord OAuth code.');
      }

      const discordId = String(discordIdentity?.id || '').trim();
      const discordName = String(
        discordIdentity?.global_name || discordIdentity?.username || discordIdentity?.id || ''
      ).trim();
      const userAvatar = String(discordIdentity?.avatar || '').trim();

      if (!discordId) {
        return jsonResponse({ success: false, message: 'Discord identity not found.' }, 400);
      }

      let existingWechatIdForDiscord = null;
      try {
        const discordHashesForLookup = await dualHashSensitive(env, 'discord_id', discordId);
        existingWechatIdForDiscord = await findVerifiedWechatIdByIdentityHashes(env, 'discord_id', discordHashesForLookup);
      } catch (error) {
        logServerError('discord_existing_wechat_lookup', error);
      }

      let cachedVerification;
      try {
        cachedVerification = await getCachedDiscordVerification(env, discordId);
      } catch (error) {
        return genericError('discord_cache_lookup', error, 500, 'Server configuration error.');
      }
      if (cachedVerification) {
        return jsonResponse({
          success: true,
          discord_id: discordId,
          discord_name: discordName,
          avatar: userAvatar,
          cached: true,
          existing_wechat_id: existingWechatIdForDiscord,
        });
      }

      let trustedMembership;
      try {
        trustedMembership = await resolveTrustedDiscordMembership(env, discordId);
      } catch (error) {
        return genericError('discord_membership_check', error, 500, 'Failed to validate Discord server membership.');
      }

      if (!trustedMembership) {
        return jsonResponse(
          {
            success: false,
            message: 'Discord user is not in a trusted server with the required role.',
          },
          403
        );
      }

      try {
        await cacheDiscordVerification(
          env,
          discordId,
          discordName,
          trustedMembership.guildId,
          trustedMembership.roleId
        );
      } catch (error) {
        return genericError('discord_cache_store', error, 500, 'Server configuration error.');
      }

      return jsonResponse({
        success: true,
        discord_id: discordId,
        discord_name: discordName,
        avatar: userAvatar,
        cached: false,
        existing_wechat_id: existingWechatIdForDiscord,
      });
    }

    if (method === 'POST' && pathname === '/api/verify/discord/connect') {
      const body = await parseJson(request);
      const { wechat_id, discord_id } = body;

      if (!wechat_id || !discord_id) {
        return jsonResponse({ success: false, message: 'wechat_id and discord_id are required.' }, 400);
      }

      const blacklistResponse = await ensureNotBlacklisted(env, wechat_id);
      if (blacklistResponse) {
        return blacklistResponse;
      }

      let verifiedDiscord;
      let discordIdHashes;
      try {
        verifiedDiscord = await getCachedDiscordVerification(env, String(discord_id));
        discordIdHashes = await dualHashSensitive(env, 'discord_id', String(discord_id));
      } catch (error) {
        return genericError('discord_connect_cache_lookup', error, 500, 'Server configuration error.');
      }
      if (!verifiedDiscord) {
        return jsonResponse(
          {
            success: false,
            message: 'discord_id is not verified. Complete Discord verification first.',
          },
          400
        );
      }

      const connectedElsewhere = await queryFirst(
        env,
        `
          SELECT wechat_id, discord_id
          FROM accounts
          WHERE discord_id IN (?, ?) AND wechat_id <> ? AND verified_status = 1
          LIMIT 1
        `,
        [discordIdHashes.v1, discordIdHashes.v2, wechat_id]
      );

      if (connectedElsewhere) {
        if (connectedElsewhere.discord_id === discordIdHashes.v1) {
          await lazyUpgradeAccountColumn(env, 'discord_id', connectedElsewhere.wechat_id, discordIdHashes.v2);
        }
        return jsonResponse(
          {
            success: false,
            message: 'This Discord account is already connected to another WeChat ID.',
          },
          409
        );
      }

      const existingAccountDiscord = await queryFirst(
        env,
        'SELECT verified_status, verification_method FROM accounts WHERE wechat_id = ?',
        [wechat_id]
      );

      if (existingAccountDiscord && Number(existingAccountDiscord.verified_status) === 1) {
        const method = String(existingAccountDiscord.verification_method || '');
        if (method === 'Manual' || method === 'Batch') {
          return jsonResponse({ success: false, message: 'Account is already verified. Reverification is not available for this account.' }, 400);
        }
        if (method === 'Discord') {
          const reverifyDiscordConflict = discordIdHashes.v2
            ? await queryFirst(env, 'SELECT wechat_id, discord_id FROM accounts WHERE wechat_id != ? AND discord_id IN (?, ?) AND verified_status = 1 LIMIT 1', [wechat_id, discordIdHashes.v1, discordIdHashes.v2])
            : null;
          if (reverifyDiscordConflict) {
            if (reverifyDiscordConflict.discord_id === discordIdHashes.v1) {
              await lazyUpgradeAccountColumn(env, 'discord_id', reverifyDiscordConflict.wechat_id, discordIdHashes.v2);
            }
            return jsonResponse({ success: false, message: 'This Discord account is already connected to another WeChat ID.' }, 409);
          }
          await execRun(
            env,
            "UPDATE accounts SET reverified_at = datetime('now'), discord_id = ? WHERE wechat_id = ?",
            [discordIdHashes.v2, wechat_id]
          );
          const bind = await issueBindToken(env, wechat_id, 'Discord');
          const alreadyLinkedToRowo = await isWechatIdLinkedToRowoAccount(env, wechat_id);
          const reverifiedAt = new Date().toISOString();
          await execRun(
            env,
            `
              INSERT INTO account_info (wechat_id, color, icon, title, body, creator, visibility)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            [wechat_id, 'blue', 'refresh', 'Account reverified', `Account reverified at ${reverifiedAt}.`, 'SYSTEM', 'private']
          );
          return jsonResponse({
            success: true,
            message: 'Account reverified successfully.',
            reverified: true,
            wechat_id,
            bind_token: bind.token,
            bind_token_expires_at: bind.expiresAt,
            already_linked_to_rowo: alreadyLinkedToRowo,
          });
        }
        return jsonResponse({ success: false, message: 'Account is already verified.' }, 400);
      }

      await execRun(
        env,
        `
          INSERT INTO accounts (wechat_id, verified_status, verification_method, verification_time, discord_id)
          VALUES (?, 1, 'Discord', datetime('now'), ?)
          ON CONFLICT(wechat_id) DO UPDATE SET
            verified_status = 1,
            verification_method = 'Discord',
            verification_time = datetime('now'),
            discord_id = excluded.discord_id
        `,
        [wechat_id, discordIdHashes.v2]
      );

      const bind = await issueBindToken(env, wechat_id, 'Discord');
      const alreadyLinkedToRowo = await isWechatIdLinkedToRowoAccount(env, wechat_id);
      return jsonResponse({
        success: true,
        message: 'Discord account connected and WeChat ID verified.',
        discord_id: body.discord_id,
        wechat_id,
        bind_token: bind.token,
        bind_token_expires_at: bind.expiresAt,
        already_linked_to_rowo: alreadyLinkedToRowo,
      });
    }

    if (method === 'POST' && pathname === '/api/verify/github/callback') {
      const body = await parseJson(request);
      const { code } = body;

      if (!code) {
        return jsonResponse({ success: false, message: 'code is required.' }, 400);
      }

      const allowedDomain = String(env.ALLOWED_EMAIL_DOMAIN || '').trim().toLowerCase();
      if (!allowedDomain) {
        return jsonResponse({ success: false, message: 'Allowed email domain is not configured.' }, 500);
      }

      let githubUser;
      let accessToken;
      try {
        accessToken = await exchangeGithubOauthCode(env, code);
        githubUser = await fetchGithubUser(accessToken);
      } catch (error) {
        return genericError('github_oauth_callback', error, 400, 'Failed to validate GitHub OAuth code.');
      }

      const githubId = String(githubUser?.id || '').trim();
      const githubLogin = String(githubUser?.login || githubUser?.id || '').trim();
      const userAvatar = String(githubUser?.avatar_url || '').trim();

      if (!githubId) {
        return jsonResponse({ success: false, message: 'GitHub identity not found.' }, 400);
      }

      let existingWechatIdForGithub = null;
      try {
        const githubHashesForLookup = await dualHashSensitive(env, 'github_id', githubId);
        existingWechatIdForGithub = await findVerifiedWechatIdByIdentityHashes(env, 'github_id', githubHashesForLookup);
      } catch (error) {
        logServerError('github_existing_wechat_lookup', error);
      }

      let cachedVerification;
      try {
        cachedVerification = await getCachedGithubVerification(env, githubId);
      } catch (error) {
        return genericError('github_cache_lookup', error, 500, 'Server configuration error.');
      }
      if (cachedVerification) {
        return jsonResponse({
          success: true,
          github_id: githubId,
          github_login: githubLogin,
          avatar: userAvatar,
          matched_email_domain: cachedVerification.matched_email_domain,
          cached: true,
          existing_wechat_id: existingWechatIdForGithub,
        });
      }

      let matchedDomain;
      try {
        matchedDomain = await resolveGithubAllowedDomain(env, accessToken);
      } catch (error) {
        return genericError('github_email_check', error, 500, 'Failed to validate GitHub email domain.');
      }

      if (!matchedDomain) {
        return jsonResponse(
          {
            success: false,
            message: `No verified GitHub email found in allowed domain: ${allowedDomain}`,
          },
          403
        );
      }

      try {
        await cacheGithubVerification(env, githubId, githubLogin, matchedDomain);
      } catch (error) {
        return genericError('github_cache_store', error, 500, 'Server configuration error.');
      }

      return jsonResponse({
        success: true,
        github_id: githubId,
        github_login: githubLogin,
        avatar: userAvatar,
        matched_email_domain: matchedDomain,
        cached: false,
        existing_wechat_id: existingWechatIdForGithub,
      });
    }

    if (method === 'POST' && pathname === '/api/verify/github/connect') {
      const body = await parseJson(request);
      const { wechat_id, github_id } = body;

      if (!wechat_id || !github_id) {
        return jsonResponse({ success: false, message: 'wechat_id and github_id are required.' }, 400);
      }

      const blacklistResponse = await ensureNotBlacklisted(env, wechat_id);
      if (blacklistResponse) {
        return blacklistResponse;
      }

      let verifiedGithub;
      let githubIdHashes;
      try {
        verifiedGithub = await getCachedGithubVerification(env, String(github_id));
        githubIdHashes = await dualHashSensitive(env, 'github_id', String(github_id));
      } catch (error) {
        return genericError('github_connect_cache_lookup', error, 500, 'Server configuration error.');
      }
      if (!verifiedGithub) {
        return jsonResponse(
          {
            success: false,
            message: 'github_id is not verified. Complete GitHub verification first.',
          },
          400
        );
      }

      const connectedElsewhere = await queryFirst(
        env,
        `
          SELECT wechat_id, github_id
          FROM accounts
          WHERE github_id IN (?, ?) AND wechat_id <> ? AND verified_status = 1
          LIMIT 1
        `,
        [githubIdHashes.v1, githubIdHashes.v2, wechat_id]
      );

      if (connectedElsewhere) {
        if (connectedElsewhere.github_id === githubIdHashes.v1) {
          await lazyUpgradeAccountColumn(env, 'github_id', connectedElsewhere.wechat_id, githubIdHashes.v2);
        }
        return jsonResponse(
          {
            success: false,
            message: 'This GitHub account is already connected to another WeChat ID.',
          },
          409
        );
      }

      const existingAccountGithub = await queryFirst(
        env,
        'SELECT verified_status, verification_method FROM accounts WHERE wechat_id = ?',
        [wechat_id]
      );

      if (existingAccountGithub && Number(existingAccountGithub.verified_status) === 1) {
        const method = String(existingAccountGithub.verification_method || '');
        if (method === 'Manual' || method === 'Batch') {
          return jsonResponse({ success: false, message: 'Account is already verified. Reverification is not available for this account.' }, 400);
        }
        if (method === 'GitHub') {
          const reverifyGithubConflict = githubIdHashes.v2
            ? await queryFirst(env, 'SELECT wechat_id, github_id FROM accounts WHERE wechat_id != ? AND github_id IN (?, ?) AND verified_status = 1 LIMIT 1', [wechat_id, githubIdHashes.v1, githubIdHashes.v2])
            : null;
          if (reverifyGithubConflict) {
            if (reverifyGithubConflict.github_id === githubIdHashes.v1) {
              await lazyUpgradeAccountColumn(env, 'github_id', reverifyGithubConflict.wechat_id, githubIdHashes.v2);
            }
            return jsonResponse({ success: false, message: 'This GitHub account is already connected to another WeChat ID.' }, 409);
          }
          await execRun(
            env,
            "UPDATE accounts SET reverified_at = datetime('now'), github_id = ? WHERE wechat_id = ?",
            [githubIdHashes.v2, wechat_id]
          );
          const bind = await issueBindToken(env, wechat_id, 'GitHub');
          const alreadyLinkedToRowo = await isWechatIdLinkedToRowoAccount(env, wechat_id);
          const reverifiedAt = new Date().toISOString();
          await execRun(
            env,
            `
              INSERT INTO account_info (wechat_id, color, icon, title, body, creator, visibility)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            [wechat_id, 'slate', 'refresh', 'Account reverified', `Account reverified at ${reverifiedAt}.`, 'SYSTEM', 'private']
          );
          return jsonResponse({
            success: true,
            message: 'Account reverified successfully.',
            reverified: true,
            wechat_id,
            bind_token: bind.token,
            bind_token_expires_at: bind.expiresAt,
            already_linked_to_rowo: alreadyLinkedToRowo,
          });
        }
        return jsonResponse({ success: false, message: 'Account is already verified.' }, 400);
      }

      await execRun(
        env,
        `
          INSERT INTO accounts (wechat_id, verified_status, verification_method, verification_time, github_id)
          VALUES (?, 1, 'GitHub', datetime('now'), ?)
          ON CONFLICT(wechat_id) DO UPDATE SET
            verified_status = 1,
            verification_method = 'GitHub',
            verification_time = datetime('now'),
            github_id = excluded.github_id
        `,
        [wechat_id, githubIdHashes.v2]
      );

      const bind = await issueBindToken(env, wechat_id, 'GitHub');
      const alreadyLinkedToRowo = await isWechatIdLinkedToRowoAccount(env, wechat_id);
      return jsonResponse({
        success: true,
        message: 'GitHub account connected and WeChat ID verified.',
        github_id: body.github_id,
        wechat_id,
        bind_token: bind.token,
        bind_token_expires_at: bind.expiresAt,
        already_linked_to_rowo: alreadyLinkedToRowo,
      });
    }

    if (method === 'POST' && pathname === '/api/verify/manual') {
      const body = await parseJson(request);
      const { wechat_id, reason } = body;
      const reasonText = reason != null ? String(reason).trim() : '';

      if (!reasonText) {
        return jsonResponse({ success: false, message: 'reason is required for manual verification.' }, 400);
      }

      const blacklistResponse = await ensureNotBlacklisted(env, wechat_id);
      if (blacklistResponse) {
        return blacklistResponse;
      }

      if (await checkVerified(env, wechat_id)) {
        return jsonResponse({ success: false, message: 'Account is already verified.' }, 400);
      }

      await execRun(
        env,
        `
          INSERT INTO accounts (wechat_id, verified_status, verification_method, verification_time, manual_status)
          VALUES (?, 0, 'Manual', datetime('now'), 'pending')
          ON CONFLICT(wechat_id) DO UPDATE SET
            verified_status = 0,
            verification_method = 'Manual',
            verification_time = datetime('now'),
            manual_status = 'pending'
        `,
        [wechat_id]
      );

      await execRun(
        env,
        `
          INSERT INTO account_info (wechat_id, color, icon, title, body, creator, visibility)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [wechat_id, 'blue', 'document', 'Manual verification reason', reasonText, wechat_id, 'private']
      );

      if (ctx && typeof ctx.waitUntil === 'function') {
        ctx.waitUntil(notifyAdminsOfManualVerification(env, wechat_id, reasonText));
      }

      // Issue a bind token immediately so the user can link this wechat_id to
      // their ROwO account before admin approval. The accounts row exists
      // (verified_status=0, manual_status='pending'), and /api/user/bind-wechat
      // does not gate on verified_status — it only requires the row to exist
      // and the wechat_id to be unclaimed.
      const bind = await issueBindToken(env, wechat_id, 'Manual');
      const alreadyLinkedToRowo = await isWechatIdLinkedToRowoAccount(env, wechat_id);

      return jsonResponse({
        success: true,
        message: 'Manual Verification application submitted and is pending approval.',
        wechat_id,
        bind_token: bind.token,
        bind_token_expires_at: bind.expiresAt,
        already_linked_to_rowo: alreadyLinkedToRowo,
        pending: true,
      });
    }

    // ------------------------------------------------------------------------
    // ROwO Account endpoints (registration, login, session, wechat binding).
    // ------------------------------------------------------------------------

    if (method === 'POST' && pathname === '/api/user/register') {
      const body = await parseJson(request);
      const usernameCheck = validateUsername(body.username);
      if (!usernameCheck.ok) {
        return jsonResponse({ success: false, message: usernameCheck.message }, 400);
      }
      const passwordCheck = validatePassword(body.password);
      if (!passwordCheck.ok) {
        return jsonResponse({ success: false, message: passwordCheck.message }, 400);
      }
      const existing = await queryFirst(
        env,
        'SELECT id FROM user_accounts WHERE username_normalized = ?',
        [usernameCheck.normalized]
      );
      if (existing) {
        return jsonResponse({ success: false, message: 'Username is already taken.' }, 409);
      }

      let wechatIdToBind = null;
      if (body.bind_token) {
        const bindInfo = await consumeBindToken(env, body.bind_token);
        if (!bindInfo) {
          return jsonResponse({ success: false, message: 'Bind token is invalid or expired.' }, 401);
        }
        const wechatRow = await queryFirst(env, 'SELECT wechat_id FROM accounts WHERE wechat_id = ?', [bindInfo.wechatId]);
        if (!wechatRow) {
          return jsonResponse({ success: false, message: 'The WeChat ID in the bind token no longer exists.' }, 404);
        }
        const alreadyBound = await queryFirst(
          env,
          'SELECT id FROM user_accounts WHERE wechat_id = ?',
          [bindInfo.wechatId]
        );
        if (alreadyBound) {
          return jsonResponse({
            success: false,
            message: 'This WeChat ID is already linked to another ROwO account. Sign in to that account instead.',
          }, 409);
        }
        wechatIdToBind = bindInfo.wechatId;
      }

      const id = crypto.randomUUID();
      const passwordHash = await hashPassword(body.password);

      try {
        await execRun(
          env,
          `
            INSERT INTO user_accounts (id, username_normalized, username_display, password_hash, wechat_id, password_changed_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
          `,
          [id, usernameCheck.normalized, usernameCheck.display, passwordHash, wechatIdToBind]
        );
      } catch (error) {
        if (String(error?.message || error).toLowerCase().includes('unique')) {
          return jsonResponse({ success: false, message: 'Username or WeChat ID is already taken.' }, 409);
        }
        return genericError('user_register', error);
      }

      const user = await queryFirst(env, 'SELECT * FROM user_accounts WHERE id = ?', [id]);
      const token = await issueUserSessionToken(env, id, usernameCheck.display);
      return jsonResponse({
        success: true,
        message: 'Account created.',
        token,
        user: publicUserShape(user),
      });
    }

    if (method === 'POST' && pathname === '/api/user/login') {
      const body = await parseJson(request);
      const rawUsername = String(body.username == null ? '' : body.username).trim();
      const rawPassword = String(body.password == null ? '' : body.password);
      if (!rawUsername || !rawPassword) {
        return jsonResponse({ success: false, message: 'Username and password are required.' }, 400);
      }
      const normalized = normalizeUsername(rawUsername);

      const ip = getClientIp(request);
      const minuteKey = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
      const ipBucket = `ip:${ip}:${minuteKey}`;
      const userBucket = `user:${normalized}:${minuteKey}`;
      const ipQuota = await consumeLoginRateLimit(env, ipBucket);
      if (!ipQuota.allowed) {
        return jsonResponse({
          success: false,
          message: 'Too many login attempts. Please try again in a minute.',
          retry_after_seconds: ipQuota.retryAfterSeconds,
        }, 429);
      }
      const userQuota = await consumeLoginRateLimit(env, userBucket);
      if (!userQuota.allowed) {
        return jsonResponse({
          success: false,
          message: 'Too many login attempts for this account. Please try again in a minute.',
          retry_after_seconds: userQuota.retryAfterSeconds,
        }, 429);
      }

      const user = await queryFirst(env, 'SELECT * FROM user_accounts WHERE username_normalized = ?', [normalized]);
      const storedHash = user ? user.password_hash : DUMMY_PASSWORD_HASH;
      const ok = await verifyPassword(rawPassword, storedHash);
      if (!user || !ok) {
        return jsonResponse({ success: false, message: 'Invalid username or password.' }, 401);
      }

      await execRun(env, "UPDATE user_accounts SET last_login_at = datetime('now') WHERE id = ?", [user.id]);
      const token = await issueUserSessionToken(env, user.id, user.username_display);
      const fresh = await queryFirst(env, 'SELECT * FROM user_accounts WHERE id = ?', [user.id]);
      return jsonResponse({
        success: true,
        message: 'Signed in.',
        token,
        user: publicUserShape(fresh),
      });
    }

    if (method === 'POST' && pathname === '/api/user/logout') {
      // Stateless JWT — client drops the token. Endpoint exists for symmetry.
      return jsonResponse({ success: true, message: 'Signed out.' });
    }

    if (method === 'GET' && pathname === '/api/user/me') {
      const auth = await requireUserAuth(request, env);
      if (auth.response) return auth.response;
      const user = auth.user;
      let verification = null;
      if (user.wechat_id) {
        const row = await queryFirst(
          env,
          `SELECT wechat_id, verified_status, verification_method, verification_time,
                  manual_status, reverified_at
             FROM accounts WHERE wechat_id = ?`,
          [user.wechat_id]
        );
        if (row) {
          verification = {
            wechat_id: row.wechat_id,
            verified_status: Number(row.verified_status) === 1,
            verification_method: row.verification_method || null,
            verification_time: row.verification_time || null,
            manual_status: row.manual_status || null,
            reverified_at: row.reverified_at || null,
          };
        } else {
          verification = { wechat_id: user.wechat_id, missing: true };
        }
      }
      return jsonResponse({
        success: true,
        user: publicUserShape(user),
        verification,
      });
    }

    if (method === 'POST' && pathname === '/api/user/bind-wechat') {
      const auth = await requireUserAuth(request, env);
      if (auth.response) return auth.response;
      const body = await parseJson(request);
      const bindInfo = await consumeBindToken(env, body.bind_token);
      if (!bindInfo) {
        return jsonResponse({ success: false, message: 'Bind token is invalid or expired.' }, 401);
      }

      const accountRow = await queryFirst(env, 'SELECT wechat_id FROM accounts WHERE wechat_id = ?', [bindInfo.wechatId]);
      if (!accountRow) {
        return jsonResponse({ success: false, message: 'The WeChat ID in the bind token no longer exists.' }, 404);
      }

      if (auth.user.wechat_id) {
        if (auth.user.wechat_id === bindInfo.wechatId) {
          return jsonResponse({
            success: true,
            message: 'Already bound to this WeChat ID.',
            user: publicUserShape(auth.user),
          });
        }
        return jsonResponse({
          success: false,
          message: 'This ROwO account is already bound to a different WeChat ID. Use Change WeChat ID instead.',
        }, 409);
      }

      const claimedBy = await queryFirst(env, 'SELECT id FROM user_accounts WHERE wechat_id = ?', [bindInfo.wechatId]);
      if (claimedBy) {
        return jsonResponse({
          success: false,
          message: 'This WeChat ID is already linked to another ROwO account.',
        }, 409);
      }

      try {
        await execRun(
          env,
          "UPDATE user_accounts SET wechat_id = ?, updated_at = datetime('now') WHERE id = ?",
          [bindInfo.wechatId, auth.user.id]
        );
      } catch (error) {
        if (String(error?.message || error).toLowerCase().includes('unique')) {
          return jsonResponse({
            success: false,
            message: 'This WeChat ID is already linked to another ROwO account.',
          }, 409);
        }
        return genericError('user_bind_wechat', error);
      }

      const fresh = await queryFirst(env, 'SELECT * FROM user_accounts WHERE id = ?', [auth.user.id]);
      return jsonResponse({
        success: true,
        message: 'WeChat ID bound.',
        user: publicUserShape(fresh),
      });
    }

    if (method === 'POST' && pathname === '/api/user/change-wechat') {
      const auth = await requireUserAuth(request, env);
      if (auth.response) return auth.response;
      const body = await parseJson(request);
      const newId = body.new_wechat_id != null ? String(body.new_wechat_id).trim() : '';
      if (!body.current_password || !body.bind_token || !newId) {
        return jsonResponse({
          success: false,
          message: 'current_password, bind_token, and new_wechat_id are required.',
        }, 400);
      }

      if (!auth.user.wechat_id) {
        return jsonResponse({
          success: false,
          message: 'No WeChat ID is currently bound. Use Bind WeChat ID instead.',
        }, 400);
      }

      const oldId = auth.user.wechat_id;
      if (oldId === newId) {
        return jsonResponse({
          success: false,
          message: 'new_wechat_id must be different from the current WeChat ID.',
        }, 400);
      }

      const oneYearMs = 365 * 24 * 60 * 60 * 1000;
      const lastChangeAt = auth.user.last_wechat_change_at ? Date.parse(String(auth.user.last_wechat_change_at)) : 0;
      if (Number.isFinite(lastChangeAt) && lastChangeAt > 0 && Date.now() - lastChangeAt < oneYearMs) {
        const nextEligibleAt = new Date(lastChangeAt + oneYearMs).toISOString();
        return jsonResponse({
          success: false,
          message: `You can only change your WeChat ID once per year. You will be able to change it again on ${nextEligibleAt} (UTC).`,
          next_eligible_at: nextEligibleAt,
        }, 429);
      }

      const passwordOk = await verifyPassword(String(body.current_password), auth.user.password_hash);
      if (!passwordOk) {
        return jsonResponse({ success: false, message: 'Current password is incorrect.' }, 401);
      }

      const bindInfo = await consumeBindToken(env, body.bind_token);
      if (!bindInfo) {
        return jsonResponse({ success: false, message: 'Bind token is invalid or expired.' }, 401);
      }
      if (bindInfo.wechatId !== newId) {
        return jsonResponse({
          success: false,
          message: 'Bind token does not match new_wechat_id.',
        }, 400);
      }

      const conflictingRowoAccount = await queryFirst(
        env,
        'SELECT id FROM user_accounts WHERE wechat_id = ? AND id != ?',
        [newId, auth.user.id]
      );
      if (conflictingRowoAccount) {
        return jsonResponse({
          success: false,
          message: 'This WeChat ID is already linked to another ROwO account.',
        }, 409);
      }

      const existingNew = await queryFirst(env, 'SELECT wechat_id FROM accounts WHERE wechat_id = ?', [newId]);
      if (existingNew) {
        return jsonResponse({ success: false, message: 'The new WeChat ID is already in use.' }, 409);
      }

      const row = await queryFirst(env, 'SELECT * FROM accounts WHERE wechat_id = ?', [oldId]);
      if (!row) {
        return jsonResponse({ success: false, message: 'Current account record not found.' }, 404);
      }

      await execRun(
        env,
        `
          INSERT INTO accounts (wechat_id, verified_status, verification_method, verification_time, student_id, student_name, email, discord_id, github_id, manual_status, manual_reason, manual_admin, manual_time, reverified_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          newId,
          row.verified_status,
          row.verification_method,
          row.verification_time,
          row.student_id ?? null,
          row.student_name ?? null,
          row.email ?? null,
          row.discord_id ?? null,
          row.github_id ?? null,
          row.manual_status ?? null,
          row.manual_reason ?? null,
          row.manual_admin ?? null,
          row.manual_time ?? null,
          row.reverified_at ?? null,
        ]
      );
      await execRun(env, 'UPDATE account_info SET wechat_id = ? WHERE wechat_id = ?', [newId, oldId]);
      await execRun(env, 'UPDATE account_blacklist SET wechat_id = ? WHERE wechat_id = ?', [newId, oldId]);
      await execRun(env, 'DELETE FROM email_verification_codes WHERE wechat_id = ?', [oldId]);
      await execRun(env, 'DELETE FROM accounts WHERE wechat_id = ?', [oldId]);

      const changeBody = `WeChat ID was changed from **${oldId}** to **${newId}**.`;
      await execRun(
        env,
        `
          INSERT INTO account_info (wechat_id, color, icon, title, body, creator, visibility)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [newId, 'emerald', 'pencil', 'WeChat ID changed', changeBody, 'SYSTEM', 'public']
      );

      await execRun(
        env,
        `
          UPDATE user_accounts
          SET wechat_id = ?, last_wechat_change_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ?
        `,
        [newId, auth.user.id]
      );

      const fresh = await queryFirst(env, 'SELECT * FROM user_accounts WHERE id = ?', [auth.user.id]);
      return jsonResponse({
        success: true,
        message: 'WeChat ID changed successfully.',
        wechat_id: newId,
        user: publicUserShape(fresh),
      });
    }

    if (method === 'POST' && pathname === '/api/user/change-password') {
      const auth = await requireUserAuth(request, env);
      if (auth.response) return auth.response;
      const body = await parseJson(request);
      const current = String(body.current_password == null ? '' : body.current_password);
      const next = String(body.new_password == null ? '' : body.new_password);
      if (!current || !next) {
        return jsonResponse({
          success: false,
          message: 'current_password and new_password are required.',
        }, 400);
      }
      const passwordCheck = validatePassword(next);
      if (!passwordCheck.ok) {
        return jsonResponse({ success: false, message: passwordCheck.message }, 400);
      }
      const passwordOk = await verifyPassword(current, auth.user.password_hash);
      if (!passwordOk) {
        return jsonResponse({ success: false, message: 'Current password is incorrect.' }, 401);
      }
      if (current === next) {
        return jsonResponse({
          success: false,
          message: 'New password must differ from current password.',
        }, 400);
      }
      const newHash = await hashPassword(next);
      await execRun(
        env,
        `
          UPDATE user_accounts
          SET password_hash = ?, password_changed_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ?
        `,
        [newHash, auth.user.id]
      );
      return jsonResponse({ success: true, message: 'Password changed.' });
    }

    if (method === 'GET' && pathname === '/api/admin/stats') {
      const auth = await requireRole(request, env, 'moderator');
      if (auth.response) return auth.response;

      const verifiedRow = await queryFirst(env, 'SELECT COUNT(*) as count FROM accounts WHERE verified_status = 1');
      const verified_count = Number(verifiedRow?.count ?? 0);
      
      const statsRow = await queryFirst(env, "SELECT value FROM stats WHERE key = 'account_queries' LIMIT 1");
      const account_queries = Number(statsRow?.value ?? 0);
      
      return jsonResponse({ success: true, verified_count, account_queries });
    }

    if (method === 'GET' && pathname === '/api/admin/accounts') {
      const auth = await requireRole(request, env, 'moderator');
      if (auth.response) return auth.response;

      const { page, pageSize, like } = parsePaginationParams(url);
      const isModerator = auth.admin.role === 'moderator';

      const where = [];
      const params = [];
      if (isModerator) {
        where.push("manual_status = 'pending'");
      }
      if (like) {
        where.push(
          "(LOWER(wechat_id) LIKE ? ESCAPE '\\' OR LOWER(IFNULL(student_name, '')) LIKE ? ESCAPE '\\' OR LOWER(IFNULL(student_id, '')) LIKE ? ESCAPE '\\')"
        );
        params.push(like, like, like);
      }
      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const countRow = await queryFirst(
        env,
        `SELECT COUNT(*) AS c FROM accounts ${whereClause}`,
        params
      );
      const total = Number(countRow?.c ?? 0);

      const orderBy = isModerator
        ? 'ORDER BY verification_time DESC'
        : "ORDER BY CASE WHEN manual_status = 'pending' THEN 0 ELSE 1 END, verification_time DESC";

      const accounts = await queryAll(
        env,
        `SELECT * FROM accounts ${whereClause} ${orderBy} LIMIT ? OFFSET ?`,
        [...params, pageSize, (page - 1) * pageSize]
      );

      return jsonResponse({
        success: true,
        accounts,
        total,
        page,
        page_size: pageSize,
        admin: { username: auth.admin.username, role: auth.admin.role },
      });
    }

    const adminInfoMatch = pathname.match(/^\/api\/admin\/accounts\/([^/]+)\/info$/);
    if (method === 'GET' && adminInfoMatch) {
      const auth = await requireRole(request, env, 'admin');
      if (auth.response) return auth.response;

      const wechatId = decodeURIComponent(adminInfoMatch[1]);
      const info = await queryAll(
        env,
        'SELECT * FROM account_info WHERE wechat_id = ? ORDER BY created_at DESC',
        [wechatId]
      );
      return jsonResponse({ success: true, info });
    }

    if (method === 'POST' && adminInfoMatch) {
      const auth = await requireRole(request, env, 'admin');
      if (auth.response) return auth.response;

      const wechatId = decodeURIComponent(adminInfoMatch[1]);
      const body = await parseJson(request);
      const { color, icon, title, body: infoBody, visibility } = body;

      const result = await execRun(
        env,
        `
          INSERT INTO account_info (wechat_id, color, icon, title, body, creator, visibility)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [wechatId, color, icon, title, infoBody, auth.admin.username, visibility]
      );

      return jsonResponse({ success: true, id: result.meta?.last_row_id ?? null });
    }

    const adminEditInfoMatch = pathname.match(/^\/api\/admin\/info\/([^/]+)$/);
    if (method === 'PUT' && adminEditInfoMatch) {
      const auth = await requireRole(request, env, 'admin');
      if (auth.response) return auth.response;

      const id = decodeURIComponent(adminEditInfoMatch[1]);
      const body = await parseJson(request);
      const { color, icon, title, body: infoBody, visibility } = body;

      await execRun(
        env,
        `
          UPDATE account_info
          SET color = ?, icon = ?, title = ?, body = ?, visibility = ?, updated_at = datetime('now')
          WHERE id = ?
        `,
        [color, icon, title, infoBody, visibility, id]
      );

      return jsonResponse({ success: true });
    }

    if (method === 'DELETE' && adminEditInfoMatch) {
      const auth = await requireRole(request, env, 'admin');
      if (auth.response) return auth.response;

      const id = decodeURIComponent(adminEditInfoMatch[1]);
      await execRun(env, 'DELETE FROM account_info WHERE id = ?', [id]);
      return jsonResponse({ success: true });
    }

    const revokeMatch = pathname.match(/^\/api\/admin\/accounts\/([^/]+)\/(revoke|unrevoke)$/);
    if (method === 'POST' && revokeMatch) {
      const auth = await requireRole(request, env, 'admin');
      if (auth.response) return auth.response;

      const wechatId = decodeURIComponent(revokeMatch[1]);
      const action = revokeMatch[2];

      if (action === 'revoke') {
        await execRun(env, 'UPDATE accounts SET verified_status = 2 WHERE wechat_id = ?', [wechatId]);
        return jsonResponse({ success: true, message: 'Verification revoked.' });
      }

      await execRun(env, 'UPDATE accounts SET verified_status = 1 WHERE wechat_id = ?', [wechatId]);
      return jsonResponse({ success: true, message: 'Verification restored.' });
    }

    const manualMatch = pathname.match(/^\/api\/admin\/accounts\/([^/]+)\/manual$/);
    if (method === 'POST' && manualMatch) {
      const auth = await requireRole(request, env, 'moderator');
      if (auth.response) return auth.response;

      const wechatId = decodeURIComponent(manualMatch[1]);
      const body = await parseJson(request);
      const { action, reason } = body;

      if (action === 'approve') {
        await execRun(
          env,
          `
            UPDATE accounts
            SET verified_status = 1, manual_status = 'approved', manual_admin = ?, manual_time = datetime('now')
            WHERE wechat_id = ?
          `,
          [auth.admin.username, wechatId]
        );
        const bind = await issueBindToken(env, wechatId, 'Manual');
        const alreadyLinkedToRowo = await isWechatIdLinkedToRowoAccount(env, wechatId);
        return jsonResponse({
          success: true,
          message: 'Application approved.',
          wechat_id: wechatId,
          bind_token: bind.token,
          bind_token_expires_at: bind.expiresAt,
          already_linked_to_rowo: alreadyLinkedToRowo,
        });
      } else if (action === 'reject') {
        await execRun(
          env,
          `
            UPDATE accounts
            SET verified_status = 0, manual_status = 'rejected', manual_reason = ?, manual_admin = ?, manual_time = datetime('now')
            WHERE wechat_id = ?
          `,
          [reason || '', auth.admin.username, wechatId]
        );

        const warningInfo = `This account has been **REJECTED** previously by **${auth.admin.username}** with reason: **${reason}**.`;
        await execRun(
          env,
          `
            INSERT INTO account_info (wechat_id, color, icon, title, body, creator, visibility)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          [wechatId, 'orange', 'warning', 'Previously Rejected Application', warningInfo, 'SYSTEM', 'private']
        );
      }

      return jsonResponse({ success: true, message: `Application ${action}d.` });
    }

    const contactMatch = pathname.match(/^\/api\/admin\/accounts\/([^/]+)\/contact$/);
    if (method === 'POST' && contactMatch) {
      const auth = await requireRole(request, env, 'moderator');
      if (auth.response) return auth.response;

      const wechatId = decodeURIComponent(contactMatch[1]);

      const existing = await queryFirst(
        env,
        `SELECT id, creator, updated_at FROM account_info
         WHERE wechat_id = ? AND title = 'User Contacted' LIMIT 1`,
        [wechatId]
      );
      if (existing) {
        return jsonResponse({
          success: true,
          already: true,
          creator: existing.creator,
          updated_at: existing.updated_at,
        });
      }

      const contactBody = `Contacted by **${auth.admin.username}** at **${new Date().toISOString()}**. Please do not contact again.`;
      await execRun(
        env,
        `
          INSERT INTO account_info (wechat_id, color, icon, title, body, creator, visibility)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [wechatId, 'emerald', 'checkmark', 'User Contacted', contactBody, auth.admin.username, 'private']
      );

      return jsonResponse({ success: true });
    }

    const blacklistMatch = pathname.match(/^\/api\/admin\/accounts\/([^/]+)\/blacklist$/);
    if (method === 'POST' && blacklistMatch) {
      const auth = await requireRole(request, env, 'moderator');
      if (auth.response) return auth.response;

      const wechatId = decodeURIComponent(blacklistMatch[1]);
      const body = await parseJson(request);
      const reason = String(body?.reason || '').trim();

      if (!reason) {
        return jsonResponse({ success: false, message: 'reason is required to blacklist an account.' }, 400);
      }

      await execRun(
        env,
        `
          INSERT INTO account_blacklist (wechat_id, reason, added_by, added_at, is_active, updated_at)
          VALUES (?, ?, ?, datetime('now'), 1, datetime('now'))
          ON CONFLICT(wechat_id) DO UPDATE SET
            reason = excluded.reason,
            added_by = excluded.added_by,
            added_at = datetime('now'),
            is_active = 1,
            updated_at = datetime('now')
        `,
        [wechatId, reason, auth.admin.username]
      );

      const accountExists = await queryFirst(env, 'SELECT wechat_id FROM accounts WHERE wechat_id = ? LIMIT 1', [wechatId]);
      if (accountExists) {
        const blacklistInfo = `This account has been **BLACKLISTED** by **${auth.admin.username}** at **${new Date().toISOString()}** with reason: **${reason}**.`;
        await execRun(
          env,
          `
            INSERT INTO account_info (wechat_id, color, icon, title, body, creator, visibility)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          [wechatId, 'red', 'warning', 'Blacklisted Account', blacklistInfo, 'SYSTEM', 'private']
        );
      }

      return jsonResponse({
        success: true,
        message: 'Account added to blacklist successfully.',
        blacklist: {
          wechat_id: wechatId,
          reason,
          added_by: auth.admin.username,
        },
      });
    }

    const unblacklistMatch = pathname.match(/^\/api\/admin\/accounts\/([^/]+)\/unblacklist$/);
    if (method === 'POST' && unblacklistMatch) {
      const auth = await requireRole(request, env, 'moderator');
      if (auth.response) return auth.response;

      const wechatId = decodeURIComponent(unblacklistMatch[1]);

      const existingRecord = await queryFirst(
        env,
        `
          SELECT wechat_id, is_active
          FROM account_blacklist
          WHERE wechat_id = ?
          LIMIT 1
        `,
        [wechatId]
      );

      if (!existingRecord || Number(existingRecord.is_active) !== 1) {
        return jsonResponse({ success: false, message: 'Account is not currently blacklisted.' }, 400);
      }

      await execRun(
        env,
        `
          UPDATE account_blacklist
          SET is_active = 0, updated_at = datetime('now')
          WHERE wechat_id = ?
        `,
        [wechatId]
      );

      const accountExists = await queryFirst(env, 'SELECT wechat_id FROM accounts WHERE wechat_id = ? LIMIT 1', [wechatId]);
      if (accountExists) {
        const unblacklistInfo = `This account has been **REMOVED FROM BLACKLIST** by **${auth.admin.username}** at **${new Date().toISOString()}**.`;
        await execRun(
          env,
          `
            INSERT INTO account_info (wechat_id, color, icon, title, body, creator, visibility)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          [wechatId, 'green', 'check', 'Blacklist Removed', unblacklistInfo, 'SYSTEM', 'private']
        );
      }

      return jsonResponse({
        success: true,
        message: 'Account removed from blacklist successfully.',
        blacklist: {
          wechat_id: wechatId,
          is_active: 0,
          removed_by: auth.admin.username,
        },
      });
    }

    if (method === 'POST' && pathname === '/api/admin/batch/verify') {
      const auth = await requireRole(request, env, 'moderator');
      if (auth.response) return auth.response;

      const body = await parseJson(request);
      const wechatIds = Array.isArray(body?.wechat_ids) ? body.wechat_ids : [];
      const reason = String(body?.reason ?? '').trim();

      if (!reason) {
        return jsonResponse({ success: false, message: 'reason is required for batch verify.' }, 400);
      }

      const normalizedIds = wechatIds.filter((id) => typeof id === 'string' && id.trim() !== '').map((id) => id.trim());
      if (normalizedIds.length === 0) {
        return jsonResponse({ success: false, message: 'wechat_ids must be a non-empty array of strings.' }, 400);
      }

      const batchInfoBody = `This account was **batch verified** by **${auth.admin.username}** at **${new Date().toISOString()}**. Reason: **${reason}**.`;

      const verified = [];
      const skipped = [];

      for (const wechatId of normalizedIds) {
        const blacklistRecord = await getActiveBlacklistRecord(env, wechatId);
        if (blacklistRecord) {
          skipped.push({ wechat_id: wechatId, reason: 'Account is blacklisted.' });
          continue;
        }

        if (await checkVerified(env, wechatId)) {
          skipped.push({ wechat_id: wechatId, reason: 'Already verified.' });
          continue;
        }

        await execRun(
          env,
          `
            INSERT INTO accounts (wechat_id, verified_status, verification_method, verification_time, manual_status, manual_admin, manual_time)
            VALUES (?, 1, 'Batch', datetime('now'), 'approved', ?, datetime('now'))
            ON CONFLICT(wechat_id) DO UPDATE SET
              verified_status = 1,
              verification_method = 'Batch',
              verification_time = datetime('now'),
              manual_status = 'approved',
              manual_admin = excluded.manual_admin,
              manual_time = datetime('now')
          `,
          [wechatId, auth.admin.username]
        );

        await execRun(
          env,
          `
            INSERT INTO account_info (wechat_id, color, icon, title, body, creator, visibility)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          [wechatId, 'emerald', 'checkmark', 'Batch Verified (details)', batchInfoBody, auth.admin.username, 'private']
        );
        await execRun(
          env,
          `
            INSERT INTO account_info (wechat_id, color, icon, title, body, creator, visibility)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
          [wechatId, 'emerald', 'checkmark', 'Batch Verified', `This account was **VERIFIED** as a part of a batch operation: **${reason}**. Contact support if you believe this is an error.`, auth.admin.username, 'public']
        );

        verified.push(wechatId);
      }

      return jsonResponse({
        success: true,
        message: `Batch verify completed. Verified: ${verified.length}, skipped: ${skipped.length}.`,
        verified,
        skipped,
      });
    }

    if (method === 'POST' && pathname === '/api/admin/batch/blacklist') {
      const auth = await requireRole(request, env, 'moderator');
      if (auth.response) return auth.response;

      const body = await parseJson(request);
      const wechatIds = Array.isArray(body?.wechat_ids) ? body.wechat_ids : [];
      const reason = String(body?.reason ?? '').trim();

      if (!reason) {
        return jsonResponse({ success: false, message: 'reason is required for batch blacklist.' }, 400);
      }

      const normalizedIds = wechatIds.filter((id) => typeof id === 'string' && id.trim() !== '').map((id) => id.trim());
      if (normalizedIds.length === 0) {
        return jsonResponse({ success: false, message: 'wechat_ids must be a non-empty array of strings.' }, 400);
      }

      const blacklisted = [];

      for (const wechatId of normalizedIds) {
        await execRun(
          env,
          `
            INSERT INTO account_blacklist (wechat_id, reason, added_by, added_at, is_active, updated_at)
            VALUES (?, ?, ?, datetime('now'), 1, datetime('now'))
            ON CONFLICT(wechat_id) DO UPDATE SET
              reason = excluded.reason,
              added_by = excluded.added_by,
              added_at = datetime('now'),
              is_active = 1,
              updated_at = datetime('now')
          `,
          [wechatId, reason, auth.admin.username]
        );

        const accountExists = await queryFirst(env, 'SELECT wechat_id FROM accounts WHERE wechat_id = ? LIMIT 1', [wechatId]);
        if (accountExists) {
          const blacklistInfo = `This account has been **BLACKLISTED** by **${auth.admin.username}** at **${new Date().toISOString()}** with reason: **${reason}**.`;
          await execRun(
            env,
            `
              INSERT INTO account_info (wechat_id, color, icon, title, body, creator, visibility)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            [wechatId, 'red', 'warning', 'Blacklisted Account (details)', blacklistInfo, 'SYSTEM', 'private']
          );
          await execRun(
            env,
            `
              INSERT INTO account_info (wechat_id, color, icon, title, body, creator, visibility)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            [wechatId, 'red', 'warning', 'Blacklisted', `This account is **BLACKLISTED** as a part of a batch operation: **${reason}**. Contact support if you believe this is an error.`, 'SYSTEM', 'public']
          );
        }

        blacklisted.push(wechatId);
      }

      return jsonResponse({
        success: true,
        message: `Batch blacklist completed. ${blacklisted.length} account(s) added to blacklist.`,
        blacklisted,
      });
    }

    if (method === 'GET' && pathname === '/api/admin/blacklist') {
      const auth = await requireRole(request, env, 'moderator');
      if (auth.response) return auth.response;

      const blacklist = await queryAll(
        env,
        `
          SELECT wechat_id, reason, added_by, added_at
          FROM account_blacklist
          WHERE is_active = 1
          ORDER BY added_at DESC
        `
      );

      return jsonResponse({ success: true, blacklist });
    }

    if (method === 'GET' && pathname === '/api/admin/users') {
      const auth = await requireRole(request, env, 'admin');
      if (auth.response) return auth.response;

      const { page, pageSize, like } = parsePaginationParams(url);

      const where = [];
      const params = [];
      if (like) {
        where.push(
          "(LOWER(username_normalized) LIKE ? ESCAPE '\\' OR LOWER(IFNULL(wechat_id, '')) LIKE ? ESCAPE '\\' OR LOWER(id) LIKE ? ESCAPE '\\')"
        );
        params.push(like, like, like);
      }
      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

      const countRow = await queryFirst(
        env,
        `SELECT COUNT(*) AS c FROM user_accounts ${whereClause}`,
        params
      );
      const total = Number(countRow?.c ?? 0);

      const rows = await queryAll(
        env,
        `
          SELECT id, username_display, wechat_id, created_at, last_login_at,
                 last_wechat_change_at, password_changed_at, role
          FROM user_accounts
          ${whereClause}
          ORDER BY created_at DESC
          LIMIT ? OFFSET ?
        `,
        [...params, pageSize, (page - 1) * pageSize]
      );

      return jsonResponse({
        success: true,
        total,
        page,
        page_size: pageSize,
        users: rows.map((row) => ({
          id: row.id,
          username: row.username_display,
          wechat_id: row.wechat_id || null,
          created_at: row.created_at,
          last_login_at: row.last_login_at || null,
          last_wechat_change_at: row.last_wechat_change_at || null,
          password_changed_at: row.password_changed_at || null,
          role: row.role || 'user',
        })),
      });
    }

    const userResetMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/reset-password$/);
    if (method === 'POST' && userResetMatch) {
      const auth = await requireRole(request, env, 'admin');
      if (auth.response) return auth.response;
      const id = decodeURIComponent(userResetMatch[1]);
      const body = await parseJson(request);
      const passwordCheck = validatePassword(body.new_password);
      if (!passwordCheck.ok) {
        return jsonResponse({ success: false, message: passwordCheck.message }, 400);
      }
      const target = await queryFirst(env, 'SELECT id, role FROM user_accounts WHERE id = ?', [id]);
      if (!target) {
        return jsonResponse({ success: false, message: 'User not found.' }, 404);
      }
      // Strict hierarchy: actor must rank strictly above target.
      const actorRank = ROLE_RANK[auth.user.role] ?? -1;
      const targetRank = ROLE_RANK[target.role] ?? 0;
      if (actorRank <= targetRank) {
        return jsonResponse({
          success: false,
          message: 'You cannot reset the password of a user at your level or above.',
        }, 403);
      }
      const newHash = await hashPassword(String(body.new_password));
      await execRun(
        env,
        `
          UPDATE user_accounts
          SET password_hash = ?, password_changed_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ?
        `,
        [newHash, id]
      );
      return jsonResponse({ success: true, message: 'Password reset.' });
    }

    const userUnbindMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/unbind-wechat$/);
    if (method === 'POST' && userUnbindMatch) {
      const auth = await requireRole(request, env, 'admin');
      if (auth.response) return auth.response;
      const id = decodeURIComponent(userUnbindMatch[1]);
      const target = await queryFirst(env, 'SELECT id FROM user_accounts WHERE id = ?', [id]);
      if (!target) {
        return jsonResponse({ success: false, message: 'User not found.' }, 404);
      }
      await execRun(
        env,
        "UPDATE user_accounts SET wechat_id = NULL, updated_at = datetime('now') WHERE id = ?",
        [id]
      );
      return jsonResponse({ success: true, message: 'WeChat ID unbound.' });
    }

    if (method === 'GET' && pathname === '/api/admin/preferences') {
      const auth = await requireRole(request, env, 'moderator');
      if (auth.response) return auth.response;

      const row = await queryFirst(
        env,
        'SELECT notification_email, manual_notification_enabled FROM user_accounts WHERE id = ?',
        [auth.admin.id]
      );
      return jsonResponse({
        success: true,
        notification_email: row?.notification_email || null,
        manual_notification_enabled: Number(row?.manual_notification_enabled || 0) === 1,
      });
    }

    if (method === 'POST' && pathname === '/api/admin/preferences') {
      const auth = await requireRole(request, env, 'moderator');
      if (auth.response) return auth.response;

      const body = await parseJson(request);
      const hasEmailField = Object.prototype.hasOwnProperty.call(body, 'notification_email');
      const hasEnabledField = Object.prototype.hasOwnProperty.call(body, 'manual_notification_enabled');

      let newEmail;
      if (hasEmailField) {
        const raw = body.notification_email;
        if (raw === null || (typeof raw === 'string' && raw.trim() === '')) {
          newEmail = null;
        } else if (typeof raw === 'string') {
          const normalized = normalizeEmail(raw);
          if (!getEmailDomain(normalized) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
            return jsonResponse({ success: false, message: 'Invalid email.' }, 400);
          }
          newEmail = normalized;
        } else {
          return jsonResponse({ success: false, message: 'notification_email must be a string or null.' }, 400);
        }
      }

      let newEnabled;
      if (hasEnabledField) {
        newEnabled = body.manual_notification_enabled === true ? 1 : 0;
      }

      const effectiveEmail = hasEmailField ? newEmail : auth.admin.notification_email || null;
      const effectiveEnabled = hasEnabledField
        ? newEnabled
        : Number(auth.admin.manual_notification_enabled || 0);

      if (effectiveEnabled === 1 && !effectiveEmail) {
        return jsonResponse({ success: false, message: 'Set a notification email before subscribing.' }, 400);
      }

      const updates = [];
      const params = [];
      if (hasEmailField) {
        updates.push('notification_email = ?');
        params.push(newEmail);
      }
      if (hasEnabledField) {
        updates.push('manual_notification_enabled = ?');
        params.push(newEnabled);
      }
      if (updates.length > 0) {
        params.push(auth.admin.id);
        await execRun(env, `UPDATE user_accounts SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`, params);
      }

      return jsonResponse({
        success: true,
        notification_email: effectiveEmail,
        manual_notification_enabled: effectiveEnabled === 1,
      });
    }

    if (method === 'GET' && pathname === '/api/admin/roles/search') {
      const auth = await requireRole(request, env, 'admin');
      if (auth.response) return auth.response;
      const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
      if (q.length < 1) {
        return jsonResponse({ success: true, results: [] });
      }
      const like = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
      const rows = await queryAll(
        env,
        `
          SELECT id, username_display, role, role_assigned_by
          FROM user_accounts
          WHERE LOWER(username_normalized) LIKE ? ESCAPE '\\'
          ORDER BY username_normalized
          LIMIT 20
        `,
        [like]
      );
      return jsonResponse({
        success: true,
        results: rows.map((row) => ({
          id: row.id,
          username: row.username_display,
          role: row.role || 'user',
          role_assigned_by: row.role_assigned_by || null,
        })),
      });
    }

    if (method === 'GET' && pathname === '/api/admin/roles/list') {
      const auth = await requireRole(request, env, 'admin');
      if (auth.response) return auth.response;
      const isSuper = auth.user.role === 'super_admin';

      const shape = (row) => ({
        id: row.id,
        username: row.username_display,
        role: row.role,
        role_assigned_by: row.role_assigned_by || null,
        role_assigned_at: row.role_assigned_at || null,
      });

      const moderators = isSuper
        ? await queryAll(
            env,
            `SELECT id, username_display, role, role_assigned_by, role_assigned_at
               FROM user_accounts WHERE role = 'moderator'
               ORDER BY role_assigned_at IS NULL, role_assigned_at DESC, username_normalized`
          )
        : await queryAll(
            env,
            `SELECT id, username_display, role, role_assigned_by, role_assigned_at
               FROM user_accounts WHERE role = 'moderator' AND role_assigned_by = ?
               ORDER BY role_assigned_at IS NULL, role_assigned_at DESC, username_normalized`,
            [auth.user.id]
          );

      const response = {
        success: true,
        moderators: moderators.map(shape),
        my_moderator_count: moderators.filter((r) => r.role_assigned_by === auth.user.id).length,
        moderator_cap: isSuper ? null : 3,
      };

      if (isSuper) {
        const admins = await queryAll(
          env,
          `SELECT id, username_display, role, role_assigned_by, role_assigned_at
             FROM user_accounts WHERE role = 'admin'
             ORDER BY role_assigned_at IS NULL, role_assigned_at DESC, username_normalized`
        );
        response.admins = admins.map(shape);
      }

      return jsonResponse(response);
    }

    if (method === 'POST' && pathname === '/api/admin/roles/assign') {
      const auth = await requireRole(request, env, 'admin');
      if (auth.response) return auth.response;
      const body = await parseJson(request);
      const targetId = String(body.target_user_id == null ? '' : body.target_user_id).trim();
      const newRole = String(body.role == null ? '' : body.role).trim();
      if (!targetId) {
        return jsonResponse({ success: false, message: 'target_user_id is required.' }, 400);
      }
      if (newRole !== 'moderator' && newRole !== 'admin') {
        return jsonResponse({ success: false, message: 'role must be "moderator" or "admin".' }, 400);
      }

      if (newRole === 'admin' && auth.user.role !== 'super_admin') {
        return jsonResponse({ success: false, message: 'Only super admins can assign admins.' }, 403);
      }

      const target = await queryFirst(
        env,
        'SELECT id, role FROM user_accounts WHERE id = ?',
        [targetId]
      );
      if (!target) {
        return jsonResponse({ success: false, message: 'User not found.' }, 404);
      }
      if (target.id === auth.user.id) {
        return jsonResponse({ success: false, message: 'You cannot change your own role.' }, 403);
      }

      const targetCurrent = target.role || 'user';
      if (newRole === 'moderator') {
        if (targetCurrent !== 'user') {
          return jsonResponse({
            success: false,
            message: 'Target must currently be a regular user to become a moderator.',
          }, 409);
        }
        if (auth.user.role === 'admin') {
          const countRow = await queryFirst(
            env,
            `SELECT COUNT(*) AS c FROM user_accounts
               WHERE role = 'moderator' AND role_assigned_by = ?`,
            [auth.user.id]
          );
          if (Number(countRow?.c ?? 0) >= 3) {
            return jsonResponse({
              success: false,
              message: 'You already manage 3 moderators. Remove one before assigning another.',
            }, 409);
          }
        }
      } else {
        // newRole === 'admin'
        if (targetCurrent !== 'user' && targetCurrent !== 'moderator') {
          return jsonResponse({
            success: false,
            message: 'Only regular users or moderators can be promoted to admin.',
          }, 409);
        }
      }

      await execRun(
        env,
        `UPDATE user_accounts
           SET role = ?, role_assigned_by = ?, role_assigned_at = datetime('now'),
               updated_at = datetime('now')
           WHERE id = ?`,
        [newRole, auth.user.id, targetId]
      );

      return jsonResponse({ success: true, message: `Assigned ${newRole}.` });
    }

    if (method === 'POST' && pathname === '/api/admin/roles/remove') {
      const auth = await requireRole(request, env, 'admin');
      if (auth.response) return auth.response;
      const body = await parseJson(request);
      const targetId = String(body.target_user_id == null ? '' : body.target_user_id).trim();
      if (!targetId) {
        return jsonResponse({ success: false, message: 'target_user_id is required.' }, 400);
      }
      const target = await queryFirst(
        env,
        'SELECT id, role, role_assigned_by FROM user_accounts WHERE id = ?',
        [targetId]
      );
      if (!target) {
        return jsonResponse({ success: false, message: 'User not found.' }, 404);
      }
      if (target.id === auth.user.id) {
        return jsonResponse({ success: false, message: 'You cannot remove your own role.' }, 403);
      }
      const targetRole = target.role || 'user';
      if (targetRole === 'user') {
        return jsonResponse({ success: false, message: 'Target has no elevated role.' }, 409);
      }
      if (targetRole === 'super_admin') {
        return jsonResponse({ success: false, message: 'Cannot demote a super admin.' }, 403);
      }

      if (auth.user.role === 'admin') {
        if (targetRole !== 'moderator' || target.role_assigned_by !== auth.user.id) {
          return jsonResponse({
            success: false,
            message: 'Admins can only remove moderators they assigned.',
          }, 403);
        }
      }
      // super_admin: any moderator or admin allowed (checked above)

      await execRun(
        env,
        `UPDATE user_accounts
           SET role = 'user', role_assigned_by = NULL, role_assigned_at = NULL,
               updated_at = datetime('now')
           WHERE id = ?`,
        [targetId]
      );

      return jsonResponse({ success: true, message: 'Role removed.' });
    }

    if (method === 'POST' && pathname === '/api/oauth/authorize/validate') {
      const auth = await requireUserAuth(request, env);
      if (auth.response) return auth.response;
      const body = await parseJson(request);
      const clientId = body.client_id != null ? String(body.client_id).trim() : '';
      const redirectUri = body.redirect_uri != null ? String(body.redirect_uri).trim() : '';
      const responseType = body.response_type != null ? String(body.response_type).trim() : '';
      const rawScope = body.scope != null ? String(body.scope) : '';
      if (responseType !== 'code') {
        return jsonResponse({ success: false, message: 'Only response_type=code is supported.' }, 400);
      }
      if (!clientId) {
        return jsonResponse({ success: false, message: 'client_id is required.' }, 400);
      }
      const client = await queryFirst(
        env,
        'SELECT * FROM oauth_clients WHERE client_id = ? AND is_active = 1',
        [clientId]
      );
      if (!client) {
        return jsonResponse({ success: false, message: 'Unknown OAuth client.' }, 404);
      }
      let allowedRedirectUris, allowedScopes;
      try {
        allowedRedirectUris = parseJsonArrayField(client.allowed_redirect_uris, 'allowed_redirect_uris');
        allowedScopes = parseJsonArrayField(client.allowed_scopes, 'allowed_scopes');
      } catch (error) {
        return genericError('oauth_validate_client_config', error, 500, 'OAuth client is misconfigured.');
      }
      if (!validateRedirectUri(redirectUri, allowedRedirectUris)) {
        return jsonResponse({
          success: false,
          message: 'redirect_uri does not match any registered URI for this client.',
        }, 400);
      }
      let requested = parseScopeParam(rawScope);
      if (requested.length === 0) requested = ['basic'];
      const userHasWechat = Boolean(auth.user.wechat_id);
      const scopes = classifyScopes(requested, allowedScopes, userHasWechat);
      return jsonResponse({
        success: true,
        client: {
          client_id: client.client_id,
          display_name: client.display_name,
          icon_url: client.icon_url || null,
          allowed_domain: client.allowed_domain,
        },
        redirect_uri: redirectUri,
        scopes,
        user: { id: auth.user.id, username: auth.user.username_display },
        user_has_wechat: userHasWechat,
      });
    }

    if (method === 'POST' && pathname === '/api/oauth/authorize/grant') {
      const auth = await requireUserAuth(request, env);
      if (auth.response) return auth.response;
      const body = await parseJson(request);
      const clientId = body.client_id != null ? String(body.client_id).trim() : '';
      const redirectUri = body.redirect_uri != null ? String(body.redirect_uri).trim() : '';
      const rawScope = body.scope != null ? String(body.scope) : '';
      const state = body.state != null ? String(body.state) : '';
      const approvedScopesInput = Array.isArray(body.approved_scopes) ? body.approved_scopes : [];
      if (!clientId) {
        return jsonResponse({ success: false, message: 'client_id is required.' }, 400);
      }
      const client = await queryFirst(
        env,
        'SELECT * FROM oauth_clients WHERE client_id = ? AND is_active = 1',
        [clientId]
      );
      if (!client) {
        return jsonResponse({ success: false, message: 'Unknown OAuth client.' }, 404);
      }
      let allowedRedirectUris, allowedScopes;
      try {
        allowedRedirectUris = parseJsonArrayField(client.allowed_redirect_uris, 'allowed_redirect_uris');
        allowedScopes = parseJsonArrayField(client.allowed_scopes, 'allowed_scopes');
      } catch (error) {
        return genericError('oauth_grant_client_config', error, 500, 'OAuth client is misconfigured.');
      }
      if (!validateRedirectUri(redirectUri, allowedRedirectUris)) {
        return jsonResponse({
          success: false,
          message: 'redirect_uri does not match any registered URI for this client.',
        }, 400);
      }
      let requested = parseScopeParam(rawScope);
      if (requested.length === 0) requested = ['basic'];
      const userHasWechat = Boolean(auth.user.wechat_id);
      const classification = classifyScopes(requested, allowedScopes, userHasWechat);
      const approvedSet = new Set(approvedScopesInput.map((s) => String(s)));
      const finalGranted = classification.valid.filter((s) => approvedSet.has(s));
      if (finalGranted.length === 0) {
        return jsonResponse({
          success: true,
          redirect_url: buildOAuthRedirect(redirectUri, { error: 'invalid_scope', state }),
          granted_scopes: [],
        });
      }
      const code = randomHex(32);
      const codeHash = await sha256Hex(code);
      const expiresAt = new Date(Date.now() + OAUTH_CODE_TTL_SECONDS * 1000).toISOString();
      try {
        await execRun(
          env,
          `
            INSERT INTO oauth_authorization_codes
              (code_hash, client_id, user_id, redirect_uri, granted_scopes, expires_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
          `,
          [codeHash, clientId, auth.user.id, redirectUri, JSON.stringify(finalGranted), expiresAt]
        );
      } catch (error) {
        return genericError('oauth_grant_insert', error);
      }
      try {
        await execRun(
          env,
          'DELETE FROM oauth_authorization_codes WHERE expires_at < ?',
          [new Date(Date.now() - 60 * 60 * 1000).toISOString()]
        );
      } catch (error) {
        logServerError('oauth_grant_cleanup', error);
      }
      return jsonResponse({
        success: true,
        redirect_url: buildOAuthRedirect(redirectUri, { code, state }),
        granted_scopes: finalGranted,
      });
    }

    if (method === 'POST' && pathname === '/api/oauth/authorize/deny') {
      const auth = await requireUserAuth(request, env);
      if (auth.response) return auth.response;
      const body = await parseJson(request);
      const clientId = body.client_id != null ? String(body.client_id).trim() : '';
      const redirectUri = body.redirect_uri != null ? String(body.redirect_uri).trim() : '';
      const state = body.state != null ? String(body.state) : '';
      if (!clientId) {
        return jsonResponse({ success: false, message: 'client_id is required.' }, 400);
      }
      const client = await queryFirst(
        env,
        'SELECT * FROM oauth_clients WHERE client_id = ? AND is_active = 1',
        [clientId]
      );
      if (!client) {
        return jsonResponse({ success: false, message: 'Unknown OAuth client.' }, 404);
      }
      let allowedRedirectUris;
      try {
        allowedRedirectUris = parseJsonArrayField(client.allowed_redirect_uris, 'allowed_redirect_uris');
      } catch (error) {
        return genericError('oauth_deny_client_config', error, 500, 'OAuth client is misconfigured.');
      }
      if (!validateRedirectUri(redirectUri, allowedRedirectUris)) {
        return jsonResponse({
          success: false,
          message: 'redirect_uri does not match any registered URI for this client.',
        }, 400);
      }
      return jsonResponse({
        success: true,
        redirect_url: buildOAuthRedirect(redirectUri, { error: 'access_denied', state }),
      });
    }

    if (method === 'POST' && pathname === '/api/oauth/token') {
      const body = await parseJson(request);
      const grantType = body.grant_type != null ? String(body.grant_type).trim() : '';
      const clientId = body.client_id != null ? String(body.client_id).trim() : '';
      const clientSecret = body.client_secret != null ? String(body.client_secret) : '';
      const code = body.code != null ? String(body.code).trim() : '';
      const redirectUri = body.redirect_uri != null ? String(body.redirect_uri).trim() : '';
      if (grantType !== 'authorization_code') {
        return jsonResponse({ success: false, message: 'Only grant_type=authorization_code is supported.' }, 400);
      }
      if (!clientId || !clientSecret || !code || !redirectUri) {
        return jsonResponse({
          success: false,
          message: 'client_id, client_secret, code, and redirect_uri are required.',
        }, 400);
      }
      const client = await queryFirst(
        env,
        'SELECT * FROM oauth_clients WHERE client_id = ? AND is_active = 1',
        [clientId]
      );
      let presentedHmac;
      try {
        presentedHmac = await hmacSensitive(env, 'oauth_client_secret', clientSecret);
      } catch (error) {
        return genericError('oauth_token_hmac', error, 500, 'Server configuration error.');
      }
      if (!client) {
        return jsonResponse({ success: false, message: 'Invalid client credentials.' }, 401);
      }
      const expectedHmac = String(client.client_secret_hmac || '');
      const presentedBytes = new TextEncoder().encode(presentedHmac || '');
      const expectedBytes = new TextEncoder().encode(expectedHmac);
      if (!timingSafeEqual(presentedBytes, expectedBytes)) {
        return jsonResponse({ success: false, message: 'Invalid client credentials.' }, 401);
      }
      const codeHash = await sha256Hex(code);
      const row = await queryFirst(
        env,
        'SELECT * FROM oauth_authorization_codes WHERE code_hash = ?',
        [codeHash]
      );
      if (!row) {
        return jsonResponse({ success: false, message: 'Invalid authorization code.' }, 400);
      }
      if (row.client_id !== clientId) {
        return jsonResponse({ success: false, message: 'Authorization code was not issued to this client.' }, 400);
      }
      if (row.redirect_uri !== redirectUri) {
        return jsonResponse({ success: false, message: 'redirect_uri does not match the original authorize request.' }, 400);
      }
      if (row.consumed_at != null) {
        // TODO: OAuth replay defense — invalidate all other unused codes for
        // this (client_id, user_id) when a consumed code is presented again.
        return jsonResponse({ success: false, message: 'Authorization code has already been used.' }, 400);
      }
      if (new Date(row.expires_at) <= new Date()) {
        try {
          await execRun(env, 'DELETE FROM oauth_authorization_codes WHERE code_hash = ?', [codeHash]);
        } catch (error) {
          logServerError('oauth_token_expired_cleanup', error);
        }
        return jsonResponse({ success: false, message: 'Authorization code has expired.' }, 400);
      }
      const consumeResult = await execRun(
        env,
        "UPDATE oauth_authorization_codes SET consumed_at = datetime('now') WHERE code_hash = ? AND consumed_at IS NULL",
        [codeHash]
      );
      if (Number(consumeResult?.meta?.changes || 0) === 0) {
        return jsonResponse({ success: false, message: 'Authorization code has already been used.' }, 400);
      }
      const user = await queryFirst(env, 'SELECT * FROM user_accounts WHERE id = ?', [row.user_id]);
      if (!user) {
        return jsonResponse({ success: false, message: 'User account no longer exists.' }, 410);
      }
      let grantedScopes;
      try {
        grantedScopes = parseJsonArrayField(row.granted_scopes, 'granted_scopes');
      } catch (error) {
        return genericError('oauth_token_scopes', error, 500, 'Stored grant is malformed.');
      }
      const response = {
        success: true,
        scope: grantedScopes.join(' '),
        user: {
          user_id: user.id,
          username_display: user.username_display,
        },
      };
      const wantsVerification = grantedScopes.includes('verification');
      const wantsWechat = grantedScopes.includes('wechat');
      let partial = false;
      if ((wantsVerification || wantsWechat) && user.wechat_id) {
        const accountRow = await queryFirst(
          env,
          `SELECT wechat_id, verified_status, verification_method, verification_time, reverified_at
             FROM accounts WHERE wechat_id = ?`,
          [user.wechat_id]
        );
        if (wantsVerification) {
          if (accountRow) {
            response.verification = {
              verified_status: Number(accountRow.verified_status) === 1,
              verification_method: accountRow.verification_method || null,
              verification_time: accountRow.verification_time || null,
              reverified_at: accountRow.reverified_at || null,
            };
          } else {
            partial = true;
          }
        }
        if (wantsWechat) {
          response.wechat = { wechat_id: user.wechat_id };
        }
      } else if (wantsVerification || wantsWechat) {
        partial = true;
      }
      if (partial) response.partial = true;
      return jsonResponse(response);
    }

    // --------------------------------------------------------------------
    // Developer panel: OAuth client self-service CRUD.
    // Any logged-in user may create + manage their own clients. Rows with
    // owner_user_id NULL are maintainer-owned and not exposed here.
    // --------------------------------------------------------------------

    const DEVELOPER_OAUTH_CLIENT_CAP = 25;

    if (method === 'GET' && pathname === '/api/developers/oauth-clients') {
      const auth = await requireUserAuth(request, env);
      if (auth.response) return auth.response;
      const rows = await queryAll(
        env,
        `SELECT client_id, display_name, icon_url, allowed_domain, allowed_redirect_uris,
                allowed_scopes, is_active, created_at, updated_at
           FROM oauth_clients
          WHERE owner_user_id = ?
          ORDER BY datetime(created_at) DESC`,
        [auth.user.id]
      );
      const clients = rows.map((row) => serializeDeveloperOauthClient(row));
      return jsonResponse({ success: true, clients });
    }

    if (method === 'POST' && pathname === '/api/developers/oauth-clients') {
      const auth = await requireUserAuth(request, env);
      if (auth.response) return auth.response;
      const body = await parseJson(request);
      const validation = validateDeveloperOauthClientInput(body, { requireAll: true });
      if (!validation.ok) {
        return jsonResponse({ success: false, message: validation.message }, 400);
      }
      const countRow = await queryFirst(
        env,
        'SELECT COUNT(*) AS n FROM oauth_clients WHERE owner_user_id = ?',
        [auth.user.id]
      );
      if (Number(countRow?.n || 0) >= DEVELOPER_OAUTH_CLIENT_CAP) {
        return jsonResponse({
          success: false,
          message: `You have reached the limit of ${DEVELOPER_OAUTH_CLIENT_CAP} OAuth clients.`,
        }, 409);
      }
      const clientId = randomHex(16);
      const clientSecret = randomHex(32);
      let clientSecretHmac;
      try {
        clientSecretHmac = await hmacSensitive(env, 'oauth_client_secret', clientSecret);
      } catch (error) {
        return genericError('developer_oauth_create_hmac', error, 500, 'Server configuration error.');
      }
      try {
        await execRun(
          env,
          `INSERT INTO oauth_clients
             (client_id, client_secret_hmac, display_name, icon_url, allowed_domain,
              allowed_redirect_uris, allowed_scopes, is_active, owner_user_id,
              created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, datetime('now'), datetime('now'))`,
          [
            clientId,
            clientSecretHmac,
            validation.value.display_name,
            validation.value.icon_url,
            validation.value.allowed_domain,
            JSON.stringify(validation.value.allowed_redirect_uris),
            JSON.stringify(validation.value.allowed_scopes),
            auth.user.id,
          ]
        );
      } catch (error) {
        return genericError('developer_oauth_create_insert', error);
      }
      const row = await queryFirst(
        env,
        `SELECT client_id, display_name, icon_url, allowed_domain, allowed_redirect_uris,
                allowed_scopes, is_active, created_at, updated_at
           FROM oauth_clients WHERE client_id = ?`,
        [clientId]
      );
      return jsonResponse({
        success: true,
        client: serializeDeveloperOauthClient(row),
        client_secret: clientSecret,
        message: 'Save the client_secret now. It will not be shown again.',
      });
    }

    {
      const clientRouteMatch = pathname.match(
        /^\/api\/developers\/oauth-clients\/([A-Za-z0-9_-]+)(\/rotate-secret)?$/
      );
      if (clientRouteMatch) {
        const targetClientId = clientRouteMatch[1];
        const isRotate = Boolean(clientRouteMatch[2]);
        const auth = await requireUserAuth(request, env);
        if (auth.response) return auth.response;
        const row = await queryFirst(
          env,
          'SELECT * FROM oauth_clients WHERE client_id = ? AND owner_user_id = ?',
          [targetClientId, auth.user.id]
        );
        if (!row) {
          return jsonResponse({ success: false, message: 'OAuth client not found.' }, 404);
        }

        if (method === 'GET' && !isRotate) {
          return jsonResponse({ success: true, client: serializeDeveloperOauthClient(row) });
        }

        if (method === 'PATCH' && !isRotate) {
          const body = await parseJson(request);
          const merged = {
            display_name: body.display_name !== undefined ? body.display_name : row.display_name,
            icon_url: body.icon_url !== undefined ? body.icon_url : row.icon_url,
            allowed_domain: body.allowed_domain !== undefined ? body.allowed_domain : row.allowed_domain,
            allowed_redirect_uris: body.allowed_redirect_uris !== undefined
              ? body.allowed_redirect_uris
              : parseJsonArrayField(row.allowed_redirect_uris, 'allowed_redirect_uris'),
            allowed_scopes: body.allowed_scopes !== undefined
              ? body.allowed_scopes
              : parseJsonArrayField(row.allowed_scopes, 'allowed_scopes'),
          };
          const validation = validateDeveloperOauthClientInput(merged, { requireAll: true });
          if (!validation.ok) {
            return jsonResponse({ success: false, message: validation.message }, 400);
          }
          const nextActive = body.is_active === undefined
            ? row.is_active
            : (body.is_active ? 1 : 0);
          try {
            await execRun(
              env,
              `UPDATE oauth_clients
                  SET display_name = ?, icon_url = ?, allowed_domain = ?,
                      allowed_redirect_uris = ?, allowed_scopes = ?, is_active = ?,
                      updated_at = datetime('now')
                WHERE client_id = ? AND owner_user_id = ?`,
              [
                validation.value.display_name,
                validation.value.icon_url,
                validation.value.allowed_domain,
                JSON.stringify(validation.value.allowed_redirect_uris),
                JSON.stringify(validation.value.allowed_scopes),
                nextActive,
                targetClientId,
                auth.user.id,
              ]
            );
          } catch (error) {
            return genericError('developer_oauth_update', error);
          }
          const updated = await queryFirst(
            env,
            `SELECT client_id, display_name, icon_url, allowed_domain, allowed_redirect_uris,
                    allowed_scopes, is_active, created_at, updated_at
               FROM oauth_clients WHERE client_id = ?`,
            [targetClientId]
          );
          return jsonResponse({ success: true, client: serializeDeveloperOauthClient(updated) });
        }

        if (method === 'POST' && isRotate) {
          const newSecret = randomHex(32);
          let newHmac;
          try {
            newHmac = await hmacSensitive(env, 'oauth_client_secret', newSecret);
          } catch (error) {
            return genericError('developer_oauth_rotate_hmac', error, 500, 'Server configuration error.');
          }
          try {
            await execRun(
              env,
              `UPDATE oauth_clients
                  SET client_secret_hmac = ?, updated_at = datetime('now')
                WHERE client_id = ? AND owner_user_id = ?`,
              [newHmac, targetClientId, auth.user.id]
            );
          } catch (error) {
            return genericError('developer_oauth_rotate_update', error);
          }
          return jsonResponse({
            success: true,
            client_secret: newSecret,
            message: 'Save the new client_secret now. It will not be shown again.',
          });
        }

        if (method === 'DELETE' && !isRotate) {
          try {
            await execRun(
              env,
              'DELETE FROM oauth_authorization_codes WHERE client_id = ?',
              [targetClientId]
            );
            await execRun(
              env,
              'DELETE FROM oauth_clients WHERE client_id = ? AND owner_user_id = ?',
              [targetClientId, auth.user.id]
            );
          } catch (error) {
            return genericError('developer_oauth_delete', error);
          }
          return jsonResponse({ success: true });
        }

        return jsonResponse({ success: false, message: 'Method not allowed.' }, 405);
      }
    }

  return jsonResponse({ success: false, message: 'Route not found.' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    if (request.method.toUpperCase() === 'OPTIONS') {
      return corsPreflightResponse(request, env);
    }

    let response;
    try {
      response = await handleRequest(request, env, ctx);
    } catch (error) {
      response = genericError('unhandled_request_error', error, 500, 'Internal server error.', {
        method: request.method,
        url: request.url,
      });
    }
    return withCors(response, request, env);
  },
};
