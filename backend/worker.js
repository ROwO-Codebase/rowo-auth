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

function generateRenameToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

const RENAME_TOKEN_TTL_MS = 10 * 60 * 1000;

async function createRenameToken(env, wechatId) {
  const token = generateRenameToken();
  const tokenHash = await sha256Hex(token);
  const expiresAt = new Date(Date.now() + RENAME_TOKEN_TTL_MS).toISOString();
  await execRun(
    env,
    "INSERT INTO rename_tokens (token_hash, wechat_id, expires_at, created_at) VALUES (?, ?, ?, datetime('now'))",
    [tokenHash, wechatId, expiresAt]
  );
  return { token, expiresAt };
}

async function consumeRenameToken(env, token) {
  const tokenHash = await sha256Hex(String(token));
  const row = await queryFirst(env, 'SELECT wechat_id, expires_at FROM rename_tokens WHERE token_hash = ?', [tokenHash]);
  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    await execRun(env, 'DELETE FROM rename_tokens WHERE token_hash = ?', [tokenHash]);
    return null;
  }
  await execRun(env, 'DELETE FROM rename_tokens WHERE token_hash = ?', [tokenHash]);
  return row.wechat_id;
}

async function invalidateRenameToken(env, token) {
  const tokenHash = await sha256Hex(String(token));
  await execRun(env, 'DELETE FROM rename_tokens WHERE token_hash = ?', [tokenHash]);
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
        FROM admins
        WHERE manual_notification_enabled = 1
          AND notification_email IS NOT NULL
          AND TRIM(notification_email) != ''
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

async function requireAuth(request, env) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

  if (!token) {
    return { response: jsonResponse({ success: false, message: 'Unauthorized' }, 401) };
  }

  const admin = await queryFirst(env, 'SELECT * FROM admins WHERE access_token = ?', [token]);
  if (!admin) {
    return { response: jsonResponse({ success: false, message: 'Invalid token' }, 401) };
  }

  return { admin };
}

async function requireAdmin(request, env) {
  const auth = await requireAuth(request, env);
  if (auth.response) {
    return auth;
  }
  if (auth.admin.role !== 'admin') {
    return { response: jsonResponse({ success: false, message: 'Forbidden: Admins only' }, 403) };
  }
  return auth;
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
          if (val == null) continue;
          anyHashed = true;
          if (!String(val).startsWith('v2:')) anyLegacy = true;
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
          const { token, expiresAt } = await createRenameToken(env, wechat_id);
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
            rename_token: token,
            rename_token_expires_at: expiresAt,
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

      return jsonResponse({ success: true, message: 'Verified successfully via ADFS.' });
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
          const { token, expiresAt } = await createRenameToken(env, wechat_id);
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
            rename_token: token,
            rename_token_expires_at: expiresAt,
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

      return jsonResponse({ success: true, message: 'Verified successfully via Email.' });
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
          const { token, expiresAt } = await createRenameToken(env, wechat_id);
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
            rename_token: token,
            rename_token_expires_at: expiresAt,
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

      return jsonResponse({
        success: true,
        message: 'Discord account connected and WeChat ID verified.',
        discord_id: body.discord_id,
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
          const { token, expiresAt } = await createRenameToken(env, wechat_id);
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
            rename_token: token,
            rename_token_expires_at: expiresAt,
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

      return jsonResponse({
        success: true,
        message: 'GitHub account connected and WeChat ID verified.',
        github_id: body.github_id,
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

      return jsonResponse({
        success: true,
        message: 'Manual Verification application submitted and is pending approval.',
      });
    }

    if (method === 'POST' && pathname === '/api/account/rename') {
      const body = await parseJson(request);
      const { rename_token, new_wechat_id } = body;
      const newId = new_wechat_id != null ? String(new_wechat_id).trim() : '';
      if (!rename_token || !newId) {
        return jsonResponse({ success: false, message: 'rename_token and new_wechat_id are required.' }, 400);
      }
      const oldWechatId = await consumeRenameToken(env, rename_token);
      if (!oldWechatId) {
        return jsonResponse({ success: false, message: 'Invalid or expired rename token.' }, 400);
      }
      if (oldWechatId === newId) {
        return jsonResponse({ success: false, message: 'new_wechat_id must be different from current WeChat ID.' }, 400);
      }
      const existingNew = await queryFirst(env, 'SELECT wechat_id FROM accounts WHERE wechat_id = ?', [newId]);
      if (existingNew) {
        return jsonResponse({ success: false, message: 'The new WeChat ID is already in use.' }, 409);
      }
      const row = await queryFirst(env, 'SELECT * FROM accounts WHERE wechat_id = ?', [oldWechatId]);
      if (!row) {
        return jsonResponse({ success: false, message: 'Account not found.' }, 404);
      }
      const oneYearMs = 365 * 24 * 60 * 60 * 1000;
      const lastRenameAt = row.last_rename_at ? Date.parse(String(row.last_rename_at)) : 0;
      if (Number.isFinite(lastRenameAt) && Date.now() - lastRenameAt < oneYearMs) {
        const nextEligibleAt = new Date(lastRenameAt + oneYearMs).toISOString();
        return jsonResponse(
          {
            success: false,
            message: 'You can only change your WeChat ID once per year, you will be able to change it again on ' + nextEligibleAt + ' (UTC).'
          },
          429
        );
      }
      await execRun(
        env,
        `
          INSERT INTO accounts (wechat_id, verified_status, verification_method, verification_time, student_id, student_name, email, discord_id, github_id, manual_status, manual_reason, manual_admin, manual_time, reverified_at, last_rename_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
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
          row.reverified_at ?? null
        ]
      );
      await execRun(env, 'UPDATE account_info SET wechat_id = ? WHERE wechat_id = ?', [newId, oldWechatId]);
      await execRun(env, 'UPDATE account_blacklist SET wechat_id = ? WHERE wechat_id = ?', [newId, oldWechatId]);
      await execRun(env, 'DELETE FROMemail_verification_codes WHERE wechat_id = ?', [oldWechatId]);
      await execRun(env, 'DELETE FROM accounts WHERE wechat_id = ?', [oldWechatId]);
      const changeBody = `WeChat ID was changed from **${oldWechatId}** to **${newId}**.`;
      await execRun(
        env,
        `
          INSERT INTO account_info (wechat_id, color, icon, title, body, creator, visibility)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [newId, 'emerald', 'pencil', 'WeChat ID changed', changeBody, 'SYSTEM', 'public']
      );
      return jsonResponse({
        success: true,
        message: 'WeChat ID changed successfully.',
        wechat_id: newId,
      });
    }

    if (method === 'POST' && pathname === '/api/account/rename/invalidate') {
      const body = await parseJson(request);
      const { rename_token } = body;
      if (!rename_token) {
        return jsonResponse({ success: false, message: 'rename_token is required.' }, 400);
      }
      await invalidateRenameToken(env, rename_token);
      return jsonResponse({ success: true, message: 'Rename token invalidated.' });
    }

    if (method === 'GET' && pathname === '/api/admin/stats') {
      const auth = await requireAuth(request, env);
      if (auth.response) return auth.response;

      const verifiedRow = await queryFirst(env, 'SELECT COUNT(*) as count FROM accounts WHERE verified_status = 1');
      const verified_count = Number(verifiedRow?.count ?? 0);
      
      const statsRow = await queryFirst(env, "SELECT value FROM stats WHERE key = 'account_queries' LIMIT 1");
      const account_queries = Number(statsRow?.value ?? 0);
      
      return jsonResponse({ success: true, verified_count, account_queries });
    }

    if (method === 'GET' && pathname === '/api/admin/accounts') {
      const auth = await requireAuth(request, env);
      if (auth.response) return auth.response;

      let accounts;
      if (auth.admin.role === 'moderator') {
        accounts = await queryAll(
          env,
          `
            SELECT * FROM accounts
            WHERE manual_status = 'pending'
            ORDER BY verification_time DESC
          `
        );
      } else {
        accounts = await queryAll(
          env,
          `
            SELECT * FROM accounts
            ORDER BY
              CASE WHEN manual_status = 'pending' THEN 0 ELSE 1 END,
              verification_time DESC
          `
        );
      }

      return jsonResponse({
        success: true,
        accounts,
        admin: { username: auth.admin.username, role: auth.admin.role },
      });
    }

    const adminInfoMatch = pathname.match(/^\/api\/admin\/accounts\/([^/]+)\/info$/);
    if (method === 'GET' && adminInfoMatch) {
      const auth = await requireAuth(request, env);
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
      const auth = await requireAdmin(request, env);
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
      const auth = await requireAdmin(request, env);
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
      const auth = await requireAdmin(request, env);
      if (auth.response) return auth.response;

      const id = decodeURIComponent(adminEditInfoMatch[1]);
      await execRun(env, 'DELETE FROM account_info WHERE id = ?', [id]);
      return jsonResponse({ success: true });
    }

    const revokeMatch = pathname.match(/^\/api\/admin\/accounts\/([^/]+)\/(revoke|unrevoke)$/);
    if (method === 'POST' && revokeMatch) {
      const auth = await requireAdmin(request, env);
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
      const auth = await requireAuth(request, env);
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
      const auth = await requireAuth(request, env);
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
      const auth = await requireAdmin(request, env);
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
      const auth = await requireAdmin(request, env);
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
      const auth = await requireAdmin(request, env);
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
      const auth = await requireAdmin(request, env);
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
      const auth = await requireAuth(request, env);
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

    if (method === 'POST' && pathname === '/api/admin/rotate-token') {
      const auth = await requireAuth(request, env);
      if (auth.response) return auth.response;

      const newToken = `${crypto.randomUUID()}${Date.now().toString(36)}`;
      await execRun(env, 'UPDATE admins SET access_token = ? WHERE id = ?', [newToken, auth.admin.id]);
      return jsonResponse({ success: true, token: newToken });
    }

    if (method === 'GET' && pathname === '/api/admin/preferences') {
      const auth = await requireAuth(request, env);
      if (auth.response) return auth.response;

      const row = await queryFirst(
        env,
        'SELECT notification_email, manual_notification_enabled FROM admins WHERE id = ?',
        [auth.admin.id]
      );
      return jsonResponse({
        success: true,
        notification_email: row?.notification_email || null,
        manual_notification_enabled: Number(row?.manual_notification_enabled || 0) === 1,
      });
    }

    if (method === 'POST' && pathname === '/api/admin/preferences') {
      const auth = await requireAuth(request, env);
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
        await execRun(env, `UPDATE admins SET ${updates.join(', ')} WHERE id = ?`, params);
      }

      return jsonResponse({
        success: true,
        notification_email: effectiveEmail,
        manual_notification_enabled: effectiveEnabled === 1,
      });
    }

    if (method === 'POST' && pathname === '/api/admin/login') {
      const body = await parseJson(request);
      const { token } = body;
      const admin = await queryFirst(env, 'SELECT * FROM admins WHERE access_token = ?', [token]);

      if (admin) {
        return jsonResponse({ success: true, role: admin.role });
      }

      return jsonResponse({ success: false, message: 'Invalid access token' }, 401);
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
