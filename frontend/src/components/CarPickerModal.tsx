import { Fragment, useEffect, useState } from 'react';
import { fetchCars } from '../api';
import type { CarCatalogEntry } from '../types';
import { CAR_CATEGORY_TONES, CAR_KANBAN_GROUPS } from '../carCategories';
import { t } from '../i18n';
import { CloseIcon } from './icons';
import { SearchResultPhoto } from './SearchResultPhoto';
import { Badge } from './Badge';

interface Props {
  onSelect: (carSlug: string | null) => void;
  onClose: () => void;
}

/** Manual per-session car override — see MesSessions.tsx. Same modal shell
 * as SessionPickerModal.tsx, same kanban grouping as CarsPage.tsx. */
export function CarPickerModal({ onSelect, onClose }: Props) {
  const [cars, setCars] = useState<CarCatalogEntry[] | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    fetchCars().then(setCars);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const q = filter.trim().toLowerCase();
  const filtered = cars?.filter((car) => !q || car.name.toLowerCase().includes(q) || car.manufacturer.toLowerCase().includes(q)) ?? [];
  const columns = CAR_KANBAN_GROUPS.map((group) => ({
    group,
    cars: filtered.filter((car) => group.categories.includes(car.category)),
  })).filter((c) => c.cars.length > 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{t('carPicker.title')}</h2>
          <button className="modal-close" onClick={onClose} title={t('carPicker.close')}>
            <CloseIcon />
          </button>
        </div>

        <input
          className="modal-filter"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t('carPicker.filterPlaceholder')}
        />

        <button className="modal-table-action" onClick={() => onSelect(null)}>
          {t('carPicker.clear')}
        </button>

        {!cars ? (
          <div className="page-loading">
            <span className="spinner" />
          </div>
        ) : (
          <div className="cars-kanban-board">
            {columns.map(({ group, cars: columnCars }) => (
              <div key={group.label} className="cars-kanban-column">
                <h3 className="social-subheading cars-kanban-column-header">
                  <Badge tone={group.categories.length === 1 ? CAR_CATEGORY_TONES[group.categories[0]] : 'gray'}>
                    {group.label} ({columnCars.length})
                  </Badge>
                </h3>
                <div className="navbar-search-group">
                  {columnCars.map((car, i) => (
                    <Fragment key={car.slug}>
                      {i > 0 && <div className="navbar-search-divider" />}
                      <button className="navbar-search-result" onClick={() => onSelect(car.slug)}>
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
                        </span>
                      </button>
                    </Fragment>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
