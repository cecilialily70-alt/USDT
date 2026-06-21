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

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (isAuthenticated) {
      fetchConfig();
    }
  }, [isAuthenticated]);

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

  // ⚠️ 核心修改：增加了 alert 详细报错雷达
  const handleSave = async () => {
    setLoading(true);
    try {
      await axios.post(`${API}/config`, config);
      toast.success('Settings Saved', {
        description: 'Configuration updated successfully!',
      });
    } catch (error) {
      // 弹出真实的服务器错误原因
      const errorMsg = error.response?.data?.detail || error.message || "无法连接到后端";
      alert("保存失败！真实的服务器报错原因是：\n\n" + JSON.stringify(errorMsg));
      
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

  const handleLogin = (e) => {
    if (e && e.key && e.key !== 'Enter') return;
    
    const now = Date.now();
    const lockUntil = localStorage.getItem('admin_lock_until');
    
    if (lockUntil && now < parseInt(lockUntil)) {
      setPassword('');
      return; 
    }

    if (password === 'Qw123456..') {
      setIsAuthenticated(true);
      localStorage.removeItem('admin_failed_attempts');
      localStorage.removeItem('admin_lock_until');
    } else {
      let attempts = parseInt(localStorage.getItem('admin_failed_attempts') || '0');
      attempts += 1;
      
      if (attempts >= 3) {
        localStorage.setItem('admin_lock_until', (now + 6 * 60 * 60 * 1000).toString());
      }
      
      localStorage.setItem('admin_failed_attempts', attempts.toString());
      setPassword('');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#06080F] via-[#0a0e1a] to-[#0F1419] flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm p-8 glass-card rounded-2xl border border-white/10 shadow-2xl relative">
            <div className="flex justify-center mb-8">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
                    <span className="text-2xl">🔒</span>
                </div>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin(e)}
              className="w-full bg-[#0a0e1a]/80 border border-white/10 focus:border-purple-500 rounded-xl px-4 py-4 text-center text-white text-xl tracking-[0.2em] outline-none transition-all duration-300 placeholder:tracking-normal placeholder:text-gray-600"
              placeholder="Enter Access Key"
              autoFocus
            />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#06080F] via-[#0a0e1a] to-[#0F1419] py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <Button onClick={() => navigate('/')} variant="ghost" className="text-gray-300 hover:text-white hover:bg-white/10 mb-4 -ms-4 transition-all duration-300">
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
            </div>

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
            </div>

            <div className="flex gap-4 pt-6 border-t border-white/10">
              <Button onClick={handleSave} disabled={loading} className="flex-1 bg-gradient-to-r from-blue-500 via-purple-500 to-blue-600 hover:from-blue-600 hover:via-purple-600 hover:to-blue-700 text-white h-14 text-lg font-semibold shadow-xl hover:shadow-2xl hover:shadow-blue-500/50 transition-all duration-300 hover:scale-105">
                {loading ? (<><RefreshCw className="w-5 h-5 me-2 animate-spin" />Saving...</>) : (<><Save className="w-5 h-5 me-2" />Save Settings</>)}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default AdminPanel;
