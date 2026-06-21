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

    // 处理可能包含多个客服链接的字符串，实现随机分配
    const linksArray = whatsappLink 
      ? whatsappLink.split(/[\n,]+/).map(link => link.trim()).filter(link => link.length > 0) 
      : [];
      
    // 随机选择一个链接，如果为空则使用系统默认链接
    const selectedLink = linksArray.length > 0 
      ? linksArray[Math.floor(Math.random() * linksArray.length)] 
      : 'https://wa.me/972552452669';

    const message = tradeType === 'buy'
      ? `Hi, I want to buy ${usdtAmount} USDT for ${ilsAmount} ILS`
      : `Hi, I want to sell ${usdtAmount} USDT for ${ilsAmount} ILS`;

    const encodedMessage = encodeURIComponent(message);
    window.open(`${selectedLink}?text=${encodedMessage}`, '_blank');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gradient-to-br from-[#0F1419]/95 to-[#06080F]/95 border border-white/10 backdrop-blur-xl sm:max-w-md">
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
          {/* Exchange Rate Display */}
          <div className="glass-card rounded-xl p-4 text-center">
            <div className="text-sm text-gray-400 mb-1">{t.tradeModal?.exchangeRate || 'Exchange Rate'}</div>
            <div className="text-2xl font-bold gradient-text">1 USDT = {rate} ILS</div>
          </div>

          {/* USDT Input */}
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
                className="bg-[#0a0e1a]/50 border-white/10 text-white text-lg h-14 pr-16 focus:border-blue-500 focus:ring-blue-500"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">
                USDT
              </div>
            </div>
          </div>

          {/* Swap Icon */}
          <div className="flex justify-center">
            <div className="p-2 rounded-full bg-gradient-to-r from-blue-500 to-purple-500">
              <ArrowDownUp className="w-5 h-5 text-white" />
            </div>
          </div>

          {/* ILS Input */}
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
                className="bg-[#0a0e1a]/50 border-white/10 text-white text-lg h-14 pr-16 focus:border-blue-500 focus:ring-blue-500"
              />
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-semibold">
                ₪ ILS
              </div>
            </div>
          </div>

          {/* Action Buttons */}
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
