import React, { useState } from 'react';
import { apiFetch, setCsrfToken, setSessionToken } from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useRouter } from '../lib/router.tsx';

export function LoginPage() {
  const { refreshAuth } = useAuth();
  const { navigate } = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 2FA state
  const [twoFaUserId, setTwoFaUserId] = useState<number | null>(null);
  const [twoFaCode, setTwoFaCode] = useState('');
  const [sandbox2FaHint, setSandbox2FaHint] = useState<string | null>(null);

  // Pending account activation state
  const [pendingActivationEmail, setPendingActivationEmail] = useState<string | null>(null);
  const [activationCode, setActivationCode] = useState('');
  const [sandboxActivationHint, setSandboxActivationHint] = useState<string | null>(null);

  // Password recovery state
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryStep, setRecoveryStep] = useState<'request' | 'reset'>('request');
  const [resetEmail, setResetEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [recoveryMsg, setRecoveryMsg] = useState<string | null>(null);

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{
        ok?: boolean;
        role?: string;
        requires2FA?: boolean;
        userId?: number;
        sandbox2FACode?: string;
        sessionToken?: string;
        csrfToken?: string;
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      });

      if (res.requires2FA && res.userId) {
        setTwoFaUserId(res.userId);
        setSandbox2FaHint(res.sandbox2FACode || null);
      } else {
        if (res.sessionToken) setSessionToken(res.sessionToken);
        if (res.csrfToken) setCsrfToken(res.csrfToken);
        await refreshAuth();
        navigate('/dashboard');
      }
    } catch (err: any) {
      if (err?.data?.requiresVerification && err?.data?.email) {
        setPendingActivationEmail(err.data.email);
        setSandboxActivationHint(err.data.sandboxVerificationCode || null);
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const submitPendingActivation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingActivationEmail) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ ok: boolean; sessionToken?: string; csrfToken?: string }>('/api/auth/verify-account', {
        method: 'POST',
        body: JSON.stringify({ email: pendingActivationEmail, code: activationCode }),
      });
      if (res.sessionToken) setSessionToken(res.sessionToken);
      if (res.csrfToken) setCsrfToken(res.csrfToken);
      await refreshAuth();
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const submit2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ ok: boolean; role?: string; sessionToken?: string; csrfToken?: string }>('/api/auth/verify-2fa', {
        method: 'POST',
        body: JSON.stringify({ userId: twoFaUserId, code: twoFaCode }),
      });
      if (res.sessionToken) setSessionToken(res.sessionToken);
      if (res.csrfToken) setCsrfToken(res.csrfToken);
      await refreshAuth();
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setRecoveryMsg(null);
    try {
      const res = await apiFetch<{ message: string; sandboxResetCode?: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: resetEmail }),
      });
      setRecoveryMsg(
        res.sandboxResetCode
          ? `${res.message} Code généré (environnement test) : ${res.sandboxResetCode}`
          : res.message
      );
      setRecoveryStep('reset');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiFetch<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email: resetEmail, code: resetCode, newPassword }),
      });
      setRecoveryMode(false);
      setRecoveryStep('request');
      setRecoveryMsg(res.message);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="max-w-[480px] mx-auto px-4 py-12 lg:py-20 space-y-6">
      <div className="bg-white border border-stone-200 rounded-xl p-6 sm:p-8 space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            {recoveryMode
              ? 'Récupération du mot de passe'
              : twoFaUserId
              ? 'Validation à deux facteurs (2FA)'
              : 'Connexion à InvestMarket'}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Accès sécurisé protégé contre les tentatives répétées et les vols de session.
          </p>
        </div>

        {error && <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{error}</div>}
        {recoveryMsg && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-[#0F5132]">
            {recoveryMsg}
          </div>
        )}

        {recoveryMode ? (
          recoveryStep === 'request' ? (
            <form onSubmit={handleRequestReset} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Adresse e-mail associée</label>
                <input
                  type="email"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-stone-300 rounded-lg"
                />
              </div>
              <button type="submit" className="w-full py-2.5 text-sm font-medium text-white bg-[#0F5132] rounded-lg cursor-pointer">
                Recevoir un code de réinitialisation
              </button>
              <button
                type="button"
                onClick={() => setRecoveryMode(false)}
                className="w-full text-xs text-slate-600 hover:underline cursor-pointer"
              >
                Retour à la connexion
              </button>
            </form>
          ) : (
            <form onSubmit={handleConfirmReset} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Code à 6 chiffres</label>
                <input
                  required
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm font-mono border border-stone-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nouveau mot de passe (min. 8 car.)</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-stone-300 rounded-lg"
                />
              </div>
              <button type="submit" className="w-full py-2.5 text-sm font-medium text-white bg-[#0F5132] rounded-lg cursor-pointer">
                Valider le nouveau mot de passe
              </button>
            </form>
          )
        ) : pendingActivationEmail ? (
          <form onSubmit={submitPendingActivation} className="space-y-4">
            {sandboxActivationHint && (
              <div className="p-3 bg-stone-100 rounded-lg text-xs text-slate-700 font-mono">
                Code d’activation (test) : <strong>{sandboxActivationHint}</strong>
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Code d’activation à 6 chiffres ({pendingActivationEmail})
              </label>
              <input
                required
                value={activationCode}
                onChange={(e) => setActivationCode(e.target.value)}
                placeholder="000000"
                className="w-full px-3.5 py-2.5 text-sm font-mono border border-stone-300 rounded-lg"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 text-sm font-medium text-white bg-[#0F5132] rounded-lg cursor-pointer"
            >
              {loading ? 'Activation...' : 'Activer mon compte et me connecter'}
            </button>
            <button
              type="button"
              onClick={() => {
                setPendingActivationEmail(null);
                setError(null);
              }}
              className="w-full text-xs text-slate-600 hover:underline cursor-pointer"
            >
              Retour à la connexion
            </button>
          </form>
        ) : twoFaUserId ? (
          <form onSubmit={submit2FA} className="space-y-4">
            {sandbox2FaHint && (
              <div className="p-3 bg-stone-100 rounded-lg text-xs text-slate-700 font-mono">
                Code 2FA de vérification (test) : <strong>{sandbox2FaHint}</strong>
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Code de sécurité à 6 chiffres</label>
              <input
                required
                value={twoFaCode}
                onChange={(e) => setTwoFaCode(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm font-mono border border-stone-300 rounded-lg"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 text-sm font-medium text-white bg-[#0F5132] rounded-lg cursor-pointer"
            >
              Valider la connexion
            </button>
          </form>
        ) : (
          <form onSubmit={submitLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">E-mail ou numéro de téléphone</label>
              <input
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="nom@exemple.tg ou +22891234567"
                className="w-full px-3.5 py-2.5 text-sm border border-stone-300 rounded-lg focus:outline-none focus:border-[#0F5132]"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">Mot de passe</label>
                <button
                  type="button"
                  onClick={() => setRecoveryMode(true)}
                  className="text-xs text-[#0F5132] hover:underline cursor-pointer"
                >
                  Mot de passe oublié ?
                </button>
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm border border-stone-300 rounded-lg focus:outline-none focus:border-[#0F5132]"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 text-sm font-medium text-white bg-[#0F5132] rounded-lg hover:bg-[#0B3D25] disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Vérification...' : 'Se connecter'}
            </button>
          </form>
        )}

        <div className="pt-4 border-t border-stone-200 flex flex-col items-center gap-2 text-xs text-slate-600">
          <div>
            Pas encore de compte ?{' '}
            <button
              type="button"
              onClick={() => navigate('/inscription')}
              className="font-semibold text-[#0F5132] hover:underline cursor-pointer"
            >
              Créer un compte
            </button>
          </div>
          <button
            type="button"
            onClick={() => navigate('/admin/login')}
            className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            Administration InvestMarket
          </button>
        </div>
      </div>

      {/* Investor Demo Account Helper */}
      <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-2.5">
        <div className="text-xs font-semibold text-slate-700">Compte investisseur d’évaluation</div>
        <button
          type="button"
          onClick={() => {
            setIdentifier('investisseur@investmarket.tg');
            setPassword('Invest@2026!');
            setError(null);
          }}
          className="w-full text-left p-2.5 rounded-lg border border-stone-200 hover:bg-stone-50 text-xs cursor-pointer"
        >
          <div className="font-semibold text-slate-900">Compte investisseur actif</div>
          <div className="font-mono text-slate-500">investisseur@investmarket.tg · Invest@2026!</div>
        </button>
      </div>
    </div>
  );
}

export function RegisterPage() {
  const { refreshAuth } = useAuth();
  const { navigate } = useRouter();
  const [form, setForm] = useState({
    lastName: '',
    firstName: '',
    email: '',
    phone: '+228',
    country: 'Togo',
    password: '',
    confirmPassword: '',
  });
  const [step, setStep] = useState<'form' | 'verify'>('form');
  const [code, setCode] = useState('');
  const [sandboxHint, setSandboxHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submitRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ sandboxVerificationCode?: string }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setSandboxHint(res.sandboxVerificationCode || null);
      setStep('verify');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const submitVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ ok: boolean; sessionToken?: string; csrfToken?: string }>('/api/auth/verify-account', {
        method: 'POST',
        body: JSON.stringify({ email: form.email, code }),
      });
      if (res.sessionToken) setSessionToken(res.sessionToken);
      if (res.csrfToken) setCsrfToken(res.csrfToken);
      await refreshAuth();
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-[540px] mx-auto px-4 py-12 lg:py-16">
      <div className="bg-white border border-stone-200 rounded-xl p-6 sm:p-8 space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            {step === 'form' ? 'Créer un compte InvestMarket' : 'Activation du compte'}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {step === 'form'
              ? 'Renseignez vos informations pour ouvrir votre espace investisseur.'
              : `Saisissez le code de confirmation généré pour ${form.email}.`}
          </p>
        </div>

        {error && <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{error}</div>}

        {step === 'form' ? (
          <form onSubmit={submitRegister} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nom</label>
                <input
                  required
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-sm border border-stone-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Prénom</label>
                <input
                  required
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-sm border border-stone-300 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Adresse e-mail</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3.5 py-2.5 text-sm border border-stone-300 rounded-lg"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Téléphone (Flooz / TMoney)</label>
                <input
                  required
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+22890123456"
                  className="w-full px-3.5 py-2.5 text-sm font-mono border border-stone-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Pays de résidence</label>
                <select
                  value={form.country}
                  onChange={(e) => setForm({ ...form, country: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-sm border border-stone-300 rounded-lg bg-white"
                >
                  <option value="Togo">Togo</option>
                  <option value="Bénin">Bénin</option>
                  <option value="Côte d'Ivoire">Côte d’Ivoire</option>
                  <option value="Sénégal">Sénégal</option>
                  <option value="Burkina Faso">Burkina Faso</option>
                  <option value="Mali">Mali</option>
                  <option value="Niger">Niger</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Mot de passe (min. 8 car.)</label>
                <input
                  type="password"
                  required
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-sm border border-stone-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Confirmer le mot de passe</label>
                <input
                  type="password"
                  required
                  value={form.confirmPassword}
                  onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-sm border border-stone-300 rounded-lg"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 text-sm font-medium text-white bg-[#0F5132] rounded-lg hover:bg-[#0B3D25] disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Création en cours...' : 'Créer mon compte'}
            </button>
          </form>
        ) : (
          <form onSubmit={submitVerify} className="space-y-4">
            {sandboxHint && (
              <div className="p-3.5 bg-stone-100 border border-stone-200 rounded-lg text-xs text-slate-800">
                Code de confirmation envoyé (environnement test) : <strong className="font-mono">{sandboxHint}</strong>
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Code d’activation à 6 chiffres</label>
              <input
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="000000"
                className="w-full px-3.5 py-2.5 text-sm font-mono border border-stone-300 rounded-lg"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 text-sm font-medium text-white bg-[#0F5132] rounded-lg hover:bg-[#0B3D25] cursor-pointer"
            >
              {loading ? 'Activation...' : 'Activer mon compte'}
            </button>
          </form>
        )}

        <div className="pt-4 border-t border-stone-200 text-center text-xs text-slate-600">
          Déjà inscrit ?{' '}
          <button
            type="button"
            onClick={() => navigate('/connexion')}
            className="font-semibold text-[#0F5132] hover:underline cursor-pointer"
          >
            Se connecter
          </button>
        </div>
      </div>
    </div>
  );
}
