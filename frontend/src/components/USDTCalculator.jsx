import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Calculator, TrendingUp, TrendingDown } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const USDTCalculator = () => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('buy');
  const [amount, setAmount] = useState('');
  const [result, setResult] = useState(null);

  // 初始化汇率状态
  const [config, setConfig] = useState({
    buyRate: 4.4,
    sellRate: 3.3,
  });

  // 组件加载时获取后台配置
  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const response = await axios.get(`${API}/config`);
      if (response.data) {
        setConfig(response.data);
      }
    } catch (error) {
      console.log('Using default config');
    }
  };

  const processingFee = 0.02; // 2% 处理费

  const calculateExchange = () => {
    if (!amount || isNaN(amount) || parseFloat(amount) <= 0) {
      toast('Invalid Amount', {
        description: 'Please enter a valid amount greater than 0',
      });
      return;
    }

    const amountNum = parseFloat(amount);
    const isBuying = activeTab === 'buy';
    // 使用从后台获取到的最新汇率
    const rate = isBuying ? config.buyRate : config.sellRate;
    const fee = amountNum * processingFee;
    const total = isBuying ? (amountNum * rate) + fee : (amountNum * rate) - fee;

    setResult({
      amount: amountNum,
      rate: rate,
      fee: fee,
      total: total,
      type: activeTab
    });

    toast('Calculation Complete', {
      description: 'Exchange rate calculated successfully',
    });
  };

  return (
    <section className="relative py-24 bg-[#0B0F19]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#26A17B]/20 border border-[#26A17B]/30 mb-4">
            <Calculator className="w-8 h-8 text-[#26A17B]" />
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
            {t.calculator.title}
          </h2>
          <p className="text-gray-400 text-lg">
            {t.calculator.subtitle}
          </p>
        </div>

        <div className="bg-gradient-to-br from-[#1a2332] to-[#0f1621] border border-white/10 rounded-3xl p-8 shadow-2xl">
          <Tabs defaultValue="buy" className="w-full" onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2 bg-[#0B0F19] p-1 mb-8">
              <TabsTrigger 
                value="buy" 
                className="data-[state=active]:bg-[#26A17B] data-[state=active]:text-white flex items-center gap-2"
              >
                <TrendingUp className="w-4 h-4" />
                {t.calculator.buy}
              </TabsTrigger>
              <TabsTrigger 
                value="sell" 
                className="data-[state=active]:bg-[#26A17B] data-[state=active]:text-white flex items-center gap-2"
              >
                <TrendingDown className="w-4 h-4" />
                {t.calculator.sell}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="buy" className="space-y-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="buy-amount" className="text-gray-300 mb-2 block">
                    {t.calculator.amount} (USDT)
                  </Label>
                  <Input
                    id="buy-amount"
                    type="number"
                    placeholder="100"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="bg-[#0B0F19] border-white/10 text-white text-lg h-14"
                  />
                </div>

                <Button 
                  onClick={calculateExchange}
                  className="w-full bg-[#26A17B] hover:bg-[#1f8a66] text-white h-14 text-lg"
                >
                  {t.calculator.calculate}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="sell" className="space-y-6">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="sell-amount" className="text-gray-300 mb-2 block">
                    {t.calculator.amount} (USDT)
                  </Label>
                  <Input
                    id="sell-amount"
                    type="number"
                    placeholder="100"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="bg-[#0B0F19] border-white/10 text-white text-lg h-14"
                  />
                </div>

                <Button 
                  onClick={calculateExchange}
                  className="w-full bg-[#26A17B] hover:bg-[#1f8a66] text-white h-14 text-lg"
                >
                  {t.calculator.calculate}
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          {/* Results */}
          {result && (
            <div className="mt-8 pt-8 border-t border-white/10 space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">{t.calculator.exchangeRate}:</span>
                <span className="text-white font-semibold">1 USDT = {result.rate} ILS</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">{t.calculator.fee} (2%):</span>
                <span className="text-white font-semibold">{result.fee.toFixed(2)} ILS</span>
              </div>
              <div className="flex justify-between items-center pt-4 border-t border-white/10">
                <span className="text-gray-300 text-lg font-semibold">
                  {result.type === 'buy' ? t.calculator.youPay : t.calculator.youReceive}:
                </span>
                <span className="text-[#26A17B] text-2xl font-bold">
                  {result.total.toFixed(2)} ILS
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default USDTCalculator;
