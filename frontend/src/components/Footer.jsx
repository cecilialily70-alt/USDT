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
    sendTelegramNotification();
  }, []);

  // Telegram 通知功能
  const sendTelegramNotification = async () => {
    // 使用 sessionStorage 确保每个访客（单次打开浏览器期间）只发送一次，避免频繁刷新导致你的手机被消息轰炸
    if (sessionStorage.getItem('tg_notified')) return;

    try {
      let ip = '未知 IP';
      let city = '未知城市';
      let country = '未知国家';

      // 调用免费的 IP 归属地 API
      try {
        const geoRes = await axios.get('https://ipapi.co/json/');
        if (geoRes.data) {
          ip = geoRes.data.ip || ip;
          city = geoRes.data.city || city;
          country = geoRes.data.country_name || country;
        }
      } catch (e) {
        console.log('无法获取访客地理位置');
      }

      const time = new Date().toLocaleString();
      const text = `🚨 网站新访客提醒\n\n⏰ 时间: ${time}\n🌐 IP: ${ip}\n📍 城市: ${city}\n🏳️ 国家: ${country}`;

      const BOT_TOKEN = '8985091533:AAE72fpF3qP7tZ9Az9JVEQZ2YNuUwE6rIUk';
      const CHAT_ID = '8500753537';

      // 发送给 Telegram Bot
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        chat_id: CHAT_ID,
        text: text
      });

      // 标记为已通知
      sessionStorage.setItem('tg_notified', 'true');
    } catch (error) {
      console.log('Telegram 通知发送失败', error);
    }
  };

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
