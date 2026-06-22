import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
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
import AdminOrNotFound from './components/AdminOrNotFound';
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

function App() {
  return (
    <LanguageProvider>
      <BrowserRouter>
        <div className="App min-h-screen bg-gradient-to-b from-[#06080F] via-[#0F1419] to-[#0a0e1a] text-white">
          <Navbar />
          <Routes>
            <Route path="/" element={<HomePage />} />
            {/* 拦截所有其它未知路径，交给嗅探器判断是否为后台 */}
            <Route path="*" element={<AdminOrNotFound />} />
          </Routes>
          <Footer />
          <Toaster />
        </div>
      </BrowserRouter>
    </LanguageProvider>
  );
}

export default App;