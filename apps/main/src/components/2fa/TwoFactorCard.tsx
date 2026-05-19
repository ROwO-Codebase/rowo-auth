import React, { useState } from 'react';
import { AnimatePresence } from 'motion/react';
import {
  Shield,
  ShieldCheck,
  KeyRound,
  LifeBuoy,
  Plus,
  Trash2,
  Pencil,
  Check,
  X as XIcon,
  Loader2,
} from 'lucide-react';
import {
  authHeaders,
  type TwoFactorMethod,
  type TwoFactorPasskey,
  type TwoFactorSummary,
} from '@rowo/shared/session';
import { TotpSetupModal } from './TotpSetupModal';
import { TotpDisableModal } from './TotpDisableModal';
import { PasskeyAddModal } from './PasskeyAddModal';
import { PasskeyDeleteModal } from './PasskeyDeleteModal';
import { RecoveryCodesModal } from './RecoveryCodesModal';

interface Props {
  summary: TwoFactorSummary | null;
  onChanged: (summary: TwoFactorSummary) => void;
}

function listMethods(summary: TwoFactorSummary): TwoFactorMethod[] {
  const out: TwoFactorMethod[] = [];
  if (summary.totp_enabled) out.push('totp');
  if (summary.passkeys.length > 0) out.push('passkey');
  if (summary.recovery_codes_remaining > 0) out.push('recovery');
  return out;
}

export function TwoFactorCard({ summary, onChanged }: Props) {
  const [showTotpSetup, setShowTotpSetup] = useState(false);
  const [showTotpDisable, setShowTotpDisable] = useState(false);
  const [showPasskeyAdd, setShowPasskeyAdd] = useState(false);
  const [deletePasskey, setDeletePasskey] = useState<TwoFactorPasskey | null>(null);
  const [showRecovery, setShowRecovery] = useState(false);

  if (!summary) return null;

  const methods = listMethods(summary);
  const anyEnabled = summary.totp_enabled || summary.passkeys.length > 0;

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
      <div className="flex items-start gap-2 mb-4">
        <Shield className="w-5 h-5 text-indigo-600 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-slate-900">Two-factor authentication</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {anyEnabled
              ? 'Required for sign-in and sensitive actions (change password, change WeChat ID, authorize apps).'
              : 'Add a second factor to protect your account.'}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="border border-slate-200 rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0">
              <ShieldCheck className="w-5 h-5 text-indigo-600 mt-0.5" />
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900">Authenticator app (TOTP)</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {summary.totp_enabled ? 'Enabled' : 'Not set up'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => (summary.totp_enabled ? setShowTotpDisable(true) : setShowTotpSetup(true))}
              className={`shrink-0 py-1.5 px-3 text-xs font-medium rounded-lg transition-colors ${
                summary.totp_enabled
                  ? 'bg-white border border-red-200 text-red-700 hover:bg-red-50'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}
            >
              {summary.totp_enabled ? 'Disable' : 'Set up'}
            </button>
          </div>
        </div>

        <div className="border border-slate-200 rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-start gap-2 min-w-0">
              <KeyRound className="w-5 h-5 text-indigo-600 mt-0.5" />
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900">Passkeys</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {summary.passkeys.length === 0
                    ? 'None registered'
                    : `${summary.passkeys.length} registered`}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowPasskeyAdd(true)}
              className="shrink-0 py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Add
            </button>
          </div>

          {summary.passkeys.length > 0 && (
            <ul className="space-y-1.5">
              {summary.passkeys.map((p) => (
                <PasskeyRow
                  key={p.id}
                  passkey={p}
                  onRenamed={(s) => onChanged(s)}
                  onDeleteClicked={() => setDeletePasskey(p)}
                />
              ))}
            </ul>
          )}
        </div>

        <div className="border border-slate-200 rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2 min-w-0">
              <LifeBuoy className="w-5 h-5 text-indigo-600 mt-0.5" />
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900">Recovery codes</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {summary.recovery_codes_total === 0
                    ? 'Generated when you enable your first factor'
                    : `${summary.recovery_codes_remaining} of ${summary.recovery_codes_total} remaining`}
                </div>
              </div>
            </div>
            {anyEnabled && (
              <button
                type="button"
                onClick={() => setShowRecovery(true)}
                className="shrink-0 py-1.5 px-3 bg-white border border-slate-200 text-slate-700 text-xs font-medium rounded-lg hover:bg-slate-50 transition-colors"
              >
                {summary.recovery_codes_total === 0 ? 'View' : 'Manage'}
              </button>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {showTotpSetup && (
          <TotpSetupModal
            key="totp-setup"
            onClose={() => setShowTotpSetup(false)}
            onChanged={onChanged}
          />
        )}
        {showTotpDisable && (
          <TotpDisableModal
            key="totp-disable"
            onClose={() => setShowTotpDisable(false)}
            onChanged={onChanged}
            availableMethods={methods}
          />
        )}
        {showPasskeyAdd && (
          <PasskeyAddModal
            key="passkey-add"
            onClose={() => setShowPasskeyAdd(false)}
            onChanged={onChanged}
          />
        )}
        {deletePasskey && (
          <PasskeyDeleteModal
            key="passkey-delete"
            passkey={deletePasskey}
            availableMethods={methods}
            onClose={() => setDeletePasskey(null)}
            onChanged={onChanged}
          />
        )}
        {showRecovery && (
          <RecoveryCodesModal
            key="recovery"
            summary={summary}
            availableMethods={methods}
            onClose={() => setShowRecovery(false)}
            onChanged={onChanged}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

interface PasskeyRowProps {
  passkey: TwoFactorPasskey;
  onRenamed: (summary: TwoFactorSummary) => void;
  onDeleteClicked: () => void;
}

function PasskeyRow({ passkey, onRenamed, onDeleteClicked }: PasskeyRowProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(passkey.nickname);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Nickname is required.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `${__API_ENDPOINT__}/api/user/2fa/passkeys/${encodeURIComponent(passkey.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ nickname: trimmed }),
        }
      );
      const data = await res.json();
      if (!data.success) {
        setError(data.message || 'Could not rename passkey.');
        return;
      }
      onRenamed(data.two_factor);
      setEditing(false);
    } catch {
      setError('Network error.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex items-center justify-between gap-2 py-1.5 px-2 bg-slate-50 rounded-lg">
      {editing ? (
        <>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={64}
            className="flex-1 min-w-0 px-2 py-1 rounded-md border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            autoFocus
          />
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"
            aria-label="Save"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={() => {
              setName(passkey.nickname);
              setEditing(false);
              setError(null);
            }}
            disabled={busy}
            className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-md transition-colors"
            aria-label="Cancel"
          >
            <XIcon className="w-4 h-4" />
          </button>
        </>
      ) : (
        <>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-slate-900 truncate">{passkey.nickname}</div>
            <div className="text-[11px] text-slate-500">
              Added {new Date(passkey.created_at).toLocaleDateString()}
              {passkey.last_used_at && (
                <> · last used {new Date(passkey.last_used_at).toLocaleDateString()}</>
              )}
              {passkey.backed_up && <> · synced</>}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="p-1.5 text-slate-500 hover:bg-white rounded-md transition-colors"
            aria-label="Rename"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onDeleteClicked}
            className="p-1.5 text-red-600 hover:bg-red-50 rounded-md transition-colors"
            aria-label="Remove"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </>
      )}
      {error && (
        <div className="text-xs text-red-700 ml-2">{error}</div>
      )}
    </li>
  );
}

export default TwoFactorCard;
