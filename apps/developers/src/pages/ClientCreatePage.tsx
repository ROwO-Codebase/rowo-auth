import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertTriangle, Loader2 } from 'lucide-react';
import ClientForm, { emptyClientForm, toClientInput, type ClientFormValue } from '../components/ClientForm';
import SecretModal from '../components/SecretModal';
import { developerApi } from '../lib/devApi';

export default function ClientCreatePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<ClientFormValue>(emptyClientForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdSecret, setCreatedSecret] = useState<string | null>(null);
  const [createdClientId, setCreatedClientId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const res = await developerApi.create(toClientInput(form));
    setSubmitting(false);
    if (!res.success || !res.client_secret || !res.client) {
      setError(res.message || 'Failed to create client.');
      return;
    }
    setCreatedSecret(res.client_secret);
    setCreatedClientId(res.client.client_id);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Link to="/clients" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft className="w-4 h-4" /> All clients
      </Link>
      <h1 className="text-2xl font-bold text-slate-900 mb-1">New OAuth client</h1>
      <p className="text-sm text-slate-500 mb-6">Register an app that can use &ldquo;Sign in with ROwO&rdquo;.</p>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 mb-4 flex items-start gap-2 text-sm text-rose-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-3xl p-6">
        <ClientForm value={form} onChange={setForm} disabled={submitting} />

        <div className="mt-6 flex items-center justify-end gap-2">
          <Link
            to="/clients"
            className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-sm font-medium"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium shadow-sm transition-colors disabled:opacity-50"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Create client
          </button>
        </div>
      </form>

      <SecretModal
        open={createdSecret !== null}
        secret={createdSecret || ''}
        clientId={createdClientId || undefined}
        title="Client created"
        onAcknowledge={() => {
          if (createdClientId) navigate(`/clients/${encodeURIComponent(createdClientId)}`);
          else navigate('/clients');
        }}
      />
    </div>
  );
}
