import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { acceptFriendRequest, declineFriendRequest, fetchFriendRequests, fetchFriends, removeFriend } from '../api';
import type { FriendRequestSummary, PublicUser } from '../types';
import { t } from '../i18n';
import { useAuth } from '../AuthContext';
import { VipBadge } from './VipBadge';
import { UsersIcon } from './icons';

/** Floating bottom-right module — replaces the old navbar "Friends" link.
 * Same click-outside/Escape popover pattern as NotificationsBell/AccountMenu,
 * just fixed-positioned instead of anchored under a navbar item since it's
 * meant to be reachable from anywhere, not just while the navbar is in view.
 * Only friends + requests (accept/decline/cancel/remove) live here — search
 * for new people to add and the separate follows feature stay on the full
 * /friends page, linked at the bottom of the popover. */
export function FriendsWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [friends, setFriends] = useState<PublicUser[]>([]);
  const [requests, setRequests] = useState<{ incoming: FriendRequestSummary[]; outgoing: FriendRequestSummary[] }>({
    incoming: [],
    outgoing: [],
  });
  const wrapRef = useRef<HTMLDivElement>(null);

  function refreshRequests() {
    fetchFriendRequests()
      .then(setRequests)
      .catch(() => {});
  }

  function refreshFriends() {
    fetchFriends()
      .then(setFriends)
      .catch(() => {});
  }

  // Re-checked on mount and on every user change — cheaply keeps the
  // pending-request dot in sync without a whole separate polling/websocket
  // mechanism (same tradeoff the old navbar badge made).
  useEffect(() => {
    if (!user) return;
    refreshRequests();
  }, [user]);

  useEffect(() => {
    if (!open) return;
    refreshFriends();
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!user) return null;

  const hasPending = requests.incoming.length > 0;

  return (
    <div className="friends-widget" ref={wrapRef}>
      {open && (
        <div className="friends-widget-popover">
          <h2 className="social-subheading">{t('social.received')}</h2>
          <div className="user-list">
            {requests.incoming.length === 0 && <div className="social-empty">{t('social.noIncomingRequests')}</div>}
            {requests.incoming.map((r) => (
              <div className="user-row" key={r.id}>
                <Link to={`/u/${encodeURIComponent(r.user.pseudo)}`} className="user-row-name" onClick={() => setOpen(false)}>
                  <VipBadge plan={r.user.plan} /> {r.user.pseudo}
                </Link>
                <div className="user-row-actions">
                  <button
                    className="relation-accept"
                    onClick={() =>
                      acceptFriendRequest(r.id).then(() => {
                        refreshRequests();
                        refreshFriends();
                      })
                    }
                  >
                    {t('friends.accept')}
                  </button>
                  <button onClick={() => declineFriendRequest(r.id).then(refreshRequests)}>{t('friends.decline')}</button>
                </div>
              </div>
            ))}
          </div>

          {requests.outgoing.length > 0 && (
            <>
              <h2 className="social-subheading">{t('social.sent')}</h2>
              <div className="user-list">
                {requests.outgoing.map((r) => (
                  <div className="user-row" key={r.id}>
                    <Link to={`/u/${encodeURIComponent(r.user.pseudo)}`} className="user-row-name" onClick={() => setOpen(false)}>
                      <VipBadge plan={r.user.plan} /> {r.user.pseudo}
                    </Link>
                    <div className="user-row-actions">
                      <button onClick={() => declineFriendRequest(r.id).then(refreshRequests)}>{t('friends.cancel')}</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          <h2 className="social-subheading">{t('social.tabFriends')}</h2>
          <div className="user-list">
            {friends.length === 0 && <div className="social-empty">{t('social.noFriends')}</div>}
            {friends.map((u) => (
              <div className="user-row" key={u.id}>
                <Link to={`/u/${encodeURIComponent(u.pseudo)}`} className="user-row-name" onClick={() => setOpen(false)}>
                  <VipBadge plan={u.plan} /> {u.pseudo}
                </Link>
                <div className="user-row-actions">
                  <button onClick={() => removeFriend(u.id).then(refreshFriends)}>{t('friends.remove')}</button>
                </div>
              </div>
            ))}
          </div>

          <Link to="/friends" className="friends-widget-manage" onClick={() => setOpen(false)}>
            {t('friends.manage')}
          </Link>
        </div>
      )}
      <button type="button" className="friends-widget-trigger" onClick={() => setOpen((o) => !o)} title={t('nav.friends')}>
        <UsersIcon size={20} />
        {hasPending && <span className="friends-widget-badge" title={t('nav.pendingRequestBadge')} />}
      </button>
    </div>
  );
}
