import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { Link } from 'react-router-dom';

const LegalPage = ({ type }) => {
  const { t } = useLanguage();
  const isTerms = type === 'terms';
  const title = isTerms ? t.footer.terms : t.footer.privacy;

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#06080F] via-[#0F1419] to-[#0a0e1a] text-white">
      <div className="max-w-3xl mx-auto px-4 py-16">
        <Link to="/" className="text-blue-400 hover:text-blue-300 text-sm">
          ← {t.admin?.backHome || t.navbar.home}
        </Link>
        <h1 className="text-3xl font-bold mt-6 mb-4">{title}</h1>
        <p className="text-gray-400 leading-relaxed whitespace-pre-wrap">
          {isTerms
            ? (t.footer.termsBody ||
              'By using this exchange service you agree to transparent rates, secure processing, and compliance-oriented settlement. Contact support via live chat for trade confirmation.')
            : (t.footer.privacyBody ||
              'We process only the information needed to complete exchanges and support chat (such as name and Israeli mobile number). Chat data is retained for a limited period and then deleted.')}
        </p>
      </div>
    </div>
  );
};

export default LegalPage;
