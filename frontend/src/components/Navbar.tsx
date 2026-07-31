import { useAuth } from '../AuthContext';
import { logout } from '../api';

// Plain <a> tags everywhere in this navbar, deliberately — every navigation is a
// real full-page load (like a normal website), not a client-side SPA transition
// that keeps the whole app instance and its state alive across pages.
export function Navbar() {
  const { user, loading } = useAuth();
  const path = window.location.pathname;

  async function handleLogout() {
    await logout();
    window.location.href = '/';
  }

  return (
    <nav className="navbar">
      <a href="/" className="navbar-brand">
        LMU Telemetry
      </a>
      <div className="navbar-links">
        <a href="/" aria-current={path === '/' ? 'page' : undefined}>
          Accueil
        </a>
        <a href="/telemetrie" aria-current={path === '/telemetrie' ? 'page' : undefined}>
          Application
        </a>
        {user && (
          <a href="/amis" aria-current={path === '/amis' ? 'page' : undefined}>
            Amis
          </a>
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
              Déconnexion
            </button>
          </div>
        ) : (
          <a href="/connexion" className="navbar-login" aria-current={path === '/connexion' ? 'page' : undefined}>
            Connexion
          </a>
        )
      )}
    </nav>
  );
}
