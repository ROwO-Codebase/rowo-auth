import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { ShieldCheck, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { authHeaders, type TwoFactorSummary } from '@rowo/shared/session';
import { ModalShell } from './ModalShell';
import { RecoveryCodesView } from './RecoveryCodesView';

interface Props {
  onClose: () => void;
  onChanged: (summary: TwoFactorSummary) => void;
}

interface BeginResponse {
  success: boolean;
  message?: string;
  otpauth_uri: string;
  secret_base32: string;
  setup_token: string;
}

interface ConfirmResponse {
  success: boolean;
  message?: string;
  two_factor: TwoFactorSummary;
  recovery_codes: string[] | null;
}

export function TotpSetupModal({ onClose, onChanged }: Props) {
  const [stage, setStage] = useState<'loading' | 'scan' | 'confirming' | 'recovery'>('loading');
  const [otpauth, setOtpauth] = useState('');
  const [secretB32, setSecretB32] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [lastSummary, setLastSummary] = useState<TwoFactorSummary | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${__API_ENDPOINT__}/api/user/2fa/totp/begin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
        });
        const data = (await res.json()) as BeginResponse;
        if (cancelled) return;
        if (!data.success) {
          setError(data.message || 'Could not start TOTP setup.');
          return;
        }
        setOtpauth(data.otpauth_uri);
        setSecretB32(data.secret_base32);
        setSetupToken(data.setup_token);
        const qr = await QRCode.toDataURL(data.otpauth_uri, { width: 224, margin: 1 });
        if (cancelled) return;
        setQrDataUrl(qr);
        setStage('scan');
      } catch {
        if (!cancelled) setError('Network error while starting TOTP setup.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code.trim())) {
      setError('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setStage('confirming');
    try {
      const res = await fetch(`${__API_ENDPOINT__}/api/user/2fa/totp/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ setup_token: setupToken, totp_code: code.trim() }),
      });
      const data = (await res.json()) as ConfirmResponse;
      if (!data.success) {
        setError(data.message || 'Could not confirm TOTP code.');
        setStage('scan');
        return;
      }
      setLastSummary(data.two_factor);
      onChanged(data.two_factor);
      if (data.recovery_codes && data.recovery_codes.length > 0) {
        setRecoveryCodes(data.recovery_codes);
        setStage('recovery');
      } else {
        onClose();
      }
    } catch {
      setError('Network error.');
      setStage('scan');
    }
  };

  return (
    <ModalShell
      onClose={onClose}
      title="Set up authenticator app"
      icon={<ShieldCheck className="w-5 h-5 text-indigo-600" />}
    >
      {stage === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-6">
          <Loader2 className="w-4 h-4 animate-spin" />
          Preparing TOTP secret...
        </div>
      )}

      {(stage === 'scan' || stage === 'confirming') && (
        <form onSubmit={handleConfirm} className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-slate-600">
              Scan this QR code with Google Authenticator, 1Password, or another TOTP app,
              then enter the 6-digit code it shows.
            </p>
            <div className="flex justify-center bg-slate-50 border border-slate-200 rounded-xl p-3">
              {qrDataUrl ? (
                <img src={qrDataUrl} alt="TOTP QR code" className="w-56 h-56" />
              ) : (
                <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
              )}
            </div>
            <details className="text-xs text-slate-500">
              <summary className="cursor-pointer">Can't scan? Show secret</summary>
              <div className="mt-1 font-mono text-[11px] break-all bg-slate-50 border border-slate-200 rounded-lg p-2">
                {secretB32}
              </div>
            </details>
          </div>

          <div>
            <label htmlFor="totp" className="block text-sm font-medium text-slate-700 mb-1 ml-1">
              Authenticator code
            </label>
            <input
              id="totp"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\s+/g, ''))}
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              autoComplete="one-time-code"
              placeholder="123456"
              className="block w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-mono tracking-widest text-center"
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
              disabled={stage === 'confirming' || code.trim().length !== 6}
              className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
            >
              {stage === 'confirming' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              {stage === 'confirming' ? 'Verifying...' : 'Enable TOTP'}
            </button>
          </div>
        </form>
      )}

      {stage === 'recovery' && recoveryCodes && (
        <div className="space-y-4">
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-sm text-emerald-700 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>TOTP enabled. Save the recovery codes below before closing.</span>
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

export default TotpSetupModal;
