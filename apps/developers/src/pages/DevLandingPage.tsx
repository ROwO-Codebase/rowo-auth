import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Key, BookOpen, FlaskConical, ArrowRight, ShieldCheck } from 'lucide-react';
import { useSession } from '../contexts/SessionContext';
import { startSsoLogin } from '../lib/mainSiteUrl';

export default function DevLandingPage() {
  const { user, loading } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate('/clients', { replace: true });
  }, [loading, user, navigate]);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mt-12 mb-16">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold mb-4">
          <ShieldCheck className="w-3.5 h-3.5" />
          Sign in with ROwO
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 mb-4">
          Build apps on top of <span className="text-indigo-600">ROwO identity</span>
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          Register OAuth clients, read the API reference, and try endpoints in a live playground.
          Any ROwO account can use the developer panel.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          {user ? (
            <Link
              to="/clients"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-sm transition-colors"
            >
              Go to your clients <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <button
              onClick={() => startSsoLogin('/clients')}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-sm transition-colors"
            >
              Sign in to get started <ArrowRight className="w-4 h-4" />
            </button>
          )}
          <Link
            to="/docs"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium transition-colors"
          >
            Read the docs
          </Link>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <FeatureCard
          icon={Key}
          title="OAuth clients"
          body="Register and rotate credentials for apps that let users sign in with ROwO."
          to="/clients"
        />
        <FeatureCard
          icon={BookOpen}
          title="API reference"
          body="Documentation for the authorization, token, and user-info endpoints."
          to="/docs"
        />
        <FeatureCard
          icon={FlaskConical}
          title="Playground"
          body="Call any endpoint with your session token directly from the browser."
          to="/playground"
        />
      </div>
    </div>
  );
}

function FeatureCard({
  icon: Icon, title, body, to,
}: { icon: typeof Key; title: string; body: string; to: string }) {
  return (
    <Link
      to={to}
      className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-indigo-200 hover:shadow-sm transition-all"
    >
      <Icon className="w-6 h-6 text-indigo-600 mb-3" />
      <div className="font-semibold text-slate-900 mb-1">{title}</div>
      <div className="text-sm text-slate-600">{body}</div>
    </Link>
  );
}
