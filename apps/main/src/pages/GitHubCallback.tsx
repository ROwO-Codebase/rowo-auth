import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { CheckCircle2, XCircle, Loader2, Github } from 'lucide-react';
import PostVerifyPrompt from '../components/PostVerifyPrompt';

const consumedGithubCodes = new Set<string>();

export default function GitHubCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'verifying' | 'input_wechat' | 'connecting' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('Verifying your GitHub identity...');
  const [githubData, setGithubData] = useState<{ github_id: string; login: string; avatar?: string; matched_email_domain?: string } | null>(null);
  const [wechatId, setWechatId] = useState('');
  const [postVerify, setPostVerify] = useState<{ bindToken: string; wechatId: string; method: string; reverified: boolean; alreadyLinkedToRowo: boolean } | null>(null);

  const code = searchParams.get('code');

  useEffect(() => {
    if (!code) {
      setStatus('error');
      setMessage('No authorization code found. Please try again.');
      return;
    }

    if (consumedGithubCodes.has(code)) {
      return;
    }
    consumedGithubCodes.add(code);

    const runConnect = async (wechat: string, githubId: string) => {
      setStatus('connecting');
      setMessage('Connecting your accounts...');
      try {
        const res = await fetch(`${__API_ENDPOINT__}/api/verify/github/connect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wechat_id: wechat, github_id: githubId }),
        });
        const data = await res.json();
        if (data.success) {
          setStatus('success');
          setMessage('Successfully verified! Your WeChat account is now linked to your student status.');
          if (data.bind_token && data.wechat_id) {
            setPostVerify({
              bindToken: data.bind_token,
              wechatId: data.wechat_id,
              method: 'GitHub',
              reverified: Boolean(data.reverified),
              alreadyLinkedToRowo: Boolean(data.already_linked_to_rowo),
            });
          }
        } else {
          setStatus('error');
          if (data.blacklisted && data.blacklist) {
            setMessage(`Verification blocked: This account is blacklisted. Reason: ${data.blacklist.reason}`);
          } else {
            setMessage(data.message || 'Failed to connect accounts.');
          }
        }
      } catch {
        setStatus('error');
        setMessage('An error occurred while connecting your accounts.');
      }
    };

    const verifyGithub = async () => {
      try {
        const res = await fetch(`${__API_ENDPOINT__}/api/verify/github/callback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        const data = await res.json();

        if (data.success) {
          setGithubData({
            github_id: data.github_id,
            login: data.github_login,
            avatar: data.avatar,
            matched_email_domain: data.matched_email_domain,
          });
          if (data.existing_wechat_id) {
            // Skip the re-verify confirmation screen and head straight to
            // sign in / sign up via PostVerifyPrompt.
            setWechatId(data.existing_wechat_id);
            await runConnect(data.existing_wechat_id, data.github_id);
            return;
          }
          setStatus('input_wechat');
          setMessage('GitHub verified! Now enter your WeChat ID to complete the link.');
        } else {
          setStatus('error');
          if (data.blacklisted && data.blacklist) {
            setMessage(`Verification blocked: This account is blacklisted. Reason: ${data.blacklist.reason}`);
          } else {
            setMessage(data.message || 'Failed to verify GitHub identity.');
          }
        }
      } catch {
        setStatus('error');
        setMessage('An error occurred while communicating with the server.');
      }
    };

    verifyGithub();
  }, [code]);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wechatId.trim() || !githubData) return;

    setStatus('connecting');
    setMessage('Connecting your accounts...');

    try {
      const res = await fetch(`${__API_ENDPOINT__}/api/verify/github/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wechat_id: wechatId,
          github_id: githubData.github_id,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setStatus('success');
        setMessage('Successfully verified! Your WeChat account is now linked to your student status.');
        if (data.bind_token && data.wechat_id) {
          setPostVerify({
            bindToken: data.bind_token,
            wechatId: data.wechat_id,
            method: 'GitHub',
            reverified: Boolean(data.reverified),
            alreadyLinkedToRowo: Boolean(data.already_linked_to_rowo),
          });
        }
      } else {
        setStatus('error');
        if (data.blacklisted && data.blacklist) {
          setMessage(`Verification blocked: This account is blacklisted. Reason: ${data.blacklist.reason}`);
        } else {
          setMessage(data.message || 'Failed to connect accounts.');
        }
      }
    } catch (error) {
      setStatus('error');
      setMessage('An error occurred while connecting your accounts.');
    }
  };

  if (postVerify) {
    return (
      <div className="max-w-md mx-auto mt-12">
        <PostVerifyPrompt
          bindToken={postVerify.bindToken}
          wechatId={postVerify.wechatId}
          method={postVerify.method}
          reverified={postVerify.reverified}
          alreadyLinkedToRowo={postVerify.alreadyLinkedToRowo}
        />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto mt-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl border border-slate-200 shadow-sm p-8 text-center"
      >
        {status === 'verifying' || status === 'connecting' ? (
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-12 h-12 text-slate-900 animate-spin" />
            <h2 className="text-2xl font-bold text-slate-900">{status === 'verifying' ? 'Verifying GitHub' : 'Connecting Accounts'}</h2>
            <p className="text-slate-500">{message}</p>
          </div>
        ) : status === 'input_wechat' ? (
          <div className="flex flex-col items-center gap-6">
            {githubData?.avatar ? (
              <div className="relative">
                <img
                  src={githubData.avatar}
                  alt={githubData.login}
                  className="w-20 h-20 rounded-full shadow-md border-2 border-slate-200"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute -bottom-1 -right-1 bg-slate-900 text-white p-1.5 rounded-full border-2 border-white">
                  <Github className="w-3 h-3" />
                </div>
              </div>
            ) : (
              <div className="bg-slate-100 p-4 rounded-2xl text-slate-800">
                <Github className="w-10 h-10" />
              </div>
            )}
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Link WeChat ID</h2>
              <p className="text-slate-500 mt-2">Logged in as <span className="font-semibold text-slate-900">{githubData?.login}</span></p>
              {githubData?.matched_email_domain && (
                <p className="text-xs text-slate-400 mt-1">Verified email domain: {githubData.matched_email_domain}</p>
              )}
            </div>
            <form onSubmit={handleConnect} className="w-full space-y-4">
              <input
                type="text"
                value={wechatId}
                onChange={(e) => setWechatId(e.target.value)}
                placeholder="Enter your WeChat ID"
                required
                className="block w-full px-4 py-3 rounded-xl border border-slate-300 shadow-sm focus:ring-2 focus:ring-slate-800 focus:border-slate-800 sm:text-sm transition-colors"
              />
              <button
                type="submit"
                className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-xl shadow-sm transition-colors"
              >
                Complete Verification
              </button>
            </form>
          </div>
        ) : status === 'success' ? (
          <div className="flex flex-col items-center gap-4">
            <CheckCircle2 className="w-16 h-16 text-emerald-500" />
            <h2 className="text-2xl font-bold text-slate-900">Verification Successful</h2>
            <p className="text-slate-600 mb-6">{message}</p>
            <button
              onClick={() => navigate('/')}
              className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-xl shadow-sm transition-colors"
            >
              Return Home
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <XCircle className="w-16 h-16 text-red-500" />
            <h2 className="text-2xl font-bold text-slate-900">Verification Failed</h2>
            <p className="text-slate-600 mb-6">{message}</p>
            <button
              onClick={() => navigate('/verify')}
              className="w-full py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-xl shadow-sm transition-colors"
            >
              Try Again
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
