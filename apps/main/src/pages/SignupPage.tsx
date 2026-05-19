import React, { useState, useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { UserPlus, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useSession } from '../contexts/SessionContext';

export default function SignupPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn, user: currentUser } = useSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const bindToken = searchParams.get('bind_token');
  const wechatIdFromBind = searchParams.get('wechat_id');
  const nextDestination = searchParams.get('next') || '/center';

  const passwordIssues = useMemo(() => {
    const issues: string[] = [];
    if (password && password.length < 10) issues.push('At least 10 characters.');
    if (password && !/[A-Za-z]/.test(password)) issues.push('At least one letter.');
    if (password && !/[0-9]/.test(password)) issues.push('At least one digit.');
    return issues;
  }, [password]);

  if (currentUser) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center">
        <p className="text-slate-600 mb-4">You are already signed in as <strong>@{currentUser.username}</strong>.</p>
        <button
          onClick={() => navigate('/center')}
          className="py-2 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl shadow-sm transition-colors"
        >
          Go to User Center
        </button>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');

    if (password !== confirmPassword) {
      setStatus('error');
      setMessage('Passwords do not match.');
      return;
    }
    if (passwordIssues.length > 0) {
      setStatus('error');
      setMessage(passwordIssues.join(' '));
      return;
    }

    setStatus('loading');

    try {
      const res = await fetch(`${__API_ENDPOINT__}/api/user/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          password,
          ...(bindToken ? { bind_token: bindToken } : {}),
        }),
      });
      const data = await res.json();

      if (data.success && data.token) {
        await signIn(data.token);
        navigate(nextDestination, { replace: true });
        return;
      }
      setStatus('error');
      setMessage(data.message || 'Failed to create account.');
    } catch {
      setStatus('error');
      setMessage('An error occurred while communicating with the server.');
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
            <UserPlus className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Create your ROwO Account</h2>
          <p className="text-slate-500 mt-1 text-sm">
            One account to manage your identity, preferences, and third-party authorizations.
          </p>
        </div>

        {bindToken && wechatIdFromBind && (
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 mb-6 flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-emerald-800">
              <p className="font-medium">Verified WeChat ID will be bound</p>
              <p className="font-mono text-xs mt-1 break-all">{wechatIdFromBind}</p>
            </div>
          </div>
        )}

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
              placeholder="3-32 chars: a-z, 0-9, _ or -"
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
              placeholder="At least 10 characters"
              required
              autoComplete="new-password"
              className="block w-full px-4 py-3 rounded-xl border border-slate-300 shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
            {passwordIssues.length > 0 && (
              <p className="text-xs text-slate-500 mt-1 ml-1">{passwordIssues.join(' ')}</p>
            )}
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 mb-1 ml-1">
              Confirm password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="block w-full px-4 py-3 rounded-xl border border-slate-300 shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            />
          </div>

          {status === 'error' && message && (
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
            {status === 'loading' ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <div className="text-center text-sm text-slate-500 mt-6">
          Already have an account?{' '}
          <Link
            to={`/login${bindToken ? `?bind_token=${encodeURIComponent(bindToken)}&next=${encodeURIComponent(nextDestination)}` : ''}`}
            className="text-indigo-600 hover:text-indigo-700 font-medium"
          >
            Sign in
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
