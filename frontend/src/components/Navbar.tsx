import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { t } from '../i18n';
import { AccentPicker } from './AccentPicker';
import { AccountMenu } from './AccountMenu';

// Client-side navigation (Link/useLocation) — the app used to force a real
// full-page load on every navigation; that's what caused the white flash and
// full style/JS reload on every click, so this (plus every other internal
// link/redirect in the app) switched to React Router's own navigation.
export function Navbar() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-brand">
        {t('brand')}
      </Link>
      <div className="navbar-links">
        <Link to="/" aria-current={pathname === '/' ? 'page' : undefined}>
          {t('nav.home')}
        </Link>
        <Link to="/telemetry" aria-current={pathname === '/telemetry' ? 'page' : undefined}>
          {t('nav.app')}
        </Link>
        <Link to="/browse" aria-current={pathname === '/browse' ? 'page' : undefined}>
          {t('nav.browse')}
        </Link>
        {user && (
          <>
            <Link to="/friends" aria-current={pathname === '/friends' ? 'page' : undefined}>
              {t('nav.friends')}
            </Link>
            <Link to="/my-sessions" aria-current={pathname === '/my-sessions' ? 'page' : undefined}>
              {t('nav.mySessions')}
            </Link>
          </>
        )}
      </div>
      <div className="navbar-spacer" />
      <AccentPicker />
      {!loading &&
        (user ? (
          <AccountMenu />
        ) : (
          <Link to="/login" className="navbar-login" aria-current={pathname === '/login' ? 'page' : undefined}>
            {t('nav.login')}
          </Link>
        ))}
    </nav>
  );
}
