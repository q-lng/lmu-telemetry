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
  /** Lateral offset from centerline for the "FASTEST" named AI path (see
   * [Features]'s definepath=FASTEST/pathtime) — the game's own ideal/fastest
   * racing line, distinct from LEFT/RIGHT/BLOCK/FAST_ALT. */
  fastestOffset: number;
}

const WP_POS_RE = /wp_pos=\(([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)/;
const WP_PERP_RE = /wp_perp=\(([-\d.]+),\s*([-\d.]+),\s*([-\d.]+)\)/;
const WP_BRANCH_RE = /wp_branchID=\((\d+)\)/;
const WP_WIDTH_RE = /wp_width=\(([-\d.]+),\s*([-\d.]+),/;
const WP_FASTEST_RE = /wp_pathinfo2=\(0,\s*([-\d.]+),/;

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
 * distances to derive the actual track edges for the 'edges' map style, and
 * with wp_pathinfo2's FASTEST-path offset for the separate ideal-line
 * overlay (see generateIdealLineSvg).
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
    const fastest = block.match(WP_FASTEST_RE);
    track.push({
      pos: [Number(pos[1]), Number(pos[2]), Number(pos[3])],
      perp: [Number(perp[1]), Number(perp[2]), Number(perp[3])],
      widthLeft: Number(width[1]),
      widthRight: Number(width[2]),
      fastestOffset: fastest ? Number(fastest[1]) : 0,
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

interface ViewBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
  minSpan: number;
}

/** Shared by generateTrackMapSvg and generateIdealLineSvg so both SVGs
 * generated from the same .mas upload share the exact same viewBox — the
 * ideal-line overlay is drawn using the map's own calibration (rotation/
 * position/scale) rather than having its own, so the two need to be
 * pixel-for-pixel co-registered rather than merely close. */
function computeViewBox(track: RawWaypoint[]): ViewBox {
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
  return { minX: minX - pad, minY: minY - pad, width: width + pad * 2, height: height + pad * 2, minSpan };
}

function svgTag(viewBox: ViewBox, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox.minX.toFixed(2)} ${viewBox.minY.toFixed(2)} ${viewBox.width.toFixed(2)} ${viewBox.height.toFixed(2)}" width="${viewBox.width.toFixed(0)}" height="${viewBox.height.toFixed(0)}">
${body}
</svg>
`;
}

const CENTERLINE_WIDTH_RATIO = 0.003;
const CENTERLINE_OUTLINE_EXTRA_RATIO = 0.002;
// The real road width (wp_width) varies enough along a lap — pit entries,
// runoff, curbs — that filling the true left/right edges reads as bumpy and
// inconsistent rather than like a clean track outline. 'band' instead
// thickens the centerline itself by a fixed amount, uniform for the whole
// lap, which looks like a proper road without chasing every real width
// fluctuation.
const THICK_CENTERLINE_WIDTH_RATIO = 0.018;
const THICK_CENTERLINE_OUTLINE_EXTRA_RATIO = 0.008;

/** Renders the parsed waypoints as a map image — either a thick uniform
 * centerline stroke ('band', the default — real per-point wp_width reads as
 * bumpy/inconsistent, so this is a fixed thickness instead) or the true
 * left/right edges plus a thin centerline ('edges', no fill). Either way
 * it's the same flat white/black-outline look every uploaded map is
 * expected to have. */
export function generateTrackMapSvg(track: RawWaypoint[], style: MapStyle = 'band'): string {
  if (track.length < 3) throw new Error('NO_TRACK_WAYPOINTS');
  const viewBox = computeViewBox(track);
  const { minSpan } = viewBox;
  const parts: string[] = [];

  if (style === 'band') {
    const lineWidth = minSpan * THICK_CENTERLINE_WIDTH_RATIO;
    const outlineWidth = lineWidth + minSpan * THICK_CENTERLINE_OUTLINE_EXTRA_RATIO * 2;
    const centerPath = closedPathData(track.map(centerPoint));
    parts.push(`<path d="${centerPath}" fill="none" stroke="#000000" stroke-width="${outlineWidth.toFixed(2)}" stroke-linejoin="round" />`);
    parts.push(`<path d="${centerPath}" fill="none" stroke="#ffffff" stroke-width="${lineWidth.toFixed(2)}" stroke-linejoin="round" />`);
  } else {
    const left = track.map((w) => edgePoint(w, w.widthLeft));
    const right = track.map((w) => edgePoint(w, -w.widthRight));
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

  return svgTag(viewBox, parts.join('\n'));
}

/** End-to-end: raw uploaded .mas file bytes -> ready-to-serve SVG string. */
export function buildTrackMapSvgFromMas(masBuffer: Buffer, style: MapStyle = 'band'): string {
  const decompressed = extractMasContent(masBuffer);
  const track = parseMasWaypoints(decompressed.toString('utf8'));
  return generateTrackMapSvg(track, style);
}

export const DEFAULT_IDEAL_LINE_COLOR = '#ff6d00';
const IDEAL_LINE_WIDTH_RATIO = 0.004;
const IDEAL_LINE_STROKE_RE = /stroke="(#[0-9a-fA-F]{3,8})"/;
const IDEAL_LINE_STROKE_WIDTH_RE = /stroke-width="([\d.]+)"/;

/** The game's own ideal/fastest racing line (the "FASTEST" named AI path),
 * as a standalone SVG — kept separate from the map itself so it can be
 * toggled and recolored independently. Uses the exact same viewBox as
 * generateTrackMapSvg's output for the same track, so it can be drawn with
 * the map's own calibration transform (see trackMapDraw.ts) rather than
 * needing its own rotation/position/scale. */
export function generateIdealLineSvg(track: RawWaypoint[], color: string = DEFAULT_IDEAL_LINE_COLOR): string {
  if (track.length < 3) throw new Error('NO_TRACK_WAYPOINTS');
  const viewBox = computeViewBox(track);
  const lineWidth = viewBox.minSpan * IDEAL_LINE_WIDTH_RATIO;
  const path = closedPathData(track.map((w) => edgePoint(w, w.fastestOffset)));
  return svgTag(viewBox, `<path d="${path}" fill="none" stroke="${color}" stroke-width="${lineWidth.toFixed(2)}" stroke-linejoin="round" />`);
}

/** Reads back the color an ideal-line SVG (as generated above) was last
 * saved with — so the backend doesn't need a separate DB column just to
 * track it, and the frontend can show the current color in its picker. */
export function extractIdealLineColor(svg: string): string | null {
  return svg.match(IDEAL_LINE_STROKE_RE)?.[1] ?? null;
}

/** Swaps an ideal-line SVG's stroke color without needing the original .mas
 * geometry again — there's exactly one colored stroke in the file. */
export function recolorIdealLineSvg(svg: string, color: string): string {
  return svg.replace(IDEAL_LINE_STROKE_RE, `stroke="${color}"`);
}

/** Reads back the stroke width an ideal-line SVG was last saved with — same
 * derive-from-file approach as the color, no separate DB column needed. The
 * admin can adjust this directly (a slider, not a fixed ratio) since the
 * "right" width to actually see the line clearly varies enough per track
 * that no single ratio-of-track-span looked right for every one of them. */
export function extractIdealLineWidth(svg: string): number | null {
  const match = svg.match(IDEAL_LINE_STROKE_WIDTH_RE);
  return match ? Number(match[1]) : null;
}

/** Resizes an ideal-line SVG's stroke width in place — same rationale as
 * recolorIdealLineSvg, just the other adjustable attribute. */
export function resizeIdealLineSvg(svg: string, width: number): string {
  return svg.replace(IDEAL_LINE_STROKE_WIDTH_RE, `stroke-width="${width}"`);
}
