import { pgQuery } from './pg.js';

export interface LiveryMapping {
  liveryName: string;
  carSlug: string;
}

/** Every distinct raw livery/team-skin string seen across uploaded sessions
 * — not exposed anywhere else today (car search goes straight to the cars
 * catalog, see cars.ts's searchCars), needed here to show an admin every
 * livery worth mapping, whether or not it already has a mapping. */
export async function listDistinctCarNames(): Promise<string[]> {
  const rows = await pgQuery<{ car: string }>(
    `SELECT DISTINCT car FROM telemetry_files WHERE car IS NOT NULL ORDER BY car`,
  );
  return rows.map((r) => r.car);
}

export async function listLiveryMappings(): Promise<LiveryMapping[]> {
  const rows = await pgQuery<{ livery_name: string; car_slug: string }>(
    `SELECT livery_name, car_slug FROM livery_car_mappings ORDER BY livery_name`,
  );
  return rows.map((r) => ({ liveryName: r.livery_name, carSlug: r.car_slug }));
}

/** `carSlug: null` removes the mapping — the livery falls back to the
 * per-session override (if any) or the metadata.CarClass guess. */
export async function setLiveryMapping(liveryName: string, carSlug: string | null): Promise<void> {
  if (carSlug === null) {
    await pgQuery(`DELETE FROM livery_car_mappings WHERE livery_name = $1`, [liveryName]);
    return;
  }
  await pgQuery(
    `INSERT INTO livery_car_mappings (livery_name, car_slug) VALUES ($1, $2)
     ON CONFLICT (livery_name) DO UPDATE SET car_slug = EXCLUDED.car_slug`,
    [liveryName, carSlug],
  );
}
