import { Link, NavLink, useNavigate } from 'react-router-dom';
import { logout } from '../api';
import { useAuth } from '../AuthContext';

export function Navbar() {
  const { user, loading, setUser } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    setUser(null);
    navigate('/');
  }

  return (
    <nav className="navbar">
      <Link to="/" className="navbar-brand">
        LMU Telemetry
      </Link>
      <div className="navbar-links">
        <NavLink to="/" end>
          Accueil
        </NavLink>
        <NavLink to="/app">Application</NavLink>
        {user && <NavLink to="/amis">Amis</NavLink>}
      </div>
      <div className="navbar-spacer" />
      {!loading && (
        user ? (
          <div className="navbar-account">
            <Link to={`/u/${encodeURIComponent(user.pseudo)}`} className="navbar-user">
              {user.pseudo}
            </Link>
            <button className="navbar-logout" onClick={handleLogout}>
              Déconnexion
            </button>
          </div>
        ) : (
          <NavLink to="/connexion" className="navbar-login">
            Connexion
          </NavLink>
        )
      )}
    </nav>
  );
}
