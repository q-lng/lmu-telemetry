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
        // Kanban-style — one column per class, each just as tall as its own
        // car count needs. A wrapping grid grouped by category forced wildly
        // uneven sections (18 Hypercars vs. 1 LMP2 ELMS) to line up the same
        // way; columns side by side don't have that problem.
        <div className="cars-kanban-board">
          {columns.map(({ group, cars: columnCars }) => (
            <div key={group.label} className="cars-kanban-column">
              <h2 className="social-subheading cars-kanban-column-header">
                {/* LMP2 WEC/ELMS share this column but differ enough (power
                    level) that either one's specific tone here would
                    misrepresent the other — neutral tone instead, each car's
                    own badge below still shows its precise class. */}
                <Badge tone={group.categories.length === 1 ? CAR_CATEGORY_TONES[group.categories[0]] : 'gray'}>
                  {group.label} ({columnCars.length})
                </Badge>
              </h2>
              {columnCars.map((car) => (
                <Link key={car.slug} to={`/cars/${car.slug}`} className="car-hero-card-link">
                  <CarHero entry={car} headingTag="h3" compact />
                </Link>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
