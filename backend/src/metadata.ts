import { query } from './db.js';
import { listSessionFiles } from './db.js';

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
  track?: string;
  sessionType?: string;
  driverName?: string;
  carName?: string;
  recordingTime?: string;
}

export async function listSessions(): Promise<SessionSummary[]> {
  const files = listSessionFiles();
  const summaries = await Promise.all(
    files.map(async (file): Promise<SessionSummary> => {
      try {
        const { info } = await getSessionMetadata(file);
        return {
          file,
          track: info.TrackName,
          sessionType: info.SessionType,
          driverName: info.DriverName,
          carName: info.CarName,
          recordingTime: info.RecordingTime,
        };
      } catch {
        return { file };
      }
    }),
  );
  return summaries;
}
