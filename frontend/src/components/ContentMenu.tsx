import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { t } from '../i18n';
import { ChevronIcon } from './icons';

/** "Content" navbar item — Tracks / Cars. Same click-outside/Escape-to-close
 * popover pattern as AccountMenu, just left-aligned under the trigger since
 * it sits inline in .navbar-links instead of at the far right. */
export function ContentMenu() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const active = pathname.startsWith('/tracks') || pathname.startsWith('/cars');

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

  return (
    <div className="content-menu" ref={wrapRef}>
      <button type="button" className="content-menu-trigger" onClick={() => setOpen((o) => !o)} aria-current={active ? 'page' : undefined}>
        {t('nav.content')}
        <ChevronIcon size={12} />
      </button>
      {open && (
        <div className="content-menu-popover">
          <Link to="/tracks" onClick={() => setOpen(false)}>
            {t('nav.contentTracks')}
          </Link>
          <Link to="/cars" onClick={() => setOpen(false)}>
            {t('nav.contentCars')}
          </Link>
        </div>
      )}
    </div>
  );
}
