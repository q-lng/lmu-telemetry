import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { Pool } = pg;

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function pgQuery<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const result = await pool.query(sql, params);
  return result.rows as T[];
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Runs the idempotent auth schema DDL (CREATE TABLE IF NOT EXISTS ...) at startup. */
export async function initAuthSchema(): Promise<void> {
  const ddl = fs.readFileSync(path.join(__dirname, 'authSchema.sql'), 'utf-8');
  await pool.query(ddl);
}
