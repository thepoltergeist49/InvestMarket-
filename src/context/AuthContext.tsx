import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { apiFetch, setCsrfToken, setSessionToken } from '../lib/api.ts';
import type { CmsContents, UserProfile } from '../types.ts';

interface AuthContextValue {
  user: UserProfile | null;
  cms: CmsContents;
  loading: boolean;
  refreshAuth: () => Promise<void>;
  refreshCms: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [cms, setCms] = useState<CmsContents>({});
  const [loading, setLoading] = useState(true);

  const refreshAuth = useCallback(async () => {
    try {
      const data = await apiFetch<{ authenticated: boolean; csrfToken?: string; user?: UserProfile }>('/api/auth/me');
      if (data.authenticated && data.user) {
        setCsrfToken(data.csrfToken || null);
        setUser(data.user);
      } else {
        setSessionToken(null);
        setCsrfToken(null);
        setUser(null);
      }
    } catch {
      setSessionToken(null);
      setCsrfToken(null);
      setUser(null);
    }
  }, []);

  const refreshCms = useCallback(async () => {
    try {
      const data = await apiFetch<{ contents: CmsContents }>('/api/cms');
      setCms(data.contents || {});
    } catch {
      // Keep empty fallback
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Clear local session state even if server session was already expired
    } finally {
      setSessionToken(null);
      setCsrfToken(null);
      setUser(null);
    }
  }, []);

  useEffect(() => {
    Promise.all([refreshAuth(), refreshCms()]).finally(() => setLoading(false));
  }, [refreshAuth, refreshCms]);

  return (
    <AuthContext.Provider value={{ user, cms, loading, refreshAuth, refreshCms, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
