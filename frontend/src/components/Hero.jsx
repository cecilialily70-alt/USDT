import React, { useEffect, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { CheckCircle2, ArrowDownUp, TrendingUp } from 'lucide-react';
import TradeModal from './TradeModal';
import axios from 'axios';

const API = '/api';

const Hero = () => {
  const { t, isRTL } = useLanguage();
  const [floatingIcons, setFloatingIcons] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [tradeType, setTradeType] = useState('buy');
  const [config, setConfig] = useState({
    buyRate: 4.4,
    sellRate: 3.3,
  });

  useEffect(() => {
    fetchConfig();
    
    const icons = [
      { symbol: '₿', color: '#F7931A', size: 40, x: 10, y: 20 },
      { symbol: 'Ξ', color: '#627EEA', size: 35, x: 85, y: 15 },
      { symbol: '₮', color: '#26A17B', size: 50, x: 15, y: 70 },
      { symbol: '₪', color: '#3B82F6', size: 45, x: 80, y: 65 },
      { symbol: '◆', color: '#8B5CF6', size: 30, x: 50, y: 10 },
    ];
    setFloatingIcons(icons);
  }, []);

  const fetchConfig = async () => {
    try {
      const response = await axios.get(`${API}/config`);
      setConfig(response.data);
    } catch (error) {
      console.log('Using default config');
    }
  };

  const handleTrade = (type) => {
    setTradeType(type);
    setIsModalOpen(true);
  };

  return (
    <section id="home" className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-b from-[#06080F] via-[#0F1419] to-[#0a0e1a] pt-16">
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(rgba(59, 130, 246, 0.15) 1px, transparent 1px),
            linear-gradient(90deg, rgba(139, 92, 246, 0.15) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
          animation: 'grid-shift 20s linear infinite'
        }}></div>
      </div>

      {floatingIcons.map((icon, index) => (
        <div
          key={index}
          className="absolute animate-pulse opacity-20"
          style={{
            left: `${icon.x}%`,
            top: `${icon.y}%`,
            color: icon.color,
            fontSize: `${icon.size}px`,
            animationDelay: `${index * 0.5}s`,
            animationDuration: `${3 + index}s`
          }}
        >
          {icon.symbol}
        </div>
      ))}

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center flex flex-col">
          
          {/* Badge 永远放第一位 */}
          <div className="order-1 flex justify-center mb-6">
            <Badge className="glass-card border border-blue-500/30 hover:border-blue-500/60 text-sm px-4 py-2 shadow-lg shadow-blue-500/20">
              <CheckCircle2 className="w-4 h-4 me-2 text-blue-400" />
              <span className="gradient-text font-semibold">{t.hero.badge}</span>
            </Badge>
          </div>

          {/* Exchange Rate Cards - 手机排第2位，电脑排第5位(最下方) */}
          <div className="order-2 md:order-5 flex flex-col md:flex-row gap-6 justify-center mb-6 md:mb-12 max-w-4xl mx-auto w-full">
            <div className="flex-1 glass-card border border-green-500/30 rounded-2xl p-8 hover:border-green-500/60 transition-all duration-300 hover:shadow-xl hover:shadow-green-500/20 metal-shine group">
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-400 to-green-600 flex items-center justify-center shadow-lg">
                  <TrendingUp className="w-6 h-6 text-white" />
                </div>
                <ArrowDownUp className="w-5 h-5 text-green-400" />
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-lg">
                  <span className="text-xl">₪</span>
                </div>
              </div>
              <div className="text-sm text-gray-400 mb-2">{t.hero.buyUSDT}</div>
              <div className="text-3xl font-bold gradient-text mb-4">
                1 USDT = {config.buyRate} ILS
              </div>
              <Button
                onClick={() => handleTrade('buy')}
                className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold shadow-lg hover:shadow-green-500/50 transition-all duration-300"
              >
                {t.hero.buyUSDT}
              </Button>
            </div>

            <div className="flex-1 glass-card border border-blue-500/30 rounded-2xl p-8 hover:border-blue-500/60 transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/20 metal-shine group">
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center shadow-lg">
                  <span className="text-xl">₪</span>
                </div>
                <ArrowDownUp className="w-5 h-5 text-blue-400" />
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-400 to-purple-600 flex items-center justify-center shadow-lg">
                  <span className="text-xl">₮</span>
                </div>
              </div>
              <div className="text-sm text-gray-400 mb-2">{t.hero.sellUSDT}</div>
              <div className="text-3xl font-bold gradient-text mb-4">
                1 USDT = {config.sellRate} ILS
              </div>
              <Button
                onClick={() => handleTrade('sell')}
                className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-semibold shadow-lg hover:shadow-blue-500/50 transition-all duration-300"
              >
                {t.hero.sellUSDT}
              </Button>
            </div>
          </div>

          {/* Main Title - 手机排第3位，电脑排第2位 */}
          <h1 className="order-3 md:order-2 text-5xl md:text-7xl font-bold text-white mb-6 leading-tight mt-6 md:mt-0">
            <span className="gradient-text">{t.hero.title}</span>
          </h1>

          {/* Subtitle - 手机排第4位，电脑排第3位 */}
          <h2 className="order-4 md:order-3 text-2xl md:text-3xl font-semibold text-blue-300 mb-4">
            {t.hero.subtitle}
          </h2>

          {/* Description - 手机排第5位，电脑排第4位 */}
          <p className="order-5 md:order-4 text-gray-400 text-lg md:text-xl mb-12 max-w-3xl mx-auto leading-relaxed">
            {t.hero.description}
          </p>

        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#0a0e1a] to-transparent"></div>

      <TradeModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        tradeType={tradeType}
        buyRate={config.buyRate}
        sellRate={config.sellRate}
      />

      <style jsx>{`
        @keyframes grid-shift {
          0% { transform: translate(0, 0); }
          100% { transform: translate(50px, 50px); }
        }
      `}</style>
    </section>
  );
};

export default Hero;