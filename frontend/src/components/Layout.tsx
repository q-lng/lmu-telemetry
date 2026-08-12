import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Navbar } from './Navbar';
import { FriendsWidget } from './FriendsWidget';
import { Footer } from './Footer';
import { useAuth } from '../AuthContext';
import { usePreferences } from '../PreferencesContext';

function PageLoading() {
  return (
    <div className="page-loading">
      <span className="spinner" />
    </div>
  );
}

export function Layout() {
  const { loading: authLoading } = useAuth();
  const { loading: preferencesLoading } = usePreferences();
  const { pathname } = useLocation();

  // Hold off rendering the shell entirely until we know the real accent
  // color (auth + preferences both resolved) — otherwise the navbar/buttons
  // paint with the default accent for a moment before snapping to whatever
  // the user actually saved, which reads as a bug rather than a loading state.
  if (authLoading || preferencesLoading) {
    return <PageLoading />;
  }

  return (
    <div className="app-shell">
      <Navbar />
      <main className="layout-outlet">
        <Suspense fallback={<PageLoading />}>
          <Outlet />
        </Suspense>
        {/* Not on /telemetry — that view is a dense, chart-heavy workspace
            that assumes it owns the full outlet height; a footer there is
            just unwanted scroll clutter below the actual tool. */}
        {pathname !== '/telemetry' && <Footer />}
      </main>
      <FriendsWidget />
    </div>
  );
}
