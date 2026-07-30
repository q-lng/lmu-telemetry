import { Link, NavLink } from 'react-router-dom';

export function Navbar() {
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
      </div>
      <div className="navbar-spacer" />
      <NavLink to="/connexion" className="navbar-login">
        Connexion <span className="navbar-login-badge">bientôt</span>
      </NavLink>
    </nav>
  );
}
