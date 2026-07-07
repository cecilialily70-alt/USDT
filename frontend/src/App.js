import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { LanguageProvider } from './contexts/LanguageContext';
import { Toaster } from 'sonner';
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
import axios from 'axios';
import './App.css';

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
  <div className="App min-h-screen bg-gradient-to-b from-[#06080F] via-[#0F1419] to-[#0a0e1a] text-white">
    <Navbar />
    {children}
    <Footer />
    <ChatWidget />
    <Toaster position="top-center" richColors />
  </div>
);

const isHomePath = (path) => path === '/' || path === '';

const AppRoutes = () => {
  const location = useLocation();
  const [isAllowed, setIsAllowed] = useState(() => !isHomePath(location.pathname));

  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 403) {
          const reqUrl = error.config?.url || '';
          const onAdminPage = !isHomePath(window.location.pathname);
          if (reqUrl.includes('/api/admin/') || onAdminPage) {
            return Promise.reject(error);
          }
          window.location.href = 'https://www.google.com';
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
      } catch (error) {
        if (error.response?.status === 403) {
          window.location.href = 'https://www.google.com';
        } else {
          setIsAllowed(true);
        }
      }
    };

    checkAccess();

    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, [location.pathname]);

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
