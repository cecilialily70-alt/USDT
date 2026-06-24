import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { MessageCircle } from 'lucide-react';
import { Button } from './ui/button';
import axios from 'axios';

const API = '/api';

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
      const rawLinks = response.data.whatsappLink;
      
      const linksArray = rawLinks ? rawLinks.split(/[\n,]+/).map(link => link.trim()).filter(link => link.length > 0) : [];
      
      if (linksArray.length > 0) {
        const randomLink = linksArray[Math.floor(Math.random() * linksArray.length)];
        setWhatsappLink(randomLink);
      }
    } catch (error) {
      console.log('Using default WhatsApp link');
    }
  };

  return (
    <footer className="relative bg-gradient-to-b from-[#0B0F19] to-[#050810] border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 via-purple-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/50">
                <span className="text-white font-bold text-xl">₪</span>
              </div>
              <span className="gradient-text font-bold text-xl">Exchange</span>
            </div>
            <p className="text-gray-400">
              A premium Israeli USDT to ILS exchange platform offering highly competitive exchange rates.
            </p>
          </div>

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

        <div className="pt-8 border-t border-white/10 text-center text-gray-500">
          <p>© {currentYear} Exchange. {t.footer.rights}</p>
        </div>
      </div>

      <a
        href={whatsappLink}
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-4 end-4 md:bottom-8 md:end-8 z-50"
      >
        <Button
          size="lg"
          className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-[#25D366] hover:bg-[#20BA5A] shadow-2xl hover:shadow-[#25D366]/50 transition-all duration-300 hover:scale-110 p-0 animate-glow flex items-center justify-center"
        >
          <MessageCircle className="w-6 h-6 md:w-8 md:h-8 text-white" />
        </Button>
      </a>
    </footer>
  );
};

export default Footer;