import React, { useEffect, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { CheckCircle2, ArrowDownUp } from 'lucide-react';

const Hero = () => {
  const { t, isRTL } = useLanguage();
  const [floatingIcons, setFloatingIcons] = useState([]);

  useEffect(() => {
    // Create floating crypto icons
    const icons = [
      { symbol: '₿', color: '#F7931A', size: 40, x: 10, y: 20 },
      { symbol: 'Ξ', color: '#627EEA', size: 35, x: 85, y: 15 },
      { symbol: '₮', color: '#26A17B', size: 50, x: 15, y: 70 },
      { symbol: '₪', color: '#26A17B', size: 45, x: 80, y: 65 },
      { symbol: '◆', color: '#0052FF', size: 30, x: 50, y: 10 },
    ];
    setFloatingIcons(icons);
  }, []);

  return (
    <section id="home" className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-b from-[#0B0F19] via-[#0f1621] to-[#0B0F19] pt-16">
      {/* Animated Background Grid */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(rgba(38, 161, 123, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(38, 161, 123, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px'
        }}></div>
      </div>

      {/* Floating Crypto Icons */}
      {floatingIcons.map((icon, index) => (
        <div
          key={index}
          className="absolute text-4xl animate-pulse opacity-20"
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

      {/* Main Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center">
          {/* Badge */}
          <Badge className="mb-6 bg-[#26A17B]/20 text-[#26A17B] border border-[#26A17B]/30 hover:bg-[#26A17B]/30 text-sm px-4 py-2">
            <CheckCircle2 className="w-4 h-4 me-2" />
            {t.hero.badge}
          </Badge>

          {/* Main Title */}
          <h1 className="text-5xl md:text-7xl font-bold text-white mb-6 leading-tight">
            {t.hero.title}
          </h1>

          {/* Subtitle */}
          <h2 className="text-2xl md:text-3xl font-semibold text-[#26A17B] mb-4">
            {t.hero.subtitle}
          </h2>

          {/* Description */}
          <p className="text-gray-400 text-lg md:text-xl mb-12 max-w-3xl mx-auto">
            {t.hero.description}
          </p>

          {/* Exchange Rate Cards */}
          <div className="flex flex-col md:flex-row gap-6 justify-center mb-12 max-w-4xl mx-auto">
            {/* Buy USDT Card */}
            <div className="flex-1 bg-gradient-to-br from-[#1a2332] to-[#0f1621] border border-[#26A17B]/30 rounded-2xl p-8 hover:border-[#26A17B]/60 transition-all duration-300 hover:shadow-lg hover:shadow-[#26A17B]/20">
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-[#26A17B]/20 flex items-center justify-center">
                  <span className="text-2xl">₮</span>
                </div>
                <ArrowDownUp className="w-5 h-5 text-[#26A17B]" />
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <span className="text-2xl">₪</span>
                </div>
              </div>
              <div className="text-sm text-gray-400 mb-2">{t.hero.buyUSDT}</div>
              <div className="text-3xl font-bold text-[#26A17B]">{t.hero.buyRate}</div>
            </div>

            {/* Sell USDT Card */}
            <div className="flex-1 bg-gradient-to-br from-[#1a2332] to-[#0f1621] border border-white/10 rounded-2xl p-8 hover:border-[#26A17B]/60 transition-all duration-300 hover:shadow-lg hover:shadow-[#26A17B]/20">
              <div className="flex items-center justify-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <span className="text-2xl">₪</span>
                </div>
                <ArrowDownUp className="w-5 h-5 text-gray-400" />
                <div className="w-10 h-10 rounded-full bg-[#26A17B]/20 flex items-center justify-center">
                  <span className="text-2xl">₮</span>
                </div>
              </div>
              <div className="text-sm text-gray-400 mb-2">{t.hero.sellUSDT}</div>
              <div className="text-3xl font-bold text-white">{t.hero.sellRate}</div>
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              size="lg"
              className="bg-[#26A17B] hover:bg-[#1f8a66] text-white text-lg px-8 py-6 rounded-xl shadow-lg hover:shadow-[#26A17B]/50 transition-all duration-300 hover:scale-105"
            >
              {t.hero.buyUSDT}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-[#26A17B] text-[#26A17B] hover:bg-[#26A17B] hover:text-white text-lg px-8 py-6 rounded-xl transition-all duration-300 hover:scale-105"
            >
              {t.hero.sellUSDT}
            </Button>
          </div>
        </div>
      </div>

      {/* Bottom Gradient Fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#0B0F19] to-transparent"></div>
    </section>
  );
};

export default Hero;