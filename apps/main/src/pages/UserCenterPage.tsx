import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { User, ShieldCheck, KeyRound, RefreshCw, LogOut, Link2, Loader2, AlertCircle, X, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useSession } from '../contexts/SessionContext';
import { authHeaders } from '@rowo/shared/session';

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
  const { user, verification, loading, signOut, refresh } = useSession();
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login?next=/center', { replace: true });
    }
  }, [loading, user, navigate]);

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

              {verification ? (
                verification.missing ? (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-sm text-amber-800 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <span>The verification record for this WeChat ID no longer exists. Contact an admin.</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-400">Status</div>
                      <div className={verification.verified_status ? 'text-emerald-700 font-medium' : 'text-slate-500'}>
                        {verification.verified_status ? 'Verified' : 'Pending / not verified'}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-400">Method</div>
                      <div>{verification.verification_method || '—'}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-400">Verified at</div>
                      <div>{formatDate(verification.verification_time)}</div>
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wide text-slate-400">Re-verified at</div>
                      <div>{formatDate(verification.reverified_at)}</div>
                    </div>
                  </div>
                )
              ) : null}

              <div className="text-xs text-slate-500 pt-2 border-t border-slate-100 mt-3">
                Last WeChat change: {formatDate(user.last_wechat_change_at)}
                {nextEligibleDate && !canChangeWechat && (
                  <span> · Next change eligible {format(nextEligibleDate, 'yyyy-MM-dd')}</span>
                )}
              </div>
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
              <div className="text-xs text-slate-500 mt-1">Requires current password.</div>
            </div>
          </button>
        </div>

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

function ChangePasswordModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void | Promise<void> }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    if (newPassword !== confirmNewPassword) {
      setStatus('error');
      setMessage('New passwords do not match.');
      return;
    }
    if (newPassword.length < 10 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setStatus('error');
      setMessage('Password must be at least 10 characters with a letter and a digit.');
      return;
    }
    setStatus('loading');
    try {
      const res = await fetch(`${__API_ENDPOINT__}/api/user/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
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
      setStatus('error');
      setMessage(data.message || 'Could not change password.');
    } catch {
      setStatus('error');
      setMessage('Network error.');
    }
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

          {status === 'error' && message && (
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
            <button
              type="submit"
              disabled={status === 'loading' || status === 'success'}
              className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
            >
              {status === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {status === 'loading' ? 'Saving...' : 'Change password'}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
