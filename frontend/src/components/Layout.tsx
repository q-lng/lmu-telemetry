import { Outlet } from 'react-router-dom';
import { Navbar } from './Navbar';

export function Layout() {
  return (
    <div className="app-shell">
      <Navbar />
      <main className="layout-outlet">
        <Outlet />
      </main>
    </div>
  );
}
