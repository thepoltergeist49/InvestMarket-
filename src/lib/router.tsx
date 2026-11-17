import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

interface RouterContextValue {
  path: string;
  navigate: (to: string) => void;
}

const RouterContext = createContext<RouterContextValue | null>(null);

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [path, setPath] = useState<string>(() => window.location.pathname + window.location.hash);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname + window.location.hash);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((to: string) => {
    if (to.startsWith('#')) {
      const el = document.getElementById(to.slice(1));
      if (el) el.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    const [pathname, hash] = to.split('#');
    window.history.pushState({}, '', to);
    setPath(to);
    if (hash) {
      setTimeout(() => {
        const el = document.getElementById(hash);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }, 60);
    } else {
      window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    }
    void pathname;
  }, []);

  return <RouterContext.Provider value={{ path, navigate }}>{children}</RouterContext.Provider>;
}

export function useRouter() {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error('useRouter must be used inside RouterProvider');
  return ctx;
}
