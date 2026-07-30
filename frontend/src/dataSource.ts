import type { ChannelDescriptor, ChannelSeries, LapInfo, SessionMetadata } from './types';
import {
  fetchChannelSeries as apiFetchChannelSeries,
  fetchChannels as apiFetchChannels,
  fetchLaps as apiFetchLaps,
  fetchMetadata as apiFetchMetadata,
} from './api';
import { openLocalFile, type WasmSession } from './wasm/duckdb';

/** Everything the app needs from a telemetry file, regardless of where it lives —
 * a file uploaded to the server (queried via the REST API) or a file opened
 * locally in the browser (queried via DuckDB-WASM, no server involved at all). */
export interface DataSource {
  label: string;
  fetchMetadata(): Promise<SessionMetadata>;
  fetchChannels(): Promise<ChannelDescriptor[]>;
  fetchLaps(): Promise<LapInfo[]>;
  fetchChannelSeries(name: string, range?: { from: number; to: number }): Promise<ChannelSeries>;
  close?(): Promise<void>;
}

export function createServerDataSource(file: string): DataSource {
  return {
    label: file,
    fetchMetadata: () => apiFetchMetadata(file),
    fetchChannels: () => apiFetchChannels(file),
    fetchLaps: () => apiFetchLaps(file),
    fetchChannelSeries: (name, range) => apiFetchChannelSeries(file, name, range),
  };
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Mirrors the backend's channels.ts/metadata.ts SQL exactly, executed by DuckDB-WASM
 * in the browser instead of the Node backend — same engine, same queries. */
export async function createWasmDataSource(file: File): Promise<DataSource> {
  const session: WasmSession = await openLocalFile(file);

  let startTsCache: number | null = null;
  async function getStartTs(): Promise<number> {
    if (startTsCache !== null) return startTsCache;
    const rows = await session.query<{ value: number }>(`SELECT value FROM "GPS Time" ORDER BY rowid ASC LIMIT 1`);
    startTsCache = rows[0]?.value ?? 0;
    return startTsCache;
  }

  let channelsCache: ChannelDescriptor[] | null = null;
  async function listChannels(): Promise<ChannelDescriptor[]> {
    if (channelsCache) return channelsCache;
    const [continuous, events, columnRows] = await Promise.all([
      session.query<{ channelName: string; frequency: number; unit: string }>(
        `SELECT channelName, frequency, unit FROM channelsList`,
      ),
      session.query<{ eventName: string; unit: string }>(`SELECT eventName, unit FROM eventsList`),
      session.query<{ table_name: string; column_name: string }>(
        `SELECT table_name, column_name
         FROM information_schema.columns
         WHERE table_schema = 'main' AND column_name != 'ts'
         ORDER BY table_name, ordinal_position`,
      ),
    ]);
    const valueCols = new Map<string, string[]>();
    for (const r of columnRows) {
      const list = valueCols.get(r.table_name) ?? [];
      list.push(r.column_name);
      valueCols.set(r.table_name, list);
    }
    const out: ChannelDescriptor[] = [];
    for (const c of continuous) {
      out.push({
        name: c.channelName,
        kind: 'continuous',
        unit: c.unit,
        frequency: c.frequency,
        valueColumns: valueCols.get(c.channelName) ?? ['value'],
      });
    }
    for (const e of events) {
      out.push({
        name: e.eventName,
        kind: 'event',
        unit: e.unit,
        valueColumns: valueCols.get(e.eventName) ?? ['value'],
      });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    channelsCache = out;
    return out;
  }

  async function getChannelDescriptor(name: string): Promise<ChannelDescriptor> {
    const channels = await listChannels();
    const found = channels.find((c) => c.name === name);
    if (!found) throw new Error(`Unknown channel: ${name}`);
    return found;
  }

  return {
    label: file.name,

    async fetchMetadata() {
      const rows = await session.query<{ key: string; value: string }>(`SELECT key, value FROM metadata`);
      const info: Record<string, string> = {};
      let carSetup: unknown = null;
      for (const r of rows) {
        if (r.key === 'CarSetup') {
          try {
            carSetup = JSON.parse(r.value);
          } catch {
            carSetup = r.value;
          }
        } else {
          info[r.key] = r.value;
        }
      }
      return { info, carSetup };
    },

    fetchChannels: listChannels,

    async fetchLaps() {
      const [lapRows, lapTimeRows] = await Promise.all([
        session.query<{ ts: number; value: number }>(`SELECT ts, value FROM "Lap" ORDER BY rowid`),
        session.query<{ ts: number; value: number }>(`SELECT ts, value FROM "Lap Time" ORDER BY rowid`),
      ]);
      const lapTimeByTs = new Map(lapTimeRows.map((r) => [r.ts, r.value]));
      const laps: LapInfo[] = [];
      for (let i = 0; i < lapRows.length - 1; i++) {
        const start = lapRows[i];
        const end = lapRows[i + 1];
        laps.push({
          lap: start.value,
          startTs: start.ts,
          endTs: end.ts,
          lapTime: lapTimeByTs.get(end.ts) ?? null,
          elapsedTime: end.ts - start.ts,
        });
      }
      return laps;
    },

    async fetchChannelSeries(name, range) {
      const desc = await getChannelDescriptor(name);
      const table = quoteIdent(name);
      const valueSelect = desc.valueColumns.map(quoteIdent).join(', ');

      let rows: Record<string, unknown>[];
      let t: number[];

      if (desc.kind === 'event') {
        const where = range ? `WHERE ts BETWEEN ${range.from} AND ${range.to}` : '';
        rows = await session.query(`SELECT ts, ${valueSelect} FROM ${table} ${where} ORDER BY rowid`);
        t = rows.map((r) => r.ts as number);
      } else {
        const freq = desc.frequency ?? 1;
        const startTs = await getStartTs();
        const where = range
          ? `WHERE (rowid / ${freq}.0 + ${startTs}) BETWEEN ${range.from} AND ${range.to}`
          : '';
        rows = await session.query(`SELECT rowid, ${valueSelect} FROM ${table} ${where} ORDER BY rowid`);
        t = rows.map((r) => startTs + Number(r.rowid) / freq);
      }

      const values: Record<string, (number | boolean | null)[]> = {};
      for (const col of desc.valueColumns) {
        values[col] = rows.map((r) => r[col] as number | boolean | null);
      }

      return {
        name: desc.name,
        kind: desc.kind,
        unit: desc.unit,
        frequency: desc.frequency,
        valueColumns: desc.valueColumns,
        t,
        values,
      };
    },

    close: () => session.close(),
  };
}
