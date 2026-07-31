import { pgQuery } from './pg.js';
import { areFriends } from './friends.js';

export type Visibility = 'private' | 'friends' | 'public';
export type LapVisibility = 'friends' | 'public';

export interface FileRecord {
  filename: string;
  ownerId: number | null;
  visibility: Visibility;
  track: string | null;
  car: string | null;
}

interface FileRow {
  filename: string;
  owner_id: number | null;
  visibility: Visibility;
  track: string | null;
  car: string | null;
}

function fromRow(r: FileRow): FileRecord {
  return { filename: r.filename, ownerId: r.owner_id, visibility: r.visibility, track: r.track, car: r.car };
}

export async function getFileRecord(filename: string): Promise<FileRecord | null> {
  const rows = await pgQuery<FileRow>(`SELECT * FROM telemetry_files WHERE filename = $1`, [filename]);
  return rows[0] ? fromRow(rows[0]) : null;
}

/** Registers (or refreshes track/car for) a file — called after every successful upload. */
export async function upsertFileRecord(
  filename: string,
  input: { ownerId: number | null; track: string | null; car: string | null },
): Promise<void> {
  await pgQuery(
    `INSERT INTO telemetry_files (filename, owner_id, track, car)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (filename) DO UPDATE SET owner_id = EXCLUDED.owner_id, track = EXCLUDED.track, car = EXCLUDED.car`,
    [filename, input.ownerId, input.track, input.car],
  );
}

export async function setFileVisibility(filename: string, visibility: Visibility): Promise<void> {
  await pgQuery(`UPDATE telemetry_files SET visibility = $2 WHERE filename = $1`, [filename, visibility]);
}

export async function getLapOverride(filename: string, lapNumber: number): Promise<LapVisibility | null> {
  const rows = await pgQuery<{ visibility: LapVisibility }>(
    `SELECT visibility FROM lap_shares WHERE filename = $1 AND lap_number = $2`,
    [filename, lapNumber],
  );
  return rows[0]?.visibility ?? null;
}

/** `visibility: null` removes the override — the lap falls back to the file's own visibility. */
export async function setLapVisibility(
  filename: string,
  lapNumber: number,
  visibility: LapVisibility | null,
): Promise<void> {
  if (visibility === null) {
    await pgQuery(`DELETE FROM lap_shares WHERE filename = $1 AND lap_number = $2`, [filename, lapNumber]);
    return;
  }
  await pgQuery(
    `INSERT INTO lap_shares (filename, lap_number, visibility) VALUES ($1, $2, $3)
     ON CONFLICT (filename, lap_number) DO UPDATE SET visibility = EXCLUDED.visibility`,
    [filename, lapNumber, visibility],
  );
}

export async function listLapShares(filename: string): Promise<{ lapNumber: number; visibility: LapVisibility }[]> {
  const rows = await pgQuery<{ lap_number: number; visibility: LapVisibility }>(
    `SELECT lap_number, visibility FROM lap_shares WHERE filename = $1 ORDER BY lap_number`,
    [filename],
  );
  return rows.map((r) => ({ lapNumber: r.lap_number, visibility: r.visibility }));
}

export async function canViewFile(filename: string, viewerId: number | null): Promise<boolean> {
  const file = await getFileRecord(filename);
  if (!file) return false;
  if (file.ownerId !== null && file.ownerId === viewerId) return true;
  if (file.visibility === 'public') return true;
  if (file.visibility === 'friends') {
    if (viewerId === null || file.ownerId === null) return false;
    return areFriends(viewerId, file.ownerId);
  }
  return false;
}

export async function canViewLap(filename: string, lapNumber: number, viewerId: number | null): Promise<boolean> {
  if (await canViewFile(filename, viewerId)) return true;
  const override = await getLapOverride(filename, lapNumber);
  if (!override) return false;
  if (override === 'public') return true;
  const file = await getFileRecord(filename);
  if (viewerId === null || !file || file.ownerId === null) return false;
  return areFriends(viewerId, file.ownerId);
}

/** Postgres-only lookup (no DuckDB files opened) — what makes track/car search fast
 * regardless of how many telemetry files exist. */
export async function listVisibleFiles(
  viewerId: number | null,
  filter: { track?: string; car?: string } = {},
  opts: { excludeOwn?: boolean } = {},
): Promise<FileRecord[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  function addParam(value: unknown): string {
    params.push(value);
    return `$${params.length}`;
  }

  const visibilityClauses = [`visibility = 'public'`];
  if (viewerId !== null) {
    if (!opts.excludeOwn) visibilityClauses.push(`owner_id = ${addParam(viewerId)}`);
    visibilityClauses.push(
      `(visibility = 'friends' AND owner_id IN (
        SELECT CASE WHEN user_a_id = ${addParam(viewerId)} THEN user_b_id ELSE user_a_id END
        FROM friendships WHERE user_a_id = ${addParam(viewerId)} OR user_b_id = ${addParam(viewerId)}
      ))`,
    );
  }
  conditions.push(`(${visibilityClauses.join(' OR ')})`);

  // "Parcourir" (excludeOwn) is explicitly for discovering OTHER people's shared
  // content — the viewer's own files (even public ones) stay exclusive to "Mes
  // sessions" / the normal session picker, not mixed into search results.
  if (opts.excludeOwn && viewerId !== null) {
    conditions.push(`(owner_id IS NULL OR owner_id <> ${addParam(viewerId)})`);
  }

  if (filter.track) conditions.push(`track ILIKE ${addParam(`%${filter.track}%`)}`);
  if (filter.car) conditions.push(`car ILIKE ${addParam(`%${filter.car}%`)}`);

  const rows = await pgQuery<FileRow>(
    `SELECT * FROM telemetry_files WHERE ${conditions.join(' AND ')} ORDER BY uploaded_at DESC`,
    params,
  );
  return rows.map(fromRow);
}

/** Public (or friends-of-owner) shared laps matching track/car, across all files. */
export async function searchSharedLaps(
  viewerId: number | null,
  filter: { track?: string; car?: string } = {},
  opts: { excludeOwn?: boolean } = {},
): Promise<{ filename: string; lapNumber: number; track: string | null; car: string | null }[]> {
  const conditions: string[] = [`ls.visibility = 'public'`];
  const params: unknown[] = [];

  function addParam(value: unknown): string {
    params.push(value);
    return `$${params.length}`;
  }

  if (viewerId !== null) {
    conditions[0] = `(ls.visibility = 'public' OR (ls.visibility = 'friends' AND tf.owner_id IN (
      SELECT CASE WHEN user_a_id = ${addParam(viewerId)} THEN user_b_id ELSE user_a_id END
      FROM friendships WHERE user_a_id = ${addParam(viewerId)} OR user_b_id = ${addParam(viewerId)}
    )))`;
  }

  if (opts.excludeOwn && viewerId !== null) {
    conditions.push(`(tf.owner_id IS NULL OR tf.owner_id <> ${addParam(viewerId)})`);
  }

  const extra: string[] = [];
  if (filter.track) extra.push(`tf.track ILIKE ${addParam(`%${filter.track}%`)}`);
  if (filter.car) extra.push(`tf.car ILIKE ${addParam(`%${filter.car}%`)}`);

  const rows = await pgQuery<{ filename: string; lap_number: number; track: string | null; car: string | null }>(
    `SELECT ls.filename, ls.lap_number, tf.track, tf.car
     FROM lap_shares ls
     JOIN telemetry_files tf ON tf.filename = ls.filename
     WHERE ${[...conditions, ...extra].join(' AND ')}
     ORDER BY ls.created_at DESC`,
    params,
  );
  return rows.map((r) => ({ filename: r.filename, lapNumber: r.lap_number, track: r.track, car: r.car }));
}
