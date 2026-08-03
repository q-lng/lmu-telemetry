import { useAuth } from '../AuthContext';
import { t } from '../i18n';

// Minimal for now — account fields are read-only, no edit flow yet. A
// deliberate stub so the navbar's "Settings" link isn't dead, not a finished
// feature.
export function Settings() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="social-page">
      <div className="social-card">
        <div className="auth-heading">
          <h1>{t('settings.title')}</h1>
        </div>
        <div className="info-panel">
          <div>
            <strong>{t('settings.pseudo')}</strong> {user.pseudo}
          </div>
          <div>
            <strong>{t('settings.email')}</strong> {user.email}
          </div>
          <div>
            <strong>{t('settings.name')}</strong> {user.prenom} {user.nom}
          </div>
        </div>
        <p className="field-hint">{t('settings.comingSoon')}</p>
      </div>
    </div>
  );
}
