import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchProfile } from '../api';
import type { ProfileSummary } from '../types';
import { useAuth } from '../AuthContext';
import { RelationActions } from '../components/RelationActions';
import { VipBadge } from '../components/VipBadge';
import { t } from '../i18n';

export function Profile() {
  const { pseudo = '' } = useParams<{ pseudo: string }>();
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setNotFound(false);
    setProfile(null);
    fetchProfile(pseudo)
      .then(setProfile)
      .catch(() => setNotFound(true));
  }, [pseudo, refreshKey]);

  if (notFound) {
    return (
      <div className="page-shell">
        <div className="social-empty">{t('profile.notFound')}</div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="page-loading">
        <span className="spinner" />
      </div>
    );
  }

  const isSelf = user?.pseudo === profile.pseudo;

  return (
    <div className="page-shell">
      <div className="profile-card">
        <div className="profile-heading">
          <h1>
            <VipBadge plan={profile.plan} /> {profile.pseudo}
          </h1>
          <p>
            {profile.prenom} {profile.nom}
          </p>
        </div>
        {isSelf ? (
          <Link to="/settings" className="modal-table-action">
            {t('profile.editProfile')}
          </Link>
        ) : user ? (
          <RelationActions profile={profile} onChange={() => setRefreshKey((k) => k + 1)} />
        ) : (
          <p className="field-hint">{t('profile.signInToInteract')}</p>
        )}
      </div>
    </div>
  );
}
