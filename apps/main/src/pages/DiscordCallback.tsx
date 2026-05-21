import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import PostVerifyPrompt from '../components/PostVerifyPrompt';

const consumedDiscordCodes = new Set<string>();

const DiscordIcon = ({ className }: { className?: string }) => (
  <svg 
    viewBox="0 0 24 24" 
    fill="currentColor" 
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.419-2.157 2.419zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.419-2.157 2.419z"/>
  </svg>
);

export default function DiscordCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'verifying' | 'input_wechat' | 'connecting' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('Verifying your Discord identity...');
  const [discordData, setDiscordData] = useState<{ discord_id: string; username: string; avatar?: string } | null>(null);
  const [wechatId, setWechatId] = useState('');
  const [postVerify, setPostVerify] = useState<{ bindToken: string; wechatId: string; method: string; reverified: boolean; alreadyLinkedToRowo: boolean } | null>(null);

  const code = searchParams.get('code');

  useEffect(() => {
    if (!code) {
      setStatus('error');
      setMessage('No authorization code found. Please try again.');
      return;
    }

    if (consumedDiscordCodes.has(code)) {
      return;
    }
    consumedDiscordCodes.add(code);

    const runConnect = async (wechat: string, discordId: string) => {
      setStatus('connecting');
      setMessage('Connecting your accounts...');
      try {
        const res = await fetch(`${__API_ENDPOINT__}/api/verify/discord/connect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wechat_id: wechat, discord_id: discordId }),
        });
        const data = await res.json();
        if (data.success) {
          setStatus('success');
          setMessage('Successfully verified! Your WeChat account is now linked to your student status.');
          if (data.bind_token && data.wechat_id) {
            setPostVerify({
              bindToken: data.bind_token,
              wechatId: data.wechat_id,
              method: 'Discord',
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

    const verifyDiscord = async () => {
      try {
        const res = await fetch(`${__API_ENDPOINT__}/api/verify/discord/callback`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });
        const data = await res.json();

        if (data.success) {
          setDiscordData({
            discord_id: data.discord_id,
            username: data.discord_name,
            avatar: data.avatar
          });
          if (data.existing_wechat_id) {
            // Skip the re-verify confirmation screen and head straight to
            // sign in / sign up via PostVerifyPrompt.
            setWechatId(data.existing_wechat_id);
            await runConnect(data.existing_wechat_id, data.discord_id);
            return;
          }
          setStatus('input_wechat');
          setMessage('Discord verified! Now enter your WeChat ID to complete the link.');
        } else {
          setStatus('error');
          if (data.blacklisted && data.blacklist) {
            setMessage(`Verification blocked: This account is blacklisted. Reason: ${data.blacklist.reason}`);
          } else {
            setMessage(data.message || 'Failed to verify Discord identity.');
          }
        }
      } catch {
        setStatus('error');
        setMessage('An error occurred while communicating with the server.');
      }
    };

    verifyDiscord();
  }, [code]);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wechatId.trim() || !discordData) return;

    setStatus('connecting');
    setMessage('Connecting your accounts...');

    try {
      const res = await fetch(`${__API_ENDPOINT__}/api/verify/discord/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wechat_id: wechatId,
          discord_id: discordData.discord_id,
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
            method: 'Discord',
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
            <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
            <h2 className="text-2xl font-bold text-slate-900">{status === 'verifying' ? 'Verifying Discord' : 'Connecting Accounts'}</h2>
            <p className="text-slate-500">{message}</p>
          </div>
        ) : status === 'input_wechat' ? (
          <div className="flex flex-col items-center gap-6">
            {discordData?.avatar ? (
              <div className="relative">
                <img 
                  src={`https://cdn.discordapp.com/avatars/${discordData.discord_id}/${discordData.avatar}.png?size=128`} 
                  alt={discordData.username}
                  className="w-20 h-20 rounded-full shadow-md border-2 border-violet-200"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute -bottom-1 -right-1 bg-violet-600 text-white p-1.5 rounded-full border-2 border-white">
                  <DiscordIcon className="w-3 h-3" />
                </div>
              </div>
            ) : (
              <div className="bg-violet-100 p-4 rounded-2xl text-violet-600">
                <DiscordIcon className="w-10 h-10" />
              </div>
            )}
            <div>
              <h2 className="text-2xl font-bold text-slate-900">Link WeChat ID</h2>
              <p className="text-slate-500 mt-2">Logged in as <span className="font-semibold text-slate-900">{discordData?.username}</span></p>
            </div>
            <form onSubmit={handleConnect} className="w-full space-y-4">
              <input
                type="text"
                value={wechatId}
                onChange={(e) => setWechatId(e.target.value)}
                placeholder="Enter your WeChat ID"
                required
                className="block w-full px-4 py-3 rounded-xl border border-slate-300 shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
              />
              <button
                type="submit"
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl shadow-sm transition-colors"
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
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl shadow-sm transition-colors"
            >
              Try Again
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
