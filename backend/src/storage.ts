import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { pgQuery } from './pg.js';
import { DATA_DIR } from './db.js';
import { requireAuth } from './auth.js';

export type Plan = 'free' | 'vip';

// VIP's number is a placeholder until real subscription tiers/pricing exist —
// only the 'free' quota (1GB) was given a concrete spec so far.
export const PLAN_QUOTA_BYTES: Record<Plan, number> = {
  free: 1 * 1024 * 1024 * 1024,
  vip: 20 * 1024 * 1024 * 1024,
};

export interface StorageUsage {
  usedBytes: number;
  quotaBytes: number;
  plan: Plan;
}

/** One-time startup migration: files uploaded before size_bytes existed have it
 * NULL — read their actual size from disk once so quota accounting is correct
 * immediately, not just for uploads from now on. Missing files on disk are left
 * NULL (not this function's job to reconcile a dangling DB row). */
export async function backfillMissingFileSizes(): Promise<void> {
  const rows = await pgQuery<{ filename: string }>(`SELECT filename FROM telemetry_files WHERE size_bytes IS NULL`);
  for (const row of rows) {
    try {
      const stat = fs.statSync(path.join(DATA_DIR, row.filename));
      await pgQuery(`UPDATE telemetry_files SET size_bytes = $2 WHERE filename = $1`, [row.filename, stat.size]);
    } catch {
      // File missing from disk (or unreadable) — leave size_bytes null.
    }
  }
}

export async function getStorageUsage(userId: number): Promise<StorageUsage> {
  const [userRows, sumRows] = await Promise.all([
    pgQuery<{ plan: Plan }>(`SELECT plan FROM users WHERE id = $1`, [userId]),
    pgQuery<{ total: string | null }>(`SELECT SUM(size_bytes) AS total FROM telemetry_files WHERE owner_id = $1`, [userId]),
  ]);
  const plan = userRows[0]?.plan ?? 'free';
  const usedBytes = Number(sumRows[0]?.total ?? 0);
  return { usedBytes, quotaBytes: PLAN_QUOTA_BYTES[plan], plan };
}

export async function registerStorage(app: FastifyInstance): Promise<void> {
  app.get('/api/storage', { preHandler: requireAuth }, async (req) => {
    return getStorageUsage(req.userId!);
  });
}
