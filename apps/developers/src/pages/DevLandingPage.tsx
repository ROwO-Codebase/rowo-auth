import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Check,
  Fingerprint,
  FlaskConical,
  Key,
  LogIn,
  ShieldCheck,
} from 'lucide-react';
import { useSession } from '../contexts/SessionContext';
import { startSsoLogin } from '../lib/mainSiteUrl';

export default function DevLandingPage() {
  const { user } = useSession();

  return (
    <div className="space-y-10 sm:space-y-14">
      <section className="text-center mt-6 sm:mt-12">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold mb-5">
          <ShieldCheck className="w-3.5 h-3.5" />
          ROwO developer platform
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 mb-5">
          Choose the identity model <span className="text-indigo-600">your app needs</span>
        </h1>
        <p className="text-base sm:text-lg text-slate-600 max-w-3xl mx-auto leading-8">
          OAuth signs users in with a ROwO account. Nexus proves control of a pseudonymous identity
          for one exact operation. Their credentials, sessions, and documentation stay separate.
        </p>
      </section>

      <section className="grid lg:grid-cols-2 gap-5">
        <ProductCard
          icon={Key}
          eyebrow="Account identity"
          title="ROwO OAuth"
          description="Authenticate a ROwO account and request consented profile or verification data through the authorization-code flow."
          points={['Client ID and secret', 'Access and refresh tokens', 'Consented profile scopes']}
          primary={{ to: '/docs', label: 'OAuth documentation' }}
          secondary={
            user
              ? { to: '/clients', label: 'Manage clients' }
              : { onClick: () => startSsoLogin('/clients'), label: 'Sign in to create a client' }
          }
        />

        <ProductCard
          icon={Fingerprint}
          eyebrow="Pseudonymous control"
          title="ROwO Nexus"
          description="Verify that a wallet-held cryptographic subject approved one exact action and resource without receiving a ROwO account or profile."
          points={['No account or profile claims', 'Audience-bound ownership proofs', 'Live revocation status']}
          primary={{ to: '/nexus', label: 'Explore Nexus' }}
          secondary={{ to: '/nexus/playground', label: 'Open Nexus playground' }}
          featured
        />
      </section>

      <section className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8">
        <div className="max-w-2xl mb-6">
          <div className="text-xs uppercase tracking-wide font-semibold text-slate-500 mb-2">
            Choose by outcome
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Keep authentication and proof of control distinct
          </h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Outcome
            icon={LogIn}
            title="Sign a person in"
            product="Use OAuth"
            to="/docs/oauth-flow"
          />
          <Outcome
            icon={BookOpen}
            title="Read ROwO profile data"
            product="Use OAuth scopes"
            to="/docs/overview"
          />
          <Outcome
            icon={Fingerprint}
            title="Control an anonymous resource"
            product="Use Nexus"
            to="/nexus/docs/quick-start"
          />
          <Outcome
            icon={FlaskConical}
            title="Explore lifecycle status"
            product="Use Nexus tools"
            to="/nexus/playground"
          />
        </div>
      </section>
    </div>
  );
}

type Action =
  | { to: string; label: string; onClick?: never }
  | { onClick: () => void; label: string; to?: never };

function ProductCard({
  icon: Icon,
  eyebrow,
  title,
  description,
  points,
  primary,
  secondary,
  featured = false,
}: {
  icon: typeof Key;
  eyebrow: string;
  title: string;
  description: string;
  points: string[];
  primary: Action;
  secondary: Action;
  featured?: boolean;
}) {
  return (
    <div
      className={
        featured
          ? 'relative overflow-hidden bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-white shadow-sm'
          : 'bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm'
      }
    >
      {featured && (
        <div className="absolute -right-16 -top-16 w-48 h-48 rounded-full bg-indigo-500/20 blur-3xl" />
      )}
      <div className="relative">
        <div
          className={
            featured
              ? 'w-12 h-12 rounded-2xl bg-indigo-500 text-white flex items-center justify-center mb-5'
              : 'w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center mb-5'
          }
        >
          <Icon className="w-6 h-6" />
        </div>
        <div
          className={
            featured
              ? 'text-xs uppercase tracking-wide font-semibold text-indigo-300 mb-2'
              : 'text-xs uppercase tracking-wide font-semibold text-indigo-600 mb-2'
          }
        >
          {eyebrow}
        </div>
        <h2 className={featured ? 'text-2xl font-bold mb-3' : 'text-2xl font-bold text-slate-900 mb-3'}>
          {title}
        </h2>
        <p className={featured ? 'text-sm text-slate-300 leading-6' : 'text-sm text-slate-600 leading-6'}>
          {description}
        </p>
        <ul className="mt-5 space-y-2.5">
          {points.map((point) => (
            <li
              key={point}
              className={featured ? 'flex gap-2 text-sm text-slate-300' : 'flex gap-2 text-sm text-slate-700'}
            >
              <Check className={featured ? 'w-4 h-4 text-indigo-300 shrink-0' : 'w-4 h-4 text-indigo-600 shrink-0'} />
              {point}
            </li>
          ))}
        </ul>
        <div className="mt-7 flex flex-wrap gap-2">
          <ActionButton action={primary} primary featured={featured} />
          <ActionButton action={secondary} featured={featured} />
        </div>
      </div>
    </div>
  );
}

function ActionButton({ action, primary = false, featured = false }: { action: Action; primary?: boolean; featured?: boolean }) {
  const className = primary
    ? 'inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors'
    : featured
      ? 'inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white text-sm font-medium transition-colors'
      : 'inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-sm font-medium transition-colors';

  const children = (
    <>
      {action.label} <ArrowRight className="w-3.5 h-3.5" />
    </>
  );

  return action.to ? (
    <Link to={action.to} className={className}>
      {children}
    </Link>
  ) : (
    <button type="button" onClick={action.onClick} className={className}>
      {children}
    </button>
  );
}

function Outcome({
  icon: Icon,
  title,
  product,
  to,
}: {
  icon: typeof Key;
  title: string;
  product: string;
  to: string;
}) {
  return (
    <Link
      to={to}
      className="rounded-2xl border border-slate-200 bg-slate-50 p-4 hover:bg-indigo-50 hover:border-indigo-100 transition-colors"
    >
      <Icon className="w-5 h-5 text-indigo-600 mb-4" />
      <div className="text-sm font-medium text-slate-900 mb-1">{title}</div>
      <div className="text-xs font-semibold text-indigo-700">{product}</div>
    </Link>
  );
}
