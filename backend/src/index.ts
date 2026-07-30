import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import path from 'node:path';
import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { listChannels, getChannelSeries, getLaps, evictStartTsCache } from './channels.js';
import { listSessions, getSessionMetadata } from './metadata.js';
import { DATA_DIR, evictDb } from './db.js';

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 * 1024 } });

app.get('/api/health', async () => ({ ok: true }));

app.get('/api/sessions', async () => listSessions());

app.post('/api/sessions/upload', async (req, reply) => {
  const data = await req.file();
  if (!data) {
    reply.code(400);
    return { error: 'No file provided' };
  }
  const filename = path.basename(data.filename);
  if (!filename.toLowerCase().endsWith('.duckdb')) {
    reply.code(400);
    return { error: 'File must have a .duckdb extension' };
  }
  const dest = path.join(DATA_DIR, filename);
  const tmpDest = `${dest}.uploading`;
  try {
    await pipeline(data.file, fs.createWriteStream(tmpDest));
    if (data.file.truncated) {
      throw new Error('File too large');
    }
    fs.renameSync(tmpDest, dest);
  } catch (err) {
    fs.rmSync(tmpDest, { force: true });
    reply.code(500);
    return { error: (err as Error).message };
  }
  evictDb(dest);
  evictStartTsCache(filename);
  return { file: filename };
});

app.get<{ Params: { file: string } }>('/api/sessions/:file/metadata', async (req, reply) => {
  try {
    return await getSessionMetadata(req.params.file);
  } catch (err) {
    reply.code(404);
    return { error: (err as Error).message };
  }
});

app.get<{ Params: { file: string } }>('/api/sessions/:file/channels', async (req, reply) => {
  try {
    return await listChannels(req.params.file);
  } catch (err) {
    reply.code(404);
    return { error: (err as Error).message };
  }
});

app.get<{ Params: { file: string } }>('/api/sessions/:file/laps', async (req, reply) => {
  try {
    return await getLaps(req.params.file);
  } catch (err) {
    reply.code(404);
    return { error: (err as Error).message };
  }
});

app.get<{ Params: { file: string; name: string }; Querystring: { from?: string; to?: string } }>(
  '/api/sessions/:file/channel/:name',
  async (req, reply) => {
    try {
      const { from, to } = req.query;
      const range = from !== undefined && to !== undefined ? { from: Number(from), to: Number(to) } : undefined;
      return await getChannelSeries(req.params.file, req.params.name, range);
    } catch (err) {
      reply.code(404);
      return { error: (err as Error).message };
    }
  },
);

const port = Number(process.env.PORT ?? 3001);
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
