import type { FastifyInstance, FastifyReply } from 'fastify';
import path from 'node:path';
import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { listChannels, getChannelSeries, getLaps, evictStartTsCache } from './channels.js';
import { getSessionMetadata, type SessionMetadata, type SessionSummary } from './metadata.js';
import { DATA_DIR, evictDb, NotFoundError } from './db.js';
import { requireAuth } from './auth.js';
import { findUsersByIds } from './users.js';
import { findCarBySlug } from './cars.js';
import { listCarNames, listLiveryToCarSlug, resolveCarName, resolveCarSlug } from './carResolution.js';
import {
  canViewFile,
  canViewLap,
  deleteFileRecord,
  getFileRecord,
  listLapShares,
  listVisibleFiles,
  searchSharedLaps,
  setCarSlug,
  setFileVisibility,
  setLapVisibility,
  upsertFileRecord,
  type LapVisibility,
  type Visibility,
} from './access.js';

/** Resolves the real car for a single file's metadata response — fetches its
 * FileRecord (for the per-session override) plus the catalog/livery maps
 * fresh each time, since this is a one-off single-file lookup (unlike the
 * leaderboard's batched resolution across many files at once). */
async function resolveSessionCarName(filename: string, rawCarName: string | null): Promise<string | null> {
  const [record, carNames, liveryMap] = await Promise.all([
    getFileRecord(filename),
    listCarNames(),
    listLiveryToCarSlug(),
  ]);
  const carSlug = resolveCarSlug({ car: rawCarName, carSlug: record?.carSlug ?? null }, liveryMap);
  return resolveCarName(rawCarName, carSlug, carNames);
}

function isVisibility(v: unknown): v is Visibility {
  return v === 'private' || v === 'friends' || v === 'public';
}

function isLapVisibility(v: unknown): v is LapVisibility {
  return v === 'friends' || v === 'public';
}

/** Distinguishes "genuinely missing" (NotFoundError, e.g. the .duckdb file is
 * gone from disk) from any other unexpected failure, instead of collapsing both
 * into one opaque code and losing the not-found signal. */
function handleReadError(app: FastifyInstance, reply: FastifyReply, err: unknown): void {
  if (err instanceof NotFoundError) {
    reply.code(404).send({ error: 'FILE_NOT_FOUND' });
    return;
  }
  app.log.error(err);
  reply.code(500).send({ error: 'SERVER_ERROR' });
}

export async function registerFiles(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { track?: string; car?: string; excludeMine?: string } }>('/api/sessions', async (req) => {
    const files = await listVisibleFiles(
      req.userId,
      { track: req.query.track, car: req.query.car },
      { publicOnly: req.query.excludeMine === 'true' },
    );
    const [owners, carNames, liveryMap] = await Promise.all([
      findUsersByIds([...new Set(files.map((f) => f.ownerId).filter((id): id is number => id !== null))]),
      listCarNames(),
      listLiveryToCarSlug(),
    ]);
    const pseudoById = new Map(owners.map((u) => [u.id, u.pseudo]));
    return Promise.all(
      files.map(async (f): Promise<SessionSummary> => {
        const [meta, laps] = await Promise.all([
          getSessionMetadata(f.filename).catch(() => null),
          getLaps(f.filename).catch(() => []),
        ]);
        const carSlug = resolveCarSlug(f, liveryMap);
        return {
          file: f.filename,
          ownerId: f.ownerId,
          ownerPseudo: f.ownerId !== null ? pseudoById.get(f.ownerId) ?? null : null,
          uploadedAt: f.uploadedAt,
          track: meta?.info.TrackName,
          sessionType: meta?.info.SessionType,
          driverName: meta?.info.DriverName,
          carName: resolveCarName(meta?.info.CarName ?? null, carSlug, carNames) ?? undefined,
          recordingTime: meta?.info.RecordingTime,
          lapCount: laps.length,
          durationSeconds: laps.length > 0 ? laps[laps.length - 1].endTs - laps[0].startTs : undefined,
        };
      }),
    );
  });

  app.get('/api/sessions/mine', { preHandler: requireAuth }, async (req) => {
    const [files, carNames, liveryMap] = await Promise.all([
      listVisibleFiles(req.userId),
      listCarNames(),
      listLiveryToCarSlug(),
    ]);
    return {
      files: files
        .filter((f) => f.ownerId === req.userId)
        .map((f) => ({ ...f, resolvedCar: resolveCarName(f.car, resolveCarSlug(f, liveryMap), carNames) })),
    };
  });

  app.post<{ Params: { file: string }; Body: { visibility?: string } }>(
    '/api/sessions/:file/visibility',
    { preHandler: requireAuth },
    async (req, reply) => {
      const record = await getFileRecord(req.params.file);
      if (!record || record.ownerId !== req.userId) {
        reply.code(404).send({ error: 'FILE_NOT_FOUND' });
        return;
      }
      if (!isVisibility(req.body?.visibility)) {
        reply.code(400).send({ error: 'INVALID_VISIBILITY' });
        return;
      }
      await setFileVisibility(req.params.file, req.body!.visibility as Visibility);
      reply.code(204).send();
    },
  );

  app.post<{ Params: { file: string }; Body: { carSlug: string | null } }>(
    '/api/sessions/:file/car',
    { preHandler: requireAuth },
    async (req, reply) => {
      const record = await getFileRecord(req.params.file);
      if (!record || record.ownerId !== req.userId) {
        reply.code(404).send({ error: 'FILE_NOT_FOUND' });
        return;
      }
      const carSlug = req.body?.carSlug ?? null;
      if (carSlug !== null && !(await findCarBySlug(carSlug))) {
        reply.code(400).send({ error: 'INVALID_CAR' });
        return;
      }
      await setCarSlug(req.params.file, carSlug);
      reply.code(204).send();
    },
  );

  app.delete<{ Params: { file: string } }>('/api/sessions/:file', { preHandler: requireAuth }, async (req, reply) => {
    const record = await getFileRecord(req.params.file);
    if (!record || record.ownerId !== req.userId) {
      reply.code(404).send({ error: 'FILE_NOT_FOUND' });
      return;
    }
    await deleteFileRecord(req.params.file);
    const dest = path.join(DATA_DIR, req.params.file);
    fs.rmSync(dest, { force: true });
    evictDb(dest);
    evictStartTsCache(req.params.file);
    reply.code(204).send();
  });

  app.get<{ Params: { file: string } }>(
    '/api/sessions/:file/lap-shares',
    { preHandler: requireAuth },
    async (req, reply) => {
      const record = await getFileRecord(req.params.file);
      if (!record || record.ownerId !== req.userId) {
        reply.code(404).send({ error: 'FILE_NOT_FOUND' });
        return;
      }
      return { shares: await listLapShares(req.params.file) };
    },
  );

  app.post<{ Params: { file: string; lap: string }; Body: { visibility: LapVisibility | null } }>(
    '/api/sessions/:file/laps/:lap/visibility',
    { preHandler: requireAuth },
    async (req, reply) => {
      const record = await getFileRecord(req.params.file);
      if (!record || record.ownerId !== req.userId) {
        reply.code(404).send({ error: 'FILE_NOT_FOUND' });
        return;
      }
      const visibility = req.body?.visibility ?? null;
      if (visibility !== null && !isLapVisibility(visibility)) {
        reply.code(400).send({ error: 'INVALID_VISIBILITY' });
        return;
      }
      await setLapVisibility(req.params.file, Number(req.params.lap), visibility);
      reply.code(204).send();
    },
  );

  app.post('/api/sessions/upload', { preHandler: requireAuth }, async (req, reply) => {
    const data = await req.file();
    if (!data) {
      reply.code(400).send({ error: 'NO_FILE_PROVIDED' });
      return;
    }
    const filename = path.basename(data.filename);
    if (!filename.toLowerCase().endsWith('.duckdb')) {
      reply.code(400).send({ error: 'INVALID_FILE_TYPE' });
      return;
    }
    const dest = path.join(DATA_DIR, filename);
    const tmpDest = `${dest}.uploading`;
    try {
      await pipeline(data.file, fs.createWriteStream(tmpDest));
      if (data.file.truncated) {
        fs.rmSync(tmpDest, { force: true });
        reply.code(413).send({ error: 'FILE_TOO_LARGE' });
        return;
      }
      fs.renameSync(tmpDest, dest);
    } catch (err) {
      fs.rmSync(tmpDest, { force: true });
      app.log.error(err);
      reply.code(500).send({ error: 'SERVER_ERROR' });
      return;
    }
    evictDb(dest);
    evictStartTsCache(filename);
    const meta = await getSessionMetadata(filename).catch(
      (): SessionMetadata => ({ info: {}, carSetup: null }),
    );
    await upsertFileRecord(filename, {
      ownerId: req.userId!,
      track: meta.info.TrackName ?? null,
      car: meta.info.CarName ?? null,
      sizeBytes: fs.statSync(dest).size,
    });
    reply.send({ file: filename });
  });

  app.get<{ Params: { file: string } }>('/api/sessions/:file/metadata', async (req, reply) => {
    if (!(await canViewFile(req.params.file, req.userId))) {
      reply.code(403).send({ error: 'ACCESS_DENIED' });
      return;
    }
    try {
      const meta = await getSessionMetadata(req.params.file);
      return { ...meta, resolvedCar: await resolveSessionCarName(req.params.file, meta.info.CarName ?? null) };
    } catch (err) {
      handleReadError(app, reply, err);
    }
  });

  app.get<{ Params: { file: string } }>('/api/sessions/:file/channels', async (req, reply) => {
    if (!(await canViewFile(req.params.file, req.userId))) {
      reply.code(403).send({ error: 'ACCESS_DENIED' });
      return;
    }
    try {
      return await listChannels(req.params.file);
    } catch (err) {
      handleReadError(app, reply, err);
    }
  });

  app.get<{ Params: { file: string } }>('/api/sessions/:file/laps', async (req, reply) => {
    if (!(await canViewFile(req.params.file, req.userId))) {
      reply.code(403).send({ error: 'ACCESS_DENIED' });
      return;
    }
    try {
      return await getLaps(req.params.file);
    } catch (err) {
      handleReadError(app, reply, err);
    }
  });

  app.get<{ Params: { file: string; name: string }; Querystring: { from?: string; to?: string } }>(
    '/api/sessions/:file/channel/:name',
    async (req, reply) => {
      if (!(await canViewFile(req.params.file, req.userId))) {
        reply.code(403).send({ error: 'ACCESS_DENIED' });
        return;
      }
      try {
        const { from, to } = req.query;
        const range = from !== undefined && to !== undefined ? { from: Number(from), to: Number(to) } : undefined;
        return await getChannelSeries(req.params.file, req.params.name, range);
      } catch (err) {
        handleReadError(app, reply, err);
      }
    },
  );

  // ---- Shared lap read routes: auth optional, gated by canViewLap instead of
  // canViewFile, so a single lap can be reachable even when its parent file stays
  // private. ----

  app.get<{ Params: { file: string; lap: string } }>('/api/shared-lap/:file/:lap/metadata', async (req, reply) => {
    if (!(await canViewLap(req.params.file, Number(req.params.lap), req.userId))) {
      reply.code(403).send({ error: 'ACCESS_DENIED' });
      return;
    }
    try {
      const meta = await getSessionMetadata(req.params.file);
      return { ...meta, resolvedCar: await resolveSessionCarName(req.params.file, meta.info.CarName ?? null) };
    } catch (err) {
      handleReadError(app, reply, err);
    }
  });

  app.get<{ Params: { file: string; lap: string } }>('/api/shared-lap/:file/:lap/laps', async (req, reply) => {
    const lapNumber = Number(req.params.lap);
    if (!(await canViewLap(req.params.file, lapNumber, req.userId))) {
      reply.code(403).send({ error: 'ACCESS_DENIED' });
      return;
    }
    try {
      const laps = await getLaps(req.params.file);
      const lap = laps.find((l) => l.lap === lapNumber);
      if (!lap) {
        reply.code(404).send({ error: 'LAP_NOT_FOUND' });
        return;
      }
      return [lap];
    } catch (err) {
      handleReadError(app, reply, err);
    }
  });

  app.get<{ Params: { file: string; lap: string } }>('/api/shared-lap/:file/:lap/channels', async (req, reply) => {
    if (!(await canViewLap(req.params.file, Number(req.params.lap), req.userId))) {
      reply.code(403).send({ error: 'ACCESS_DENIED' });
      return;
    }
    try {
      return await listChannels(req.params.file);
    } catch (err) {
      handleReadError(app, reply, err);
    }
  });

  app.get<{ Params: { file: string; lap: string; name: string } }>(
    '/api/shared-lap/:file/:lap/channel/:name',
    async (req, reply) => {
      const lapNumber = Number(req.params.lap);
      if (!(await canViewLap(req.params.file, lapNumber, req.userId))) {
        reply.code(403).send({ error: 'ACCESS_DENIED' });
        return;
      }
      try {
        const laps = await getLaps(req.params.file);
        const lap = laps.find((l) => l.lap === lapNumber);
        if (!lap) {
          reply.code(404).send({ error: 'LAP_NOT_FOUND' });
          return;
        }
        // The range is computed here from the lap record, never taken from the
        // client — a viewer restricted to this one lap must not be able to request
        // any other window of the file just by passing a different range.
        return await getChannelSeries(req.params.file, req.params.name, { from: lap.startTs, to: lap.endTs });
      } catch (err) {
        handleReadError(app, reply, err);
      }
    },
  );

  app.get<{ Querystring: { track?: string; car?: string } }>(
    '/api/shared-laps/search',
    async (req) => {
      const laps = await searchSharedLaps(req.userId, { track: req.query.track, car: req.query.car });
      return { laps };
    },
  );
}
