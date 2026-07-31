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

function runSchemaFile(filename: string): Promise<unknown> {
  const ddl = fs.readFileSync(path.join(__dirname, filename), 'utf-8');
  return pool.query(ddl);
}

/** Runs the idempotent auth schema DDL (CREATE TABLE IF NOT EXISTS ...) at startup. */
export async function initAuthSchema(): Promise<void> {
  await runSchemaFile('authSchema.sql');
}

/** Runs the idempotent social schema DDL (friend requests/friendships/follows) at startup. */
export async function initSocialSchema(): Promise<void> {
  await runSchemaFile('socialSchema.sql');
}

/** Runs the idempotent file-visibility schema DDL (telemetry_files/lap_shares) at startup. */
export async function initFilesSchema(): Promise<void> {
  await runSchemaFile('filesSchema.sql');
}

/** Runs `fn` inside a single client transaction, committing on success and rolling
 * back on any thrown error — needed for multi-statement mutations (e.g. accepting a
 * friend request: delete the request row + insert the friendship row atomically). */
export async function withTransaction<T>(fn: (query: typeof pgQuery) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  const clientQuery: typeof pgQuery = async (sql, params = []) => {
    const result = await client.query(sql, params);
    return result.rows;
  };
  try {
    await client.query('BEGIN');
    const result = await fn(clientQuery);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
