import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { logout } from '../api';
import { t } from '../i18n';
import { UserIcon } from './icons';
import { VipBadge } from './VipBadge';

/** Pseudo → dropdown in the navbar's top-right corner — same click-outside/
 * Escape-to-close popover pattern as AccentPicker. The avatar is a plain
 * placeholder (no profile picture upload feature exists yet). */
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
        <span className="navbar-avatar" aria-hidden="true">
          <UserIcon />
        </span>
        <span className="account-menu-name">{user.pseudo}</span>
        <VipBadge plan={user.plan} />
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
          <button type="button" className="account-menu-logout" onClick={handleLogout}>
            {t('nav.logout')}
          </button>
        </div>
      )}
    </div>
  );
}
