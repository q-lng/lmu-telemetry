import { Fragment, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { useSiteSettings } from '../SiteSettingsContext';
import { searchAll } from '../api';
import type { NavItemKey, SearchResults } from '../types';
import { t } from '../i18n';
import { AccentPicker } from './AccentPicker';
import { AccountMenu } from './AccountMenu';
import { ContentMenu } from './ContentMenu';
import { NotificationsBell } from './NotificationsBell';
import { CloseIcon, SearchIcon } from './icons';
import { VipBadge } from './VipBadge';
import { Flag } from './flags';
import { Badge } from './Badge';
import { CAR_CATEGORY_LABELS, CAR_CATEGORY_TONES } from '../carCategories';
import { SearchResultPhoto } from './SearchResultPhoto';

// Client-side navigation (Link/useLocation) — the app used to force a real
// full-page load on every navigation; that's what caused the white flash and
// full style/JS reload on every click, so this (plus every other internal
// link/redirect in the app) switched to React Router's own navigation.
export function Navbar() {
  const { user, loading } = useAuth();
  const { settings: siteSettings } = useSiteSettings();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const siteName = siteSettings?.siteName ?? t('brand');
  // Settings haven't loaded yet -> nothing's hidden, matching how every
  // other siteSettings-derived default already falls back before load.
  function isNavItemHidden(key: NavItemKey): boolean {
    return siteSettings?.hiddenNavItems?.includes(key) ?? false;
  }

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    document.title = siteName;
  }, [siteName]);

  useEffect(() => {
    if (searchOpen) inputRef.current?.focus();
  }, [searchOpen]);

  // Debounced — fires 250ms after typing stops, not on every keystroke.
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      searchAll(trimmed)
        .then(setResults)
        .finally(() => setSearching(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!searchOpen) return;
    function onDocClick(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) closeSearch();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeSearch();
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [searchOpen]);

  function closeSearch() {
    setSearchOpen(false);
    setQuery('');
    setResults(null);
  }

  function goToUser(pseudo: string) {
    closeSearch();
    navigate(`/u/${encodeURIComponent(pseudo)}`);
  }

  function goToTrack(track: { name: string; slug: string | null }) {
    closeSearch();
    navigate(track.slug ? `/tracks/${track.slug}` : `/browse?track=${encodeURIComponent(track.name)}`);
  }

  function goToCar(slug: string) {
    closeSearch();
    navigate(`/cars/${slug}`);
  }

  return (
    <div className="navbar-row">
      <nav className={`navbar${searchOpen ? ' navbar-search-active' : ''}`} ref={navRef}>
        <Link to="/" className="navbar-brand">
          {siteName}
        </Link>
        {searchOpen ? (
          <div className="navbar-search">
            <SearchIcon size={14} />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('nav.searchPlaceholder')}
            />
            <button className="navbar-search-close" onClick={closeSearch} title={t('nav.searchClose')}>
              <CloseIcon size={12} />
            </button>
            {query.trim() && (
              <div className="navbar-search-results">
                {searching && !results && <div className="navbar-search-empty">{t('common.searching')}</div>}
                {results && results.users.length === 0 && results.tracks.length === 0 && results.cars.length === 0 && (
                  <div className="navbar-search-empty">{t('nav.searchNoResults')}</div>
                )}
                {results && results.users.length > 0 && (
                  <div className="navbar-search-group">
                    <div className="navbar-search-group-label">{t('nav.searchUsers')}</div>
                    {results.users.map((u, i) => (
                      <Fragment key={u.id}>
                        {i > 0 && <div className="navbar-search-divider" />}
                        <button className="navbar-search-result" onClick={() => goToUser(u.pseudo)}>
                          <VipBadge plan={u.plan} /> {u.pseudo}
                        </button>
                      </Fragment>
                    ))}
                  </div>
                )}
                {results && results.tracks.length > 0 && (
                  <div className="navbar-search-group">
                    <div className="navbar-search-group-label">{t('nav.searchTracks')}</div>
                    {results.tracks.map((track, i) => (
                      <Fragment key={track.name}>
                        {i > 0 && <div className="navbar-search-divider" />}
                        <button className="navbar-search-result" onClick={() => goToTrack(track)}>
                          <SearchResultPhoto url={track.photoExt ? `/api/track-photos/${track.slug}.${track.photoExt}` : null} />
                          <span className="navbar-search-result-content">
                            {track.country && <Flag country={track.country} size={14} />} {track.name}
                          </span>
                        </button>
                      </Fragment>
                    ))}
                  </div>
                )}
                {results && results.cars.length > 0 && (
                  <div className="navbar-search-group">
                    <div className="navbar-search-group-label">{t('nav.searchCars')}</div>
                    {results.cars.map((car, i) => (
                      <Fragment key={car.slug}>
                        {i > 0 && <div className="navbar-search-divider" />}
                        <button className="navbar-search-result" onClick={() => goToCar(car.slug)}>
                          <SearchResultPhoto url={car.photoExt ? `/api/car-photos/${car.slug}.${car.photoExt}` : null} />
                          <span className="navbar-search-result-content">
                            <span className="navbar-search-result-main">
                              {car.manufacturerBadgeExt && (
                                <img
                                  className="navbar-search-result-mfr-badge"
                                  src={`/api/manufacturer-photos/${car.manufacturerSlug}.${car.manufacturerBadgeExt}`}
                                  alt=""
                                />
                              )}
                              {car.name}
                            </span>
                            <span className="navbar-search-result-category">
                              <Badge tone={CAR_CATEGORY_TONES[car.category]}>{CAR_CATEGORY_LABELS[car.category]}</Badge>
                            </span>
                          </span>
                        </button>
                      </Fragment>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="navbar-links">
              <Link to="/" aria-current={pathname === '/' ? 'page' : undefined}>
                {t('nav.home')}
              </Link>
              {!isNavItemHidden('telemetry') && (
                <Link to="/telemetry" aria-current={pathname === '/telemetry' ? 'page' : undefined}>
                  {t('nav.app')}
                </Link>
              )}
              {!isNavItemHidden('browse') && (
                <Link to="/browse" aria-current={pathname === '/browse' ? 'page' : undefined}>
                  {t('nav.browse')}
                </Link>
              )}
              {!isNavItemHidden('leaderboard') && (
                <Link to="/leaderboard" aria-current={pathname === '/leaderboard' ? 'page' : undefined}>
                  {t('nav.leaderboard')}
                </Link>
              )}
              {!isNavItemHidden('content') && <ContentMenu />}
              {user && !isNavItemHidden('mySessions') && (
                <Link to="/my-sessions" aria-current={pathname === '/my-sessions' ? 'page' : undefined}>
                  {t('nav.mySessions')}
                </Link>
              )}
            </div>
            <button className="navbar-search-trigger" onClick={() => setSearchOpen(true)} title={t('nav.search')}>
              <SearchIcon size={16} />
            </button>
          </>
        )}
      </nav>
      <div className="navbar-side">
        <AccentPicker />
        {!loading &&
          (user ? (
            <>
              <NotificationsBell />
              <AccountMenu />
            </>
          ) : (
            <Link to="/login" className="navbar-login" aria-current={pathname === '/login' ? 'page' : undefined}>
              {t('nav.login')}
            </Link>
          ))}
      </div>
    </div>
  );
}
