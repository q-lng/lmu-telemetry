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

export type MapStyle = 'band' | 'edges';

interface RawWaypoint {
  pos: [number, number, number];
  perp: [number, number, number];
  widthLeft: number;
  widthRight: number;
}

const WP_POS_RE = /wp_pos=\(([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)/;
const WP_PERP_RE = /wp_perp=\(([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)/;
const WP_BRANCH_RE = /wp_branchID=\((\d+)\)/;
const WP_WIDTH_RE = /wp_width=\(([-\d.]+),\s*([-\d.]+),/;

/** Parses the decompressed .mas text for the main track's [Waypoint]
 * entries (branchID 0 — pit lane/garage connectors are ignored). Each
 * waypoint is its own block of fields starting at a "wp_pos=" line —
 * parsed block by block (rather than flat-matching each field across the
 * whole text and assuming matching counts/order line up) since it's the
 * only approach that doesn't silently misalign if a track's waypoint
 * fields ever come in a different shape.
 *
 * wp_pos is (x, y, z) in the game's world coordinates (Y = elevation, X/Z =
 * ground plane) — the exact centerline of the road (confirmed: averaging
 * wp_width's road-left minus road-right across a full lap comes out ~0,
 * i.e. no systematic offset). wp_perp is the lateral (across-track) unit
 * vector at that point, used together with wp_width's road-left/road-right
 * distances to derive the actual track edges for the 'band' map style.
 *
 * The coordinate mapping (world X, -Z -> map x, y) was verified against a
 * real recorded Spa GPS trace: winding direction and aspect ratio both
 * matched, confirming a plain rotation aligns the two — no mirroring
 * needed, so the existing calibration tool (rotation/position/scale) keeps
 * working unchanged against maps generated this way. */
export function parseMasWaypoints(text: string): RawWaypoint[] {
  const startIndices: number[] = [];
  const posMarker = /wp_pos=/g;
  let m: RegExpExecArray | null;
  while ((m = posMarker.exec(text))) startIndices.push(m.index);

  const track: RawWaypoint[] = [];
  for (let i = 0; i < startIndices.length; i++) {
    const block = text.slice(startIndices[i], i + 1 < startIndices.length ? startIndices[i + 1] : text.length);
    const pos = block.match(WP_POS_RE);
    const perp = block.match(WP_PERP_RE);
    const branch = block.match(WP_BRANCH_RE);
    const width = block.match(WP_WIDTH_RE);
    if (!pos || !perp || !branch || !width || Number(branch[1]) !== 0) continue;
    track.push({
      pos: [Number(pos[1]), Number(pos[2]), Number(pos[3])],
      perp: [Number(perp[1]), Number(perp[2]), Number(perp[3])],
      widthLeft: Number(width[1]),
      widthRight: Number(width[2]),
    });
  }
  return track;
}

type Point = [number, number];

function toMapPoint(x: number, z: number): Point {
  return [x, -z];
}

/** A waypoint's road edge, offset from its centerline position along its
 * own lateral (perpendicular) direction — computed in world space first,
 * then projected, so it's the exact same (x, -z) mapping as the centerline
 * itself, just applied to an offset point instead of the raw position. */
function edgePoint(w: RawWaypoint, offset: number): Point {
  const [px, , pz] = w.perp;
  return toMapPoint(w.pos[0] + px * offset, w.pos[2] + pz * offset);
}

function centerPoint(w: RawWaypoint): Point {
  return toMapPoint(w.pos[0], w.pos[2]);
}

function closedPathData(points: Point[]): string {
  const [fx, fy] = points[0];
  const rest = points
    .slice(1)
    .map(([x, y]) => `L ${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ');
  return `M ${fx.toFixed(2)} ${fy.toFixed(2)} ${rest} Z`;
}

const PADDING_RATIO = 0.03;
const CENTERLINE_WIDTH_RATIO = 0.003;
const CENTERLINE_OUTLINE_EXTRA_RATIO = 0.002;
// The real road width (wp_width) varies enough along a lap — pit entries,
// runoff, curbs — that filling the true left/right edges reads as bumpy and
// inconsistent rather than like a clean track outline. 'band' instead
// thickens the centerline itself by a fixed amount, uniform for the whole
// lap, which looks like a proper road without chasing every real width
// fluctuation.
const THICK_CENTERLINE_WIDTH_RATIO = 0.01;
const THICK_CENTERLINE_OUTLINE_EXTRA_RATIO = 0.006;

/** Renders the parsed waypoints as a map image — either the true road-width
 * ribbon ('band', filled white with a thin black border on both edges — the
 * left and right edges are each their own closed contour, and putting both
 * in one <path> with fill-rule="evenodd" fills exactly the ring between
 * them, the standard "donut" SVG technique) or just the two edge lines plus
 * a thin centerline ('edges', no fill). Either way it's the same flat
 * white/black-outline look every uploaded map is expected to have. */
export function generateTrackMapSvg(track: RawWaypoint[], style: MapStyle = 'band'): string {
  if (track.length < 3) throw new Error('NO_TRACK_WAYPOINTS');

  const left = track.map((w) => edgePoint(w, w.widthLeft));
  const right = track.map((w) => edgePoint(w, -w.widthRight));
  const allPoints = [...left, ...right];
  const xs = allPoints.map(([x]) => x);
  const ys = allPoints.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX || 1;
  const height = maxY - minY || 1;
  const minSpan = Math.min(width, height);
  const pad = Math.max(minSpan * PADDING_RATIO, 5);

  const viewMinX = minX - pad;
  const viewMinY = minY - pad;
  const viewWidth = width + pad * 2;
  const viewHeight = height + pad * 2;

  const parts: string[] = [];

  if (style === 'band') {
    const lineWidth = minSpan * THICK_CENTERLINE_WIDTH_RATIO;
    const outlineWidth = lineWidth + minSpan * THICK_CENTERLINE_OUTLINE_EXTRA_RATIO * 2;
    const centerPath = closedPathData(track.map(centerPoint));
    parts.push(`<path d="${centerPath}" fill="none" stroke="#000000" stroke-width="${outlineWidth.toFixed(2)}" stroke-linejoin="round" />`);
    parts.push(`<path d="${centerPath}" fill="none" stroke="#ffffff" stroke-width="${lineWidth.toFixed(2)}" stroke-linejoin="round" />`);
  } else {
    const lineWidth = minSpan * CENTERLINE_WIDTH_RATIO;
    const outlineWidth = lineWidth + minSpan * CENTERLINE_OUTLINE_EXTRA_RATIO * 2;
    for (const pts of [left, right]) {
      parts.push(`<path d="${closedPathData(pts)}" fill="none" stroke="#000000" stroke-width="${outlineWidth.toFixed(2)}" stroke-linejoin="round" />`);
    }
    for (const pts of [left, right]) {
      parts.push(`<path d="${closedPathData(pts)}" fill="none" stroke="#ffffff" stroke-width="${lineWidth.toFixed(2)}" stroke-linejoin="round" />`);
    }
    const centerPath = closedPathData(track.map(centerPoint));
    parts.push(`<path d="${centerPath}" fill="none" stroke="#000000" stroke-width="${(outlineWidth * 0.6).toFixed(2)}" stroke-linejoin="round" />`);
    parts.push(`<path d="${centerPath}" fill="none" stroke="#ffffff" stroke-width="${(lineWidth * 0.6).toFixed(2)}" stroke-linejoin="round" />`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewMinX.toFixed(2)} ${viewMinY.toFixed(2)} ${viewWidth.toFixed(2)} ${viewHeight.toFixed(2)}" width="${viewWidth.toFixed(0)}" height="${viewHeight.toFixed(0)}">
${parts.join('\n')}
</svg>
`;
}

/** End-to-end: raw uploaded .mas file bytes -> ready-to-serve SVG string. */
export function buildTrackMapSvgFromMas(masBuffer: Buffer, style: MapStyle = 'band'): string {
  const decompressed = extractMasContent(masBuffer);
  const track = parseMasWaypoints(decompressed.toString('utf8'));
  return generateTrackMapSvg(track, style);
}
