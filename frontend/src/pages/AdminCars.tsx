import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createAdminCar, fetchAdminCars, fetchAdminDlcs, fetchAdminManufacturers, updateAdminCar, uploadCarPhoto } from '../api';
import type { CarCatalogEntry, DlcCatalogEntry, ManufacturerCatalogEntry } from '../types';
import { CAR_CATEGORIES, CAR_CATEGORY_LABELS, type CarCategory } from '../carCategories';
import { t } from '../i18n';
import { PencilIcon } from '../components/icons';
import { AssetThumbnail, UploadButton } from '../components/AdminAssetUpload';

interface RowProps {
  car: CarCatalogEntry;
  manufacturers: ManufacturerCatalogEntry[];
  dlcs: DlcCatalogEntry[];
  onChange: (updated: CarCatalogEntry) => void;
}

function CarRow({ car, manufacturers, dlcs, onChange }: RowProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(car.name);
  const [busy, setBusy] = useState<'name' | 'manufacturer' | 'category' | 'dlc' | 'photo' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photoVersion, setPhotoVersion] = useState(0);

  useEffect(() => setNameDraft(car.name), [car.name]);

  async function saveName() {
    const trimmed = nameDraft.trim();
    setEditingName(false);
    if (!trimmed || trimmed === car.name) {
      setNameDraft(car.name);
      return;
    }
    setBusy('name');
    setError(null);
    try {
      onChange(await updateAdminCar(car.slug, { name: trimmed }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function saveManufacturer(manufacturerSlug: string) {
    setBusy('manufacturer');
    setError(null);
    try {
      onChange(await updateAdminCar(car.slug, { manufacturerSlug }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function saveCategory(category: CarCategory) {
    setBusy('category');
    setError(null);
    try {
      onChange(await updateAdminCar(car.slug, { category }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function saveDlc(dlcSlug: string) {
    setBusy('dlc');
    setError(null);
    try {
      onChange(await updateAdminCar(car.slug, { dlcSlug }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function handlePhoto(file: File) {
    setBusy('photo');
    setError(null);
    try {
      onChange(await uploadCarPhoto(car.slug, file));
      setPhotoVersion((v) => v + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <tr>
      <td>
        <Link to={`/cars/${car.slug}`} className="admin-track-slug">
          /cars/{car.slug}
        </Link>
      </td>
      <td>
        {editingName ? (
          <input
            className="admin-pseudo-input"
            value={nameDraft}
            autoFocus
            disabled={busy === 'name'}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setNameDraft(car.name);
                setEditingName(false);
              }
            }}
          />
        ) : (
          <div className="admin-pseudo-cell">
            <span>{car.name}</span>
            <button className="admin-edit-trigger" disabled={busy === 'name'} onClick={() => setEditingName(true)} title={t('admin.editPseudo')}>
              <PencilIcon size={12} />
            </button>
          </div>
        )}
      </td>
      <td>
        <select value={car.manufacturerSlug} disabled={busy === 'manufacturer'} onChange={(e) => saveManufacturer(e.target.value)}>
          {manufacturers.map((m) => (
            <option key={m.slug} value={m.slug}>
              {m.name}
            </option>
          ))}
        </select>
      </td>
      <td>
        <select value={car.category} disabled={busy === 'category'} onChange={(e) => saveCategory(e.target.value as CarCategory)}>
          {CAR_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {CAR_CATEGORY_LABELS[cat]}
            </option>
          ))}
        </select>
      </td>
      <td>
        <select value={car.dlcSlug ?? ''} disabled={busy === 'dlc'} onChange={(e) => saveDlc(e.target.value)}>
          <option value="">{t('dlc.baseGame')}</option>
          {dlcs.map((dlc) => (
            <option key={dlc.slug} value={dlc.slug}>
              {dlc.name}
            </option>
          ))}
        </select>
      </td>
      <td>
        <div className="admin-track-asset">
          <AssetThumbnail src={car.photoExt ? `/api/car-photos/${car.slug}.${car.photoExt}?v=${photoVersion}` : null} />
          <UploadButton label={t('adminCars.uploadPhoto')} busy={busy === 'photo'} onFile={handlePhoto} />
        </div>
      </td>
      <td>{error && <div className="auth-error">{error}</div>}</td>
    </tr>
  );
}

function AddCarForm({
  manufacturers,
  onAdded,
}: {
  manufacturers: ManufacturerCatalogEntry[];
  onAdded: (car: CarCatalogEntry) => void;
}) {
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [manufacturerSlug, setManufacturerSlug] = useState(manufacturers[0]?.slug ?? '');
  const [category, setCategory] = useState<CarCategory>(CAR_CATEGORIES[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!manufacturerSlug && manufacturers[0]) setManufacturerSlug(manufacturers[0].slug);
  }, [manufacturers, manufacturerSlug]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const created = await createAdminCar({
        slug: slug.trim().toLowerCase(),
        name: name.trim(),
        manufacturerSlug,
        category,
      });
      onAdded(created);
      setSlug('');
      setName('');
      setCategory(CAR_CATEGORIES[0]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="social-search-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder={t('adminCars.slugPlaceholder')} disabled={busy} />
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('adminCars.namePlaceholder')} disabled={busy} />
      <select value={manufacturerSlug} onChange={(e) => setManufacturerSlug(e.target.value)} disabled={busy}>
        {manufacturers.map((m) => (
          <option key={m.slug} value={m.slug}>
            {m.name}
          </option>
        ))}
      </select>
      <select value={category} onChange={(e) => setCategory(e.target.value as CarCategory)} disabled={busy}>
        {CAR_CATEGORIES.map((cat) => (
          <option key={cat} value={cat}>
            {CAR_CATEGORY_LABELS[cat]}
          </option>
        ))}
      </select>
      <button className="auth-submit" type="submit" disabled={busy || !slug.trim() || !name.trim() || !manufacturerSlug}>
        {busy ? t('admin.saving') : t('adminCars.add')}
      </button>
      {error && <div className="auth-error">{error}</div>}
    </form>
  );
}

/** Embedded as the Cars tab of /admin/content (see AdminContent.tsx) — no
 * page-shell/heading of its own, the parent page owns that. */
export function CarsAdminPanel() {
  const [cars, setCars] = useState<CarCatalogEntry[] | null>(null);
  const [manufacturers, setManufacturers] = useState<ManufacturerCatalogEntry[]>([]);
  const [dlcs, setDlcs] = useState<DlcCatalogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  function refresh() {
    fetchAdminCars()
      .then(setCars)
      .catch((err) => setError((err as Error).message));
  }

  useEffect(() => {
    refresh();
    fetchAdminManufacturers().then(setManufacturers);
    fetchAdminDlcs().then(setDlcs);
  }, []);

  function replaceCar(updated: CarCatalogEntry) {
    setCars((prev) => prev?.map((car) => (car.slug === updated.slug ? updated : car)) ?? prev);
  }

  return (
    <div>
      <p className="field-hint">{t('adminCars.subtitle')}</p>
      <Link to="/admin/manufacturers" className="field-hint">
        {t('adminCars.manageManufacturers')}
      </Link>

      {manufacturers.length > 0 && <AddCarForm manufacturers={manufacturers} onAdded={(created) => setCars((prev) => [...(prev ?? []), created])} />}

      {error && <div className="auth-error">{error}</div>}
      {!cars ? (
        <div className="page-loading">
          <span className="spinner" />
        </div>
      ) : (
        <div className="admin-table-wrap">
          <table className="modal-table admin-users-table">
            <thead>
              <tr>
                <th>{t('adminCars.colSlug')}</th>
                <th>{t('adminCars.colName')}</th>
                <th>{t('adminCars.colManufacturer')}</th>
                <th>{t('adminCars.colCategory')}</th>
                <th>{t('adminCars.colDlc')}</th>
                <th>{t('adminCars.colPhoto')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cars.map((car) => (
                <CarRow key={car.slug} car={car} manufacturers={manufacturers} dlcs={dlcs} onChange={replaceCar} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
