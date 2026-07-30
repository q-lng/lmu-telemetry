import duckdb from 'duckdb';
import path from 'node:path';
import fs from 'node:fs';

export const DATA_DIR = process.env.DATA_DIR ?? '/data';

const openDbs = new Map<string, duckdb.Database>();

/** Resolves a session filename to an absolute path, rejecting any path traversal. */
export function resolveSessionPath(file: string): string {
  const resolved = path.resolve(DATA_DIR, file);
  if (!resolved.startsWith(path.resolve(DATA_DIR) + path.sep)) {
    throw new Error('Invalid session file');
  }
  if (!resolved.endsWith('.duckdb') || !fs.existsSync(resolved)) {
    throw new Error('Session file not found');
  }
  return resolved;
}

export function listSessionFiles(): string[] {
  return fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('.duckdb'))
    .sort()
    .reverse();
}

/** Drops a cached DuckDB connection so a subsequent query reopens the (possibly overwritten) file. */
export function evictDb(absPath: string): void {
  const db = openDbs.get(absPath);
  if (db) {
    openDbs.delete(absPath);
    db.close(() => {});
  }
}

function getDb(file: string): duckdb.Database {
  const absPath = resolveSessionPath(file);
  let db = openDbs.get(absPath);
  if (!db) {
    db = new duckdb.Database(absPath, { access_mode: 'READ_ONLY' });
    openDbs.set(absPath, db);
  }
  return db;
}

export function query<T = Record<string, unknown>>(file: string, sql: string, params: unknown[] = []): Promise<T[]> {
  const db = getDb(file);
  return new Promise((resolve, reject) => {
    const con = db.connect();
    con.all(sql, ...params, (err: Error | null, rows: Record<string, unknown>[]) => {
      con.close();
      if (err) reject(err);
      else resolve(rows as T[]);
    });
  });
}

/** Quote a DuckDB identifier (table/column name) safely for interpolation. */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
