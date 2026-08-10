import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
import { VipBadge } from '../components/VipBadge';
import { t } from '../i18n';

type Tab = 'search' | 'friends' | 'requests' | 'follows';

const TABS: { key: Tab; labelKey: 'social.tabSearch' | 'social.tabFriends' | 'social.tabRequests' | 'social.tabFollows' }[] = [
  { key: 'search', labelKey: 'social.tabSearch' },
  { key: 'friends', labelKey: 'social.tabFriends' },
  { key: 'requests', labelKey: 'social.tabRequests' },
  { key: 'follows', labelKey: 'social.tabFollows' },
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
  // Guards the friends/requests/follows tabs specifically — without it, an
  // empty array from initial state (before the fetch resolves) briefly shows
  // "no friends"/"no requests" as if that were the real answer, not just "not
  // loaded yet". The search tab has no such gap (nothing fetches until you type).
  const [tabLoading, setTabLoading] = useState(false);

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
    if (tab === 'friends') {
      setTabLoading(true);
      fetchFriends().then((f) => {
        setFriends(f);
        setTabLoading(false);
      });
    }
    if (tab === 'requests') {
      setTabLoading(true);
      fetchFriendRequests().then((r) => {
        setRequests(r);
        setTabLoading(false);
      });
    }
    if (tab === 'follows') {
      setTabLoading(true);
      Promise.all([fetchFollowing(), fetchFollowers()]).then(([f1, f2]) => {
        setFollowing(f1);
        setFollowers(f2);
        setTabLoading(false);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, refreshKey]);

  const followingIds = new Set(following.map((u) => u.id));

  return (
    <div className="page-shell">
      <div className="pill-tabs">
        {TABS.map((item) => (
          <button key={item.key} className={tab === item.key ? 'active' : ''} onClick={() => setTab(item.key)}>
            {t(item.labelKey)}
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
              placeholder={t('social.searchPlaceholder')}
              autoFocus
            />
            <button className="auth-submit" type="submit" disabled={searching}>
              {searching ? t('common.searching') : t('common.search')}
            </button>
          </form>
          <div className="user-list">
            {results.length === 0 && query.trim() && !searching && (
              <div className="social-empty">{t('social.noUsersFound')}</div>
            )}
            {results.map((r) => (
              <div className="user-row" key={r.id}>
                <Link to={`/u/${encodeURIComponent(r.pseudo)}`} className="user-row-name">
                  {r.pseudo} <VipBadge plan={r.plan} /> <span className="user-row-fullname">{r.prenom} {r.nom}</span>
                </Link>
                <RelationActions profile={r} onChange={bump} />
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'friends' && (
        <div className="social-section">
          <div className="user-list">
            {tabLoading ? (
              <div className="social-empty">
                <span className="spinner" />
              </div>
            ) : (
              <>
                {friends.length === 0 && <div className="social-empty">{t('social.noFriends')}</div>}
                {friends.map((u) => (
                  <div className="user-row" key={u.id}>
                    <Link to={`/u/${encodeURIComponent(u.pseudo)}`} className="user-row-name">
                      {u.pseudo} <VipBadge plan={u.plan} /> <span className="user-row-fullname">{u.prenom} {u.nom}</span>
                    </Link>
                    <div className="user-row-actions">
                      <button onClick={() => removeFriend(u.id).then(bump)}>{t('friends.remove')}</button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {tab === 'requests' && (
        <div className="social-section">
          {tabLoading ? (
            <div className="social-empty">
              <span className="spinner" />
            </div>
          ) : (
            <>
              <h2 className="social-subheading">{t('social.received')}</h2>
              <div className="user-list">
                {requests.incoming.length === 0 && <div className="social-empty">{t('social.noIncomingRequests')}</div>}
                {requests.incoming.map((r) => (
                  <div className="user-row" key={r.id}>
                    <Link to={`/u/${encodeURIComponent(r.user.pseudo)}`} className="user-row-name">
                      {r.user.pseudo} <VipBadge plan={r.user.plan} />
                    </Link>
                    <div className="user-row-actions">
                      <button className="relation-accept" onClick={() => acceptFriendRequest(r.id).then(bump)}>
                        {t('friends.accept')}
                      </button>
                      <button onClick={() => declineFriendRequest(r.id).then(bump)}>{t('friends.decline')}</button>
                    </div>
                  </div>
                ))}
              </div>

              <h2 className="social-subheading">{t('social.sent')}</h2>
              <div className="user-list">
                {requests.outgoing.length === 0 && <div className="social-empty">{t('social.noOutgoingRequests')}</div>}
                {requests.outgoing.map((r) => (
                  <div className="user-row" key={r.id}>
                    <Link to={`/u/${encodeURIComponent(r.user.pseudo)}`} className="user-row-name">
                      {r.user.pseudo} <VipBadge plan={r.user.plan} />
                    </Link>
                    <div className="user-row-actions">
                      <button onClick={() => declineFriendRequest(r.id).then(bump)}>{t('friends.cancel')}</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'follows' && (
        <div className="social-section">
          {tabLoading ? (
            <div className="social-empty">
              <span className="spinner" />
            </div>
          ) : (
            <>
              <h2 className="social-subheading">{t('social.following')}</h2>
              <div className="user-list">
                {following.length === 0 && <div className="social-empty">{t('social.notFollowingAnyone')}</div>}
                {following.map((u) => (
                  <div className="user-row" key={u.id}>
                    <Link to={`/u/${encodeURIComponent(u.pseudo)}`} className="user-row-name">
                      {u.pseudo} <VipBadge plan={u.plan} />
                    </Link>
                    <div className="user-row-actions">
                      <button onClick={() => unfollowUser(u.pseudo).then(bump)}>{t('follows.unfollow')}</button>
                    </div>
                  </div>
                ))}
              </div>

              <h2 className="social-subheading">{t('social.followers')}</h2>
              <div className="user-list">
                {followers.length === 0 && <div className="social-empty">{t('social.noFollowers')}</div>}
                {followers.map((u) => (
                  <div className="user-row" key={u.id}>
                    <Link to={`/u/${encodeURIComponent(u.pseudo)}`} className="user-row-name">
                      {u.pseudo} <VipBadge plan={u.plan} />
                    </Link>
                    {!followingIds.has(u.id) && (
                      <div className="user-row-actions">
                        <button onClick={() => followUser(u.pseudo).then(bump)}>{t('social.followBack')}</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
