import React, { useState } from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';
import {
  authHeaders,
  type TwoFactorMethod,
  type TwoFactorPasskey,
  type TwoFactorSummary,
} from '@rowo/shared/session';
import { ModalShell } from './ModalShell';
import { TwoFactorChallengeForm, type TwoFactorSubmitValues } from './TwoFactorChallengeForm';

interface Props {
  onClose: () => void;
  onChanged: (summary: TwoFactorSummary) => void;
  passkey: TwoFactorPasskey;
  availableMethods: TwoFactorMethod[];
}

export function PasskeyDeleteModal({ onClose, onChanged, passkey, availableMethods }: Props) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [showFactor, setShowFactor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (factor: TwoFactorSubmitValues) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `${__API_ENDPOINT__}/api/user/2fa/passkeys/${encodeURIComponent(passkey.id)}`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ current_password: currentPassword, ...factor }),
        }
      );
      const data = await res.json();
      if (!data.success) {
        setError(data.message || 'Could not remove passkey.');
        setBusy(false);
        return;
      }
      onChanged(data.two_factor);
      onClose();
    } catch {
      setError('Network error.');
      setBusy(false);
    }
  };

  const fetchPasskeyChallenge = async () => {
    const res = await fetch(`${__API_ENDPOINT__}/api/user/2fa/passkey/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ purpose: 'reauth' }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Could not fetch passkey challenge.');
    return { options: data.options, challenge_token: data.challenge_token };
  };

  return (
    <ModalShell
      onClose={onClose}
      title="Remove passkey"
      icon={<Trash2 className="w-5 h-5 text-red-600" />}
    >
      <div className="space-y-3">
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-sm text-amber-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            You're removing the passkey{' '}
            <span className="font-semibold">"{passkey.nickname}"</span>. This action can't be
            undone — re-register the device from scratch to use it again.
          </span>
        </div>

        {!showFactor ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (currentPassword) setShowFactor(true);
            }}
            className="space-y-3"
          >
            <div>
              <label htmlFor="cp-rm-passkey" className="block text-sm font-medium text-slate-700 mb-1 ml-1">
                Current password
              </label>
              <input
                id="cp-rm-passkey"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="block w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 px-4 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!currentPassword}
                className="flex-1 py-2.5 px-4 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-sm font-medium rounded-xl shadow-sm transition-colors"
              >
                Continue
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Confirm with a 2FA factor.</p>
            <TwoFactorChallengeForm
              availableMethods={availableMethods}
              onSubmit={submit}
              busy={busy}
              errorMessage={error}
              fetchPasskeyChallenge={fetchPasskeyChallenge}
            />
          </div>
        )}
      </div>
    </ModalShell>
  );
}

export default PasskeyDeleteModal;
