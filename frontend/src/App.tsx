import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { RequireAuth } from './components/RequireAuth';
import { RequireAdmin } from './components/RequireAdmin';

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
const TrackPage = lazy(() => import('./pages/TrackPage').then((m) => ({ default: m.TrackPage })));
const TracksPage = lazy(() => import('./pages/TracksPage').then((m) => ({ default: m.TracksPage })));
const CarsPage = lazy(() => import('./pages/CarsPage').then((m) => ({ default: m.CarsPage })));
const CarPage = lazy(() => import('./pages/CarPage').then((m) => ({ default: m.CarPage })));
const SharedLap = lazy(() => import('./pages/SharedLap').then((m) => ({ default: m.SharedLap })));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword').then((m) => ({ default: m.ForgotPassword })));
const ResetPassword = lazy(() => import('./pages/ResetPassword').then((m) => ({ default: m.ResetPassword })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const Subscription = lazy(() => import('./pages/Subscription').then((m) => ({ default: m.Subscription })));
const AdminHome = lazy(() => import('./pages/AdminHome').then((m) => ({ default: m.AdminHome })));
const AdminUsers = lazy(() => import('./pages/AdminUsers').then((m) => ({ default: m.AdminUsers })));
const AdminDisplay = lazy(() => import('./pages/AdminDisplay').then((m) => ({ default: m.AdminDisplay })));
const AdminContent = lazy(() => import('./pages/AdminContent').then((m) => ({ default: m.AdminContent })));
const AdminManufacturers = lazy(() => import('./pages/AdminManufacturers').then((m) => ({ default: m.AdminManufacturers })));
const LegalNotice = lazy(() => import('./pages/LegalNotice').then((m) => ({ default: m.LegalNotice })));
const TermsOfService = lazy(() => import('./pages/TermsOfService').then((m) => ({ default: m.TermsOfService })));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy').then((m) => ({ default: m.PrivacyPolicy })));

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<LandingPage />} />
        <Route path="telemetry" element={<TelemetryViewer />} />
        <Route path="login" element={<Connexion />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="reset-password" element={<ResetPassword />} />
        <Route path="browse" element={<Browse />} />
        <Route path="tracks" element={<TracksPage />} />
        <Route path="tracks/:slug" element={<TrackPage />} />
        <Route path="cars" element={<CarsPage />} />
        <Route path="cars/:slug" element={<CarPage />} />
        <Route path="shared/:file/:lap" element={<SharedLap />} />
        <Route
          path="friends"
          element={
            <RequireAuth>
              <Social />
            </RequireAuth>
          }
        />
        <Route path="u/:pseudo" element={<Profile />} />
        <Route
          path="my-sessions"
          element={
            <RequireAuth>
              <MesSessions />
            </RequireAuth>
          }
        />
        <Route
          path="settings"
          element={
            <RequireAuth>
              <Settings />
            </RequireAuth>
          }
        />
        <Route
          path="subscription"
          element={
            <RequireAuth>
              <Subscription />
            </RequireAuth>
          }
        />
        <Route
          path="admin"
          element={
            <RequireAdmin>
              <AdminHome />
            </RequireAdmin>
          }
        />
        <Route
          path="admin/users"
          element={
            <RequireAdmin>
              <AdminUsers />
            </RequireAdmin>
          }
        />
        <Route
          path="admin/display"
          element={
            <RequireAdmin>
              <AdminDisplay />
            </RequireAdmin>
          }
        />
        <Route
          path="admin/content"
          element={
            <RequireAdmin>
              <AdminContent />
            </RequireAdmin>
          }
        />
        <Route
          path="admin/content/:tab"
          element={
            <RequireAdmin>
              <AdminContent />
            </RequireAdmin>
          }
        />
        <Route
          path="admin/manufacturers"
          element={
            <RequireAdmin>
              <AdminManufacturers />
            </RequireAdmin>
          }
        />
        <Route path="legal/notice" element={<LegalNotice />} />
        <Route path="legal/terms" element={<TermsOfService />} />
        <Route path="legal/privacy" element={<PrivacyPolicy />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
