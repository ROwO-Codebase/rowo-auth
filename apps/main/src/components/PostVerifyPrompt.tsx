import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { UserPlus, LogIn, Sparkles, CheckCircle2, ArrowRight, AlertTriangle, Loader2, KeyRound, Shield } from 'lucide-react';
import { useSession } from '../contexts/SessionContext';
import { authHeaders, type TwoFactorMethod } from '@rowo/shared/session';
import {
  TwoFactorChallengeForm,
  type TwoFactorSubmitValues,
} from './2fa/TwoFactorChallengeForm';

interface Props {
  bindToken: string;
  wechatId: string;
  method: string;
  reverified?: boolean;
  alreadyLinkedToRowo?: boolean;
  /** True when the underlying verification is still under admin review (manual flow). */
  pending?: boolean;
}

type Phase =
  | 'choose'                 // not logged in: pick create/sign-in/skip
  | 'auto-binding'           // logged in + no existing binding: silent bind in progress
  | 'auto-bound'             // logged in + same wechat_id: just confirm
  | 'conflict'               // logged in + different wechat_id: 3 options
  | 'switching'              // user submitted password to switch
  | 'switched'               // switch succeeded
  | 'error';

export default function PostVerifyPrompt({ bindToken, wechatId, method, reverified, alreadyLinkedToRowo, pending }: Props) {
  const navigate = useNavigate();
  const { user, twoFactor, refresh, signOut } = useSession();
  const [phase, setPhase] = useState<Phase>('choose');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [available2faMethods, setAvailable2faMethods] = useState<TwoFactorMethod[]>([]);
  void method; // accepted for future logging; not currently rendered

  const twoFactorRequired = useMemo(() => available2faMethods.length > 0, [available2faMethods]);

  useEffect(() => {
    if (!twoFactor) {
      setAvailable2faMethods([]);
      return;
    }
    const methods: TwoFactorMethod[] = [];
    if (twoFactor.totp_enabled) methods.push('totp');
    if (twoFactor.passkeys.length > 0) methods.push('passkey');
    if (twoFactor.recovery_codes_remaining > 0) methods.push('recovery');
    setAvailable2faMethods(methods);
  }, [twoFactor]);

  const fetchPasskeyChallenge = async () => {
    const res = await fetch(`${__API_ENDPOINT__}/api/user/2fa/passkey/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ purpose: 'change-wechat' }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || 'Could not fetch passkey challenge.');
    return { options: data.options, challenge_token: data.challenge_token };
  };

  useEffect(() => {
    if (!user) {
      setPhase('choose');
      return;
    }
    if (!user.wechat_id) {
      setPhase('auto-binding');
      (async () => {
        try {
          const res = await fetch(`${__API_ENDPOINT__}/api/user/bind-wechat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ bind_token: bindToken }),
          });
          const data = await res.json();
          if (data.success) {
            await refresh();
            setPhase('auto-bound');
          } else {
            setErrorMessage(data.message || 'Could not bind the WeChat ID to your ROwO account.');
            setPhase('error');
          }
        } catch {
          setErrorMessage('Network error while binding the WeChat ID.');
          setPhase('error');
        }
      })();
      return;
    }
    if (user.wechat_id === wechatId) {
      setPhase('auto-bound');
      return;
    }
    setPhase('conflict');
  }, [user, wechatId, bindToken, refresh]);

  const submitSwitch = async (factor: TwoFactorSubmitValues = {}) => {
    if (!currentPassword) return;
    setPhase('switching');
    setErrorMessage('');
    try {
      const res = await fetch(`${__API_ENDPOINT__}/api/user/change-wechat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          current_password: currentPassword,
          bind_token: bindToken,
          new_wechat_id: wechatId,
          ...factor,
        }),
      });
      const data = await res.json();
      if (data.success) {
        await refresh();
        setCurrentPassword('');
        setPhase('switched');
        return;
      }
      if (data.two_factor_required && Array.isArray(data.available_methods)) {
        setAvailable2faMethods(data.available_methods);
      }
      setErrorMessage(data.message || 'Could not switch the binding.');
      setPhase('conflict');
    } catch {
      setErrorMessage('Network error while switching the binding.');
      setPhase('conflict');
    }
  };

  const handleSwitchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (twoFactorRequired) return; // 2FA submit handles network call
    await submitSwitch();
  };

  if (phase === 'auto-binding') {
    return (
      <CardShell>
        <div className="flex flex-col items-center gap-4 py-2">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          <p className="text-sm text-slate-600">Linking this WeChat ID to your ROwO account...</p>
        </div>
      </CardShell>
    );
  }

  if (phase === 'auto-bound') {
    return (
      <CardShell>
        <Header
          icon={<CheckCircle2 className="w-7 h-7" />}
          color={pending ? 'amber' : 'emerald'}
          title={
            pending
              ? 'Submitted — linked to your ROwO account'
              : reverified ? 'Re-verification complete' : 'Verification complete'
          }
          subtitle={
            <>
              WeChat ID <span className="font-mono">{wechatId}</span>{' '}
              is linked to <strong>@{user?.username}</strong>.
              {pending && (
                <>
                  <br />
                  <span className="text-amber-700">
                    Your manual verification is pending admin review. You&rsquo;ll show as
                    &ldquo;Pending&rdquo; until an admin approves it.
                  </span>
                </>
              )}
            </>
          }
        />
        <button
          onClick={() => navigate('/center')}
          className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
        >
          Go to User Center
          <ArrowRight className="w-4 h-4" />
        </button>
      </CardShell>
    );
  }

  if (phase === 'switched') {
    return (
      <CardShell>
        <Header
          icon={<CheckCircle2 className="w-7 h-7" />}
          color="emerald"
          title="WeChat binding switched"
          subtitle={
            <>
              Your ROwO account is now linked to{' '}
              <span className="font-mono">{wechatId}</span>.
            </>
          }
        />
        <button
          onClick={() => navigate('/center')}
          className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
        >
          Go to User Center
          <ArrowRight className="w-4 h-4" />
        </button>
      </CardShell>
    );
  }

  if (phase === 'conflict' || phase === 'switching') {
    return (
      <CardShell>
        <Header
          icon={<AlertTriangle className="w-7 h-7" />}
          color="amber"
          title="WeChat ID mismatch"
          subtitle={
            <>
              Your ROwO account <strong>@{user?.username}</strong> is bound to{' '}
              <span className="font-mono break-all">{user?.wechat_id}</span>. You just verified{' '}
              <span className="font-mono break-all">{wechatId}</span>.
            </>
          }
        />

        {alreadyLinkedToRowo ? (
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-sm text-amber-800 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>
              The verified WeChat ID is already linked to a different ROwO account. You can't
              switch your current account's binding to it. Sign out and sign in to that account
              instead, or keep your current binding.
            </span>
          </div>
        ) : (
          <form onSubmit={handleSwitchSubmit} className="space-y-3">
            <div>
              <label htmlFor="switchPassword" className="block text-sm font-medium text-slate-700 mb-1 ml-1">
                Confirm with current password to switch binding
              </label>
              <input
                id="switchPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Current password"
                className="block w-full px-4 py-3 rounded-xl border border-slate-300 shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
              <p className="text-xs text-slate-500 mt-1 ml-1">
                Switching counts against the once-per-year limit.
              </p>
            </div>

            {twoFactorRequired && currentPassword && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="w-4 h-4 text-indigo-600" />
                  <div className="text-sm font-medium text-slate-900">Confirm with 2FA</div>
                </div>
                <TwoFactorChallengeForm
                  availableMethods={available2faMethods}
                  onSubmit={submitSwitch}
                  busy={phase === 'switching'}
                  errorMessage={errorMessage || null}
                  fetchPasskeyChallenge={fetchPasskeyChallenge}
                  compact
                />
              </div>
            )}

            {!twoFactorRequired && errorMessage && (
              <div className="bg-red-50 border border-red-100 rounded-xl p-3 text-sm text-red-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {!twoFactorRequired && (
              <button
                type="submit"
                disabled={phase === 'switching' || !currentPassword}
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
              >
                {phase === 'switching' ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                {phase === 'switching' ? 'Switching...' : 'Switch binding to new WeChat ID'}
              </button>
            )}
          </form>
        )}

        <div className="grid grid-cols-2 gap-2 pt-2">
          <button
            onClick={() => navigate('/center')}
            className="py-2.5 px-3 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors"
          >
            Keep current, skip
          </button>
          <button
            onClick={() => {
              signOut();
              navigate(
                alreadyLinkedToRowo
                  ? `/login?bind_token=${encodeURIComponent(bindToken)}&next=${encodeURIComponent('/center')}`
                  : `/signup?bind_token=${encodeURIComponent(bindToken)}&wechat_id=${encodeURIComponent(wechatId)}`,
                { replace: true }
              );
            }}
            className="py-2.5 px-3 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors"
          >
            {alreadyLinkedToRowo ? 'Sign out & sign in to other' : 'Sign out & use another'}
          </button>
        </div>
      </CardShell>
    );
  }

  if (phase === 'error') {
    return (
      <CardShell>
        <Header
          icon={<AlertTriangle className="w-7 h-7" />}
          color="red"
          title="Verified, but could not link"
          subtitle={errorMessage}
        />
        <button
          onClick={() => navigate('/center')}
          className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-xl shadow-sm transition-colors"
        >
          Continue to User Center
        </button>
      </CardShell>
    );
  }

  // phase === 'choose' — not logged in
  const signupHref = `/signup?bind_token=${encodeURIComponent(bindToken)}&wechat_id=${encodeURIComponent(wechatId)}`;
  const loginHref = `/login?bind_token=${encodeURIComponent(bindToken)}&next=${encodeURIComponent('/center')}`;

  if (alreadyLinkedToRowo) {
    return (
      <CardShell>
        <Header
          icon={<LogIn className="w-7 h-7" />}
          color="indigo"
          title={reverified ? 'Re-verified — sign in to manage' : 'Verified — sign in to manage'}
          subtitle={
            <>
              This WeChat ID is already linked to an existing <strong>ROwO Account</strong>.
              Sign in to that account to manage it.
              <br />
              <span className="font-mono text-xs text-slate-500 break-all">
                Verified WeChat ID: {wechatId}
              </span>
            </>
          }
        />

        <div className="space-y-2">
          <button
            onClick={() => navigate(loginHref)}
            className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
          >
            <LogIn className="w-4 h-4" />
            Sign in to existing ROwO Account
          </button>
          <button
            onClick={() => navigate('/')}
            className="w-full py-2.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
          >
            Skip for now
          </button>
        </div>

        <p className="text-xs text-slate-400 text-center mt-2">
          Lost access to that account? Contact an admin to recover it.
        </p>
      </CardShell>
    );
  }

  return (
    <CardShell>
      <Header
        icon={<Sparkles className="w-7 h-7" />}
        color="indigo"
        title={
          pending
            ? 'Submitted — link it to a ROwO Account?'
            : reverified ? 'Re-verified — manage in one place?' : 'Verified — manage in one place?'
        }
        subtitle={
          <>
            Create a <strong>ROwO Account</strong> to manage your identity, preferences, and
            authorize third-party apps with a single login.
            {pending && (
              <>
                <br />
                <span className="text-amber-700">
                  Your manual verification is pending review — you can link it now and it will
                  flip to &ldquo;Verified&rdquo; automatically once approved.
                </span>
              </>
            )}
            <br />
            <span className="font-mono text-xs text-slate-500 break-all">
              {pending ? 'WeChat ID' : 'Verified WeChat ID'}: {wechatId}
            </span>
          </>
        }
      />

      <div className="space-y-2">
        <button
          onClick={() => navigate(signupHref)}
          className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
        >
          <UserPlus className="w-4 h-4" />
          Create ROwO Account
        </button>
        <button
          onClick={() => navigate(loginHref)}
          className="w-full py-3 px-4 bg-white border border-slate-200 text-slate-700 font-medium rounded-xl hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
        >
          <LogIn className="w-4 h-4" />
          Sign in to existing ROwO Account
        </button>
        <button
          onClick={() => navigate('/')}
          className="w-full py-2.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
        >
          Skip for now
        </button>
      </div>

      <p className="text-xs text-slate-400 text-center mt-2">
        Skipping leaves you verified — you can create a ROwO Account later from the header.
      </p>
    </CardShell>
  );
}

function CardShell({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-5"
    >
      {children}
    </motion.div>
  );
}

const colorClasses: Record<string, string> = {
  indigo: 'bg-indigo-100 text-indigo-600',
  emerald: 'bg-emerald-100 text-emerald-600',
  amber: 'bg-amber-100 text-amber-600',
  red: 'bg-red-100 text-red-600',
};

function Header({
  icon,
  color,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  color: keyof typeof colorClasses | string;
  title: string;
  subtitle: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center">
      <div className={`p-3 rounded-2xl ${colorClasses[color] || colorClasses.indigo} mb-3`}>
        {icon}
      </div>
      <h2 className="text-xl font-bold text-slate-900">{title}</h2>
      <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">{subtitle}</p>
    </div>
  );
}
