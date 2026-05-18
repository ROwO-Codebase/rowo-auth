import React, { useState, useEffect } from 'react';
import { Search, CheckCircle2, XCircle, Clock, Shield, AlertTriangle, Info, ShieldAlert, Pencil, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { clsx } from 'clsx';
import ReactMarkdown from 'react-markdown';
import { Link, useSearchParams } from 'react-router-dom';

interface AccountInfo {
  id: number;
  wechat_id: string;
  color: string;
  icon: string;
  title: string;
  body: string;
}

interface AccountData {
  wechat_id: string;
  verified_status: number;
  verification_method: string;
  verification_time: string;
  student_name?: string;
  faculty?: string;
  manual_status?: string;
  manual_reason?: string;
  manual_admin?: string;
  manual_time?: string;
  reverified_at?: string;
  hash_version?: 'sha256' | 'hmac-sha256' | null;
}

export default function LandingPage() {
  const [searchParams] = useSearchParams();
  const initialWechatId = searchParams.get('wechat_id') || '';

  const [wechatId, setWechatId] = useState(initialWechatId);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ 
    success: boolean; 
    account?: AccountData; 
    info?: AccountInfo[]; 
    message?: string;
    blacklisted?: boolean;
    blacklist?: {
      wechat_id: string;
      reason: string;
      added_by: string;
      added_at: string;
    } | null;
  } | null>(null);

  const performSearch = async (idToSearch: string) => {
    if (!idToSearch.trim()) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch(`${__API_ENDPOINT__}/api/verify/${encodeURIComponent(idToSearch)}`);
      const data = await res.json();
      setResult(data);
    } catch (error) {
      setResult({ success: false, message: 'An error occurred while querying the database.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (initialWechatId) {
      performSearch(initialWechatId);
    }
  }, [initialWechatId]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    performSearch(wechatId);
  };

  return (
    <div className="max-w-2xl mx-auto flex flex-col items-center justify-center min-h-[60vh]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-10 w-full"
      >
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 mb-4">
          Verify Student Status
        </h1>
        <p className="text-lg text-slate-600 max-w-xl mx-auto">
          Enter a WeChat ID to quickly check if the account belongs to a verified student.
        </p>
      </motion.div>

      <motion.form
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.1 }}
        onSubmit={handleSearch}
        className="w-full relative shadow-sm rounded-2xl bg-white border border-slate-200 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all"
      >
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-slate-400" />
        </div>
        <input
          type="text"
          value={wechatId}
          onChange={(e) => setWechatId(e.target.value)}
          className="block w-full pl-11 pr-32 py-4 text-lg bg-transparent border-none rounded-2xl focus:ring-0 text-slate-900 placeholder-slate-400"
          placeholder="Enter WeChat ID..."
        />
        <div className="absolute inset-y-2 right-2 flex items-center">
          <button
            type="submit"
            disabled={loading || !wechatId.trim()}
            className="inline-flex items-center px-6 py-2 border border-transparent text-sm font-medium rounded-xl shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </motion.form>

      <div className="w-full mt-8">
        <AnimatePresence mode="wait">
          {result && (
            <motion.div
              key={result.success || result.blacklisted ? 'success' : 'error'}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="w-full"
            >
              {result.blacklisted ? (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-6 sm:p-8">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <div className="p-3 rounded-2xl bg-slate-900 text-white">
                          <ShieldAlert className="w-8 h-8" />
                        </div>
                        <div>
                          <h2 className="text-2xl font-bold text-slate-900">Account Blacklisted</h2>
                          <p className="text-slate-500 font-mono mt-1">{result.blacklist.wechat_id}</p>
                        </div>
                      </div>
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-slate-900 text-white">
                        Blacklisted
                      </span>
                    </div>

                    {result.blacklist && (
                      <div className="mt-6 bg-slate-900 border-l-4 border-red-500 p-4 rounded-r-lg flex items-start gap-3 text-white">
                        <ShieldAlert className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                        <div>
                          <h3 className="text-sm font-bold">Restriction Details</h3>
                          <p className="text-sm opacity-90 mt-1">
                            Reason: {result.blacklist.reason}
                          </p>
                          <p className="text-xs opacity-70 mt-2">
                            This account has been blacklisted and is prohibited from using verification services.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : result.success && result.account ? (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-6 sm:p-8">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <div className={clsx(
                          "p-3 rounded-2xl",
                          result.account.verified_status === 1
                            ? "bg-emerald-100 text-emerald-600"
                            : (result.account.verified_status === 2
                              ? "bg-red-100 text-red-600"
                              : "bg-gray-100 text-gray-600"
                            )
                        )}>
                          {result.account.verified_status === 1 ? (
                            <CheckCircle2 className="w-8 h-8" />
                          ) : (result.account.verified_status === 2
                            ? (
                              <AlertTriangle className="w-8 h-8" />
                            )
                            : (
                              <Clock className="w-8 h-8" />
                            )
                          )}
                        </div>
                        <div>
                          <h2 className="text-2xl font-bold text-slate-900">
                            {result.account.verified_status === 1 ? "Verified Student" : (result.account.verified_status === 2 ? "Verification Revoked" : "Pending Verification")}
                          </h2>
                          <p className="text-slate-500 font-mono mt-1">{result.account.wechat_id}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {result.account.verified_status === 2 && (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800">
                            Revoked
                          </span>
                        )}
                        {result.account.hash_version === 'hmac-sha256' && (
                          <span
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800"
                            title="Your account data is hashed with HMAC-SHA-256."
                          >
                            <Shield className="w-3.5 h-3.5" />
                            HMAC-SHA-256
                          </span>
                        )}
                        {result.account.hash_version === 'sha256' && (
                          <span
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800"
                            title="Re-verify your account to upgrade to HMAC-SHA-256."
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                            SHA-256
                          </span>
                        )}
                      </div>
                    </div>

                    {result.account.verified_status === 0 && result.account.manual_status === 'rejected' ? (
                      <div className="mt-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg flex items-start gap-3">
                        <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                        <div>
                          <h3 className="text-sm font-bold text-red-800">Verification Application Rejected</h3>
                          <p className="text-sm text-red-700 mt-1">
                            Reason: {result.account.manual_reason || 'No reason provided.'}
                          </p>
                          <p className="text-sm text-red-700 mt-1">
                            You can submit another application or verify through other methods.
                          </p>
                        </div>
                      </div>
                    ) : result.account.verified_status === 2 && (
                      <div className="mt-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg flex items-start gap-3">
                        <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                        <div>
                          <h3 className="text-sm font-bold text-red-800">Status Revoked</h3>
                          <p className="text-sm text-red-700 mt-1">
                            This account's verified student status has been revoked by an administrator. Please exercise caution.
                          </p>
                        </div>
                      </div>
                    )}

                    <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="flex items-center gap-3 text-slate-700">
                        <Shield className="w-5 h-5 text-slate-400" />
                        <div>
                          <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider">Method</p>
                          <p className="font-medium">{result.account.verification_method}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-slate-700">
                        <Clock className="w-5 h-5 text-slate-400" />
                        <div>
                          <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider">Time</p>
                          <p className="font-medium">
                            {format(new Date(result.account.verification_time.endsWith('Z') ? result.account.verification_time : result.account.verification_time + 'Z'), 'PPp')}
                          </p>
                        </div>
                      </div>
                      {result.account.reverified_at && (
                        <div className="flex items-center gap-3 text-slate-700">
                          <RefreshCw className="w-5 h-5 text-slate-400" />
                          <div>
                            <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider">Re-verified</p>
                            <p className="font-medium">
                              {format(new Date(result.account.reverified_at.endsWith('Z') ? result.account.reverified_at : result.account.reverified_at + 'Z'), 'PPp')}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>

                    {result.account.hash_version === 'sha256' && (
                      <div className="mt-6 bg-orange-50 border-l-4 border-orange-500 p-4 rounded-r-lg flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-bold text-orange-800">Legacy encryption (SHA-256)</h3>
                          <p className="text-sm text-orange-700 mt-1">
                            Your account data is hashed with the legacy SHA-256 algorithm.{' '}
                            <Link
                              to={`/verify?wechat_id=${encodeURIComponent(result.account.wechat_id)}`}
                              className="font-semibold underline hover:text-orange-900"
                            >
                              Re-verify your account
                            </Link>{' '}
                            to upgrade to HMAC-SHA-256 for stronger security.
                          </p>
                        </div>
                      </div>
                    )}

                    {result.info && result.info.length > 0 && (
                      <div className="mt-8 space-y-4">
                        <h3 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Additional Information</h3>
                        {result.info.map(info => {
                          const IconComp = {
                            warning: AlertTriangle,
                            error: XCircle,
                            checkmark: CheckCircle2,
                            pencil: Pencil,
                            refresh: RefreshCw,
                            info: Info
                          }[info.icon as any] || Info;
                          const colorClasses = {
                            blue: 'bg-blue-50 border-blue-200 text-blue-800',
                            orange: 'bg-orange-50 border-orange-200 text-orange-800',
                            yellow: 'bg-yellow-50 border-yellow-200 text-yellow-800',
                            red: 'bg-red-50 border-red-200 text-red-800',
                            purple: 'bg-purple-50 border-purple-200 text-purple-800',
                            emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800',
                            slate: 'bg-slate-50 border-slate-200 text-slate-800',
                          }[info.color] || 'bg-slate-50 border-slate-200 text-slate-800';
                          
                          const iconColor = {
                            blue: 'text-blue-600',
                            orange: 'text-orange-600',
                            yellow: 'text-yellow-600',
                            red: 'text-red-600',
                            purple: 'text-purple-600',
                            emerald: 'text-emerald-600',
                            slate: 'text-slate-600',
                          }[info.color] || 'text-slate-600';

                          return (
                            <div key={info.id} className={`border-l-4 p-4 rounded-r-lg flex items-start gap-3 ${colorClasses}`}>
                              <IconComp className={`w-5 h-5 shrink-0 mt-0.5 ${iconColor}`} />
                              <div className="flex-1 min-w-0">
                                <h4 className="text-sm font-bold mb-1">{info.title}</h4>
                                <div className="text-sm opacity-90 prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2">
                                  <ReactMarkdown>{info.body}</ReactMarkdown>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-red-50 border border-red-100 rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
                  <div className="flex items-center gap-4">
                    <div className="bg-red-100 p-3 rounded-2xl text-red-600 shrink-0">
                      <XCircle className="w-8 h-8" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-red-900">Not Verified</h2>
                      <p className="text-red-700 mt-1">{result.message}</p>
                      <p className="text-gray-700 mt-1">If this is your account, you can verify it now.</p>
                    </div>
                  </div>
                  <Link
                    to={`/verify?wechat_id=${encodeURIComponent(wechatId)}`}
                    className="mt-4 sm:mt-0 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-xl shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors shrink-0"
                  >
                    Verify Now
                  </Link>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
