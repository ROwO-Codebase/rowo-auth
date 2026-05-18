#!/usr/bin/env node
// One-off helper: compute the v2 HMAC of an OAuth client_secret in the same
// format the worker stores (hmacSensitive(env, 'oauth_client_secret', secret)).
// Usage: node backend/scripts/compute_oauth_secret_hmac.mjs <secret> <SENSITIVE_DATA_HASH_SECRET>

import { createHmac } from 'node:crypto';

const [, , secret, hashSecret] = process.argv;
if (!secret || !hashSecret) {
  console.error('Usage: node backend/scripts/compute_oauth_secret_hmac.mjs <secret> <SENSITIVE_DATA_HASH_SECRET>');
  process.exit(1);
}

const hex = createHmac('sha256', hashSecret).update('oauth_client_secret:' + secret).digest('hex');
console.log('v2:' + hex);
