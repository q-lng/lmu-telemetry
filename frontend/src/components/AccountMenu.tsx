import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../AuthContext';
import { logout } from '../api';
import { t } from '../i18n';

/** Pseudo → dropdown in the navbar's top-right corner — same click-outside/
 * Escape-to-close popover pattern as AccentPicker. Plan/admin badges sit next
 * to the trigger; there's no UI yet to assign either (see the admin panel
 * roadmap), they just render once the backend says so. */
export function AccountMenu() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

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

  if (!user) return null;

  async function handleLogout() {
    await logout();
    window.location.href = '/';
  }

  return (
    <div className="account-menu" ref={wrapRef}>
      <button type="button" className="account-menu-trigger" onClick={() => setOpen((o) => !o)}>
        {user.plan === 'vip' && (
          <span className="account-badge account-badge-vip" title={t('nav.vipBadge')}>
            ♛
          </span>
        )}
        {user.isAdmin && (
          <span className="account-badge account-badge-admin" title={t('nav.adminBadge')}>
            ⚙
          </span>
        )}
        <span className="account-menu-name">{user.pseudo}</span>
      </button>
      {open && (
        <div className="account-menu-popover">
          <a href={`/u/${encodeURIComponent(user.pseudo)}`}>{t('nav.myProfile')}</a>
          <a href="/settings">{t('nav.settings')}</a>
          <a href="/subscription">{t('nav.subscription')}</a>
          {user.isAdmin && <a href="/admin">{t('nav.administration')}</a>}
          <button type="button" onClick={handleLogout}>
            {t('nav.logout')}
          </button>
        </div>
      )}
    </div>
  );
}
