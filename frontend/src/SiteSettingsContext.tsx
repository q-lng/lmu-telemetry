import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { fetchSiteSettings } from './api';
import type { SiteSettings } from './types';

interface SiteSettingsState {
  settings: SiteSettings | null;
  refresh: () => void;
}

const SiteSettingsContext = createContext<SiteSettingsState | null>(null);

// Public data (no auth) — fetched once for everyone, guests included, so the
// admin-configured site name/font/default accent/glow apply before login.
export function SiteSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SiteSettings | null>(null);

  function refresh() {
    fetchSiteSettings()
      .then(setSettings)
      .catch(() => {});
  }

  useEffect(refresh, []);

  return <SiteSettingsContext.Provider value={{ settings, refresh }}>{children}</SiteSettingsContext.Provider>;
}

export function useSiteSettings(): SiteSettingsState {
  const ctx = useContext(SiteSettingsContext);
  if (!ctx) throw new Error('useSiteSettings must be used within a SiteSettingsProvider');
  return ctx;
}
