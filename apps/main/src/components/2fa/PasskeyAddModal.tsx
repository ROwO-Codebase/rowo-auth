import React, { useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import { KeyRound, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { authHeaders, type TwoFactorSummary } from '@rowo/shared/session';
import { ModalShell } from './ModalShell';
import { RecoveryCodesView } from './RecoveryCodesView';

interface Props {
  onClose: () => void;
  onChanged: (summary: TwoFactorSummary) => void;
}

export function PasskeyAddModal({ onClose, onChanged }: Props) {
  const [stage, setStage] = useState<'nickname' | 'registering' | 'recovery'>('nickname');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [lastSummary, setLastSummary] = useState<TwoFactorSummary | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = nickname.trim();
    if (!name) {
      setError('Give this passkey a nickname.');
      return;
    }
    setError(null);
    setStage('registering');
    try {
      const beginRes = await fetch(`${__API_ENDPOINT__}/api/user/2fa/passkey/register/begin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
      });
      const beginData = await beginRes.json();
      if (!beginData.success) {
        setError(beginData.message || 'Could not start passkey registration.');
        setStage('nickname');
        return;
      }
      const attestation = await startRegistration(beginData.options);
      const finishRes = await fetch(`${__API_ENDPOINT__}/api/user/2fa/passkey/register/finish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          challenge_token: beginData.challenge_token,
          attestation_response: attestation,
          nickname: name,
        }),
      });
      const finishData = await finishRes.json();
      if (!finishData.success) {
        setError(finishData.message || 'Could not register passkey.');
        setStage('nickname');
        return;
      }
      setLastSummary(finishData.two_factor);
      if (finishData.recovery_codes && finishData.recovery_codes.length > 0) {
        // Defer parent refresh to the recovery-code acknowledge step —
        // refresh flips loading=true in SessionContext and would tear down
        // this modal before the user can read the codes.
        setRecoveryCodes(finishData.recovery_codes);
        setStage('recovery');
      } else {
        onChanged(finishData.two_factor);
        onClose();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Passkey registration failed.';
      setError(msg);
      setStage('nickname');
    }
  };

  return (
    <ModalShell
      onClose={onClose}
      title="Add a passkey"
      icon={<KeyRound className="w-5 h-5 text-indigo-600" />}
    >
      {(stage === 'nickname' || stage === 'registering') && (
        <form onSubmit={handleAdd} className="space-y-3">
          <p className="text-sm text-slate-600">
            Use your platform authenticator (Face ID, Windows Hello) or a hardware security key.
          </p>
          <div>
            <label htmlFor="pk-nickname" className="block text-sm font-medium text-slate-700 mb-1 ml-1">
              Nickname
            </label>
            <input
              id="pk-nickname"
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              maxLength={64}
              placeholder="e.g. MacBook Air, YubiKey"
              className="block w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>
          {error && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
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
              disabled={stage === 'registering' || !nickname.trim()}
              className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
            >
              {stage === 'registering' ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
              {stage === 'registering' ? 'Waiting for authenticator...' : 'Add passkey'}
            </button>
          </div>
        </form>
      )}

      {stage === 'recovery' && recoveryCodes && (
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-sm text-emerald-700 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>Passkey added. Save the recovery codes below before closing.</span>
          </div>
          <RecoveryCodesView
            codes={recoveryCodes}
            onAcknowledge={() => {
              if (lastSummary) onChanged(lastSummary);
              onClose();
            }}
          />
        </div>
      )}
    </ModalShell>
  );
}

export default PasskeyAddModal;
