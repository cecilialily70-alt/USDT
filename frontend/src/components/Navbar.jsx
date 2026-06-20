import React, { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { supportedLanguages } from '../i18n/translations';
import { Menu, X, Globe } from 'lucide-react';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

const Navbar = () => {
  const { t, currentLanguage, changeLanguage, isRTL } = useLanguage();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const scrollToSection = (sectionId) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
      setIsMobileMenuOpen(false);
    }
  };

  return (
    <nav className="fixed top-0 w-full z-50 bg-[#0B0F19]/95 backdrop-blur-md border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#26A17B] to-[#1a7a5e] flex items-center justify-center">
              <span className="text-white font-bold text-xl">₪</span>
            </div>
            <span className="text-white font-bold text-xl">Shekel</span>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            <button
              onClick={() => scrollToSection('home')}
              className="text-gray-300 hover:text-[#26A17B] transition-colors"
            >
              {t.navbar.home}
            </button>
            <button
              onClick={() => scrollToSection('features')}
              className="text-gray-300 hover:text-[#26A17B] transition-colors"
            >
              {t.navbar.features}
            </button>
            <button
              onClick={() => scrollToSection('how-it-works')}
              className="text-gray-300 hover:text-[#26A17B] transition-colors"
            >
              {t.navbar.howItWorks}
            </button>
            <button
              onClick={() => scrollToSection('security')}
              className="text-gray-300 hover:text-[#26A17B] transition-colors"
            >
              {t.navbar.security}
            </button>
            <button
              onClick={() => scrollToSection('reviews')}
              className="text-gray-300 hover:text-[#26A17B] transition-colors"
            >
              {t.navbar.reviews}
            </button>
          </div>

          {/* Right Side - Language Switcher & Connect Wallet */}
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
              <DropdownMenuContent align={isRTL ? 'start' : 'end'} className="bg-[#1a2332] border-white/10">
                {supportedLanguages.map((lang) => (
                  <DropdownMenuItem
                    key={lang.code}
                    onClick={() => changeLanguage(lang.code)}
                    className={`cursor-pointer text-gray-300 hover:text-white hover:bg-white/10 ${currentLanguage === lang.code ? 'bg-white/10 text-[#26A17B]' : ''}`}
                  >
                    <span className="me-2">{lang.flag}</span>
                    {lang.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Connect Wallet Button - Desktop */}
            <Button
              className="hidden md:inline-flex bg-[#26A17B] hover:bg-[#1f8a66] text-white"
            >
              {t.navbar.connectWallet}
            </Button>

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
                className="text-gray-300 hover:text-[#26A17B] transition-colors text-start ps-4"
              >
                {t.navbar.home}
              </button>
              <button
                onClick={() => scrollToSection('features')}
                className="text-gray-300 hover:text-[#26A17B] transition-colors text-start ps-4"
              >
                {t.navbar.features}
              </button>
              <button
                onClick={() => scrollToSection('how-it-works')}
                className="text-gray-300 hover:text-[#26A17B] transition-colors text-start ps-4"
              >
                {t.navbar.howItWorks}
              </button>
              <button
                onClick={() => scrollToSection('security')}
                className="text-gray-300 hover:text-[#26A17B] transition-colors text-start ps-4"
              >
                {t.navbar.security}
              </button>
              <button
                onClick={() => scrollToSection('reviews')}
                className="text-gray-300 hover:text-[#26A17B] transition-colors text-start ps-4"
              >
                {t.navbar.reviews}
              </button>
              <Button
                className="bg-[#26A17B] hover:bg-[#1f8a66] text-white mx-4"
              >
                {t.navbar.connectWallet}
              </Button>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;