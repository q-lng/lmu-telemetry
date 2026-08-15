import type { FastifyInstance } from 'fastify';
import path from 'node:path';
import { pgQuery } from './pg.js';
import { DATA_DIR } from './db.js';
import { resolveImageExt, serveImage, type ImageExt } from './imageAssets.js';
import { computeTrackTopLaps } from './leaderboard.js';

export type { ImageExt };

export interface TrackCatalogEntry {
  slug: string;
  name: string;
  country: string;
  photoExt: ImageExt | null;
  mapExt: ImageExt | null;
  dlcSlug: string | null;
  dlcName: string | null;
  dlcColor: string | null;
  mapRotationDeg: number;
  mapOffsetX: number;
  mapOffsetY: number;
  mapScale: number;
}

interface TrackRow {
  slug: string;
  name: string;
  country: string;
  dlc_slug: string | null;
  dlc_name: string | null;
  dlc_color: string | null;
  map_rotation_deg: number;
  map_offset_x: number;
  map_offset_y: number;
  map_scale: number;
}

export const TRACK_PHOTOS_DIR = path.join(DATA_DIR, 'track-photos');

export const SLUG_RE = /^[a-z0-9-]{1,64}$/;

const SELECT_TRACK_SQL = `
  SELECT t.slug, t.name, t.country, t.dlc_slug, d.name AS dlc_name, d.color AS dlc_color,
         t.map_rotation_deg, t.map_offset_x, t.map_offset_y, t.map_scale
  FROM tracks t
  LEFT JOIN dlcs d ON d.slug = t.dlc_slug
`;

function withAssets(row: TrackRow): TrackCatalogEntry {
  return {
    slug: row.slug,
    name: row.name,
    country: row.country,
    photoExt: resolveImageExt(TRACK_PHOTOS_DIR, row.slug),
    mapExt: resolveImageExt(TRACK_PHOTOS_DIR, `${row.slug}-map`),
    dlcSlug: row.dlc_slug,
    dlcName: row.dlc_name,
    dlcColor: row.dlc_color,
    mapRotationDeg: row.map_rotation_deg,
    mapOffsetX: row.map_offset_x,
    mapOffsetY: row.map_offset_y,
    mapScale: row.map_scale,
  };
}

export async function listTracks(): Promise<TrackCatalogEntry[]> {
  const rows = await pgQuery<TrackRow>(`${SELECT_TRACK_SQL} ORDER BY t.name`);
  return rows.map(withAssets);
}

export async function findTrackBySlug(slug: string): Promise<TrackCatalogEntry | null> {
  const rows = await pgQuery<TrackRow>(`${SELECT_TRACK_SQL} WHERE t.slug = $1`, [slug]);
  return rows[0] ? withAssets(rows[0]) : null;
}

export async function findTrackCatalogEntryByName(name: string): Promise<TrackCatalogEntry | null> {
  const rows = await pgQuery<TrackRow>(`${SELECT_TRACK_SQL} WHERE t.name = $1`, [name]);
  return rows[0] ? withAssets(rows[0]) : null;
}

export async function createTrack(entry: { slug: string; name: string; country: string }): Promise<TrackCatalogEntry> {
  await pgQuery(`INSERT INTO tracks (slug, name, country) VALUES ($1, $2, $3)`, [entry.slug, entry.name, entry.country]);
  return (await findTrackBySlug(entry.slug))!;
}

export interface TrackPatch {
  name?: string;
  country?: string;
  /** Empty string clears it back to base game (NULL) — see admin.ts's route. */
  dlcSlug?: string | null;
}

export async function updateTrack(slug: string, patch: TrackPatch): Promise<TrackCatalogEntry | null> {
  const sets: string[] = [];
  const params: unknown[] = [slug];
  if (patch.name !== undefined) {
    params.push(patch.name);
    sets.push(`name = $${params.length}`);
  }
  if (patch.country !== undefined) {
    params.push(patch.country);
    sets.push(`country = $${params.length}`);
  }
  if (patch.dlcSlug !== undefined) {
    params.push(patch.dlcSlug);
    sets.push(`dlc_slug = $${params.length}`);
  }
  if (sets.length > 0) {
    await pgQuery(`UPDATE tracks SET ${sets.join(', ')} WHERE slug = $1`, params);
  }
  return findTrackBySlug(slug);
}

export interface TrackMapCalibrationPatch {
  rotationDeg?: number;
  offsetX?: number;
  offsetY?: number;
  scale?: number;
}

export async function updateTrackMapCalibration(slug: string, patch: TrackMapCalibrationPatch): Promise<TrackCatalogEntry | null> {
  const sets: string[] = [];
  const params: unknown[] = [slug];
  if (patch.rotationDeg !== undefined) {
    params.push(patch.rotationDeg);
    sets.push(`map_rotation_deg = $${params.length}`);
  }
  if (patch.offsetX !== undefined) {
    params.push(patch.offsetX);
    sets.push(`map_offset_x = $${params.length}`);
  }
  if (patch.offsetY !== undefined) {
    params.push(patch.offsetY);
    sets.push(`map_offset_y = $${params.length}`);
  }
  if (patch.scale !== undefined) {
    params.push(patch.scale);
    sets.push(`map_scale = $${params.length}`);
  }
  if (sets.length > 0) {
    await pgQuery(`UPDATE tracks SET ${sets.join(', ')} WHERE slug = $1`, params);
  }
  return findTrackBySlug(slug);
}

export async function registerTracks(app: FastifyInstance): Promise<void> {
  // Public catalog listing — powers the /tracks page. Unlike /api/admin/tracks
  // this needs no auth: it's the same site content the individual track pages
  // already expose one at a time.
  app.get('/api/tracks', async (_req, reply) => {
    reply.send({ tracks: await listTracks() });
  });

  app.get<{ Params: { slug: string } }>('/api/tracks/:slug', async (req, reply) => {
    const entry = await findTrackBySlug(req.params.slug);
    if (!entry) {
      reply.code(404).send({ error: 'TRACK_NOT_FOUND' });
      return;
    }
    reply.send(entry);
  });

  // Resolves a session's raw metadata.TrackName (free text) to a catalog
  // entry — public, no auth needed, so the map background works in guest
  // mode too. A query param rather than a path segment since track names
  // contain spaces/punctuation that would otherwise need extra care in the
  // route matcher.
  app.get<{ Querystring: { name?: string } }>('/api/tracks/by-name', async (req, reply) => {
    const name = req.query.name;
    if (!name) {
      reply.code(400).send({ error: 'INVALID_REQUEST' });
      return;
    }
    const entry = await findTrackCatalogEntryByName(name);
    if (!entry) {
      reply.code(404).send({ error: 'TRACK_NOT_FOUND' });
      return;
    }
    reply.send(entry);
  });

  app.get<{ Params: { slug: string } }>('/api/tracks/:slug/leaderboard', async (req, reply) => {
    const entry = await findTrackBySlug(req.params.slug);
    if (!entry) {
      reply.code(404).send({ error: 'TRACK_NOT_FOUND' });
      return;
    }
    reply.send({ classes: await computeTrackTopLaps(entry.name) });
  });

  app.get<{ Params: { filename: string } }>('/api/track-photos/:filename', async (req, reply) => {
    const found = serveImage(TRACK_PHOTOS_DIR, req.params.filename);
    if (!found) {
      reply.code(404).send({ error: 'NOT_FOUND' });
      return;
    }
    // `return` matters here: without it, this async handler's own promise
    // resolves right after send() is called (before the stream has piped any
    // bytes), and Fastify finalizes the response early — 200 with
    // Content-Length: 0 and an empty body, for every file, every time.
    return reply.type(found.contentType).send(found.stream);
  });
}
