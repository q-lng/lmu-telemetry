import type { ChannelDescriptor, ChannelSeries, LapInfo, SessionMetadata, SessionSummary } from './types';

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export function fetchSessions(): Promise<SessionSummary[]> {
  return getJson('/api/sessions');
}

export function fetchMetadata(file: string): Promise<SessionMetadata> {
  return getJson(`/api/sessions/${encodeURIComponent(file)}/metadata`);
}

export function fetchChannels(file: string): Promise<ChannelDescriptor[]> {
  return getJson(`/api/sessions/${encodeURIComponent(file)}/channels`);
}

export function fetchLaps(file: string): Promise<LapInfo[]> {
  return getJson(`/api/sessions/${encodeURIComponent(file)}/laps`);
}

export async function uploadSession(file: File): Promise<{ file: string }> {
  const form = new FormData();
  form.append('file', file, file.name);
  const res = await fetch('/api/sessions/upload', { method: 'POST', body: form });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error ?? `Upload failed: HTTP ${res.status}`);
  }
  return res.json();
}

export function fetchChannelSeries(
  file: string,
  name: string,
  range?: { from: number; to: number },
): Promise<ChannelSeries> {
  const q = range ? `?from=${range.from}&to=${range.to}` : '';
  return getJson(`/api/sessions/${encodeURIComponent(file)}/channel/${encodeURIComponent(name)}${q}`);
}
