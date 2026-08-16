import zlib from 'node:zlib';

// LMU/rFactor2 .mas track content files: a proprietary binary header of
// variable size (seen ranging from ~400 bytes to several KB across
// different files — not fixed, must be located dynamically) followed by a
// standard zlib stream (RFC 1950) holding the track's plain-text INI-like
// definition (sections like [Waypoint], [Features]...). Scans for a valid
// zlib header (CMF byte 0x78, with the CMF*256+FLG checksum divisible by
// 31) and actually attempts inflation at each candidate rather than
// stopping at the first 0x78 byte — large files can contain incidental
// 0x78 bytes before the real stream that look like a valid header but fail
// to inflate.
export function extractMasContent(data: Buffer): Buffer {
  for (let i = 0; i < data.length - 1; i++) {
    if (data[i] !== 0x78) continue;
    const cmf = data[i];
    const flg = data[i + 1];
    if ((cmf & 0x0f) !== 8 || (cmf * 256 + flg) % 31 !== 0) continue;
    try {
      return zlib.inflateSync(data.subarray(i));
    } catch {
      continue;
    }
  }
  throw new Error('NO_ZLIB_STREAM');
}

export type MasPoint = [x: number, y: number];

export interface MasWaypoints {
  /** branchID 0 — the main track path, one closed lap. */
  track: MasPoint[];
  /** branchID 1 — pit lane, when present (open path, not a loop). */
  pitlane: MasPoint[];
}

const WP_POS_RE = /wp_pos=\(([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)/g;
const WP_BRANCH_RE = /wp_branchID=\((\d+)\)/g;

/** Parses the decompressed .mas text for [Waypoint] entries and projects
 * each to a 2D point. wp_pos is (x, y, z) in the game's world coordinates
 * (Y = elevation, X/Z = ground plane) — verified against a real recorded
 * GPS trace for Spa: mapping (x, -z) reproduces the same winding direction
 * and aspect ratio as the telemetry's lat/lon-derived trace (see the
 * project's calibration tool, trackMapDraw.ts, for how that trace itself is
 * drawn), so a plain rotation is enough to align the two — no mirroring
 * needed. */
export function parseMasWaypoints(text: string): MasWaypoints {
  const positions = [...text.matchAll(WP_POS_RE)].map((m): MasPoint => [Number(m[1]), -Number(m[3])]);
  const branchIds = [...text.matchAll(WP_BRANCH_RE)].map((m) => Number(m[1]));

  const track: MasPoint[] = [];
  const pitlane: MasPoint[] = [];
  branchIds.forEach((branch, i) => {
    const point = positions[i];
    if (!point) return;
    if (branch === 0) track.push(point);
    else if (branch === 1) pitlane.push(point);
  });
  return { track, pitlane };
}

const PADDING_RATIO = 0.03;
const LINE_WIDTH_RATIO = 0.006;
const OUTLINE_EXTRA_RATIO = 0.004;
const PITLANE_WIDTH_SCALE = 0.7;

function pathData(points: MasPoint[], close: boolean): string {
  if (points.length === 0) return '';
  const [firstX, firstY] = points[0];
  const rest = points
    .slice(1)
    .map(([x, y]) => `L ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ');
  return `M ${firstX.toFixed(2)} ${firstY.toFixed(2)} ${rest}${close ? ' Z' : ''}`;
}

/** Renders the parsed waypoints as an outlined-line SVG (white line, black
 * outline) — the same flat look every uploaded map is expected to have,
 * generated instead of hand-drawn since these are bare line paths (a
 * centerline, not a filled shape) rather than an arbitrary photo. */
export function generateTrackMapSvg({ track, pitlane }: MasWaypoints): string {
  if (track.length < 3) throw new Error('NO_TRACK_WAYPOINTS');

  const all = [...track, ...pitlane];
  const xs = all.map(([x]) => x);
  const ys = all.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX || 1;
  const height = maxY - minY || 1;
  const minSpan = Math.min(width, height);
  const pad = Math.max(minSpan * PADDING_RATIO, 5);

  const lineWidth = minSpan * LINE_WIDTH_RATIO;
  const outlineWidth = lineWidth + minSpan * OUTLINE_EXTRA_RATIO * 2;
  const pitLineWidth = lineWidth * PITLANE_WIDTH_SCALE;
  const pitOutlineWidth = outlineWidth * PITLANE_WIDTH_SCALE;

  const viewMinX = minX - pad;
  const viewMinY = minY - pad;
  const viewWidth = width + pad * 2;
  const viewHeight = height + pad * 2;

  const trackD = pathData(track, true);
  const pitD = pitlane.length >= 2 ? pathData(pitlane, false) : '';

  const pitPaths = pitD
    ? `
  <path d="${pitD}" fill="none" stroke="#000000" stroke-width="${pitOutlineWidth.toFixed(2)}" stroke-linejoin="round" stroke-linecap="round" />
  <path d="${pitD}" fill="none" stroke="#ffffff" stroke-width="${pitLineWidth.toFixed(2)}" stroke-linejoin="round" stroke-linecap="round" />`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewMinX.toFixed(2)} ${viewMinY.toFixed(2)} ${viewWidth.toFixed(2)} ${viewHeight.toFixed(2)}" width="${viewWidth.toFixed(0)}" height="${viewHeight.toFixed(0)}">${pitPaths}
  <path d="${trackD}" fill="none" stroke="#000000" stroke-width="${outlineWidth.toFixed(2)}" stroke-linejoin="round" stroke-linecap="round" />
  <path d="${trackD}" fill="none" stroke="#ffffff" stroke-width="${lineWidth.toFixed(2)}" stroke-linejoin="round" stroke-linecap="round" />
</svg>
`;
}

/** End-to-end: raw uploaded .mas file bytes -> ready-to-serve SVG string. */
export function buildTrackMapSvgFromMas(masBuffer: Buffer): string {
  const decompressed = extractMasContent(masBuffer);
  const waypoints = parseMasWaypoints(decompressed.toString('utf8'));
  return generateTrackMapSvg(waypoints);
}
