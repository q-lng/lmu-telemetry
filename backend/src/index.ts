import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { initAuthSchema, initSocialSchema, initFilesSchema, initMailSchema, initPreferencesSchema } from './pg.js';
import { registerAuth } from './auth.js';
import { registerSocial } from './social.js';
import { registerFiles } from './files.js';
import { registerPreferences } from './preferences.js';
import { registerStorage, backfillMissingFileSizes } from './storage.js';

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 * 1024 } });

await initAuthSchema();
await initSocialSchema();
await initFilesSchema();
await initMailSchema();
await initPreferencesSchema();
await backfillMissingFileSizes();
await registerAuth(app);
await registerSocial(app);
await registerFiles(app);
await registerPreferences(app);
await registerStorage(app);

app.get('/api/health', async () => ({ ok: true }));

const port = Number(process.env.PORT ?? 3001);
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
