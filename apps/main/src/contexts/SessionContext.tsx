import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  clearSession,
  fetchMe,
  getSessionToken,
  setSessionToken,
  subscribeSession,
  type BlacklistInfo,
  type SessionUser,
  type SessionVerification,
  type TwoFactorSummary,
} from '@rowo/shared/session';

interface SessionContextValue {
  user: SessionUser | null;
  verification: SessionVerification | null;
  twoFactor: TwoFactorSummary | null;
  blacklist: BlacklistInfo | null;
  loading: boolean;
  refresh: () => Promise<void>;
  signIn: (token: string) => Promise<void>;
  signOut: () => void;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [verification, setVerification] = useState<SessionVerification | null>(null);
  const [twoFactor, setTwoFactor] = useState<TwoFactorSummary | null>(null);
  const [blacklist, setBlacklist] = useState<BlacklistInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(() => Boolean(getSessionToken()));

  const refresh = useCallback(async () => {
    const token = getSessionToken();
    if (!token) {
      setUser(null);
      setVerification(null);
      setTwoFactor(null);
      setBlacklist(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const me = await fetchMe();
    if (me && me.success) {
      setUser(me.user);
      setVerification(me.verification);
      setTwoFactor(me.two_factor ?? null);
      setBlacklist(null);
    } else if (me && me.blacklisted) {
      // Keep session token so the user can read the blocked-account page and
      // sign out deliberately. User profile is cleared because the backend
      // refuses to return it once the bound WeChat ID is blacklisted.
      setUser(null);
      setVerification(null);
      setTwoFactor(null);
      setBlacklist(me.blacklist ?? null);
    } else {
      setUser(null);
      setVerification(null);
      setTwoFactor(null);
      setBlacklist(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
    const unsubscribe = subscribeSession(() => {
      refresh();
    });
    return () => {
      unsubscribe();
    };
  }, [refresh]);

  const signIn = useCallback(async (token: string) => {
    setSessionToken(token);
    await refresh();
  }, [refresh]);

  const signOut = useCallback(() => {
    clearSession();
    setUser(null);
    setVerification(null);
    setTwoFactor(null);
    setBlacklist(null);
  }, []);

  const value: SessionContextValue = {
    user,
    verification,
    twoFactor,
    blacklist,
    loading,
    refresh,
    signIn,
    signOut,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}
