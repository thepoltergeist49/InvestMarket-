import React, { useEffect, useState } from 'react';
import { CheckCircle2, Clock, Copy, ShieldAlert, XCircle } from 'lucide-react';
import { apiFetch, formatDateFR, formatFCFA, paymentStatusLabel } from '../lib/api.ts';
import type { CalculatorResult, InvestmentPlan, PaymentProvider } from '../types.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useRouter } from '../lib/router.tsx';

export function InvestCheckoutPage({ initialSlug }: { initialSlug?: string }) {
  const { user, refreshAuth } = useAuth();
  const { navigate } = useRouter();

  const [plans, setPlans] = useState<InvestmentPlan[]>([]);
  const [providers, setProviders] = useState<PaymentProvider[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedPlanId, setSelectedPlanId] = useState<number>(0);
  const [selectedDurationId, setSelectedDurationId] = useState<number>(0);
  const [amount, setAmount] = useState<string>('50000');
  const [calc, setCalc] = useState<CalculatorResult | null>(null);
  const [calcError, setCalcError] = useState<string | null>(null);

  const [step, setStep] = useState<'configure' | 'review' | 'payment' | 'waiting'>('configure');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [providerCode, setProviderCode] = useState<string>('tmoney');
  const [phoneNumber, setPhoneNumber] = useState<string>(user?.phone || '+228');
  const [externalReference, setExternalReference] = useState<string>('');
  const [idempotencyKey] = useState<string>(() => `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);

  const [checkoutRes, setCheckoutRes] = useState<any>(null);
  const [livePayment, setLivePayment] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [proofRefInput, setProofRefInput] = useState('');
  const [proofMsg, setProofMsg] = useState<string | null>(null);
  const [copiedNum, setCopiedNum] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paramAmount = params.get('amount');
    const paramDur = params.get('durationId');

    Promise.all([
      apiFetch<{ plans: InvestmentPlan[] }>('/api/plans'),
      apiFetch<{ providers: PaymentProvider[] }>('/api/payment-providers'),
    ])
      .then(([pData, provData]) => {
        const list = pData.plans || [];
        setPlans(list);
        setProviders(provData.providers || []);

        const matched = initialSlug ? list.find((x) => x.slug === initialSlug) : list[0];
        const plan = matched || list[0];
        if (plan) {
          setSelectedPlanId(plan.id);
          const dur = paramDur && plan.durations.some((d) => d.id === Number(paramDur)) ? Number(paramDur) : plan.durations[0]?.id || 0;
          setSelectedDurationId(dur);
          setAmount(paramAmount || String(plan.min_amount));
        }
      })
      .finally(() => setLoading(false));
  }, [initialSlug]);

  useEffect(() => {
    if (user?.phone) setPhoneNumber(user.phone);
  }, [user]);

  const currentPlan = plans.find((p) => p.id === selectedPlanId);
  const selectedProvider = providers.find((p) => p.code === providerCode);

  useEffect(() => {
    if (!currentPlan) return;
    if (!currentPlan.durations.some((d) => d.id === selectedDurationId)) {
      setSelectedDurationId(currentPlan.durations[0]?.id || 0);
    }
  }, [currentPlan, selectedDurationId]);

  useEffect(() => {
    if (!selectedPlanId || !selectedDurationId || !amount) return;
    const t = setTimeout(async () => {
      setCalcError(null);
      try {
        const res = await apiFetch<CalculatorResult>('/api/calculator', {
          method: 'POST',
          body: JSON.stringify({ planId: selectedPlanId, durationId: selectedDurationId, amount: Number(amount) }),
        });
        setCalc(res);
      } catch (err: any) {
        setCalcError(err.message);
        setCalc(null);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [selectedPlanId, selectedDurationId, amount]);

  // Poll payment status while waiting for Finance confirmation
  useEffect(() => {
    if (step !== 'waiting' || !checkoutRes?.payment?.payment_reference) return;
    const ref = checkoutRes.payment.payment_reference;
    const interval = setInterval(async () => {
      try {
        const res = await apiFetch<{ payment: any }>(`/api/payments/${ref}/status`);
        setLivePayment(res.payment);
        if (res.payment.status === 'confirmed' || res.payment.status === 'failed') {
          refreshAuth();
          clearInterval(interval);
        }
      } catch {
        // ignore transient poll
      }
    }, 3500);
    return () => clearInterval(interval);
  }, [step, checkoutRes, refreshAuth]);

  const handleInitiatePayment = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch<any>('/api/investments/checkout', {
        method: 'POST',
        body: JSON.stringify({
          planId: selectedPlanId,
          durationId: selectedDurationId,
          amount: Number(amount),
          providerCode,
          phoneNumber,
          externalReference: externalReference.trim() || undefined,
          idempotencyKey,
          acceptedTerms,
        }),
      });
      setCheckoutRes(res);
      setLivePayment(res.payment);
      setProofRefInput(res.payment?.external_reference || externalReference || '');
      setStep('waiting');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutRes?.payment?.payment_reference || !proofRefInput.trim()) return;
    setProofMsg(null);
    setError(null);
    try {
      const res = await apiFetch<{ payment: any }>(`/api/payments/${checkoutRes.payment.payment_reference}/submit-proof`, {
        method: 'POST',
        body: JSON.stringify({ externalReference: proofRefInput.trim(), phoneNumber }),
      });
      setLivePayment(res.payment);
      setProofMsg('Votre référence de transfert SMS a bien été enregistrée pour validation par le service Finance.');
    } catch (err: any) {
      setError(err.message);
    }
  };

  const copyAccount = (val?: string) => {
    if (!val) return;
    navigator.clipboard?.writeText(val);
    setCopiedNum(true);
    setTimeout(() => setCopiedNum(false), 2000);
  };

  if (loading) {
    return <div className="max-w-[900px] mx-auto px-4 py-16 text-sm text-slate-500">Préparation du tunnel de souscription...</div>;
  }

  if (!user) {
    return (
      <div className="max-w-[640px] mx-auto px-4 py-16">
        <div className="bg-white border border-stone-200 rounded-xl p-8 space-y-4">
          <h1 className="font-display text-2xl font-bold text-slate-900">Connexion requise pour souscrire</h1>
          <p className="text-sm text-slate-600">
            Pour créer un ordre d’investissement et régler par transfert vers TMoney (93736916) ou Flooz (97172729), connectez-vous à votre compte InvestMarket.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => navigate('/connexion')}
              className="px-5 py-2.5 text-sm font-medium text-white bg-[#0F5132] rounded-lg cursor-pointer"
            >
              Se connecter
            </button>
            <button
              type="button"
              onClick={() => navigate('/inscription')}
              className="px-5 py-2.5 text-sm font-medium text-slate-900 border border-stone-300 rounded-lg cursor-pointer"
            >
              Créer un compte
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[920px] mx-auto px-4 sm:px-6 py-10 lg:py-14 space-y-8">
      <div className="space-y-2">
        <p className="text-xs font-semibold text-[#0F5132]">SOUSCRIPTION SÉCURISÉE</p>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">Processus d’investissement</h1>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 pt-1">
          <span className={step === 'configure' ? 'font-semibold text-slate-900' : ''}>1. Offre & Montant</span>
          <span>·</span>
          <span className={step === 'review' ? 'font-semibold text-slate-900' : ''}>2. Récapitulatif & Risques</span>
          <span>·</span>
          <span className={step === 'payment' ? 'font-semibold text-slate-900' : ''}>3. Dépôt TMoney / Flooz</span>
          <span>·</span>
          <span className={step === 'waiting' ? 'font-semibold text-slate-900' : ''}>4. Validation Finance</span>
        </div>
      </div>

      {error && <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">{error}</div>}

      {step === 'configure' && (
        <div className="bg-white border border-stone-200 rounded-xl p-6 sm:p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Offre d’investissement</label>
              <select
                value={selectedPlanId}
                onChange={(e) => setSelectedPlanId(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 text-sm border border-stone-300 rounded-lg bg-white"
              >
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (min. {formatFCFA(p.min_amount)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">Durée</label>
              <select
                value={selectedDurationId}
                onChange={(e) => setSelectedDurationId(Number(e.target.value))}
                className="w-full px-3.5 py-2.5 text-sm border border-stone-300 rounded-lg bg-white"
              >
                {currentPlan?.durations.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Montant à investir (FCFA / XOF)</label>
            <input
              type="number"
              min={currentPlan?.min_amount}
              max={currentPlan?.max_amount}
              step={currentPlan?.step_amount || 5000}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3.5 py-2.5 text-base font-mono tabular-nums border border-stone-300 rounded-lg"
            />
            {calcError && <p className="mt-2 text-xs text-red-700">{calcError}</p>}
          </div>

          {calc && (
            <div className="p-5 bg-[#FAF9F6] border border-stone-200 rounded-lg grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
              <div>
                <div className="text-slate-500">Montant</div>
                <div className="mt-1 font-mono tabular-nums font-semibold text-slate-900">{formatFCFA(calc.amount)}</div>
              </div>
              <div>
                <div className="text-slate-500">Frais</div>
                <div className="mt-1 font-mono tabular-nums font-semibold text-slate-900">{formatFCFA(calc.feeAmount)}</div>
              </div>
              <div>
                <div className="text-slate-500">Total à régler</div>
                <div className="mt-1 font-mono tabular-nums font-semibold text-[#0F5132]">{formatFCFA(calc.totalAmount)}</div>
              </div>
              <div>
                <div className="text-slate-500">Échéance prévisionnelle</div>
                <div className="mt-1 font-mono tabular-nums font-semibold text-slate-900">{formatDateFR(calc.estimatedMaturityDate)}</div>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              disabled={!calc || Boolean(calcError)}
              onClick={() => setStep('review')}
              className="px-6 py-2.5 text-sm font-medium text-white bg-[#0F5132] rounded-lg hover:bg-[#0B3D25] disabled:opacity-50 cursor-pointer"
            >
              Continuer vers le récapitulatif
            </button>
          </div>
        </div>
      )}

      {step === 'review' && calc && (
        <div className="bg-white border border-stone-200 rounded-xl p-6 sm:p-8 space-y-6">
          <h2 className="font-display text-xl font-semibold text-slate-900">Vérification des conditions et des risques</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm border-y border-stone-200 py-5">
            <div><span className="text-slate-500">Produit :</span> <strong>{calc.plan.name}</strong></div>
            <div><span className="text-slate-500">Durée :</span> <strong>{calc.duration.label}</strong></div>
            <div><span className="text-slate-500">Capital investi :</span> <strong className="font-mono tabular-nums">{formatFCFA(calc.amount)}</strong></div>
            <div><span className="text-slate-500">Frais appliqués :</span> <strong className="font-mono tabular-nums">{formatFCFA(calc.feeAmount)}</strong></div>
            <div><span className="text-slate-500">Total à payer :</span> <strong className="font-mono tabular-nums text-[#0F5132]">{formatFCFA(calc.totalAmount)}</strong></div>
            <div><span className="text-slate-500">Échéance estimée :</span> <strong className="font-mono tabular-nums">{formatDateFR(calc.estimatedMaturityDate)}</strong></div>
          </div>

          <div className="space-y-3 text-xs text-slate-700 leading-relaxed">
            <p><strong>Conditions du produit :</strong> {calc.plan.conditionsText}</p>
            <p><strong>Règles de sortie :</strong> {calc.plan.exitRules}</p>
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0" />
              <p>{calc.disclaimer}</p>
            </div>
          </div>

          <label className="flex items-start gap-3 text-xs text-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              className="mt-0.5 rounded border-stone-300"
            />
            <span>
              Je reconnais avoir pris connaissance des conditions contractuelles, des frais en FCFA, de la durée d’immobilisation et des risques de perte en capital non garantis.
            </span>
          </label>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep('configure')}
              className="px-4 py-2 text-sm text-slate-700 border border-stone-300 rounded-lg cursor-pointer"
            >
              Modifier
            </button>
            <button
              type="button"
              disabled={!acceptedTerms}
              onClick={() => setStep('payment')}
              className="px-6 py-2.5 text-sm font-medium text-white bg-[#0F5132] rounded-lg hover:bg-[#0B3D25] disabled:opacity-50 cursor-pointer"
            >
              Confirmer et choisir le paiement
            </button>
          </div>
        </div>
      )}

      {step === 'payment' && calc && (
        <div className="bg-white border border-stone-200 rounded-xl p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-stone-200">
            <h2 className="font-display text-xl font-semibold text-slate-900">Dépôt direct en FCFA</h2>
            <span className="font-mono tabular-nums text-lg font-bold text-[#0F5132]">{formatFCFA(calc.totalAmount)}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {providers.map((prov) => (
              <button
                key={prov.code}
                type="button"
                onClick={() => setProviderCode(prov.code)}
                className={`text-left p-4 rounded-xl border transition-colors cursor-pointer ${
                  providerCode === prov.code
                    ? 'border-[#0F5132] bg-[#0F5132]/5'
                    : 'border-stone-200 hover:border-stone-300 bg-white'
                }`}
              >
                <div className="font-display text-sm font-semibold text-slate-900">{prov.name}</div>
                <div className="mt-1 text-xs font-mono text-[#0F5132] font-semibold">
                  {prov.receiving_account || 'Numéro officiel'}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">{prov.country} · {prov.currency}</div>
              </button>
            ))}
          </div>

          {selectedProvider && (
            <div className="p-5 bg-[#FAF9F6] border border-stone-200 rounded-xl space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-slate-500">Numéro / Compte officiel de réception InvestMarket</div>
                  <div className="mt-1 font-mono text-2xl font-bold tracking-tight text-slate-900">
                    {selectedProvider.receiving_account || (providerCode === 'tmoney' ? '93736916' : '97172729')}
                  </div>
                  <div className="text-xs text-slate-600">{selectedProvider.receiving_name}</div>
                </div>
                <button
                  type="button"
                  onClick={() => copyAccount(selectedProvider.receiving_account)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-stone-300 rounded-lg hover:bg-stone-100 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedNum ? 'Copié' : 'Copier le numéro'}</span>
                </button>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">{selectedProvider.instructions}</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(providerCode === 'flooz' || providerCode === 'tmoney') && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Votre numéro Mobile Money d’envoi ({providerCode === 'flooz' ? 'Flooz' : 'TMoney'})
                </label>
                <input
                  required
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+22890123456"
                  className="w-full px-3.5 py-2.5 text-sm font-mono border border-stone-300 rounded-lg"
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Référence SMS du transfert (si déjà effectué)
              </label>
              <input
                value={externalReference}
                onChange={(e) => setExternalReference(e.target.value)}
                placeholder="Ex. MP261116.1422.B89210 (optionnel ici)"
                className="w-full px-3.5 py-2.5 text-sm font-mono border border-stone-300 rounded-lg"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep('review')}
              className="px-4 py-2 text-sm text-slate-700 border border-stone-300 rounded-lg cursor-pointer"
            >
              Retour
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={handleInitiatePayment}
              className="px-6 py-2.5 text-sm font-medium text-white bg-[#0F5132] rounded-lg hover:bg-[#0B3D25] disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Enregistrement...' : 'Créer l’ordre de dépôt'}
            </button>
          </div>
        </div>
      )}

      {step === 'waiting' && checkoutRes && (
        <div className="space-y-6">
          <div className="bg-white border border-stone-200 rounded-xl p-6 sm:p-8 space-y-6">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-stone-200">
              <div>
                <div className="text-xs text-slate-500">Ordre d’investissement créé</div>
                <div className="font-mono text-xl font-bold text-slate-900">{checkoutRes.orderReference}</div>
                <div className="mt-1 text-xs font-mono text-slate-500">
                  Réf. paiement : {checkoutRes.payment?.payment_reference} · TXN : {checkoutRes.payment?.transaction_id}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-slate-500">Statut de validation</div>
                <div className={`mt-1 text-sm font-semibold ${paymentStatusLabel(livePayment?.status).tone}`}>
                  {paymentStatusLabel(livePayment?.status).text}
                </div>
              </div>
            </div>

            {livePayment?.status === 'confirmed' ? (
              <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-[#0F5132] shrink-0" />
                <div className="space-y-2">
                  <h3 className="font-display text-base font-semibold text-slate-900">
                    Dépôt validé et investissement activé
                  </h3>
                  <p className="text-xs text-slate-700">
                    Référence transfert validée : <strong className="font-mono">{livePayment.external_reference}</strong>.
                    Les écritures du grand livre financier et votre reçu de souscription ont été générés.
                  </p>
                  <div className="pt-1 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => navigate('/dashboard/investissements')}
                      className="px-4 py-2 text-xs font-medium text-white bg-[#0F5132] rounded-lg cursor-pointer"
                    >
                      Voir mes investissements et reçus
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate('/dashboard/transactions')}
                      className="px-4 py-2 text-xs font-medium text-slate-900 bg-white border border-stone-300 rounded-lg cursor-pointer"
                    >
                      Consulter l’historique
                    </button>
                  </div>
                </div>
              </div>
            ) : livePayment?.status === 'failed' ? (
              <div className="p-5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
                <XCircle className="w-6 h-6 text-red-700 shrink-0" />
                <div className="space-y-2">
                  <h3 className="font-display text-base font-semibold text-red-900">Dépôt non validé (Rejeté)</h3>
                  <p className="text-xs text-red-800">
                    {livePayment.failure_reason || 'Le transfert n’a pas pu être rapproché sur le compte officiel.'} Aucun investissement n’a été activé.
                  </p>
                  <button
                    type="button"
                    onClick={() => navigate('/investissements')}
                    className="px-4 py-2 text-xs font-medium text-slate-900 bg-white border border-stone-300 rounded-lg cursor-pointer"
                  >
                    Retour aux offres
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="p-5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                  <Clock className="w-6 h-6 text-amber-700 shrink-0" />
                  <div className="space-y-2">
                    <h3 className="font-display text-base font-semibold text-slate-900">
                      Effectuez le dépôt puis transmettez votre référence de transfert
                    </h3>
                    <p className="text-xs text-slate-700 leading-relaxed">{checkoutRes.instructions}</p>
                    <div className="pt-1 text-xs font-mono text-slate-900">
                      Bénéficiaire officiel : <strong>{checkoutRes.receivingAccount}</strong> ({checkoutRes.receivingName}) · Montant exact : <strong>{formatFCFA(checkoutRes.payment?.total_amount)}</strong>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleSubmitProof} className="p-5 bg-[#FAF9F6] border border-stone-200 rounded-xl space-y-3">
                  <h4 className="font-display text-sm font-semibold text-slate-900">
                    Déclarer / Mettre à jour la référence SMS du transfert
                  </h4>
                  {proofMsg && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded text-xs text-[#0F5132]">{proofMsg}</div>}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      required
                      value={proofRefInput}
                      onChange={(e) => setProofRefInput(e.target.value)}
                      placeholder="Ex. ID transaction TMoney / Flooz reçu par SMS"
                      className="flex-1 px-3.5 py-2 text-sm font-mono border border-stone-300 rounded-lg bg-white"
                    />
                    <button
                      type="submit"
                      className="px-5 py-2 text-xs font-medium text-white bg-[#0F5132] rounded-lg hover:bg-[#0B3D25] cursor-pointer"
                    >
                      Transmettre la référence
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Dès vérification de la réception sur le numéro {checkoutRes.receivingAccount} par l’équipe Finance InvestMarket, votre investissement est activé automatiquement.
                  </p>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
