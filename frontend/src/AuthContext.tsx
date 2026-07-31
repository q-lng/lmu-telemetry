import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { fetchFriendRequests, fetchMe } from './api';
import type { PublicUser } from './types';

const FRIEND_REQUEST_POLL_MS = 60_000;

interface AuthState {
  user: PublicUser | null;
  loading: boolean;
  setUser: (u: PublicUser | null) => void;
  refresh: () => Promise<void>;
  pendingFriendRequests: number;
  refreshFriendRequests: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingFriendRequests, setPendingFriendRequests] = useState(0);

  async function refresh() {
    const u = await fetchMe().catch(() => null);
    setUser(u);
  }

  async function refreshFriendRequests() {
    if (!user) {
      setPendingFriendRequests(0);
      return;
    }
    const { incoming } = await fetchFriendRequests().catch(() => ({ incoming: [] }));
    setPendingFriendRequests(incoming.length);
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) {
      setPendingFriendRequests(0);
      return;
    }
    refreshFriendRequests();
    const id = setInterval(refreshFriendRequests, FRIEND_REQUEST_POLL_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, setUser, refresh, pendingFriendRequests, refreshFriendRequests }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
