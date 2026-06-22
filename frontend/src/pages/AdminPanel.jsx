import React, { useState, useEffect } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card } from '../components/ui/card';
import { ArrowLeft, Save, RefreshCw, Link, KeyRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import axios from 'axios';

const API = '/api';

const AdminPanel = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState({
    buyRate: 4.4,
    sellRate: 3.3,
    whatsappLink: 'https://wa.me/972552452669',
    adminPath: '/xiaoyan',
    adminPassword: ''
  });

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('admin_token');
    if (token) {
      setIsAuthenticated(true);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchConfig();
    }
  }, [isAuthenticated]);

  const fetchConfig = async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await axios.get(`${API}/admin/config`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data) {
        setConfig(response.data);
      }
    } catch (error) {
      if (error.response?.status === 401) {
        setIsAuthenticated(false);
      }
    }
  };

  const handleSave = async () => {
    setLoading(true);
    const token = localStorage.getItem('admin_token');
    try {
      await axios.post(`${API}/admin/config`, config, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success('Settings Saved', {
        description: 'Configuration updated successfully!',
      });
      
      // 如果管理员修改了后台路径，自动重定向到新路径
      if (window.location.pathname !== config.adminPath) {
         toast.info('URL Changed. Redirecting to new Admin Dashboard...');
         setTimeout(() => {
             window.location.href = config.adminPath;
         }, 2000);
      }
    } catch (error) {
      if (error.response?.status === 401) {
        localStorage.removeItem('admin_token');
        setIsAuthenticated(false);
        toast.error('Session Expired', { description: 'Please log in again.' });
      } else {
        toast.error('Save Failed', { description: error.response?.data?.detail || "Connection Error" });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleLogin = async (e) => {
    if (e && e.key && e.key !== 'Enter') return;
    setLoading(true);
    try {
      const response = await axios.post(`${API}/admin/login`, { password });
      localStorage.setItem('admin_token', response.data.token);
      setIsAuthenticated(true);
      toast.success('Welcome Back', { description: 'Logged in successfully!' });
    } catch (error) {
      toast.error('Login Failed', { description: error.response?.data?.detail || 'Invalid Access Key' });
      setPassword('');
    } finally {
      setLoading(false);
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
              disabled={loading}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin(e)}
              className="w-full bg-[#0a0e1a]/80 border border-white/10 focus:border-purple-500 rounded-xl px-4 py-4 text-center text-white text-xl tracking-[0.2em] outline-none transition-all duration-300 placeholder:tracking-normal placeholder:text-gray-600 disabled:opacity-50"
              placeholder={loading ? "Verifying..." : "Enter Access Key"}
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
          <p className="text-gray-400 text-lg">Manage exchange rates, security settings, and routes</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <Card className="glass-card p-8 border-red-500/20 hover:border-red-500/40 transition-all duration-300 shadow-xl shadow-red-500/10">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center border-b border-white/10 pb-4">
              <KeyRound className="w-6 h-6 mr-3 text-red-400" /> Security Settings
            </h2>
            <div className="space-y-6">
              <div>
                <Label htmlFor="adminPath" className="text-gray-200 text-lg font-semibold mb-2 flex items-center gap-2">
                  <Link className="w-4 h-4 text-gray-400" /> Admin Panel URL Path
                </Label>
                <Input
                  id="adminPath"
                  type="text"
                  value={config.adminPath}
                  onChange={(e) => handleInputChange('adminPath', e.target.value)}
                  className="bg-[#0a0e1a]/80 border-red-500/30 focus:border-red-500 text-white text-lg h-14"
                  placeholder="/secret-admin-url"
                />
                <p className="text-xs text-red-400 mt-2">* Change this to hide your admin login page from attackers.</p>
              </div>

              <div>
                <Label htmlFor="adminPassword" className="text-gray-200 text-lg font-semibold mb-2 flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-gray-400" /> Admin Access Key
                </Label>
                <Input
                  id="adminPassword"
                  type="text"
                  value={config.adminPassword}
                  onChange={(e) => handleInputChange('adminPassword', e.target.value)}
                  className="bg-[#0a0e1a]/80 border-red-500/30 focus:border-red-500 text-white text-lg h-14"
                  placeholder="Enter new strong password"
                />
              </div>
            </div>
          </Card>

          <Card className="glass-card p-8 border-blue-500/20 hover:border-blue-500/40 transition-all duration-300 shadow-xl shadow-blue-500/10">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center border-b border-white/10 pb-4">
               Exchange Rates
            </h2>
            <div className="space-y-6">
              <div>
                <Label htmlFor="buyRate" className="text-gray-200 text-lg font-semibold mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                  Buy Rate (1 USDT = X ILS)
                </Label>
                <Input
                  id="buyRate"
                  type="number"
                  step="0.1"
                  value={config.buyRate}
                  onChange={(e) => handleInputChange('buyRate', parseFloat(e.target.value))}
                  className="bg-[#0a0e1a]/80 border-green-500/30 focus:border-green-500 text-white text-lg h-14"
                />
              </div>

              <div>
                <Label htmlFor="sellRate" className="text-gray-200 text-lg font-semibold mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
                  Sell Rate (1 USDT = X ILS)
                </Label>
                <Input
                  id="sellRate"
                  type="number"
                  step="0.1"
                  value={config.sellRate}
                  onChange={(e) => handleInputChange('sellRate', parseFloat(e.target.value))}
                  className="bg-[#0a0e1a]/80 border-blue-500/30 focus:border-blue-500 text-white text-lg h-14"
                />
              </div>
            </div>
          </Card>
        </div>

        <Card className="glass-card p-8 border-purple-500/20 hover:border-purple-500/40 transition-all duration-300 shadow-xl shadow-purple-500/10">
            <div className="mb-6">
              <Label htmlFor="whatsappLink" className="text-gray-200 text-lg font-semibold mb-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></span>
                WhatsApp Contact Links (随机客服分配)
              </Label>
              <textarea
                id="whatsappLink"
                value={config.whatsappLink}
                onChange={(e) => handleInputChange('whatsappLink', e.target.value)}
                className="w-full rounded-md bg-[#0a0e1a]/80 border border-purple-500/30 focus:border-purple-500 text-white text-lg p-4 min-h-[120px] outline-none"
                placeholder="Enter WhatsApp links here..."
              ></textarea>
            </div>

            <Button onClick={handleSave} disabled={loading} className="w-full bg-gradient-to-r from-blue-500 via-purple-500 to-blue-600 hover:from-blue-600 hover:via-purple-600 hover:to-blue-700 text-white h-14 text-lg font-semibold shadow-xl hover:scale-[1.02] transition-all duration-300">
              {loading ? (
                <><RefreshCw className="w-5 h-5 me-2 animate-spin" /> Saving and Applying...</>
              ) : (
                <><Save className="w-5 h-5 me-2" /> Save All Configurations</>
              )}
            </Button>
        </Card>
      </div>
    </div>
  );
};

export default AdminPanel;