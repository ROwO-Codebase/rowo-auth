import React from 'react';
import { motion } from 'motion/react';
import { Shield, Lock, Database, Trash2, Server } from 'lucide-react';

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto py-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12"
      >
        <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-sm border border-indigo-200">
          <Shield className="w-8 h-8 text-indigo-600" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 mb-4">
          Privacy Policy
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          We take your privacy seriously. Here is how we handle and protect your data.
        </p>
      </motion.div>

      <div className="space-y-8">
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200"
        >
          <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-3">
            <Lock className="w-6 h-6 text-indigo-600" />
            What We Collect
          </h2>
          <p className="text-slate-600 leading-relaxed mb-4">
            We collect only the data required to run identity verification workflows, moderation, and abuse prevention.
          </p>
          <ul className="space-y-3 text-slate-600 ml-2">
            <li className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2.5 shrink-0" />
              <span><strong>Account identifiers and status:</strong> WeChat ID, verification method/state, and verification timestamps.</span>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2.5 shrink-0" />
              <span><strong>Verification artifacts:</strong> email verification records, ADFS verification codes, and Discord verification cache records.</span>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-2.5 shrink-0" />
              <span><strong>Moderation/operations data:</strong> manual review notes, blacklist records, and rate-limit counters.</span>
            </li>
          </ul>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200"
        >
          <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-3">
            <Database className="w-6 h-6 text-emerald-600" />
            How Data Is Stored
          </h2>
          <p className="text-slate-600 leading-relaxed mb-4">
            We use <strong>HMAC-SHA-256</strong> to hash sensitive identifiers — including student IDs, student names, email addresses, and Discord/GitHub account identifiers used for deduplication — before they are written to our core account database. Raw values are never persisted in long-term storage.
          </p>

          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-4">
            <h3 className="text-sm font-bold text-indigo-900 mb-2">About HMAC-SHA-256</h3>
            <p className="text-sm text-indigo-900/80 leading-relaxed">
              HMAC-SHA-256 is a keyed-hash message authentication code defined in RFC 2104. It combines the SHA-256 cryptographic hash function with a secret key held only on our server, producing a 256-bit fingerprint of the input. Without the secret key, an attacker who obtains a database dump cannot brute-force the original values from the hash, even for low-entropy inputs like email addresses or student IDs. Because the function is deterministic for a given key and input, we can still detect duplicate identities and enforce uniqueness without ever retaining the raw data.
            </p>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4">
            <h3 className="text-sm font-bold text-emerald-900 mb-2">Migration to HMAC-SHA-256</h3>
            <p className="text-sm text-emerald-900/80 leading-relaxed">
              Historical accounts were hashed with a SHA-256 plus server-side pepper construction. We are migrating all stored hashes to HMAC-SHA-256 lazily — when an account is touched by a verification or re-authentication flow, its stored hash is automatically rewritten to the new format. You can check the status of your own account on the account query page: a green shield badge indicates HMAC-SHA-256, while an orange warning badge indicates the legacy SHA-256 hash, and offers a one-click re-verification to complete the upgrade.
            </p>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <h3 className="text-sm font-bold text-slate-900 mb-2">Important storage notes</h3>
            <ul className="space-y-2 text-sm text-slate-600">
              <li>- Some operational fields remain plaintext by design, including WeChat IDs and moderation/admin remarks.</li>
              <li>- Pending email verification rows store plaintext normalized email until completion or expiration handling.</li>
              <li>- Short-lived verification codes and rename tokens are stored as plain SHA-256 of high-entropy random values; they expire within ten minutes.</li>
              <li>- We do not return internal exception details to API clients; detailed errors stay in server-side logs.</li>
            </ul>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200"
        >
          <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-3">
            <Server className="w-6 h-6 text-purple-600" />
            Service Providers (Subprocessors)
          </h2>
          <p className="text-slate-600 leading-relaxed mb-4">
            We rely on third-party infrastructure providers to run specific parts of the service:
          </p>
          <ul className="space-y-3 text-slate-600 ml-2">
            <li className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-2.5 shrink-0" />
              <span><strong>Cloudflare</strong>: hosts Worker runtime and D1 database.</span>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-2.5 shrink-0" />
              <span><strong>AWS SES</strong>: processes recipient email and email body to deliver verification codes.</span>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-1.5 h-1.5 rounded-full bg-purple-500 mt-2.5 shrink-0" />
              <span><strong>Discord</strong>: OAuth and guild/role checks for Discord-based verification workflows.</span>
            </li>
          </ul>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200"
        >
          <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-3">
            <Trash2 className="w-6 h-6 text-red-600" />
            Retention and Removal
          </h2>
          <p className="text-slate-600 leading-relaxed mb-4">
            Retention varies by data type and workflow state:
          </p>
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6">
            <ul className="space-y-2 text-sm text-slate-600">
              <li>- Email and ADFS verification artifacts are short-lived (minutes) and removed on successful completion or expiry handling paths.</li>
              <li>- Rename tokens are short-lived and removed after use or invalidation.</li>
              <li>- Rate-limit buckets are periodically pruned by backend logic.</li>
              <li>- Verified account records, moderation notes, and blacklist/admin records are retained until updated or manually removed.</li>
            </ul>
          </div>
          <p className="text-slate-600 leading-relaxed mb-4">
            If you want your data removed, contact support and we will process the request through our operational workflow.
          </p>
          <div className="mt-6">
            <a
              href="mailto:dev@rowo.link"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl font-medium hover:bg-slate-800 transition-colors shadow-sm"
            >
              Contact Support
            </a>
          </div>
        </motion.section>
      </div>
    </div>
  );
}
