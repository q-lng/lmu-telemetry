import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';

function PageLoading() {
  return (
    <div className="page-loading">
      <span className="spinner" />
    </div>
  );
}

export function Layout() {
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
