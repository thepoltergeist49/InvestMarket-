import React, { useEffect, useState } from 'react';
import { ChevronDown, FileText, ShieldAlert } from 'lucide-react';
import { apiFetch, formatFCFA } from '../lib/api.ts';
import type { InvestmentPlan } from '../types.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useRouter } from '../lib/router.tsx';
import { CalculatorWidget } from '../components/CalculatorWidget.tsx';

export function AboutPage() {
  const { cms } = useAuth();
  const { navigate } = useRouter();
  const about = cms.about_content;

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-12 lg:py-16 space-y-14">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
        <div className="lg:col-span-6 space-y-5">
          <p className="text-xs font-semibold text-[#0F5132]">À PROPOS D’INVESTMARKET</p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 text-balance">
            Gouvernance rigoureuse, transparence des frais et traçabilité financière
          </h1>
          <p className="text-base text-slate-600 leading-relaxed">
            {about?.whoWeAre}
          </p>
          <div className="pt-2 space-y-4">
            <div className="p-5 bg-white border border-stone-200 rounded-xl space-y-1.5">
              <h2 className="font-display text-base font-semibold text-slate-900">Notre mission</h2>
              <p className="text-sm text-slate-600 leading-relaxed">{about?.mission}</p>
            </div>
            <div className="p-5 bg-white border border-stone-200 rounded-xl space-y-1.5">
              <h2 className="font-display text-base font-semibold text-slate-900">Notre vision</h2>
              <p className="text-sm text-slate-600 leading-relaxed">{about?.vision}</p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-6">
          <div className="h-full min-h-[320px] rounded-xl overflow-hidden border border-stone-200 bg-stone-100">
            <img
              src="/src/assets/images/about_architecture_1794869467730.jpg"
              alt="Salle de gouvernance InvestMarket"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 border-t border-stone-200">
        <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-2">
          <h3 className="font-display text-lg font-semibold text-slate-900">Domaines d’activité</h3>
          <ul className="space-y-2 text-sm text-slate-600">
            {(about?.sectors || []).map((s, idx) => (
              <li key={idx}>· {s}</li>
            ))}
          </ul>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-2">
          <h3 className="font-display text-lg font-semibold text-slate-900">Approche d’investissement</h3>
          <p className="text-sm text-slate-600 leading-relaxed">{about?.approach}</p>
        </div>
        <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-2">
          <h3 className="font-display text-lg font-semibold text-slate-900">Engagements sécurité</h3>
          <p className="text-sm text-slate-600 leading-relaxed">{about?.commitments}</p>
        </div>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <p className="text-sm text-slate-700">
          Consultez les offres ouvertes à la souscription ou contactez notre équipe conformité.
        </p>
        <div className="flex gap-3 shrink-0">
          <button
            type="button"
            onClick={() => navigate('/investissements')}
            className="px-4 py-2 text-sm font-medium text-white bg-[#0F5132] rounded-lg hover:bg-[#0B3D25] cursor-pointer"
          >
            Nos investissements
          </button>
          <button
            type="button"
            onClick={() => navigate('/contact')}
            className="px-4 py-2 text-sm font-medium text-slate-900 border border-stone-300 rounded-lg hover:bg-stone-100 cursor-pointer"
          >
            Contacter l’équipe
          </button>
        </div>
      </div>
    </div>
  );
}

export function OffersListPage() {
  const { navigate } = useRouter();
  const [plans, setPlans] = useState<InvestmentPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [durationFilter, setDurationFilter] = useState<'all' | 'court' | 'moyen' | 'long'>('all');

  useEffect(() => {
    apiFetch<{ plans: InvestmentPlan[] }>('/api/plans')
      .then((d) => setPlans(d.plans || []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = plans.filter((p) => {
    if (durationFilter === 'all') return true;
    return p.durations.some((d) => d.duration_type === durationFilter);
  });

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-12 lg:py-16 space-y-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-stone-200">
        <div className="space-y-2 max-w-2xl">
          <p className="text-xs font-semibold text-[#0F5132]">CATALOGUE STRUCTURÉ</p>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            Nos investissements
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            Chaque produit est configurable en durée et en montant (FCFA / XOF). Aucune offre ne garantit de rendement : vérifiez les conditions et le niveau de risque avant toute souscription.
          </p>
        </div>

        {/* Segmented Filter Control */}
        <div className="flex items-center gap-1 p-1 bg-stone-200/70 rounded-lg self-start">
          {[
            { id: 'all', label: 'Toutes durées' },
            { id: 'court', label: 'Court terme' },
            { id: 'moyen', label: 'Moyen terme' },
            { id: 'long', label: 'Long terme' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setDurationFilter(tab.id as any)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                durationFilter === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-72 bg-stone-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-12 bg-white border border-stone-200 rounded-xl text-center space-y-3">
          <p className="text-sm text-slate-600">Aucune offre ne correspond à ce filtre de durée.</p>
          <button
            type="button"
            onClick={() => setDurationFilter('all')}
            className="px-4 py-2 text-xs font-medium text-white bg-[#0F5132] rounded-lg cursor-pointer"
          >
            Afficher toutes les offres
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filtered.map((plan) => {
            const remaining = plan.available_cap - plan.allocated_cap;
            return (
              <article
                key={plan.id}
                className="bg-white border border-stone-200 rounded-xl p-6 sm:p-7 flex flex-col justify-between space-y-6"
              >
                <div className="space-y-3">
                  <div className="text-xs text-slate-500">
                    <span>{plan.code}</span>
                    <span aria-hidden="true"> · </span>
                    <span>{plan.category}</span>
                    <span aria-hidden="true"> · </span>
                    <span className="text-amber-800 font-medium">Risque : {plan.risk_level}</span>
                  </div>
                  <h2 className="font-display text-xl font-semibold text-slate-900">{plan.name}</h2>
                  <p className="text-sm text-slate-600 leading-relaxed">{plan.summary}</p>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-y border-stone-200 text-xs">
                    <div>
                      <div className="text-slate-500">Minimum</div>
                      <div className="mt-1 font-mono tabular-nums font-semibold text-slate-900">
                        {formatFCFA(plan.min_amount)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Maximum</div>
                      <div className="mt-1 font-mono tabular-nums font-semibold text-slate-900">
                        {formatFCFA(plan.max_amount)}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Frais</div>
                      <div className="mt-1 font-mono tabular-nums font-semibold text-slate-900">
                        {plan.fee_percent}%{plan.fee_fixed > 0 ? ` + ${formatFCFA(plan.fee_fixed)}` : ''}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">Disponible</div>
                      <div className="mt-1 font-mono tabular-nums font-semibold text-[#0F5132]">
                        {formatFCFA(remaining)}
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-slate-600 space-y-1">
                    <p><strong className="text-slate-800">Durées :</strong> {plan.durations.map((d) => d.label).join(' · ')}</p>
                    <p><strong className="text-slate-800">Conditions :</strong> {plan.conditions_text}</p>
                    <p className="text-amber-800">{plan.rate_disclaimer}</p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => navigate(`/investissements/${plan.slug}`)}
                      className="px-4 py-2 text-sm font-medium text-slate-900 border border-stone-300 rounded-lg hover:bg-stone-100 cursor-pointer"
                    >
                      Voir les détails
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate(`/investir/${plan.slug}`)}
                      className="px-5 py-2 text-sm font-medium text-white bg-[#0F5132] rounded-lg hover:bg-[#0B3D25] cursor-pointer"
                    >
                      Investir
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function OfferDetailPage({ slug }: { slug: string }) {
  const { navigate } = useRouter();
  const [plan, setPlan] = useState<(InvestmentPlan & { documents?: any[] }) | null>(null);
  const [allPlans, setAllPlans] = useState<InvestmentPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch<{ plan: any }>(`/api/plans/${slug}`),
      apiFetch<{ plans: InvestmentPlan[] }>('/api/plans'),
    ])
      .then(([detail, list]) => {
        setPlan(detail.plan);
        setAllPlans(list.plans || []);
      })
      .catch(() => setPlan(null))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return <div className="max-w-[1200px] mx-auto px-4 py-16 text-sm text-slate-500">Chargement de la fiche produit...</div>;
  }

  if (!plan) {
    return (
      <div className="max-w-[1200px] mx-auto px-4 py-16 space-y-4">
        <h1 className="font-display text-2xl font-bold text-slate-900">Offre introuvable</h1>
        <button
          type="button"
          onClick={() => navigate('/investissements')}
          className="px-4 py-2 text-sm font-medium text-white bg-[#0F5132] rounded-lg cursor-pointer"
        >
          Retour aux investissements
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-12 lg:py-16 space-y-12">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-8 pb-8 border-b border-stone-200">
        <div className="space-y-4 max-w-3xl">
          <div className="text-xs text-slate-500">
            <button type="button" onClick={() => navigate('/investissements')} className="hover:underline cursor-pointer">
              Nos investissements
            </button>
            <span> / </span>
            <span>{plan.code}</span>
            <span> · </span>
            <span>Version {plan.version}</span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
            {plan.name}
          </h1>
          <p className="text-base text-slate-600 leading-relaxed">{plan.description}</p>
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-6 min-w-[280px] space-y-4 shrink-0">
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Statut</span>
              <span className="font-semibold text-[#0F5132]">{plan.status === 'active' ? 'Ouvert à la souscription' : plan.status}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Niveau de risque</span>
              <span className="font-semibold text-amber-800">{plan.risk_level}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Ticket minimum</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">{formatFCFA(plan.min_amount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Frais appliqués</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {plan.fee_percent}%{plan.fee_fixed > 0 ? ` + ${formatFCFA(plan.fee_fixed)}` : ''}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate(`/investir/${plan.slug}`)}
            className="w-full px-4 py-2.5 text-sm font-medium text-white bg-[#0F5132] rounded-lg hover:bg-[#0B3D25] cursor-pointer"
          >
            Souscrire à cette offre
          </button>
        </div>
      </div>

      {/* Detailed specs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-3">
          <h2 className="font-display text-lg font-semibold text-slate-900">Objectif & Modalités de souscription</h2>
          <p className="text-sm text-slate-600 leading-relaxed">{plan.objective}</p>
          <p className="text-sm text-slate-600 leading-relaxed">
            <strong className="text-slate-800">Conditions :</strong> {plan.conditions_text}
          </p>
          <p className="text-xs font-mono tabular-nums text-slate-500">
            Plafond quotidien : {formatFCFA(plan.daily_limit)} · Plafond investisseur : {formatFCFA(plan.user_limit)}
          </p>
        </div>

        <div className="bg-white border border-stone-200 rounded-xl p-6 space-y-3">
          <h2 className="font-display text-lg font-semibold text-slate-900">Modalités de sortie & Renouvellement</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            <strong className="text-slate-800">Sortie :</strong> {plan.exit_rules}
          </p>
          <p className="text-sm text-slate-600 leading-relaxed">
            <strong className="text-slate-800">Renouvellement :</strong> {plan.renewal_rules}
          </p>
        </div>
      </div>

      {/* Mandatory Risk Warning */}
      <div className="p-6 bg-white border border-amber-300 rounded-xl flex items-start gap-4">
        <ShieldAlert className="w-6 h-6 text-amber-700 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h3 className="font-display text-base font-semibold text-slate-900">Facteurs de risque et transparence</h3>
          <p className="text-sm text-slate-700 leading-relaxed">{plan.rate_disclaimer}</p>
          {plan.potential_rate_min !== null && plan.potential_rate_max !== null && (
            <p className="text-xs text-slate-600">
              Fourchette indicative annuelle non contractuelle : {plan.potential_rate_min}% à {plan.potential_rate_max}% (ne constitue jamais un rendement garanti).
            </p>
          )}
        </div>
      </div>

      {/* Embedded Server Calculator */}
      <div className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-slate-900">Simuler ce produit</h2>
        <CalculatorWidget plans={allPlans} initialPlanId={plan.id} />
      </div>
    </div>
  );
}

export function HowItWorksPage() {
  const { navigate } = useRouter();
  const steps = [
    {
      num: '01',
      title: 'Création de compte & Activation',
      desc: 'Inscrivez-vous avec votre nom, adresse e-mail et numéro de téléphone togolais ou UEMOA, puis validez le code de confirmation.',
    },
    {
      num: '02',
      title: 'Sélection & Calculateur serveur',
      desc: 'Choisissez l’offre, le montant en FCFA (XOF) et la durée configurable. Les frais, plafonds et l’échéance prévisionnelle sont calculés côté serveur.',
    },
    {
      num: '03',
      title: 'Dépôt Flooz ou TMoney',
      desc: 'Un ordre unique (ex. INV-2026-000001) est créé. Transférez vers TMoney (93736916) ou Flooz (97172729) et indiquez votre référence SMS pour validation Finance.',
    },
    {
      num: '04',
      title: 'Suivi, Échéance & Documents',
      desc: 'Suivez votre engagement dans votre tableau de bord, téléchargez vos reçus et recevez les notifications automatiques jusqu’à l’échéance et au retrait.',
    },
  ];

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-12 lg:py-16 space-y-12">
      <div className="max-w-2xl space-y-3">
        <p className="text-xs font-semibold text-[#0F5132]">PARCOURS INVESTISSEUR</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
          Comment fonctionne InvestMarket
        </h1>
        <p className="text-base text-slate-600 leading-relaxed">
          De l’inscription jusqu’au dénouement à l’échéance, chaque étape est encadrée par des contrôles serveur et un registre comptable vérifiable.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {steps.map((s) => (
          <div key={s.num} className="bg-white border border-stone-200 rounded-xl p-6 space-y-3">
            <div className="font-mono text-xs font-semibold text-[#0F5132]">Étape {s.num}</div>
            <h2 className="font-display text-lg font-semibold text-slate-900">{s.title}</h2>
            <p className="text-sm text-slate-600 leading-relaxed">{s.desc}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => navigate('/inscription')}
          className="px-5 py-2.5 text-sm font-medium text-white bg-[#0F5132] rounded-lg hover:bg-[#0B3D25] cursor-pointer"
        >
          Créer un compte
        </button>
        <button
          type="button"
          onClick={() => navigate('/investissements')}
          className="px-5 py-2.5 text-sm font-medium text-slate-900 border border-stone-300 rounded-lg hover:bg-stone-100 cursor-pointer"
        >
          Consulter les offres
        </button>
      </div>
    </div>
  );
}

export function FaqPage() {
  const { cms } = useAuth();
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  const items = cms.faq_items || [];

  return (
    <div className="max-w-[900px] mx-auto px-4 sm:px-6 py-12 lg:py-16 space-y-8">
      <div className="space-y-2">
        <p className="text-xs font-semibold text-[#0F5132]">CENTRE D’INFORMATION</p>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
          Foire aux questions
        </h1>
        <p className="text-sm text-slate-600">
          Questions fréquentes sur les paiements Flooz/TMoney, la souscription, les frais et la gestion des échéances.
        </p>
      </div>

      <div className="divide-y divide-stone-200 bg-white border border-stone-200 rounded-xl">
        {items.map((item, idx) => {
          const isOpen = openIdx === idx;
          return (
            <div key={idx} className="p-6">
              <button
                type="button"
                onClick={() => setOpenIdx(isOpen ? null : idx)}
                className="w-full flex items-center justify-between gap-4 text-left cursor-pointer"
              >
                <span className="font-display text-base font-semibold text-slate-900">{item.q}</span>
                <ChevronDown className={`w-5 h-5 text-slate-500 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && <p className="mt-3 text-sm text-slate-600 leading-relaxed">{item.a}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ContactPage() {
  const { cms } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', phone: '', subject: '', message: '' });
  const [status, setStatus] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setStatus(null);
    try {
      const res = await apiFetch<{ message: string }>('/api/contact', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setStatus({ type: 'ok', text: res.message });
      setForm({ name: '', email: '', phone: '', subject: '', message: '' });
    } catch (err: any) {
      setStatus({ type: 'err', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-[1100px] mx-auto px-4 sm:px-6 py-12 lg:py-16 grid grid-cols-1 lg:grid-cols-12 gap-10">
      <div className="lg:col-span-5 space-y-5">
        <p className="text-xs font-semibold text-[#0F5132]">ASSISTANCE & CONFORMITÉ</p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">Contactez InvestMarket</h1>
        <p className="text-sm text-slate-600 leading-relaxed">
          Une question sur une souscription, un retrait ou un rapprochement Flooz / TMoney ? Nos équipes basées à Lomé vous répondent.
        </p>
        <div className="bg-white border border-stone-200 rounded-xl p-5 space-y-2 text-sm">
          <div>
            <span className="text-slate-500">Adresse : </span>
            <span className="text-slate-900">{cms.site_identity?.address || 'Boulevard du 13 Janvier, Lomé, Togo'}</span>
          </div>
          <div>
            <span className="text-slate-500">E-mail : </span>
            <span className="font-mono text-slate-900">{cms.site_identity?.email || 'contact@investmarket.tg'}</span>
          </div>
          <div>
            <span className="text-slate-500">Téléphone : </span>
            <span className="font-mono text-slate-900">{cms.site_identity?.phone || '+228 22 21 00 00'}</span>
          </div>
        </div>
      </div>

      <div className="lg:col-span-7 bg-white border border-stone-200 rounded-xl p-6 sm:p-8">
        <form onSubmit={handleSubmit} className="space-y-4">
          {status && (
            <div
              className={`p-3.5 rounded-lg text-sm border ${
                status.type === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-[#0F5132]'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              {status.text}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Nom complet</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3.5 py-2.5 text-sm border border-stone-300 rounded-lg focus:outline-none focus:border-[#0F5132]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Adresse e-mail</label>
              <input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3.5 py-2.5 text-sm border border-stone-300 rounded-lg focus:outline-none focus:border-[#0F5132]"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Téléphone (optionnel)</label>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="+228 90 00 00 00"
                className="w-full px-3.5 py-2.5 text-sm border border-stone-300 rounded-lg focus:outline-none focus:border-[#0F5132]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Objet</label>
              <input
                required
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                className="w-full px-3.5 py-2.5 text-sm border border-stone-300 rounded-lg focus:outline-none focus:border-[#0F5132]"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Message</label>
            <textarea
              rows={4}
              required
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              className="w-full px-3.5 py-2.5 text-sm border border-stone-300 rounded-lg focus:outline-none focus:border-[#0F5132]"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2.5 text-sm font-medium text-white bg-[#0F5132] rounded-lg hover:bg-[#0B3D25] disabled:opacity-50 cursor-pointer"
          >
            {submitting ? 'Envoi en cours...' : 'Envoyer le message'}
          </button>
        </form>
      </div>
    </div>
  );
}

export function LegalPage({ type }: { type: 'terms' | 'privacy' | 'risks' | 'documents' }) {
  const { cms } = useAuth();
  const { navigate } = useRouter();
  const [plans, setPlans] = useState<InvestmentPlan[]>([]);

  useEffect(() => {
    if (type === 'documents') {
      apiFetch<{ plans: InvestmentPlan[] }>('/api/plans').then((d) => setPlans(d.plans || []));
    }
  }, [type]);

  const titleMap = {
    terms: 'Conditions générales d’utilisation et de souscription',
    privacy: 'Politique de confidentialité et protection des données',
    risks: 'Avertissement sur les risques liés aux investissements',
    documents: 'Documents légaux et notices d’information',
  };

  return (
    <div className="max-w-[900px] mx-auto px-4 sm:px-6 py-12 lg:py-16 space-y-8">
      <div className="space-y-2">
        <p className="text-xs font-semibold text-[#0F5132]">CADRE RÉGLEMENTAIRE & CONFORMITÉ</p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">{titleMap[type]}</h1>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-6 sm:p-8 space-y-6 text-sm text-slate-700 leading-relaxed">
        {type === 'terms' && (
          <>
            <p>{cms.legal_texts?.terms}</p>
            <p>
              Toute opération financière sur la plateforme suppose l’activation préalable du compte et l’acceptation des conditions propres à chaque produit.
            </p>
          </>
        )}
        {type === 'privacy' && (
          <>
            <p>{cms.legal_texts?.privacy}</p>
            <p>
              Les données personnelles et journaux d’audit sont conservés de manière sécurisée et chiffrée pour l’exécution et la traçabilité de vos opérations.
            </p>
          </>
        )}
        {type === 'risks' && (
          <>
            <p className="font-semibold text-amber-900">{cms.risk_warning?.bannerText}</p>
            <p>{cms.risk_warning?.fullText}</p>
            <ul className="space-y-2 list-disc pl-5">
              <li>Risque de perte partielle ou totale du capital investi.</li>
              <li>Risque d’illiquidité : les fonds peuvent être immobilisés jusqu’à l’échéance contractuelle du produit.</li>
              <li>Risque sectoriel, de contrepartie et de marché selon les actifs sous-jacents.</li>
              <li>Absence de rendement garanti : toute projection indicative demeure non contractuelle.</li>
            </ul>
          </>
        )}
        {type === 'documents' && (
          <div className="space-y-6">
            <p>
              Retrouvez ci-dessous les notices contractuelles des produits ouverts ainsi que les documents réglementaires de la plateforme. Les reçus individuels et relevés d’échéance sont accessibles depuis votre espace client.
            </p>
            <div className="divide-y divide-stone-200 border border-stone-200 rounded-lg">
              <div className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-slate-500" />
                  <div>
                    <div className="font-medium text-slate-900">Conditions Générales & Avertissement sur les risques</div>
                    <div className="text-xs text-slate-500">Document cadre InvestMarket · XOF</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/conditions-generales')}
                  className="text-xs font-medium text-[#0F5132] hover:underline cursor-pointer"
                >
                  Consulter
                </button>
              </div>
              {plans.map((p) => (
                <div key={p.id} className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-slate-500" />
                    <div>
                      <div className="font-medium text-slate-900">Notice d’information — {p.name}</div>
                      <div className="text-xs text-slate-500">{p.code} · Version {p.version}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/investissements/${p.slug}`)}
                    className="text-xs font-medium text-[#0F5132] hover:underline cursor-pointer"
                  >
                    Ouvrir la notice
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
