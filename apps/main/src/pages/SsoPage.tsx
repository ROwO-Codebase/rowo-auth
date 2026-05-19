import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, ShieldAlert } from 'lucide-react';
import { getSessionToken } from '@rowo/shared/session';
import { useSession } from '../contexts/SessionContext';

// Allowed `next` origins for cross-subdomain token hand-off. Adding a new
// subdomain requires explicit allowlist entry here to prevent token
// exfiltration to attacker-controlled hosts.
const ALLOWED_NEXT_ORIGINS = new Set([
  'https://developers.rowo.link',
  'http://localhost:5174',
]);

function isAllowedNext(rawNext: string | null): URL | null {
  if (!rawNext) return null;
  let parsed: URL;
  try { parsed = new URL(rawNext); } catch { return null; }
  if (!ALLOWED_NEXT_ORIGINS.has(parsed.origin)) return null;
  return parsed;
}

export default function SsoPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading } = useSession();
  const [error, setError] = useState<string | null>(null);

  const rawNext = searchParams.get('next');
  const next = useMemo(() => isAllowedNext(rawNext), [rawNext]);

  useEffect(() => {
    if (!rawNext) {
      setError('Missing `next` parameter.');
      return;
    }
    if (!next) {
      setError('That destination is not on the allowlist.');
      return;
    }
    if (loading) return;
    const token = getSessionToken();
    if (token && user) {
      const url = new URL(next.toString());
      url.hash = 'token=' + encodeURIComponent(token);
      window.location.replace(url.toString());
      return;
    }
    const here = '/sso?next=' + encodeURIComponent(rawNext);
    navigate('/login?next=' + encodeURIComponent(here), { replace: true });
  }, [rawNext, next, user, loading, navigate]);

  if (error) {
    return (
      <div className="max-w-md mx-auto mt-20 bg-white border border-rose-200 rounded-3xl p-8 text-center">
        <ShieldAlert className="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <h1 className="text-xl font-semibold text-slate-900 mb-1">Sign-in handoff blocked</h1>
        <p className="text-sm text-slate-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-20 text-center text-slate-500">
      <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
      Signing you in&hellip;
    </div>
  );
}
