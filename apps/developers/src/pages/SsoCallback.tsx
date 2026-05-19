import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, ShieldAlert } from 'lucide-react';
import { useSession } from '../contexts/SessionContext';

export default function SsoCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn } = useSession();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '');
    const params = new URLSearchParams(hash);
    const token = params.get('token');
    if (!token) {
      setError('No token in the SSO callback.');
      return;
    }
    const to = searchParams.get('to') || '/clients';
    (async () => {
      await signIn(token);
      history.replaceState(null, '', window.location.pathname);
      navigate(to, { replace: true });
    })();
  }, [signIn, navigate, searchParams]);

  if (error) {
    return (
      <div className="max-w-md mx-auto mt-20 bg-white border border-rose-200 rounded-3xl p-8 text-center">
        <ShieldAlert className="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <h1 className="text-xl font-semibold text-slate-900 mb-1">Sign-in failed</h1>
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
