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
}

/** Draws a session's GPS trace onto a 2D canvas context — optionally with the
 * track's official map image as a calibrated background layer underneath.
 * Pure function (no DOM/React state) so both the read-only TrackMap.tsx and
 * the interactive AdminTrackCalibration.tsx share the exact same drawing
 * logic instead of maintaining two copies. */
export function drawTrackMap(ctx: CanvasRenderingContext2D, opts: DrawTrackMapOptions): void {
  const { width, height, lat, lon, t, cursorT, viewRange, mapImage, mapCalibration } = opts;
  if (lat.length === 0) return;

  const minLat = Math.min(...lat);
  const maxLat = Math.max(...lat);
  const minLon = Math.min(...lon);
  const maxLon = Math.max(...lon);
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

  if (mapImage && mapCalibration && mapImage.naturalWidth > 0) {
    const boxWidth = traceWidth;
    const boxHeight = traceHeight;
    // Contain-fit the image's own aspect ratio within the same box the trace
    // fits into, then apply the admin-calibrated scale on top of that.
    const imgAspect = mapImage.naturalWidth / mapImage.naturalHeight;
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
    // Kept translucent so the trace on top — the thing that actually matters
    // moment to moment — never has to compete with the background image.
    ctx.globalAlpha = 0.6;
    ctx.drawImage(mapImage, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    ctx.restore();
  }

  const fullMin = t[0];
  const fullMax = t[t.length - 1];
  const tolerance = (fullMax - fullMin) * 0.005;
  const isZoomed = !!viewRange && (viewRange.min > fullMin + tolerance || viewRange.max < fullMax - tolerance);

  ctx.strokeStyle = isZoomed ? 'rgba(57, 135, 229, 0.25)' : '#3987e5';
  ctx.lineWidth = 1;
  ctx.beginPath();
  lat.forEach((la, i) => {
    const [x, y] = toXY(la, lon[i]);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  if (isZoomed && viewRange) {
    ctx.strokeStyle = '#3987e5';
    ctx.lineWidth = 2.5;
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
    ctx.fillStyle = '#d95926';
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}
