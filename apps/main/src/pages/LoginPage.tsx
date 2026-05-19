import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { LogIn, Loader2, AlertTriangle, Info, ShieldAlert, Mail, Shield } from 'lucide-react';
import { useSession } from '../contexts/SessionContext';
import {
  authHeaders,
  type BlacklistInfo,
  type TwoFactorMethod,
} from '@rowo/shared/session';
import {
  TwoFactorChallengeForm,
  type TwoFactorSubmitValues,
} from '../components/2fa/TwoFactorChallengeForm';

interface TwoFactorState {
  challenge_token: string;
  methods: TwoFactorMethod[];
  webauthn_options: unknown | null;
  passkey_challenge_token: string | null;
}

const SUPPORT_EMAIL = 'dev@rowo.link';

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn, user: currentUser } = useSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [bindNotice, setBindNotice] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<BlacklistInfo | null>(null);
  const [twoFactor, setTwoFactor] = useState<TwoFactorState | null>(null);
  const [twoFactorError, setTwoFactorError] = useState<string | null>(null);

  const bindToken = searchParams.get('bind_token');
  const nextDestination = searchParams.get('next') || '/center';

  if (currentUser) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center">
        <p className="text-slate-600 mb-4">You are already signed in as <strong>@{currentUser.username}</strong>.</p>
        <button
          onClick={() => navigate(nextDestination, { replace: true })}
          className="py-2 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl shadow-sm transition-colors"
        >
          Continue
        </button>
      </div>
    );
  }

  const completeSignIn = async (token: string) => {
    await signIn(token);

    if (bindToken) {
      try {
        const bindRes = await fetch(`${__API_ENDPOINT__}/api/user/bind-wechat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ bind_token: bindToken }),
        });
        const bindData = await bindRes.json();
        if (!bindData.success) {
          setBindNotice(bindData.message || 'Could not bind WeChat ID. You can try again from the User Center.');
          navigate('/center', { replace: true });
          return;
        }
      } catch {
        setBindNotice('Could not bind WeChat ID. You can try again from the User Center.');
        navigate('/center', { replace: true });
        return;
      }
    }

    navigate(nextDestination, { replace: true });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setBindNotice(null);
    setBlocked(null);
    setStatus('loading');

    try {
      const res = await fetch(`${__API_ENDPOINT__}/api/user/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (data.blacklisted && data.blacklist) {
        setStatus('error');
        setMessage('');
        setBlocked(data.blacklist as BlacklistInfo);
        return;
      }

      if (data.two_factor_required && data.challenge_token) {
        setStatus('idle');
        setTwoFactor({
          challenge_token: data.challenge_token,
          methods: Array.isArray(data.methods) ? data.methods : [],
          webauthn_options: data.webauthn_options ?? null,
          passkey_challenge_token: data.passkey_challenge_token ?? null,
        });
        return;
      }

      if (!data.success || !data.token) {
        setStatus('error');
        setMessage(data.message || 'Failed to sign in.');
        return;
      }

      await completeSignIn(data.token);
    } catch {
      setStatus('error');
      setMessage('An error occurred while communicating with the server.');
    }
  };

  const submitTwoFactor = async (factor: TwoFactorSubmitValues) => {
    if (!twoFactor) return;
    setTwoFactorError(null);
    setStatus('loading');
    try {
      const res = await fetch(`${__API_ENDPOINT__}/api/user/login/2fa`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge_token: twoFactor.challenge_token,
          ...factor,
        }),
      });
      const data = await res.json();
      if (data.blacklisted && data.blacklist) {
        setStatus('error');
        setTwoFactor(null);
        setBlocked(data.blacklist as BlacklistInfo);
        return;
      }
      if (!data.success || !data.token) {
        setStatus('idle');
        if (Array.isArray(data.available_methods) && data.available_methods.length > 0) {
          setTwoFactor((s) => (s ? { ...s, methods: data.available_methods } : s));
        }
        setTwoFactorError(data.message || 'Could not verify second factor.');
        return;
      }
      await completeSignIn(data.token);
    } catch {
      setStatus('idle');
      setTwoFactorError('Network error.');
    }
  };

  return (
    <div className="max-w-md mx-auto mt-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8"
      >
        <div className="flex flex-col items-center text-center mb-6">
          <div className="bg-indigo-100 p-3 rounded-2xl text-indigo-600 mb-3">
            {twoFactor ? <Shield className="w-7 h-7" /> : <LogIn className="w-7 h-7" />}
          </div>
          <h2 className="text-2xl font-bold text-slate-900">
            {twoFactor ? 'Two-factor verification' : 'Sign in to ROwO'}
          </h2>
          {twoFactor && (
            <p className="text-slate-500 mt-1 text-sm">
              Confirm with your authenticator app, passkey, or recovery code.
            </p>
          )}
          {!twoFactor && bindToken && (
            <p className="text-slate-500 mt-1 text-sm">
              We'll bind the verified WeChat ID to your account on sign-in.
            </p>
          )}
        </div>

        {bindNotice && (
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-4 flex items-start gap-2 text-sm text-amber-800">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{bindNotice}</span>
          </div>
        )}

        {twoFactor ? (
          <div className="space-y-3">
            <TwoFactorChallengeForm
              availableMethods={twoFactor.methods}
              webauthnOptions={twoFactor.webauthn_options}
              passkeyChallengeToken={twoFactor.passkey_challenge_token}
              onSubmit={submitTwoFactor}
              busy={status === 'loading'}
              errorMessage={twoFactorError}
            />
            <button
              type="button"
              onClick={() => {
                setTwoFactor(null);
                setTwoFactorError(null);
                setStatus('idle');
              }}
              className="w-full py-2 px-3 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors"
            >
              Use a different account
            </button>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-slate-700 mb-1 ml-1">
              Username
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
              className="block w-full px-4 py-3 rounded-xl border border-slate-300 shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1 ml-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="block w-full px-4 py-3 rounded-xl border border-slate-300 shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>

          {blocked && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-800 space-y-2">
              <div className="flex items-start gap-2">
                <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">Account blocked</div>
                  <div className="text-xs mt-1">
                    Your bound WeChat ID{' '}
                    <span className="font-mono break-all">{blocked.wechat_id}</span> is on the
                    blacklist, so sign-in is disabled.
                  </div>
                  <div className="text-xs mt-2">
                    <span className="font-semibold">Reason:</span>{' '}
                    {blocked.reason || 'No reason provided.'}
                  </div>
                </div>
              </div>
              <a
                href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`Blacklist appeal — ${blocked.wechat_id}`)}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium transition-colors"
              >
                <Mail className="w-3.5 h-3.5" />
                Contact support
              </a>
            </div>
          )}

          {status === 'error' && message && !blocked && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-3 flex items-start gap-2 text-sm text-red-700">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{message}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={status === 'loading'}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
          >
            {status === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {status === 'loading' ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        )}

        <div className="text-center text-sm text-slate-500 mt-6 space-y-1">
          <div>
            New here?{' '}
            <Link
              to={`/signup${bindToken ? `?bind_token=${encodeURIComponent(bindToken)}&next=${encodeURIComponent(nextDestination)}` : ''}`}
              className="text-indigo-600 hover:text-indigo-700 font-medium"
            >
              Create an account
            </Link>
          </div>
          <div className="text-xs text-slate-400 mt-3">
            Lost your password? Contact an admin to reset it.
          </div>
        </div>
      </motion.div>
    </div>
  );
}
