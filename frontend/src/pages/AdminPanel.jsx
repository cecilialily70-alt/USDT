import React, { useState, useEffect, useCallback } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import {
  ArrowLeft,
  Save,
  RefreshCw,
  Link as LinkIcon,
  KeyRound,
  Shield,
  Trash2,
  Plus,
  LogOut,
  MessageSquare,
  Settings,
} from 'lucide-react';
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
  const tabs = t.admin.tabs || { chat: 'Chat', settings: 'Settings' };
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [authChecking, setAuthChecking] = useState(true);
  const [activeTab, setActiveTab] = useState('chat');
  const [chatUnread, setChatUnread] = useState(0);
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

  const onUnreadChange = useCallback((n) => {
    setChatUnread(Number(n) || 0);
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const token = localStorage.getItem('admin_token');
      const response = await axios.get(`${API}/admin/config`, {
        headers: { Authorization: `Bearer ${token}` },
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
        headers: { Authorization: `Bearer ${token}` },
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
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success(resolveApiSuccess(res.data?.message, t, att.settingsSaved), {
        description: att.settingsSavedDesc,
      });
      setConfig((prev) => ({ ...prev, adminPassword: '', passwordSet: true }));

      if (
        window.location.pathname.replace(/\/+$/, '').toLowerCase() !==
        String(config.adminPath || '')
          .replace(/\/+$/, '')
          .toLowerCase()
      ) {
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
    if (!newIp.trim()) return;
    try {
      const token = localStorage.getItem('admin_token');
      const res = await axios.post(
        `${API}/admin/whitelist`,
        { ip: newIp.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
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
        headers: { Authorization: `Bearer ${token}` },
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
    <div className="h-[100dvh] overflow-hidden flex flex-col bg-gradient-to-br from-[#06080F] via-[#0a0e1a] to-[#0F1419]">
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex flex-col flex-1 min-h-0"
      >
        <header className="shrink-0 border-b border-white/10 bg-black/30 backdrop-blur-md px-3 sm:px-4 py-2.5">
          <div className="max-w-6xl mx-auto flex flex-wrap items-center gap-2 sm:gap-3 justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Button
                onClick={() => navigate('/')}
                variant="ghost"
                size="sm"
                className="text-gray-400 hover:text-white hover:bg-white/10 shrink-0 -ms-1"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
              <div className="min-w-0">
                <h1 className="text-base sm:text-lg font-bold text-white truncate leading-tight">
                  {at.panelTitle}
                </h1>
                <p className="text-[11px] text-gray-500 truncate hidden sm:block">{at.panelSubtitle}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-1 sm:flex-none justify-end">
              <TabsList className="bg-white/5 border border-white/10 h-9 p-0.5">
                <TabsTrigger
                  value="chat"
                  className="data-[state=active]:bg-white/15 data-[state=active]:text-white text-gray-400 px-3 gap-1.5"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  <span>{tabs.chat}</span>
                  {chatUnread > 0 && activeTab !== 'chat' && (
                    <Badge className="ms-0.5 bg-red-500/90 text-white border-none text-[10px] px-1.5 py-0 min-w-[1.1rem] justify-center">
                      {chatUnread > 99 ? '99+' : chatUnread}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger
                  value="settings"
                  className="data-[state=active]:bg-white/15 data-[state=active]:text-white text-gray-400 px-3 gap-1.5"
                >
                  <Settings className="w-3.5 h-3.5" />
                  <span>{tabs.settings}</span>
                </TabsTrigger>
              </TabsList>
              <Button
                onClick={handleLogout}
                variant="outline"
                size="sm"
                className="border-white/15 text-gray-300 hover:text-white hover:bg-white/10 shrink-0 h-9"
              >
                <LogOut className="w-4 h-4 sm:me-1.5" />
                <span className="hidden sm:inline">{s.logout}</span>
              </Button>
            </div>
          </div>
        </header>

        <TabsContent
          value="chat"
          className="flex-1 min-h-0 mt-0 data-[state=inactive]:hidden focus-visible:ring-0 focus-visible:ring-offset-0"
          forceMount
        >
          <div className="h-full min-h-0 max-w-6xl mx-auto w-full px-0 sm:px-4 sm:py-3">
            <AdminChat onUnreadChange={onUnreadChange} />
          </div>
        </TabsContent>

        <TabsContent
          value="settings"
          className="flex-1 min-h-0 mt-0 overflow-y-auto focus-visible:ring-0 focus-visible:ring-offset-0"
        >
          <div className="max-w-4xl mx-auto px-4 py-4 sm:py-6 pb-10 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="glass-card p-5 md:p-6 border-red-500/20 shadow-xl shadow-red-500/10">
                <h2 className="text-lg font-bold text-white mb-4 flex items-center border-b border-white/10 pb-3">
                  <KeyRound className="w-5 h-5 me-2 text-red-400" /> {s.securityTitle}
                </h2>
                <div className="space-y-5">
                  <div>
                    <Label
                      htmlFor="adminPath"
                      className="text-gray-200 text-sm font-semibold mb-2 flex items-center gap-2"
                    >
                      <LinkIcon className="w-4 h-4 text-gray-400" /> {s.adminPathLabel}
                    </Label>
                    <Input
                      id="adminPath"
                      type="text"
                      value={config.adminPath}
                      onChange={(e) => handleInputChange('adminPath', e.target.value)}
                      className="bg-[#0a0e1a]/80 border-red-500/30 focus:border-red-500 text-white h-11"
                      placeholder={s.adminPathPlaceholder}
                    />
                    <p className="text-xs text-red-400 mt-2">* {s.adminPathHint}</p>
                  </div>

                  <div>
                    <Label
                      htmlFor="adminPassword"
                      className="text-gray-200 text-sm font-semibold mb-2 flex items-center gap-2"
                    >
                      <KeyRound className="w-4 h-4 text-gray-400" /> {s.adminPasswordLabel}
                    </Label>
                    <Input
                      id="adminPassword"
                      type="password"
                      value={config.adminPassword}
                      onChange={(e) => handleInputChange('adminPassword', e.target.value)}
                      className="bg-[#0a0e1a]/80 border-red-500/30 focus:border-red-500 text-white h-11"
                      placeholder={config.passwordSet ? att.passwordKeepHint : s.adminPasswordPlaceholder}
                      autoComplete="new-password"
                    />
                    <p className="text-xs text-gray-500 mt-2">
                      {config.passwordSet ? s.passwordSet : s.passwordNotSet}
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="glass-card p-5 md:p-6 border-blue-500/20 shadow-xl shadow-blue-500/10">
                <h2 className="text-lg font-bold text-white mb-4 flex items-center border-b border-white/10 pb-3">
                  {s.ratesTitle}
                </h2>
                <div className="space-y-5">
                  <div>
                    <Label
                      htmlFor="buyRate"
                      className="text-gray-200 text-sm font-semibold mb-2 flex items-center gap-2"
                    >
                      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                      {s.buyRateLabel}
                    </Label>
                    <Input
                      id="buyRate"
                      type="number"
                      step="0.1"
                      value={config.buyRate}
                      onChange={(e) => handleRateChange('buyRate', e.target.value)}
                      className="bg-[#0a0e1a]/80 border-green-500/30 focus:border-green-500 text-white h-11"
                    />
                  </div>

                  <div>
                    <Label
                      htmlFor="sellRate"
                      className="text-gray-200 text-sm font-semibold mb-2 flex items-center gap-2"
                    >
                      <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                      {s.sellRateLabel}
                    </Label>
                    <Input
                      id="sellRate"
                      type="number"
                      step="0.1"
                      value={config.sellRate}
                      onChange={(e) => handleRateChange('sellRate', e.target.value)}
                      className="bg-[#0a0e1a]/80 border-blue-500/30 focus:border-blue-500 text-white h-11"
                    />
                  </div>
                </div>
              </Card>

              <Card className="glass-card p-5 md:p-6 border-yellow-500/20 shadow-xl shadow-yellow-500/10 md:col-span-2">
                <h2 className="text-lg font-bold text-white mb-4 flex items-center border-b border-white/10 pb-3">
                  <Shield className="w-5 h-5 me-2 text-yellow-400" /> {s.whitelistTitle}
                </h2>
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <Input
                      value={newIp}
                      onChange={(e) => setNewIp(e.target.value)}
                      placeholder={s.whitelistPlaceholder}
                      className="bg-[#0a0e1a]/80 border-yellow-500/30 focus:border-yellow-500 text-white flex-1 h-11"
                    />
                    <Button
                      onClick={handleAddIp}
                      className="bg-yellow-600 hover:bg-yellow-700 text-white h-11 px-6 w-full sm:w-auto"
                    >
                      <Plus className="w-4 h-4 me-1" /> {s.addIp}
                    </Button>
                  </div>
                  <div className="max-h-56 overflow-y-auto space-y-2 pe-1">
                    {whitelist.length === 0 ? (
                      <div className="text-center text-gray-500 py-4 text-sm">{s.whitelistEmpty}</div>
                    ) : (
                      whitelist.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex justify-between items-center bg-black/40 p-3 rounded-xl border border-white/5"
                        >
                          <div>
                            <span className="text-white font-mono text-sm tracking-wider">{item.ip}</span>
                            {item.auto_added && (
                              <Badge className="ms-2 bg-blue-500/20 text-blue-400 border-none hover:bg-blue-500/20">
                                {s.autoBadge}
                              </Badge>
                            )}
                          </div>
                          <Button
                            variant="ghost"
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                            size="sm"
                            onClick={() => handleDeleteIp(item.ip)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </Card>
            </div>

            <Button
              onClick={handleSave}
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-500 via-purple-500 to-blue-600 hover:from-blue-600 hover:via-purple-600 hover:to-blue-700 text-white h-12 text-base font-semibold shadow-xl rounded-xl"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-5 h-5 me-2 animate-spin" /> {s.saving}
                </>
              ) : (
                <>
                  <Save className="w-5 h-5 me-2" /> {s.saveAll}
                </>
              )}
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminPanel;
