import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { t } from '../i18n';
import { DlcsAdminPanel } from './AdminDlcs';
import { TracksAdminPanel } from './AdminTracks';
import { CarsAdminPanel } from './AdminCars';
import { LiveriesAdminPanel } from './AdminLiveries';

const TABS = ['dlc', 'tracks', 'cars', 'liveries'] as const;
type Tab = (typeof TABS)[number];

function isTab(value: string | undefined): value is Tab {
  return TABS.includes(value as Tab);
}

function tabLabel(tabKey: Tab): string {
  if (tabKey === 'dlc') return t('adminContent.tabDlc');
  if (tabKey === 'tracks') return t('adminContent.tabTracks');
  if (tabKey === 'cars') return t('adminContent.tabCars');
  return t('adminContent.tabLiveries');
}

/** /admin/content — merges what used to be 3 standalone pages
 * (/admin/tracks, /admin/cars, /admin/dlcs) into one page with tabs, so
 * managing the track/car catalogs and the DLC packs they're tagged with
 * lives in one place. The tab is part of the URL (/admin/content/:tab) so
 * it's directly linkable (e.g. the manufacturers page links back to a
 * specific tab), and defaults to "tracks" if missing/invalid. */
export function AdminContent() {
  const { tab } = useParams<{ tab: string }>();
  const navigate = useNavigate();
  const activeTab: Tab = isTab(tab) ? tab : 'tracks';
  const [visited, setVisited] = useState<Set<Tab>>(new Set([activeTab]));

  function selectTab(next: Tab) {
    setVisited((prev) => new Set(prev).add(next));
    navigate(`/admin/content/${next}`, { replace: true });
  }

  return (
    <div className="page-shell">
      <Link to="/admin" className="admin-back-link">
        {t('admin.backToAdmin')}
      </Link>
      <h1>{t('adminContent.title')}</h1>
      <p className="field-hint">{t('adminContent.subtitle')}</p>

      <div className="admin-content-tabs">
        {TABS.map((tabKey) => (
          <button
            key={tabKey}
            className={`admin-content-tab${tabKey === activeTab ? ' active' : ''}`}
            onClick={() => selectTab(tabKey)}
          >
            {tabLabel(tabKey)}
          </button>
        ))}
      </div>

      {/* Each panel keeps its own fetched state once visited, rather than
          re-fetching every time you switch back to it — mount once, then
          just toggle visibility. */}
      <div style={{ display: activeTab === 'dlc' ? 'block' : 'none' }}>{visited.has('dlc') && <DlcsAdminPanel />}</div>
      <div style={{ display: activeTab === 'tracks' ? 'block' : 'none' }}>{visited.has('tracks') && <TracksAdminPanel />}</div>
      <div style={{ display: activeTab === 'cars' ? 'block' : 'none' }}>{visited.has('cars') && <CarsAdminPanel />}</div>
      <div style={{ display: activeTab === 'liveries' ? 'block' : 'none' }}>{visited.has('liveries') && <LiveriesAdminPanel />}</div>
    </div>
  );
}
