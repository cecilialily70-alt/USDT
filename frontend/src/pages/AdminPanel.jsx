import React, { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { ArrowLeft, Save, RefreshCw, Link as LinkIcon, KeyRound, Shield, Trash2, Plus, LogOut } from 'lucide-react';
import AdminChat from '../components/AdminChat';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import axios from 'axios';
import { getApiErrorMessage } from '../utils/chatHelpers';
import { resolveApiSuccess } from '../utils/apiErrors';

const API = '/api';

const AdminPanel = () => {
  const { t } = useLanguage();
  const at = t.admin;
  const att = t.admin.toast;
  const al = t.admin.login;
  const s = t.admin.settings;
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [config, setConfig] = useState({
    buyRate: 4.4,
    sellRate: 3.3,
    adminPath: '',
    adminPassword: '',
    passwordSet: false,
  });

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [whitelist, setWhitelist] = useState([]);
  const [newIp, setNewIp] = useState('');

  const clearSession = useCallback(() => {
    localStorage.removeItem('admin_token');
    setIsAuthenticated(false);
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await axios.get(`${API}/admin/config`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data) {
        setConfig({
          ...response.data,
          adminPassword: '',
        });
      }
    } catch (error) {
      if (error.response?.status === 401) {
        clearSession();
        toast.error(att.sessionExpired, { description: att.sessionExpiredDesc });
      }
    }
  }, [att.sessionExpired, att.sessionExpiredDesc, clearSession]);

  const fetchWhitelist = useCallback(async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const res = await axios.get(`${API}/admin/whitelist`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setWhitelist(res.data.whitelist);
    } catch (error) {
      if (error.response?.status === 401) clearSession();
    }
  }, [clearSession]);

  useEffect(() => {
    const validateToken = async () => {
      const token = localStorage.getItem('admin_token');
      if (!token) {
        setAuthChecking(false);
        return;
      }
      try {
        await axios.get(`${API}/admin/config`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setIsAuthenticated(true);
      } catch {
        clearSession();
      } finally {
        setAuthChecking(false);
      }
    };
    validateToken();
  }, [clearSession]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchConfig();
      fetchWhitelist();
    }
  }, [isAuthenticated, fetchConfig, fetchWhitelist]);

  const handleSave = async () => {
    setLoading(true);
    const token = localStorage.getItem('admin_token');
    try {
      const payload = {
        buyRate: Number.isFinite(Number(config.buyRate)) ? Number(config.buyRate) : undefined,
        sellRate: Number.isFinite(Number(config.sellRate)) ? Number(config.sellRate) : undefined,
        adminPath: config.adminPath,
        adminPassword: (config.adminPassword || '').trim(),
      };
      const res = await axios.post(`${API}/admin/config`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(resolveApiSuccess(res.data?.message, t, att.settingsSaved), {
        description: att.settingsSavedDesc,
      });
      setConfig((prev) => ({ ...prev, adminPassword: '', passwordSet: true }));

      if (window.location.pathname !== config.adminPath) {
         toast.info(att.urlChanged);
         setTimeout(() => {
             window.location.href = config.adminPath;
         }, 2000);
      }
    } catch (error) {
      if (error.response?.status === 401) {
        clearSession();
        toast.error(att.sessionExpired, { description: att.sessionExpiredDesc });
      } else {
        toast.error(att.saveFailed, {
          description: getApiErrorMessage(error, att.connectionError, t),
        });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleAddIp = async () => {
    if(!newIp.trim()) return;
    try {
      const token = localStorage.getItem('admin_token');
      const res = await axios.post(`${API}/admin/whitelist`, { ip: newIp.trim() }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(resolveApiSuccess(res.data?.message, t, att.ipAdded));
      setNewIp('');
      fetchWhitelist();
    } catch (e) {
      if (e.response?.status === 401) {
        clearSession();
        return;
      }
      toast.error(getApiErrorMessage(e, att.ipAddFailed, t));
    }
  };

  const handleDeleteIp = async (ip) => {
    try {
      const token = localStorage.getItem('admin_token');
      const res = await axios.delete(`${API}/admin/whitelist/${ip}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(resolveApiSuccess(res.data?.message, t, att.ipRemoved));
      fetchWhitelist();
    } catch (e) {
      if (e.response?.status === 401) {
        clearSession();
        return;
      }
      toast.error(getApiErrorMessage(e, att.ipRemoveFailed, t));
    }
  };

  const handleInputChange = (field, value) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  const handleRateChange = (field, raw) => {
    if (raw === '') {
      handleInputChange(field, '');
      return;
    }
    const n = parseFloat(raw);
    if (Number.isFinite(n)) handleInputChange(field, n);
  };

  const handleLogout = () => {
    clearSession();
    navigate('/');
  };

  const handleLogin = async (e) => {
    if (e && e.key && e.key !== 'Enter') return;
    setLoading(true);
    try {
      const response = await axios.post(`${API}/admin/login`, { password });
      localStorage.setItem('admin_token', response.data.token);
      setIsAuthenticated(true);
      toast.success(al.welcome, { description: al.welcomeDesc });
    } catch (error) {
      toast.error(al.failed, {
        description: getApiErrorMessage(error, t.errors.invalidAccessKey, t),
      });
      setPassword('');
    } finally {
      setLoading(false);
    }
  };

  if (authChecking) {
    return (
      <div className="min-h-screen bg-[#06080F] flex items-center justify-center text-gray-400">
        {at.loading}
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#06080F] via-[#0a0e1a] to-[#0F1419] flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-sm p-8 glass-card rounded-2xl border border-white/10 shadow-2xl relative">
            <div className="flex justify-center mb-8">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
                    <KeyRound className="w-7 h-7 text-white" />
                </div>
            </div>
            <input
              type="password"
              value={password}
              disabled={loading}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin(e)}
              className="w-full bg-[#0a0e1a]/80 border border-white/10 focus:border-purple-500 rounded-xl px-4 py-4 text-center text-white text-xl tracking-[0.2em] outline-none transition-all duration-300 placeholder:tracking-normal placeholder:text-gray-600 disabled:opacity-50"
              placeholder={loading ? al.verifying : al.placeholder}
              autoFocus
            />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#06080F] via-[#0a0e1a] to-[#0F1419] py-12 md:py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
          <Button onClick={() => navigate('/')} variant="ghost" className="text-gray-300 hover:text-white hover:bg-white/10 mb-4 -ms-4 transition-all duration-300">
            <ArrowLeft className="w-4 h-4 me-2" />
            {at.backToHome}
          </Button>
          <h1 className="text-3xl md:text-5xl font-bold gradient-text mb-3">{at.panelTitle}</h1>
          <p className="text-gray-400 text-base md:text-lg">{at.panelSubtitle}</p>
          </div>
          <Button
            onClick={handleLogout}
            variant="outline"
            className="border-white/15 text-gray-300 hover:text-white hover:bg-white/10 shrink-0"
          >
            <LogOut className="w-4 h-4 me-2" />
            {s.logout}
          </Button>
        </div>

        <div className="mb-6">
          <AdminChat />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <Card className="glass-card p-6 md:p-8 border-red-500/20 hover:border-red-500/40 transition-all duration-300 shadow-xl shadow-red-500/10">
            <h2 className="text-xl md:text-2xl font-bold text-white mb-6 flex items-center border-b border-white/10 pb-4">
              <KeyRound className="w-6 h-6 me-3 text-red-400" /> {s.securityTitle}
            </h2>
            <div className="space-y-6">
              <div>
                <Label htmlFor="adminPath" className="text-gray-200 text-base md:text-lg font-semibold mb-2 flex items-center gap-2">
                  <LinkIcon className="w-4 h-4 text-gray-400" /> {s.adminPathLabel}
                </Label>
                <Input
                  id="adminPath"
                  type="text"
                  value={config.adminPath}
                  onChange={(e) => handleInputChange('adminPath', e.target.value)}
                  className="bg-[#0a0e1a]/80 border-red-500/30 focus:border-red-500 text-white text-base md:text-lg h-12 md:h-14"
                  placeholder={s.adminPathPlaceholder}
                />
                <p className="text-xs text-red-400 mt-2">* {s.adminPathHint}</p>
              </div>

              <div>
                <Label htmlFor="adminPassword" className="text-gray-200 text-base md:text-lg font-semibold mb-2 flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-gray-400" /> {s.adminPasswordLabel}
                </Label>
                <Input
                  id="adminPassword"
                  type="password"
                  value={config.adminPassword}
                  onChange={(e) => handleInputChange('adminPassword', e.target.value)}
                  className="bg-[#0a0e1a]/80 border-red-500/30 focus:border-red-500 text-white text-base md:text-lg h-12 md:h-14"
                  placeholder={config.passwordSet ? att.passwordKeepHint : s.adminPasswordPlaceholder}
                  autoComplete="new-password"
                />
                <p className="text-xs text-gray-500 mt-2">
                  {config.passwordSet ? s.passwordSet : s.passwordNotSet}
                </p>
              </div>
            </div>
          </Card>

          <Card className="glass-card p-6 md:p-8 border-blue-500/20 hover:border-blue-500/40 transition-all duration-300 shadow-xl shadow-blue-500/10">
            <h2 className="text-xl md:text-2xl font-bold text-white mb-6 flex items-center border-b border-white/10 pb-4">
               {s.ratesTitle}
            </h2>
            <div className="space-y-6">
              <div>
                <Label htmlFor="buyRate" className="text-gray-200 text-base md:text-lg font-semibold mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
                  {s.buyRateLabel}
                </Label>
                <Input
                  id="buyRate"
                  type="number"
                  step="0.1"
                  value={config.buyRate}
                  onChange={(e) => handleRateChange('buyRate', e.target.value)}
                  className="bg-[#0a0e1a]/80 border-green-500/30 focus:border-green-500 text-white text-base md:text-lg h-12 md:h-14"
                />
              </div>

              <div>
                <Label htmlFor="sellRate" className="text-gray-200 text-base md:text-lg font-semibold mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
                  {s.sellRateLabel}
                </Label>
                <Input
                  id="sellRate"
                  type="number"
                  step="0.1"
                  value={config.sellRate}
                  onChange={(e) => handleRateChange('sellRate', e.target.value)}
                  className="bg-[#0a0e1a]/80 border-blue-500/30 focus:border-blue-500 text-white text-base md:text-lg h-12 md:h-14"
                />
              </div>
            </div>
          </Card>

          <Card className="glass-card p-6 md:p-8 border-yellow-500/20 hover:border-yellow-500/40 transition-all duration-300 shadow-xl shadow-yellow-500/10 md:col-span-2">
            <h2 className="text-xl md:text-2xl font-bold text-white mb-6 flex items-center border-b border-white/10 pb-4">
              <Shield className="w-6 h-6 me-3 text-yellow-400" /> {s.whitelistTitle}
            </h2>
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <Input
                  value={newIp}
                  onChange={(e) => setNewIp(e.target.value)}
                  placeholder={s.whitelistPlaceholder}
                  className="bg-[#0a0e1a]/80 border-yellow-500/30 focus:border-yellow-500 text-white flex-1 h-12 md:h-14"
                />
                <Button onClick={handleAddIp} className="bg-yellow-600 hover:bg-yellow-700 text-white h-12 md:h-14 px-8 w-full sm:w-auto">
                  <Plus className="w-5 h-5 me-1" /> {s.addIp}
                </Button>
              </div>
              <div className="max-h-60 overflow-y-auto space-y-3 pe-2 scrollbar-thin scrollbar-thumb-white/20">
                {whitelist.length === 0 ? (
                    <div className="text-center text-gray-500 py-4">{s.whitelistEmpty}</div>
                ) : (
                    whitelist.map((item, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-black/40 p-4 rounded-xl border border-white/5 hover:bg-black/60 transition">
                        <div>
                        <span className="text-white font-mono text-sm sm:text-base tracking-wider">{item.ip}</span>
                        {item.auto_added && <Badge className="ms-3 bg-blue-500/20 text-blue-400 border-none hover:bg-blue-500/20">{s.autoBadge}</Badge>}
                        </div>
                        <Button variant="ghost" className="text-red-400 hover:text-red-300 hover:bg-red-500/10" size="sm" onClick={() => handleDeleteIp(item.ip)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                    </div>
                    ))
                )}
              </div>
            </div>
          </Card>
        </div>

        <Card className="glass-card p-6 md:p-8 border-purple-500/20 hover:border-purple-500/40 transition-all duration-300 shadow-xl shadow-purple-500/10 mb-12">
            <Button onClick={handleSave} disabled={loading} className="w-full bg-gradient-to-r from-blue-500 via-purple-500 to-blue-600 hover:from-blue-600 hover:via-purple-600 hover:to-blue-700 text-white h-14 md:h-16 text-lg font-semibold shadow-xl hover:scale-[1.02] transition-all duration-300 rounded-xl">
              {loading ? (
                <><RefreshCw className="w-5 h-5 me-2 animate-spin" /> {s.saving}</>
              ) : (
                <><Save className="w-5 h-5 me-2" /> {s.saveAll}</>
              )}
            </Button>
        </Card>
      </div>
    </div>
  );
};

export default AdminPanel;
