import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchProfile } from '../api';
import type { ProfileSummary } from '../types';
import { useAuth } from '../AuthContext';
import { RelationActions } from '../components/RelationActions';

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
      <div className="social-page">
        <div className="social-card">
          <div className="social-empty">Utilisateur introuvable.</div>
        </div>
      </div>
    );
  }

  if (!profile) return null;

  const isSelf = user?.pseudo === profile.pseudo;

  return (
    <div className="social-page">
      <div className="social-card profile-card">
        <div className="profile-heading">
          <h1>{profile.pseudo}</h1>
          <p>
            {profile.prenom} {profile.nom}
          </p>
        </div>
        {isSelf ? (
          <div className="social-empty">C'est ton profil.</div>
        ) : (
          <RelationActions profile={profile} onChange={() => setRefreshKey((k) => k + 1)} />
        )}
      </div>
    </div>
  );
}
