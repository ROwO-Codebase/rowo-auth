import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  CircleOff,
  ExternalLink,
  Fingerprint,
  FlaskConical,
  KeyRound,
  Network,
  ShieldCheck,
  Trash2,
  UserRoundCheck,
} from 'lucide-react';

const FLOW = [
  {
    step: '01',
    title: 'Issue a challenge',
    body: 'Your backend stores a fresh nonce with the exact action, resource, expiry, and operation hash.',
  },
  {
    step: '02',
    title: 'Ask for approval',
    body: 'The isolated wallet shows the real RP origin and signs only after the user approves the request.',
  },
  {
    step: '03',
    title: 'Verify and consume',
    body: 'Your backend verifies the proof, checks live registry status, and atomically consumes the challenge.',
  },
];

export default function NexusLandingPage() {
  return (
    <div className="space-y-10 sm:space-y-14">
      <section className="relative overflow-hidden bg-slate-900 rounded-3xl px-6 py-10 sm:px-10 sm:py-14 text-white">
        <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.18)_1px,transparent_0)] [background-size:22px_22px]" />
        <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-indigo-500/30 blur-3xl" />
        <div className="relative max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-xs font-semibold text-indigo-100 mb-5">
            <ShieldCheck className="w-3.5 h-3.5" />
            Pre-production developer preview
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-5">
            Prove control with <span className="text-indigo-300">ROwO Nexus</span>
          </h1>
          <p className="text-base sm:text-lg text-slate-300 leading-8 max-w-2xl">
            Give pseudonymous users durable control of app resources without turning them into a
            ROwO account, profile, or global identifier.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/nexus/docs/quick-start"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-medium transition-colors shadow-sm"
            >
              Start integrating <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/nexus/playground"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-white font-medium transition-colors"
            >
              Open playground <FlaskConical className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="grid lg:grid-cols-[1fr_1.2fr] gap-5">
        <div className="bg-indigo-50 border border-indigo-100 rounded-3xl p-6 sm:p-8">
          <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mb-5">
            <Fingerprint className="w-6 h-6" />
          </div>
          <div className="text-xs uppercase tracking-wide font-semibold text-indigo-700 mb-2">
            Nexus is not OAuth
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900 mb-3">
            No account sign-in. No profile claims. No access token.
          </h2>
          <p className="text-sm text-slate-700 leading-6">
            Nexus proves that one cryptographic subject approved one exact operation. If you need
            a ROwO account and consented profile data, use OAuth instead.
          </p>
          <Link
            to="/nexus/docs/introduction"
            className="inline-flex items-center gap-1.5 mt-5 text-sm font-semibold text-indigo-700 hover:text-indigo-800"
          >
            Compare the products <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Capability
            icon={KeyRound}
            title="Local keys"
            body="Identity keys stay inside the dedicated wallet origin and are never sent to the RP."
          />
          <Capability
            icon={Network}
            title="Audience-bound"
            body="The wallet derives the relying-party audience from the actual browser message origin."
          />
          <Capability
            icon={CircleOff}
            title="Unlinkable by default"
            body="Fresh identities use independent random keys without a global controller identifier."
          />
          <Capability
            icon={Trash2}
            title="Terminal disposal"
            body="Revocation is proven before local key material is removed, and it cannot be reversed."
          />
        </div>
      </section>

      <section>
        <div className="max-w-2xl mb-6">
          <div className="text-xs uppercase tracking-wide font-semibold text-indigo-600 mb-2">
            Relying-party flow
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mb-3">
            A short proof, backed by a live lifecycle check
          </h2>
          <p className="text-slate-600">
            The popup is only one part of the authorization boundary. The backend challenge and
            authoritative status check are equally required.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {FLOW.map((item) => (
            <div key={item.step} className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="font-mono text-xs font-semibold text-indigo-600 mb-5">{item.step}</div>
              <h3 className="font-semibold text-slate-900 mb-2">{item.title}</h3>
              <p className="text-sm text-slate-600 leading-6">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid md:grid-cols-3 gap-4">
        <ActionCard
          icon={BookOpen}
          title="Read the Nexus docs"
          body="Concepts, wallet transport, proof verification, lifecycle, APIs, and a release checklist."
          to="/nexus/docs/introduction"
          label="Open documentation"
        />
        <ActionCard
          icon={FlaskConical}
          title="Use safe playgrounds"
          body="Build a request shape and inspect public lifecycle status without exposing credentials."
          to="/nexus/playground"
          label="Open playground"
        />
        <a
          href="https://notes.rowo.link"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-indigo-200 hover:shadow-sm transition-all"
        >
          <UserRoundCheck className="w-6 h-6 text-indigo-600 mb-4" />
          <h3 className="font-semibold text-slate-900 mb-2">Try the reference RP</h3>
          <p className="text-sm text-slate-600 leading-6 mb-4">
            Create and edit anonymous notes through the complete wallet and backend verification
            flow.
          </p>
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-700">
            Open Notes <ExternalLink className="w-3.5 h-3.5" />
          </span>
        </a>
      </section>
    </div>
  );
}

function Capability({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof KeyRound;
  title: string;
  body: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5">
      <Icon className="w-5 h-5 text-indigo-600 mb-4" />
      <h3 className="font-semibold text-slate-900 mb-1.5">{title}</h3>
      <p className="text-sm text-slate-600 leading-6">{body}</p>
    </div>
  );
}

function ActionCard({
  icon: Icon,
  title,
  body,
  to,
  label,
}: {
  icon: typeof BookOpen;
  title: string;
  body: string;
  to: string;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-indigo-200 hover:shadow-sm transition-all"
    >
      <Icon className="w-6 h-6 text-indigo-600 mb-4" />
      <h3 className="font-semibold text-slate-900 mb-2">{title}</h3>
      <p className="text-sm text-slate-600 leading-6 mb-4">{body}</p>
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-700">
        {label} <ArrowRight className="w-3.5 h-3.5" />
      </span>
    </Link>
  );
}
