import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';

const DEFAULT_CONFIG = { buyRate: 4.4, sellRate: 3.3 };

const PublicConfigContext = createContext({
  config: DEFAULT_CONFIG,
  loading: true,
  regionBlocked: false,
  reload: () => Promise.resolve(),
});

export const PublicConfigProvider = ({ children }) => {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [regionBlocked, setRegionBlocked] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/config');
      if (response.data) {
        setConfig((prev) => ({ ...prev, ...response.data }));
      }
      setRegionBlocked(false);
    } catch (error) {
      if (error.response?.status === 403 && error.response?.data?.detail === 'ACCESS_DENIED_REGION') {
        setRegionBlocked(true);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const value = useMemo(
    () => ({ config, loading, regionBlocked, reload }),
    [config, loading, regionBlocked, reload]
  );

  return (
    <PublicConfigContext.Provider value={value}>
      {children}
    </PublicConfigContext.Provider>
  );
};

export const usePublicConfig = () => useContext(PublicConfigContext);
