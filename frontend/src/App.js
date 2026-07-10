import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { LanguageProvider, useLanguage } from './contexts/LanguageContext';
import { Toaster, toast } from 'sonner';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Features from './components/Features';
import HowItWorks from './components/HowItWorks';
import USDTCalculator from './components/USDTCalculator';
import Security from './components/Security';
import Reviews from './components/Reviews';
import Footer from './components/Footer';
import ChatWidget from './components/ChatWidget';
import AdminOrNotFound from './components/AdminOrNotFound';
import LegalPage from './pages/LegalPage';
import axios from 'axios';

const HomePage = () => (
  <>
    <Hero />
    <Features />
    <HowItWorks />
    <USDTCalculator />
    <Security />
    <Reviews />
  </>
);

const MainLayout = ({ children }) => (
  <div className="min-h-screen bg-gradient-to-b from-[#06080F] via-[#0F1419] to-[#0a0e1a] text-white">
    <Navbar />
    {children}
    <Footer />
    <ChatWidget />
    <Toaster position="top-center" richColors />
  </div>
);

const isHomePath = (path) => path === '/' || path === '';

const RegionBlocked = () => {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen bg-[#06080F] flex flex-col items-center justify-center px-6 text-center">
      <p className="text-white text-lg mb-2">{t.errors.accessDeniedRegion}</p>
      <a href="/" className="text-blue-400 hover:underline text-sm">{t.admin.retry}</a>
    </div>
  );
};

const AppRoutes = () => {
  const location = useLocation();
  const { t } = useLanguage();
  const [isAllowed, setIsAllowed] = useState(() => !isHomePath(location.pathname));
  const [regionBlocked, setRegionBlocked] = useState(false);

  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 403) {
          const reqUrl = error.config?.url || '';
          const detail = error.response?.data?.detail;
          const onAdminPage = !isHomePath(window.location.pathname);
          if (reqUrl.includes('/api/admin/') || onAdminPage) {
            return Promise.reject(error);
          }
          if (detail === 'ACCESS_DENIED_REGION' || detail === 'BLACKLISTED') {
            setRegionBlocked(true);
            toast.error(
              detail === 'BLACKLISTED'
                ? (t.errors.blacklisted)
                : (t.errors.accessDeniedRegion)
            );
            return Promise.reject(error);
          }
        }
        return Promise.reject(error);
      }
    );

    const checkAccess = async () => {
      if (!isHomePath(location.pathname)) {
        setIsAllowed(true);
        return;
      }
      try {
        await axios.get('/api/config');
        setIsAllowed(true);
        setRegionBlocked(false);
      } catch (error) {
        if (error.response?.status === 403) {
          setRegionBlocked(true);
          setIsAllowed(false);
        } else {
          setIsAllowed(true);
        }
      }
    };

    checkAccess();

    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, [location.pathname, t]);

  if (regionBlocked) {
    return <RegionBlocked />;
  }

  if (!isAllowed) {
    return <div className="min-h-screen bg-[#06080F]"></div>;
  }

  return (
    <Routes>
      <Route
        path="/"
        element={
          <MainLayout>
            <HomePage />
          </MainLayout>
        }
      />
      <Route path="/terms" element={<LegalPage type="terms" />} />
      <Route path="/privacy" element={<LegalPage type="privacy" />} />
      <Route path="*" element={<AdminOrNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <LanguageProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </LanguageProvider>
  );
}

export default App;
