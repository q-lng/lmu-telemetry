import { query } from './db.js';

export interface SessionMetadata {
  info: Record<string, string>;
  carSetup: unknown;
}

export async function getSessionMetadata(file: string): Promise<SessionMetadata> {
  const rows = await query<{ key: string; value: string }>(file, `SELECT key, value FROM metadata`);
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
}

export interface SessionSummary {
  file: string;
  ownerId: number | null;
  track?: string;
  sessionType?: string;
  driverName?: string;
  carName?: string;
  recordingTime?: string;
  lapCount?: number;
  durationSeconds?: number;
}
