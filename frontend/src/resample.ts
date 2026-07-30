/** Linear interpolation of a continuous channel onto an arbitrary sorted `grid`. */
export function resampleContinuous(srcT: number[], srcV: (number | null)[], grid: number[]): (number | null)[] {
  const out: (number | null)[] = new Array(grid.length).fill(null);
  if (srcT.length === 0) return out;
  let j = 0;
  for (let i = 0; i < grid.length; i++) {
    const x = grid[i];
    if (x < srcT[0] || x > srcT[srcT.length - 1]) continue;
    while (j < srcT.length - 2 && srcT[j + 1] < x) j++;
    const x0 = srcT[j];
    const x1 = srcT[j + 1];
    const y0 = srcV[j];
    const y1 = srcV[j + 1];
    if (y0 == null || y1 == null) continue;
    const frac = x1 === x0 ? 0 : (x - x0) / (x1 - x0);
    out[i] = y0 + (y1 - y0) * frac;
  }
  return out;
}

/** Step (hold-last-value) resampling for event channels onto an arbitrary sorted `grid`. */
export function resampleStep(srcT: number[], srcV: (number | boolean | null)[], grid: number[]): (number | null)[] {
  const out: (number | null)[] = new Array(grid.length).fill(null);
  let j = -1;
  for (let i = 0; i < grid.length; i++) {
    const x = grid[i];
    while (j + 1 < srcT.length && srcT[j + 1] <= x) j++;
    if (j < 0) continue;
    const v = srcV[j];
    out[i] = typeof v === 'boolean' ? (v ? 1 : 0) : (v as number | null);
  }
  return out;
}
