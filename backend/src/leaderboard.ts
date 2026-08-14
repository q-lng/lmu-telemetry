import type { FastifyInstance } from 'fastify';
import { pgQuery } from './pg.js';
import { getSessionMetadata } from './metadata.js';
import { getLaps, type LapInfo } from './channels.js';
import { listLmuPseudoMatches } from './users.js';

export type LeaderboardClass = 'hypercar' | 'lmp2' | 'lmp3' | 'gte' | 'gt3' | 'unknown';

export interface LeaderboardEntry {
  track: string;
  carClass: LeaderboardClass;
  car: string | null;
  driverName: string | null;
  lapTime: number;
  lapNumber: number;
  filename: string;
  uploadedAt: string;
  matchedUser: { pseudo: string } | null;
}

// Best-effort and deliberately incomplete: LMU's real metadata.CarClass strings
// aren't fully catalogued yet (see docs/SCHEMA.md). Unrecognized values fall
// into 'unknown' rather than being dropped, so gaps are visible in the UI and
// this map can be extended as real values are observed. Not tied to the
// cars.category catalog enum (gte/gt3/lmp3/lmp2-wec/lmp2-elms/hypercar):
// telemetry can't distinguish LMP2 WEC vs ELMS, so this feature uses one flat
// 'lmp2' bucket instead.
const CAR_CLASS_ALIASES: Record<string, LeaderboardClass> = {
  Hyper: 'hypercar',
  Hypercar: 'hypercar',
  HYPERCAR: 'hypercar',
  LMP2: 'lmp2',
  LMP3: 'lmp3',
  GTE: 'gte',
  LMGTE: 'gte',
  GT3: 'gt3',
  LMGT3: 'gt3',
};

function normalizeCarClass(raw: string | undefined): LeaderboardClass {
  if (!raw) return 'unknown';
  return CAR_CLASS_ALIASES[raw.trim()] ?? 'unknown';
}

/** Collapses the cars catalog's category enum onto LeaderboardClass —
 * identical for gte/gt3/lmp3/hypercar, lmp2-wec/lmp2-elms both flatten to
 * the same 'lmp2' bucket this feature already uses (telemetry-derived
 * classing can't distinguish the two anyway, see normalizeCarClass above). */
function catalogCategoryToLeaderboardClass(category: string): LeaderboardClass {
  if (category === 'lmp2-wec' || category === 'lmp2-elms') return 'lmp2';
  if (category === 'gte' || category === 'gt3' || category === 'lmp3' || category === 'hypercar') return category;
  return 'unknown';
}

interface CarInfo {
  name: string;
  category: LeaderboardClass;
}

/** Real car name + class, from the catalog — takes priority over the raw
 * livery string / CarClass alias-map guess whenever a session's car is
 * known (via a per-session override or an admin-maintained livery mapping,
 * see resolveCarSlug). */
async function listCarInfo(): Promise<Map<string, CarInfo>> {
  const rows = await pgQuery<{ slug: string; name: string; category: string }>(`SELECT slug, name, category FROM cars`);
  return new Map(rows.map((r) => [r.slug, { name: r.name, category: catalogCategoryToLeaderboardClass(r.category) }]));
}

/** Admin-maintained livery (telemetry_files.car, free text) → real car —
 * see backend/src/liveryMappings.ts. Resolves every session sharing that
 * exact livery string, without per-session action. */
async function listLiveryToCarSlug(): Promise<Map<string, string>> {
  const rows = await pgQuery<{ livery_name: string; car_slug: string }>(
    `SELECT livery_name, car_slug FROM livery_car_mappings`,
  );
  return new Map(rows.map((r) => [r.livery_name, r.car_slug]));
}

/** Per-session override (telemetry_files.car_slug) wins when set; otherwise
 * falls back to the admin livery mapping for this session's raw car string. */
function resolveCarSlug(f: { car: string | null; carSlug: string | null }, liveryMap: Map<string, string>): string | null {
  if (f.carSlug) return f.carSlug;
  if (f.car) return liveryMap.get(f.car.trim()) ?? null;
  return null;
}

/** Resolves the displayed car name AND class together — once a real car is
 * known (via carSlug), its catalog name replaces the raw livery string
 * everywhere the class guess would also have been replaced, so a mapped
 * session's "car" column shows the real model instead of the team skin. */
function resolveCar(
  carSlug: string | null,
  rawCarName: string | null,
  rawCarClass: string | undefined,
  carInfo: Map<string, CarInfo>,
): { car: string | null; carClass: LeaderboardClass } {
  const info = carSlug ? carInfo.get(carSlug) : undefined;
  if (info) return { car: info.name, carClass: info.category };
  return { car: rawCarName, carClass: normalizeCarClass(rawCarClass) };
}

function bestValidLap(laps: LapInfo[]): LapInfo | null {
  let best: LapInfo | null = null;
  for (const lap of laps) {
    if (!lap.lapTime) continue; // excludes null and 0 (game-invalidated) — never falls back to elapsedTime
    if (best === null || lap.lapTime < best.lapTime!) best = lap;
  }
  return best;
}

/** Postgres-only, deliberately independent from access.ts's listVisibleFiles:
 * this feature's contract is "public files only, always", regardless of how
 * that helper's viewer-aware behavior might evolve for unrelated reasons.
 * `track`, when given, uses the same ILIKE-substring convention as
 * access.ts's listVisibleFiles/searchTrackNames — not a new one. */
interface PublicFile {
  filename: string;
  uploadedAt: string;
  car: string | null;
  carSlug: string | null;
}

async function listPublicFiles(track?: string): Promise<PublicFile[]> {
  const params: unknown[] = [];
  let where = `visibility = 'public'`;
  if (track) {
    params.push(`%${track}%`);
    where += ` AND track ILIKE $${params.length}`;
  }
  const rows = await pgQuery<{ filename: string; uploaded_at: string; car: string | null; car_slug: string | null }>(
    `SELECT filename, uploaded_at, car, car_slug FROM telemetry_files WHERE ${where}`,
    params,
  );
  return rows.map((r) => ({ filename: r.filename, uploadedAt: r.uploaded_at, car: r.car, carSlug: r.car_slug }));
}

async function buildEntry(
  f: PublicFile,
  carInfo: Map<string, CarInfo>,
  liveryMap: Map<string, string>,
): Promise<LeaderboardEntry | null> {
  const [meta, laps] = await Promise.all([
    getSessionMetadata(f.filename).catch(() => null),
    getLaps(f.filename).catch(() => []),
  ]);
  if (!meta) return null;
  const track = meta.info.TrackName;
  if (!track) return null;
  const best = bestValidLap(laps);
  if (!best) return null; // zero valid laps in this session — contributes nothing
  const carSlug = resolveCarSlug(f, liveryMap);
  const { car, carClass } = resolveCar(carSlug, meta.info.CarName ?? null, meta.info.CarClass, carInfo);
  return {
    track,
    carClass,
    car,
    driverName: meta.info.DriverName ?? null,
    lapTime: best.lapTime!,
    lapNumber: best.lap,
    filename: f.filename,
    uploadedAt: f.uploadedAt,
    matchedUser: null, // resolved afterwards, once per request — see resolveMatchedUsers
  };
}

/** Every valid lap in a file, not just its best — a "top N laps" board needs
 * individual laps (a single session can legitimately place more than once,
 * e.g. several of one driver's own laps beating everyone else's), unlike
 * computeLeaderboard's one-record-per-group which only ever wants each
 * file's single best. */
async function buildAllValidEntries(
  f: PublicFile,
  carInfo: Map<string, CarInfo>,
  liveryMap: Map<string, string>,
): Promise<LeaderboardEntry[]> {
  const [meta, laps] = await Promise.all([
    getSessionMetadata(f.filename).catch(() => null),
    getLaps(f.filename).catch(() => []),
  ]);
  if (!meta) return [];
  const track = meta.info.TrackName;
  if (!track) return [];
  const carSlug = resolveCarSlug(f, liveryMap);
  const { car, carClass } = resolveCar(carSlug, meta.info.CarName ?? null, meta.info.CarClass, carInfo);
  const driverName = meta.info.DriverName ?? null;
  return laps
    .filter((l) => l.lapTime) // excludes null and 0 (game-invalidated)
    .map((l) => ({
      track,
      carClass,
      car,
      driverName,
      lapTime: l.lapTime!,
      lapNumber: l.lap,
      filename: f.filename,
      uploadedAt: f.uploadedAt,
      matchedUser: null, // resolved afterwards, once per request — see resolveMatchedUsers
    }));
}

/** Resolves each entry's matchedUser in place by comparing its driverName
 * (trim+lowercase) against every registered lmu_pseudo — done once per
 * request over the final entry list, not per file, since it's a single small
 * Postgres lookup shared across every entry regardless of how many files or
 * laps contributed to them. */
async function resolveMatchedUsers(entries: LeaderboardEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const matches = await listLmuPseudoMatches();
  if (matches.size === 0) return;
  for (const entry of entries) {
    if (!entry.driverName) continue;
    entry.matchedUser = matches.get(entry.driverName.trim().toLowerCase()) ?? null;
  }
}

export async function computeLeaderboard(): Promise<LeaderboardEntry[]> {
  const [files, carInfo, liveryMap] = await Promise.all([
    listPublicFiles(),
    listCarInfo(),
    listLiveryToCarSlug(),
  ]);
  const perFile = await Promise.all(files.map((f) => buildEntry(f, carInfo, liveryMap)));

  const bestByGroup = new Map<string, LeaderboardEntry>();
  for (const entry of perFile) {
    if (!entry) continue;
    const key = `${entry.track}::${entry.carClass}`;
    const existing = bestByGroup.get(key);
    if (!existing || entry.lapTime < existing.lapTime) bestByGroup.set(key, entry);
  }

  const result = [...bestByGroup.values()].sort(
    (a, b) => a.track.localeCompare(b.track) || a.carClass.localeCompare(b.carClass),
  );
  await resolveMatchedUsers(result);
  return result;
}

/** Top `limit` laps per car class, scoped to one track — classes with zero
 * public valid laps on this track are omitted entirely rather than included
 * as empty arrays, so the UI never renders a section with nothing in it. */
export async function computeTrackTopLaps(
  trackName: string,
  limit = 10,
): Promise<Partial<Record<LeaderboardClass, LeaderboardEntry[]>>> {
  const [files, carInfo, liveryMap] = await Promise.all([
    listPublicFiles(trackName),
    listCarInfo(),
    listLiveryToCarSlug(),
  ]);
  const perFile = await Promise.all(files.map((f) => buildAllValidEntries(f, carInfo, liveryMap)));
  const flat = perFile.flat();
  await resolveMatchedUsers(flat);

  const byClass = new Map<LeaderboardClass, LeaderboardEntry[]>();
  for (const entry of flat) {
    const list = byClass.get(entry.carClass) ?? [];
    list.push(entry);
    byClass.set(entry.carClass, list);
  }

  const result: Partial<Record<LeaderboardClass, LeaderboardEntry[]>> = {};
  for (const [carClass, entries] of byClass) {
    result[carClass] = entries.sort((a, b) => a.lapTime - b.lapTime).slice(0, limit);
  }
  return result;
}

export async function registerLeaderboard(app: FastifyInstance): Promise<void> {
  app.get('/api/leaderboard', async () => ({ entries: await computeLeaderboard() }));
}
