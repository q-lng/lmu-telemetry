import { useState } from 'react';
import { useAuth } from '../AuthContext';
import { updateProfileVisibility } from '../api';
import type { ProfileVisibility } from '../types';
import { t } from '../i18n';

// Account fields (pseudo/email/name) are read-only, no edit flow yet — a
// deliberate stub so the navbar's "Settings" link isn't dead. Profile
// visibility is the one setting that's actually editable here.
export function Settings() {
  const { user, setUser } = useAuth();
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  async function setVisibility(visibility: ProfileVisibility) {
    if (visibility === user!.profileVisibility || saving) return;
    setSaving(true);
    try {
      setUser(await updateProfileVisibility(visibility));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-shell narrow-form-section">
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

      <div className="field">
        <strong>{t('settings.profileVisibility')}</strong>
        <div className="segmented">
          <button
            className={user.profileVisibility === 'public' ? 'active' : ''}
            disabled={saving}
            onClick={() => setVisibility('public')}
          >
            {t('settings.profileVisibilityPublic')}
          </button>
          <button
            className={user.profileVisibility === 'private' ? 'active' : ''}
            disabled={saving}
            onClick={() => setVisibility('private')}
          >
            {t('settings.profileVisibilityPrivate')}
          </button>
        </div>
        <p className="field-hint">{saving ? t('settings.profileVisibilitySaving') : t('settings.profileVisibilityHint')}</p>
      </div>
    </div>
  );
}
