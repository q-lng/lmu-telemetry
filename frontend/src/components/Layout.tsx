import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';
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
      </main>
    </div>
  );
}
