import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import {
  User, ShieldCheck, KeyRound, RefreshCw, LogOut, Link2, Loader2, AlertCircle, X,
  AlertTriangle, CheckCircle2, Clock, XCircle, Globe, ShieldAlert, Pencil, Info,
  FileText, Shield,
} from 'lucide-react';
import { useSession } from '../contexts/SessionContext';
import {
  authHeaders,
  type TwoFactorMethod,
  type TwoFactorSummary,
} from '@rowo/shared/session';
import { TwoFactorCard } from '../components/2fa/TwoFactorCard';
import {
  TwoFactorChallengeForm,
  type TwoFactorSubmitValues,
} from '../components/2fa/TwoFactorChallengeForm';

interface PublicInfoNote {
  id: number;
  color: string;
  icon: string;
  title: string;
  body: string;
  creator: string;
  created_at: string;
}

interface PublicAccount {
  wechat_id: string;
  verified_status: number;
  verification_method: string | null;
  verification_time: string | null;
  reverified_at: string | null;
  manual_status?: string | null;
  manual_reason?: string | null;
  manual_admin?: string | null;
  manual_time?: string | null;
  hash_version: 'hmac-sha256' | 'sha256' | null;
}

interface PublicProfile {
  success: boolean;
  message?: string;
  blacklisted?: boolean;
  blacklist?: { wechat_id: string; reason: string };
  account?: PublicAccount;
  info?: PublicInfoNote[];
}

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function safeDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const t = Date.parse(String(s));
  return Number.isFinite(t) ? new Date(t) : null;
}

function formatDate(s: string | null | undefined): string {
  const d = safeDate(s);
  return d ? format(d, 'yyyy-MM-dd HH:mm') : '—';
}

export default function UserCenterPage() {
  const navigate = useNavigate();
  const { user, verification, twoFactor, loading, signOut, refresh } = useSession();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const loadPublicProfile = useCallback(async (wechatId: string) => {
    setProfileLoading(true);
    setProfileError(null);
    try {
      const res = await fetch(`${__API_ENDPOINT__}/api/verify/${encodeURIComponent(wechatId)}`);
      const data = (await res.json()) as PublicProfile;
      setPublicProfile(data);
    } catch {
      setProfileError('Could not load your public profile.');
      setPublicProfile(null);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login?next=/center', { replace: true });
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    if (!user?.wechat_id) {
      setPublicProfile(null);
      return;
    }
    loadPublicProfile(user.wechat_id);
  }, [user?.wechat_id, loadPublicProfile]);

  if (loading || !user) {
    return (
      <div className="max-w-2xl mx-auto mt-20 text-center text-slate-500 flex items-center justify-center gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading...
      </div>
    );
  }

  const lastChangeAt = safeDate(user.last_wechat_change_at);
  const nextEligibleDate = lastChangeAt ? new Date(lastChangeAt.getTime() + ONE_YEAR_MS) : null;
  const canChangeWechat = !lastChangeAt || nextEligibleDate!.getTime() <= Date.now();

  const handleSignOut = () => {
    signOut();
    navigate('/', { replace: true });
  };

  return (
    <div className="max-w-2xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-6"
      >
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="bg-indigo-100 p-3 rounded-2xl text-indigo-600 flex-shrink-0">
              <User className="w-6 h-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-slate-900">@{user.username}</h1>
              <p className="text-sm text-slate-500 mt-0.5">
                ROwO Account created {formatDate(user.created_at)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-slate-900">WeChat Binding</h2>
          </div>

          {user.wechat_id ? (
            <div className="space-y-3">
              <div>
                <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">Bound WeChat ID</div>
                <div className="font-mono text-sm break-all">{user.wechat_id}</div>
              </div>

              {verification?.missing && (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-sm text-amber-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>The verification record for this WeChat ID no longer exists. Contact an admin.</span>
                </div>
              )}

              {lastChangeAt && (
                <div className="text-xs text-slate-500 pt-2 border-t border-slate-100 mt-3">
                  Last WeChat change: {formatDate(user.last_wechat_change_at)}
                  {nextEligibleDate && !canChangeWechat && (
                    <span> · Next change eligible {format(nextEligibleDate, 'yyyy-MM-dd')}</span>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-800">
              <div className="font-medium mb-1">No WeChat ID bound</div>
              <p className="text-xs leading-relaxed">
                Verify a WeChat ID to link it to your ROwO account, or contact an admin if your
                WeChat ID was manually or batch-verified.
              </p>
            </div>
          )}
        </div>

        {user.wechat_id && (
          <PublicProfileCard
            wechatId={user.wechat_id}
            profile={publicProfile}
            loading={profileLoading}
            error={profileError}
            onRefresh={() => loadPublicProfile(user.wechat_id!)}
          />
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          {user.wechat_id ? (
            <button
              disabled={!canChangeWechat}
              onClick={() => navigate('/verify')}
              className="bg-white border border-slate-200 rounded-2xl p-5 text-left hover:border-indigo-300 hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-start gap-3"
            >
              <RefreshCw className="w-5 h-5 text-indigo-600 mt-0.5" />
              <div>
                <div className="font-medium text-slate-900">Change WeChat ID</div>
                <div className="text-xs text-slate-500 mt-1">
                  {canChangeWechat
                    ? 'Verify the new WeChat ID, then confirm with your password.'
                    : `Available again on ${format(nextEligibleDate!, 'yyyy-MM-dd')}.`}
                </div>
              </div>
            </button>
          ) : (
            <Link
              to="/verify"
              className="bg-white border border-slate-200 rounded-2xl p-5 text-left hover:border-indigo-300 hover:shadow-sm transition-all flex items-start gap-3"
            >
              <Link2 className="w-5 h-5 text-indigo-600 mt-0.5" />
              <div>
                <div className="font-medium text-slate-900">Bind WeChat ID</div>
                <div className="text-xs text-slate-500 mt-1">Run a verification flow and link the result.</div>
              </div>
            </Link>
          )}

          <button
            onClick={() => setShowPasswordModal(true)}
            className="bg-white border border-slate-200 rounded-2xl p-5 text-left hover:border-indigo-300 hover:shadow-sm transition-all flex items-start gap-3"
          >
            <KeyRound className="w-5 h-5 text-indigo-600 mt-0.5" />
            <div>
              <div className="font-medium text-slate-900">Change Password</div>
              <div className="text-xs text-slate-500 mt-1">
                {(twoFactor?.totp_enabled || (twoFactor?.passkeys.length ?? 0) > 0)
                  ? 'Requires current password and 2FA.'
                  : 'Requires current password.'}
              </div>
            </div>
          </button>
        </div>

        <TwoFactorCard summary={twoFactor} onChanged={() => { void refresh(); }} />

        <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between">
          <div className="text-sm text-slate-500">Sign out of this browser.</div>
          <button
            onClick={handleSignOut}
            className="py-2 px-4 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-xl shadow-sm transition-colors flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </motion.div>

      <AnimatePresence>
        {showPasswordModal && (
          <ChangePasswordModal
            twoFactor={twoFactor}
            onClose={() => setShowPasswordModal(false)}
            onSuccess={async () => {
              await refresh();
              setShowPasswordModal(false);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ChangePasswordModal({
  twoFactor,
  onClose,
  onSuccess,
}: {
  twoFactor: TwoFactorSummary | null;
  onClose: () => void;
  onSuccess: () => void | Promise<void>;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [availableMethods, setAvailableMethods] = useState<TwoFactorMethod[]>(() => {
    const m: TwoFactorMethod[] = [];
    if (twoFactor?.totp_enabled) m.push('totp');
    if ((twoFactor?.passkeys.length ?? 0) > 0) m.push('passkey');
    if ((twoFactor?.recovery_codes_remaining ?? 0) > 0) m.push('recovery');
    return m;
  });

  const twoFactorRequired = availableMethods.length > 0;

  const fetchPasskeyChallenge = useCallback(async () => {
    const res = await fetch(`${__API_ENDPOINT__}/api/user/2fa/passkey/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ purpose: 'reauth' }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Could not fetch passkey challenge.');
    return { options: data.options, challenge_token: data.challenge_token };
  }, []);

  const validate = (): string | null => {
    if (!currentPassword) return 'Current password is required.';
    if (newPassword !== confirmNewPassword) return 'New passwords do not match.';
    if (newPassword.length < 10 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return 'Password must be at least 10 characters with a letter and a digit.';
    }
    return null;
  };

  const submit = async (factor: TwoFactorSubmitValues = {}) => {
    setMessage('');
    const validationError = validate();
    if (validationError) {
      setStatus('error');
      setMessage(validationError);
      return;
    }
    setStatus('loading');
    try {
      const res = await fetch(`${__API_ENDPOINT__}/api/user/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          ...factor,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus('success');
        setMessage('Password changed.');
        setTimeout(() => {
          onSuccess();
        }, 600);
        return;
      }
      if (data.two_factor_required && Array.isArray(data.available_methods)) {
        setAvailableMethods(data.available_methods);
      }
      setStatus('error');
      setMessage(data.message || 'Could not change password.');
    } catch {
      setStatus('error');
      setMessage('Network error.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // When 2FA is not required, submit directly.
    if (!twoFactorRequired) await submit();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 sm:p-8 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="w-5 h-5 text-indigo-600" />
          <h3 className="text-lg font-semibold text-slate-900">Change Password</h3>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label htmlFor="currentPassword" className="block text-sm font-medium text-slate-700 mb-1 ml-1">Current password</label>
            <input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="block w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>
          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-slate-700 mb-1 ml-1">New password</label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="block w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>
          <div>
            <label htmlFor="confirmNewPassword" className="block text-sm font-medium text-slate-700 mb-1 ml-1">Confirm new password</label>
            <input
              id="confirmNewPassword"
              type="password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="block w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>

          {twoFactorRequired && (
            <div className="pt-1 border-t border-slate-100">
              <div className="text-xs uppercase tracking-wide text-slate-500 mt-3 mb-2">
                Confirm with 2FA
              </div>
              <TwoFactorChallengeForm
                availableMethods={availableMethods}
                onSubmit={submit}
                busy={status === 'loading'}
                errorMessage={status === 'error' ? message : null}
                fetchPasskeyChallenge={fetchPasskeyChallenge}
                compact
              />
            </div>
          )}

          {!twoFactorRequired && status === 'error' && message && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{message}</span>
            </div>
          )}
          {status === 'success' && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-sm text-emerald-700 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{message}</span>
            </div>
          )}

          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            {!twoFactorRequired && (
              <button
                type="submit"
                disabled={status === 'loading' || status === 'success'}
                className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
              >
                {status === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {status === 'loading' ? 'Saving...' : 'Change password'}
              </button>
            )}
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

const INFO_COLOR_CLASSES: Record<string, { wrap: string; icon: string }> = {
  blue: { wrap: 'bg-blue-50 border-blue-200 text-blue-900', icon: 'text-blue-600' },
  orange: { wrap: 'bg-orange-50 border-orange-200 text-orange-900', icon: 'text-orange-600' },
  yellow: { wrap: 'bg-yellow-50 border-yellow-200 text-yellow-900', icon: 'text-yellow-600' },
  red: { wrap: 'bg-red-50 border-red-200 text-red-900', icon: 'text-red-600' },
  purple: { wrap: 'bg-purple-50 border-purple-200 text-purple-900', icon: 'text-purple-600' },
  emerald: { wrap: 'bg-emerald-50 border-emerald-200 text-emerald-900', icon: 'text-emerald-600' },
  slate: { wrap: 'bg-slate-50 border-slate-200 text-slate-800', icon: 'text-slate-600' },
};

const INFO_ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  warning: AlertTriangle,
  error: XCircle,
  checkmark: CheckCircle2,
  pencil: Pencil,
  refresh: RefreshCw,
  info: Info,
  document: FileText,
};

function PublicProfileCard({
  wechatId,
  profile,
  loading,
  error,
  onRefresh,
}: {
  wechatId: string;
  profile: PublicProfile | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8">
      <div className="flex items-start justify-between mb-1 gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Globe className="w-5 h-5 text-indigo-600 shrink-0" />
          <h2 className="text-lg font-semibold text-slate-900">Public profile</h2>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-40"
          aria-label="Refresh public profile"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <p className="text-xs text-slate-500 mb-4">
        What anyone sees when they look up <span className="font-mono">{wechatId}</span> on the
        public verification page.
      </p>

      {loading && !profile ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading public profile…
        </div>
      ) : error ? (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      ) : profile?.blacklisted ? (
        <div className="border-l-4 border-slate-900 bg-slate-50 rounded-r-xl p-4 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-slate-900 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-bold text-slate-900">Account blacklisted</h3>
            <p className="text-sm text-slate-700 mt-1">
              Reason: {profile.blacklist?.reason || 'No reason provided.'}
            </p>
          </div>
        </div>
      ) : profile?.success && profile.account ? (
        <PublicProfileBody account={profile.account} notes={profile.info || []} />
      ) : (
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-sm text-amber-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            No public record found for this WeChat ID yet.
            {profile?.message ? ` (${profile.message})` : ''}
          </span>
        </div>
      )}
    </div>
  );
}

function PublicProfileBody({ account, notes }: { account: PublicAccount; notes: PublicInfoNote[] }) {
  const status = Number(account.verified_status);
  const isManualPending = account.verification_method === 'Manual' && account.manual_status === 'pending';
  const isManualRejected = account.verification_method === 'Manual' && account.manual_status === 'rejected';

  let statusBadge: React.ReactNode;
  if (status === 1) {
    statusBadge = (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Verified
      </span>
    );
  } else if (status === 2) {
    statusBadge = (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
        <ShieldAlert className="w-3.5 h-3.5" />
        Revoked
      </span>
    );
  } else if (isManualPending) {
    statusBadge = (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
        <Clock className="w-3.5 h-3.5" />
        Pending review
      </span>
    );
  } else if (isManualRejected) {
    statusBadge = (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
        <XCircle className="w-3.5 h-3.5" />
        Rejected
      </span>
    );
  } else {
    statusBadge = (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
        <Clock className="w-3.5 h-3.5" />
        Not verified
      </span>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {statusBadge}
        {account.hash_version === 'hmac-sha256' && (
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800"
            title="Your account data is hashed with HMAC-SHA-256."
          >
            <Shield className="w-3.5 h-3.5" />
            HMAC-SHA-256
          </span>
        )}
        {account.hash_version === 'sha256' && (
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800"
            title="Re-verify your account to upgrade to HMAC-SHA-256."
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            SHA-256
          </span>
        )}
      </div>

      {isManualPending && (
        <div className="border-l-4 border-amber-400 bg-amber-50 rounded-r-xl p-3 text-sm text-amber-800 flex items-start gap-2">
          <Clock className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>
            Your manual verification was submitted{' '}
            {account.verification_time ? `on ${formatDate(account.verification_time)}` : ''} and is
            awaiting admin review.
          </span>
        </div>
      )}

      {isManualRejected && (
        <div className="border-l-4 border-red-500 bg-red-50 rounded-r-xl p-3 text-sm text-red-800">
          <div className="font-semibold">Manual verification rejected</div>
          {account.manual_reason && (
            <div className="mt-1 text-xs">Reason: {account.manual_reason}</div>
          )}
          {account.manual_admin && account.manual_time && (
            <div className="mt-1 text-xs opacity-80">
              by {account.manual_admin} on {formatDate(account.manual_time)}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400">Method</div>
          <div>{account.verification_method || '—'}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400">Verified at</div>
          <div>{formatDate(account.verification_time)}</div>
        </div>
        {account.reverified_at && (
          <div className="col-span-2">
            <div className="text-xs uppercase tracking-wide text-slate-400">Re-verified at</div>
            <div>{formatDate(account.reverified_at)}</div>
          </div>
        )}
      </div>

      {account.hash_version === 'sha256' && (
        <div className="border-l-4 border-orange-400 bg-orange-50 rounded-r-xl p-3 text-sm text-orange-800">
          Your account data is hashed with the legacy SHA-256 algorithm. Re-verify to upgrade to
          HMAC-SHA-256.
        </div>
      )}

      <div>
        <div className="text-xs uppercase tracking-wide text-slate-400 mb-2">Public notes</div>
        {notes.length === 0 ? (
          <div className="text-xs text-slate-500 italic">
            No public notes attached.
          </div>
        ) : (
          <div className="space-y-2">
            {notes.map((note) => {
              const palette = INFO_COLOR_CLASSES[note.color] || INFO_COLOR_CLASSES.slate;
              const Icon = INFO_ICON_MAP[note.icon] || Info;
              return (
                <div
                  key={note.id}
                  className={`border-l-4 p-3 rounded-r-lg flex items-start gap-3 ${palette.wrap}`}
                >
                  <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${palette.icon}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{note.title}</div>
                    <div className="text-sm prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2">
                      <ReactMarkdown>{note.body}</ReactMarkdown>
                    </div>
                    <div className="text-xs opacity-70 mt-1">
                      by {note.creator}
                      {note.created_at && ` · ${formatDate(note.created_at)}`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
