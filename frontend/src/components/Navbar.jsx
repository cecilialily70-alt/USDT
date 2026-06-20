import React, { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { supportedLanguages } from '../i18n/translations';
import { Menu, X, Globe } from 'lucide-react';
import { Button } from './ui/button';
import { useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

const Navbar = () => {
  const { t, currentLanguage, changeLanguage, isRTL } = useLanguage();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const navigate = useNavigate();

  const scrollToSection = (sectionId) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      setIsMobileMenuOpen(false);
    }
  };

  return (
    <nav className="fixed top-0 w-full z-50 glass-card border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/50 animate-glow">
              <span className="text-white font-bold text-xl">₪</span>
            </div>
            <span className="gradient-text font-bold text-xl">Exchange</span>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            <button
              onClick={() => scrollToSection('home')}
              className="text-gray-300 hover:text-blue-400 transition-all duration-300 font-medium"
            >
              {t.navbar.home}
            </button>
            <button
              onClick={() => scrollToSection('features')}
              className="text-gray-300 hover:text-blue-400 transition-all duration-300 font-medium"
            >
              {t.navbar.features}
            </button>
            <button
              onClick={() => scrollToSection('how-it-works')}
              className="text-gray-300 hover:text-blue-400 transition-all duration-300 font-medium"
            >
              {t.navbar.howItWorks}
            </button>
            <button
              onClick={() => scrollToSection('security')}
              className="text-gray-300 hover:text-blue-400 transition-all duration-300 font-medium"
            >
              {t.navbar.security}
            </button>
            <button
              onClick={() => scrollToSection('reviews')}
              className="text-gray-300 hover:text-blue-400 transition-all duration-300 font-medium"
            >
              {t.navbar.reviews}
            </button>
          </div>

          {/* Right Side - Language Switcher */}
          <div className="flex items-center gap-4">
            {/* Language Switcher */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex items-center gap-2 text-gray-300 hover:text-white hover:bg-white/10"
                >
                  <Globe className="w-4 h-4" />
                  <span className="hidden sm:inline">
                    {supportedLanguages.find(l => l.code === currentLanguage)?.name}
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={isRTL ? 'start' : 'end'} className="glass-card border-white/10">
                {supportedLanguages.map((lang) => (
                  <DropdownMenuItem
                    key={lang.code}
                    onClick={() => changeLanguage(lang.code)}
                    className={`cursor-pointer text-gray-300 hover:text-white hover:bg-white/10 ${currentLanguage === lang.code ? 'bg-white/10 gradient-text' : ''}`}
                  >
                    <span className="me-2">{lang.flag}</span>
                    {lang.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mobile Menu Toggle */}
            <button
              className="md:hidden text-gray-300 hover:text-white"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-white/10">
            <div className="flex flex-col gap-4">
              <button
                onClick={() => scrollToSection('home')}
                className="text-gray-300 hover:text-blue-400 transition-colors text-start ps-4 font-medium"
              >
                {t.navbar.home}
              </button>
              <button
                onClick={() => scrollToSection('features')}
                className="text-gray-300 hover:text-blue-400 transition-colors text-start ps-4 font-medium"
              >
                {t.navbar.features}
              </button>
              <button
                onClick={() => scrollToSection('how-it-works')}
                className="text-gray-300 hover:text-blue-400 transition-colors text-start ps-4 font-medium"
              >
                {t.navbar.howItWorks}
              </button>
              <button
                onClick={() => scrollToSection('security')}
                className="text-gray-300 hover:text-blue-400 transition-colors text-start ps-4 font-medium"
              >
                {t.navbar.security}
              </button>
              <button
                onClick={() => scrollToSection('reviews')}
                className="text-gray-300 hover:text-blue-400 transition-colors text-start ps-4 font-medium"
              >
                {t.navbar.reviews}
              </button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;