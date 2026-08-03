import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { logout } from '../api';
import { t } from '../i18n';

/** Pseudo → dropdown in the navbar's top-right corner — same click-outside/
 * Escape-to-close popover pattern as AccentPicker. Plan/admin badges sit next
 * to the trigger; there's no UI yet to assign either (see the admin panel
 * roadmap), they just render once the backend says so. */
export function AccountMenu() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
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
    // No full page reload anymore to reset auth state implicitly — clear it
    // ourselves before navigating away.
    setUser(null);
    navigate('/');
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
          <Link to={`/u/${encodeURIComponent(user.pseudo)}`} onClick={() => setOpen(false)}>
            {t('nav.myProfile')}
          </Link>
          <Link to="/settings" onClick={() => setOpen(false)}>
            {t('nav.settings')}
          </Link>
          <Link to="/subscription" onClick={() => setOpen(false)}>
            {t('nav.subscription')}
          </Link>
          {user.isAdmin && (
            <Link to="/admin" onClick={() => setOpen(false)}>
              {t('nav.administration')}
            </Link>
          )}
          <button type="button" onClick={handleLogout}>
            {t('nav.logout')}
          </button>
        </div>
      )}
    </div>
  );
}
