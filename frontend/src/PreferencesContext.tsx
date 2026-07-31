import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { fetchPreferences, updatePreferences } from './api';
import { useAuth } from './AuthContext';

interface PreferencesState {
  preferences: Record<string, unknown>;
  setPreference: (key: string, value: unknown) => void;
}

const PreferencesContext = createContext<PreferencesState | null>(null);

// Debounced so dragging a native color picker (which fires onChange on every
// frame) doesn't hammer the API — only the settled value gets persisted.
const SAVE_DEBOUNCE_MS = 500;

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<Record<string, unknown>>({});
  const pendingPatch = useRef<Record<string, unknown>>({});
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user) {
      setPreferences({});
      return;
    }
    fetchPreferences()
      .then(setPreferences)
      .catch(() => {});
  }, [user]);

  function flush() {
    const patch = pendingPatch.current;
    pendingPatch.current = {};
    if (Object.keys(patch).length === 0) return;
    updatePreferences(patch).catch(() => {});
  }

  // Guests get in-memory-only preferences for the session (no server account
  // to attach them to) — never persisted to localStorage or anywhere else.
  function setPreference(key: string, value: unknown) {
    setPreferences((prev) => ({ ...prev, [key]: value }));
    if (!user) return;
    pendingPatch.current[key] = value;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
  }

  return <PreferencesContext.Provider value={{ preferences, setPreference }}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesState {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within a PreferencesProvider');
  return ctx;
}
