import React, { useEffect, useState } from 'react';
import { apiFetch, formatDateFR, formatFCFA } from '../lib/api.ts';
import type { CalculatorResult, InvestmentPlan } from '../types.ts';
import { useRouter } from '../lib/router.tsx';

interface Props {
  plans: InvestmentPlan[];
  initialPlanId?: number;
}

export function CalculatorWidget({ plans, initialPlanId }: Props) {
  const { navigate } = useRouter();
  const [planId, setPlanId] = useState<number>(initialPlanId || plans[0]?.id || 0);
  const selectedPlan = plans.find((p) => p.id === planId) || plans[0];

  const [durationId, setDurationId] = useState<number>(selectedPlan?.durations?.[0]?.id || 0);
  const [amount, setAmount] = useState<string>(String(selectedPlan?.min_amount || 50000));
  const [result, setResult] = useState<CalculatorResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialPlanId && plans.some((p) => p.id === initialPlanId)) {
      setPlanId(initialPlanId);
    }
  }, [initialPlanId, plans]);

  useEffect(() => {
    if (!selectedPlan) return;
    if (!selectedPlan.durations.some((d) => d.id === durationId)) {
      setDurationId(selectedPlan.durations[0]?.id || 0);
    }
    setAmount((prev) => {
      const n = Number(prev);
      if (!Number.isFinite(n) || n < selectedPlan.min_amount) return String(selectedPlan.min_amount);
      return prev;
    });
  }, [selectedPlan, durationId]);

  useEffect(() => {
    if (!planId || !durationId || !amount) return;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch<CalculatorResult>('/api/calculator', {
          method: 'POST',
          body: JSON.stringify({ planId, durationId, amount: Number(amount) }),
        });
        setResult(res);
      } catch (err: any) {
        setError(err.message);
        setResult(null);
      } finally {
        setLoading(false);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [planId, durationId, amount]);

  if (!plans.length) return null;

  return (
    <div className="bg-white border border-stone-200 rounded-xl p-6 sm:p-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-5 space-y-5">
          <div>
            <h3 className="font-display text-xl font-semibold text-slate-900">
              Simulateur paramétré côté serveur
            </h3>
            <p className="mt-1 text-sm text-slate-600">
              Les montants, paliers, frais et échéances proviennent directement des paramètres actifs en base de données.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5" htmlFor="calc-plan">
              1. Choisir une offre d’investissement
            </label>
            <select
              id="calc-plan"
              value={planId}
              onChange={(e) => setPlanId(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-300 rounded-lg focus:outline-none focus:border-[#0F5132]"
            >
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (min. {formatFCFA(p.min_amount)})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5" htmlFor="calc-duration">
              2. Sélectionner une durée configurable
            </label>
            <select
              id="calc-duration"
              value={durationId}
              onChange={(e) => setDurationId(Number(e.target.value))}
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-stone-300 rounded-lg focus:outline-none focus:border-[#0F5132]"
            >
              {selectedPlan?.durations.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5" htmlFor="calc-amount">
              3. Montant à investir (FCFA / XOF)
            </label>
            <input
              id="calc-amount"
              type="number"
              min={selectedPlan?.min_amount}
              max={selectedPlan?.max_amount}
              step={selectedPlan?.step_amount || 5000}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm font-mono tabular-nums bg-white border border-stone-300 rounded-lg focus:outline-none focus:border-[#0F5132]"
            />
            {selectedPlan && (
              <p className="mt-1.5 text-xs text-slate-500 font-mono tabular-nums">
                Min : {formatFCFA(selectedPlan.min_amount)} · Max : {formatFCFA(selectedPlan.max_amount)} · Palier : {formatFCFA(selectedPlan.step_amount)}
              </p>
            )}
          </div>
        </div>

        <div className="lg:col-span-7 bg-[#FAF9F6] border border-stone-200 rounded-xl p-6 space-y-5">
          {error ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
              {error}
            </div>
          ) : loading && !result ? (
            <div className="py-12 text-center text-sm text-slate-500">Calcul serveur en cours...</div>
          ) : result ? (
            <>
              <div className="flex flex-wrap items-baseline justify-between gap-2 pb-4 border-b border-stone-200">
                <div>
                  <div className="text-xs text-slate-500">Offre sélectionnée</div>
                  <div className="font-display text-lg font-semibold text-slate-900">{result.plan.name}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">Niveau de risque</div>
                  <div className="text-sm font-medium text-amber-800">{result.plan.riskLevel}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
                <div>
                  <div className="text-xs text-slate-500">Montant investi</div>
                  <div className="mt-1 text-base font-mono font-semibold tabular-nums text-slate-900">
                    {formatFCFA(result.amount)}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">
                    Frais ({result.plan.feePercent}%{result.plan.feeFixed > 0 ? ` + ${formatFCFA(result.plan.feeFixed)}` : ''})
                  </div>
                  <div className="mt-1 text-base font-mono font-semibold tabular-nums text-slate-900">
                    {formatFCFA(result.feeAmount)}
                  </div>
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <div className="text-xs text-slate-500">Montant total à régler</div>
                  <div className="mt-1 text-base font-mono font-semibold tabular-nums text-[#0F5132]">
                    {formatFCFA(result.totalAmount)}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-stone-200 text-xs">
                <div>
                  <span className="text-slate-500">Durée retenue : </span>
                  <span className="font-medium text-slate-900">{result.duration.label}</span>
                </div>
                <div>
                  <span className="text-slate-500">Échéance prévisionnelle : </span>
                  <span className="font-mono tabular-nums font-medium text-slate-900">
                    {formatDateFR(result.estimatedMaturityDate)}
                  </span>
                </div>
              </div>

              {result.potentialScenarioMin !== null && result.potentialScenarioMax !== null && (
                <div className="p-4 bg-white border border-stone-200 rounded-lg space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-slate-700">Fourchette indicative potentielle (non garantie)</span>
                    <span className="font-mono tabular-nums font-semibold text-slate-900">
                      +{formatFCFA(result.potentialScenarioMin)} à +{formatFCFA(result.potentialScenarioMax)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">{result.disclaimer}</p>
                </div>
              )}

              <div className="text-xs text-slate-600 space-y-1">
                <p><strong className="text-slate-800">Conditions :</strong> {result.plan.conditionsText}</p>
                <p><strong className="text-slate-800">Règles de sortie :</strong> {result.plan.exitRules}</p>
              </div>

              <div className="pt-2 flex flex-wrap items-center justify-between gap-4">
                <button
                  type="button"
                  onClick={() => navigate(`/investissements/${result.plan.slug}`)}
                  className="text-sm font-medium text-slate-700 hover:text-slate-900 underline underline-offset-4 cursor-pointer"
                >
                  Consulter la fiche complète
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/investir/${result.plan.slug}?amount=${result.amount}&durationId=${result.duration.id}`)}
                  className="px-5 py-2.5 text-sm font-medium text-white bg-[#0F5132] rounded-lg hover:bg-[#0B3D25] transition-colors cursor-pointer"
                >
                  Souscrire ce montant
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
