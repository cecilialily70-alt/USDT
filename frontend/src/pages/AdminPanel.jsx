import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card } from '../components/ui/card';
import { ArrowLeft, Save, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AdminPanel = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState({
    buyRate: 4.4,
    sellRate: 3.3,
    whatsappLink: 'https://wa.me/972552452669'
  });

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

  const handleSave = async () => {
    setLoading(true);
    try {
      await axios.post(`${API}/config`, config);
      toast.success('Settings Saved', {
        description: 'Configuration updated successfully!',
      });
    } catch (error) {
      toast.error('Save Failed', {
        description: 'Could not save settings. Please try again.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setConfig(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#06080F] via-[#0a0e1a] to-[#0F1419] py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Button
            onClick={() => navigate('/')}
            variant="ghost"
            className="text-gray-300 hover:text-white hover:bg-white/10 mb-4 -ms-4 transition-all duration-300"
          >
            <ArrowLeft className="w-4 h-4 me-2" />
            Back to Home
          </Button>
          <h1 className="text-4xl md:text-5xl font-bold gradient-text mb-3">Admin Panel</h1>
          <p className="text-gray-400 text-lg">Manage exchange rates and contact settings</p>
        </div>

        <Card className="glass-card p-8 border-blue-500/20 hover:border-blue-500/40 transition-all duration-300 shadow-xl shadow-blue-500/10">
          <div className="space-y-6">
            <div>
              <Label htmlFor="buyRate" className="text-gray-200 text-lg font-semibold mb-2 block flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                Buy Rate (1 USDT = X ILS)
              </Label>
              <Input
                id="buyRate"
                type="number"
                step="0.1"
                value={config.buyRate}
                onChange={(e) => handleInputChange('buyRate', parseFloat(e.target.value))}
                className="bg-[#0a0e1a]/80 border-green-500/30 focus:border-green-500 text-white text-lg h-14 hover:border-green-500/50 transition-all duration-300"
                placeholder="4.4"
              />
              <p className="text-gray-500 text-sm mt-2 flex items-center gap-2">
                <span className="text-green-400">●</span>
                The rate at which customers can buy USDT with ILS
              </p>
            </div>

            <div>
              <Label htmlFor="sellRate" className="text-gray-200 text-lg font-semibold mb-2 block flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
                Sell Rate (1 USDT = X ILS)
              </Label>
              <Input
                id="sellRate"
                type="number"
                step="0.1"
                value={config.sellRate}
                onChange={(e) => handleInputChange('sellRate', parseFloat(e.target.value))}
                className="bg-[#0a0e1a]/80 border-blue-500/30 focus:border-blue-500 text-white text-lg h-14 hover:border-blue-500/50 transition-all duration-300"
                placeholder="3.3"
              />
              <p className="text-gray-500 text-sm mt-2 flex items-center gap-2">
                <span className="text-blue-400">●</span>
                The rate at which customers can sell USDT for ILS
              </p>
            </div>

            {/* 这里是我们刚刚替换的多行输入框 */}
            <div>
              <Label htmlFor="whatsappLink" className="text-gray-200 text-lg font-semibold mb-2 block flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></span>
                WhatsApp Contact Links (随机客服分配)
              </Label>
              <textarea
                id="whatsappLink"
                value={config.whatsappLink}
                onChange={(e) => handleInputChange('whatsappLink', e.target.value)}
                className="w-full rounded-md bg-[#0a0e1a]/80 border border-purple-500/30 focus:border-purple-500 text-white text-lg p-4 min-h-[120px] hover:border-purple-500/50 transition-all duration-300 outline-none"
                placeholder="https://wa.me/972552452669&#10;https://wa.me/972551234567"
              />
              <p className="text-gray-500 text-sm mt-2 flex items-center gap-2">
                <span className="text-purple-400">●</span>
                您可以输入多个 WhatsApp 链接，每行一个（直接按回车换行）。客户点击时将随机分配一个客服。
              </p>
            </div>

            <div className="flex gap-4 pt-6 border-t border-white/10">
              <Button
                onClick={handleSave}
                disabled={loading}
                className="flex-1 bg-gradient-to-r from-blue-500 via-purple-500 to-blue-600 hover:from-blue-600 hover:via-purple-600 hover:to-blue-700 text-white h-14 text-lg font-semibold shadow-xl hover:shadow-2xl hover:shadow-blue-500/50 transition-all duration-300 hover:scale-105"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-5 h-5 me-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5 me-2" />
                    Save Settings
                  </>
                )}
              </Button>
            </div>
          </div>
        </Card>

        <Card className="glass-card p-6 mt-6 border-purple-500/20 hover:border-purple-500/40 transition-all duration-300 shadow-xl shadow-purple-500/10">
          <h3 className="text-xl font-bold gradient-text mb-4 flex items-center gap-2">
            <span className="text-2xl">👀</span>
            Live Preview
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/5 rounded-xl p-6 border border-green-500/30 hover:border-green-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-green-500/20">
              <div className="text-sm text-gray-400 mb-2 flex items-center gap-2">
                <span className="text-green-400">●</span>
                Buy USDT
              </div>
              <div className="text-3xl font-bold text-green-400">1 USDT = {config.buyRate} ILS</div>
            </div>
            <div className="bg-gradient-to-br from-blue-500/10 to-purple-500/5 rounded-xl p-6 border border-blue-500/30 hover:border-blue-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/20">
              <div className="text-sm text-gray-400 mb-2 flex items-center gap-2">
                <span className="text-blue-400">●</span>
                Sell USDT
              </div>
              <div className="text-3xl font-bold text-blue-400">1 USDT = {config.sellRate} ILS</div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default AdminPanel;
