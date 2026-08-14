import { useEffect, useState } from 'react';
import { fetchAdminLiveryMappings, fetchCars, setAdminLiveryMapping } from '../api';
import type { CarCatalogEntry } from '../types';
import { t } from '../i18n';
import { CarPickerModal } from '../components/CarPickerModal';

interface RowProps {
  liveryName: string;
  carSlug: string;
  cars: CarCatalogEntry[];
  onPick: (liveryName: string) => void;
}

function LiveryRow({ liveryName, carSlug, cars, onPick }: RowProps) {
  const mappedCar = cars.find((c) => c.slug === carSlug);

  return (
    <tr>
      <td>{liveryName}</td>
      <td>{mappedCar ? mappedCar.name : t('adminLiveries.unmappedOption')}</td>
      <td>
        <button className="modal-table-action" onClick={() => onPick(liveryName)}>
          {carSlug ? t('adminLiveries.changeCar') : t('adminLiveries.assignCar')}
        </button>
      </td>
    </tr>
  );
}

/** Embedded as the Liveries tab of /admin/content (see AdminContent.tsx) —
 * no page-shell/heading of its own, the parent page owns that. Maps a raw
 * telemetry livery/team-skin name to a real car once, resolving every
 * session sharing that exact livery — see backend/src/liveryMappings.ts. */
export function LiveriesAdminPanel() {
  const [liveries, setLiveries] = useState<string[] | null>(null);
  const [carSlugByLivery, setCarSlugByLivery] = useState<Record<string, string>>({});
  const [cars, setCars] = useState<CarCatalogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminLiveryMappings()
      .then(({ liveries: names, mappings }) => {
        setLiveries(names);
        setCarSlugByLivery(Object.fromEntries(mappings.map((m) => [m.liveryName, m.carSlug])));
      })
      .catch((err) => setError((err as Error).message));
    fetchCars().then(setCars);
  }, []);

  async function handlePick(carSlug: string | null) {
    const liveryName = pickerFor!;
    setPickerFor(null);
    setError(null);
    try {
      await setAdminLiveryMapping(liveryName, carSlug);
      setCarSlugByLivery((prev) => {
        const next = { ...prev };
        if (carSlug) next[liveryName] = carSlug;
        else delete next[liveryName];
        return next;
      });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div>
      <p className="field-hint">{t('adminLiveries.subtitle')}</p>

      {error && <div className="auth-error">{error}</div>}
      {!liveries ? (
        <div className="page-loading">
          <span className="spinner" />
        </div>
      ) : liveries.length === 0 ? (
        <div className="social-empty">{t('adminLiveries.empty')}</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="modal-table admin-users-table">
            <thead>
              <tr>
                <th>{t('adminLiveries.colLivery')}</th>
                <th>{t('adminLiveries.colCar')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {liveries.map((liveryName) => (
                <LiveryRow
                  key={liveryName}
                  liveryName={liveryName}
                  carSlug={carSlugByLivery[liveryName] ?? ''}
                  cars={cars}
                  onPick={setPickerFor}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pickerFor && <CarPickerModal onSelect={handlePick} onClose={() => setPickerFor(null)} />}
    </div>
  );
}
