import { useEffect, useState } from 'react';
import {
  acceptFriendRequest,
  declineFriendRequest,
  fetchFollowers,
  fetchFollowing,
  fetchFriendRequests,
  fetchFriends,
  followUser,
  removeFriend,
  searchUsers,
  unfollowUser,
} from '../api';
import type { FriendRequestSummary, ProfileSummary, PublicUser } from '../types';
import { RelationActions } from '../components/RelationActions';

type Tab = 'search' | 'friends' | 'requests' | 'follows';

const TABS: { key: Tab; label: string }[] = [
  { key: 'search', label: 'Rechercher' },
  { key: 'friends', label: 'Amis' },
  { key: 'requests', label: 'Demandes' },
  { key: 'follows', label: 'Abonnements' },
];

export function Social() {
  const [tab, setTab] = useState<Tab>('search');
  const [refreshKey, setRefreshKey] = useState(0);
  const bump = () => setRefreshKey((k) => k + 1);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProfileSummary[]>([]);
  const [searching, setSearching] = useState(false);

  const [friends, setFriends] = useState<PublicUser[]>([]);
  const [requests, setRequests] = useState<{ incoming: FriendRequestSummary[]; outgoing: FriendRequestSummary[] }>({
    incoming: [],
    outgoing: [],
  });
  const [following, setFollowing] = useState<PublicUser[]>([]);
  const [followers, setFollowers] = useState<PublicUser[]>([]);

  async function runSearch(q: string) {
    if (q.trim().length === 0) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      setResults(await searchUsers(q));
    } finally {
      setSearching(false);
    }
  }

  useEffect(() => {
    if (tab === 'search' && query.trim()) runSearch(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  useEffect(() => {
    if (tab === 'friends') fetchFriends().then(setFriends);
    if (tab === 'requests') fetchFriendRequests().then(setRequests);
    if (tab === 'follows') Promise.all([fetchFollowing(), fetchFollowers()]).then(([f1, f2]) => {
      setFollowing(f1);
      setFollowers(f2);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, refreshKey]);

  const followingIds = new Set(following.map((u) => u.id));

  return (
    <div className="social-page">
      <div className="social-card">
        <div className="pill-tabs">
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'search' && (
          <div className="social-section">
            <form
              className="social-search-form"
              onSubmit={(e) => {
                e.preventDefault();
                runSearch(query);
              }}
            >
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Chercher un pseudo…"
                autoFocus
              />
              <button className="auth-submit" type="submit" disabled={searching}>
                {searching ? 'Recherche…' : 'Chercher'}
              </button>
            </form>
            <div className="user-list">
              {results.length === 0 && query.trim() && !searching && (
                <div className="social-empty">Aucun utilisateur trouvé.</div>
              )}
              {results.map((r) => (
                <div className="user-row" key={r.id}>
                  <a href={`/u/${encodeURIComponent(r.pseudo)}`} className="user-row-name">
                    {r.pseudo} <span className="user-row-fullname">{r.prenom} {r.nom}</span>
                  </a>
                  <RelationActions profile={r} onChange={bump} />
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'friends' && (
          <div className="social-section">
            <div className="user-list">
              {friends.length === 0 && <div className="social-empty">Pas encore d'amis.</div>}
              {friends.map((u) => (
                <div className="user-row" key={u.id}>
                  <a href={`/u/${encodeURIComponent(u.pseudo)}`} className="user-row-name">
                    {u.pseudo} <span className="user-row-fullname">{u.prenom} {u.nom}</span>
                  </a>
                  <div className="user-row-actions">
                    <button onClick={() => removeFriend(u.id).then(bump)}>Retirer</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'requests' && (
          <div className="social-section">
            <h2 className="social-subheading">Reçues</h2>
            <div className="user-list">
              {requests.incoming.length === 0 && <div className="social-empty">Aucune demande reçue.</div>}
              {requests.incoming.map((r) => (
                <div className="user-row" key={r.id}>
                  <a href={`/u/${encodeURIComponent(r.user.pseudo)}`} className="user-row-name">
                    {r.user.pseudo}
                  </a>
                  <div className="user-row-actions">
                    <button className="relation-accept" onClick={() => acceptFriendRequest(r.id).then(bump)}>
                      Accepter
                    </button>
                    <button onClick={() => declineFriendRequest(r.id).then(bump)}>Refuser</button>
                  </div>
                </div>
              ))}
            </div>

            <h2 className="social-subheading">Envoyées</h2>
            <div className="user-list">
              {requests.outgoing.length === 0 && <div className="social-empty">Aucune demande envoyée.</div>}
              {requests.outgoing.map((r) => (
                <div className="user-row" key={r.id}>
                  <a href={`/u/${encodeURIComponent(r.user.pseudo)}`} className="user-row-name">
                    {r.user.pseudo}
                  </a>
                  <div className="user-row-actions">
                    <button onClick={() => declineFriendRequest(r.id).then(bump)}>Annuler</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'follows' && (
          <div className="social-section">
            <h2 className="social-subheading">Je suis</h2>
            <div className="user-list">
              {following.length === 0 && <div className="social-empty">Tu ne suis personne.</div>}
              {following.map((u) => (
                <div className="user-row" key={u.id}>
                  <a href={`/u/${encodeURIComponent(u.pseudo)}`} className="user-row-name">
                    {u.pseudo}
                  </a>
                  <div className="user-row-actions">
                    <button onClick={() => unfollowUser(u.pseudo).then(bump)}>Ne plus suivre</button>
                  </div>
                </div>
              ))}
            </div>

            <h2 className="social-subheading">Mes abonnés</h2>
            <div className="user-list">
              {followers.length === 0 && <div className="social-empty">Personne ne te suit encore.</div>}
              {followers.map((u) => (
                <div className="user-row" key={u.id}>
                  <a href={`/u/${encodeURIComponent(u.pseudo)}`} className="user-row-name">
                    {u.pseudo}
                  </a>
                  {!followingIds.has(u.id) && (
                    <div className="user-row-actions">
                      <button onClick={() => followUser(u.pseudo).then(bump)}>Suivre en retour</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
