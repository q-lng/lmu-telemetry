/** Index of the last sample at-or-before `target` in an ascending-sorted array `t`
 * (floor, not nearest) — for a step/event channel that's the value actually in
 * effect at that instant; rounding to the closer neighbor would sometimes jump to
 * the *next* recorded change instead of holding the last one. */
export function nearestIndex(t: number[], target: number): number {
  if (t.length === 0) return -1;
  if (target < t[0]) return 0;
  let lo = 0;
  let hi = t.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (t[mid] <= target) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function nearestValue(t: number[], values: (number | boolean | null)[], target: number | null): number | boolean | null {
  if (target === null) return null;
  const idx = nearestIndex(t, target);
  return idx < 0 ? null : values[idx];
}
