import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Key, ExternalLink, Loader2, AlertTriangle, CheckCircle2, XCircle, LogIn } from 'lucide-react';
import { useSession } from '../contexts/SessionContext';
import { startSsoLogin } from '../lib/mainSiteUrl';
import { developerApi, type OauthClient } from '../lib/devApi';

export default function ClientsListPage() {
  const { user, loading: sessionLoading } = useSession();
  const [clients, setClients] = useState<OauthClient[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (sessionLoading) return;
    if (!user) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      const res = await developerApi.list();
      if (!res.success) {
        setError(res.message || 'Failed to load clients.');
        setClients([]);
      } else {
        setClients(res.clients || []);
        setError(null);
      }
      setLoading(false);
    })();
  }, [user, sessionLoading]);

  if (sessionLoading || loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-500">
        <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Loading&hellip;
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto mt-12 bg-white border border-slate-200 rounded-3xl p-8 text-center">
        <h1 className="text-xl font-semibold text-slate-900 mb-2">Sign in required</h1>
        <p className="text-sm text-slate-600 mb-5">Sign in with your ROwO account to manage OAuth clients.</p>
        <button
          onClick={() => startSsoLogin('/clients')}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-sm transition-colors"
        >
          <LogIn className="w-4 h-4" /> Sign in with ROwO
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">OAuth clients</h1>
          <p className="text-sm text-slate-500 mt-1">Apps that can use &ldquo;Sign in with ROwO&rdquo; against this account.</p>
        </div>
        <Link
          to="/clients/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" /> New client
        </Link>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 mb-4 flex items-start gap-2 text-sm text-rose-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {clients && clients.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-300 rounded-3xl p-12 text-center">
          <Key className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <div className="text-slate-700 font-medium mb-1">No clients yet</div>
          <div className="text-sm text-slate-500 mb-5">Create one to start integrating ROwO sign-in.</div>
          <Link
            to="/clients/new"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" /> New client
          </Link>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3">App</th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">Client ID</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">Domain</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-right px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {(clients || []).map((c) => (
                <tr key={c.client_id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {c.icon_url ? (
                        <img src={c.icon_url} alt="" className="w-8 h-8 rounded-lg" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
                          <Key className="w-4 h-4" />
                        </div>
                      )}
                      <div className="font-medium text-slate-900">{c.display_name}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell font-mono text-xs text-slate-500">{c.client_id}</td>
                  <td className="px-4 py-3 hidden md:table-cell text-slate-600">{c.allowed_domain}</td>
                  <td className="px-4 py-3">
                    {c.is_active ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                        <CheckCircle2 className="w-3 h-3" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                        <XCircle className="w-3 h-3" /> Disabled
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/clients/${encodeURIComponent(c.client_id)}`}
                      className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700 text-sm font-medium"
                    >
                      Manage <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
