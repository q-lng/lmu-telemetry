import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';

// Route-level code splitting: each page is a separate chunk fetched on demand
// instead of every page (including the heavy TelemetryViewer, which pulls in
// uPlot + DuckDB-WASM) loading up front just to render the landing page.
const LandingPage = lazy(() => import('./pages/LandingPage').then((m) => ({ default: m.LandingPage })));
const Connexion = lazy(() => import('./pages/Connexion').then((m) => ({ default: m.Connexion })));
const TelemetryViewer = lazy(() => import('./pages/TelemetryViewer'));

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<LandingPage />} />
        <Route path="app" element={<TelemetryViewer />} />
        <Route path="connexion" element={<Connexion />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
