import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Shield, Lock, FileCheck, BadgeCheck } from 'lucide-react';
import { Badge } from './ui/badge';

const Security = () => {
  const { t } = useLanguage();

  const securityFeatures = [
    {
      icon: BadgeCheck,
      title: t.security.compliance,
      color: '#10B981'
    },
    {
      icon: Lock,
      title: t.security.encryption,
      color: '#3B82F6'
    },
    {
      icon: FileCheck,
      title: t.security.verification,
      color: '#8B5CF6'
    },
    {
      icon: Shield,
      title: t.security.insurance,
      color: '#F59E0B'
    }
  ];

  return (
    <section id="security" className="relative py-24 bg-gradient-to-b from-[#0f1621] to-[#0B0F19]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <Badge className="mb-6 bg-[#26A17B]/20 text-[#26A17B] border border-[#26A17B]/30 hover:bg-[#26A17B]/30 text-sm px-4 py-2">
            <Shield className="w-4 h-4 me-2" />
            {t.security.badge || 'Verified & Compliance Ready'}
          </Badge>
          <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
            {t.security.title}
          </h2>
          <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto">
            {t.security.subtitle}
          </p>
        </div>

        {/* Security Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {securityFeatures.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <div
                key={index}
                className="bg-gradient-to-br from-[#1a2332] to-[#0f1621] border border-white/10 rounded-2xl p-6 text-center hover:border-[#26A17B]/50 transition-all duration-300 hover:shadow-xl hover:shadow-[#26A17B]/10"
              >
                <div 
                  className="w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-4"
                  style={{ 
                    backgroundColor: `${feature.color}20`,
                    border: `1px solid ${feature.color}40`
                  }}
                >
                  <Icon className="w-8 h-8" style={{ color: feature.color }} />
                </div>
                <h3 className="text-white font-semibold">
                  {feature.title}
                </h3>
              </div>
            );
          })}
        </div>

        {/* Stats Section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="text-5xl font-bold text-[#26A17B] mb-2">10,000+</div>
            <div className="text-gray-400 text-lg">{t.stats.users}</div>
          </div>
          <div className="text-center">
            <div className="text-5xl font-bold text-[#26A17B] mb-2">50,000+</div>
            <div className="text-gray-400 text-lg">{t.stats.transactions}</div>
          </div>
          <div className="text-center">
            <div className="text-5xl font-bold text-[#26A17B] mb-2">₪50M+</div>
            <div className="text-gray-400 text-lg">{t.stats.volume}</div>
          </div>
        </div>

        {/* Notice */}
        <div className="mt-12 max-w-3xl mx-auto">
          <div className="bg-gradient-to-r from-orange-500/10 to-red-500/10 border border-orange-500/30 rounded-xl p-6">
            <p className="text-orange-300 text-center">
              {t.notice.kyc}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Security;