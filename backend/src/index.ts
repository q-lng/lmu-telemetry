import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import {
  initAuthSchema,
  initSocialSchema,
  initFilesSchema,
  initMailSchema,
  initPreferencesSchema,
  initSiteSettingsSchema,
  initTracksSchema,
  initCarsSchema,
  initManufacturersSchema,
  initDlcSchema,
} from './pg.js';
import { registerAuth } from './auth.js';
import { registerSocial } from './social.js';
import { registerFiles } from './files.js';
import { registerPreferences } from './preferences.js';
import { registerStorage, backfillMissingFileSizes } from './storage.js';
import { registerAdmin } from './admin.js';
import { registerSiteSettings } from './siteSettings.js';
import { registerSearch } from './search.js';
import { registerTracks } from './tracks.js';
import { registerCars } from './cars.js';
import { registerManufacturers } from './manufacturers.js';
import { registerLeaderboard } from './leaderboard.js';

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 * 1024 } });

await initAuthSchema();
await initSocialSchema();
await initFilesSchema();
await initMailSchema();
await initPreferencesSchema();
await initSiteSettingsSchema();
await initTracksSchema();
await initCarsSchema();
await initManufacturersSchema();
await initDlcSchema();
await backfillMissingFileSizes();
await registerAuth(app);
await registerSocial(app);
await registerFiles(app);
await registerPreferences(app);
await registerStorage(app);
await registerAdmin(app);
await registerSiteSettings(app);
await registerSearch(app);
await registerTracks(app);
await registerCars(app);
await registerManufacturers(app);
await registerLeaderboard(app);

app.get('/api/health', async () => ({ ok: true }));

const port = Number(process.env.PORT ?? 3001);
app.listen({ port, host: '0.0.0.0' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
