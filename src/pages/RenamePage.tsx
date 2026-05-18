import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, XCircle, Loader2, AlertTriangle, RefreshCw, Trash2, ArrowRight, ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';

export default function RenamePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [newWechatId, setNewWechatId] = useState('');
  
  const token = searchParams.get('token');
  const expiry = searchParams.get('expiry');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('Invalid or missing rename token. Please reverify your account.');
    } else if (expiry && new Date() > new Date(expiry)) {
      setStatus('error');
      setMessage('Rename token has expired. Please reverify your account.');
    }
  }, [token, expiry]);

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWechatId.trim() || !token) return;

    setStatus('loading');
    setMessage('Updating your WeChat ID...');

    try {
      const res = await fetch(`${__API_ENDPOINT__}/api/account/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rename_token: token,
          new_wechat_id: newWechatId,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setStatus('success');
        setMessage(data.message || 'Successfully changed your WeChat ID!');
      } else {
        setStatus('error');
        setMessage(data.message || 'Failed to change WeChat ID.');
      }
    } catch (error) {
      setStatus('error');
      setMessage('An error occurred while communicating with the server.');
    }
  };

  const handleInvalidate = async () => {
    if (!token) return;
    
    setStatus('loading');
    setMessage('Invalidating token...');

    try {
      const res = await fetch(`${__API_ENDPOINT__}/api/account/rename/invalidate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rename_token: token }),
      });
      const data = await res.json();

      if (data.success) {
        setStatus('success');
        setMessage('Token invalidated. You have kept your current WeChat ID.');
      } else {
        setStatus('error');
        setMessage(data.message || 'Failed to invalidate token.');
      }
    } catch (error) {
      setStatus('error');
      setMessage('An error occurred while communicating with the server.');
    }
  };

  return (
    <div className="max-w-md mx-auto mt-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 text-center"
      >
        {status === 'loading' ? (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
            <h2 className="text-2xl font-bold text-slate-900">Processing</h2>
            <p className="text-slate-500">{message}</p>
          </div>
        ) : status === 'success' ? (
          <div className="flex flex-col items-center gap-4">
            <CheckCircle2 className="w-16 h-16 text-emerald-500" />
            <h2 className="text-2xl font-bold text-slate-900">Operation Successful</h2>
            <p className="text-slate-600 mb-6">{message}</p>
            <button
              onClick={() => navigate('/')}
              className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-xl shadow-sm transition-colors"
            >
              Return Home
            </button>
          </div>
        ) : status === 'error' ? (
          <div className="flex flex-col items-center gap-4">
            <XCircle className="w-16 h-16 text-red-500" />
            <h2 className="text-2xl font-bold text-slate-900">Operation Failed</h2>
            <p className="text-slate-600 mb-6">{message}</p>
            <button
              onClick={() => navigate('/verify')}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl shadow-sm transition-colors"
            >
              Back to Verification
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-6">
            <div className="bg-indigo-100 p-4 rounded-2xl text-indigo-600">
              <RefreshCw className="w-10 h-10" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Change WeChat ID</h2>
              <p className="text-slate-500 mt-2">You have successfully reverified your identity. You can now choose a new WeChat ID to link to your student status.</p>
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-left">
              <div className="flex items-center gap-2 text-amber-800 font-bold mb-1">
                <AlertTriangle className="w-4 h-4" />
                Important Warning
              </div>
              <p className="text-xs text-amber-700 leading-relaxed">
                This process is <strong>not reversible</strong>. You can only change your WeChat ID <strong>once a year</strong>. All your existing data (info items, status) will be moved to the new ID.
              </p>
            </div>

            <form onSubmit={handleRename} className="w-full space-y-4">
              <div className="text-left">
                <label htmlFor="newWechatId" className="block text-sm font-medium text-slate-700 mb-1 ml-1">
                  New WeChat ID
                </label>
                <input
                  id="newWechatId"
                  type="text"
                  value={newWechatId}
                  onChange={(e) => setNewWechatId(e.target.value)}
                  placeholder="Enter your new WeChat ID"
                  required
                  className="block w-full px-4 py-3 rounded-xl border border-slate-300 shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
                />
              </div>
              <button
                type="submit"
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
              >
                Change my WeChat ID
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="w-full pt-4 border-t border-slate-100">
              <p className="text-xs text-slate-400 mb-3 leading-relaxed">
                Don't want to change your ID? Invalidate this token to keep your current ID.
                {' '}If you re-verified only to upgrade your account's hash to HMAC-SHA-256, that upgrade has already been applied — you can safely invalidate this token.
              </p>
              <button
                onClick={handleInvalidate}
                className="w-full py-2 px-4 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Invalidate Token
              </button>
            </div>
            
            {expiry && (
              <p className="text-[10px] text-slate-400">
                Token expires at: {format(new Date(expiry), 'yyyy-MM-dd HH:mm:ss')}
              </p>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
