import { useEffect, useState } from 'react';
import { fetchCars } from '../api';
import type { CarCatalogEntry } from '../types';
import { CAR_CATEGORY_TONES, CAR_KANBAN_GROUPS } from '../carCategories';
import { t } from '../i18n';
import { CloseIcon } from './icons';
import { Badge } from './Badge';

interface Props {
  onSelect: (carSlug: string | null) => void;
  onClose: () => void;
}

/** Manual per-session car override — see MesSessions.tsx. Same modal shell
 * as SessionPickerModal.tsx, same per-category grouping as CarsPage.tsx
 * (each category's cars flow horizontally as compact chips and wrap). */
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

        <div className="modal-filter-row">
          <input
            className="modal-filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t('carPicker.filterPlaceholder')}
          />
          <button className="modal-table-action" onClick={() => onSelect(null)}>
            {t('carPicker.clear')}
          </button>
        </div>

        {!cars ? (
          <div className="page-loading">
            <span className="spinner" />
          </div>
        ) : (
          <div className="car-catalog-groups">
            {columns.map(({ group, cars: groupCars }) => (
              <div key={group.label} className="car-catalog-group">
                <h3 className="social-subheading car-catalog-group-header">
                  <Badge tone={group.categories.length === 1 ? CAR_CATEGORY_TONES[group.categories[0]] : 'gray'}>
                    {group.label} ({groupCars.length})
                  </Badge>
                </h3>
                <div className="car-catalog-row">
                  {groupCars.map((car) => (
                    <button key={car.slug} className="car-picker-chip" onClick={() => onSelect(car.slug)}>
                      {car.manufacturerBadgeExt && (
                        <img
                          className="car-picker-chip-badge"
                          src={`/api/manufacturer-photos/${car.manufacturerSlug}.${car.manufacturerBadgeExt}`}
                          alt=""
                        />
                      )}
                      {car.name}
                    </button>
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
