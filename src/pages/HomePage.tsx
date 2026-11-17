import React, { useEffect, useState } from 'react';
import { ArrowRight, ShieldAlert } from 'lucide-react';
import { apiFetch, formatFCFA } from '../lib/api.ts';
import type { InvestmentPlan } from '../types.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useRouter } from '../lib/router.tsx';
import { CalculatorWidget } from '../components/CalculatorWidget.tsx';

export function HomePage() {
  const { cms, user } = useAuth();
  const { navigate } = useRouter();
  const [plans, setPlans] = useState<InvestmentPlan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);

  useEffect(() => {
    apiFetch<{ plans: InvestmentPlan[] }>('/api/plans')
      .then((d) => setPlans(d.plans || []))
      .catch(() => setPlans([]))
      .finally(() => setLoadingPlans(false));
  }, []);

  const about = cms.about_content;
  const riskText =
    cms.risk_warning?.bannerText ||
    'Avertissement : les investissements comportent des risques, y compris un risque de perte partielle ou totale en capital. Les performances ne sont pas garanties.';

  return (
    <div>
      {/* 1. HERO SECTION */}
      <section className="border-b border-stone-200 bg-white">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-12 lg:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-between space-y-8">
              <div className="space-y-5">
                <p className="text-xs font-semibold tracking-wide text-[#0F5132]">
                  INVESTMARKET · TOGO & ZONE UEMOA · FCFA (XOF)
                </p>
                <h1 className="font-display text-[clamp(2.1rem,4vw,3.4rem)] font-bold leading-[1.08] tracking-tight text-slate-900 text-balance">
                  Une plateforme d’investissement pensée pour une gestion transparente et structurée.
                </h1>
                <p className="text-base text-slate-600 leading-relaxed max-w-[60ch]">
                  Consultez des opportunités d’investissement encadrées, créez votre espace investisseur et réglez vos souscriptions par Flooz ou TMoney avec traçabilité comptable complète.
                </p>
              </div>

              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => navigate('/investissements')}
                    className="inline-flex items-center gap-2 px-5 py-3 text-sm font-medium text-white bg-[#0F5132] rounded-lg hover:bg-[#0B3D25] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <span>Découvrir les investissements</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  {!user ? (
                    <>
                      <button
                        type="button"
                        onClick={() => navigate('/inscription')}
                        className="px-5 py-3 text-sm font-medium text-slate-900 bg-stone-100 border border-stone-300 rounded-lg hover:bg-stone-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Créer un compte
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate('/connexion')}
                        className="px-4 py-3 text-sm font-medium text-slate-700 hover:text-slate-900 underline underline-offset-4 whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        Se connecter
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => navigate('/dashboard')}
                      className="px-5 py-3 text-sm font-medium text-slate-900 bg-stone-100 border border-stone-300 rounded-lg hover:bg-stone-200 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Accéder au tableau de bord
                    </button>
                  )}
                </div>

                {/* Immediate clear Risk Warning */}
                <div className="p-4 bg-[#FAF9F6] border border-amber-300/80 rounded-lg flex items-start gap-3">
                  <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                  <p className="text-xs text-slate-700 leading-relaxed">
                    {riskText}{' '}
                    <button
                      type="button"
                      onClick={() => navigate('/avertissement-risques')}
                      className="font-semibold text-slate-900 underline underline-offset-2 cursor-pointer"
                    >
                      Lire l’avertissement complet
                    </button>
                  </p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="h-full min-h-[300px] lg:min-h-[440px] rounded-xl overflow-hidden border border-stone-200 bg-stone-100">
                <img
                  src="/src/assets/images/hero_investmarket_1794869467467.jpg"
                  alt="Architecture institutionnelle InvestMarket à Lomé"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>

          {/* 4-column structural strip below hero split */}
          <div className="mt-10 pt-8 border-t border-stone-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <div className="text-xs text-slate-500">Paiements locaux intégrés</div>
              <div className="mt-1 font-display text-base font-semibold text-slate-900">Flooz & TMoney (Togo)</div>
              <p className="mt-1 text-xs text-slate-600">Confirmation uniquement après validation cryptographique opérateur.</p>
            </div>
            <div>
              <div className="text-xs text-slate-500">Devise de référence</div>
              <div className="mt-1 font-mono tabular-nums text-base font-semibold text-slate-900">FCFA (XOF)</div>
              <p className="mt-1 text-xs text-slate-600">Frais, paliers et échéances paramétrables en toute transparence.</p>
            </div>
            <div>
              <div className="text-xs text-slate-500">Protection & Gouvernance</div>
              <div className="mt-1 font-display text-base font-semibold text-slate-900">Accès sécurisé & audit</div>
              <p className="mt-1 text-xs text-slate-600">Contrôles serveur, protection des sessions et suivi transparent des opérations.</p>
            </div>
            <div>
              <div className="text-xs text-slate-500">Comptabilité interne</div>
              <div className="mt-1 font-display text-base font-semibold text-slate-900">Registre financier traçable</div>
              <p className="mt-1 text-xs text-slate-600">Chaque mouvement produit une écriture auditée et un justificatif.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 2. PRÉSENTATION RAPIDE */}
      <section className="py-16 lg:py-20 border-b border-stone-200">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 space-y-12">
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
              Une architecture dédiée à la rigueur financière et à la lisibilité des engagements
            </h2>
            <p className="mt-3 text-base text-slate-600 leading-relaxed">
              {about?.whoWeAre ||
                'InvestMarket structure et administre des opportunités d’investissement encadrées en Afrique de l’Ouest, avec suivi calendaire des échéances et transparence sur les risques.'}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-2">
              <div className="text-xs font-mono text-slate-500">01. Mission</div>
              <h3 className="font-display text-lg font-semibold text-slate-900">Accès structuré en FCFA</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                {about?.mission || 'Permettre aux investisseurs éligibles de consulter et souscrire à des produits documentés via Flooz et TMoney.'}
              </p>
            </div>

            <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-2">
              <div className="text-xs font-mono text-slate-500">02. Vision</div>
              <h3 className="font-display text-lg font-semibold text-slate-900">Standard régional de confiance</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                {about?.vision || 'Associer contrat clair, registre comptable vérifiable et information loyale sur les risques.'}
              </p>
            </div>

            <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-2">
              <div className="text-xs font-mono text-slate-500">03. Approche</div>
              <h3 className="font-display text-lg font-semibold text-slate-900">Sécurité & Transparence</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                {about?.commitments || 'Journal d’audit immuable, traçabilité comptable, idempotence des paiements et zéro promesse de rendement garanti.'}
              </p>
            </div>
          </div>

          {/* Sectors Showcase with Generated Architectural Images */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            <div className="lg:col-span-7 bg-white border border-stone-200 rounded-xl overflow-hidden flex flex-col">
              <div className="aspect-[16/9] bg-stone-100 overflow-hidden">
                <img
                  src="/src/assets/images/sector_infrastructure_1794869468162.jpg"
                  alt="Infrastructures solaires et logistiques en Afrique de l'Ouest"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-6 space-y-2">
                <div className="text-xs text-slate-500">Domaines d’activité · Économie réelle & Titres régionaux</div>
                <h3 className="font-display text-lg font-semibold text-slate-900">
                  Infrastructures, énergie, trésorerie UEMOA et filières productives
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">
                  {about?.approach || 'Chaque opportunité publiée précise son objectif, sa durée, ses frais exacts, ses règles de sortie et ses facteurs de risque.'}
                </p>
              </div>
            </div>

            <div className="lg:col-span-5 bg-white border border-stone-200 rounded-xl overflow-hidden flex flex-col">
              <div className="aspect-[4/3] bg-stone-100 overflow-hidden">
                <img
                  src="/src/assets/images/sector_realestate_1794869469151.jpg"
                  alt="Immobilier commercial et résidentiel à Lomé"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                <div className="space-y-2">
                  <div className="text-xs text-slate-500">Actifs immobiliers & PME</div>
                  <h3 className="font-display text-lg font-semibold text-slate-900">
                    Opérations encadrées et documentées
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Toutes les conditions contractuelles sont figées à la souscription et conservées dans votre coffre documentaire.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/a-propos')}
                  className="self-start text-sm font-medium text-[#0F5132] hover:underline underline-offset-4 cursor-pointer"
                >
                  Découvrir notre gouvernance
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. NOS INVESTISSEMENTS (APERÇU) */}
      <section className="py-16 lg:py-20 bg-white border-b border-stone-200">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 space-y-10">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                Opportunités d’investissement disponibles
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Paramètres en vigueur en FCFA (XOF). Aucun rendement n’est garanti.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/investissements')}
              className="text-sm font-medium text-[#0F5132] hover:underline underline-offset-4 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Voir toutes les offres
            </button>
          </div>

          {loadingPlans ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[1, 2].map((i) => (
                <div key={i} className="h-64 bg-stone-100 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {plans.map((plan) => (
                <article
                  key={plan.id}
                  className="bg-[#FAF9F6] border border-stone-200 rounded-xl p-6 flex flex-col justify-between space-y-5"
                >
                  <div className="space-y-3">
                    <div className="text-xs text-slate-500">
                      <span>{plan.category}</span>
                      <span aria-hidden="true"> · </span>
                      <span>Risque : {plan.risk_level}</span>
                      <span aria-hidden="true"> · </span>
                      <span>Statut : {plan.status === 'active' ? 'Ouvert' : 'Programmé'}</span>
                    </div>

                    <h3 className="font-display text-xl font-semibold text-slate-900">{plan.name}</h3>
                    <p className="text-sm text-slate-600 leading-relaxed">{plan.summary}</p>
                  </div>

                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4 pt-4 border-t border-stone-200 text-xs">
                      <div>
                        <div className="text-slate-500">Minimum</div>
                        <div className="mt-0.5 font-mono tabular-nums font-semibold text-slate-900">
                          {formatFCFA(plan.min_amount)}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500">Frais</div>
                        <div className="mt-0.5 font-mono tabular-nums font-semibold text-slate-900">
                          {plan.fee_percent}%{plan.fee_fixed > 0 ? ` + ${formatFCFA(plan.fee_fixed)}` : ''}
                        </div>
                      </div>
                      <div>
                        <div className="text-slate-500">Durées</div>
                        <div className="mt-0.5 font-medium text-slate-900">
                          {plan.durations.map((d) => (d.months > 0 ? `${d.months}m` : `${d.days}j`)).join(' / ')}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => navigate(`/investissements/${plan.slug}`)}
                        className="px-4 py-2 text-sm font-medium text-slate-900 bg-white border border-stone-300 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer"
                      >
                        Voir les détails
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate(`/investir/${plan.slug}`)}
                        className="px-4 py-2 text-sm font-medium text-white bg-[#0F5132] rounded-lg hover:bg-[#0B3D25] transition-colors cursor-pointer"
                      >
                        Investir
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 4. CALCULATEUR D'INVESTISSEMENT */}
      <section id="calculateur" className="py-16 lg:py-20">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 space-y-8">
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Calculateur d’investissement dynamique
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Simulez votre souscription selon les règles tarifaires et durées configurées par l’administration InvestMarket.
            </p>
          </div>
          <CalculatorWidget plans={plans} />
        </div>
      </section>
    </div>
  );
}
