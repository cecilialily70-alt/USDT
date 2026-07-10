import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ArrowLeftRight, MessageSquare, X } from 'lucide-react';
import { toast } from 'sonner';

const TradeModal = ({ isOpen, onClose, tradeType = 'buy', buyRate = 4.4, sellRate = 3.3 }) => {
  const { t } = useLanguage();
  const [usdtAmount, setUsdtAmount] = useState('');
  const [ilsAmount, setIlsAmount] = useState('');
  const [activeInput, setActiveInput] = useState('usdt');

  const rate = tradeType === 'buy' ? buyRate : sellRate;

  useEffect(() => {
    if (!isOpen) {
      setUsdtAmount('');
      setIlsAmount('');
      setActiveInput('usdt');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    if (activeInput === 'usdt') {
      if (!usdtAmount || isNaN(parseFloat(usdtAmount))) {
        setIlsAmount('');
        return;
      }
      setIlsAmount((parseFloat(usdtAmount) * rate).toFixed(2));
    } else if (activeInput === 'ils') {
      if (!ilsAmount || isNaN(parseFloat(ilsAmount))) {
        setUsdtAmount('');
        return;
      }
      setUsdtAmount((parseFloat(ilsAmount) / rate).toFixed(2));
    }
  }, [usdtAmount, ilsAmount, activeInput, rate, isOpen]);

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

  const handleContactSupport = () => {
    if (!usdtAmount || parseFloat(usdtAmount) <= 0) {
      toast.error(t.tradeModal?.errorTitle || 'Error', {
        description: t.tradeModal?.errorAmount || 'Please enter a valid amount',
      });
      return;
    }

    const template = tradeType === 'buy'
      ? (t.tradeModal?.chatBuy || 'Hi, I want to buy {usdt} USDT for {ils} ILS')
      : (t.tradeModal?.chatSell || 'Hi, I want to sell {usdt} USDT for {ils} ILS');

    const message = template.replace('{usdt}', usdtAmount).replace('{ils}', ilsAmount);
    window.dispatchEvent(new CustomEvent('open-chat', { detail: { draft: message } }));
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="!top-3 !translate-y-0 sm:!top-[50%] sm:!-translate-y-1/2 w-[calc(100%-1.5rem)] sm:max-w-md bg-gradient-to-br from-[#0F1419]/98 to-[#06080F]/98 border border-white/10 rounded-2xl backdrop-blur-xl p-4 sm:p-6 gap-3 max-h-[48dvh] sm:max-h-none overflow-y-auto">
        <DialogHeader className="space-y-1 text-start">
          <DialogTitle className="text-xl sm:text-2xl font-bold">
            <span className="gradient-text">
              {tradeType === 'buy' ? (t.tradeModal?.buyTitle || 'Buy USDT') : (t.tradeModal?.sellTitle || 'Sell USDT')}
            </span>
          </DialogTitle>
          <DialogDescription className="text-gray-400 text-sm">
            {t.tradeModal?.subtitle || 'Enter the amount you want to trade'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-end gap-2 sm:gap-3 py-1">
          <div className="flex-1 min-w-0 space-y-1.5">
            <label htmlFor="usdt-input" className="text-xs sm:text-sm text-gray-400 block">
              USDT
            </label>
            <div className="relative">
              <Input
                id="usdt-input"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={usdtAmount}
                onChange={handleUsdtChange}
                onFocus={(e) => e.target.select()}
                className="bg-[#0a0e1a]/50 border-white/10 text-white text-base sm:text-lg h-12 sm:h-14 pe-14 focus:border-blue-500 focus:ring-blue-500"
              />
              <span className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs font-semibold pointer-events-none">
                USDT
              </span>
            </div>
          </div>

          <div className="flex h-12 sm:h-14 items-center shrink-0 pb-0">
            <div className="p-1.5 sm:p-2 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 shadow-lg shadow-blue-500/20">
              <ArrowLeftRight className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
          </div>

          <div className="flex-1 min-w-0 space-y-1.5">
            <label htmlFor="ils-input" className="text-xs sm:text-sm text-gray-400 block">
              ILS
            </label>
            <div className="relative">
              <Input
                id="ils-input"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={ilsAmount}
                onChange={handleIlsChange}
                onFocus={(e) => e.target.select()}
                className="bg-[#0a0e1a]/50 border-white/10 text-white text-base sm:text-lg h-12 sm:h-14 pe-10 focus:border-blue-500 focus:ring-blue-500"
              />
              <span className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs font-semibold pointer-events-none">
                ₪
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 sm:gap-3 pt-1">
          <Button
            onClick={onClose}
            variant="outline"
            className="flex-1 border-white/10 hover:bg-white/5 text-gray-300 h-11 sm:h-12"
          >
            <X className="w-4 h-4 me-1.5" />
            {t.tradeModal?.cancel || 'Cancel'}
          </Button>
          <Button
            onClick={handleContactSupport}
            className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white h-11 sm:h-12 font-semibold shadow-lg hover:shadow-blue-500/50 transition-all duration-300"
          >
            <MessageSquare className="w-4 h-4 me-1.5" />
            {t.tradeModal?.contactTrader || 'Contact Support'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TradeModal;
