import { nearestIndex } from './nearest';

/** The trace is always centered in the canvas; the map image's position/scale
 * are admin-adjustable *relative to that center* (as normalized fractions of
 * the trace's own bounding box, not raw pixels) since the image's own crop
 * rarely centers the track exactly the same way the trace's bounding box
 * does — see backend/src/tracksSchema.sql. */
export interface MapCalibration {
  rotationDeg: number;
  offsetX: number;
  offsetY: number;
  scale: number;
}

/** A compared lap's own GPS trace, drawn in the same color it already uses
 * in the legend/graphs (see TelemetryViewer's comparedLapColorAt) — shape
 * only, no cursor dot or zoom-highlight (those stay primary-trace-only). */
export interface ExtraTrace {
  id: string;
  color: string;
  lat: number[];
  lon: number[];
}

export interface DrawTrackMapOptions {
  width: number;
  height: number;
  lat: number[];
  lon: number[];
  t: number[];
  cursorT: number | null;
  /** Current zoomed-in x-window (same unit as `t`) — the matching stretch of
   * the path is highlighted so you can see which part of the circuit the
   * graphs are currently focused on. Null / spanning the full range = no
   * highlight. */
  viewRange: { min: number; max: number } | null;
  mapImage?: HTMLImageElement | null;
  mapCalibration?: MapCalibration | null;
  /** The game's own ideal/fastest racing line, generated alongside the map
   * from the same .mas upload (see backend/src/masTrack.ts) — a separate,
   * independently toggleable/recolorable file, but drawn with the *same*
   * mapCalibration transform as mapImage since both share the exact same
   * viewBox and are meant to be pixel-for-pixel co-registered, not
   * independently aligned. */
  idealLineImage?: HTMLImageElement | null;
  /** Other laps currently being compared (see TelemetryViewer's
   * comparedLaps) — each drawn in its own color, sharing the same bounding
   * box/scale as the primary trace so they're all on one consistent map. */
  extraTraces?: ExtraTrace[];
  /** The primary/reference lap's own trace color — defaults to the
   * long-standing fixed blue when omitted (SharedLap.tsx has no per-lap
   * color concept to pass here). TelemetryViewer.tsx passes its reference
   * lap's actual color (REFERENCE_UNIFORM_COLOR / the user's preference)
   * so this trace matches the same identity compared laps already do. */
  traceColor?: string;
}

/** Loop-based instead of Math.min/max(...arr) — safe for the combined size
 * of several laps' GPS arrays, where spreading into a function call risks
 * blowing the engine's argument-count limit. */
function minMax(arrays: number[][]): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const arr of arrays) {
    for (const v of arr) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return [min, max];
}

/** Draws a session's GPS trace onto a 2D canvas context — optionally with the
 * track's official map image as a calibrated background layer underneath.
 * Pure function (no DOM/React state) so both the read-only TrackMap.tsx and
 * the interactive AdminTrackCalibration.tsx share the exact same drawing
 * logic instead of maintaining two copies. */
export function drawTrackMap(ctx: CanvasRenderingContext2D, opts: DrawTrackMapOptions): void {
  const { width, height, lat, lon, t, cursorT, viewRange, mapImage, mapCalibration, idealLineImage, extraTraces, traceColor = '#3987e5' } = opts;
  if (lat.length === 0) return;

  // Union with any compared laps' traces so the bounding box/scale fits all
  // of them, not just the primary one.
  const [minLat, maxLat] = minMax([lat, ...(extraTraces?.map((tr) => tr.lat) ?? [])]);
  const [minLon, maxLon] = minMax([lon, ...(extraTraces?.map((tr) => tr.lon) ?? [])]);
  const pad = 16;
  const spanLat = maxLat - minLat || 1;
  const spanLon = maxLon - minLon || 1;
  // A degree of longitude is only the same physical distance as a degree of
  // latitude at the equator — it shrinks by cos(latitude) elsewhere. Without
  // this, a track's shape reads flattened/stretched depending on the
  // circuit's real-world latitude (e.g. very noticeable at Spa, ~50°N).
  const lonCorrection = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);
  const spanLonCorrected = spanLon * lonCorrection || 1;
  const scale = Math.min((width - 2 * pad) / spanLonCorrected, (height - 2 * pad) / spanLat);
  // The trace's own bounding box, in canvas pixels — its aspect ratio is
  // fixed by the track's real shape (cos-corrected), independent of the
  // canvas's own width/height. Calibration (offset/scale below) is expressed
  // as a fraction of *this* box rather than of the full canvas box, so it
  // transfers correctly between canvases of different aspect ratio — e.g.
  // the admin tool's fixed 600x420 reference canvas vs. the telemetry
  // viewer's responsive-width one. Using the canvas box instead made a
  // calibration done in the admin tool land in the wrong place everywhere
  // else, since the two boxes only coincide by accident.
  const traceWidth = spanLonCorrected * scale;
  const traceHeight = spanLat * scale;
  // Center the trace in the canvas rather than anchoring it to the pad — the
  // box the trace fits into isn't necessarily the same aspect ratio as the
  // canvas, so anchoring at (pad, height-pad) left it sitting bottom-left
  // instead of in the middle (very visible once a *centered* map image is
  // drawn behind it and the two don't line up).
  const marginX = (width - traceWidth) / 2;
  const marginY = (height - traceHeight) / 2;

  const toXY = (la: number, lo_: number): [number, number] => {
    const x = marginX + (lo_ - minLon) * lonCorrection * scale;
    const y = height - marginY - (la - minLat) * scale;
    return [x, y];
  };

  ctx.clearRect(0, 0, width, height);

  const hasMapImage = !!mapImage && mapImage.naturalWidth > 0;
  const hasIdealLineImage = !!idealLineImage && idealLineImage.naturalWidth > 0;
  if (mapCalibration && (hasMapImage || hasIdealLineImage)) {
    const boxWidth = traceWidth;
    const boxHeight = traceHeight;
    // Contain-fit the reference image's own aspect ratio within the same box
    // the trace fits into, then apply the admin-calibrated scale on top of
    // that. mapImage is the reference when present (the common case); the
    // ideal line shares its exact viewBox either way, so falling back to its
    // own aspect when there's no map image yet still lines up correctly.
    const referenceImage = hasMapImage ? mapImage! : idealLineImage!;
    const imgAspect = referenceImage.naturalWidth / referenceImage.naturalHeight;
    const boxAspect = boxWidth / boxHeight;
    let drawWidth: number;
    let drawHeight: number;
    if (imgAspect > boxAspect) {
      drawWidth = boxWidth;
      drawHeight = boxWidth / imgAspect;
    } else {
      drawHeight = boxHeight;
      drawWidth = boxHeight * imgAspect;
    }
    drawWidth *= mapCalibration.scale;
    drawHeight *= mapCalibration.scale;
    const centerX = width / 2 + mapCalibration.offsetX * boxWidth;
    const centerY = height / 2 + mapCalibration.offsetY * boxHeight;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate((mapCalibration.rotationDeg * Math.PI) / 180);
    if (hasMapImage) {
      // Kept translucent so the trace on top — the thing that actually
      // matters moment to moment — never has to compete with the background
      // image.
      ctx.globalAlpha = 0.6;
      ctx.drawImage(mapImage!, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    }
    if (hasIdealLineImage) {
      // Full opacity — it's a thin colored line, not a background layer, so
      // it needs to actually stand out rather than blend in.
      ctx.globalAlpha = 1;
      ctx.drawImage(idealLineImage!, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    }
    ctx.restore();
  }

  if (extraTraces) {
    for (const trace of extraTraces) {
      ctx.strokeStyle = trace.color;
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      trace.lat.forEach((la, i) => {
        const [x, y] = toXY(la, trace.lon[i]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  }

  const fullMin = t[0];
  const fullMax = t[t.length - 1];
  const tolerance = (fullMax - fullMin) * 0.005;
  const isZoomed = !!viewRange && (viewRange.min > fullMin + tolerance || viewRange.max < fullMax - tolerance);

  if (isZoomed && viewRange) {
    // Highlights the ROAD itself for the current zoomed-in section — a
    // wide, translucent halo drawn over the map, under the trace — rather
    // than thickening the trace's own line (which used to happen here and
    // read as the trace changing shape/weight instead of a stretch of track
    // being highlighted).
    ctx.strokeStyle = 'rgba(255, 196, 0, 0.35)';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    let haloPenDown = false;
    lat.forEach((la, i) => {
      const inRange = t[i] >= viewRange.min && t[i] <= viewRange.max;
      if (!inRange) {
        haloPenDown = false;
        return;
      }
      const [x, y] = toXY(la, lon[i]);
      if (!haloPenDown) {
        ctx.moveTo(x, y);
        haloPenDown = true;
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
  }

  // The trace itself always stays the same width — when zoomed, the
  // in-range segment keeps full color while the rest dims, so the
  // selection is still legible even without the halo, but nothing about
  // the line's own thickness ever changes. Dimming via globalAlpha rather
  // than baking a fixed blue into an rgba() string, since traceColor is
  // caller-supplied (the reference lap's own color) and can be anything.
  ctx.strokeStyle = traceColor;
  ctx.globalAlpha = isZoomed ? 0.25 : 1;
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  lat.forEach((la, i) => {
    const [x, y] = toXY(la, lon[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.globalAlpha = 1;

  if (isZoomed && viewRange) {
    ctx.strokeStyle = traceColor;
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    let penDown = false;
    lat.forEach((la, i) => {
      const inRange = t[i] >= viewRange.min && t[i] <= viewRange.max;
      if (!inRange) {
        penDown = false;
        return;
      }
      const [x, y] = toXY(la, lon[i]);
      if (!penDown) {
        ctx.moveTo(x, y);
        penDown = true;
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
  }

  if (cursorT !== null && t.length > 0) {
    const idx = nearestIndex(t, cursorT);
    const [x, y] = toXY(lat[idx], lon[idx]);
    // Heading from the trace's own local direction (neighboring points, in
    // already-projected screen space so the cos-latitude correction/scale
    // don't need separate handling) rather than a fixed shape — a thin dart
    // pointing the way the car was actually going, not just a plain dot.
    const beforeIdx = Math.max(0, idx - 1);
    const afterIdx = Math.min(lat.length - 1, idx + 1);
    let dx = 1;
    let dy = 0;
    if (afterIdx !== beforeIdx) {
      const [bx, by] = toXY(lat[beforeIdx], lon[beforeIdx]);
      const [ax, ay] = toXY(lat[afterIdx], lon[afterIdx]);
      const len = Math.hypot(ax - bx, ay - by);
      if (len > 0) {
        dx = (ax - bx) / len;
        dy = (ay - by) / len;
      }
    }
    const perpX = -dy;
    const perpY = dx;
    const length = 9;
    const halfWidth = 2.2;
    const tipX = x + dx * length * 0.6;
    const tipY = y + dy * length * 0.6;
    const backX = x - dx * length * 0.4;
    const backY = y - dy * length * 0.4;
    ctx.fillStyle = traceColor;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(backX + perpX * halfWidth, backY + perpY * halfWidth);
    ctx.lineTo(backX - perpX * halfWidth, backY - perpY * halfWidth);
    ctx.closePath();
    ctx.fill();
  }
}
