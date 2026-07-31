import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';

// Route-level code splitting: each page is a separate chunk fetched on demand
// instead of every page (including the heavy TelemetryViewer, which pulls in
// uPlot + DuckDB-WASM) loading up front just to render the landing page.
const LandingPage = lazy(() => import('./pages/LandingPage').then((m) => ({ default: m.LandingPage })));
const Connexion = lazy(() => import('./pages/Connexion').then((m) => ({ default: m.Connexion })));
const TelemetryViewer = lazy(() => import('./pages/TelemetryViewer'));
const Social = lazy(() => import('./pages/Social').then((m) => ({ default: m.Social })));
const Profile = lazy(() => import('./pages/Profile').then((m) => ({ default: m.Profile })));

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<LandingPage />} />
        <Route path="app" element={<TelemetryViewer />} />
        <Route path="connexion" element={<Connexion />} />
        <Route
          path="amis"
          element={
            <RequireAuth>
              <Social />
            </RequireAuth>
          }
        />
        <Route
          path="u/:pseudo"
          element={
            <RequireAuth>
              <Profile />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
