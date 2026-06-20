import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { MessageCircle } from 'lucide-react';
import { Button } from './ui/button';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Footer = () => {
  const { t } = useLanguage();
  const currentYear = new Date().getFullYear();
  const [whatsappLink, setWhatsappLink] = useState('https://wa.me/972552452669');

  useEffect(() => {
    fetchWhatsappLink();
  }, []);

  const fetchWhatsappLink = async () => {
    try {
      const response = await axios.get(`${API}/config`);
      setWhatsappLink(response.data.whatsappLink);
    } catch (error) {
      console.log('Using default WhatsApp link');
    }
  };

  return (
    <footer className="relative bg-gradient-to-b from-[#0B0F19] to-[#050810] border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Top Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#26A17B] to-[#1a7a5e] flex items-center justify-center">
                <span className="text-white font-bold text-xl">₪</span>
              </div>
              <span className="text-white font-bold text-xl">Shekel</span>
            </div>
            <p className="text-gray-400">
              {t.footer.description}
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-white font-semibold mb-4">Quick Links</h3>
            <div className="flex flex-col gap-2">
              <a href="#home" className="text-gray-400 hover:text-[#26A17B] transition-colors">
                {t.navbar.home}
              </a>
              <a href="#features" className="text-gray-400 hover:text-[#26A17B] transition-colors">
                {t.navbar.features}
              </a>
              <a href="#how-it-works" className="text-gray-400 hover:text-[#26A17B] transition-colors">
                {t.navbar.howItWorks}
              </a>
              <a href="#reviews" className="text-gray-400 hover:text-[#26A17B] transition-colors">
                {t.navbar.reviews}
              </a>
            </div>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-white font-semibold mb-4">Legal</h3>
            <div className="flex flex-col gap-2">
              <a href="#" className="text-gray-400 hover:text-[#26A17B] transition-colors">
                {t.footer.terms}
              </a>
              <a href="#" className="text-gray-400 hover:text-[#26A17B] transition-colors">
                {t.footer.privacy}
              </a>
              <a href="#" className="text-gray-400 hover:text-[#26A17B] transition-colors">
                {t.footer.contact}
              </a>
            </div>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="pt-8 border-t border-white/10 text-center text-gray-500">
          <p>© {currentYear} Shekel. {t.footer.rights}</p>
        </div>
      </div>

      {/* WhatsApp Floating Button */}
      <a
        href={whatsappLink}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-8 end-8 z-50"
      >
        <Button
          size="lg"
          className="w-16 h-16 rounded-full bg-[#25D366] hover:bg-[#20BA5A] shadow-2xl hover:shadow-[#25D366]/50 transition-all duration-300 hover:scale-110 p-0 animate-glow"
        >
          <MessageCircle className="w-8 h-8 text-white" />
        </Button>
      </a>
    </footer>
  );
};

export default Footer;