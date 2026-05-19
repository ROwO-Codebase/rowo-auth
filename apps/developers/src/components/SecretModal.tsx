import { useState } from 'react';
import { Copy, Check, AlertTriangle } from 'lucide-react';

interface Props {
  open: boolean;
  secret: string;
  clientId?: string;
  title?: string;
  onAcknowledge: () => void;
}

export default function SecretModal({ open, secret, clientId, title, onAcknowledge }: Props) {
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  if (!open) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl max-w-lg w-full p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="bg-amber-100 p-2 rounded-xl text-amber-700">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{title || 'Save your client secret'}</h2>
            <p className="text-sm text-slate-600 mt-1">
              This is the only time we&rsquo;ll show this value. Store it somewhere safe — if you lose it, you&rsquo;ll need to rotate the secret.
            </p>
          </div>
        </div>

        {clientId && (
          <div className="mb-3">
            <label className="block text-xs font-semibold text-slate-600 mb-1">Client ID</label>
            <code className="block px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 font-mono text-sm break-all">
              {clientId}
            </code>
          </div>
        )}

        <div className="mb-4">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Client secret</label>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 rounded-lg bg-slate-900 text-emerald-300 font-mono text-sm break-all">
              {secret}
            </code>
            <button
              onClick={copy}
              className="p-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700"
              aria-label="Copy secret"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <label className="flex items-start gap-2 text-sm text-slate-700 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-1"
          />
          I&rsquo;ve saved this secret in a safe place.
        </label>

        <button
          onClick={onAcknowledge}
          disabled={!confirmed}
          className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-medium transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}
