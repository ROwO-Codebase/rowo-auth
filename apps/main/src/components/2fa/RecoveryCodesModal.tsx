import React, { useState } from 'react';
import { LifeBuoy, RefreshCw, AlertTriangle, Loader2 } from 'lucide-react';
import {
  authHeaders,
  type TwoFactorMethod,
  type TwoFactorSummary,
} from '@rowo/shared/session';
import { ModalShell } from './ModalShell';
import { TwoFactorChallengeForm, type TwoFactorSubmitValues } from './TwoFactorChallengeForm';
import { RecoveryCodesView } from './RecoveryCodesView';

interface Props {
  onClose: () => void;
  onChanged: (summary: TwoFactorSummary) => void;
  summary: TwoFactorSummary;
  availableMethods: TwoFactorMethod[];
}

export function RecoveryCodesModal({ onClose, onChanged, summary, availableMethods }: Props) {
  const [stage, setStage] = useState<'status' | 'password' | 'factor' | 'view'>('status');
  const [currentPassword, setCurrentPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);

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

  const submit = async (factor: TwoFactorSubmitValues) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${__API_ENDPOINT__}/api/user/2fa/recovery-codes/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ current_password: currentPassword, ...factor }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || 'Could not regenerate recovery codes.');
        setBusy(false);
        return;
      }
      setCodes(data.recovery_codes as string[]);
      setStage('view');
      setBusy(false);
      // Parent refresh is deferred to onAcknowledge — calling onChanged here
      // would set loading=true in SessionContext and unmount the page (along
      // with this modal) while the user is reading the codes.
    } catch {
      setError('Network error.');
      setBusy(false);
    }
  };

  return (
    <ModalShell
      onClose={onClose}
      title="Recovery codes"
      icon={<LifeBuoy className="w-5 h-5 text-indigo-600" />}
    >
      {stage === 'status' && (
        <div className="space-y-3">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1">
            <div className="text-sm">
              <span className="font-semibold text-slate-900">
                {summary.recovery_codes_remaining} of {summary.recovery_codes_total || 10}
              </span>{' '}
              codes remaining
            </div>
            {summary.recovery_codes_generated_at && (
              <div className="text-xs text-slate-500">
                Current set generated {new Date(summary.recovery_codes_generated_at).toLocaleString()}
              </div>
            )}
          </div>
          {summary.recovery_codes_remaining < 3 && summary.recovery_codes_total > 0 && (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-sm text-amber-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>You're running low on recovery codes. Regenerate to get a fresh set of 10.</span>
            </div>
          )}
          <p className="text-xs text-slate-500">
            Regenerating invalidates the old set. We'll ask for your password and a 2FA factor.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => setStage('password')}
              className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Regenerate
            </button>
          </div>
        </div>
      )}

      {stage === 'password' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (currentPassword) setStage('factor');
          }}
          className="space-y-3"
        >
          <div>
            <label htmlFor="cp-recovery" className="block text-sm font-medium text-slate-700 mb-1 ml-1">
              Current password
            </label>
            <input
              id="cp-recovery"
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
              onClick={() => setStage('status')}
              className="flex-1 py-2.5 px-4 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={!currentPassword}
              className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-xl shadow-sm transition-colors"
            >
              Continue
            </button>
          </div>
        </form>
      )}

      {stage === 'factor' && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Confirm with a 2FA factor.</p>
          <TwoFactorChallengeForm
            availableMethods={availableMethods}
            onSubmit={submit}
            busy={busy}
            errorMessage={error}
            fetchPasskeyChallenge={fetchPasskeyChallenge}
          />
          {!busy && (
            <button
              type="button"
              onClick={() => setStage('password')}
              className="w-full py-2 px-3 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
            >
              <Loader2 className="w-4 h-4 opacity-0" />
              Back
            </button>
          )}
        </div>
      )}

      {stage === 'view' && codes && (
        <RecoveryCodesView
          codes={codes}
          onAcknowledge={() => {
            // Defer parent refresh until user has saved codes; refresh flips
            // loading=true in SessionContext and would otherwise tear down
            // this modal mid-display.
            onChanged(summary);
            onClose();
          }}
        />
      )}
    </ModalShell>
  );
}

export default RecoveryCodesModal;
