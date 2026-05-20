import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, Loader2, RefreshCw, Trash2, CheckCircle2, Save } from 'lucide-react';
import ClientForm, { toClientInput, type ClientFormValue } from '../components/ClientForm';
import SecretModal from '../components/SecretModal';
import { developerApi, type OauthClient } from '../lib/devApi';

function clientToForm(c: OauthClient): ClientFormValue {
  return {
    display_name: c.display_name,
    icon_url: c.icon_url || '',
    allowed_domain: c.allowed_domain,
    allowed_redirect_uris: c.allowed_redirect_uris.length > 0 ? c.allowed_redirect_uris : [''],
    allowed_scopes: c.allowed_scopes,
  };
}

export default function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const [client, setClient] = useState<OauthClient | null>(null);
  const [form, setForm] = useState<ClientFormValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [rotatedSecret, setRotatedSecret] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<'delete' | 'rotate' | null>(null);

  useEffect(() => {
    if (!clientId) return;
    (async () => {
      setLoading(true);
      const res = await developerApi.get(clientId);
      if (!res.success || !res.client) {
        setError(res.message || 'Client not found.');
        setClient(null);
      } else {
        setClient(res.client);
        setForm(clientToForm(res.client));
      }
      setLoading(false);
    })();
  }, [clientId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || !clientId) return;
    setSavingState('saving');
    setError(null);
    const res = await developerApi.update(clientId, { ...toClientInput(form), is_active: client?.is_active });
    if (!res.success || !res.client) {
      setError(res.message || 'Failed to save changes.');
      setSavingState('idle');
      return;
    }
    setClient(res.client);
    setForm(clientToForm(res.client));
    setSavingState('saved');
    setTimeout(() => setSavingState('idle'), 1500);
  };

  const handleToggleActive = async () => {
    if (!client || !clientId) return;
    setError(null);
    const res = await developerApi.update(clientId, { is_active: !client.is_active });
    if (!res.success || !res.client) {
      setError(res.message || 'Failed to update status.');
      return;
    }
    setClient(res.client);
  };

  const handleRotate = async () => {
    if (!clientId) return;
    setActionPending('rotate');
    setError(null);
    const res = await developerApi.rotateSecret(clientId);
    setActionPending(null);
    setConfirmRotate(false);
    if (!res.success || !res.client_secret) {
      setError(res.message || 'Failed to rotate secret.');
      return;
    }
    setRotatedSecret(res.client_secret);
  };

  const handleDelete = async () => {
    if (!clientId) return;
    setActionPending('delete');
    setError(null);
    const res = await developerApi.remove(clientId);
    setActionPending(null);
    if (!res.success) {
      setError(res.message || 'Failed to delete client.');
      setConfirmDelete(false);
      return;
    }
    navigate('/clients', { replace: true });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Loading&hellip;
      </div>
    );
  }

  if (!client || !form) {
    return (
      <div className="max-w-md mx-auto mt-12 bg-white border border-rose-200 rounded-3xl p-8 text-center">
        <AlertTriangle className="w-8 h-8 text-rose-500 mx-auto mb-3" />
        <div className="font-semibold text-slate-900 mb-1">Client not found</div>
        <div className="text-sm text-slate-500 mb-4">{error || 'You may not own this client.'}</div>
        <Link to="/clients" className="text-indigo-600 hover:text-indigo-700 text-sm font-medium">Back to clients</Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <Link to="/clients" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> All clients
      </Link>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold text-slate-900">{client.display_name}</h1>
        <button
          onClick={handleToggleActive}
          className={
            client.is_active
              ? 'px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100'
              : 'px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200'
          }
        >
          {client.is_active ? 'Active — disable' : 'Disabled — enable'}
        </button>
      </div>
      <p className="text-sm text-slate-500 font-mono mb-6 break-all">{client.client_id}</p>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 mb-4 flex items-start gap-2 text-sm text-rose-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-3xl p-6 mb-6">
        <ClientForm value={form} onChange={setForm} disabled={savingState === 'saving'} />
        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="submit"
            disabled={savingState === 'saving'}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium shadow-sm transition-colors disabled:opacity-50"
          >
            {savingState === 'saving' ? <Loader2 className="w-4 h-4 animate-spin" /> :
              savingState === 'saved' ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {savingState === 'saved' ? 'Saved' : 'Save changes'}
          </button>
        </div>
      </form>

      <div className="bg-white border border-slate-200 rounded-3xl p-6 mb-6">
        <h2 className="font-semibold text-slate-900 mb-1">Client secret</h2>
        <p className="text-sm text-slate-500 mb-4">
          We only store a one-way hash of the secret. Rotate if the current secret is exposed — the old one will stop working immediately.
        </p>
        <button
          onClick={() => setConfirmRotate(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-50 text-amber-700 hover:bg-amber-100 text-sm font-medium"
        >
          <RefreshCw className="w-4 h-4" /> Rotate secret
        </button>
      </div>

      <div className="bg-white border border-rose-200 rounded-3xl p-6">
        <h2 className="font-semibold text-rose-900 mb-1">Delete client</h2>
        <p className="text-sm text-rose-700/80 mb-4">
          Permanently removes the client and wipes every grant, access token, refresh token, and outstanding authorization code tied to it. Users who signed in via this app keep their ROwO account.
        </p>
        <button
          onClick={() => setConfirmDelete(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-medium"
        >
          <Trash2 className="w-4 h-4" /> Delete client
        </button>
      </div>

      <SecretModal
        open={rotatedSecret !== null}
        secret={rotatedSecret || ''}
        clientId={client.client_id}
        title="New client secret"
        onAcknowledge={() => setRotatedSecret(null)}
      />

      <ConfirmDialog
        open={confirmRotate}
        title="Rotate client secret?"
        body="The current secret will stop working immediately. Make sure you can deploy the new secret right away."
        confirmLabel="Rotate"
        confirmTone="amber"
        pending={actionPending === 'rotate'}
        onCancel={() => setConfirmRotate(false)}
        onConfirm={handleRotate}
      />

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${client.display_name}?`}
        body="This cannot be undone. Apps using this client_id will stop being able to sign users in."
        confirmLabel="Delete client"
        confirmTone="rose"
        pending={actionPending === 'delete'}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function ConfirmDialog({
  open, title, body, confirmLabel, confirmTone, pending, onCancel, onConfirm,
}: {
  open: boolean; title: string; body: string; confirmLabel: string;
  confirmTone: 'rose' | 'amber';
  pending: boolean;
  onCancel: () => void; onConfirm: () => void;
}) {
  if (!open) return null;
  const btnCls = confirmTone === 'rose'
    ? 'bg-rose-600 hover:bg-rose-700'
    : 'bg-amber-600 hover:bg-amber-700';
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-xl max-w-sm w-full p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-1">{title}</h3>
        <p className="text-sm text-slate-600 mb-5">{body}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={pending}
            className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-sm font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={pending}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-medium disabled:opacity-50 ${btnCls}`}
          >
            {pending && <Loader2 className="w-4 h-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
