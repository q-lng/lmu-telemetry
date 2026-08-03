import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { useSiteSettings } from '../SiteSettingsContext';
import { fetchFriendRequests } from '../api';
import { t } from '../i18n';
import { AccentPicker } from './AccentPicker';
import { AccountMenu } from './AccountMenu';
import { NotificationsBell } from './NotificationsBell';

// Client-side navigation (Link/useLocation) — the app used to force a real
// full-page load on every navigation; that's what caused the white flash and
// full style/JS reload on every click, so this (plus every other internal
// link/redirect in the app) switched to React Router's own navigation.
export function Navbar() {
  const { user, loading } = useAuth();
  const { settings: siteSettings } = useSiteSettings();
  const { pathname } = useLocation();
  const [hasPendingRequest, setHasPendingRequest] = useState(false);
  const siteName = siteSettings?.siteName ?? t('brand');

  useEffect(() => {
    document.title = siteName;
  }, [siteName]);

  // Re-checked on every navigation (not just once) — cheaply keeps the badge
  // in sync with accepting/declining requests on /friends, without a whole
  // separate polling/websocket mechanism for what's still a small, personal-
  // scale app.
  useEffect(() => {
    if (!user) {
      setHasPendingRequest(false);
      return;
    }
    let cancelled = false;
    fetchFriendRequests()
      .then((r) => {
        if (!cancelled) setHasPendingRequest(r.incoming.length > 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, pathname]);

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-brand">
        {siteName}
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
            <Link to="/friends" className="navbar-link-with-badge" aria-current={pathname === '/friends' ? 'page' : undefined}>
              {t('nav.friends')}
              {hasPendingRequest && <span className="navbar-badge" title={t('nav.pendingRequestBadge')} />}
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
          <>
            <NotificationsBell />
            <AccountMenu />
          </>
        ) : (
          <Link to="/login" className="navbar-login" aria-current={pathname === '/login' ? 'page' : undefined}>
            {t('nav.login')}
          </Link>
        ))}
    </nav>
  );
}
