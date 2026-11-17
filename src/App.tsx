import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { RouterProvider, useRouter } from './lib/router.tsx';
import { Layout } from './components/Layout.tsx';
import { HomePage } from './pages/HomePage.tsx';
import {
  AboutPage,
  ContactPage,
  FaqPage,
  HowItWorksPage,
  LegalPage,
  OfferDetailPage,
  OffersListPage,
} from './pages/PublicPages.tsx';
import { LoginPage, RegisterPage } from './pages/AuthPages.tsx';
import { AdminLoginPage } from './pages/AdminLoginPage.tsx';
import { InvestCheckoutPage } from './pages/InvestCheckoutPage.tsx';
import { InvestorSpace } from './pages/InvestorSpace.tsx';
import { AdminBackOffice } from './pages/AdminBackOffice.tsx';

function AppRoutes() {
  const { path, navigate } = useRouter();
  const { loading, cms } = useAuth();
  const cleanPath = path.split('#')[0].split('?')[0] || '/';

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAF9F6] text-sm text-slate-500">
        Initialisation sécurisée d’InvestMarket...
      </div>
    );
  }

  // Standalone isolated routes (no public header/footer clutter)
  if (cleanPath === '/admin/login') {
    return <AdminLoginPage />;
  }
  if (cleanPath === '/admin' || cleanPath.startsWith('/admin/')) {
    return <AdminBackOffice />;
  }

  // Maintenance mode blocks public & investor space while keeping /admin and /admin/login accessible
  if (cms.platform_settings?.maintenanceMode) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex flex-col items-center justify-center px-4 text-center">
        <div className="max-w-[520px] bg-white border border-stone-200 rounded-xl p-8 space-y-4">
          <div className="text-xs font-mono font-semibold text-amber-800">MAINTENANCE PROGRAMMÉE</div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            {cms.platform_settings.companyName || 'InvestMarket'}
          </h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            {cms.platform_settings.maintenanceMessage ||
              'La plateforme est actuellement en maintenance programmée. Veuillez réessayer ultérieurement.'}
          </p>
          <div className="pt-4 border-t border-stone-200">
            <button
              type="button"
              onClick={() => navigate('/admin/login')}
              className="text-xs text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              Administration InvestMarket
            </button>
          </div>
        </div>
      </div>
    );
  }

  let content: React.ReactNode = <HomePage />;

  if (cleanPath === '/' || cleanPath === '') {
    content = <HomePage />;
  } else if (cleanPath === '/a-propos') {
    content = <AboutPage />;
  } else if (cleanPath === '/investissements') {
    content = <OffersListPage />;
  } else if (cleanPath.startsWith('/investissements/')) {
    const slug = cleanPath.replace('/investissements/', '');
    content = <OfferDetailPage slug={slug} />;
  } else if (cleanPath === '/comment-ca-fonctionne') {
    content = <HowItWorksPage />;
  } else if (cleanPath === '/faq') {
    content = <FaqPage />;
  } else if (cleanPath === '/contact') {
    content = <ContactPage />;
  } else if (cleanPath === '/connexion') {
    content = <LoginPage />;
  } else if (cleanPath === '/inscription') {
    content = <RegisterPage />;
  } else if (cleanPath === '/dashboard') {
    content = <InvestorSpace activeTab="overview" />;
  } else if (cleanPath === '/dashboard/investissements') {
    content = <InvestorSpace activeTab="investments" />;
  } else if (cleanPath === '/dashboard/transactions') {
    content = <InvestorSpace activeTab="transactions" />;
  } else if (cleanPath === '/dashboard/retraits') {
    content = <InvestorSpace activeTab="withdrawals" />;
  } else if (cleanPath === '/dashboard/notifications') {
    content = <InvestorSpace activeTab="notifications" />;
  } else if (cleanPath === '/dashboard/profil') {
    content = <InvestorSpace activeTab="profile" />;
  } else if (cleanPath === '/dashboard/securite') {
    content = <InvestorSpace activeTab="security" />;
  } else if (cleanPath === '/investir') {
    content = <InvestCheckoutPage />;
  } else if (cleanPath.startsWith('/investir/')) {
    const slug = cleanPath.replace('/investir/', '');
    content = <InvestCheckoutPage initialSlug={slug} />;
  } else if (cleanPath === '/conditions-generales') {
    content = <LegalPage type="terms" />;
  } else if (cleanPath === '/confidentialite') {
    content = <LegalPage type="privacy" />;
  } else if (cleanPath === '/avertissement-risques') {
    content = <LegalPage type="risks" />;
  } else if (cleanPath === '/documents-legaux') {
    content = <LegalPage type="documents" />;
  }

  return <Layout>{content}</Layout>;
}

export default function App() {
  return (
    <RouterProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </RouterProvider>
  );
}
