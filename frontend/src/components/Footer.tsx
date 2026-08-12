import { Link } from 'react-router-dom';

/** Sits inside .layout-outlet, right after <Outlet/> — scrolls with each
 * page's content instead of eating a persistent slice of viewport height on
 * every route (that would shrink chart/table areas that already assume the
 * full outlet height). Fan-site disclaimer kept short here; the full
 * trademark notice lives on the Legal Notice page. */
export function Footer() {
  return (
    <footer className="app-footer">
      <div className="app-footer-links">
        <Link to="/legal/notice">Legal notice</Link>
        <Link to="/legal/terms">Terms of Service</Link>
        <Link to="/legal/privacy">Privacy policy</Link>
      </div>
      <p className="app-footer-disclaimer">
        Unofficial fan project. Not affiliated with Studio 397, Motorsport Games, or Le Mans Ultimate.
      </p>
    </footer>
  );
}
