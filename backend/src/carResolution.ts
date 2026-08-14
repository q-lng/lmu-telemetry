import { pgQuery } from './pg.js';

/** Real car name, from the catalog — shared by every read path that needs
 * to show a session's resolved car (leaderboard, session listings, session
 * metadata), not just the leaderboard's own class-aware variant
 * (leaderboard.ts's listCarInfo, which also needs the category). */
export async function listCarNames(): Promise<Map<string, string>> {
  const rows = await pgQuery<{ slug: string; name: string }>(`SELECT slug, name FROM cars`);
  return new Map(rows.map((r) => [r.slug, r.name]));
}

/** Admin-maintained livery (telemetry_files.car, free text) → real car —
 * see backend/src/liveryMappings.ts. Resolves every session sharing that
 * exact livery string, without per-session action. */
export async function listLiveryToCarSlug(): Promise<Map<string, string>> {
  const rows = await pgQuery<{ livery_name: string; car_slug: string }>(
    `SELECT livery_name, car_slug FROM livery_car_mappings`,
  );
  return new Map(rows.map((r) => [r.livery_name, r.car_slug]));
}

/** Per-session override (telemetry_files.car_slug) wins when set; otherwise
 * falls back to the admin livery mapping for this session's raw car string. */
export function resolveCarSlug(f: { car: string | null; carSlug: string | null }, liveryMap: Map<string, string>): string | null {
  if (f.carSlug) return f.carSlug;
  if (f.car) return liveryMap.get(f.car.trim()) ?? null;
  return null;
}

/** Real catalog name when the car is known, else the raw livery string. */
export function resolveCarName(rawCarName: string | null, carSlug: string | null, carNames: Map<string, string>): string | null {
  if (carSlug) {
    const name = carNames.get(carSlug);
    if (name) return name;
  }
  return rawCarName;
}
