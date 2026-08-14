import { useEffect, useState } from 'react';
import { useAuth } from '../AuthContext';
import { updateProfile, updateProfileVisibility } from '../api';
import type { ProfileVisibility } from '../types';
import { t } from '../i18n';

export function Settings() {
  const { user, setUser } = useAuth();
  const [visibilitySaving, setVisibilitySaving] = useState(false);

  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [lmuPseudo, setLmuPseudo] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSaved, setProfileSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    setPrenom(user.prenom);
    setNom(user.nom);
    setLmuPseudo(user.lmuPseudo ?? '');
  }, [user]);

  if (!user) return null;

  async function setVisibility(visibility: ProfileVisibility) {
    if (visibility === user!.profileVisibility || visibilitySaving) return;
    setVisibilitySaving(true);
    try {
      setUser(await updateProfileVisibility(visibility));
    } finally {
      setVisibilitySaving(false);
    }
  }

  async function saveProfile() {
    setProfileSaving(true);
    setProfileError(null);
    setProfileSaved(false);
    try {
      setUser(await updateProfile({ prenom: prenom.trim(), nom: nom.trim(), lmuPseudo: lmuPseudo.trim() }));
      setProfileSaved(true);
    } catch (err) {
      setProfileError((err as Error).message);
    } finally {
      setProfileSaving(false);
    }
  }

  return (
    <div className="page-shell">
      <div className="narrow-form-section">
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
        </div>

        <div className="field">
          <strong>{t('settings.name')}</strong>
          <input
            value={prenom}
            onChange={(e) => setPrenom(e.target.value)}
            placeholder={t('settings.firstName')}
            disabled={profileSaving}
          />
          <input value={nom} onChange={(e) => setNom(e.target.value)} placeholder={t('settings.lastName')} disabled={profileSaving} />
        </div>

        <div className="field">
          <strong>{t('settings.lmuPseudo')}</strong>
          <input value={lmuPseudo} onChange={(e) => setLmuPseudo(e.target.value)} disabled={profileSaving} />
          <p className="field-hint">{t('settings.lmuPseudoHint')}</p>
        </div>

        {profileError && <div className="upload-error">{profileError}</div>}
        <button className="auth-submit" disabled={profileSaving} onClick={saveProfile}>
          {profileSaving ? t('settings.editSaving') : t('settings.editSave')}
        </button>
        {profileSaved && !profileSaving && <p className="field-hint">{t('settings.editSaved')}</p>}

        <div className="field">
          <strong>{t('settings.profileVisibility')}</strong>
          <div className="segmented">
            <button
              className={user.profileVisibility === 'public' ? 'active' : ''}
              disabled={visibilitySaving}
              onClick={() => setVisibility('public')}
            >
              {t('settings.profileVisibilityPublic')}
            </button>
            <button
              className={user.profileVisibility === 'private' ? 'active' : ''}
              disabled={visibilitySaving}
              onClick={() => setVisibility('private')}
            >
              {t('settings.profileVisibilityPrivate')}
            </button>
          </div>
          <p className="field-hint">{visibilitySaving ? t('settings.profileVisibilitySaving') : t('settings.profileVisibilityHint')}</p>
        </div>
      </div>
    </div>
  );
}
