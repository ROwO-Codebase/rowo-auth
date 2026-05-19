import { useState } from 'react';
import { X } from 'lucide-react';
import { clsx } from 'clsx';
import type { OauthClientInput } from '../lib/devApi';

const ALL_SCOPES = [
  { id: 'basic', label: 'basic', detail: 'User ID + display name. Always granted.', required: true },
  { id: 'verification', label: 'verification', detail: 'Whether the user has a verified WeChat ID (boolean + method/time).' },
  { id: 'wechat', label: 'wechat', detail: 'The actual WeChat ID. Sensitive — only request if your app truly needs it.' },
];

export interface ClientFormValue {
  display_name: string;
  icon_url: string;
  allowed_domain: string;
  allowed_redirect_uris: string[];
  allowed_scopes: string[];
}

export function emptyClientForm(): ClientFormValue {
  return {
    display_name: '',
    icon_url: '',
    allowed_domain: '',
    allowed_redirect_uris: [''],
    allowed_scopes: ['basic'],
  };
}

export function toClientInput(v: ClientFormValue): OauthClientInput {
  return {
    display_name: v.display_name.trim(),
    icon_url: v.icon_url.trim() ? v.icon_url.trim() : null,
    allowed_domain: v.allowed_domain.trim(),
    allowed_redirect_uris: v.allowed_redirect_uris.map((u) => u.trim()).filter(Boolean),
    allowed_scopes: v.allowed_scopes,
  };
}

interface Props {
  value: ClientFormValue;
  onChange: (v: ClientFormValue) => void;
  disabled?: boolean;
}

export default function ClientForm({ value, onChange, disabled }: Props) {
  const [newRedirect, setNewRedirect] = useState('');

  const setField = <K extends keyof ClientFormValue>(key: K, val: ClientFormValue[K]) =>
    onChange({ ...value, [key]: val });

  const toggleScope = (scopeId: string) => {
    if (scopeId === 'basic') return;
    const has = value.allowed_scopes.includes(scopeId);
    setField('allowed_scopes', has
      ? value.allowed_scopes.filter((s) => s !== scopeId)
      : [...value.allowed_scopes, scopeId]
    );
  };

  const updateRedirect = (idx: number, val: string) => {
    const next = value.allowed_redirect_uris.slice();
    next[idx] = val;
    setField('allowed_redirect_uris', next);
  };

  const removeRedirect = (idx: number) => {
    const next = value.allowed_redirect_uris.slice();
    next.splice(idx, 1);
    setField('allowed_redirect_uris', next.length === 0 ? [''] : next);
  };

  const addRedirect = () => {
    const trimmed = newRedirect.trim();
    if (!trimmed) return;
    setField('allowed_redirect_uris', [...value.allowed_redirect_uris.filter(Boolean), trimmed]);
    setNewRedirect('');
  };

  return (
    <div className="space-y-5">
      <Field label="Display name" hint="Shown to users on the consent screen.">
        <input
          type="text"
          maxLength={200}
          value={value.display_name}
          disabled={disabled}
          onChange={(e) => setField('display_name', e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="My cool app"
        />
      </Field>

      <Field label="Icon URL" hint="Optional. Must be https://. Shown next to your app name on the consent screen.">
        <input
          type="url"
          value={value.icon_url}
          disabled={disabled}
          onChange={(e) => setField('icon_url', e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="https://example.com/icon.png"
        />
      </Field>

      <Field label="Allowed domain" hint="Bare hostname. Every redirect URI must be on this domain or a subdomain.">
        <input
          type="text"
          value={value.allowed_domain}
          disabled={disabled}
          onChange={(e) => setField('allowed_domain', e.target.value.toLowerCase())}
          className="w-full px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
          placeholder="example.com"
        />
      </Field>

      <Field label="Allowed redirect URIs" hint="https:// URLs only (http://localhost is exempt for development).">
        <div className="space-y-2">
          {value.allowed_redirect_uris.map((uri, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                type="url"
                value={uri}
                disabled={disabled}
                onChange={(e) => updateRedirect(idx, e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
                placeholder="https://example.com/oauth/callback"
              />
              <button
                type="button"
                onClick={() => removeRedirect(idx)}
                disabled={disabled || value.allowed_redirect_uris.length === 1}
                className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Remove redirect URI"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="url"
              value={newRedirect}
              disabled={disabled}
              onChange={(e) => setNewRedirect(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addRedirect(); } }}
              className="flex-1 px-3 py-2 rounded-lg border border-dashed border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
              placeholder="Add another redirect URI"
            />
            <button
              type="button"
              onClick={addRedirect}
              disabled={disabled || !newRedirect.trim()}
              className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-sm font-medium text-slate-700 disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      </Field>

      <Field label="Allowed scopes" hint="What this app may request during the OAuth flow. Users can still deny non-required scopes.">
        <div className="space-y-2">
          {ALL_SCOPES.map((scope) => {
            const checked = value.allowed_scopes.includes(scope.id);
            return (
              <label
                key={scope.id}
                className={clsx(
                  'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors',
                  checked ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50',
                  scope.required && 'cursor-not-allowed'
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled || scope.required}
                  onChange={() => toggleScope(scope.id)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <div className="font-mono text-sm font-medium text-slate-900">
                    {scope.label} {scope.required && <span className="text-xs text-slate-500 font-sans font-normal">(required)</span>}
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5">{scope.detail}</div>
                </div>
              </label>
            );
          })}
        </div>
      </Field>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-slate-900 mb-1">{label}</label>
      {hint && <p className="text-xs text-slate-500 mb-2">{hint}</p>}
      {children}
    </div>
  );
}
