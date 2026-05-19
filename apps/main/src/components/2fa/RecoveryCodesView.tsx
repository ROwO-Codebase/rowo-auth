import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, Download, Eye, EyeOff } from 'lucide-react';

interface Props {
  codes: string[];
  onAcknowledge?: () => void;
  acknowledgeLabel?: string;
}

export function RecoveryCodesView({ codes, onAcknowledge, acknowledgeLabel = "I've saved my codes" }: Props) {
  const [revealed, setRevealed] = useState(true);
  const [confirmed, setConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const download = () => {
    const blob = new Blob([codes.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rowo-recovery-codes-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-sm text-amber-800 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <span>
          Save these codes somewhere safe. Each can be used once if you lose your
          authenticator and passkeys. You can't view them again after closing.
        </span>
      </div>

      <div className="relative bg-slate-50 border border-slate-200 rounded-xl p-4">
        <div className={`grid grid-cols-2 gap-2 font-mono text-sm ${revealed ? '' : 'blur-sm select-none'}`}>
          {codes.map((c, i) => (
            <div key={i} className="text-slate-800">{c}</div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          className="absolute top-2 right-2 p-1.5 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-white transition-colors"
          aria-label={revealed ? 'Hide codes' : 'Show codes'}
        >
          {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={copy}
          className="flex-1 py-2 px-3 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
        >
          {copied ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
          {copied ? 'Copied' : 'Copy all'}
        </button>
        <button
          type="button"
          onClick={download}
          className="flex-1 py-2 px-3 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
        >
          <Download className="w-4 h-4" />
          Download .txt
        </button>
      </div>

      {onAcknowledge && (
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-1"
          />
          <span>{acknowledgeLabel}</span>
        </label>
      )}

      {onAcknowledge && (
        <button
          type="button"
          onClick={onAcknowledge}
          disabled={!confirmed}
          className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-xl shadow-sm transition-colors"
        >
          Done
        </button>
      )}
    </div>
  );
}

export default RecoveryCodesView;
