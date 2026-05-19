import { useMemo, useState } from 'react';
import { FlaskConical, Send, Loader2, AlertTriangle, Copy, Check, LogIn } from 'lucide-react';
import { useSession } from '../contexts/SessionContext';
import { getSessionToken } from '@rowo/shared/session';
import { startSsoLogin } from '../lib/mainSiteUrl';

type ParamKind = 'string' | 'json';

interface ParamSpec {
  name: string;
  kind: ParamKind;
  hint?: string;
  placeholder?: string;
  optional?: boolean;
}

interface EndpointSpec {
  id: string;
  label: string;
  method: 'GET' | 'POST';
  path: string;
  description: string;
  auth: 'session' | 'none';
  params?: ParamSpec[];
}

const ENDPOINTS: EndpointSpec[] = [
  {
    id: 'me',
    label: 'GET /api/user/me',
    method: 'GET',
    path: '/api/user/me',
    description: 'Returns the profile of the currently signed-in user.',
    auth: 'session',
  },
  {
    id: 'list-clients',
    label: 'GET /api/developers/oauth-clients',
    method: 'GET',
    path: '/api/developers/oauth-clients',
    description: 'List the OAuth clients you own.',
    auth: 'session',
  },
  {
    id: 'authorize-validate',
    label: 'POST /api/oauth/authorize/validate',
    method: 'POST',
    path: '/api/oauth/authorize/validate',
    description: 'Validate an authorize request before showing a consent screen. Run this with one of your own clients to test it.',
    auth: 'session',
    params: [
      { name: 'client_id', kind: 'string' },
      { name: 'redirect_uri', kind: 'string', placeholder: 'https://example.com/cb' },
      { name: 'response_type', kind: 'string', placeholder: 'code' },
      { name: 'scope', kind: 'string', placeholder: 'basic', optional: true },
    ],
  },
  {
    id: 'token',
    label: 'POST /api/oauth/token',
    method: 'POST',
    path: '/api/oauth/token',
    description: 'Exchange an authorization code for a user profile. No session required — this is the server-to-server call.',
    auth: 'none',
    params: [
      { name: 'grant_type', kind: 'string', placeholder: 'authorization_code' },
      { name: 'client_id', kind: 'string' },
      { name: 'client_secret', kind: 'string', hint: 'Sent over the wire — only paste here when running against a local backend.' },
      { name: 'code', kind: 'string' },
      { name: 'redirect_uri', kind: 'string' },
    ],
  },
];

interface RequestResult {
  status: number;
  ok: boolean;
  body: string;
  durationMs: number;
}

export default function PlaygroundPage() {
  const { user, loading } = useSession();
  const [selectedId, setSelectedId] = useState<string>(ENDPOINTS[0].id);
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<RequestResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const endpoint = useMemo(
    () => ENDPOINTS.find((e) => e.id === selectedId) || ENDPOINTS[0],
    [selectedId]
  );

  const sessionToken = getSessionToken();
  const needsAuthButMissing = endpoint.auth === 'session' && !sessionToken;

  const onSend = async () => {
    setPending(true);
    setError(null);
    setResult(null);
    const body: Record<string, unknown> = {};
    for (const p of endpoint.params || []) {
      const raw = values[p.name] || '';
      if (!raw && p.optional) continue;
      body[p.name] = raw;
    }
    const headers: Record<string, string> = {};
    if (endpoint.method === 'POST') headers['Content-Type'] = 'application/json';
    if (endpoint.auth === 'session' && sessionToken) headers['Authorization'] = `Bearer ${sessionToken}`;
    const started = performance.now();
    try {
      const res = await fetch(`${__API_ENDPOINT__}${endpoint.path}`, {
        method: endpoint.method,
        headers,
        body: endpoint.method === 'POST' ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let pretty = text;
      try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch { /* keep raw */ }
      setResult({ status: res.status, ok: res.ok, body: pretty, durationMs: Math.round(performance.now() - started) });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Request failed: ${msg}`);
    } finally {
      setPending(false);
    }
  };

  const curlSnippet = useMemo(() => {
    const lines: string[] = [`curl -X ${endpoint.method} '${__API_ENDPOINT__}${endpoint.path}'`];
    if (endpoint.method === 'POST') lines.push(`  -H 'Content-Type: application/json'`);
    if (endpoint.auth === 'session') lines.push(`  -H 'Authorization: Bearer YOUR_TOKEN'`);
    if (endpoint.method === 'POST' && endpoint.params) {
      const body: Record<string, string> = {};
      for (const p of endpoint.params) {
        body[p.name] = values[p.name] || `<${p.name}>`;
      }
      lines.push(`  -d '${JSON.stringify(body)}'`);
    }
    return lines.join(' \\\n');
  }, [endpoint, values]);

  const copyCurl = async () => {
    try {
      await navigator.clipboard.writeText(curlSnippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <FlaskConical className="w-5 h-5 text-indigo-600" />
        <h1 className="text-2xl font-bold text-slate-900">API playground</h1>
      </div>
      <p className="text-sm text-slate-500 mb-6">Call any endpoint with your session token, straight from this browser tab.</p>

      {!loading && needsAuthButMissing && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-700 flex-shrink-0" />
          <div className="flex-1 text-sm text-amber-900">
            This endpoint needs a signed-in user. Sign in to populate the Authorization header automatically.
          </div>
          <button
            onClick={() => startSsoLogin('/playground')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium"
          >
            <LogIn className="w-3.5 h-3.5" /> Sign in
          </button>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-3xl p-6 mb-4">
        <label className="block text-sm font-semibold text-slate-900 mb-2">Endpoint</label>
        <select
          value={selectedId}
          onChange={(e) => { setSelectedId(e.target.value); setResult(null); setValues({}); }}
          className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-1 font-mono text-sm"
        >
          {ENDPOINTS.map((e) => (
            <option key={e.id} value={e.id}>{e.label}</option>
          ))}
        </select>
        <p className="text-xs text-slate-500 mb-4">{endpoint.description}</p>

        {endpoint.params && endpoint.params.length > 0 && (
          <div className="space-y-3 mb-4">
            {endpoint.params.map((p) => (
              <div key={p.name}>
                <label className="block text-xs font-mono font-semibold text-slate-700 mb-1">
                  {p.name}{p.optional && <span className="ml-1 font-sans text-slate-400 font-normal">(optional)</span>}
                </label>
                <input
                  type="text"
                  value={values[p.name] || ''}
                  onChange={(e) => setValues((v) => ({ ...v, [p.name]: e.target.value }))}
                  placeholder={p.placeholder}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                />
                {p.hint && <p className="text-xs text-slate-500 mt-1">{p.hint}</p>}
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={onSend}
            disabled={pending}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium shadow-sm transition-colors disabled:opacity-50"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 mb-4 flex items-start gap-2 text-sm text-rose-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className={
                result.ok
                  ? 'px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-700'
                  : 'px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-700'
              }>
                {result.status}
              </span>
              <span className="text-xs text-slate-500">{result.durationMs} ms</span>
            </div>
          </div>
          <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 overflow-auto text-xs leading-relaxed">{result.body}</pre>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-3xl p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-900">As a curl command</h2>
          <button
            onClick={copyCurl}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs text-slate-600 hover:bg-slate-100"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 overflow-auto text-xs leading-relaxed">{curlSnippet}</pre>
      </div>
    </div>
  );
}
