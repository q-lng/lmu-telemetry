import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchCars } from '../api';
import type { CarCatalogEntry } from '../types';
import { CAR_CATEGORY_TONES, CAR_KANBAN_GROUPS } from '../carCategories';
import { t } from '../i18n';
import { CarHero } from '../components/CarHero';
import { Badge } from '../components/Badge';

export function CarsPage() {
  const [cars, setCars] = useState<CarCatalogEntry[] | null>(null);

  useEffect(() => {
    fetchCars().then(setCars);
  }, []);

  const columns = cars
    ? CAR_KANBAN_GROUPS.map((group) => ({
        group,
        cars: cars.filter((car) => group.categories.includes(car.category)),
      })).filter((c) => c.cars.length > 0)
    : [];

  return (
    <div className="page-shell">
      <h1>{t('cars.title')}</h1>
      {!cars ? (
        <div className="page-loading">
          <span className="spinner" />
        </div>
      ) : cars.length === 0 ? (
        <div className="social-empty">{t('cars.empty')}</div>
      ) : (
        // One section per class, stacked top to bottom — each section's own
        // cars flow left-to-right and wrap onto new lines as needed.
        <div className="car-catalog-groups">
          {columns.map(({ group, cars: groupCars }) => (
            <div key={group.label} className="car-catalog-group">
              <h2 className="social-subheading car-catalog-group-header">
                {/* LMP2 WEC/ELMS share this group but differ enough (power
                    level) that either one's specific tone here would
                    misrepresent the other — neutral tone instead, each car's
                    own badge below still shows its precise class. */}
                <Badge tone={group.categories.length === 1 ? CAR_CATEGORY_TONES[group.categories[0]] : 'gray'}>
                  {group.label} ({groupCars.length})
                </Badge>
              </h2>
              <div className="car-catalog-row">
                {groupCars.map((car) => (
                  <Link key={car.slug} to={`/cars/${car.slug}`} className="car-hero-card-link">
                    <CarHero entry={car} headingTag="h3" compact />
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
