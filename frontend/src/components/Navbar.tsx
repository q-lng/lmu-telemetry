import { useAuth } from '../AuthContext';
import { t } from '../i18n';
import { AccentPicker } from './AccentPicker';
import { AccountMenu } from './AccountMenu';

// Plain <a> tags everywhere in this navbar, deliberately — every navigation is a
// real full-page load (like a normal website), not a client-side SPA transition
// that keeps the whole app instance and its state alive across pages.
export function Navbar() {
  const { user, loading } = useAuth();
  const path = window.location.pathname;

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
      <AccentPicker />
      {!loading && (
        user ? (
          <AccountMenu />
        ) : (
          <a href="/login" className="navbar-login" aria-current={path === '/login' ? 'page' : undefined}>
            {t('nav.login')}
          </a>
        )
      )}
    </nav>
  );
}
