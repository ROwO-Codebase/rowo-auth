import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'motion/react';
import { ShieldCheck, Loader2, AlertTriangle, Lock, XCircle } from 'lucide-react';
import { useSession } from '../contexts/SessionContext';
import { authHeaders } from '@rowo/shared/session';

// IMPORTANT: redirect_uri is attacker-controlled until the backend has matched
// it against oauth_clients.allowed_redirect_uris. This page never constructs
// redirect URLs itself — every URL the browser navigates to is built by the
// backend after allowlist validation.

type Status =
  | 'parsing_params'
  | 'checking_session'
  | 'redirecting_to_login'
  | 'validating'
  | 'ready'
  | 'submitting'
  | 'redirecting_out'
  | 'error_in_page';

interface ValidateClient {
  client_id: string;
  display_name: string;
  icon_url: string | null;
  allowed_domain: string;
}

interface ValidateScopes {
  valid: string[];
  gated_locked: string[];
  unknown: string[];
  not_permitted: string[];
}

interface ValidateResponse {
  success: boolean;
  message?: string;
  client: ValidateClient;
  redirect_uri: string;
  scopes: ValidateScopes;
  user: { id: string; username: string };
  user_has_wechat: boolean;
}

const SCOPE_COPY: Record<string, { label: string; description: string }> = {
  basic: {
    label: 'Basic information',
    description: 'Your ROwO user ID and display name.',
  },
  verification: {
    label: 'Verification info',
    description: 'Whether your WeChat ID is verified, and how/when it was verified.',
  },
  wechat: {
    label: 'WeChat ID',
    description: 'Your WeChat ID.',
  },
};

function scopeLabel(scope: string): string {
  return SCOPE_COPY[scope]?.label || scope;
}

function scopeDescription(scope: string): string {
  return SCOPE_COPY[scope]?.description || '';
}

export default function OAuthAuthorizePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading: sessionLoading } = useSession();

  const clientId = searchParams.get('client_id') || '';
  const redirectUri = searchParams.get('redirect_uri') || '';
  const responseType = searchParams.get('response_type') || 'code';
  const scope = searchParams.get('scope') || '';
  const state = searchParams.get('state') || '';

  const [status, setStatus] = useState<Status>('parsing_params');
  const [validation, setValidation] = useState<ValidateResponse | null>(null);
  const [approvedScopes, setApprovedScopes] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const validateOnceRef = useRef(false);

  const loginNextParam = useMemo(() => {
    const original = searchParams.toString();
    return '/oauth/authorize?' + original;
  }, [searchParams]);

  useEffect(() => {
    if (status !== 'parsing_params') return;
    if (!clientId || !redirectUri) {
      setErrorMessage('Missing required parameters: client_id and redirect_uri.');
      setStatus('error_in_page');
      return;
    }
    setStatus('checking_session');
  }, [status, clientId, redirectUri]);

  useEffect(() => {
    if (status !== 'checking_session') return;
    if (sessionLoading) return;
    if (!user) {
      setStatus('redirecting_to_login');
      navigate(`/login?next=${encodeURIComponent(loginNextParam)}`, { replace: true });
      return;
    }
    setStatus('validating');
  }, [status, sessionLoading, user, navigate, loginNextParam]);

  useEffect(() => {
    if (status !== 'validating' || validateOnceRef.current) return;
    validateOnceRef.current = true;
    (async () => {
      try {
        const res = await fetch(`${__API_ENDPOINT__}/api/oauth/authorize/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({
            client_id: clientId,
            redirect_uri: redirectUri,
            response_type: responseType,
            scope,
          }),
        });
        const data = (await res.json()) as ValidateResponse;
        if (!res.ok || !data.success) {
          setErrorMessage(data.message || 'Unable to validate this request.');
          setStatus('error_in_page');
          return;
        }
        setValidation(data);
        setApprovedScopes(new Set(data.scopes.valid));
        setStatus('ready');
      } catch {
        setErrorMessage('Could not reach the ROwO server.');
        setStatus('error_in_page');
      }
    })();
  }, [status, clientId, redirectUri, responseType, scope]);

  const toggleScope = (s: string) => {
    if (s === 'basic') return;
    setApprovedScopes((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const handleApprove = async () => {
    if (!validation) return;
    setSubmitError(null);
    setStatus('submitting');
    try {
      const res = await fetch(`${__API_ENDPOINT__}/api/oauth/authorize/grant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          client_id: clientId,
          redirect_uri: redirectUri,
          scope,
          state,
          approved_scopes: Array.from(approvedScopes),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.redirect_url) {
        setSubmitError(data.message || 'Could not complete the authorization.');
        setStatus('ready');
        return;
      }
      setStatus('redirecting_out');
      window.location.replace(data.redirect_url);
    } catch {
      setSubmitError('Could not reach the ROwO server.');
      setStatus('ready');
    }
  };

  const handleDeny = async () => {
    if (!validation) return;
    setSubmitError(null);
    setStatus('submitting');
    try {
      const res = await fetch(`${__API_ENDPOINT__}/api/oauth/authorize/deny`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ client_id: clientId, redirect_uri: redirectUri, state }),
      });
      const data = await res.json();
      if (!res.ok || !data.success || !data.redirect_url) {
        setSubmitError(data.message || 'Could not cancel the authorization.');
        setStatus('ready');
        return;
      }
      setStatus('redirecting_out');
      window.location.replace(data.redirect_url);
    } catch {
      setSubmitError('Could not reach the ROwO server.');
      setStatus('ready');
    }
  };

  if (status === 'error_in_page') {
    return (
      <div className="max-w-md mx-auto mt-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 border border-red-100 rounded-3xl shadow-sm p-8"
        >
          <div className="flex flex-col items-center text-center">
            <div className="bg-red-100 p-3 rounded-2xl text-red-600 mb-3">
              <XCircle className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-semibold text-slate-900">Authorization failed</h2>
            <p className="text-sm text-red-700 mt-2">{errorMessage}</p>
            <Link
              to="/"
              className="mt-6 py-2 px-6 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-xl"
            >
              Back to ROwO
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  if (
    status === 'parsing_params' ||
    status === 'checking_session' ||
    status === 'redirecting_to_login' ||
    status === 'validating' ||
    status === 'redirecting_out'
  ) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3" />
        <p>Loading…</p>
      </div>
    );
  }

  if (!validation) return null;

  const requestedScopes: string[] = [
    ...validation.scopes.valid,
    ...validation.scopes.gated_locked,
  ];
  if (!requestedScopes.includes('basic')) requestedScopes.unshift('basic');
  const ignoredScopes = [...validation.scopes.not_permitted, ...validation.scopes.unknown];

  return (
    <div className="max-w-md mx-auto mt-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8"
      >
        <div className="flex flex-col items-center text-center mb-6">
          {/* Data-transfer diagram: ROwO icon → animated dots → third-party app icon */}
          <div className="flex items-center justify-center gap-3 sm:gap-4 mb-4">
            <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden flex items-center justify-center shrink-0">
              <img
                src={__ICON_URL__}
                alt="ROwO"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>

            <div
              className="relative flex items-center h-6 shrink-0"
              style={{ width: 80 }}
              aria-hidden="true"
            >
              <div className="absolute left-0 right-0 top-1/2 -translate-y-px h-px bg-gradient-to-r from-slate-200 via-indigo-200 to-slate-200" />
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="absolute w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]"
                  style={{ top: 'calc(50% - 3px)' }}
                  animate={{ x: [0, 74], opacity: [0, 1, 1, 0] }}
                  transition={{
                    duration: 1.6,
                    repeat: Infinity,
                    delay: i * 0.55,
                    ease: 'linear',
                  }}
                />
              ))}
            </div>

            {validation.client.icon_url ? (
              <div className="w-14 h-14 rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden shrink-0">
                <img
                  src={validation.client.icon_url}
                  alt=""
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center border border-slate-200 shadow-sm shrink-0">
                <ShieldCheck className="w-7 h-7" />
              </div>
            )}
          </div>
          <span className="sr-only">
            Sharing data from your ROwO account with {validation.client.display_name}.
          </span>

          <h2 className="text-xl font-semibold text-slate-900">
            Continue to {validation.client.display_name}
          </h2>
          <p className="text-xs text-slate-400 mt-1">{validation.client.allowed_domain}</p>
          <p className="text-sm text-slate-500 mt-3">
            Signed in as <strong>@{validation.user.username}</strong>.{' '}
            <Link
              to={`/login?next=${encodeURIComponent(loginNextParam)}`}
              className="text-indigo-600 hover:text-indigo-700"
            >
              Not you?
            </Link>
          </p>
        </div>

        <div className="space-y-2 mb-4">
          <p className="text-sm font-medium text-slate-700">This app will be able to access:</p>
          {requestedScopes.map((s) => {
            const gated = validation.scopes.gated_locked.includes(s);
            const isBasic = s === 'basic';
            const checked = isBasic ? true : approvedScopes.has(s);
            const disabled = isBasic || gated;
            return (
              <label
                key={s}
                className={
                  'flex items-start gap-3 rounded-xl border p-3 ' +
                  (gated
                    ? 'bg-amber-50 border-amber-100'
                    : 'bg-white border-slate-200 hover:border-indigo-300')
                }
              >
                <input
                  type="checkbox"
                  className="mt-1 accent-indigo-600"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggleScope(s)}
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-slate-900 flex items-center gap-2">
                    {scopeLabel(s)}
                    {gated && <Lock className="w-3 h-3 text-amber-600" />}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">{scopeDescription(s)}</div>
                  {gated && (
                    <div className="text-xs text-amber-700 mt-1">
                      Requires a verified WeChat ID. Bind one in the User Center to grant this scope.
                    </div>
                  )}
                </div>
              </label>
            );
          })}
        </div>

        {ignoredScopes.length > 0 && (
          <p className="text-xs text-slate-500 mb-4">
            Also requested: {ignoredScopes.join(', ')} (not available — will be ignored).
          </p>
        )}

        {submitError && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-4 flex items-start gap-2 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{submitError}</span>
          </div>
        )}

        <button
          type="button"
          onClick={handleApprove}
          disabled={status === 'submitting'}
          className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
        >
          {status === 'submitting' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {status === 'submitting' ? 'Working…' : 'Continue'}
        </button>
        <button
          type="button"
          onClick={handleDeny}
          disabled={status === 'submitting'}
          className="w-full mt-2 py-3 px-4 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-50 text-slate-700 font-medium rounded-xl transition-colors"
        >
          Cancel
        </button>
      </motion.div>
    </div>
  );
}
