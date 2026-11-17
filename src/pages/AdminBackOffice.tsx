import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Activity,
  BarChart3,
  BookOpen,
  Download,
  FileSpreadsheet,
  Layers,
  LogOut,
  Settings,
  Smartphone,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';
import {
  apiFetch,
  formatDateFR,
  formatDateTimeFR,
  formatFCFA,
  paymentStatusLabel,
  withdrawalStatusLabel,
} from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useRouter } from '../lib/router.tsx';
import {
  AdminsRolesTab,
  MobileMoneyProvidersTab,
  OffersAdminTab,
  PinConfirmModal,
  SettingsMaintenanceTab,
  UsersAdminTab,
} from './admin/AdminSubPanels.tsx';

type AdminTab =
  | 'overview'
  | 'offers'
  | 'users'
  | 'transactions'
  | 'payments_mm'
  | 'withdrawals'
  | 'ledger'
  | 'admins'
  | 'audit'
  | 'settings'
  | 'cms'
  | 'reports';

export function AdminBackOffice() {
  const { user, cms, refreshAuth, refreshCms, logout } = useAuth();
  const { navigate } = useRouter();
  const [tab, setTab] = useState<AdminTab>('overview');

  const [overview, setOverview] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [txResult, setTxResult] = useState<{ payments: any[]; transactions: any[] }>({ payments: [], transactions: [] });
  const [providers, setProviders] = useState<any[]>([]);
  const [withdrawalsData, setWithdrawalsData] = useState<{ withdrawals: any[]; dualApprovalThreshold: number }>({
    withdrawals: [],
    dualApprovalThreshold: 500000,
  });
  const [ledger, setLedger] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<{ users: any[]; roles: any[] }>({ users: [], roles: [] });
  const [userSearch, setUserSearch] = useState('');
  const [adminsData, setAdminsData] = useState<{ admins: any[]; adminRoles: any[] }>({ admins: [], adminRoles: [] });
  const [settingsData, setSettingsData] = useState<any>(null);
  const [cmsItems, setCmsItems] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [contactMsgs, setContactMsgs] = useState<any[]>([]);

  const [txFilter, setTxFilter] = useState({
    provider: 'all',
    status: 'all',
    planId: 'all',
    txType: 'all',
    dateFrom: '',
    dateTo: '',
    minAmount: '',
    maxAmount: '',
    q: '',
  });
  const [reportType, setReportType] = useState('transactions');
  const [reportRows, setReportRows] = useState<any[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const [pinModal, setPinModal] = useState<{
    title: string;
    desc: string;
    cb: (pin: string) => Promise<void>;
  } | null>(null);

  const staffRoles = ['super_admin', 'finance', 'compliance', 'support', 'offer_manager', 'auditor', 'analyst'];
  const isAdminAuth = Boolean(user && staffRoles.includes(user.roleCode) && user.isAdminSession);

  const notifyToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4500);
  };

  const requestPin = (title: string, desc: string, cb: (pin: string) => Promise<void>) => {
    setPinModal({ title, desc, cb });
  };

  // Client-side inactivity auto-logout synced with platform_settings
  const lastActivityRef = useRef<number>(Date.now());
  useEffect(() => {
    if (!isAdminAuth) return;
    lastActivityRef.current = Date.now();
    const timeoutMinutes = Math.max(1, Number(cms.platform_settings?.adminInactivityMinutes || 15));
    const resetTimer = () => {
      lastActivityRef.current = Date.now();
    };
    const events = ['mousemove', 'keydown', 'click', 'scroll'];
    events.forEach((ev) => window.addEventListener(ev, resetTimer));

    const handleExpiredEvent = async () => {
      await refreshAuth();
      navigate('/admin/login');
    };
    window.addEventListener('im-admin-expired', handleExpiredEvent);

    const interval = setInterval(async () => {
      if (Date.now() - lastActivityRef.current > timeoutMinutes * 60 * 1000) {
        await logout();
        navigate('/admin/login');
      }
    }, 30_000);

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
      window.removeEventListener('im-admin-expired', handleExpiredEvent);
      clearInterval(interval);
    };
  }, [isAdminAuth, cms.platform_settings?.adminInactivityMinutes, logout, navigate, refreshAuth]);

  const loadTab = useCallback(async () => {
    if (!isAdminAuth) return;
    try {
      if (tab === 'overview') {
        const d = await apiFetch('/api/admin/overview');
        setOverview(d);
      } else if (tab === 'offers') {
        const d = await apiFetch<{ plans: any[] }>('/api/admin/plans');
        setPlans(d.plans || []);
      } else if (tab === 'transactions') {
        const cleanParams: Record<string, string> = {};
        Object.entries(txFilter).forEach(([k, v]) => {
          if (v && v !== 'all') cleanParams[k] = v;
        });
        const qs = new URLSearchParams(cleanParams).toString();
        const [d, p] = await Promise.all([
          apiFetch<{ payments: any[]; transactions: any[] }>(`/api/admin/transactions?${qs}`),
          apiFetch<{ plans: any[] }>('/api/admin/plans'),
        ]);
        setTxResult(d);
        setPlans(p.plans || []);
      } else if (tab === 'payments_mm') {
        const [prov, tx] = await Promise.all([
          apiFetch<{ providers: any[] }>('/api/admin/payment-providers'),
          apiFetch<{ payments: any[]; transactions: any[] }>('/api/admin/transactions'),
        ]);
        setProviders(prov.providers || []);
        setTxResult(tx);
      } else if (tab === 'withdrawals') {
        const d = await apiFetch<{ withdrawals: any[]; dualApprovalThreshold: number }>('/api/admin/withdrawals');
        setWithdrawalsData(d);
      } else if (tab === 'ledger') {
        const d = await apiFetch<{ entries: any[] }>('/api/admin/ledger');
        setLedger(d.entries || []);
      } else if (tab === 'users') {
        const d = await apiFetch<{ users: any[]; roles: any[] }>(`/api/admin/users?q=${encodeURIComponent(userSearch)}`);
        setUsersList(d);
      } else if (tab === 'admins') {
        const d = await apiFetch<{ admins: any[]; adminRoles: any[] }>('/api/admin/admins');
        setAdminsData(d);
      } else if (tab === 'settings') {
        const d = await apiFetch<{ settings: any }>('/api/admin/settings');
        setSettingsData(d.settings);
      } else if (tab === 'cms') {
        const [c, m] = await Promise.all([
          apiFetch<{ items: any[] }>('/api/admin/cms'),
          apiFetch<{ messages: any[] }>('/api/admin/contact-messages'),
        ]);
        setCmsItems(c.items || []);
        setContactMsgs(m.messages || []);
      } else if (tab === 'audit') {
        const d = await apiFetch<{ logs: any[] }>('/api/admin/audit-logs');
        setAuditLogs(d.logs || []);
      } else if (tab === 'reports') {
        const d = await apiFetch<{ rows: any[] }>(`/api/admin/reports?type=${reportType}&format=json`);
        setReportRows(d.rows || []);
      }
    } catch (err: any) {
      if (err?.status === 401) {
        await refreshAuth();
        navigate('/admin/login');
        return;
      }
      notifyToast(err.message);
    }
  }, [isAdminAuth, tab, txFilter, userSearch, reportType, refreshAuth, navigate]);

  useEffect(() => {
    loadTab();
  }, [loadTab]);

  if (!user || !staffRoles.includes(user.roleCode) || !user.isAdminSession) {
    return (
      <div className="min-h-screen bg-slate-950 text-stone-100 flex items-center justify-center px-4">
        <div className="max-w-[520px] w-full bg-slate-900 border border-slate-800 rounded-xl p-8 text-center space-y-4">
          <div className="text-xs font-mono text-emerald-400">MODULE ADMINISTRATION INVESTMARKET</div>
          <h1 className="font-display text-2xl font-bold text-white">Authentification administrateur requise</h1>
          <p className="text-xs text-stone-400 leading-relaxed">
            L’espace d’administration est strictement isolé de l’espace public et nécessite une connexion par identifiant, mot de passe et code PIN personnel.
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate('/admin/login')}
              className="px-5 py-2.5 text-xs font-medium text-white bg-[#0F5132] rounded-lg hover:bg-[#0B3D25] cursor-pointer"
            >
              Connexion Administration InvestMarket
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              className="px-5 py-2.5 text-xs font-medium text-stone-300 border border-slate-700 rounded-lg hover:bg-slate-800 cursor-pointer"
            >
              Retour au site public
            </button>
          </div>
        </div>
      </div>
    );
  }

  const tabs: Array<{ id: AdminTab; label: string; icon: any }> = [
    { id: 'overview', label: 'Tableau de bord', icon: BarChart3 },
    { id: 'offers', label: 'Offres d’investissement', icon: Layers },
    { id: 'users', label: 'Utilisateurs', icon: Users },
    { id: 'transactions', label: 'Transactions', icon: Wallet },
    { id: 'payments_mm', label: 'Flooz / TMoney', icon: Smartphone },
    { id: 'withdrawals', label: 'Retraits', icon: Wallet },
    { id: 'ledger', label: 'Grand Livre', icon: BookOpen },
    { id: 'admins', label: 'Administrateurs & PIN', icon: UserCog },
    { id: 'audit', label: 'Journal d’audit', icon: Activity },
    { id: 'settings', label: 'Paramètres & Maintenance', icon: Settings },
    { id: 'cms', label: 'CMS & Messages', icon: FileSpreadsheet },
    { id: 'reports', label: 'Rapports & Exports', icon: Download },
  ];

  const handleWithdrawalProcess = (w: any, status: string) => {
    const needsPin = status === 'approuve' || status === 'termine';
    if (!needsPin) {
      apiFetch(`/api/admin/withdrawals/${w.id}/process`, {
        method: 'POST',
        body: JSON.stringify({ status, note: `Passage au statut ${status}` }),
      })
        .then(() => {
          notifyToast(`Retrait ${w.reference} mis à jour (${withdrawalStatusLabel(status)}).`);
          loadTab();
        })
        .catch((err) => notifyToast(err.message));
      return;
    }

    requestPin(
      status === 'termine' ? 'Décaissement final du retrait' : 'Validation du retrait',
      `Confirmez avec votre code PIN l’action « ${withdrawalStatusLabel(status)} » sur le retrait ${w.reference} (${formatFCFA(w.amount)}).`,
      async (adminPin) => {
        await apiFetch(`/api/admin/withdrawals/${w.id}/process`, {
          method: 'POST',
          body: JSON.stringify({ status, note: `Action ${status}`, adminPin }),
        });
        notifyToast(`Retrait ${w.reference} traité avec succès.`);
        loadTab();
      }
    );
  };

  return (
    <div className="min-h-screen bg-[#FAF9F6]">
      {/* Isolated Admin Top Bar */}
      <header className="bg-slate-950 text-white border-b border-slate-800 px-4 sm:px-6 h-14 flex items-center justify-between no-print">
        <div className="flex items-center gap-3">
          <span className="font-display text-base font-bold tracking-tight">InvestMarket</span>
          <span className="text-xs font-mono text-emerald-400">· ADMINISTRATION ISOLÉE</span>
        </div>
        <div className="flex items-center gap-4 text-xs">
          {cms.platform_settings?.maintenanceMode && (
            <span className="text-amber-300 font-semibold">MODE MAINTENANCE ACTIF</span>
          )}
          <span className="hidden sm:inline text-stone-400">
            {user.first_name} {user.last_name} ({user.roleName})
          </span>
          <button
            type="button"
            onClick={async () => {
              await logout();
              navigate('/admin/login');
            }}
            className="inline-flex items-center gap-1.5 text-red-300 hover:text-red-200 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Déconnexion</span>
          </button>
        </div>
      </header>

      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <aside className="lg:col-span-3 bg-slate-950 text-stone-200 rounded-xl p-4 space-y-4 no-print">
            <div className="px-2 pb-3 border-b border-slate-800 space-y-1">
              <div className="text-[11px] font-mono text-emerald-400">SESSION SÉCURISÉE PIN</div>
              <div className="font-display text-sm font-semibold text-white">
                {user.first_name} {user.last_name}
              </div>
              <div className="text-xs text-stone-400">Rôle : {user.roleName}</div>
            </div>

            <nav className="space-y-1">
              {tabs.map((item) => {
                const Icon = item.icon;
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs rounded-lg transition-colors cursor-pointer ${
                      active ? 'bg-[#0F5132] text-white font-medium' : 'text-stone-300 hover:bg-slate-900'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => navigate('/')}
                className="w-full px-3 py-2 text-xs text-stone-300 bg-slate-900 border border-slate-800 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                Voir le site public
              </button>
            </div>
          </aside>

          <section className="lg:col-span-9 space-y-6">
            {toast && (
              <div className="p-3.5 bg-slate-900 text-white rounded-lg text-xs font-medium">{toast}</div>
            )}

            {/* 1. OVERVIEW (14 METRICS + ALERTS + RECENT ACTIVITIES) */}
            {tab === 'overview' && overview && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <h1 className="font-display text-2xl font-bold text-slate-900">Tableau de bord administrateur</h1>
                  <button
                    type="button"
                    onClick={async () => {
                      const r = await apiFetch<{ maturedCount: number; remindedCount: number }>('/api/admin/maturity/run', { method: 'POST' });
                      notifyToast(`Contrôle des échéances exécuté : ${r.maturedCount} dénoué(s), ${r.remindedCount} rappel(s).`);
                      loadTab();
                    }}
                    className="px-4 py-2 text-xs font-medium text-white bg-[#0F5132] rounded-lg cursor-pointer"
                  >
                    Contrôler les échéances du jour
                  </button>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  <StatCard label="Utilisateurs inscrits" value={String(overview.stats.usersCount)} />
                  <StatCard label="Investissements actifs" value={String(overview.stats.activeInvestmentsCount)} />
                  <StatCard label="Arrivant à échéance (< 30j)" value={String(overview.stats.maturingSoonCount)} />
                  <StatCard label="Dépôts confirmés" value={formatFCFA(overview.stats.confirmedDeposits)} />
                  <StatCard label="Retraits exécutés" value={formatFCFA(overview.stats.withdrawalsTotal)} />
                  <StatCard label="Transactions en attente" value={String(overview.stats.pendingTransactionsCount)} />
                  <StatCard label={`Paiements Flooz (${overview.stats.floozPaymentsCount})`} value={formatFCFA(overview.stats.floozTotal)} />
                  <StatCard label={`Paiements TMoney (${overview.stats.tmoneyPaymentsCount})`} value={formatFCFA(overview.stats.tmoneyTotal)} />
                  <StatCard label="Offres actuellement actives" value={String(overview.stats.activeOffersCount)} />
                  <StatCard label="Volume des investissements" value={formatFCFA(overview.stats.investmentVolume)} />
                  <StatCard label="Frais plateforme (Ledger)" value={formatFCFA(overview.stats.platformFeesTotal)} />
                  <StatCard label="Offres suspendues / expirées" value={String(overview.stats.expiredOffersCount)} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-3">
                    <h2 className="font-display text-base font-semibold text-slate-900">Alertes de sécurité & anomalies</h2>
                    {overview.recentAlerts?.length === 0 ? (
                      <p className="text-xs text-slate-500">Aucune alerte critique récente.</p>
                    ) : (
                      <div className="divide-y divide-stone-100 text-xs">
                        {overview.recentAlerts.map((a: any) => (
                          <div key={a.id} className="py-2 flex items-center justify-between gap-2">
                            <span className="font-mono text-red-700">{a.action}</span>
                            <span className="text-slate-600 truncate">{a.actor_email || 'externe'}</span>
                            <span className="font-mono text-slate-400 shrink-0">{formatDateTimeFR(a.created_at)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-3">
                    <h2 className="font-display text-base font-semibold text-slate-900">Activités récentes</h2>
                    <div className="divide-y divide-stone-100 text-xs">
                      {overview.recentActivities?.map((a: any) => (
                        <div key={a.id} className="py-2 flex items-center justify-between gap-2">
                          <span className="font-mono text-slate-900">{a.action}</span>
                          <span className="text-slate-600 truncate">{a.actor_email || 'système'}</span>
                          <span className="font-mono text-slate-400 shrink-0">{formatDateTimeFR(a.created_at)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 2. OFFERS */}
            {tab === 'offers' && (
              <OffersAdminTab
                plans={plans}
                requestPin={requestPin}
                onSaved={(msg) => {
                  notifyToast(msg || 'Offre enregistrée.');
                  loadTab();
                }}
              />
            )}

            {/* 3. USERS */}
            {tab === 'users' && (
              <UsersAdminTab
                usersList={usersList}
                searchQuery={userSearch}
                setSearchQuery={setUserSearch}
                onRefresh={loadTab}
                notifyToast={notifyToast}
              />
            )}

            {/* 4. TRANSACTIONS (MULTI-CRITERIA) */}
            {tab === 'transactions' && (
              <div className="space-y-5">
                <h1 className="font-display text-2xl font-bold text-slate-900">Gestion des transactions</h1>

                <div className="bg-white border border-stone-200 rounded-xl p-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3 text-xs">
                  <input
                    placeholder="Réf, utilisateur, SMS..."
                    value={txFilter.q}
                    onChange={(e) => setTxFilter({ ...txFilter, q: e.target.value })}
                    className="col-span-2 sm:col-span-2 px-3 py-1.5 border border-stone-300 rounded-lg"
                  />
                  <select
                    value={txFilter.provider}
                    onChange={(e) => setTxFilter({ ...txFilter, provider: e.target.value })}
                    className="px-3 py-1.5 border border-stone-300 rounded-lg bg-white"
                  >
                    <option value="all">Tous moyens</option>
                    <option value="flooz">Flooz</option>
                    <option value="tmoney">TMoney</option>
                    <option value="bank_transfer">Virement</option>
                  </select>
                  <select
                    value={txFilter.status}
                    onChange={(e) => setTxFilter({ ...txFilter, status: e.target.value })}
                    className="px-3 py-1.5 border border-stone-300 rounded-lg bg-white"
                  >
                    <option value="all">Tous statuts</option>
                    <option value="pending_confirmation">En attente</option>
                    <option value="confirmed">Confirmé</option>
                    <option value="failed">Rejeté / Échoué</option>
                  </select>
                  <select
                    value={txFilter.txType}
                    onChange={(e) => setTxFilter({ ...txFilter, txType: e.target.value })}
                    className="px-3 py-1.5 border border-stone-300 rounded-lg bg-white"
                  >
                    <option value="all">Tous types</option>
                    <option value="deposit">Dépôt</option>
                    <option value="investment">Investissement</option>
                    <option value="withdrawal">Retrait</option>
                    <option value="refund">Remboursement / Échéance</option>
                    <option value="fee">Frais</option>
                  </select>
                  <select
                    value={txFilter.planId}
                    onChange={(e) => setTxFilter({ ...txFilter, planId: e.target.value })}
                    className="px-3 py-1.5 border border-stone-300 rounded-lg bg-white"
                  >
                    <option value="all">Toutes offres</option>
                    {plans.map((pl) => (
                      <option key={pl.id} value={pl.id}>{pl.name}</option>
                    ))}
                  </select>
                  <input type="date" value={txFilter.dateFrom} onChange={(e) => setTxFilter({ ...txFilter, dateFrom: e.target.value })} className="px-3 py-1.5 border border-stone-300 rounded-lg" />
                  <input type="date" value={txFilter.dateTo} onChange={(e) => setTxFilter({ ...txFilter, dateTo: e.target.value })} className="px-3 py-1.5 border border-stone-300 rounded-lg" />
                  <input type="number" placeholder="Montant min" value={txFilter.minAmount} onChange={(e) => setTxFilter({ ...txFilter, minAmount: e.target.value })} className="px-3 py-1.5 font-mono border border-stone-300 rounded-lg" />
                  <input type="number" placeholder="Montant max" value={txFilter.maxAmount} onChange={(e) => setTxFilter({ ...txFilter, maxAmount: e.target.value })} className="px-3 py-1.5 font-mono border border-stone-300 rounded-lg" />
                </div>

                <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-3 overflow-x-auto">
                  <h2 className="font-display text-base font-semibold text-slate-900">Ordres de paiement & Dépôts ({txResult.payments.length})</h2>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-stone-200 text-left text-slate-500">
                        <th className="py-2 pr-3">Référence</th>
                        <th className="py-2 pr-3">Utilisateur</th>
                        <th className="py-2 pr-3">Moyen</th>
                        <th className="py-2 pr-3">Offre / Ordre</th>
                        <th className="py-2 pr-3 text-right">Montant</th>
                        <th className="py-2 pr-3">Statut</th>
                        <th className="py-2 pr-3">Réf. SMS</th>
                        <th className="py-2 text-right">Action Finance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {txResult.payments.map((p) => (
                        <tr key={p.id}>
                          <td className="py-2.5 pr-3 font-mono">{p.payment_reference}</td>
                          <td className="py-2.5 pr-3">{p.user_email}</td>
                          <td className="py-2.5 pr-3 uppercase font-mono">{p.provider_code}</td>
                          <td className="py-2.5 pr-3 font-mono">{p.investment_reference || 'Dépôt solde'}</td>
                          <td className="py-2.5 pr-3 font-mono tabular-nums text-right font-semibold">{formatFCFA(p.total_amount)}</td>
                          <td className={`py-2.5 pr-3 font-medium ${paymentStatusLabel(p.status).tone}`}>{paymentStatusLabel(p.status).text}</td>
                          <td className="py-2.5 pr-3 font-mono text-slate-500">{p.external_reference || '—'}</td>
                          <td className="py-2.5 text-right space-x-1.5">
                            {p.status === 'pending_confirmation' && (
                              <>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await apiFetch(`/api/admin/payments/${p.payment_reference}/reconcile`, {
                                      method: 'POST',
                                      body: JSON.stringify({ status: 'confirmed' }),
                                    });
                                    notifyToast(`Paiement ${p.payment_reference} validé.`);
                                    loadTab();
                                  }}
                                  className="px-2.5 py-1 bg-[#0F5132] text-white rounded text-[11px] cursor-pointer"
                                >
                                  Valider
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await apiFetch(`/api/admin/payments/${p.payment_reference}/reconcile`, {
                                      method: 'POST',
                                      body: JSON.stringify({ status: 'failed', failureReason: 'Rejeté lors du contrôle Finance.' }),
                                    });
                                    notifyToast(`Paiement ${p.payment_reference} rejeté.`);
                                    loadTab();
                                  }}
                                  className="px-2.5 py-1 bg-red-50 text-red-700 border border-red-200 rounded text-[11px] cursor-pointer"
                                >
                                  Rejeter
                                </button>
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-3 overflow-x-auto">
                  <h2 className="font-display text-base font-semibold text-slate-900">Écritures de transactions ({txResult.transactions.length})</h2>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-stone-200 text-left text-slate-500">
                        <th className="py-2 pr-3">Référence</th>
                        <th className="py-2 pr-3">Utilisateur</th>
                        <th className="py-2 pr-3">Type</th>
                        <th className="py-2 pr-3">Description</th>
                        <th className="py-2 pr-3 text-right">Montant</th>
                        <th className="py-2 text-right">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {txResult.transactions.map((t) => (
                        <tr key={t.id}>
                          <td className="py-2 pr-3 font-mono">{t.reference}</td>
                          <td className="py-2 pr-3">{t.user_email}</td>
                          <td className="py-2 pr-3 capitalize">{t.type}</td>
                          <td className="py-2 pr-3 text-slate-700">{t.description}</td>
                          <td className="py-2 pr-3 font-mono tabular-nums text-right font-semibold">{formatFCFA(t.amount)}</td>
                          <td className="py-2 text-right font-mono text-slate-500">{formatDateTimeFR(t.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 5. FLOOZ / TMONEY */}
            {tab === 'payments_mm' && (
              <MobileMoneyProvidersTab
                providers={providers}
                payments={txResult.payments}
                requestPin={requestPin}
                onSavedProvider={() => {
                  notifyToast('Compte officiel de réception mis à jour.');
                  loadTab();
                }}
                onReconcile={async (ref, status) => {
                  await apiFetch(`/api/admin/payments/${ref}/reconcile`, {
                    method: 'POST',
                    body: JSON.stringify({ status }),
                  });
                  notifyToast(`Transfert ${ref} ${status === 'confirmed' ? 'validé' : 'rejeté'}.`);
                  loadTab();
                }}
              />
            )}

            {/* 6. WITHDRAWALS WITH 2-LEVEL APPROVAL */}
            {tab === 'withdrawals' && (
              <div className="space-y-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-slate-900">Gestion des retraits</h1>
                  <p className="text-xs text-slate-500">
                    Workflow : Demandé → Vérification → Approuvé → Traitement → Terminé. Double validation par 2 administrateurs distincts requise à partir de {formatFCFA(withdrawalsData.dualApprovalThreshold)}.
                  </p>
                </div>

                <div className="bg-white border border-stone-200 rounded-xl p-5 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-stone-200 text-left text-slate-500">
                        <th className="py-2 pr-3">Réf.</th>
                        <th className="py-2 pr-3">Client</th>
                        <th className="py-2 pr-3">Bénéficiaire</th>
                        <th className="py-2 pr-3 text-right">Montant</th>
                        <th className="py-2 pr-3">Double validation</th>
                        <th className="py-2 pr-3">Statut</th>
                        <th className="py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {withdrawalsData.withdrawals.map((w) => {
                        const needsDual = Number(w.amount) >= withdrawalsData.dualApprovalThreshold || w.fraud_check_status !== 'clean' || Number(w.requires_dual_approval) === 1;
                        return (
                          <tr key={w.id}>
                            <td className="py-2.5 pr-3 font-mono">{w.reference}</td>
                            <td className="py-2.5 pr-3">{w.user_email}</td>
                            <td className="py-2.5 pr-3 font-mono">{w.method} · {w.beneficiary_account}</td>
                            <td className="py-2.5 pr-3 font-mono tabular-nums text-right font-semibold">{formatFCFA(w.amount)}</td>
                            <td className="py-2.5 pr-3 text-[11px] text-slate-600">
                              {needsDual ? (
                                <div>
                                  <div>1: {w.first_approved_by_email || 'En attente'}</div>
                                  <div>2: {w.second_approved_by_email || 'En attente'}</div>
                                </div>
                              ) : (
                                'Standard'
                              )}
                            </td>
                            <td className="py-2.5 pr-3 font-medium">{withdrawalStatusLabel(w.status)}</td>
                            <td className="py-2.5 text-right space-x-1">
                              {w.status !== 'termine' && w.status !== 'refuse' && (
                                <>
                                  {w.status === 'demande' && (
                                    <button type="button" onClick={() => handleWithdrawalProcess(w, 'en_verification')} className="px-2 py-1 bg-stone-100 rounded text-[11px] cursor-pointer">
                                      Vérifier
                                    </button>
                                  )}
                                  {(!w.second_approved_by && (needsDual || w.status !== 'approuve')) && (
                                    <button type="button" onClick={() => handleWithdrawalProcess(w, 'approuve')} className="px-2 py-1 bg-amber-100 text-amber-900 rounded text-[11px] cursor-pointer">
                                      {needsDual && w.first_approved_by ? 'Approuver (Niv. 2)' : 'Approuver'}
                                    </button>
                                  )}
                                  {w.status === 'approuve' && (
                                    <button type="button" onClick={() => handleWithdrawalProcess(w, 'en_traitement')} className="px-2 py-1 bg-slate-800 text-white rounded text-[11px] cursor-pointer">
                                      Traiter
                                    </button>
                                  )}
                                  <button type="button" onClick={() => handleWithdrawalProcess(w, 'termine')} className="px-2 py-1 bg-[#0F5132] text-white rounded text-[11px] cursor-pointer">
                                    Terminer
                                  </button>
                                  <button type="button" onClick={() => handleWithdrawalProcess(w, 'refuse')} className="px-2 py-1 bg-red-50 text-red-700 border border-red-200 rounded text-[11px] cursor-pointer">
                                    Refuser
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 7. LEDGER */}
            {tab === 'ledger' && (
              <div className="space-y-4">
                <h1 className="font-display text-2xl font-bold text-slate-900">Grand Livre Financier (Ledger immuable)</h1>
                <div className="bg-white border border-stone-200 rounded-xl p-5 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-stone-200 text-left text-slate-500">
                        <th className="py-2 pr-3">Écriture</th>
                        <th className="py-2 pr-3">Transaction</th>
                        <th className="py-2 pr-3">Compte</th>
                        <th className="py-2 pr-3">Sens</th>
                        <th className="py-2 pr-3 text-right">Montant</th>
                        <th className="py-2 pr-3 text-right">Solde après</th>
                        <th className="py-2">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {ledger.map((l) => (
                        <tr key={l.id}>
                          <td className="py-2 pr-3 font-mono">{l.entry_reference}</td>
                          <td className="py-2 pr-3 font-mono text-slate-500">{l.tx_reference}</td>
                          <td className="py-2 pr-3 font-mono font-semibold">{l.account_code}</td>
                          <td className={`py-2 pr-3 font-mono ${l.entry_type === 'CREDIT' ? 'text-[#0F5132]' : 'text-amber-800'}`}>{l.entry_type}</td>
                          <td className="py-2 pr-3 font-mono tabular-nums text-right">{formatFCFA(l.amount)}</td>
                          <td className="py-2 pr-3 font-mono tabular-nums text-right text-slate-700">{formatFCFA(l.balance_after)}</td>
                          <td className="py-2 text-slate-600">{l.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 9. ADMINS, ROLES & PERSONAL PIN */}
            {tab === 'admins' && (
              <AdminsRolesTab
                adminsData={adminsData}
                currentUserRole={user.roleCode}
                requestPin={requestPin}
                notifyToast={notifyToast}
                onSaved={loadTab}
              />
            )}

            {/* 10. IMMUTABLE AUDIT LOGS */}
            {tab === 'audit' && (
              <div className="space-y-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-slate-900">Journal d’audit immuable</h1>
                  <p className="text-xs text-slate-500">
                    Traçabilité complète et inaltérable : administrateur, action, date/heure, entité, ancienne valeur, nouvelle valeur et résultat.
                  </p>
                </div>
                <div className="bg-white border border-stone-200 rounded-xl p-5 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-stone-200 text-left text-slate-500">
                        <th className="py-2 pr-3">Date / Heure</th>
                        <th className="py-2 pr-3">Administrateur</th>
                        <th className="py-2 pr-3">Action</th>
                        <th className="py-2 pr-3">Entité</th>
                        <th className="py-2 pr-3">Ancienne valeur</th>
                        <th className="py-2 pr-3">Nouvelle valeur</th>
                        <th className="py-2">Résultat</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {auditLogs.map((log) => (
                        <tr key={log.id}>
                          <td className="py-2 pr-3 font-mono text-slate-500 whitespace-nowrap">{formatDateTimeFR(log.created_at)}</td>
                          <td className="py-2 pr-3">{log.actor_email || 'système'}</td>
                          <td className="py-2 pr-3 font-mono font-semibold text-slate-900">{log.action}</td>
                          <td className="py-2 pr-3 font-mono">{log.entity_type} #{log.entity_id}</td>
                          <td className="py-2 pr-3 font-mono text-slate-500 max-w-[180px] truncate">{log.old_value_json || '—'}</td>
                          <td className="py-2 pr-3 font-mono text-slate-700 max-w-[180px] truncate">{log.new_value_json || log.details_json || '—'}</td>
                          <td className={`py-2 font-semibold ${log.result === 'échec' ? 'text-red-700' : 'text-[#0F5132]'}`}>
                            {log.result || 'succès'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 11. GENERAL SETTINGS & MAINTENANCE MODE */}
            {tab === 'settings' && (
              <SettingsMaintenanceTab
                settings={settingsData}
                requestPin={requestPin}
                onSaved={async () => {
                  notifyToast('Paramètres généraux mis à jour.');
                  await refreshCms();
                  loadTab();
                }}
              />
            )}

            {/* 12. CMS & CONTACT */}
            {tab === 'cms' && (
              <CmsAdminTab
                items={cmsItems}
                messages={contactMsgs}
                onSaved={async () => {
                  notifyToast('Contenu CMS mis à jour.');
                  await refreshCms();
                  loadTab();
                }}
              />
            )}

            {/* 13. REPORTS */}
            {tab === 'reports' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 no-print">
                  <h1 className="font-display text-2xl font-bold text-slate-900">Rapports & Exportations</h1>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={reportType}
                      onChange={(e) => setReportType(e.target.value)}
                      className="px-3 py-2 text-xs border border-stone-300 rounded-lg bg-white"
                    >
                      <option value="transactions">Transactions & Dépôts</option>
                      <option value="investments">Investissements</option>
                      <option value="withdrawals">Retraits</option>
                      <option value="fees">Frais perçus</option>
                      <option value="maturities">Calendrier des échéances</option>
                    </select>
                    <a
                      href={`/api/admin/reports?type=${reportType}&format=csv`}
                      className="px-4 py-2 text-xs font-medium text-white bg-[#0F5132] rounded-lg"
                    >
                      Télécharger CSV (Excel)
                    </a>
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="px-4 py-2 text-xs font-medium text-slate-900 border border-stone-300 rounded-lg cursor-pointer"
                    >
                      Exporter PDF (Imprimer)
                    </button>
                  </div>
                </div>

                <div className="bg-white border border-stone-200 rounded-xl p-5 overflow-x-auto">
                  {reportRows.length === 0 ? (
                    <p className="text-xs text-slate-500">Aucune donnée pour ce rapport.</p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-stone-200 text-left text-slate-500">
                          {Object.keys(reportRows[0]).map((col) => (
                            <th key={col} className="py-2 pr-3 capitalize">{col.replace(/_/g, ' ')}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {reportRows.map((row, i) => (
                          <tr key={i}>
                            {Object.values(row).map((val: any, j) => (
                              <td key={j} className="py-2 pr-3 font-mono tabular-nums">{String(val ?? '—')}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {pinModal && (
        <PinConfirmModal
          title={pinModal.title}
          description={pinModal.desc}
          onCancel={() => setPinModal(null)}
          onConfirm={async (pin) => {
            await pinModal.cb(pin);
            setPinModal(null);
          }}
        />
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-stone-200 rounded-xl p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 font-mono tabular-nums text-lg font-bold text-slate-900">{value}</div>
    </div>
  );
}

function CmsAdminTab({ items, messages, onSaved }: { items: any[]; messages: any[]; onSaved: () => void }) {
  const [selectedKey, setSelectedKey] = useState<string>('site_identity');
  const current = items.find((i) => i.key === selectedKey);
  const [jsonText, setJsonText] = useState('');

  useEffect(() => {
    if (current) {
      setJsonText(JSON.stringify(JSON.parse(current.content_json), null, 2));
    }
  }, [current]);

  const saveCms = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = JSON.parse(jsonText);
    await apiFetch(`/api/admin/cms/${selectedKey}`, {
      method: 'PUT',
      body: JSON.stringify({ content: parsed }),
    });
    onSaved();
  };

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-slate-900">CMS Interne & Messages</h1>
      <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setSelectedKey(item.key)}
              className={`px-3 py-1.5 text-xs rounded-lg border cursor-pointer ${
                selectedKey === item.key ? 'bg-[#0F5132] text-white border-[#0F5132]' : 'bg-white border-stone-300 text-slate-700'
              }`}
            >
              {item.title}
            </button>
          ))}
        </div>
        <form onSubmit={saveCms} className="space-y-3">
          <textarea
            rows={12}
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            className="w-full p-3 text-xs font-mono border border-stone-300 rounded-lg"
          />
          <button type="submit" className="px-4 py-2 text-xs font-medium text-white bg-[#0F5132] rounded-lg cursor-pointer">
            Enregistrer ce bloc CMS
          </button>
        </form>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-3">
        <h2 className="font-display text-base font-semibold text-slate-900">Messages de contact reçus</h2>
        {messages.length === 0 ? (
          <p className="text-xs text-slate-500">Aucun message reçu.</p>
        ) : (
          <div className="divide-y divide-stone-100 text-xs">
            {messages.map((m) => (
              <div key={m.id} className="py-3 space-y-1">
                <div className="font-semibold text-slate-900">{m.subject} — {m.name} ({m.email})</div>
                <p className="text-slate-600">{m.message}</p>
                <div className="font-mono text-slate-400">{formatDateFR(m.created_at)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
