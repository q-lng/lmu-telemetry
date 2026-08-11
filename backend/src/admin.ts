import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  deleteUser,
  findUserById,
  findUserByPseudo,
  listAllUsers,
  toPublicUser,
  updateUserByAdmin,
  type AdminUserPatch,
  type Plan,
} from './users.js';
import { getStorageUsage } from './storage.js';
import { destroyAllSessionsForUser } from './authSessions.js';
import { createResetToken } from './passwordResets.js';
import { sendPasswordResetEmail } from './mail.js';
import {
  updateSiteSettings,
  SITE_FONTS,
  DATA_FONTS,
  TELEMETRY_FONT_MODES,
  type SiteFont,
  type DataFont,
  type TelemetryFontMode,
  type SiteSettingsPatch,
} from './siteSettings.js';
import { createTrack, findTrackBySlug, listTracks, updateTrack, SLUG_RE, TRACK_PHOTOS_DIR } from './tracks.js';
import {
  createCar,
  findCarBySlug,
  listCars,
  updateCar,
  CAR_CATEGORIES,
  CAR_PHOTOS_DIR,
  type CarCategory,
} from './cars.js';
import {
  createManufacturer,
  findManufacturerBySlug,
  listManufacturers,
  updateManufacturer,
  MANUFACTURER_PHOTOS_DIR,
} from './manufacturers.js';
import { createDlc, findDlcBySlug, listDlcs, updateDlc } from './dlcs.js';
import { UPLOAD_CONTENT_TYPES, writeImageAtomic } from './imageAssets.js';

const PSEUDO_RE = /^[a-zA-Z0-9_-]{3,32}$/;
const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i;
const COUNTRY_RE = /^[A-Z]{2}$/;

/** Admin-only guard — unlike requireAuth this needs a DB round-trip (isAdmin
 * isn't on the request), acceptable overhead since every /api/admin/* route
 * is already a full user-list/mutation, not a hot path. */
async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!req.userId) {
    reply.code(401).send({ error: 'NOT_AUTHENTICATED' });
    return;
  }
  const user = await findUserById(req.userId);
  if (!user || !user.isAdmin) {
    reply.code(403).send({ error: 'ADMIN_ONLY' });
  }
}

interface AdminUserBody {
  pseudo?: string;
  plan?: string;
  isAdmin?: boolean;
  isActive?: boolean;
}

export async function registerAdmin(app: FastifyInstance): Promise<void> {
  app.get('/api/admin/users', { preHandler: requireAdmin }, async (_req, reply) => {
    const users = await listAllUsers();
    const withStorage = await Promise.all(
      users.map(async (u) => ({ ...toPublicUser(u), storage: await getStorageUsage(u.id) })),
    );
    reply.send({ users: withStorage });
  });

  app.patch<{ Params: { id: string }; Body: AdminUserBody }>(
    '/api/admin/users/:id',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const targetId = Number(req.params.id);
      const target = await findUserById(targetId);
      if (!target) {
        reply.code(404).send({ error: 'USER_NOT_FOUND' });
        return;
      }

      const { pseudo, plan, isAdmin, isActive } = req.body ?? {};
      const patch: AdminUserPatch = {};

      if (pseudo !== undefined) {
        const trimmed = pseudo.trim();
        if (!PSEUDO_RE.test(trimmed)) {
          reply.code(400).send({ error: 'INVALID_PSEUDO' });
          return;
        }
        if (trimmed !== target.pseudo && (await findUserByPseudo(trimmed))) {
          reply.code(409).send({ error: 'PSEUDO_ALREADY_USED' });
          return;
        }
        patch.pseudo = trimmed;
      }
      if (plan !== undefined) {
        if (plan !== 'free' && plan !== 'vip') {
          reply.code(400).send({ error: 'INVALID_PLAN' });
          return;
        }
        patch.plan = plan as Plan;
      }
      // isAdmin/isActive on your own account would let an admin lock
      // themselves out of the panel (demote or deactivate themselves with no
      // other admin around to undo it) — only another admin can flip these.
      if (isAdmin !== undefined) {
        if (targetId === req.userId) {
          reply.code(400).send({ error: 'CANNOT_MODIFY_SELF' });
          return;
        }
        patch.isAdmin = isAdmin;
      }
      if (isActive !== undefined) {
        if (targetId === req.userId) {
          reply.code(400).send({ error: 'CANNOT_MODIFY_SELF' });
          return;
        }
        patch.isActive = isActive;
      }

      const updated = await updateUserByAdmin(targetId, patch);
      if (patch.isActive === false) await destroyAllSessionsForUser(targetId);
      reply.send({ user: toPublicUser(updated!) });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/admin/users/:id/send-password-reset',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const target = await findUserById(Number(req.params.id));
      if (!target) {
        reply.code(404).send({ error: 'USER_NOT_FOUND' });
        return;
      }
      const { token } = await createResetToken(target.id);
      const base = process.env.PUBLIC_BASE_URL;
      if (!base) app.log.warn('PUBLIC_BASE_URL is not set — password reset email link will be relative/unusable.');
      const resetUrl = `${base ?? ''}/reset-password?token=${encodeURIComponent(token)}`;
      reply.code(204).send();
      sendPasswordResetEmail(toPublicUser(target), resetUrl).catch((err) => app.log.error(err));
    },
  );

  app.delete<{ Params: { id: string } }>('/api/admin/users/:id', { preHandler: requireAdmin }, async (req, reply) => {
    const targetId = Number(req.params.id);
    if (targetId === req.userId) {
      reply.code(400).send({ error: 'CANNOT_DELETE_SELF' });
      return;
    }
    const target = await findUserById(targetId);
    if (!target) {
      reply.code(404).send({ error: 'USER_NOT_FOUND' });
      return;
    }
    // Deactivating first kills every session for the account (see the PATCH
    // handler above) — requiring it before delete means there's no window
    // where a still-logged-in session outlives the account it belongs to.
    if (target.isActive) {
      reply.code(400).send({ error: 'MUST_DEACTIVATE_FIRST' });
      return;
    }
    await deleteUser(targetId);
    reply.code(204).send();
  });

  app.patch<{
    Body: {
      siteName?: string;
      font?: string;
      dataFont?: string;
      telemetryFont?: string;
      fontSizeScale?: number;
      defaultAccentColor?: string;
      accentPresets?: string[];
      neonGlowEnabled?: boolean;
    };
  }>('/api/admin/site-settings', { preHandler: requireAdmin }, async (req, reply) => {
    const { siteName, font, dataFont, telemetryFont, fontSizeScale, defaultAccentColor, accentPresets, neonGlowEnabled } =
      req.body ?? {};
    const patch: SiteSettingsPatch = {};

    if (siteName !== undefined) {
      const trimmed = siteName.trim();
      if (trimmed.length === 0 || trimmed.length > 60) {
        reply.code(400).send({ error: 'INVALID_SITE_NAME' });
        return;
      }
      patch.siteName = trimmed;
    }
    if (font !== undefined) {
      if (!SITE_FONTS.includes(font as SiteFont)) {
        reply.code(400).send({ error: 'INVALID_FONT' });
        return;
      }
      patch.font = font as SiteFont;
    }
    if (dataFont !== undefined) {
      if (!DATA_FONTS.includes(dataFont as DataFont)) {
        reply.code(400).send({ error: 'INVALID_DATA_FONT' });
        return;
      }
      patch.dataFont = dataFont as DataFont;
    }
    if (telemetryFont !== undefined) {
      if (!TELEMETRY_FONT_MODES.includes(telemetryFont as TelemetryFontMode)) {
        reply.code(400).send({ error: 'INVALID_TELEMETRY_FONT' });
        return;
      }
      patch.telemetryFont = telemetryFont as TelemetryFontMode;
    }
    if (fontSizeScale !== undefined) {
      if (typeof fontSizeScale !== 'number' || !Number.isFinite(fontSizeScale) || fontSizeScale < 0.8 || fontSizeScale > 2.0) {
        reply.code(400).send({ error: 'INVALID_FONT_SIZE_SCALE' });
        return;
      }
      patch.fontSizeScale = fontSizeScale;
    }
    if (defaultAccentColor !== undefined) {
      if (!HEX_COLOR_RE.test(defaultAccentColor)) {
        reply.code(400).send({ error: 'INVALID_COLOR' });
        return;
      }
      patch.defaultAccentColor = defaultAccentColor;
    }
    if (accentPresets !== undefined) {
      if (
        !Array.isArray(accentPresets) ||
        accentPresets.length === 0 ||
        accentPresets.length > 12 ||
        !accentPresets.every((c) => typeof c === 'string' && HEX_COLOR_RE.test(c))
      ) {
        reply.code(400).send({ error: 'INVALID_COLOR' });
        return;
      }
      patch.accentPresets = accentPresets;
    }
    if (neonGlowEnabled !== undefined) {
      patch.neonGlowEnabled = neonGlowEnabled;
    }

    reply.send(await updateSiteSettings(patch));
  });

  app.get('/api/admin/tracks', { preHandler: requireAdmin }, async (_req, reply) => {
    reply.send({ tracks: await listTracks() });
  });

  app.post<{ Body: { slug?: string; name?: string; country?: string } }>(
    '/api/admin/tracks',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const slug = (req.body?.slug ?? '').trim().toLowerCase();
      const name = (req.body?.name ?? '').trim();
      const country = (req.body?.country ?? '').trim().toUpperCase();
      if (!SLUG_RE.test(slug)) {
        reply.code(400).send({ error: 'INVALID_SLUG' });
        return;
      }
      if (name.length === 0 || name.length > 120) {
        reply.code(400).send({ error: 'INVALID_NAME' });
        return;
      }
      if (!COUNTRY_RE.test(country)) {
        reply.code(400).send({ error: 'INVALID_COUNTRY' });
        return;
      }
      if (await findTrackBySlug(slug)) {
        reply.code(409).send({ error: 'SLUG_ALREADY_USED' });
        return;
      }
      reply.code(201).send(await createTrack({ slug, name, country }));
    },
  );

  app.patch<{ Params: { slug: string }; Body: { name?: string; country?: string; dlcSlug?: string } }>(
    '/api/admin/tracks/:slug',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const target = await findTrackBySlug(req.params.slug);
      if (!target) {
        reply.code(404).send({ error: 'TRACK_NOT_FOUND' });
        return;
      }
      const { name, country, dlcSlug } = req.body ?? {};
      const patch: { name?: string; country?: string; dlcSlug?: string | null } = {};
      if (name !== undefined) {
        const trimmed = name.trim();
        if (trimmed.length === 0 || trimmed.length > 120) {
          reply.code(400).send({ error: 'INVALID_NAME' });
          return;
        }
        patch.name = trimmed;
      }
      if (country !== undefined) {
        const upper = country.trim().toUpperCase();
        if (!COUNTRY_RE.test(upper)) {
          reply.code(400).send({ error: 'INVALID_COUNTRY' });
          return;
        }
        patch.country = upper;
      }
      // Empty string clears the DLC tag back to base game.
      if (dlcSlug !== undefined) {
        if (dlcSlug !== '' && !(await findDlcBySlug(dlcSlug))) {
          reply.code(400).send({ error: 'INVALID_DLC' });
          return;
        }
        patch.dlcSlug = dlcSlug === '' ? null : dlcSlug;
      }
      const updated = await updateTrack(req.params.slug, patch);
      reply.send(updated);
    },
  );

  // Shared by every photo/map/badge upload route below (tracks and cars) —
  // same small-file pattern, just a different destination dir/filename.
  /** Returns true on a successful write; false after already sending an error reply. */
  async function handleImageUpload(req: FastifyRequest, reply: FastifyReply, dir: string, baseName: string): Promise<boolean> {
    const data = await req.file();
    if (!data) {
      reply.code(400).send({ error: 'NO_FILE_PROVIDED' });
      return false;
    }
    const ext = UPLOAD_CONTENT_TYPES[data.mimetype];
    if (!ext) {
      reply.code(400).send({ error: 'INVALID_IMAGE_TYPE' });
      return false;
    }
    const buffer = await data.toBuffer();
    writeImageAtomic(dir, baseName, ext, buffer);
    return true;
  }

  app.post<{ Params: { slug: string } }>(
    '/api/admin/tracks/:slug/photo',
    { preHandler: requireAdmin },
    async (req, reply) => {
      if (!(await findTrackBySlug(req.params.slug))) {
        reply.code(404).send({ error: 'TRACK_NOT_FOUND' });
        return;
      }
      if (await handleImageUpload(req, reply, TRACK_PHOTOS_DIR, req.params.slug)) {
        reply.send(await findTrackBySlug(req.params.slug));
      }
    },
  );

  app.post<{ Params: { slug: string } }>(
    '/api/admin/tracks/:slug/map',
    { preHandler: requireAdmin },
    async (req, reply) => {
      if (!(await findTrackBySlug(req.params.slug))) {
        reply.code(404).send({ error: 'TRACK_NOT_FOUND' });
        return;
      }
      if (await handleImageUpload(req, reply, TRACK_PHOTOS_DIR, `${req.params.slug}-map`)) {
        reply.send(await findTrackBySlug(req.params.slug));
      }
    },
  );

  app.get('/api/admin/cars', { preHandler: requireAdmin }, async (_req, reply) => {
    reply.send({ cars: await listCars() });
  });

  app.post<{ Body: { slug?: string; name?: string; manufacturerSlug?: string; category?: string } }>(
    '/api/admin/cars',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const slug = (req.body?.slug ?? '').trim().toLowerCase();
      const name = (req.body?.name ?? '').trim();
      const manufacturerSlug = (req.body?.manufacturerSlug ?? '').trim();
      const category = req.body?.category ?? '';
      if (!SLUG_RE.test(slug)) {
        reply.code(400).send({ error: 'INVALID_SLUG' });
        return;
      }
      if (name.length === 0 || name.length > 120) {
        reply.code(400).send({ error: 'INVALID_NAME' });
        return;
      }
      if (!(await findManufacturerBySlug(manufacturerSlug))) {
        reply.code(400).send({ error: 'INVALID_MANUFACTURER' });
        return;
      }
      if (!CAR_CATEGORIES.includes(category as CarCategory)) {
        reply.code(400).send({ error: 'INVALID_CATEGORY' });
        return;
      }
      if (await findCarBySlug(slug)) {
        reply.code(409).send({ error: 'SLUG_ALREADY_USED' });
        return;
      }
      reply.code(201).send(await createCar({ slug, name, manufacturerSlug, category: category as CarCategory }));
    },
  );

  app.patch<{
    Params: { slug: string };
    Body: { name?: string; manufacturerSlug?: string; category?: string; dlcSlug?: string };
  }>('/api/admin/cars/:slug', { preHandler: requireAdmin }, async (req, reply) => {
    const target = await findCarBySlug(req.params.slug);
    if (!target) {
      reply.code(404).send({ error: 'CAR_NOT_FOUND' });
      return;
    }
    const { name, manufacturerSlug, category, dlcSlug } = req.body ?? {};
    const patch: { name?: string; manufacturerSlug?: string; category?: CarCategory; dlcSlug?: string | null } = {};
    if (name !== undefined) {
      const trimmed = name.trim();
      if (trimmed.length === 0 || trimmed.length > 120) {
        reply.code(400).send({ error: 'INVALID_NAME' });
        return;
      }
      patch.name = trimmed;
    }
    if (manufacturerSlug !== undefined) {
      if (!(await findManufacturerBySlug(manufacturerSlug))) {
        reply.code(400).send({ error: 'INVALID_MANUFACTURER' });
        return;
      }
      patch.manufacturerSlug = manufacturerSlug;
    }
    if (category !== undefined) {
      if (!CAR_CATEGORIES.includes(category as CarCategory)) {
        reply.code(400).send({ error: 'INVALID_CATEGORY' });
        return;
      }
      patch.category = category as CarCategory;
    }
    // Empty string clears the DLC tag back to base game.
    if (dlcSlug !== undefined) {
      if (dlcSlug !== '' && !(await findDlcBySlug(dlcSlug))) {
        reply.code(400).send({ error: 'INVALID_DLC' });
        return;
      }
      patch.dlcSlug = dlcSlug === '' ? null : dlcSlug;
    }
    const updated = await updateCar(req.params.slug, patch);
    reply.send(updated);
  });

  app.post<{ Params: { slug: string } }>(
    '/api/admin/cars/:slug/photo',
    { preHandler: requireAdmin },
    async (req, reply) => {
      if (!(await findCarBySlug(req.params.slug))) {
        reply.code(404).send({ error: 'CAR_NOT_FOUND' });
        return;
      }
      if (await handleImageUpload(req, reply, CAR_PHOTOS_DIR, req.params.slug)) {
        reply.send(await findCarBySlug(req.params.slug));
      }
    },
  );

  app.get('/api/admin/manufacturers', { preHandler: requireAdmin }, async (_req, reply) => {
    reply.send({ manufacturers: await listManufacturers() });
  });

  app.post<{ Body: { slug?: string; name?: string } }>(
    '/api/admin/manufacturers',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const slug = (req.body?.slug ?? '').trim().toLowerCase();
      const name = (req.body?.name ?? '').trim();
      if (!SLUG_RE.test(slug)) {
        reply.code(400).send({ error: 'INVALID_SLUG' });
        return;
      }
      if (name.length === 0 || name.length > 80) {
        reply.code(400).send({ error: 'INVALID_NAME' });
        return;
      }
      if (await findManufacturerBySlug(slug)) {
        reply.code(409).send({ error: 'SLUG_ALREADY_USED' });
        return;
      }
      reply.code(201).send(await createManufacturer({ slug, name }));
    },
  );

  app.patch<{ Params: { slug: string }; Body: { name?: string } }>(
    '/api/admin/manufacturers/:slug',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const target = await findManufacturerBySlug(req.params.slug);
      if (!target) {
        reply.code(404).send({ error: 'MANUFACTURER_NOT_FOUND' });
        return;
      }
      const { name } = req.body ?? {};
      if (name !== undefined) {
        const trimmed = name.trim();
        if (trimmed.length === 0 || trimmed.length > 80) {
          reply.code(400).send({ error: 'INVALID_NAME' });
          return;
        }
        reply.send(await updateManufacturer(req.params.slug, { name: trimmed }));
        return;
      }
      reply.send(target);
    },
  );

  app.post<{ Params: { slug: string } }>(
    '/api/admin/manufacturers/:slug/badge',
    { preHandler: requireAdmin },
    async (req, reply) => {
      if (!(await findManufacturerBySlug(req.params.slug))) {
        reply.code(404).send({ error: 'MANUFACTURER_NOT_FOUND' });
        return;
      }
      if (await handleImageUpload(req, reply, MANUFACTURER_PHOTOS_DIR, req.params.slug)) {
        reply.send(await findManufacturerBySlug(req.params.slug));
      }
    },
  );

  app.get('/api/admin/dlcs', { preHandler: requireAdmin }, async (_req, reply) => {
    reply.send({ dlcs: await listDlcs() });
  });

  app.post<{ Body: { slug?: string; name?: string; color?: string } }>(
    '/api/admin/dlcs',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const slug = (req.body?.slug ?? '').trim().toLowerCase();
      const name = (req.body?.name ?? '').trim();
      const color = (req.body?.color ?? '').trim();
      if (!SLUG_RE.test(slug)) {
        reply.code(400).send({ error: 'INVALID_SLUG' });
        return;
      }
      if (name.length === 0 || name.length > 80) {
        reply.code(400).send({ error: 'INVALID_NAME' });
        return;
      }
      if (!HEX_COLOR_RE.test(color)) {
        reply.code(400).send({ error: 'INVALID_COLOR' });
        return;
      }
      if (await findDlcBySlug(slug)) {
        reply.code(409).send({ error: 'SLUG_ALREADY_USED' });
        return;
      }
      reply.code(201).send(await createDlc({ slug, name, color }));
    },
  );

  app.patch<{ Params: { slug: string }; Body: { name?: string; color?: string } }>(
    '/api/admin/dlcs/:slug',
    { preHandler: requireAdmin },
    async (req, reply) => {
      const target = await findDlcBySlug(req.params.slug);
      if (!target) {
        reply.code(404).send({ error: 'DLC_NOT_FOUND' });
        return;
      }
      const { name, color } = req.body ?? {};
      const patch: { name?: string; color?: string } = {};
      if (name !== undefined) {
        const trimmed = name.trim();
        if (trimmed.length === 0 || trimmed.length > 80) {
          reply.code(400).send({ error: 'INVALID_NAME' });
          return;
        }
        patch.name = trimmed;
      }
      if (color !== undefined) {
        if (!HEX_COLOR_RE.test(color)) {
          reply.code(400).send({ error: 'INVALID_COLOR' });
          return;
        }
        patch.color = color;
      }
      reply.send(await updateDlc(req.params.slug, patch));
    },
  );
}
