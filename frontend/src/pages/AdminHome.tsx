import { Link } from 'react-router-dom';
import { t } from '../i18n';
import { UsersIcon, GearIcon, MapPinIcon } from '../components/icons';

/** Landing hub for /admin — big clickable tiles linking to each admin
 * section (Assetto Corsa Server Manager's admin dashboard was the reference
 * Quentin pointed at), rather than one long page with everything crammed
 * together. Add a new tile here as admin sections grow. */
export function AdminHome() {
  return (
    <div className="page-shell page-shell-centered">
      <h1>{t('admin.title')}</h1>
      <div className="admin-tiles">
        <Link to="/admin/users" className="admin-tile">
          <UsersIcon size={28} />
          <h2>{t('admin.tileUsers')}</h2>
          <p>{t('admin.tileUsersDesc')}</p>
        </Link>
        <Link to="/admin/display" className="admin-tile">
          <GearIcon size={28} />
          <h2>{t('admin.tileDisplay')}</h2>
          <p>{t('admin.tileDisplayDesc')}</p>
        </Link>
        <Link to="/admin/tracks" className="admin-tile">
          <MapPinIcon size={28} />
          <h2>{t('admin.tileTracks')}</h2>
          <p>{t('admin.tileTracksDesc')}</p>
        </Link>
      </div>
    </div>
  );
}
