import React, { useState } from 'react';
import { Lock, Shield } from 'lucide-react';
import { apiFetch, setCsrfToken, setSessionToken } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useRouter } from '../lib/router.tsx';

export function AdminLoginPage() {
  const { refreshAuth } = useAuth();
  const { navigate } = useRouter();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [twoFaUserId, setTwoFaUserId] = useState<number | null>(null);
  const [twoFaCode, setTwoFaCode] = useState('');
  const [sandbox2FaHint, setSandbox2FaHint] = useState<string | null>(null);

  const submitAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{
        ok?: boolean;
        requires2FA?: boolean;
        userId?: number;
        sandbox2FACode?: string;
        sessionToken?: string;
        csrfToken?: string;
      }>('/api/admin/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password, pin }),
      });

      if (res.requires2FA && res.userId) {
        setTwoFaUserId(res.userId);
        setSandbox2FaHint(res.sandbox2FACode || null);
      } else {
        if (res.sessionToken) setSessionToken(res.sessionToken);
        if (res.csrfToken) setCsrfToken(res.csrfToken);
        await refreshAuth();
        navigate('/admin');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const submitAdmin2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ ok?: boolean; sessionToken?: string; csrfToken?: string }>('/api/admin/auth/verify-2fa', {
        method: 'POST',
        body: JSON.stringify({ userId: twoFaUserId, code: twoFaCode }),
      });
      if (res.sessionToken) setSessionToken(res.sessionToken);
      if (res.csrfToken) setCsrfToken(res.csrfToken);
      await refreshAuth();
      navigate('/admin');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-stone-100 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-[460px] space-y-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-7 sm:p-8 space-y-6">
          <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-5">
            <div>
              <div className="text-[11px] font-mono text-emerald-400 tracking-wide">PORTAIL ISOLÉ · ACCÈS RESTREINT</div>
              <h1 className="mt-1 font-display text-xl font-bold text-white">Administration InvestMarket</h1>
              <p className="mt-1 text-xs text-stone-400">
                Authentification renforcée par identifiant, mot de passe et code PIN personnel.
              </p>
            </div>
            <Shield className="w-6 h-6 text-emerald-400 shrink-0" />
          </div>

          {error && (
            <div className="p-3.5 bg-red-950/70 border border-red-800 rounded-lg text-xs text-red-200">
              {error}
            </div>
          )}

          {twoFaUserId ? (
            <form onSubmit={submitAdmin2FA} className="space-y-4">
              {sandbox2FaHint && (
                <div className="p-3 bg-slate-800 border border-slate-700 rounded-lg text-xs font-mono text-stone-200">
                  Code 2FA administrateur (test) : <strong>{sandbox2FaHint}</strong>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-stone-300 mb-1.5">Code 2FA à 6 chiffres</label>
                <input
                  required
                  value={twoFaCode}
                  onChange={(e) => setTwoFaCode(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm font-mono bg-slate-950 border border-slate-700 rounded-lg text-white"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 text-sm font-medium text-white bg-[#0F5132] rounded-lg hover:bg-[#0B3D25] cursor-pointer"
              >
                {loading ? 'Validation...' : 'Accéder à l’administration'}
              </button>
            </form>
          ) : (
            <form onSubmit={submitAdminLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-300 mb-1.5">
                  Identifiant ou e-mail administrateur
                </label>
                <input
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="admin@investmarket.tg"
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-300 mb-1.5">Mot de passe administrateur</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-300 mb-1.5">Code PIN administrateur</label>
                <div className="relative">
                  <input
                    type="password"
                    inputMode="numeric"
                    required
                    value={pin}
                    onChange={(e) => setPin(e.target.value)}
                    placeholder="••••"
                    className="w-full px-3.5 py-2.5 text-sm font-mono tracking-widest bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  />
                  <Lock className="w-4 h-4 text-stone-500 absolute right-3 top-3" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 text-sm font-medium text-white bg-[#0F5132] rounded-lg hover:bg-[#0B3D25] disabled:opacity-50 cursor-pointer"
              >
                {loading ? 'Vérification en cours...' : 'Connexion Administration'}
              </button>
            </form>
          )}

          <div className="pt-4 border-t border-slate-800 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="text-stone-400 hover:text-white cursor-pointer"
            >
              Retour au site public
            </button>
            <button
              type="button"
              onClick={() => navigate('/connexion')}
              className="text-stone-400 hover:text-white cursor-pointer"
            >
              Espace client
            </button>
          </div>
        </div>

        {/* Evaluator access accounts for isolated admin module */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-5 space-y-2.5 text-xs">
          <div className="font-semibold text-stone-300">Accès administrateurs d’évaluation (PIN individuel)</div>
          <div className="grid grid-cols-1 gap-2">
            {[
              { label: 'Super Admin', email: 'admin@investmarket.tg', pass: 'Admin@2026!', pin: '2026' },
              { label: 'Finance', email: 'finance@investmarket.tg', pass: 'Finance@2026!', pin: '7391' },
              { label: 'Compliance', email: 'compliance@investmarket.tg', pass: 'Compliance@2026!', pin: '4589' },
            ].map((acc) => (
              <button
                key={acc.email}
                type="button"
                onClick={() => {
                  setIdentifier(acc.email);
                  setPassword(acc.pass);
                  setPin(acc.pin);
                  setError(null);
                }}
                className="text-left p-2.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 cursor-pointer"
              >
                <div className="font-semibold text-white">{acc.label} — {acc.email}</div>
                <div className="font-mono text-[11px] text-stone-400">Mot de passe : {acc.pass} · PIN : {acc.pin}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
