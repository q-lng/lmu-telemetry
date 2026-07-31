import { lazy, useEffect } from 'react';
import { Route, Routes } from 'react-router-dom';
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
const MesSessions = lazy(() => import('./pages/MesSessions').then((m) => ({ default: m.MesSessions })));
const Browse = lazy(() => import('./pages/Browse').then((m) => ({ default: m.Browse })));
const SharedLap = lazy(() => import('./pages/SharedLap').then((m) => ({ default: m.SharedLap })));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword').then((m) => ({ default: m.ForgotPassword })));
const ResetPassword = lazy(() => import('./pages/ResetPassword').then((m) => ({ default: m.ResetPassword })));

function NotFoundRedirect() {
  // Full page navigation, not a client-side redirect — consistent with the rest
  // of the app's real-website-style navigation.
  useEffect(() => {
    window.location.replace('/');
  }, []);
  return null;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<LandingPage />} />
        <Route path="telemetrie" element={<TelemetryViewer />} />
        <Route path="connexion" element={<Connexion />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="reset-password" element={<ResetPassword />} />
        <Route path="parcourir" element={<Browse />} />
        <Route path="partage/:file/:lap" element={<SharedLap />} />
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
        <Route
          path="mes-sessions"
          element={
            <RequireAuth>
              <MesSessions />
            </RequireAuth>
          }
        />
        <Route path="*" element={<NotFoundRedirect />} />
      </Route>
    </Routes>
  );
}
