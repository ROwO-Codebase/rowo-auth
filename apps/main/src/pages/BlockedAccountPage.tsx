import { format } from 'date-fns';
import { ShieldAlert, LogOut, Mail } from 'lucide-react';
import { motion } from 'motion/react';
import { useSession } from '../contexts/SessionContext';

const SUPPORT_EMAIL = 'dev@rowo.link';

function safeFormat(s: string | null | undefined): string {
  if (!s) return '—';
  const t = Date.parse(String(s));
  return Number.isFinite(t) ? format(new Date(t), 'yyyy-MM-dd HH:mm') : '—';
}

export default function BlockedAccountPage() {
  const { blacklist, signOut } = useSession();

  if (!blacklist) return null;

  const subject = encodeURIComponent(`Blacklist appeal — ${blacklist.wechat_id}`);
  const bodyLines = [
    'Hi ROwO support,',
    '',
    `My ROwO account is blocked because the WeChat ID ${blacklist.wechat_id} is on the blacklist.`,
    `Reason given: ${blacklist.reason || '(none)'}`,
    '',
    'I believe this is a mistake because:',
    '',
    '',
    'Thanks,',
  ];
  const mailHref = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${encodeURIComponent(bodyLines.join('\n'))}`;

  return (
    <div className="max-w-xl mx-auto mt-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white border border-rose-200 rounded-3xl shadow-sm overflow-hidden"
      >
        <div className="bg-rose-50 border-b border-rose-200 px-6 sm:px-8 py-6 flex items-start gap-4">
          <div className="bg-rose-600 text-white p-2.5 rounded-2xl shrink-0">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-rose-900">Account blocked</h1>
            <p className="text-sm text-rose-800 mt-1">
              Your bound WeChat ID has been added to the blacklist, so you can&rsquo;t use ROwO
              services right now.
            </p>
          </div>
        </div>

        <div className="px-6 sm:px-8 py-6 space-y-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">WeChat ID</div>
            <div className="font-mono text-sm break-all text-slate-900">{blacklist.wechat_id}</div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">Reason</div>
            <div className="text-sm text-slate-800 whitespace-pre-wrap">
              {blacklist.reason || 'No reason provided.'}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">Added by</div>
              <div className="text-slate-800">{blacklist.added_by || '—'}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-400 mb-1">Added at</div>
              <div className="text-slate-800">{safeFormat(blacklist.added_at)}</div>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-4 text-sm text-slate-600">
            If you believe this is a mistake, contact support and include the WeChat ID and any
            context that helps us verify your account.
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <a
              href={mailHref}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-sm transition-colors"
            >
              <Mail className="w-4 h-4" />
              Contact support
            </a>
            <button
              onClick={signOut}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
