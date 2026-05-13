import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Mail, MessageSquare, AlertCircle, CheckCircle2, ChevronRight, Lock, Github } from 'lucide-react';
import { clsx } from 'clsx';
import { useSearchParams, useNavigate } from 'react-router-dom';

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

type VerificationMethod = 'adfs' | 'email' | 'discord' | 'github' | 'manual';

const UNIVERSITY_DOMAIN = '@uwaterloo.ca';

export default function VerificationPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialWechatId = searchParams.get('wechat_id') || '';

  const [activeMethod, setActiveMethod] = useState<VerificationMethod>('adfs');
  const [wechatId, setWechatId] = useState(initialWechatId);
  const [emailPrefix, setEmailPrefix] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [manualNotes, setManualNotes] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [showServers, setShowServers] = useState(false);
  const [trustedServers, setTrustedServers] = useState<any[]>([]);
  const [loadingServers, setLoadingServers] = useState(false);

  const fetchServerInfo = async (inviteCode: string) => {
    try {
      const res = await fetch(`https://discord.com/api/v10/invites/${inviteCode}?with_counts=true`);
      const data = await res.json();
      if (data.guild) {
        return {
          name: data.guild.name,
          icon: data.guild.icon ? `https://cdn.discordapp.com/icons/${data.guild.id}/${data.guild.icon}.png` : null,
          memberCount: data.approximate_member_count,
          onlineCount: data.approximate_presence_count,
          inviteCode: inviteCode
        };
      }
    } catch {
    }
    return null;
  };

  const handleShowServers = async () => {
    if (showServers) {
      setShowServers(false);
      return;
    }
    
    setShowServers(true);
    if (trustedServers.length === 0) {
      setLoadingServers(true);
      let invites: string[] = [];
      try {
        const invitesRes = await fetch(`${__API_ENDPOINT__}/api/verify/discord/trusted-invites`);
        const invitesData = await invitesRes.json();
        if (invitesData?.success && Array.isArray(invitesData.invites)) {
          const inviteList = invitesData.invites as unknown[];
          invites = Array.from(new Set(inviteList.map((value) => String(value || '').trim())))
            .filter((value): value is string => value.length > 0);
        }
      } catch {
      }
      const serverData = await Promise.all(invites.map(code => fetchServerInfo(code)));
      setTrustedServers(serverData.filter(s => s !== null));
      setLoadingServers(false);
    }
  };

  const handleSendCode = async () => {
    if (!wechatId.trim() || !emailPrefix.trim()) {
      setStatus('error');
      setMessage('Please enter your WeChat ID and University Email prefix first.');
      return;
    }

    setSendingCode(true);
    setStatus('idle');
    setMessage('');

    try {
      const res = await fetch(`${__API_ENDPOINT__}/api/verify/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wechat_id: wechatId,
          email: `${emailPrefix}${UNIVERSITY_DOMAIN}`
        }),
      });

      const data = await res.json();
      if (data.success) {
        setStatus('success');
        setMessage(data.message || 'Verification code sent to your email.');
      } else {
        setStatus('error');
        setMessage(data.message || 'Failed to send verification code.');
      }
    } catch (error) {
      setStatus('error');
      setMessage('An error occurred while sending the verification code.');
    } finally {
      setSendingCode(false);
    }
  };

  const methods = [
    {
      id: 'adfs',
      title: 'ADFS Login',
      description: 'Primary and recommended method. Login with your university credentials.',
      icon: Shield,
      disabled: false,
      color: 'bg-indigo-100 text-indigo-600',
      border: 'border-indigo-200',
      activeBorder: 'border-indigo-500 ring-1 ring-indigo-500',
    },
    {
      id: 'email',
      title: 'Student Email',
      description: 'Receive a verification code at your UWaterloo email address.',
      icon: Mail,
      disabled: false,
      color: 'bg-emerald-100 text-emerald-600',
      border: 'border-emerald-200',
      activeBorder: 'border-emerald-500 ring-1 ring-emerald-500',
    },
    {
      id: 'discord',
      title: 'Discord Server',
      description: 'Link your Discord account if you are already verified in a trusted student server.',
      icon: DiscordIcon,
      disabled: false,
      color: 'bg-violet-100 text-violet-600',
      border: 'border-violet-200',
      activeBorder: 'border-violet-500 ring-1 ring-violet-500',
    },
    {
      id: 'github',
      title: 'GitHub Account',
      description: 'Link your GitHub account if it has a verified university email.',
      icon: Github,
      disabled: false,
      color: 'bg-slate-100 text-slate-800',
      border: 'border-slate-200',
      activeBorder: 'border-slate-800 ring-1 ring-slate-800',
    },
    {
      id: 'manual',
      title: 'Manual Verification',
      description: 'Contact an administrator. Use this only if other methods fail.',
      icon: AlertCircle,
      disabled: false,
      color: 'bg-amber-100 text-amber-600',
      border: 'border-amber-200',
      activeBorder: 'border-amber-500 ring-1 ring-amber-500',
    },
  ] as const;

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wechatId.trim()) return;

    setStatus('loading');
    setMessage('');

    try {
      let endpoint = '';
      let body: any = { wechat_id: wechatId };

      switch (activeMethod) {
        case 'email':
          endpoint = `${__API_ENDPOINT__}/api/verify/email`;
          body = { ...body, email: `${emailPrefix}${UNIVERSITY_DOMAIN}`, code: verificationCode };
          break;
        case 'manual':
          endpoint = `${__API_ENDPOINT__}/api/verify/manual`;
          body = { ...body, reason: manualNotes || 'Requested manual verification.' };
          break;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.success) {
        if (data.reverified) {
          setStatus('success');
          setMessage('Successfully reverified! Redirecting to rename page...');
          setTimeout(() => {
            navigate(`/rename?token=${data.rename_token}&expiry=${data.rename_token_expires_at}`);
          }, 1500);
          return;
        }
        setStatus('success');
        setMessage(data.message);
        // Clear form after success
        setWechatId('');
        setEmailPrefix('');
        setVerificationCode('');
        setManualNotes('');
      } else {
        setStatus('error');
        if (data.blacklisted && data.blacklist) {
          setMessage(`Verification blocked: This account is blacklisted. Reason: ${data.blacklist.reason}`);
        } else {
          setMessage(data.message);
        }
      }
    } catch (error) {
      setStatus('error');
      setMessage('An error occurred during verification.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-12">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 mb-4">
          Verify Your Identity
        </h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          Choose a method below to link your student identity with your WeChat account.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        <div className="md:col-span-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Verification Methods
          </h2>
          {methods.map((method) => {
            const Icon = method.icon;
            const isActive = activeMethod === method.id;
            return (
              <motion.button
                key={method.id}
                disabled={method.disabled}
                whileHover={method.disabled ? {} : { scale: 1.02 }}
                whileTap={method.disabled ? {} : { scale: 0.98 }}
                onClick={() => setActiveMethod(method.id as VerificationMethod)}
                className={clsx(
                  'w-full text-left p-4 rounded-2xl border transition-all duration-200 flex items-start gap-4 relative overflow-hidden',
                  isActive ? method.activeBorder : `${method.border} hover:border-slate-300 bg-white`,
                  method.disabled && 'opacity-60 cursor-not-allowed grayscale-[0.5]'
                )}
              >
                {method.disabled && (
                  <div className="absolute inset-0 bg-slate-50/20 backdrop-blur-[1px] z-10 flex items-center justify-center">
                    <span className="bg-slate-800/80 text-white text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full transform -rotate-12">
                      Coming Soon
                    </span>
                  </div>
                )}
                <div className={clsx('p-3 rounded-xl shrink-0', method.color)}>
                  <Icon className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-slate-900 truncate">{method.title}</h3>
                  <p className="text-sm text-slate-500 mt-1 line-clamp-2">{method.description}</p>
                </div>
                {isActive && (
                  <div className="shrink-0 self-center">
                    <ChevronRight className="w-5 h-5 text-slate-400" />
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>

        <div className="md:col-span-7">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 sm:p-8 h-full flex flex-col">
            <h2 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-3">
              <Lock className="w-6 h-6 text-slate-400" />
              {methods.find((m) => m.id === activeMethod)?.title}
            </h2>

            <form onSubmit={handleVerify} className="flex-1 flex flex-col">
              <div className="space-y-6 flex-1">
                {activeMethod !== 'discord' && activeMethod !== 'adfs' && activeMethod !== 'github' && (
                  <div>
                    <label htmlFor="wechatId" className="block text-sm font-medium text-slate-700 mb-2">
                      WeChat ID
                    </label>
                    <input
                      type="text"
                      id="wechatId"
                      required
                      value={wechatId}
                      onChange={(e) => setWechatId(e.target.value)}
                      className="block w-full px-4 py-3 rounded-xl border border-slate-300 shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
                      placeholder="Enter your WeChat ID"
                    />
                  </div>
                )}

                <AnimatePresence mode="wait">
                  {activeMethod === 'email' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-6 overflow-hidden"
                    >
                      <div>
                        <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
                          University Email
                        </label>
                        <div className="flex gap-0">
                          <div className="relative flex-1">
                            <input
                              type="text"
                              id="email"
                              required={activeMethod === 'email'}
                              value={emailPrefix}
                              onChange={(e) => setEmailPrefix(e.target.value)}
                              className="block w-full px-4 py-3 rounded-l-xl border border-slate-300 shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors border-r-0"
                              placeholder="student"
                            />
                          </div>
                          <div className="inline-flex items-center px-4 py-3 rounded-r-xl border border-l-0 border-slate-300 bg-slate-50 text-slate-500 sm:text-sm font-medium">
                            {UNIVERSITY_DOMAIN}
                          </div>
                          <motion.button
                            type="button"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleSendCode}
                            disabled={sendingCode || !wechatId.trim() || !emailPrefix.trim()}
                            className="ml-3 shrink-0 px-4 py-2 border border-slate-300 rounded-xl text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                          >
                            {sendingCode ? 'Sending...' : 'Send Code'}
                          </motion.button>
                        </div>
                      </div>
                      <div>
                        <label htmlFor="code" className="block text-sm font-medium text-slate-700 mb-2">
                          Verification Code
                        </label>
                        <input
                          type="text"
                          id="code"
                          required={activeMethod === 'email'}
                          value={verificationCode}
                          onChange={(e) => setVerificationCode(e.target.value)}
                          className="block w-full px-4 py-3 rounded-xl border border-slate-300 shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
                          placeholder="Enter verification code"
                        />
                      </div>
                    </motion.div>
                  )}

                  {activeMethod === 'adfs' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-6"
                    >
                      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-sm text-indigo-800">
                        You will be redirected to the university's ADFS login page. After successful authentication, you will be returned here to complete the process.
                      </div>
                      <motion.button
                        type="button"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          window.location.href = `${__API_ENDPOINT__}/api/oauth/redirect/adfs`;
                        }}
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl shadow-sm transition-colors"
                      >
                        <Shield className="w-5 h-5" />
                        Login with ADFS
                      </motion.button>
                    </motion.div>
                  )}

                  {activeMethod === 'discord' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-6"
                    >
                      <div className="bg-violet-50 border border-violet-100 rounded-xl p-4 text-sm text-violet-800">
                        Clicking verify will redirect you to Discord to authenticate. Ensure you are already verified in a trusted student server.
                      </div>
                      <motion.button
                        type="button"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          window.location.href = `${__API_ENDPOINT__}/api/oauth/redirect/discord`;
                        }}
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-violet-600 hover:bg-violet-700 text-white font-medium rounded-xl shadow-sm transition-colors"
                      >
                        <DiscordIcon className="w-5 h-5" />
                        Connect with Discord
                      </motion.button>

                      <div className="pt-4 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={handleShowServers}
                          className="text-sm font-medium text-violet-600 hover:text-violet-700 flex items-center gap-2 transition-colors"
                        >
                          {showServers ? 'Hide Trusted Student Servers' : 'Show Trusted Student Servers'}
                        </button>

                        <AnimatePresence>
                          {showServers && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              className="mt-4 space-y-3 overflow-hidden"
                            >
                              {loadingServers ? (
                                <div className="text-center py-4 text-slate-400 text-sm">
                                  Loading server information...
                                </div>
                              ) : trustedServers.length > 0 ? (
                                trustedServers.map((server) => (
                                  <div key={server.inviteCode} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200">
                                    <div className="flex items-center gap-3">
                                      {server.icon ? (
                                        <img src={server.icon} alt={server.name} className="w-10 h-10 rounded-xl shadow-sm" referrerPolicy="no-referrer" />
                                      ) : (
                                        <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center text-violet-600 font-bold">
                                          {server.name.charAt(0)}
                                        </div>
                                      )}
                                      <div>
                                        <h4 className="text-sm font-bold text-slate-900">{server.name}</h4>
                                        <p className="text-xs text-slate-500">
                                          {server.memberCount?.toLocaleString()} members • {server.onlineCount?.toLocaleString()} online
                                        </p>
                                      </div>
                                    </div>
                                    <a
                                      href={`https://discord.gg/${server.inviteCode}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
                                    >
                                      Join Server
                                    </a>
                                  </div>
                                ))
                              ) : (
                                <div className="text-center py-4 text-slate-400 text-sm">
                                  No trusted servers found.
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  )}

                  {activeMethod === 'github' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-6"
                    >
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-700">
                        Clicking verify will redirect you to GitHub to authenticate. Your GitHub account must have at least one verified university email on file.
                      </div>
                      <motion.button
                        type="button"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          window.location.href = `${__API_ENDPOINT__}/api/oauth/redirect/github`;
                        }}
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-xl shadow-sm transition-colors"
                      >
                        <Github className="w-5 h-5" />
                        Connect with GitHub
                      </motion.button>
                    </motion.div>
                  )}

                  {activeMethod === 'manual' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-sm text-amber-800"
                    >
                      Manual verification requires administrator approval and may take up to 48 hours. Please provide any relevant details below.
                      <textarea
                        className="mt-3 block w-full px-4 py-3 rounded-xl border border-amber-300 shadow-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 sm:text-sm transition-colors bg-white"
                        rows={3}
                        value={manualNotes}
                        onChange={(e) => setManualNotes(e.target.value)}
                        placeholder="Additional details..."
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="mt-8 pt-6 border-t border-slate-100">
                {activeMethod !== 'discord' && activeMethod !== 'adfs' && activeMethod !== 'github' && (
                  <motion.button
                    type="submit"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    disabled={status === 'loading'}
                    className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {status === 'loading' ? 'Processing...' : 'Verify Now'}
                  </motion.button>
                )}

                {status === 'success' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 p-4 bg-emerald-50 rounded-xl flex items-start gap-3"
                  >
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <p className="text-sm text-emerald-800 font-medium">{message}</p>
                  </motion.div>
                )}

                {status === 'error' && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 p-4 bg-red-50 rounded-xl flex items-start gap-3"
                  >
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-800 font-medium">{message}</p>
                  </motion.div>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
