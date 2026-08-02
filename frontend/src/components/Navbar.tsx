import { useEffect } from 'react';
import { useAuth } from '../AuthContext';
import { usePreferences } from '../PreferencesContext';
import { logout } from '../api';
import { t } from '../i18n';
import { applyAccentColor, DEFAULT_ACCENT_COLOR } from '../theme';

// Plain <a> tags everywhere in this navbar, deliberately — every navigation is a
// real full-page load (like a normal website), not a client-side SPA transition
// that keeps the whole app instance and its state alive across pages.
export function Navbar() {
  const { user, loading } = useAuth();
  const { preferences, setPreference } = usePreferences();
  const path = window.location.pathname;
  const accentColor = (preferences.accentColor as string | undefined) ?? DEFAULT_ACCENT_COLOR;

  // Navbar is mounted on every page (Layout wraps every route with it), so
  // applying the accent here — rather than once at the app root — is enough
  // to cover the whole app, guests included (their pick is in-memory only,
  // see PreferencesContext).
  useEffect(() => {
    applyAccentColor(accentColor);
  }, [accentColor]);

  async function handleLogout() {
    await logout();
    window.location.href = '/';
  }

  return (
    <nav className="navbar">
      <a href="/" className="navbar-brand">
        {t('brand')}
      </a>
      <div className="navbar-links">
        <a href="/" aria-current={path === '/' ? 'page' : undefined}>
          {t('nav.home')}
        </a>
        <a href="/telemetry" aria-current={path === '/telemetry' ? 'page' : undefined}>
          {t('nav.app')}
        </a>
        <a href="/browse" aria-current={path === '/browse' ? 'page' : undefined}>
          {t('nav.browse')}
        </a>
        {user && (
          <>
            <a href="/friends" aria-current={path === '/friends' ? 'page' : undefined}>
              {t('nav.friends')}
            </a>
            <a href="/my-sessions" aria-current={path === '/my-sessions' ? 'page' : undefined}>
              {t('nav.mySessions')}
            </a>
          </>
        )}
      </div>
      <div className="navbar-spacer" />
      <input
        type="color"
        className="accent-picker"
        value={accentColor}
        onChange={(e) => setPreference('accentColor', e.target.value)}
        title={t('nav.accentColor')}
      />
      {!loading && (
        user ? (
          <div className="navbar-account">
            <a href={`/u/${encodeURIComponent(user.pseudo)}`} className="navbar-user">
              {user.pseudo}
            </a>
            <button className="navbar-logout" onClick={handleLogout}>
              {t('nav.logout')}
            </button>
          </div>
        ) : (
          <a href="/login" className="navbar-login" aria-current={path === '/login' ? 'page' : undefined}>
            {t('nav.login')}
          </a>
        )
      )}
    </nav>
  );
}
