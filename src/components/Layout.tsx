import React, { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useRouter } from '../lib/router.tsx';

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, cms } = useAuth();
  const { path, navigate } = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const brandName = cms.platform_settings?.companyName || cms.site_identity?.brandName || 'InvestMarket';
  const cleanPath = path.split('#')[0];

  const handleNav = (to: string) => {
    setMobileOpen(false);
    if (to === '/#calculateur' && cleanPath !== '/') {
      navigate('/#calculateur');
      return;
    }
    if (to === '/#calculateur' && cleanPath === '/') {
      const el = document.getElementById('calculateur');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    navigate(to);
  };

  const navLinks = [
    { label: 'Investissements', to: '/investissements' },
    { label: 'Fonctionnement', to: '/comment-ca-fonctionne' },
    { label: 'Calculateur', to: '/#calculateur' },
    { label: 'À propos', to: '/a-propos' },
    { label: 'FAQ', to: '/faq' },
  ];

  const primaryAction = user
    ? {
        label: user.isAdminSession && !cleanPath.startsWith('/dashboard')
          ? 'Administration'
          : 'Espace Client',
        to: user.isAdminSession && !cleanPath.startsWith('/dashboard')
          ? '/admin'
          : '/dashboard',
      }
    : { label: 'Se connecter', to: '/connexion' };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-slate-900">
      {/* Strict 3-zone Top Bar Contract */}
      <header className="sticky top-0 z-40 bg-[#FAF9F6]/95 backdrop-blur-sm border-b border-stone-200 no-print">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          {/* Zone 1: Single-element brand wordmark */}
          <button
            type="button"
            onClick={() => handleNav('/')}
            className="font-display text-xl font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#0F5132]"
          >
            {brandName}
          </button>

          {/* Zone 2: 5 concise single-line nav links */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600" aria-label="Navigation principale">
            {navLinks.map((item) => {
              const isActive = cleanPath === item.to;
              return (
                <button
                  key={item.to}
                  type="button"
                  onClick={() => handleNav(item.to)}
                  className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors cursor-pointer ${
                    isActive
                      ? 'text-slate-900 border-[#0F5132]'
                      : 'border-transparent hover:text-slate-900 hover:border-stone-300'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 primary action (plus mobile menu trigger on small screens) */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => handleNav(primaryAction.to)}
              className="px-4 py-2 text-xs sm:text-sm font-medium text-white bg-[#0F5132] rounded-lg hover:bg-[#0B3D25] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0F5132]"
            >
              {primaryAction.label}
            </button>
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              className="md:hidden p-2 rounded-lg border border-stone-200 text-slate-700 hover:bg-stone-100 cursor-pointer"
              aria-label="Ouvrir le menu"
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="md:hidden border-t border-stone-200 bg-white px-4 py-4 space-y-2">
            {navLinks.map((item) => (
              <button
                key={item.to}
                type="button"
                onClick={() => handleNav(item.to)}
                className="block w-full text-left px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-stone-100 rounded-lg"
              >
                {item.label}
              </button>
            ))}
            <div className="pt-2 border-t border-stone-200 flex gap-2">
              {!user ? (
                <button
                  type="button"
                  onClick={() => handleNav('/inscription')}
                  className="w-full px-4 py-2.5 text-sm font-medium text-slate-900 border border-stone-300 rounded-lg"
                >
                  Créer un compte
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleNav('/dashboard')}
                  className="w-full px-4 py-2.5 text-sm font-medium text-slate-900 border border-stone-300 rounded-lg"
                >
                  Tableau de bord
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">{children}</main>

      {/* Quiet Institutional Footer */}
      <footer className="bg-slate-950 text-stone-300 border-t border-slate-800 no-print">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-14">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 pb-10 border-b border-slate-800">
            <div className="space-y-3">
              <div className="font-display text-lg font-bold text-white">{brandName}</div>
              <p className="text-xs leading-relaxed text-stone-400">
                {cms.site_identity?.tagline || 'Une plateforme d’investissement pensée pour une gestion transparente et structurée.'}
              </p>
              <p className="text-xs text-stone-400">
                {cms.site_identity?.address || 'Boulevard du 13 Janvier, Lomé, Togo'}
              </p>
              <p className="text-xs font-mono text-stone-400">
                {cms.site_identity?.email || 'contact@investmarket.tg'} · {cms.site_identity?.phone || '+228 22 21 00 00'}
              </p>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-white mb-3">Plateforme</h3>
              <ul className="space-y-2 text-xs">
                <li><button type="button" onClick={() => handleNav('/')} className="hover:text-white cursor-pointer">Accueil</button></li>
                <li><button type="button" onClick={() => handleNav('/a-propos')} className="hover:text-white cursor-pointer">À propos</button></li>
                <li><button type="button" onClick={() => handleNav('/investissements')} className="hover:text-white cursor-pointer">Nos investissements</button></li>
                <li><button type="button" onClick={() => handleNav('/comment-ca-fonctionne')} className="hover:text-white cursor-pointer">Comment ça fonctionne</button></li>
                <li><button type="button" onClick={() => handleNav('/faq')} className="hover:text-white cursor-pointer">FAQ</button></li>
                <li><button type="button" onClick={() => handleNav('/contact')} className="hover:text-white cursor-pointer">Contact</button></li>
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-white mb-3">Espace Client</h3>
              <ul className="space-y-2 text-xs">
                <li><button type="button" onClick={() => handleNav('/connexion')} className="hover:text-white cursor-pointer">Connexion</button></li>
                <li><button type="button" onClick={() => handleNav('/inscription')} className="hover:text-white cursor-pointer">Créer un compte</button></li>
                <li><button type="button" onClick={() => handleNav('/dashboard')} className="hover:text-white cursor-pointer">Tableau de bord</button></li>
                <li><button type="button" onClick={() => handleNav('/dashboard/investissements')} className="hover:text-white cursor-pointer">Mes investissements</button></li>
                <li><button type="button" onClick={() => handleNav('/dashboard/transactions')} className="hover:text-white cursor-pointer">Mes transactions</button></li>
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-white mb-3">Conformité & Juridique</h3>
              <ul className="space-y-2 text-xs">
                <li><button type="button" onClick={() => handleNav('/conditions-generales')} className="hover:text-white cursor-pointer">Conditions générales</button></li>
                <li><button type="button" onClick={() => handleNav('/confidentialite')} className="hover:text-white cursor-pointer">Politique de confidentialité</button></li>
                <li><button type="button" onClick={() => handleNav('/avertissement-risques')} className="hover:text-white cursor-pointer">Avertissement sur les risques</button></li>
                <li><button type="button" onClick={() => handleNav('/documents-legaux')} className="hover:text-white cursor-pointer">Documents légaux</button></li>
              </ul>
            </div>
          </div>

          <div className="pt-8 space-y-3">
            <p className="text-xs text-stone-400 leading-relaxed">
              {cms.risk_warning?.bannerText ||
                'Avertissement : tout investissement comporte des risques, y compris un risque de perte partielle ou totale en capital. Les performances éventuelles présentées ne sont jamais garanties.'}
            </p>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-stone-500">
              <span>© {new Date().getFullYear()} {brandName}. Tous droits réservés. Devise de référence : FCFA (XOF).</span>
              <span>Moyens de paiement pris en charge : Flooz · TMoney · Virement UEMOA</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
