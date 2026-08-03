import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchNotifications, markNotificationsSeen } from '../api';
import type { Notification } from '../types';
import { t } from '../i18n';
import { BellIcon } from './icons';

/** Bell icon → dropdown, same click-outside/Escape popover pattern as
 * AccountMenu/AccentPicker. Unlike the Friends-tab pending-request dot, this
 * is a real read/unread feed: opening the popover marks everything currently
 * loaded as seen (backend cutoff bumped to now()), so the badge clears even
 * though a friend request can still be pending. */
export function NotificationsBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchNotifications()
      .then((r) => {
        if (!cancelled) {
          setItems(r.items);
          setUnreadCount(r.unreadCount);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) return;
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

  function handleToggle() {
    const next = !open;
    setOpen(next);
    if (next && unreadCount > 0) {
      setUnreadCount(0);
      markNotificationsSeen().catch(() => {});
    }
  }

  return (
    <div className="notif-bell" ref={wrapRef}>
      <button type="button" className="notif-bell-trigger" onClick={handleToggle} title={t('nav.notifications')}>
        <BellIcon />
        {unreadCount > 0 && <span className="notif-bell-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>
      {open && (
        <div className="notif-bell-popover">
          {items.length === 0 && <p className="notif-bell-empty">{t('notifications.empty')}</p>}
          {items.map((n) => (
            <Link
              key={n.id}
              to={`/u/${encodeURIComponent(n.user.pseudo)}`}
              className={n.read ? '' : 'notif-bell-item-unread'}
              onClick={() => setOpen(false)}
            >
              <span>
                {n.type === 'friend_request'
                  ? t('notifications.friendRequest', { pseudo: n.user.pseudo })
                  : t('notifications.newFollower', { pseudo: n.user.pseudo })}
              </span>
              <time className="notif-bell-item-time">{new Date(n.createdAt).toLocaleString()}</time>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
