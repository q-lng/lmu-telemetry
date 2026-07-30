import * as duckdb from '@duckdb/duckdb-wasm';
import duckdbWasmMvp from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvpWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdbWasmEh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import ehWorker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';

let dbPromise: Promise<duckdb.AsyncDuckDB> | null = null;

/** Boots the DuckDB WASM engine once (self-hosted assets, no CDN dependency) and reuses it. */
function getDb(): Promise<duckdb.AsyncDuckDB> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const bundles: duckdb.DuckDBBundles = {
        mvp: { mainModule: duckdbWasmMvp, mainWorker: mvpWorker },
        eh: { mainModule: duckdbWasmEh, mainWorker: ehWorker },
      };
      const bundle = await duckdb.selectBundle(bundles);
      const worker = new Worker(bundle.mainWorker!);
      const logger = new duckdb.ConsoleLogger(duckdb.LogLevel.WARNING);
      const db = new duckdb.AsyncDuckDB(logger, worker);
      await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
      return db;
    })();
  }
  return dbPromise;
}

export interface WasmSession {
  query<T = Record<string, unknown>>(sql: string): Promise<T[]>;
  close(): Promise<void>;
}

/** Loads a local .duckdb file entirely in the browser — no upload, no server round-trip. */
export async function openLocalFile(file: File): Promise<WasmSession> {
  const db = await getDb();
  const buffer = new Uint8Array(await file.arrayBuffer());
  const virtualName = `guest-${Math.random().toString(36).slice(2)}.duckdb`;
  await db.registerFileBuffer(virtualName, buffer);
  await db.open({ path: virtualName, accessMode: duckdb.DuckDBAccessMode.READ_ONLY });
  const conn = await db.connect();

  return {
    async query<T>(sql: string): Promise<T[]> {
      const table = await conn.query(sql);
      return table.toArray() as T[];
    },
    async close() {
      await conn.close();
      await db.dropFile(virtualName);
    },
  };
}
