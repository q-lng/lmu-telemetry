/** h:mm:ss.mmm / m:ss.mmm / s.mmm — leading zero units are omitted entirely
 * (never "00:" or "0:"), matching how lap times are read in motorsport (no
 * trailing unit suffix once a colon-separated format is in play). */
export function formatLapTime(seconds: number): string {
  const totalMs = Math.round(seconds * 1000);
  const ms = totalMs % 1000;
  const totalSeconds = Math.floor(totalMs / 1000);
  const s = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const m = totalMinutes % 60;
  const h = Math.floor(totalMinutes / 60);
  const msStr = String(ms).padStart(3, '0');
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${msStr}`;
  if (m > 0) return `${m}:${String(s).padStart(2, '0')}.${msStr}`;
  return `${s}.${msStr}`;
}
