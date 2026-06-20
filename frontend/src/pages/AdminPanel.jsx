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
      setConfig(response.data);
    } catch (error) {
      // Use default values if API fails
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
    <div className="min-h-screen bg-gradient-to-b from-[#06080F] via-[#0F1419] to-[#0a0e1a] py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <Button
            onClick={() => navigate('/')}
            variant="ghost"
            className="text-gray-300 hover:text-white mb-4 -ms-4"
          >
            <ArrowLeft className="w-4 h-4 me-2" />
            Back to Home
          </Button>
          <h1 className="text-4xl font-bold gradient-text mb-2">Admin Panel</h1>
          <p className="text-gray-400">Manage exchange rates and contact settings</p>
        </div>

        {/* Settings Card */}
        <Card className="glass-card p-8">
          <div className="space-y-6">
            {/* Buy Rate */}
            <div>
              <Label htmlFor="buyRate" className="text-gray-300 text-lg font-semibold mb-2 block">
                Buy Rate (1 USDT = X ILS)
              </Label>
              <Input
                id="buyRate"
                type="number"
                step="0.1"
                value={config.buyRate}
                onChange={(e) => handleInputChange('buyRate', parseFloat(e.target.value))}
                className="bg-[#0a0e1a]/50 border-white/10 text-white text-lg h-14"
                placeholder="4.4"
              />
              <p className="text-gray-500 text-sm mt-2">
                The rate at which customers can buy USDT with ILS
              </p>
            </div>

            {/* Sell Rate */}
            <div>
              <Label htmlFor="sellRate" className="text-gray-300 text-lg font-semibold mb-2 block">
                Sell Rate (1 USDT = X ILS)
              </Label>
              <Input
                id="sellRate"
                type="number"
                step="0.1"
                value={config.sellRate}
                onChange={(e) => handleInputChange('sellRate', parseFloat(e.target.value))}
                className="bg-[#0a0e1a]/50 border-white/10 text-white text-lg h-14"
                placeholder="3.3"
              />
              <p className="text-gray-500 text-sm mt-2">
                The rate at which customers can sell USDT for ILS
              </p>
            </div>

            {/* WhatsApp Link */}
            <div>
              <Label htmlFor="whatsappLink" className="text-gray-300 text-lg font-semibold mb-2 block">
                WhatsApp Contact Link
              </Label>
              <Input
                id="whatsappLink"
                type="url"
                value={config.whatsappLink}
                onChange={(e) => handleInputChange('whatsappLink', e.target.value)}
                className="bg-[#0a0e1a]/50 border-white/10 text-white text-lg h-14"
                placeholder="https://wa.me/972552452669"
              />
              <p className="text-gray-500 text-sm mt-2">
                WhatsApp link for customer support (format: https://wa.me/PHONENUMBER)
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4 pt-6 border-t border-white/10">
              <Button
                onClick={handleSave}
                disabled={loading}
                className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white h-12 text-lg font-semibold shadow-lg hover:shadow-blue-500/50 transition-all duration-300"
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

        {/* Preview Card */}
        <Card className="glass-card p-6 mt-6">
          <h3 className="text-xl font-bold text-white mb-4">Live Preview</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#0a0e1a]/50 rounded-lg p-4 border border-green-500/30">
              <div className="text-sm text-gray-400 mb-1">Buy USDT</div>
              <div className="text-2xl font-bold text-green-400">1 USDT = {config.buyRate} ILS</div>
            </div>
            <div className="bg-[#0a0e1a]/50 rounded-lg p-4 border border-blue-500/30">
              <div className="text-sm text-gray-400 mb-1">Sell USDT</div>
              <div className="text-2xl font-bold text-blue-400">1 USDT = {config.sellRate} ILS</div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default AdminPanel;
