import React, { useState } from 'react';
import { Loader2, KeyRound, ShieldCheck, AlertTriangle, LifeBuoy } from 'lucide-react';
import { startAuthentication } from '@simplewebauthn/browser';
import type { TwoFactorMethod } from '@rowo/shared/session';

export interface TwoFactorSubmitValues {
  totp_code?: string;
  passkey_assertion?: unknown;
  passkey_challenge_token?: string;
  recovery_code?: string;
}

interface Props {
  availableMethods: TwoFactorMethod[];
  webauthnOptions?: unknown | null;
  passkeyChallengeToken?: string | null;
  fetchPasskeyChallenge?: () => Promise<{ options: unknown; challenge_token: string }>;
  onSubmit: (values: TwoFactorSubmitValues) => Promise<void> | void;
  busy?: boolean;
  errorMessage?: string | null;
  compact?: boolean;
}

type Tab = 'totp' | 'passkey' | 'recovery';

function pickInitialTab(available: TwoFactorMethod[]): Tab | null {
  if (available.includes('totp')) return 'totp';
  if (available.includes('passkey')) return 'passkey';
  if (available.includes('recovery')) return 'recovery';
  return null;
}

export function TwoFactorChallengeForm({
  availableMethods,
  webauthnOptions,
  passkeyChallengeToken,
  fetchPasskeyChallenge,
  onSubmit,
  busy = false,
  errorMessage = null,
  compact = false,
}: Props) {
  const [tab, setTab] = useState<Tab | null>(() => pickInitialTab(availableMethods));
  const [totpCode, setTotpCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [passkeyError, setPasskeyError] = useState<string | null>(null);
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  if (!tab) {
    return (
      <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-sm text-amber-800 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <span>No 2FA method is available on this account. Contact an admin for help.</span>
      </div>
    );
  }

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [];
  if (availableMethods.includes('totp')) {
    tabs.push({ id: 'totp', label: 'Authenticator', icon: <ShieldCheck className="w-4 h-4" /> });
  }
  if (availableMethods.includes('passkey')) {
    tabs.push({ id: 'passkey', label: 'Passkey', icon: <KeyRound className="w-4 h-4" /> });
  }
  if (availableMethods.includes('recovery')) {
    tabs.push({ id: 'recovery', label: 'Recovery code', icon: <LifeBuoy className="w-4 h-4" /> });
  }

  const handleTotpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = totpCode.trim();
    if (!/^\d{6}$/.test(code)) return;
    await onSubmit({ totp_code: code });
  };

  const handleRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = recoveryCode.trim();
    if (!code) return;
    await onSubmit({ recovery_code: code });
  };

  const handlePasskey = async () => {
    setPasskeyError(null);
    setPasskeyBusy(true);
    try {
      let options = webauthnOptions;
      let challengeToken = passkeyChallengeToken || undefined;
      if (!options) {
        if (!fetchPasskeyChallenge) {
          throw new Error('Passkey challenge unavailable.');
        }
        const fetched = await fetchPasskeyChallenge();
        options = fetched.options;
        challengeToken = fetched.challenge_token;
      }
      // @simplewebauthn/browser v10 accepts the JSON options object directly.
      const assertion = await startAuthentication(options as never);
      await onSubmit({
        passkey_assertion: assertion,
        passkey_challenge_token: challengeToken,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Passkey sign-in failed.';
      setPasskeyError(msg);
    } finally {
      setPasskeyBusy(false);
    }
  };

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {tabs.length > 1 && (
        <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-xl">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 min-w-[6rem] flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                tab === t.id
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'totp' && (
        <form onSubmit={handleTotpSubmit} className="space-y-2">
          <label className="block text-sm font-medium text-slate-700 mb-1 ml-1">
            Authenticator code
          </label>
          <input
            type="text"
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value.replace(/\s+/g, ''))}
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            autoComplete="one-time-code"
            placeholder="123456"
            className="block w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-mono tracking-widest text-center"
          />
          <button
            type="submit"
            disabled={busy || totpCode.trim().length !== 6}
            className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {busy ? 'Verifying...' : 'Verify code'}
          </button>
        </form>
      )}

      {tab === 'passkey' && (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            Use your saved passkey to verify this action.
          </p>
          <button
            type="button"
            onClick={handlePasskey}
            disabled={busy || passkeyBusy}
            className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
          >
            {(busy || passkeyBusy) ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
            {busy || passkeyBusy ? 'Waiting for passkey...' : 'Use a passkey'}
          </button>
          {passkeyError && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{passkeyError}</span>
            </div>
          )}
        </div>
      )}

      {tab === 'recovery' && (
        <form onSubmit={handleRecoverySubmit} className="space-y-2">
          <label className="block text-sm font-medium text-slate-700 mb-1 ml-1">
            Recovery code
          </label>
          <input
            type="text"
            value={recoveryCode}
            onChange={(e) => setRecoveryCode(e.target.value)}
            autoComplete="off"
            placeholder="abcde-fghij"
            className="block w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-mono"
          />
          <p className="text-xs text-slate-500">
            Single-use. After this sign-in, regenerate your recovery codes from the User Center.
          </p>
          <button
            type="submit"
            disabled={busy || !recoveryCode.trim()}
            className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {busy ? 'Verifying...' : 'Use recovery code'}
          </button>
        </form>
      )}

      {errorMessage && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}

export default TwoFactorChallengeForm;
