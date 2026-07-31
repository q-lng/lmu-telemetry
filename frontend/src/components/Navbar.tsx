import { useAuth } from '../AuthContext';
import { logout } from '../api';
import { t } from '../i18n';

// Plain <a> tags everywhere in this navbar, deliberately — every navigation is a
// real full-page load (like a normal website), not a client-side SPA transition
// that keeps the whole app instance and its state alive across pages.
export function Navbar() {
  const { user, loading, pendingFriendRequests } = useAuth();
  const path = window.location.pathname;

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
        <a href="/telemetrie" aria-current={path === '/telemetrie' ? 'page' : undefined}>
          {t('nav.app')}
        </a>
        <a href="/parcourir" aria-current={path === '/parcourir' ? 'page' : undefined}>
          {t('nav.browse')}
        </a>
        {user && (
          <>
            <a href="/amis" aria-current={path === '/amis' ? 'page' : undefined} className="navbar-link-with-badge">
              {t('nav.friends')}
              {pendingFriendRequests > 0 && <span className="navbar-badge">{pendingFriendRequests}</span>}
            </a>
            <a href="/mes-sessions" aria-current={path === '/mes-sessions' ? 'page' : undefined}>
              {t('nav.mySessions')}
            </a>
          </>
        )}
      </div>
      <div className="navbar-spacer" />
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
          <a href="/connexion" className="navbar-login" aria-current={path === '/connexion' ? 'page' : undefined}>
            {t('nav.login')}
          </a>
        )
      )}
    </nav>
  );
}
