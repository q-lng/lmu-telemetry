import { query, quoteIdent } from './db.js';

export type ChannelKind = 'continuous' | 'event';

export interface ChannelDescriptor {
  name: string;
  kind: ChannelKind;
  unit: string;
  frequency?: number; // Hz, continuous channels only
  valueColumns: string[]; // ['value'] or ['value1'..'value4']
}

interface ColumnsRow {
  table_name: string;
  column_name: string;
}

async function tableValueColumns(file: string): Promise<Map<string, string[]>> {
  const rows = await query<ColumnsRow>(
    file,
    `SELECT table_name, column_name
     FROM information_schema.columns
     WHERE table_schema = 'main'
       AND column_name != 'ts'
     ORDER BY table_name, ordinal_position`,
  );
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const list = map.get(r.table_name) ?? [];
    list.push(r.column_name);
    map.set(r.table_name, list);
  }
  return map;
}

export async function listChannels(file: string): Promise<ChannelDescriptor[]> {
  const [continuous, events, valueCols] = await Promise.all([
    query<{ channelName: string; frequency: number; unit: string }>(file, `SELECT channelName, frequency, unit FROM channelsList`),
    query<{ eventName: string; unit: string }>(file, `SELECT eventName, unit FROM eventsList`),
    tableValueColumns(file),
  ]);

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
  return out;
}

export async function getChannelDescriptor(file: string, name: string): Promise<ChannelDescriptor> {
  const channels = await listChannels(file);
  const found = channels.find((c) => c.name === name);
  if (!found) throw new Error(`Unknown channel: ${name}`);
  return found;
}

const startTsCache = new Map<string, number>();

export function evictStartTsCache(file: string): void {
  startTsCache.delete(file);
}

/** Absolute recording-start offset (seconds), read from the `GPS Time` channel's first sample. */
export async function getStartTs(file: string): Promise<number> {
  const cached = startTsCache.get(file);
  if (cached !== undefined) return cached;
  const rows = await query<{ value: number }>(file, `SELECT value FROM "GPS Time" ORDER BY rowid ASC LIMIT 1`);
  const startTs = rows[0]?.value ?? 0;
  startTsCache.set(file, startTs);
  return startTs;
}

export interface ChannelSeries {
  name: string;
  kind: ChannelKind;
  unit: string;
  frequency?: number;
  valueColumns: string[];
  t: number[];
  values: Record<string, (number | boolean | null)[]>;
}

export async function getChannelSeries(
  file: string,
  name: string,
  range?: { from: number; to: number },
): Promise<ChannelSeries> {
  const desc = await getChannelDescriptor(file, name);
  const table = quoteIdent(name);
  const valueSelect = desc.valueColumns.map(quoteIdent).join(', ');

  let rows: Record<string, unknown>[];
  let t: number[];

  if (desc.kind === 'event') {
    const where = range ? `WHERE ts BETWEEN ${range.from} AND ${range.to}` : '';
    rows = await query(file, `SELECT ts, ${valueSelect} FROM ${table} ${where} ORDER BY rowid`);
    t = rows.map((r) => r.ts as number);
  } else {
    const freq = desc.frequency ?? 1;
    const startTs = await getStartTs(file);
    const where = range
      ? `WHERE (rowid / ${freq}.0 + ${startTs}) BETWEEN ${range.from} AND ${range.to}`
      : '';
    rows = await query(file, `SELECT rowid, ${valueSelect} FROM ${table} ${where} ORDER BY rowid`);
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
}

export interface LapInfo {
  lap: number;
  startTs: number;
  endTs: number;
  /** Official game-reported lap time. 0 or null means the game invalidated the
   * lap (e.g. track limits) — it did not fail to record it. */
  lapTime: number | null;
  /** endTs - startTs — always computable, a reasonable stand-in when lapTime is
   * invalidated (verified against real data: matches neighboring laps closely). */
  elapsedTime: number;
}

export async function getLaps(file: string): Promise<LapInfo[]> {
  const [lapRows, lapTimeRows] = await Promise.all([
    query<{ ts: number; value: number }>(file, `SELECT ts, value FROM "Lap" ORDER BY rowid`),
    query<{ ts: number; value: number }>(file, `SELECT ts, value FROM "Lap Time" ORDER BY rowid`),
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
}
