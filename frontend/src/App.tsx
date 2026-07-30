import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { LandingPage } from './pages/LandingPage';
import { Connexion } from './pages/Connexion';
import TelemetryViewer from './pages/TelemetryViewer';

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
