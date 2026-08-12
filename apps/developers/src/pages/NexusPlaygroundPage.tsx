import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  FileJson,
  Fingerprint,
  FlaskConical,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { clsx } from 'clsx';

type PlaygroundMode = 'request' | 'status';

interface StatusResult {
  status: number;
  ok: boolean;
  body: string;
  durationMs: number;
}

const PRINTABLE_ASCII_PATTERN = /^[\x20-\x7e]+$/;
const FIELD_CLASS =
  'w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white font-mono text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500';

function isCanonicalBase64Url(value: string, expectedBytes: number): boolean {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return false;

  try {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4);
    const decoded = atob(padded);
    if (decoded.length !== expectedBytes) return false;
    return btoa(decoded).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '') === value;
  } catch {
    return false;
  }
}

function randomNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export default function NexusPlaygroundPage() {
  const [mode, setMode] = useState<PlaygroundMode>('request');

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <FlaskConical className="w-5 h-5 text-indigo-600" />
            <span className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
              Nexus developer tools
            </span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Nexus playground</h1>
          <p className="text-sm text-slate-600 mt-2 max-w-2xl">
            Explore negotiated v2 proof requests and public identity status without OAuth
            credentials, private keys, or pasted live proofs.
          </p>
        </div>
        <a
          href="https://notes.rowo.link"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium transition-colors self-start"
        >
          Try full proof flow <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" />
        <div className="text-sm text-amber-950 leading-6">
          <strong className="font-semibold">Shape explorer, not an authorization backend.</strong>{' '}
          Production challenges must be issued, stored, and consumed by your server. Registration
          and revocation are wallet-only mutations, so this portal intentionally does not call
          them.
        </div>
      </div>

      <div className="grid grid-cols-1 min-[360px]:grid-cols-2 sm:inline-grid sm:w-auto w-full items-stretch gap-1 p-1 bg-slate-100 border border-slate-200 rounded-xl">
        <ModeButton
          active={mode === 'request'}
          icon={FileJson}
          label="Proof request builder"
          controls="nexus-proof-request-builder"
          onClick={() => setMode('request')}
        />
        <ModeButton
          active={mode === 'status'}
          icon={Search}
          label="Identity status"
          controls="nexus-identity-status"
          onClick={() => setMode('status')}
        />
      </div>

      {mode === 'request' ? <RequestBuilder /> : <StatusLookup />}

      <div className="grid sm:grid-cols-2 gap-4">
        <ServiceLink
          title="V2 discovery document"
          body="Inspect v1/v2 protocols, device registry, popup channels, service keys, and wallet URL."
          href={`${__NEXUS_API_ENDPOINT__}/.well-known/nexus-v2.json`}
        />
        <ServiceLink
          title="Registry and status JWKS"
          body="Inspect the public Ed25519 keys used to authenticate receipts and status statements."
          href={`${__NEXUS_API_ENDPOINT__}/.well-known/jwks.json`}
        />
      </div>
    </div>
  );
}

function RequestBuilder() {
  const [action, setAction] = useState('note:create');
  const [resource, setResource] = useState('note:draft');
  const [contextHash, setContextHash] = useState('');
  const [lifetime, setLifetime] = useState(120);
  const [nonce, setNonce] = useState(() => randomNonce());
  const [expiresAt, setExpiresAt] = useState(() => Math.floor(Date.now() / 1000) + 120);
  const [copied, setCopied] = useState<'json' | 'code' | null>(null);

  const actionIsValid = action.length <= 128 && PRINTABLE_ASCII_PATTERN.test(action);
  const resourceIsValid = resource.length <= 512 && PRINTABLE_ASCII_PATTERN.test(resource);
  const contextHashIsValid =
    !contextHash.trim() || isCanonicalBase64Url(contextHash.trim(), 32);
  const requestIsValid = actionIsValid && resourceIsValid && contextHashIsValid;
  const request = useMemo(
    () => ({
      action,
      resource,
      nonce,
      expiresAt,
      ...(contextHash.trim() ? { contextHash: contextHash.trim() } : {}),
    }),
    [action, contextHash, expiresAt, nonce, resource],
  );
  const requestJson = JSON.stringify(request, null, 2);
  const code = `import { createNexusClient } from '@nexus/sdk-browser';

const nexus = createNexusClient({
  walletUrl: 'https://wallet.rowo.link',
});

// Obtain this object from your backend challenge endpoint.
const request = ${requestJson};

const result = await nexus.requestProofV2(request, {
  // Copy the exact ordered policy from your backend challenge.
  acceptedProofProtocols: [
    'nexus.ownership-proof.v2',
    'nexus.ownership-proof.v1',
  ],
});
// Send result.proofProtocol + result.proof + your challenge ID
// to your backend for matching verification.`;

  const regenerate = () => {
    setNonce(randomNonce());
    setExpiresAt(Math.floor(Date.now() / 1000) + lifetime);
  };

  const changeLifetime = (value: number) => {
    const next = Math.min(120, Math.max(15, value));
    setLifetime(next);
    setExpiresAt(Math.floor(Date.now() / 1000) + next);
  };

  const copy = async (kind: 'json' | 'code', value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  };

  return (
    <div id="nexus-proof-request-builder" className="grid lg:grid-cols-[0.85fr_1.15fr] gap-5 items-start">
      <section className="bg-white border border-slate-200 rounded-3xl p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-slate-900">Challenge fields</h2>
          <p className="text-xs text-slate-500 mt-1">
            The generated nonce is for learning only. A production backend generates and stores it.
          </p>
        </div>

        <Field id="nexus-action" label="action" hint={`${action.length}/128 printable characters`}>
          <input
            id="nexus-action"
            value={action}
            onChange={(event) => setAction(event.target.value)}
            maxLength={128}
            aria-invalid={!actionIsValid}
            aria-describedby={`nexus-action-hint${actionIsValid ? '' : ' nexus-action-error'}`}
            className={clsx(
              FIELD_CLASS,
              !actionIsValid && 'border-rose-300 ring-1 ring-rose-200',
            )}
            spellCheck={false}
          />
          {!actionIsValid && (
            <p id="nexus-action-error" className="text-xs text-rose-700 mt-1.5">
              Use 1–128 printable ASCII characters.
            </p>
          )}
        </Field>

        <Field id="nexus-resource" label="resource" hint={`${resource.length}/512 printable characters`}>
          <input
            id="nexus-resource"
            value={resource}
            onChange={(event) => setResource(event.target.value)}
            maxLength={512}
            aria-invalid={!resourceIsValid}
            aria-describedby={`nexus-resource-hint${resourceIsValid ? '' : ' nexus-resource-error'}`}
            className={clsx(
              FIELD_CLASS,
              !resourceIsValid && 'border-rose-300 ring-1 ring-rose-200',
            )}
            spellCheck={false}
          />
          {!resourceIsValid && (
            <p id="nexus-resource-error" className="text-xs text-rose-700 mt-1.5">
              Use 1–512 printable ASCII characters.
            </p>
          )}
        </Field>

        <Field id="nexus-lifetime" label="lifetime" hint="Nexus allows at most 120 seconds">
          <div className="flex items-center gap-3">
            <input
              id="nexus-lifetime"
              type="range"
              min={15}
              max={120}
              step={15}
              value={lifetime}
              onChange={(event) => changeLifetime(Number(event.target.value))}
              aria-describedby="nexus-lifetime-hint"
              className="flex-1 accent-indigo-600"
            />
            <span className="font-mono text-sm text-slate-700 w-12 text-right">{lifetime}s</span>
          </div>
        </Field>

        <Field
          id="nexus-context-hash"
          label="contextHash (optional)"
          hint="Unpadded base64url SHA-256 of the exact operation body"
        >
          <input
            id="nexus-context-hash"
            value={contextHash}
            onChange={(event) => setContextHash(event.target.value)}
            placeholder="43-character base64url value"
            aria-invalid={!contextHashIsValid}
            aria-describedby={`nexus-context-hash-hint${
              contextHashIsValid ? '' : ' nexus-context-hash-error'
            }`}
            className={clsx(
              FIELD_CLASS,
              !contextHashIsValid && 'border-rose-300 ring-1 ring-rose-200',
            )}
            spellCheck={false}
          />
          {!contextHashIsValid && (
            <p id="nexus-context-hash-error" className="text-xs text-rose-700 mt-1.5">
              A context hash must encode exactly 32 bytes as 43 unpadded base64url characters.
            </p>
          )}
        </Field>

        <button
          type="button"
          onClick={regenerate}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-sm font-medium text-slate-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Regenerate demo nonce
        </button>
      </section>

      <section className="space-y-4 min-w-0">
        <CodePanel
          title="ProofRequest"
          value={requestJson}
          copied={copied === 'json'}
          disabled={!requestIsValid}
          onCopy={() => copy('json', requestJson)}
        />
        <CodePanel
          title="Browser SDK shape"
          value={code}
          copied={copied === 'code'}
          disabled={!requestIsValid}
          onCopy={() => copy('code', code)}
        />
        <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex items-start gap-3">
          <Fingerprint className="w-5 h-5 text-indigo-700 mt-0.5 shrink-0" />
          <p className="text-sm text-indigo-950 leading-6">
            Notice that the request has no <code className="font-mono">aud</code> field. The wallet
            derives the audience from the actual RP message origin; the caller cannot type a
            different one into JSON.
          </p>
        </div>
      </section>
    </div>
  );
}

function StatusLookup() {
  const [subject, setSubject] = useState('');
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<StatusResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const normalizedSubject = subject.trim();
  const validSubject =
    normalizedSubject.startsWith('nx1_') &&
    isCanonicalBase64Url(normalizedSubject.slice('nx1_'.length), 32);

  const lookup = async () => {
    if (!validSubject) return;
    setPending(true);
    setResult(null);
    setError(null);
    const started = performance.now();

    try {
      const response = await fetch(`${__NEXUS_API_ENDPOINT__}/v1/identity/status`, {
        method: 'POST',
        headers: {
          Accept: 'application/nexus+json',
          'Content-Type': 'application/nexus+json',
        },
        body: JSON.stringify({ subject: normalizedSubject }),
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
      });
      const raw = await response.text();
      let body = raw;
      try {
        body = JSON.stringify(JSON.parse(raw), null, 2);
      } catch {
        // Preserve a non-JSON response for diagnosis without interpreting it as trusted status.
      }
      setResult({
        status: response.status,
        ok: response.ok,
        body,
        durationMs: Math.round(performance.now() - started),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The status request failed.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div id="nexus-identity-status" className="grid lg:grid-cols-[0.85fr_1.15fr] gap-5 items-start">
      <section className="bg-white border border-slate-200 rounded-3xl p-6">
        <div className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-4">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <h2 className="font-semibold text-slate-900 mb-1">Authoritative status lookup</h2>
        <p className="text-sm text-slate-600 leading-6 mb-5">
          Paste a public Nexus subject. The value stays in component memory, is sent only in the
          request body, and is never added to the URL.
        </p>

        <Field
          id="nexus-subject"
          label="Nexus subject"
          hint="nx1_ followed by a canonical 32-byte hash"
        >
          <input
            id="nexus-subject"
            value={subject}
            onChange={(event) => {
              setSubject(event.target.value);
              setResult(null);
              setError(null);
            }}
            placeholder="nx1_…"
            aria-invalid={subject.length > 0 && !validSubject}
            aria-describedby={`nexus-subject-hint${
              subject.length > 0 && !validSubject ? ' nexus-subject-error' : ''
            }`}
            className={FIELD_CLASS}
            spellCheck={false}
            autoComplete="off"
          />
        </Field>

        {subject && !validSubject && (
          <p id="nexus-subject-error" className="text-xs text-rose-700 mt-2">
            Enter a canonical <code className="font-mono">nx1_</code> subject with 43 base64url
            characters.
          </p>
        )}

        <button
          type="button"
          onClick={lookup}
          disabled={!validSubject || pending}
          className="mt-5 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Check live status
        </button>
      </section>

      <section
        className="bg-white border border-slate-200 rounded-3xl p-6 min-h-72 min-w-0"
        aria-live="polite"
        aria-busy={pending}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900">Registry response</h2>
          {result && (
            <div className="flex items-center gap-2">
              <span
                className={clsx(
                  'px-2 py-0.5 rounded-full text-xs font-semibold',
                  result.ok
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-rose-100 text-rose-700',
                )}
              >
                HTTP {result.status}
              </span>
              <span className="text-xs text-slate-400">{result.durationMs} ms</span>
            </div>
          )}
        </div>

        {error && (
          <div role="alert" className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-sm text-rose-800">
            Request failed: {error}
          </div>
        )}

        {result ? (
          <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 overflow-auto text-xs leading-relaxed max-h-[32rem]">
            {result.body}
          </pre>
        ) : (
          <div className="h-52 rounded-2xl border border-dashed border-slate-200 bg-slate-50 flex items-center justify-center px-6 text-center">
            <p className="text-sm text-slate-500 max-w-sm">
              A successful response includes public genesis, lifecycle sequence, timestamps, and a
              signed short-lived status statement. Unknown and revoked subjects must fail closed.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function ModeButton({
  active,
  icon: Icon,
  label,
  controls,
  onClick,
}: {
  active: boolean;
  icon: typeof FileJson;
  label: string;
  controls: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-controls={controls}
      className={clsx(
        'inline-flex min-w-0 items-center justify-center gap-2 px-2 sm:px-3 py-2 rounded-lg text-xs sm:text-sm leading-tight font-medium transition-colors',
        active ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-900',
      )}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="block">
      <label htmlFor={id} className="block font-mono text-xs font-semibold text-slate-700 mb-1.5">
        {label}
      </label>
      {children}
      <span id={`${id}-hint`} className="block text-xs text-slate-500 mt-1.5">
        {hint}
      </span>
    </div>
  );
}

function CodePanel({
  title,
  value,
  copied,
  disabled,
  onCopy,
}: {
  title: string;
  value: string;
  copied: boolean;
  disabled: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-5 min-w-0">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-slate-900">{title}</h2>
        <button
          type="button"
          onClick={onCopy}
          disabled={disabled}
          aria-label={disabled ? `Resolve invalid ${title} fields before copying` : `Copy ${title}`}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-600" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 overflow-auto text-xs leading-relaxed max-h-80">
        {value}
      </pre>
    </div>
  );
}

function ServiceLink({ title, body, href }: { title: string; body: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-indigo-200 hover:shadow-sm transition-all flex items-start gap-4"
    >
      <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
        <FileJson className="w-5 h-5" />
      </div>
      <div>
        <div className="font-semibold text-slate-900 flex items-center gap-1.5">
          {title} <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
        </div>
        <p className="text-sm text-slate-600 leading-6 mt-1">{body}</p>
      </div>
    </a>
  );
}
