import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { fetchSessions, fetchTrackCatalogEntry, updateAdminTrackMapCalibration } from '../api';
import { createServerDataSource } from '../dataSource';
import { drawTrackMap } from '../trackMapDraw';
import type { TrackCatalogEntry } from '../types';
import { t } from '../i18n';

const CANVAS_HEIGHT = 420;
const BOX_PAD = 16;

/** Admin tool for aligning a track's map.png with a real GPS trace — see
 * frontend/src/trackMapDraw.ts for the shared drawing logic (also used
 * read-only by TrackMap.tsx), and backend/src/tracksSchema.sql for why
 * offset/scale are normalized fractions of the trace's bounding box rather
 * than raw pixels. */
export function AdminTrackCalibration() {
  const { slug = '' } = useParams<{ slug: string }>();
  const [entry, setEntry] = useState<TrackCatalogEntry | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [gps, setGps] = useState<{ lat: number[]; lon: number[]; t: number[] } | null>(null);
  const [noSession, setNoSession] = useState(false);
  const [mapImage, setMapImage] = useState<HTMLImageElement | null>(null);

  const [rotationDeg, setRotationDeg] = useState(0);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [scale, setScale] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Mirrors offsetX/offsetY on every render so the mount-only drag effect
  // below can read the latest value at drag start without depending on it
  // (which would force re-attaching the listeners mid-gesture).
  const offsetRef = useRef({ offsetX, offsetY });
  offsetRef.current = { offsetX, offsetY };

  useEffect(() => {
    fetchTrackCatalogEntry(slug)
      .then((e) => {
        setEntry(e);
        setRotationDeg(e.mapRotationDeg);
        setOffsetX(e.mapOffsetX);
        setOffsetY(e.mapOffsetY);
        setScale(e.mapScale);
      })
      .catch(() => setNotFound(true));
  }, [slug]);

  useEffect(() => {
    if (!entry?.mapExt) {
      setMapImage(null);
      return;
    }
    const img = new Image();
    img.onload = () => setMapImage(img);
    img.src = `/api/track-photos/${entry.slug}-map.${entry.mapExt}`;
  }, [entry]);

  // Reference trace: the first session (of any visibility this admin can
  // see) matching the track's catalog name — same free-text match every
  // other track-scoped query in the app already relies on.
  useEffect(() => {
    if (!entry) return;
    let cancelled = false;
    setNoSession(false);
    setGps(null);
    fetchSessions({ track: entry.name })
      .then(async (sessions) => {
        const first = sessions[0];
        if (!first) {
          if (!cancelled) setNoSession(true);
          return;
        }
        const ds = createServerDataSource(first.file);
        const [latS, lonS] = await Promise.all([ds.fetchChannelSeries('GPS Latitude'), ds.fetchChannelSeries('GPS Longitude')]);
        if (cancelled) return;
        setGps({ lat: latS.values.value as number[], lon: lonS.values.value as number[], t: latS.t });
      })
      .catch(() => {
        if (!cancelled) setNoSession(true);
      });
    return () => {
      cancelled = true;
    };
  }, [entry]);

  // Redraws on every visual change — a single canvas draw is cheap enough to
  // just re-run from scratch rather than diffing.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !gps) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const width = canvas.clientWidth;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = CANVAS_HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawTrackMap(ctx, {
      width,
      height: CANVAS_HEIGHT,
      lat: gps.lat,
      lon: gps.lon,
      t: gps.t,
      cursorT: null,
      viewRange: null,
      mapImage,
      mapCalibration: { rotationDeg, offsetX, offsetY, scale },
    });
  }, [gps, mapImage, rotationDeg, offsetX, offsetY, scale]);

  // Drag-to-position — set up once (mount-only deps), same document-level
  // mousemove/mouseup pattern as ChannelPlot.tsx's pan, so the listeners
  // never need to be re-attached mid-drag just because offsetX/Y changed.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let dragStart: { x: number; y: number; offsetX0: number; offsetY0: number } | null = null;

    function onMouseMove(e: MouseEvent) {
      if (!dragStart || !canvas) return;
      const boxWidth = canvas.clientWidth - 2 * BOX_PAD;
      const boxHeight = CANVAS_HEIGHT - 2 * BOX_PAD;
      setOffsetX(dragStart.offsetX0 + (e.clientX - dragStart.x) / boxWidth);
      setOffsetY(dragStart.offsetY0 + (e.clientY - dragStart.y) / boxHeight);
    }
    function onMouseUp() {
      dragStart = null;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }
    function onMouseDown(e: MouseEvent) {
      dragStart = { x: e.clientX, y: e.clientY, offsetX0: offsetRef.current.offsetX, offsetY0: offsetRef.current.offsetY };
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    }
    canvas.addEventListener('mousedown', onMouseDown);
    return () => {
      canvas.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await updateAdminTrackMapCalibration(slug, { rotationDeg, offsetX, offsetY, scale });
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (notFound) {
    return (
      <div className="page-shell">
        <div className="social-empty">{t('track.notFound')}</div>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="page-loading">
        <span className="spinner" />
      </div>
    );
  }

  return (
    <div className="page-shell">
      <Link to="/admin/content/tracks" className="admin-back-link">
        {t('admin.backToAdmin')}
      </Link>
      <div className="auth-heading">
        <h1>{t('adminTrackCalibration.title')}</h1>
        <p>{entry.name}</p>
      </div>

      {!entry.mapExt ? (
        <div className="social-empty">{t('adminTrackCalibration.noMap')}</div>
      ) : noSession ? (
        <div className="social-empty">{t('adminTrackCalibration.noSession')}</div>
      ) : (
        <>
          <p className="field-hint">{t('adminTrackCalibration.dragHint')}</p>
          <div className="track-map">
            <canvas ref={canvasRef} style={{ width: '100%', height: CANVAS_HEIGHT, cursor: gps ? 'move' : 'default' }} />
          </div>

          <div className="field">
            <strong>
              {t('adminTrackCalibration.rotation')} ({rotationDeg.toFixed(0)}°)
            </strong>
            <input type="range" min={-180} max={180} step={1} value={rotationDeg} onChange={(e) => setRotationDeg(Number(e.target.value))} />
          </div>
          <div className="field">
            <strong>
              {t('adminTrackCalibration.scale')} ({scale.toFixed(2)}×)
            </strong>
            <input type="range" min={0.2} max={3} step={0.01} value={scale} onChange={(e) => setScale(Number(e.target.value))} />
          </div>

          {error && <div className="auth-error">{error}</div>}
          <button className="auth-submit" disabled={saving} onClick={handleSave}>
            {saving ? t('adminTrackCalibration.saving') : t('adminTrackCalibration.save')}
          </button>
          {saved && !saving && <p className="field-hint">{t('adminTrackCalibration.saved')}</p>}
        </>
      )}
    </div>
  );
}
