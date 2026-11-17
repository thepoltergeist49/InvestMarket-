import React, { useEffect, useState, useCallback } from 'react';
import { Bell, FileText, Lock, LogOut, User, Wallet } from 'lucide-react';
import {
  apiFetch,
  formatDateFR,
  formatDateTimeFR,
  formatFCFA,
  investmentStatusLabel,
  paymentStatusLabel,
  withdrawalStatusLabel,
} from '../lib/api.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useRouter } from '../lib/router.tsx';

export function InvestorSpace({ activeTab }: { activeTab: string }) {
  const { user, refreshAuth, logout } = useAuth();
  const { navigate } = useRouter();

  const [dash, setDash] = useState<any>(null);
  const [investments, setInvestments] = useState<any[]>([]);
  const [txData, setTxData] = useState<{ transactions: any[]; payments: any[] }>({ transactions: [], payments: [] });
  const [withdrawals, setWithdrawals] = useState<{ withdrawals: any[]; availableBalance: number }>({ withdrawals: [], availableBalance: 0 });
  const [documents, setDocuments] = useState<any[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [providers, setProviders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedDoc, setSelectedDoc] = useState<any | null>(null);
  const [showDepositModal, setShowDepositModal] = useState(false);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(null);
    try {
      const [d, inv, tx, wd, docs, sess, prov] = await Promise.all([
        apiFetch('/api/investor/dashboard'),
        apiFetch<{ investments: any[] }>('/api/investor/investments'),
        apiFetch<{ transactions: any[]; payments: any[] }>('/api/investor/transactions'),
        apiFetch<{ withdrawals: any[]; availableBalance: number }>('/api/investor/withdrawals'),
        apiFetch<{ documents: any[] }>('/api/investor/documents'),
        apiFetch<{ sessions: any[] }>('/api/security/sessions'),
        apiFetch<{ providers: any[] }>('/api/payment-providers'),
      ]);
      setDash(d);
      setInvestments(inv.investments || []);
      setTxData(tx);
      setWithdrawals(wd);
      setDocuments(docs.documents || []);
      setSessions(sess.sessions || []);
      setProviders(prov.providers || []);
    } catch (err: any) {
      setLoadError(err.message || 'Impossible de charger les données de votre espace.');
      if (err?.status === 401) {
        await refreshAuth();
      }
    } finally {
      setLoading(false);
    }
  }, [user, refreshAuth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!user) {
    return (
      <div className="max-w-[600px] mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-slate-900">Espace Investisseur protégé</h1>
        <p className="text-sm text-slate-600">Connectez-vous pour accéder à votre tableau de bord, vos investissements et vos documents.</p>
        <button
          type="button"
          onClick={() => navigate('/connexion')}
          className="px-5 py-2.5 text-sm font-medium text-white bg-[#0F5132] rounded-lg cursor-pointer"
        >
          Se connecter
        </button>
      </div>
    );
  }

  const navItems = [
    { id: 'overview', label: 'Tableau de bord', to: '/dashboard', icon: Wallet },
    { id: 'investments', label: 'Mes investissements', to: '/dashboard/investissements', icon: FileText },
    { id: 'transactions', label: 'Mes transactions', to: '/dashboard/transactions', icon: FileText },
    { id: 'withdrawals', label: 'Retraits', to: '/dashboard/retraits', icon: Wallet },
    { id: 'notifications', label: `Notifications (${user.unreadNotifications || 0})`, to: '/dashboard/notifications', icon: Bell },
    { id: 'profile', label: 'Profil', to: '/dashboard/profil', icon: User },
    { id: 'security', label: 'Sécurité', to: '/dashboard/securite', icon: Lock },
  ];

  return (
    <div className="max-w-[1320px] mx-auto px-4 sm:px-6 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Sidebar */}
        <aside className="lg:col-span-3 bg-white border border-stone-200 rounded-xl p-4 space-y-5 no-print">
          <div className="px-2 pb-4 border-b border-stone-200 space-y-1">
            <div className="font-display text-base font-semibold text-slate-900">
              {user.first_name} {user.last_name}
            </div>
            <div className="text-xs text-slate-500 truncate">{user.email}</div>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(item.to)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg transition-colors cursor-pointer ${
                    active ? 'bg-[#0F5132] text-white font-medium' : 'text-slate-700 hover:bg-stone-100'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="pt-3 border-t border-stone-200 space-y-2">
            {['super_admin', 'finance', 'compliance', 'support', 'offer_manager', 'auditor', 'analyst'].includes(user.roleCode) && (
              <button
                type="button"
                onClick={() => navigate(user.isAdminSession ? '/admin' : '/admin/login')}
                className="w-full px-3 py-2 text-xs font-medium text-slate-900 bg-stone-100 border border-stone-200 rounded-lg hover:bg-stone-200 cursor-pointer"
              >
                Administration InvestMarket
              </button>
            )}
            <button
              type="button"
              onClick={async () => {
                await logout();
                navigate('/');
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50 rounded-lg cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Déconnexion</span>
            </button>
          </div>
        </aside>

        {/* Main Workspace */}
        <section className="lg:col-span-9 space-y-6">
          {loadError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800 flex items-center justify-between gap-3">
              <span>{loadError}</span>
              <button
                type="button"
                onClick={loadData}
                className="px-3 py-1.5 text-xs font-medium bg-white border border-red-200 rounded-lg hover:bg-red-100 cursor-pointer shrink-0"
              >
                Réessayer
              </button>
            </div>
          )}
          {loading && !dash ? (
            <div className="p-12 bg-white border border-stone-200 rounded-xl text-sm text-slate-500">Chargement de votre espace...</div>
          ) : (
            <>
              {activeTab === 'overview' && dash && (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h1 className="font-display text-2xl font-bold text-slate-900">Tableau de bord investisseur</h1>
                      <p className="text-xs text-slate-500">Soldes calculés en temps réel depuis le grand livre financier (FCFA / XOF).</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setShowDepositModal(true)}
                        className="px-4 py-2 text-sm font-medium text-slate-900 bg-white border border-stone-300 rounded-lg hover:bg-stone-50 cursor-pointer"
                      >
                        Effectuer un dépôt (TMoney / Flooz)
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate('/investir')}
                        className="px-4 py-2 text-sm font-medium text-white bg-[#0F5132] rounded-lg hover:bg-[#0B3D25] cursor-pointer"
                      >
                        Nouvel investissement
                      </button>
                    </div>
                  </div>

                  {/* Summary KPIs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white border border-stone-200 rounded-xl p-5">
                      <div className="text-xs text-slate-500">Solde disponible</div>
                      <div className="mt-1 font-mono tabular-nums text-xl font-bold text-[#0F5132]">
                        {formatFCFA(dash.summary.availableBalance)}
                      </div>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-xl p-5">
                      <div className="text-xs text-slate-500">Montant investi actif</div>
                      <div className="mt-1 font-mono tabular-nums text-xl font-bold text-slate-900">
                        {formatFCFA(dash.summary.investedBalance)}
                      </div>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-xl p-5">
                      <div className="text-xs text-slate-500">Investissements actifs</div>
                      <div className="mt-1 font-mono tabular-nums text-xl font-bold text-slate-900">
                        {dash.summary.activeCount}
                      </div>
                    </div>
                    <div className="bg-white border border-stone-200 rounded-xl p-5">
                      <div className="text-xs text-slate-500">Arrivés à échéance</div>
                      <div className="mt-1 font-mono tabular-nums text-xl font-bold text-slate-900">
                        {dash.summary.maturedCount}
                      </div>
                    </div>
                  </div>

                  {/* Pending payments alert if any */}
                  {dash.pendingPayments?.length > 0 && (
                    <div className="bg-white border border-amber-300 rounded-xl p-5 space-y-3">
                      <h2 className="font-display text-sm font-semibold text-slate-900">Dépôts et paiements en attente de validation Finance</h2>
                      {dash.pendingPayments.map((p: any) => (
                        <PendingPaymentRow key={p.id} payment={p} onUpdated={loadData} />
                      ))}
                    </div>
                  )}

                  {/* Recent transactions */}
                  <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="font-display text-base font-semibold text-slate-900">Transactions récentes</h2>
                      <button
                        type="button"
                        onClick={() => navigate('/dashboard/transactions')}
                        className="text-xs font-medium text-[#0F5132] hover:underline cursor-pointer"
                      >
                        Tout voir
                      </button>
                    </div>
                    {dash.recentTransactions.length === 0 ? (
                      <p className="text-xs text-slate-500">Aucune transaction enregistrée pour le moment.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-stone-200 text-left text-slate-500">
                              <th className="py-2 pr-3 font-medium">Référence</th>
                              <th className="py-2 pr-3 font-medium">Type</th>
                              <th className="py-2 pr-3 font-medium">Description</th>
                              <th className="py-2 pr-3 font-medium text-right">Montant</th>
                              <th className="py-2 font-medium text-right">Date</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-100">
                            {dash.recentTransactions.map((t: any) => (
                              <tr key={t.id} className="hover:bg-stone-50">
                                <td className="py-2.5 pr-3 font-mono text-slate-800">{t.reference}</td>
                                <td className="py-2.5 pr-3 capitalize text-slate-600">{t.type}</td>
                                <td className="py-2.5 pr-3 text-slate-700">{t.description}</td>
                                <td className={`py-2.5 pr-3 font-mono tabular-nums text-right font-semibold ${t.direction === 'credit' ? 'text-[#0F5132]' : 'text-slate-900'}`}>
                                  {t.direction === 'credit' ? '+' : '-'}{formatFCFA(t.amount)}
                                </td>
                                <td className="py-2.5 text-right font-mono text-slate-500">{formatDateFR(t.created_at)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'investments' && (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <h1 className="font-display text-2xl font-bold text-slate-900">Mes investissements & Calendrier d’échéances</h1>
                    <button
                      type="button"
                      onClick={() => navigate('/investir')}
                      className="px-4 py-2 text-sm font-medium text-white bg-[#0F5132] rounded-lg cursor-pointer"
                    >
                      Souscrire
                    </button>
                  </div>

                  {investments.length === 0 ? (
                    <div className="bg-white border border-stone-200 rounded-xl p-10 text-center space-y-3">
                      <p className="text-sm text-slate-600">Vous n’avez pas encore d’investissement enregistré.</p>
                      <button
                        type="button"
                        onClick={() => navigate('/investissements')}
                        className="px-4 py-2 text-xs font-medium text-white bg-[#0F5132] rounded-lg cursor-pointer"
                      >
                        Découvrir les offres
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {investments.map((inv) => {
                        const st = investmentStatusLabel(inv.status);
                        return (
                          <div key={inv.id} className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
                            <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-stone-200">
                              <div>
                                <div className="text-xs font-mono text-slate-500">{inv.reference} · Version produit v{inv.plan_version}</div>
                                <h2 className="font-display text-lg font-semibold text-slate-900">{inv.plan_name}</h2>
                              </div>
                              <div className={`text-xs font-semibold ${st.tone}`}>{st.text}</div>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-xs">
                              <div>
                                <div className="text-slate-500">Montant</div>
                                <div className="mt-1 font-mono tabular-nums font-semibold text-slate-900">{formatFCFA(inv.amount)}</div>
                              </div>
                              <div>
                                <div className="text-slate-500">Frais</div>
                                <div className="mt-1 font-mono tabular-nums text-slate-700">{formatFCFA(inv.fee_amount)}</div>
                              </div>
                              <div>
                                <div className="text-slate-500">Durée</div>
                                <div className="mt-1 text-slate-900">{inv.duration_label}</div>
                              </div>
                              <div>
                                <div className="text-slate-500">Date de début</div>
                                <div className="mt-1 font-mono text-slate-700">{formatDateFR(inv.start_date)}</div>
                              </div>
                              <div>
                                <div className="text-slate-500">Date d’échéance</div>
                                <div className="mt-1 font-mono font-semibold text-slate-900">{formatDateFR(inv.end_date)}</div>
                              </div>
                            </div>

                            <div className="text-xs text-slate-600 space-y-1">
                              <p><strong>Règles contractuelles :</strong> {inv.exit_rules_snapshot}</p>
                            </div>

                            {inv.documents?.length > 0 && (
                              <div className="pt-2 flex flex-wrap gap-2">
                                {inv.documents.map((doc: any) => (
                                  <button
                                    key={doc.id}
                                    type="button"
                                    onClick={() => {
                                      const full = documents.find((d) => d.id === doc.id);
                                      setSelectedDoc(full || doc);
                                    }}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 bg-stone-100 border border-stone-200 rounded-lg hover:bg-stone-200 cursor-pointer"
                                  >
                                    <FileText className="w-3.5 h-3.5" />
                                    <span>{doc.title}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Printable Receipt / Statement Viewer */}
                  {selectedDoc && (
                    <div className="bg-white border border-slate-900 rounded-xl p-6 space-y-4">
                      <div className="flex items-center justify-between border-b border-stone-200 pb-3">
                        <div>
                          <div className="text-xs font-mono text-slate-500">{selectedDoc.reference}</div>
                          <h3 className="font-display text-lg font-bold text-slate-900">{selectedDoc.title}</h3>
                        </div>
                        <div className="flex gap-2 no-print">
                          <button
                            type="button"
                            onClick={() => window.print()}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-[#0F5132] rounded-lg cursor-pointer"
                          >
                            Imprimer / PDF
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedDoc(null)}
                            className="px-3 py-1.5 text-xs border border-stone-300 rounded-lg cursor-pointer"
                          >
                            Fermer
                          </button>
                        </div>
                      </div>
                      <pre className="text-xs font-mono bg-[#FAF9F6] p-4 rounded-lg border border-stone-200 overflow-x-auto whitespace-pre-wrap">
                        {JSON.stringify(JSON.parse(selectedDoc.content_json || '{}'), null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'transactions' && (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h1 className="font-display text-2xl font-bold text-slate-900">Historique des opérations & Dépôts</h1>
                    <button
                      type="button"
                      onClick={() => setShowDepositModal(true)}
                      className="px-4 py-2 text-xs font-medium text-white bg-[#0F5132] rounded-lg hover:bg-[#0B3D25] cursor-pointer"
                    >
                      Effectuer un dépôt TMoney / Flooz
                    </button>
                  </div>

                  {txData.payments?.length > 0 && (
                    <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
                      <h2 className="font-display text-base font-semibold text-slate-900">Ordres de paiement & dépôts Mobile Money</h2>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-stone-200 text-left text-slate-500">
                              <th className="py-2 pr-3">Réf. Paiement</th>
                              <th className="py-2 pr-3">Moyen</th>
                              <th className="py-2 pr-3">Réf. SMS transfert</th>
                              <th className="py-2 pr-3">Statut</th>
                              <th className="py-2 pr-3 text-right">Montant</th>
                              <th className="py-2 text-right">Date</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-100">
                            {txData.payments.map((p: any) => (
                              <tr key={p.id}>
                                <td className="py-2.5 pr-3 font-mono">{p.payment_reference}</td>
                                <td className="py-2.5 pr-3 uppercase font-mono">{p.provider_code}</td>
                                <td className="py-2.5 pr-3 font-mono text-slate-600">{p.external_reference || 'Non renseignée'}</td>
                                <td className={`py-2.5 pr-3 font-medium ${paymentStatusLabel(p.status).tone}`}>{paymentStatusLabel(p.status).text}</td>
                                <td className="py-2.5 pr-3 font-mono tabular-nums text-right font-semibold">{formatFCFA(p.total_amount)}</td>
                                <td className="py-2.5 text-right font-mono text-slate-500">{formatDateTimeFR(p.created_at)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
                    <h2 className="font-display text-base font-semibold text-slate-900">Écritures de compte</h2>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-stone-200 text-left text-slate-500">
                            <th className="py-2 pr-3">Référence</th>
                            <th className="py-2 pr-3">Opération</th>
                            <th className="py-2 pr-3">Description</th>
                            <th className="py-2 pr-3">Statut</th>
                            <th className="py-2 pr-3 text-right">Montant</th>
                            <th className="py-2 text-right">Date</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                          {txData.transactions.map((t) => (
                            <tr key={t.id}>
                              <td className="py-2.5 pr-3 font-mono">{t.reference}</td>
                              <td className="py-2.5 pr-3 capitalize">{t.type}</td>
                              <td className="py-2.5 pr-3 text-slate-700">{t.description}</td>
                              <td className="py-2.5 pr-3">{t.status}</td>
                              <td className={`py-2.5 pr-3 font-mono tabular-nums text-right font-semibold ${t.direction === 'credit' ? 'text-[#0F5132]' : 'text-slate-900'}`}>
                                {t.direction === 'credit' ? '+' : '-'}{formatFCFA(t.amount)}
                              </td>
                              <td className="py-2.5 text-right font-mono text-slate-500">{formatDateTimeFR(t.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'withdrawals' && (
                <WithdrawalsSection data={withdrawals} onSuccess={loadData} />
              )}

              {activeTab === 'notifications' && (
                <NotificationsSection
                  notifications={dash?.notifications || []}
                  onUpdated={async () => { await refreshAuth(); await loadData(); }}
                />
              )}

              {activeTab === 'profile' && (
                <ProfileSection user={user} onSaved={refreshAuth} />
              )}

              {activeTab === 'security' && (
                <SecuritySection user={user} sessions={sessions} onUpdated={async () => { await refreshAuth(); await loadData(); }} />
              )}
            </>
          )}
        </section>
      </div>

      {showDepositModal && (
        <DirectDepositModal
          userPhone={user.phone}
          providers={providers}
          onClose={() => setShowDepositModal(false)}
          onSuccess={async () => {
            await loadData();
          }}
        />
      )}
    </div>
  );
}

function WithdrawalsSection({ data, onSuccess }: { data: { withdrawals: any[]; availableBalance: number }; onSuccess: () => void }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Flooz');
  const [beneficiaryAccount, setBeneficiaryAccount] = useState('+228');
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      const res = await apiFetch<{ reference: string }>('/api/investor/withdrawals', {
        method: 'POST',
        body: JSON.stringify({ amount: Number(amount), method, beneficiaryAccount, beneficiaryName }),
      });
      setMsg({ type: 'ok', text: `Demande de retrait ${res.reference} enregistrée et transmise pour contrôle.` });
      setAmount('');
      onSuccess();
    } catch (err: any) {
      setMsg({ type: 'err', text: err.message });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-slate-900">Retraits sécurisés</h1>
        <div className="text-xs font-mono tabular-nums">
          Solde disponible : <strong className="text-[#0F5132]">{formatFCFA(data.availableBalance)}</strong>
        </div>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
        <h2 className="font-display text-base font-semibold text-slate-900">Nouvelle demande de retrait</h2>
        {msg && (
          <div className={`p-3 rounded-lg text-xs border ${msg.type === 'ok' ? 'bg-emerald-50 border-emerald-200 text-[#0F5132]' : 'bg-red-50 border-red-200 text-red-800'}`}>
            {msg.text}
          </div>
        )}
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Montant (FCFA, min. 5 000)</label>
            <input
              type="number"
              min={5000}
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Méthode de retrait</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg bg-white">
              <option value="Flooz">Flooz (Moov Africa Togo)</option>
              <option value="TMoney">TMoney (Togocom)</option>
              <option value="Virement bancaire">Virement bancaire UEMOA</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Numéro ou IBAN bénéficiaire</label>
            <input
              required
              value={beneficiaryAccount}
              onChange={(e) => setBeneficiaryAccount(e.target.value)}
              className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Titulaire du compte bénéficiaire</label>
            <input
              required
              value={beneficiaryName}
              onChange={(e) => setBeneficiaryName(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg"
            />
          </div>
          <div className="sm:col-span-2">
            <button
              type="submit"
              className="px-5 py-2.5 text-sm font-medium text-white bg-[#0F5132] rounded-lg hover:bg-[#0B3D25] cursor-pointer"
            >
              Soumettre la demande de retrait
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-3">
        <h2 className="font-display text-base font-semibold text-slate-900">Suivi des retraits</h2>
        {data.withdrawals.length === 0 ? (
          <p className="text-xs text-slate-500">Aucune demande de retrait.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-stone-200 text-left text-slate-500">
                  <th className="py-2 pr-3">Référence</th>
                  <th className="py-2 pr-3">Méthode</th>
                  <th className="py-2 pr-3">Bénéficiaire</th>
                  <th className="py-2 pr-3 text-right">Montant</th>
                  <th className="py-2 pr-3 text-right">Net</th>
                  <th className="py-2">Statut</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {data.withdrawals.map((w) => (
                  <tr key={w.id}>
                    <td className="py-2.5 pr-3 font-mono">{w.reference}</td>
                    <td className="py-2.5 pr-3">{w.method}</td>
                    <td className="py-2.5 pr-3 font-mono">{w.beneficiary_account}</td>
                    <td className="py-2.5 pr-3 font-mono tabular-nums text-right">{formatFCFA(w.amount)}</td>
                    <td className="py-2.5 pr-3 font-mono tabular-nums text-right font-semibold">{formatFCFA(w.net_amount)}</td>
                    <td className="py-2.5 font-medium">{withdrawalStatusLabel(w.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function NotificationsSection({ notifications, onUpdated }: { notifications: any[]; onUpdated: () => Promise<void> }) {
  const markRead = async (id: number) => {
    await apiFetch(`/api/investor/notifications/${id}/read`, { method: 'PATCH' });
    await onUpdated();
  };
  const markAll = async () => {
    await apiFetch('/api/investor/notifications/read-all', { method: 'POST' });
    await onUpdated();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-slate-900">Notifications</h1>
        <button type="button" onClick={markAll} className="text-xs font-medium text-[#0F5132] hover:underline cursor-pointer">
          Tout marquer comme lu
        </button>
      </div>
      <div className="bg-white border border-stone-200 rounded-xl divide-y divide-stone-200">
        {notifications.length === 0 ? (
          <div className="p-8 text-xs text-slate-500">Aucune notification.</div>
        ) : (
          notifications.map((n) => (
            <div key={n.id} className={`p-5 flex items-start justify-between gap-4 ${n.is_read ? 'opacity-75' : 'bg-[#FAF9F6]'}`}>
              <div className="space-y-1">
                <div className="text-sm font-semibold text-slate-900">{n.title}</div>
                <p className="text-xs text-slate-600">{n.message}</p>
                <div className="text-[11px] font-mono text-slate-400">{formatDateTimeFR(n.created_at)}</div>
              </div>
              {!n.is_read && (
                <button type="button" onClick={() => markRead(n.id)} className="text-xs text-[#0F5132] hover:underline shrink-0 cursor-pointer">
                  Lu
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ProfileSection({ user, onSaved }: { user: any; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({
    firstName: user.first_name || '',
    lastName: user.last_name || '',
    birthDate: user.birth_date || '',
    address: user.address || '',
    city: user.city || '',
    country: user.country || 'Togo',
    profession: user.profession || '',
  });
  const [saved, setSaved] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    await apiFetch('/api/investor/profile', { method: 'PUT', body: JSON.stringify(form) });
    await onSaved();
    setSaved(true);
  };

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-5">
      <h1 className="font-display text-2xl font-bold text-slate-900">Mon profil</h1>
      {saved && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-[#0F5132]">Profil enregistré.</div>}
      <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Prénom</label>
          <input required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Nom</label>
          <input required value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Date de naissance</label>
          <input type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Profession</label>
          <input value={form.profession} onChange={(e) => setForm({ ...form, profession: e.target.value })} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Ville</label>
          <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">Pays</label>
          <input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-slate-700 mb-1">Adresse</label>
          <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="w-full px-3 py-2 text-sm border border-stone-300 rounded-lg" />
        </div>
        <div className="sm:col-span-2">
          <button type="submit" className="px-5 py-2.5 text-sm font-medium text-white bg-[#0F5132] rounded-lg cursor-pointer">
            Enregistrer les modifications
          </button>
        </div>
      </form>
    </div>
  );
}

function SecuritySection({ user, sessions, onUpdated }: { user: any; sessions: any[]; onUpdated: () => Promise<void> }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const changePwd = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch<{ message: string }>('/api/security/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    setMsg(res.message);
    setCurrentPassword('');
    setNewPassword('');
  };

  const toggle2fa = async () => {
    await apiFetch('/api/security/2fa/toggle', {
      method: 'POST',
      body: JSON.stringify({ enable: user.two_factor_enabled !== 1 }),
    });
    await onUpdated();
  };

  const revokeSession = async (id: number) => {
    await apiFetch(`/api/security/sessions/${id}`, { method: 'DELETE' });
    await onUpdated();
  };

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-bold text-slate-900">Sécurité & Sessions</h1>

      <div className="bg-white border border-stone-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-900">Authentification à deux facteurs (2FA)</h2>
          <p className="text-xs text-slate-600">
            Statut actuel : <strong>{user.two_factor_enabled === 1 ? 'Activée' : 'Désactivée'}</strong>
          </p>
        </div>
        <button
          type="button"
          onClick={toggle2fa}
          className="px-4 py-2 text-xs font-medium text-white bg-[#0F5132] rounded-lg cursor-pointer"
        >
          {user.two_factor_enabled === 1 ? 'Désactiver la 2FA' : 'Activer la 2FA'}
        </button>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-4">
        <h2 className="font-display text-base font-semibold text-slate-900">Changer de mot de passe</h2>
        {msg && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-[#0F5132]">{msg}</div>}
        <form onSubmit={changePwd} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input
            type="password"
            required
            placeholder="Mot de passe actuel"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="px-3 py-2 text-sm border border-stone-300 rounded-lg"
          />
          <input
            type="password"
            required
            placeholder="Nouveau mot de passe (min. 8 car.)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="px-3 py-2 text-sm border border-stone-300 rounded-lg"
          />
          <div className="sm:col-span-2">
            <button type="submit" className="px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg cursor-pointer">
              Mettre à jour le mot de passe
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-3">
        <h2 className="font-display text-base font-semibold text-slate-900">Sessions actives & Historique de connexion</h2>
        <div className="divide-y divide-stone-100 text-xs">
          {sessions.map((s) => (
            <div key={s.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-mono text-slate-800">{s.ip_address || '127.0.0.1'} {s.is_current ? '(Session actuelle)' : ''}</div>
                <div className="text-slate-500 truncate max-w-md">{s.user_agent}</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-slate-500">{formatDateTimeFR(s.created_at)}</span>
                {!s.revoked_at && !s.is_current && (
                  <button type="button" onClick={() => revokeSession(s.id)} className="text-red-700 hover:underline cursor-pointer">
                    Révoquer
                  </button>
                )}
                {s.revoked_at && <span className="text-slate-400">Révoquée</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function PendingPaymentRow({ payment, onUpdated }: { payment: any; onUpdated: () => Promise<void> }) {
  const [refInput, setRefInput] = useState(payment.external_reference || '');
  const [saving, setSaving] = useState(false);

  const submitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refInput.trim()) return;
    setSaving(true);
    try {
      await apiFetch(`/api/payments/${payment.payment_reference}/submit-proof`, {
        method: 'POST',
        body: JSON.stringify({ externalReference: refInput.trim() }),
      });
      await onUpdated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-t border-stone-200 pt-3 space-y-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono">{payment.payment_reference} · {payment.provider_code.toUpperCase()}</span>
        <span className="font-mono tabular-nums font-semibold">{formatFCFA(payment.total_amount)}</span>
        <span className="text-amber-700">{paymentStatusLabel(payment.status).text}</span>
      </div>
      <form onSubmit={submitProof} className="flex flex-wrap gap-2">
        <input
          value={refInput}
          onChange={(e) => setRefInput(e.target.value)}
          placeholder="Référence SMS transfert (ex. MP...)"
          className="flex-1 min-w-[200px] px-3 py-1.5 font-mono border border-stone-300 rounded-lg"
        />
        <button
          type="submit"
          disabled={saving}
          className="px-3 py-1.5 bg-[#0F5132] text-white rounded-lg cursor-pointer"
        >
          {saving ? 'Envoi...' : 'Mettre à jour la réf. SMS'}
        </button>
      </form>
    </div>
  );
}

function DirectDepositModal({
  userPhone,
  providers,
  onClose,
  onSuccess,
}: {
  userPhone: string;
  providers: any[];
  onClose: () => void;
  onSuccess: () => Promise<void>;
}) {
  const mmProviders = providers.filter((p) => p.code === 'tmoney' || p.code === 'flooz');
  const [providerCode, setProviderCode] = useState<'tmoney' | 'flooz'>('tmoney');
  const [amount, setAmount] = useState('25000');
  const [phoneNumber, setPhoneNumber] = useState(userPhone || '+228');
  const [externalReference, setExternalReference] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<any>(null);

  const selected = mmProviders.find((p) => p.code === providerCode);
  const officialNumber = selected?.receiving_account || (providerCode === 'tmoney' ? '93736916' : '97172729');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/investor/deposits', {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(amount),
          providerCode,
          phoneNumber,
          externalReference: externalReference.trim() || undefined,
        }),
      });
      setCreated(res);
      await onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
      <div className="bg-white border border-stone-200 rounded-xl max-w-[520px] w-full p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-stone-200 pb-3">
          <h2 className="font-display text-lg font-bold text-slate-900">Effectuer un dépôt Mobile Money</h2>
          <button type="button" onClick={onClose} className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer">
            Fermer
          </button>
        </div>

        {created ? (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-[#0F5132] space-y-1.5">
              <div className="font-semibold">Demande de dépôt enregistrée ({created.payment?.payment_reference})</div>
              <p>
                Envoyez <strong>{formatFCFA(created.payment?.total_amount)}</strong> vers le numéro officiel{' '}
                <strong className="font-mono">{created.receivingAccount}</strong>. Le service Finance créditera votre solde disponible dès vérification.
              </p>
            </div>
            <button type="button" onClick={onClose} className="w-full py-2.5 text-xs font-medium text-white bg-[#0F5132] rounded-lg cursor-pointer">
              Fermer
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 text-xs">
            {error && <div className="p-3 bg-red-50 border border-red-200 rounded text-red-800">{error}</div>}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setProviderCode('tmoney')}
                className={`p-3 rounded-xl border text-left cursor-pointer ${providerCode === 'tmoney' ? 'border-[#0F5132] bg-[#0F5132]/5' : 'border-stone-200'}`}
              >
                <div className="font-semibold text-slate-900">TMoney (Togocom)</div>
                <div className="font-mono text-sm font-bold text-[#0F5132] mt-0.5">93 73 69 16</div>
              </button>
              <button
                type="button"
                onClick={() => setProviderCode('flooz')}
                className={`p-3 rounded-xl border text-left cursor-pointer ${providerCode === 'flooz' ? 'border-[#0F5132] bg-[#0F5132]/5' : 'border-stone-200'}`}
              >
                <div className="font-semibold text-slate-900">Flooz (Moov Africa)</div>
                <div className="font-mono text-sm font-bold text-[#0F5132] mt-0.5">97 17 27 29</div>
              </button>
            </div>

            <div className="p-3.5 bg-[#FAF9F6] border border-stone-200 rounded-lg text-slate-700">
              Numéro officiel de réception : <strong className="font-mono text-slate-900">{officialNumber}</strong>. Transférez le montant souhaité puis déclarez l’opération ci-dessous.
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Montant du dépôt (FCFA, min. 1 000)</label>
              <input type="number" min={1000} required value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Votre numéro d’envoi</label>
              <input required value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg" />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Référence SMS du transfert (optionnel)</label>
              <input value={externalReference} onChange={(e) => setExternalReference(e.target.value)} placeholder="Ex. ID transaction SMS" className="w-full px-3 py-2 text-sm font-mono border border-stone-300 rounded-lg" />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 text-sm font-medium text-white bg-[#0F5132] rounded-lg hover:bg-[#0B3D25] disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Enregistrement...' : 'Enregistrer le dépôt'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
