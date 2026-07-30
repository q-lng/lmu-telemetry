import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { LandingPage } from './pages/LandingPage';
import { ConnexionPlaceholder } from './pages/ConnexionPlaceholder';
import TelemetryViewer from './pages/TelemetryViewer';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<LandingPage />} />
        <Route path="app" element={<TelemetryViewer />} />
        <Route path="connexion" element={<ConnexionPlaceholder />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
