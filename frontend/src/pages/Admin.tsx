import { useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { t } from '../i18n';

// Placeholder only — the admin panel itself is deliberately not built yet
// (see the project roadmap). This just gives the navbar's admin-only link a
// real, gated destination instead of a dead one.
export function Admin() {
  const { user, loading } = useAuth();

  // Full page navigation, consistent with RequireAuth's own redirect below it.
  useEffect(() => {
    if (!loading && user && !user.isAdmin) window.location.replace('/');
  }, [loading, user]);

  if (loading || !user || !user.isAdmin) return null;

  return (
    <div className="social-page">
      <div className="social-card">
        <div className="auth-heading">
          <h1>{t('admin.title')}</h1>
          <p>{t('admin.comingSoon')}</p>
        </div>
      </div>
    </div>
  );
}
