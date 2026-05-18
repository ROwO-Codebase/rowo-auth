import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldAlert, Search, MoreVertical, X, AlertTriangle, ShieldOff, Save, ShieldCheck, CheckCircle, Info, Plus, Edit2, Trash2, RotateCcw, Pencil, RefreshCw, Bell, Users, UserPlus, UserMinus, LogIn, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { clsx } from 'clsx';
import ReactMarkdown from 'react-markdown';
import { useSession } from '../contexts/SessionContext';
import { authHeaders, hasMinRole, type RowoRole } from '../lib/session';

const PAGE_SIZE = 50;

function Pagination({ page, totalItems, onChange }: { page: number; totalItems: number; onChange: (page: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  const clampedPage = Math.min(Math.max(1, page), totalPages);
  const start = totalItems === 0 ? 0 : (clampedPage - 1) * PAGE_SIZE + 1;
  const end = Math.min(clampedPage * PAGE_SIZE, totalItems);
  if (totalItems <= PAGE_SIZE) return null;
  return (
    <div className="px-4 sm:px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-sm text-slate-600 gap-2">
      <div className="text-xs sm:text-sm">
        {totalItems === 0 ? 'No results' : `Showing ${start}-${end} of ${totalItems}`}
      </div>
      <div className="flex items-center gap-1 sm:gap-2">
        <button
          onClick={() => onChange(clampedPage - 1)}
          disabled={clampedPage <= 1}
          className="inline-flex items-center px-2 py-1 rounded-lg text-slate-600 hover:bg-white hover:text-indigo-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="px-2 text-xs sm:text-sm whitespace-nowrap">
          Page {clampedPage} of {totalPages}
        </span>
        <button
          onClick={() => onChange(clampedPage + 1)}
          disabled={clampedPage >= totalPages}
          className="inline-flex items-center px-2 py-1 rounded-lg text-slate-600 hover:bg-white hover:text-indigo-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
          aria-label="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

interface AccountInfo {
  id: number;
  wechat_id: string;
  color: string;
  icon: string;
  title: string;
  body: string;
  creator: string;
  created_at: string;
  updated_at: string;
  visibility: string;
}

interface AccountData {
  wechat_id: string;
  verified_status: number;
  verification_method: string;
  verification_time: string;
  student_id?: string;
  student_name?: string;
  faculty?: string;
  email?: string;
  discord_id?: string;
  notes?: string;
  manual_status?: string;
  manual_reason?: string;
  manual_admin?: string;
  manual_time?: string;
  reverified_at?: string;
  blacklisted?: boolean;
  blacklist?: null | {
    wechat_id: string;
    reason: string;
    added_by: string;
    added_at: string;
  };
}

export default function AdminPanel() {
  const { user, loading: sessionLoading } = useSession();
  const [accounts, setAccounts] = useState<AccountData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<AccountData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'accounts' | 'blacklist' | 'batch' | 'rowoUsers' | 'roles' | 'settings'>('accounts');
  const [blacklist, setBlacklist] = useState<any[]>([]);
  const [loadingBlacklist, setLoadingBlacklist] = useState(false);
  const [accountsPage, setAccountsPage] = useState(1);

  useEffect(() => {
    setAccountsPage(1);
  }, [searchTerm]);

  const role: RowoRole = (user?.role as RowoRole) || 'user';
  const isAtLeastAdmin = hasMinRole(role, 'admin');
  const isModeratorOnly = role === 'moderator';

  const fetchAccounts = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);
    try {
      const res = await fetch(`${__API_ENDPOINT__}/api/admin/accounts`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setAccounts(data.accounts);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchBlacklist = async () => {
    setLoadingBlacklist(true);
    try {
      const res = await fetch(`${__API_ENDPOINT__}/api/admin/blacklist`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setBlacklist(data.blacklist);
      }
    } catch {
    } finally {
      setLoadingBlacklist(false);
    }
  };

  useEffect(() => {
    if (!user || role === 'user') return;
    if (activeTab === 'accounts') fetchAccounts();
    else if (activeTab === 'blacklist') fetchBlacklist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, user?.id, role]);

  if (sessionLoading) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center text-slate-500 text-sm">
        Loading session...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto mt-20 bg-white p-8 rounded-3xl shadow-sm border border-slate-200 text-center">
        <div className="bg-indigo-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 text-indigo-600">
          <LogIn className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Sign in required</h1>
        <p className="text-slate-500 mt-2 mb-6">Sign in to your ROwO account to access the admin panel.</p>
        <Link
          to="/login"
          className="inline-flex items-center gap-2 py-2.5 px-5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors"
        >
          <LogIn className="w-4 h-4" /> Sign in
        </Link>
      </div>
    );
  }

  if (role === 'user') {
    return (
      <div className="max-w-md mx-auto mt-20 bg-white p-8 rounded-3xl shadow-sm border border-slate-200 text-center">
        <div className="bg-red-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 text-red-600">
          <ShieldOff className="w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Access denied</h1>
        <p className="text-slate-500 mt-2 mb-6">Your ROwO account does not have admin panel access.</p>
        <Link
          to="/center"
          className="inline-flex items-center gap-2 py-2.5 px-5 bg-slate-900 hover:bg-black text-white text-sm font-medium rounded-xl transition-colors"
        >
          Back to User Center
        </Link>
      </div>
    );
  }

  const filteredAccounts = accounts.filter(
    (acc) =>
      acc.wechat_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      acc.student_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      acc.student_id?.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const pagedAccounts = filteredAccounts.slice(
    (accountsPage - 1) * PAGE_SIZE,
    accountsPage * PAGE_SIZE
  );

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{isModeratorOnly ? 'Moderator Panel' : 'Admin Panel'}</h1>
          <p className="text-sm text-slate-500 mt-1">
            {isModeratorOnly ? 'Review pending manual verifications' : 'Manage verified student accounts and security'}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-slate-600 font-medium hidden sm:block">
            Logged in as <span className="text-indigo-600">{user.username}</span> ({role.replace('_', ' ')})
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-6 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('accounts')}
          className={clsx(
            "px-4 py-2 text-sm font-medium transition-colors relative",
            activeTab === 'accounts' ? "text-indigo-600" : "text-slate-500 hover:text-slate-700"
          )}
        >
          Accounts
          {activeTab === 'accounts' && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />}
        </button>
        <button
          onClick={() => setActiveTab('blacklist')}
          className={clsx(
            "px-4 py-2 text-sm font-medium transition-colors relative",
            activeTab === 'blacklist' ? "text-indigo-600" : "text-slate-500 hover:text-slate-700"
          )}
        >
          Blacklist Management
          {activeTab === 'blacklist' && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />}
        </button>
        <button
          onClick={() => setActiveTab('batch')}
          className={clsx(
            "px-4 py-2 text-sm font-medium transition-colors relative",
            activeTab === 'batch' ? "text-indigo-600" : "text-slate-500 hover:text-slate-700"
          )}
        >
          Batch Operations
          {activeTab === 'batch' && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />}
        </button>
        {isAtLeastAdmin && (
          <>
            <button
              onClick={() => setActiveTab('rowoUsers')}
              className={clsx(
                "px-4 py-2 text-sm font-medium transition-colors relative",
                activeTab === 'rowoUsers' ? "text-indigo-600" : "text-slate-500 hover:text-slate-700"
              )}
            >
              ROwO Users
              {activeTab === 'rowoUsers' && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />}
            </button>
            <button
              onClick={() => setActiveTab('roles')}
              className={clsx(
                "px-4 py-2 text-sm font-medium transition-colors relative",
                activeTab === 'roles' ? "text-indigo-600" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Roles
              {activeTab === 'roles' && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />}
            </button>
          </>
        )}
        <button
          onClick={() => setActiveTab('settings')}
          className={clsx(
            "px-4 py-2 text-sm font-medium transition-colors relative",
            activeTab === 'settings' ? "text-indigo-600" : "text-slate-500 hover:text-slate-700"
          )}
        >
          Settings
          {activeTab === 'settings' && <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600" />}
        </button>
      </div>

      {activeTab === 'settings' ? (
        <SettingsTab />
      ) : activeTab === 'roles' && isAtLeastAdmin ? (
        <RolesTab role={role} currentUserId={user.id} />
      ) : activeTab === 'accounts' ? (
        <>
          <div className="flex items-center justify-end gap-2 mb-4">
            <button
              onClick={() => fetchAccounts(true)}
              disabled={loading || refreshing}
              className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50"
              title="Refresh user list"
            >
              <RotateCcw className={clsx("w-5 h-5", refreshing && "animate-spin")} />
            </button>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-slate-400" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="block w-full sm:w-64 pl-10 pr-3 py-2 border border-slate-300 rounded-lg leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
                placeholder="Search accounts..."
              />
            </div>
          </div>

          <div className="bg-white shadow-sm border border-slate-200 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      WeChat ID
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Student Info
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Method
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th scope="col" className="relative px-6 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-200">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-500">
                        Loading accounts...
                      </td>
                    </tr>
                  ) : pagedAccounts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-500">
                        No accounts found.
                      </td>
                    </tr>
                  ) : (
                    pagedAccounts.map((account) => (
                      <tr key={account.wechat_id} className={clsx("hover:bg-slate-50 transition-colors", account.manual_status === 'pending' && "bg-amber-50/50")}>
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-slate-900 flex flex-wrap items-center gap-2 break-all">
                            {account.wechat_id}
                            {account.manual_status === 'pending' && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                                Pending
                              </span>
                            )}
                            {account.blacklisted && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                                Blacklisted
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500">{format(new Date(account.verification_time.endsWith('Z') ? account.verification_time : account.verification_time + 'Z'), 'MMM d, yyyy')}</div>
                          {account.reverified_at && (
                            <div className="text-[10px] text-indigo-600 font-medium mt-0.5">
                              Re-verified: {format(new Date(account.reverified_at.endsWith('Z') ? account.reverified_at : account.reverified_at + 'Z'), 'MMM d, yyyy')}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-sm text-slate-900 break-all">{account.student_name || account.email || account.discord_id || 'N/A'}</div>
                          <div className="text-xs text-slate-500 break-all">{account.student_id || account.faculty || ''}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                            {account.verification_method}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {account.verified_status === 1 ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                              Verified
                            </span>
                          ) : account.verified_status === 2 ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              Revoked
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                              Unverified
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => setSelectedAccount(account)}
                            className="text-indigo-600 hover:text-indigo-900 p-2 rounded-lg hover:bg-indigo-50 transition-colors"
                          >
                            <MoreVertical className="w-5 h-5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <Pagination
              page={accountsPage}
              totalItems={filteredAccounts.length}
              onChange={setAccountsPage}
            />
          </div>
        </>
      ) : activeTab === 'blacklist' ? (
        <BlacklistTab blacklist={blacklist} loading={loadingBlacklist} onUpdate={fetchBlacklist} />
      ) : activeTab === 'rowoUsers' && isAtLeastAdmin ? (
        <RowoUsersTab />
      ) : (
        <BatchTab onUpdate={fetchAccounts} />
      )}

      <AnimatePresence>
        {selectedAccount && (
          <AccountModal
            account={selectedAccount}
            canManage={isAtLeastAdmin}
            onClose={() => setSelectedAccount(null)}
            onUpdate={() => {
              fetchAccounts();
              setSelectedAccount(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function AccountModal({
  account,
  canManage,
  onClose,
  onUpdate,
}: {
  account: AccountData;
  canManage: boolean;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectAlertOpen, setRejectAlertOpen] = useState(false);
  
  const [infoItems, setInfoItems] = useState<AccountInfo[]>([]);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [editingInfo, setEditingInfo] = useState<Partial<AccountInfo> | null>(null);
  const [confirmDeleteInfo, setConfirmDeleteInfo] = useState<{isOpen: boolean, id: number | null}>({isOpen: false, id: null});

  useEffect(() => {
    fetchInfo();
  }, [account.wechat_id]);

  const fetchInfo = async () => {
    setLoadingInfo(true);
    try {
      const res = await fetch(`${__API_ENDPOINT__}/api/admin/accounts/${encodeURIComponent(account.wechat_id)}/info`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setInfoItems(data.info);
      }
    } catch {
    } finally {
      setLoadingInfo(false);
    }
  };

  const handleSaveInfo = async () => {
    if (!editingInfo?.title || !editingInfo?.body) return;
    setSaving(true);
    try {
      if (editingInfo.id) {
        await fetch(`${__API_ENDPOINT__}/api/admin/info/${editingInfo.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify(editingInfo),
        });
      } else {
        await fetch(`${__API_ENDPOINT__}/api/admin/accounts/${encodeURIComponent(account.wechat_id)}/info`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({
            ...editingInfo,
            color: editingInfo.color || 'blue',
            icon: editingInfo.icon || 'info',
            visibility: editingInfo.visibility || 'public'
          }),
        });
      }
      setEditingInfo(null);
      fetchInfo();
    } catch {
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteInfo = async (id: number) => {
    setConfirmDeleteInfo({isOpen: true, id});
  };

  const executeDeleteInfo = async () => {
    const id = confirmDeleteInfo.id;
    if (!id) return;
    setConfirmDeleteInfo({isOpen: false, id: null});
    setSaving(true);
    try {
      await fetch(`${__API_ENDPOINT__}/api/admin/info/${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      fetchInfo();
    } catch {
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = async () => {
    setSaving(true);
    try {
      await fetch(`${__API_ENDPOINT__}/api/admin/accounts/${encodeURIComponent(account.wechat_id)}/revoke`, {
        method: 'POST',
        headers: authHeaders(),
      });
      onUpdate();
    } catch {
      setSaving(false);
    }
  };

  const handleUnrevoke = async () => {
    setSaving(true);
    try {
      await fetch(`${__API_ENDPOINT__}/api/admin/accounts/${encodeURIComponent(account.wechat_id)}/unrevoke`, {
        method: 'POST',
        headers: authHeaders(),
      });
      onUpdate();
    } catch {
      setSaving(false);
    }
  };

  const handleMarkContacted = async () => {
    setSaving(true);
    try {
      await fetch(`${__API_ENDPOINT__}/api/admin/accounts/${encodeURIComponent(account.wechat_id)}/contact`, {
        method: 'POST',
        headers: authHeaders(),
      });
      await fetchInfo();
    } catch {
    } finally {
      setSaving(false);
    }
  };

  const handleManualAction = async (action: 'approve' | 'reject') => {
    if (action === 'reject' && !rejectReason.trim()) {
      setRejectAlertOpen(true);
      return;
    }
    setSaving(true);
    try {
      await fetch(`${__API_ENDPOINT__}/api/admin/accounts/${encodeURIComponent(account.wechat_id)}/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ action, reason: rejectReason }),
      });
      onUpdate();
    } catch {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-lg bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">Manage Account</h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <div className="mb-6">
            <h3 className="text-sm font-medium text-slate-500 mb-2">Account Details</h3>
            <div className="bg-slate-50 rounded-xl p-4 space-y-3">
              <div className="flex justify-between gap-4">
                <span className="text-sm text-slate-500 shrink-0">WeChat ID</span>
                <span className="text-sm font-medium text-slate-900 break-all text-right">{account.wechat_id}</span>
              </div>
              {account.student_name && (
                <div className="flex justify-between gap-4">
                  <span className="text-sm text-slate-500 shrink-0">Name</span>
                  <span className="text-sm font-medium text-slate-900 break-all text-right">{account.student_name}</span>
                </div>
              )}
              {account.student_id && (
                <div className="flex justify-between gap-4">
                  <span className="text-sm text-slate-500 shrink-0">Student ID</span>
                  <span className="text-sm font-medium text-slate-900 break-all text-right">{account.student_id}</span>
                </div>
              )}
              {account.email && (
                <div className="flex justify-between gap-4">
                  <span className="text-sm text-slate-500 shrink-0">Email</span>
                  <span className="text-sm font-medium text-slate-900 break-all text-right">{account.email}</span>
                </div>
              )}
              {account.reverified_at && (
                <div className="flex justify-between border-t border-slate-200 pt-2 mt-2">
                  <span className="text-sm text-slate-500">Last Re-verified</span>
                  <span className="text-sm font-medium text-indigo-600">
                    {format(new Date(account.reverified_at.endsWith('Z') ? account.reverified_at : account.reverified_at + 'Z'), 'MMM d, yyyy')}
                  </span>
                </div>
              )}
              {account.manual_admin && (
                <div className="flex justify-between border-t border-slate-200 pt-2 mt-2">
                  <span className="text-sm text-slate-500">Processed By</span>
                  <span className="text-sm font-medium text-slate-900">
                    {account.manual_admin} on {account.manual_time ? format(new Date(account.manual_time.endsWith('Z') ? account.manual_time : account.manual_time + 'Z'), 'MMM d, yyyy') : 'Unknown'}
                  </span>
                </div>
              )}
              {account.manual_status === 'rejected' && account.manual_reason && (
                <div className="flex justify-between">
                  <span className="text-sm text-slate-500">Rejection Reason</span>
                  <span className="text-sm font-medium text-red-600">{account.manual_reason}</span>
                </div>
              )}
              {account.blacklisted && account.blacklist && (
                <div className="flex flex-col border-t border-red-100 pt-2 mt-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-red-600 font-bold">Blacklisted</span>
                    <span className="text-xs text-slate-500">{format(new Date(account.blacklist.added_at.endsWith('Z') ? account.blacklist.added_at : account.blacklist.added_at + 'Z'), 'MMM d, yyyy')}</span>
                  </div>
                  <p className="text-sm text-red-700 mt-1 bg-red-50 p-2 rounded-lg">
                    Reason: {account.blacklist.reason}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1">Added by {account.blacklist.added_by}</p>
                </div>
              )}
            </div>
          </div>

          {account.manual_status === 'pending' && (
            <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h3 className="text-sm font-bold text-amber-800 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Pending Manual Verification
              </h3>
              <p className="text-sm text-amber-700 mb-4">
                This user has requested manual verification. Please review their details and approve or reject the application.
              </p>
              {account.notes && (
                <div className="mb-4 bg-white border border-amber-200 rounded-lg p-3">
                  <h4 className="text-xs font-semibold text-amber-800 uppercase tracking-wider mb-1">User Notes</h4>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{account.notes}</p>
                </div>
              )}
              {(() => {
                const contactNote = infoItems.find(i => i.title === 'User Contacted');
                if (contactNote) {
                  return (
                    <div className="mb-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-start gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                      <div className="text-xs text-emerald-800">
                        Already contacted by <b>{contactNote.creator}</b> on {format(new Date(contactNote.updated_at.endsWith('Z') ? contactNote.updated_at : contactNote.updated_at + 'Z'), 'MMM d, yyyy HH:mm')}. Do not contact again.
                      </div>
                    </div>
                  );
                }
                return (
                  <button
                    onClick={handleMarkContacted}
                    disabled={saving}
                    className="w-full mb-3 bg-white hover:bg-amber-100 text-amber-800 border border-amber-300 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex justify-center items-center gap-2 disabled:opacity-50"
                  >
                    <CheckCircle className="w-4 h-4" /> I have contacted this person
                  </button>
                );
              })()}
              <div className="space-y-3">
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Reason for rejection (required if rejecting)..."
                  className="w-full text-sm p-2 border border-amber-300 rounded-lg focus:ring-amber-500 focus:border-amber-500 bg-white"
                  rows={2}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleManualAction('approve')}
                    disabled={saving}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors flex justify-center items-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" /> Approve
                  </button>
                  <button
                    onClick={() => handleManualAction('reject')}
                    disabled={saving || !rejectReason.trim()}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors flex justify-center items-center gap-2 disabled:opacity-50"
                  >
                    <X className="w-4 h-4" /> Reject
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-slate-700">Information Items</h3>
              {canManage && (
                <button
                  onClick={() => setEditingInfo({ color: 'blue', icon: 'info', visibility: 'public' })}
                  className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded transition-colors"
                >
                  <Plus className="w-3 h-3" /> Add Info
                </button>
              )}
            </div>

            {editingInfo && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 mb-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Title</label>
                    <input
                      type="text"
                      value={editingInfo.title || ''}
                      onChange={(e) => setEditingInfo({ ...editingInfo, title: e.target.value })}
                      className="block w-full px-2 py-1 border border-slate-300 rounded focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                      placeholder="Title"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Visibility</label>
                    <select
                      value={editingInfo.visibility || 'public'}
                      onChange={(e) => setEditingInfo({ ...editingInfo, visibility: e.target.value })}
                      className="block w-full px-2 py-1 border border-slate-300 rounded focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                    >
                      <option value="public">Public</option>
                      <option value="private">Private (Admin Only)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Color</label>
                    <select
                      value={editingInfo.color || 'blue'}
                      onChange={(e) => setEditingInfo({ ...editingInfo, color: e.target.value })}
                      className="block w-full px-2 py-1 border border-slate-300 rounded focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                    >
                      <option value="blue">Blue</option>
                      <option value="orange">Orange</option>
                      <option value="yellow">Yellow</option>
                      <option value="red">Red</option>
                      <option value="purple">Purple</option>
                      <option value="emerald">Emerald</option>
                      <option value="slate">Slate</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Icon</label>
                    <select
                      value={editingInfo.icon || 'info'}
                      onChange={(e) => setEditingInfo({ ...editingInfo, icon: e.target.value })}
                      className="block w-full px-2 py-1 border border-slate-300 rounded focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                    >
                      <option value="info">Info</option>
                      <option value="warning">Warning</option>
                      <option value="error">Error</option>
                      <option value="checkmark">Checkmark</option>
                      <option value="pencil">Pencil</option>
                      <option value="refresh">Refresh</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Body (Markdown)</label>
                  <textarea
                    value={editingInfo.body || ''}
                    onChange={(e) => setEditingInfo({ ...editingInfo, body: e.target.value })}
                    rows={4}
                    className="block w-full px-2 py-1 border border-slate-300 rounded focus:ring-indigo-500 focus:border-indigo-500 text-sm font-mono"
                    placeholder="Markdown supported..."
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setEditingInfo(null)}
                    className="px-3 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveInfo}
                    disabled={saving || !editingInfo.title || !editingInfo.body}
                    className="px-3 py-1 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded transition-colors disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save Info'}
                  </button>
                </div>
              </div>
            )}

            {loadingInfo ? (
              <div className="text-sm text-slate-500 text-center py-4">Loading info...</div>
            ) : infoItems.length === 0 ? (
              <div className="text-sm text-slate-500 text-center py-4 border border-dashed border-slate-300 rounded-xl">No information items.</div>
            ) : (
              <div className="space-y-3">
                {infoItems.map(info => {
                  const IconComp = {
                    warning: AlertTriangle,
                    error: X,
                    checkmark: CheckCircle,
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
                    <div key={info.id} className={`border rounded-xl p-3 ${colorClasses}`}>
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                          <IconComp className={`w-4 h-4 ${iconColor}`} />
                          <h4 className="font-bold text-sm">{info.title}</h4>
                          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/50 font-semibold">
                            {info.visibility}
                          </span>
                        </div>
                        <div className="flex gap-1">
                          {canManage && (
                            <>
                              <button onClick={() => setEditingInfo(info)} className="p-1 hover:bg-white/50 rounded text-slate-600">
                                <Edit2 className="w-3 h-3" />
                              </button>
                              <button onClick={() => handleDeleteInfo(info.id)} className="p-1 hover:bg-white/50 rounded text-red-600">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-sm opacity-90 prose prose-sm max-w-none prose-p:my-1 prose-headings:my-2">
                        <ReactMarkdown>{info.body}</ReactMarkdown>
                      </div>
                      <div className="mt-2 pt-2 border-t border-black/5 flex justify-between text-[10px] opacity-70">
                        <span>By {info.creator}</span>
                        <span>{format(new Date(info.updated_at.endsWith('Z') ? info.updated_at : info.updated_at + 'Z'), 'MMM d, yyyy HH:mm')}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-4">
          {canManage && (
            <div className="flex gap-2">
              {account.verified_status === 1 ? (
                <button
                  onClick={handleRevoke}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-700 bg-red-100 hover:bg-red-200 rounded-lg transition-colors disabled:opacity-50"
                >
                  <ShieldOff className="w-4 h-4" />
                  Revoke Status
                </button>
              ) : (
                <button
                    onClick={handleUnrevoke}
                    disabled={saving}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-100 hover:bg-emerald-200 rounded-lg transition-colors disabled:opacity-50"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    Restore Status
                </button>
              )}
            </div>
          )}

          <div className={`flex gap-3 ${!canManage ? 'w-full justify-end' : ''}`}>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </motion.div>

      <AlertDialog
        isOpen={rejectAlertOpen}
        title="Reason Required"
        message="Please provide a reason for rejection."
        onClose={() => setRejectAlertOpen(false)}
      />
      <ConfirmDialog
        isOpen={confirmDeleteInfo.isOpen}
        title="Delete Information"
        message="Are you sure you want to delete this information?"
        onConfirm={executeDeleteInfo}
        onCancel={() => setConfirmDeleteInfo({isOpen: false, id: null})}
        confirmText="Delete"
        isDangerous={true}
      />
    </div>
  );
}

function BlacklistTab({ blacklist, loading, onUpdate }: { blacklist: any[]; loading: boolean; onUpdate: () => void }) {
  const [wechatId, setWechatId] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [alertMessage, setAlertMessage] = useState('');

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wechatId.trim() || !reason.trim()) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${__API_ENDPOINT__}/api/admin/accounts/${encodeURIComponent(wechatId)}/blacklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (data.success) {
        setWechatId('');
        setReason('');
        onUpdate();
      } else {
        setError(data.message);
      }
    } catch (error) {
      setError('Failed to add to blacklist');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id: string) => {
    setSaving(true);
    try {
      const res = await fetch(`${__API_ENDPOINT__}/api/admin/accounts/${encodeURIComponent(id)}/unblacklist`, {
        method: 'POST',
        headers: authHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        onUpdate();
      } else {
        setAlertMessage(data.message);
      }
    } catch {
      setAlertMessage('Failed to unblacklist account.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <ShieldAlert className="w-5 h-5 text-red-600" />
          Add to Blacklist
        </h3>
        <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-12 gap-4">
          <div className="sm:col-span-4">
            <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">WeChat ID</label>
            <input
              type="text"
              value={wechatId}
              onChange={(e) => setWechatId(e.target.value)}
              placeholder="e.g. wxid_12345"
              className="block w-full px-4 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 sm:text-sm"
              required
            />
          </div>
          <div className="sm:col-span-6">
            <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Reason</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason for blacklisting..."
              className="block w-full px-4 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-red-500 focus:border-red-500 sm:text-sm"
              required
            />
          </div>
          <div className="sm:col-span-2 flex items-end">
            <button
              type="submit"
              disabled={saving || !wechatId.trim() || !reason.trim()}
              className="w-full py-2 px-4 bg-slate-900 hover:bg-black text-white font-medium rounded-xl shadow-sm transition-colors disabled:opacity-50"
            >
              {saving ? 'Adding...' : 'Blacklist'}
            </button>
          </div>
        </form>
        {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
      </div>

      <div className="bg-white shadow-sm border border-slate-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">WeChat ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Reason</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Added By</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
                <th className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-500">Loading blacklist...</td></tr>
              ) : blacklist.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-500">No accounts blacklisted.</td></tr>
              ) : (
                blacklist.map((item) => (
                  <tr key={item.wechat_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-mono text-sm text-slate-900 break-all">{item.wechat_id}</td>
                    <td className="px-6 py-4 text-sm text-slate-600 max-w-xs break-words" title={item.reason}>{item.reason}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{item.added_by}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{format(new Date(item.added_at.endsWith('Z') ? item.added_at : item.added_at + 'Z'), 'MMM d, yyyy')}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleRemove(item.wechat_id)}
                        disabled={saving}
                        className="text-red-600 hover:text-red-900 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
                      >
                        Unblacklist
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AlertDialog
        isOpen={!!alertMessage}
        title="Error"
        message={alertMessage}
        onClose={() => setAlertMessage('')}
      />
    </div>
  );
}

function BatchTab({ onUpdate }: { onUpdate: () => void }) {
  const [input, setInput] = useState('');
  const [reason, setReason] = useState('');
  const [action, setAction] = useState<'verify' | 'blacklist'>('verify');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; results?: any[] } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const wechatIds = input.split(/[\n,]+/).map(id => id.trim()).filter(id => id.length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (wechatIds.length === 0 || !reason.trim()) return;

    setConfirmOpen(true);
  };

  const executeBatchAction = async () => {
    setConfirmOpen(false);
    setSaving(true);
    setResult(null);
    try {
      const res = await fetch(`${__API_ENDPOINT__}/api/admin/batch/${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ wechat_ids: wechatIds, reason }),
      });
      const data = await res.json();
      setResult(data);
      if (data.success) {
        setInput('');
        setReason('');
        onUpdate();
      }
    } catch (error) {
      setResult({ success: false, message: `Failed to batch ${action} accounts: ${error}` });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-indigo-600" />
          Batch Operations
        </h3>
        <p className="text-sm text-slate-500 mb-6">
          Perform actions on multiple WeChat IDs at once. Enter one WeChat ID per line or separate them with commas.
        </p>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">
              WeChat IDs ({wechatIds.length} parsed)
            </label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="wxid_12345&#10;wxid_67890"
              className="block w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm font-mono"
              rows={6}
              required
            />
          </div>
          
          <div>
            <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Action</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={action === 'verify'}
                  onChange={() => setAction('verify')}
                  className="text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm font-medium text-slate-700">Verify Accounts</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={action === 'blacklist'}
                  onChange={() => setAction('blacklist')}
                  className="text-red-600 focus:ring-red-500"
                />
                <span className="text-sm font-medium text-slate-700">Blacklist Accounts</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Reason (Required)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={`Reason for batch ${action}...`}
              className="block w-full px-4 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              required
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={saving || wechatIds.length === 0 || !reason.trim()}
              className={clsx(
                "w-full py-3 px-4 text-white font-medium rounded-xl shadow-sm transition-colors disabled:opacity-50",
                action === 'verify' ? "bg-indigo-600 hover:bg-indigo-700" : "bg-red-600 hover:bg-red-700"
              )}
            >
              {saving ? 'Processing...' : `Batch ${action === 'verify' ? 'Verify' : 'Blacklist'} ${wechatIds.length} Accounts`}
            </button>
          </div>
        </form>

        {result && (
          <div className={clsx("mt-6 p-4 rounded-xl border", result.success ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200")}>
            <h4 className={clsx("text-sm font-bold mb-1", result.success ? "text-emerald-800" : "text-red-800")}>
              {result.success ? 'Success' : 'Error'}
            </h4>
            <p className={clsx("text-sm", result.success ? "text-emerald-700" : "text-red-700")}>{result.message}</p>
            {result.results && result.results.length > 0 && (
              <div className="mt-3 max-h-40 overflow-y-auto">
                <ul className="text-xs space-y-1">
                  {result.results.map((r, i) => (
                    <li key={i} className={clsx("break-all", r.success ? "text-emerald-600" : "text-red-600")}>
                      <span className="font-mono">{r.wechat_id}</span>: {r.message || (r.success ? 'Success' : 'Failed')}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={confirmOpen}
        title={`Batch ${action === 'verify' ? 'Verify' : 'Blacklist'} Accounts`}
        message={`Are you sure you want to ${action} ${wechatIds.length} accounts?`}
        onConfirm={executeBatchAction}
        onCancel={() => setConfirmOpen(false)}
        confirmText={action === 'verify' ? 'Verify' : 'Blacklist'}
        isDangerous={action === 'blacklist'}
      />
    </div>
  );
}

function SettingsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${__API_ENDPOINT__}/api/admin/preferences`, {
          headers: authHeaders(),
        });
        const data = await res.json();
        if (data.success) {
          setEmail(data.notification_email || '');
          setEnabled(Boolean(data.manual_notification_enabled));
        }
      } catch {
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const trimmedEmail = email.trim();
  const cannotEnableWithoutEmail = enabled && trimmedEmail === '';

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cannotEnableWithoutEmail) return;
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch(`${__API_ENDPOINT__}/api/admin/preferences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          notification_email: trimmedEmail === '' ? null : trimmedEmail,
          manual_notification_enabled: enabled,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setEmail(data.notification_email || '');
        setEnabled(Boolean(data.manual_notification_enabled));
        setStatus({ kind: 'success', text: 'Preferences saved.' });
      } else {
        setStatus({ kind: 'error', text: data.message || 'Failed to save preferences.' });
      }
    } catch {
      setStatus({ kind: 'error', text: 'Failed to save preferences.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <div className="flex items-start gap-3 mb-4">
          <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Notification preferences</h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Get an email when a user submits a new manual verification request.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="text-sm text-slate-500 py-6 text-center">Loading preferences...</div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Notification email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="block w-full px-4 py-2.5 rounded-xl border border-slate-300 shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
              />
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <div className="text-sm font-medium text-slate-900">
                  Email me when a new manual verification request is submitted
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  Unsubscribe by unchecking and saving. Your email is preserved so you can re-enable later.
                </div>
              </div>
            </label>

            {cannotEnableWithoutEmail && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Set a notification email before subscribing.
              </div>
            )}

            {status && (
              <div
                className={clsx(
                  'text-xs rounded-lg px-3 py-2 border',
                  status.kind === 'success'
                    ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                    : 'text-red-700 bg-red-50 border-red-200'
                )}
              >
                {status.text}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving || cannotEnableWithoutEmail}
                className="flex items-center gap-2 py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl shadow-sm transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save preferences'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function AlertDialog({ isOpen, title, message, onClose, icon: Icon = AlertTriangle, iconColor = "text-amber-500", iconBg = "bg-amber-100" }: any) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-sm bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col"
          >
            <div className="p-6 text-center">
              <div className={`mx-auto flex items-center justify-center h-12 w-12 rounded-full ${iconBg} mb-4`}>
                <Icon className={`h-6 w-6 ${iconColor}`} />
              </div>
              <h3 className="text-lg font-medium text-slate-900 mb-2">{title}</h3>
              <p className="text-sm text-slate-500 whitespace-pre-wrap">{message}</p>
            </div>
            <div className="px-6 py-4 bg-slate-50 flex justify-center">
              <button
                onClick={onClose}
                className="w-full inline-flex justify-center rounded-xl border border-transparent shadow-sm px-4 py-2 bg-indigo-600 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none sm:text-sm transition-colors"
              >
                OK
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function ConfirmDialog({ isOpen, title, message, onConfirm, onCancel, confirmText = "Confirm", cancelText = "Cancel", isDangerous = false }: any) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={onCancel}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative w-full max-w-sm bg-white rounded-3xl shadow-xl overflow-hidden flex flex-col"
          >
            <div className="p-6 text-center">
              <div className={`mx-auto flex items-center justify-center h-12 w-12 rounded-full ${isDangerous ? 'bg-red-100' : 'bg-amber-100'} mb-4`}>
                <AlertTriangle className={`h-6 w-6 ${isDangerous ? 'text-red-600' : 'text-amber-600'}`} />
              </div>
              <h3 className="text-lg font-medium text-slate-900 mb-2">{title}</h3>
              <p className="text-sm text-slate-500 whitespace-pre-wrap">{message}</p>
            </div>
            <div className="px-6 py-4 bg-slate-50 flex gap-3 justify-end">
              <button
                onClick={onCancel}
                className="w-full inline-flex justify-center rounded-xl border border-slate-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-slate-700 hover:bg-slate-50 focus:outline-none sm:text-sm transition-colors"
              >
                {cancelText}
              </button>
              <button
                onClick={onConfirm}
                className={`w-full inline-flex justify-center rounded-xl border border-transparent shadow-sm px-4 py-2 text-base font-medium text-white focus:outline-none sm:text-sm transition-colors ${isDangerous ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

interface RowoUser {
  id: string;
  username: string;
  wechat_id: string | null;
  created_at: string;
  last_login_at: string | null;
  last_wechat_change_at: string | null;
  password_changed_at: string | null;
  role: RowoRole;
}

function RowoUsersTab() {
  const [users, setUsers] = useState<RowoUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [actionUser, setActionUser] = useState<RowoUser | null>(null);
  const [actionMode, setActionMode] = useState<'reset' | 'unbind' | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [actionStatus, setActionStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [actionMessage, setActionMessage] = useState('');

  useEffect(() => {
    setPage(1);
  }, [search]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${__API_ENDPOINT__}/api/admin/users`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      if (data.success) setUsers(data.users || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = users.filter((u) => {
    if (!search.trim()) return true;
    const s = search.trim().toLowerCase();
    return (
      u.username.toLowerCase().includes(s) ||
      (u.wechat_id || '').toLowerCase().includes(s) ||
      u.id.toLowerCase().includes(s)
    );
  });
  const pagedUsers = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const closeAction = () => {
    setActionUser(null);
    setActionMode(null);
    setNewPassword('');
    setActionStatus('idle');
    setActionMessage('');
  };

  const submitReset = async () => {
    if (!actionUser || !newPassword) return;
    setActionStatus('loading');
    setActionMessage('');
    try {
      const res = await fetch(
        `${__API_ENDPOINT__}/api/admin/users/${encodeURIComponent(actionUser.id)}/reset-password`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ new_password: newPassword }),
        }
      );
      const data = await res.json();
      if (data.success) {
        setActionStatus('success');
        setActionMessage('Password reset.');
        setTimeout(closeAction, 700);
      } else {
        setActionStatus('error');
        setActionMessage(data.message || 'Could not reset password.');
      }
    } catch {
      setActionStatus('error');
      setActionMessage('Network error.');
    }
  };

  const submitUnbind = async () => {
    if (!actionUser) return;
    setActionStatus('loading');
    setActionMessage('');
    try {
      const res = await fetch(
        `${__API_ENDPOINT__}/api/admin/users/${encodeURIComponent(actionUser.id)}/unbind-wechat`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({}),
        }
      );
      const data = await res.json();
      if (data.success) {
        setActionStatus('success');
        setActionMessage('WeChat ID unbound.');
        await load();
        setTimeout(closeAction, 700);
      } else {
        setActionStatus('error');
        setActionMessage(data.message || 'Could not unbind.');
      }
    } catch {
      setActionStatus('error');
      setActionMessage('Network error.');
    }
  };

  return (
    <div>
      <div className="flex items-center justify-end gap-2 mb-4">
        <button
          onClick={load}
          disabled={loading}
          className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <RotateCcw className={clsx('w-5 h-5', loading && 'animate-spin')} />
        </button>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block w-full sm:w-64 pl-10 pr-3 py-2 border border-slate-300 rounded-lg leading-5 bg-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors"
            placeholder="Search by username or wechat_id..."
          />
        </div>
      </div>

      <div className="bg-white shadow-sm border border-slate-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Username</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Role</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">WeChat ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Created</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Last Login</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Last WeChat Change</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-sm">Loading...</td></tr>
              ) : pagedUsers.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400 text-sm">No users.</td></tr>
              ) : (
                pagedUsers.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-3 text-sm font-medium text-slate-900">@{u.username}</td>
                    <td className="px-4 py-3 text-sm"><RoleBadge role={u.role} /></td>
                    <td className="px-4 py-3 text-sm font-mono text-slate-600">{u.wechat_id || <span className="text-slate-400">—</span>}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{u.created_at ? format(new Date(u.created_at), 'yyyy-MM-dd') : '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{u.last_login_at ? format(new Date(u.last_login_at), 'yyyy-MM-dd') : '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{u.last_wechat_change_at ? format(new Date(u.last_wechat_change_at), 'yyyy-MM-dd') : '—'}</td>
                    <td className="px-4 py-3 text-right text-sm space-x-2">
                      <button
                        onClick={() => { setActionUser(u); setActionMode('reset'); }}
                        className="text-indigo-600 hover:text-indigo-700 font-medium"
                      >
                        Reset password
                      </button>
                      {u.wechat_id && (
                        <button
                          onClick={() => { setActionUser(u); setActionMode('unbind'); }}
                          className="text-amber-600 hover:text-amber-700 font-medium"
                        >
                          Unbind
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalItems={filtered.length} onChange={setPage} />
      </div>

      <AnimatePresence>
        {actionUser && actionMode === 'reset' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
            onClick={closeAction}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-slate-900 mb-1">Reset password for @{actionUser.username}</h3>
              <p className="text-sm text-slate-500 mb-4">Set a new password for this user. They will be able to log in with the new password immediately.</p>
              <input
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="New password (min 10 chars, letter + digit)"
                className="block w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm mb-3"
              />
              {actionStatus === 'error' && (
                <div className="text-sm text-red-700 mb-3">{actionMessage}</div>
              )}
              {actionStatus === 'success' && (
                <div className="text-sm text-emerald-700 mb-3">{actionMessage}</div>
              )}
              <div className="flex gap-2">
                <button onClick={closeAction} className="flex-1 py-2 px-4 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50">Cancel</button>
                <button
                  onClick={submitReset}
                  disabled={actionStatus === 'loading' || !newPassword}
                  className="flex-1 py-2 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-sm font-medium rounded-xl"
                >
                  {actionStatus === 'loading' ? 'Saving...' : 'Reset password'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
        {actionUser && actionMode === 'unbind' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
            onClick={closeAction}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-slate-900 mb-1">Unbind WeChat ID</h3>
              <p className="text-sm text-slate-500 mb-4">
                Remove the WeChat binding from @{actionUser.username} (currently bound to{' '}
                <span className="font-mono">{actionUser.wechat_id}</span>). The wechat_id row in the accounts table is not affected.
              </p>
              {actionStatus === 'error' && (
                <div className="text-sm text-red-700 mb-3">{actionMessage}</div>
              )}
              {actionStatus === 'success' && (
                <div className="text-sm text-emerald-700 mb-3">{actionMessage}</div>
              )}
              <div className="flex gap-2">
                <button onClick={closeAction} className="flex-1 py-2 px-4 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50">Cancel</button>
                <button
                  onClick={submitUnbind}
                  disabled={actionStatus === 'loading'}
                  className="flex-1 py-2 px-4 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-xl"
                >
                  {actionStatus === 'loading' ? 'Unbinding...' : 'Unbind'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const ROLE_LABEL: Record<RowoRole, string> = {
  user: 'user',
  moderator: 'moderator',
  admin: 'admin',
  super_admin: 'super admin',
};

const ROLE_BADGE_CLASS: Record<RowoRole, string> = {
  user: 'bg-slate-100 text-slate-700',
  moderator: 'bg-sky-100 text-sky-700',
  admin: 'bg-indigo-100 text-indigo-700',
  super_admin: 'bg-purple-100 text-purple-700',
};

function RoleBadge({ role }: { role: RowoRole }) {
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', ROLE_BADGE_CLASS[role] || ROLE_BADGE_CLASS.user)}>
      {ROLE_LABEL[role] || role}
    </span>
  );
}

interface RoleSearchResult {
  id: string;
  username: string;
  role: RowoRole;
  role_assigned_by: string | null;
}

interface RoleListEntry {
  id: string;
  username: string;
  role: RowoRole;
  role_assigned_by: string | null;
  role_assigned_at: string | null;
}

function RolesTab({ role, currentUserId }: { role: RowoRole; currentUserId: string }) {
  const isSuper = role === 'super_admin';
  const [loading, setLoading] = useState(true);
  const [moderators, setModerators] = useState<RoleListEntry[]>([]);
  const [admins, setAdmins] = useState<RoleListEntry[]>([]);
  const [myModCount, setMyModCount] = useState(0);
  const [moderatorCap, setModeratorCap] = useState<number | null>(3);

  const [search, setSearch] = useState('');
  const [results, setResults] = useState<RoleSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${__API_ENDPOINT__}/api/admin/roles/list`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setModerators(data.moderators || []);
        setAdmins(data.admins || []);
        setMyModCount(data.my_moderator_count || 0);
        setModeratorCap(data.moderator_cap ?? null);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const q = search.trim();
    if (q.length === 0) {
      setResults([]);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(
          `${__API_ENDPOINT__}/api/admin/roles/search?q=${encodeURIComponent(q)}`,
          { headers: authHeaders() }
        );
        const data = await res.json();
        if (data.success) setResults(data.results || []);
      } catch {
        // ignore
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [search]);

  const assign = async (targetId: string, newRole: 'moderator' | 'admin') => {
    setBusyId(targetId);
    setMessage(null);
    try {
      const res = await fetch(`${__API_ENDPOINT__}/api/admin/roles/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ target_user_id: targetId, role: newRole }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ kind: 'success', text: data.message || 'Assigned.' });
        setSearch('');
        setResults([]);
        await load();
      } else {
        setMessage({ kind: 'error', text: data.message || 'Failed to assign.' });
      }
    } catch {
      setMessage({ kind: 'error', text: 'Network error.' });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (targetId: string) => {
    setBusyId(targetId);
    setMessage(null);
    try {
      const res = await fetch(`${__API_ENDPOINT__}/api/admin/roles/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ target_user_id: targetId }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ kind: 'success', text: data.message || 'Removed.' });
        await load();
      } else {
        setMessage({ kind: 'error', text: data.message || 'Failed to remove.' });
      }
    } catch {
      setMessage({ kind: 'error', text: 'Network error.' });
    } finally {
      setBusyId(null);
    }
  };

  const canAssignAsMod = (r: RoleSearchResult) => {
    if (r.id === currentUserId) return false;
    if (r.role !== 'user') return false;
    if (!isSuper && moderatorCap != null && myModCount >= moderatorCap) return false;
    return true;
  };
  const canAssignAsAdmin = (r: RoleSearchResult) => {
    if (!isSuper) return false;
    if (r.id === currentUserId) return false;
    return r.role === 'user' || r.role === 'moderator';
  };
  const canRemove = (entry: RoleListEntry) => {
    if (entry.id === currentUserId) return false;
    if (entry.role === 'super_admin') return false;
    if (isSuper) return true;
    // admin: can remove only the moderators they themselves assigned
    return entry.role === 'moderator' && entry.role_assigned_by === currentUserId;
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h3 className="text-lg font-bold text-slate-900 mb-2 flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-indigo-600" />
          Assign a role
        </h3>
        <p className="text-sm text-slate-500 mb-4">
          {isSuper
            ? 'Search any ROwO user to promote them to moderator or admin.'
            : `Search any ROwO user to promote them to moderator. You manage ${myModCount} / ${moderatorCap ?? 3} moderators.`}
        </p>
        <div className="relative mb-3">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by ROwO username..."
            className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg bg-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
          />
        </div>
        {message && (
          <div className={clsx(
            'text-sm rounded-lg px-3 py-2 border mb-3',
            message.kind === 'success'
              ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
              : 'text-red-700 bg-red-50 border-red-200'
          )}>
            {message.text}
          </div>
        )}
        {search.trim() && (
          <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
            {searching ? (
              <div className="px-4 py-3 text-sm text-slate-400">Searching...</div>
            ) : results.length === 0 ? (
              <div className="px-4 py-3 text-sm text-slate-400">No matches.</div>
            ) : (
              results.map((r) => (
                <div key={r.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-sm font-medium text-slate-900 truncate">@{r.username}</span>
                    <RoleBadge role={r.role} />
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => assign(r.id, 'moderator')}
                      disabled={busyId === r.id || !canAssignAsMod(r)}
                      className="text-xs font-medium px-3 py-1.5 rounded-lg bg-sky-50 hover:bg-sky-100 text-sky-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Make moderator
                    </button>
                    {isSuper && (
                      <button
                        onClick={() => assign(r.id, 'admin')}
                        disabled={busyId === r.id || !canAssignAsAdmin(r)}
                        className="text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Make admin
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <RolesList
        title={isSuper ? 'All moderators' : 'Your moderators'}
        subtitle={!isSuper ? `${myModCount} / ${moderatorCap ?? 3}` : undefined}
        loading={loading}
        entries={moderators}
        canRemove={canRemove}
        busyId={busyId}
        onRemove={remove}
      />

      {isSuper && (
        <RolesList
          title="All admins"
          loading={loading}
          entries={admins}
          canRemove={canRemove}
          busyId={busyId}
          onRemove={remove}
        />
      )}
    </div>
  );
}

function RolesList({
  title,
  subtitle,
  loading,
  entries,
  canRemove,
  busyId,
  onRemove,
}: {
  title: string;
  subtitle?: string;
  loading: boolean;
  entries: RoleListEntry[];
  canRemove: (entry: RoleListEntry) => boolean;
  busyId: string | null;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Users className="w-5 h-5 text-slate-500" />
          {title}
        </h3>
        {subtitle && <span className="text-sm text-slate-500">{subtitle}</span>}
      </div>
      {loading ? (
        <div className="text-sm text-slate-400 py-6 text-center">Loading...</div>
      ) : entries.length === 0 ? (
        <div className="text-sm text-slate-400 py-6 text-center border border-dashed border-slate-300 rounded-xl">
          No entries.
        </div>
      ) : (
        <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
          {entries.map((entry) => (
            <div key={entry.id} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-sm font-medium text-slate-900 truncate">@{entry.username}</span>
                <RoleBadge role={entry.role} />
                {entry.role_assigned_at && (
                  <span className="text-xs text-slate-400 hidden sm:inline">
                    since {format(new Date(entry.role_assigned_at.endsWith('Z') ? entry.role_assigned_at : entry.role_assigned_at + 'Z'), 'MMM d, yyyy')}
                  </span>
                )}
              </div>
              {canRemove(entry) && (
                <button
                  onClick={() => onRemove(entry.id)}
                  disabled={busyId === entry.id}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 transition-colors flex items-center gap-1 disabled:opacity-40"
                >
                  <UserMinus className="w-3 h-3" /> Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

