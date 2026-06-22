import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { ArrowDownUp, MessageCircle, X } from 'lucide-react';
import { toast } from 'sonner';

const TradeModal = ({ isOpen, onClose, tradeType = 'buy', buyRate = 4.4, sellRate = 3.3, whatsappLink }) => {
  const { t } = useLanguage();
  const [usdtAmount, setUsdtAmount] = useState('');
  const [ilsAmount, setIlsAmount] = useState('');
  const [activeInput, setActiveInput] = useState('usdt');

  const rate = tradeType === 'buy' ? buyRate : sellRate;

  useEffect(() => {
    if (activeInput === 'usdt' && usdtAmount) {
      const calculated = (parseFloat(usdtAmount) * rate).toFixed(2);
      setIlsAmount(calculated);
    } else if (activeInput === 'ils' && ilsAmount) {
      const calculated = (parseFloat(ilsAmount) / rate).toFixed(2);
      setUsdtAmount(calculated);
    }
  }, [usdtAmount, ilsAmount, activeInput, rate]);

  const handleUsdtChange = (e) => {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setActiveInput('usdt');
      setUsdtAmount(value);
    }
  };

  const handleIlsChange = (e) => {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setActiveInput('ils');
      setIlsAmount(value);
    }
  };

  const handleContactTrader = () => {
    if (!usdtAmount || parseFloat(usdtAmount) <= 0) {
      toast.error(t.tradeModal?.errorTitle || 'Error', {
        description: t.tradeModal?.errorAmount || 'Please enter a valid amount',
      });
      return;
    }

    const linksArray = whatsappLink 
      ? whatsappLink.split(/[\n,]+/).map(link => link.trim()).filter(link => link.length > 0) 
      : [];
      
    const selectedLink = linksArray.length > 0 
      ? linksArray[Math.floor(Math.random() * linksArray.length)] 
      : 'https://wa.me/972552452669';

    const template = tradeType === 'buy' 
      ? (t.tradeModal?.whatsappBuy || 'Hi, I want to buy {usdt} USDT for {ils} ILS')
      : (t.tradeModal?.whatsappSell || 'Hi, I want to sell {usdt} USDT for {ils} ILS');
      
    const message = template.replace('{usdt}', usdtAmount).replace('{ils}', ilsAmount);
    const encodedMessage = encodeURIComponent(message);
    
    const finalUrl = selectedLink.includes('?') 
      ? `${selectedLink}&text=${encodedMessage}`
      : `${selectedLink}?text=${encodedMessage}`;

    window.open(finalUrl, '_blank', 'noopener,noreferrer');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="!top-auto !bottom-0 !translate-y-0 sm:!top-[50%] sm:!-translate-y-1/2 w-full sm:max-w-md bg-gradient-to-br from-[#0F1419]/95 to-[#06080F]/95 border-t border-white/10 sm:border rounded-t-3xl sm:rounded-xl backdrop-blur-xl max-h-[85vh] overflow-y-auto pb-8 sm:pb-6">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">
            <span className="gradient-text">
              {tradeType === 'buy' ? (t.tradeModal?.buyTitle || 'Buy USDT') : (t.tradeModal?.sellTitle || 'Sell USDT')}
            </span>
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            {t.tradeModal?.subtitle || 'Enter the amount you want to trade'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="glass-card rounded-xl p-4 text-center">
            <div className="text-sm text-gray-400 mb-1">{t.tradeModal?.exchangeRate || 'Exchange Rate'}</div>
            <div className="text-2xl font-bold gradient-text">1 USDT = {rate} ILS</div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="usdt-input" className="text-gray-300">
              {t.tradeModal?.usdtAmount || 'USDT Amount'}
            </Label>
            <div className="relative">
              <Input
                id="usdt-input"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={usdtAmount}
                onChange={handleUsdtChange}
                onFocus={(e) => e.target.select()} 
                /* 【核心优化】使用 pe-16 逻辑边距，自动适配 RTL 和 LTR 语言排版 */
                className="bg-[#0a0e1a]/50 border-white/10 text-white text-lg h-14 pe-16 focus:border-blue-500 focus:ring-blue-500"
              />
              {/* 【核心优化】使用 end-4 逻辑定位 */}
              <div className="absolute end-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold pointer-events-none">
                USDT
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <div className="p-2 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 shadow-lg shadow-blue-500/20">
              <ArrowDownUp className="w-5 h-5 text-white" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ils-input" className="text-gray-300">
              {t.tradeModal?.ilsAmount || 'ILS Amount'}
            </Label>
            <div className="relative">
              <Input
                id="ils-input"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={ilsAmount}
                onChange={handleIlsChange}
                onFocus={(e) => e.target.select()}
                /* 【核心优化】使用 pe-16 逻辑边距 */
                className="bg-[#0a0e1a]/50 border-white/10 text-white text-lg h-14 pe-16 focus:border-blue-500 focus:ring-blue-500"
              />
              {/* 【核心优化】使用 end-4 逻辑定位 */}
              <div className="absolute end-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold pointer-events-none">
                ₪ ILS
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              onClick={onClose}
              variant="outline"
              className="flex-1 border-white/10 hover:bg-white/5 text-gray-300 h-12"
            >
              <X className="w-4 h-4 me-2" />
              {t.tradeModal?.cancel || 'Cancel'}
            </Button>
            <Button
              onClick={handleContactTrader}
              className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white h-12 font-semibold shadow-lg hover:shadow-blue-500/50 transition-all duration-300"
            >
              <MessageCircle className="w-4 h-4 me-2" />
              {t.tradeModal?.contactTrader || 'Contact Trader'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TradeModal;