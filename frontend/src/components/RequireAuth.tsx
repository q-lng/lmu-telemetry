import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../AuthContext';

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  // Full page navigation (not a client-side redirect), consistent with the rest
  // of the app's real-website-style navigation.
  useEffect(() => {
    if (!loading && !user) window.location.replace('/login');
  }, [loading, user]);

  if (loading || !user) return null;
  return <>{children}</>;
}
