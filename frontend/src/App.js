import React from 'react';
import { LanguageProvider } from './contexts/LanguageContext';
import { Toaster } from './components/ui/sonner';
import Navbar from './components/Navbar';
import Hero from './components/Hero';
import Features from './components/Features';
import HowItWorks from './components/HowItWorks';
import USDTCalculator from './components/USDTCalculator';
import Security from './components/Security';
import Reviews from './components/Reviews';
import Footer from './components/Footer';
import './App.css';

function App() {
  return (
    <LanguageProvider>
      <div className="App min-h-screen bg-[#0B0F19] text-white">
        <Navbar />
        <Hero />
        <Features />
        <HowItWorks />
        <USDTCalculator />
        <Security />
        <Reviews />
        <Footer />
        <Toaster />
      </div>
    </LanguageProvider>
  );
}

export default App;