import { useState } from 'react';
import { KeyRound, Loader2, AlertTriangle, Copy, Check, Info } from 'lucide-react';

interface TokenResult {
  status: number;
  ok: boolean;
  body: string;
}

export default function TokenHelperPage() {
  const [token, setToken] = useState('');
  const [result, setResult] = useState<TokenResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tryFetch = async () => {
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`${__API_ENDPOINT__}/api/user/me`, {
        headers: { Authorization: `Bearer ${token.trim()}` },
      });
      const text = await res.text();
      let pretty = text;
      try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch { /* keep raw */ }
      setResult({ status: res.status, ok: res.ok, body: pretty });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Request failed: ${msg}`);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <KeyRound className="w-5 h-5 text-indigo-600" />
        <h1 className="text-2xl font-bold text-slate-900">Token helper</h1>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        Paste a ROwO session token to check what it gives you. This is the same JWT you&rsquo;d send as <code className="font-mono text-xs bg-slate-100 px-1 py-0.5 rounded">Authorization: Bearer &lt;token&gt;</code>.
      </p>

      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 mb-4 flex items-start gap-3">
        <Info className="w-4 h-4 mt-0.5 text-indigo-700 flex-shrink-0" />
        <div className="text-sm text-indigo-900">
          This helper is for ROwO&rsquo;s own session JWTs (the ones the ROwO frontends store after a user signs in) — it calls <code className="font-mono text-xs">/api/user/me</code>. For OAuth <code className="font-mono text-xs">access_token</code>s (<code className="font-mono text-xs">rao_…</code>) returned by <code className="font-mono text-xs">/api/oauth/token</code>, use <a href="/playground" className="underline">Playground &rarr; GET /api/oauth/userinfo</a> instead.
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-3xl p-6 mb-4">
        <label className="block text-sm font-semibold text-slate-900 mb-2">Bearer token</label>
        <textarea
          value={token}
          onChange={(e) => setToken(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs"
          placeholder="eyJhbGciOi…"
        />
        <div className="mt-3 flex justify-end">
          <button
            onClick={tryFetch}
            disabled={pending || !token.trim()}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium shadow-sm transition-colors disabled:opacity-50"
          >
            {pending && <Loader2 className="w-4 h-4 animate-spin" />}
            Call /api/user/me
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
          <div className="flex items-center gap-3 mb-3">
            <span className={
              result.ok
                ? 'px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-700'
                : 'px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-700'
            }>
              {result.status}
            </span>
            <span className="text-sm text-slate-600">/api/user/me response</span>
          </div>
          <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 overflow-auto text-xs leading-relaxed">{result.body}</pre>

          {result.ok && (
            <div className="mt-5">
              <h3 className="font-semibold text-slate-900 mb-2">Use it as curl</h3>
              <CurlBlock
                snippet={[
                  `curl '${__API_ENDPOINT__}/api/user/me' \\`,
                  `  -H 'Authorization: Bearer ${token.trim() ? token.trim().slice(0, 12) + '…' : '<TOKEN>'}'`,
                ].join('\n')}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CurlBlock({ snippet }: { snippet: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };
  return (
    <div className="relative">
      <button
        onClick={copy}
        className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-300 hover:bg-slate-700"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 overflow-auto text-xs leading-relaxed">{snippet}</pre>
    </div>
  );
}
