import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { createSharedLapDataSource } from '../dataSource';
import type { ChannelSeries, Lane, SessionMetadata, TrackCatalogEntry } from '../types';
import { ChannelPlot } from '../components/ChannelPlot';
import { TrackMap } from '../components/TrackMap';
import { TelemetryLegend } from '../components/TelemetryLegend';
import { channelColor } from '../palette';
import { fetchTrackByName } from '../api';
import { t } from '../i18n';

// Fixed default channel set — this is a minimal read-only view for a single shared
// lap, not the full customizable TelemetryViewer (no channel picker/presets/compare).
const DEFAULT_CHANNELS = ['Ground Speed', 'Gear', 'Throttle Pos Unfiltered', 'Brake Pos Unfiltered', 'Steering Pos'];

export function SharedLap() {
  const { file = '', lap = '' } = useParams<{ file: string; lap: string }>();
  const lapNumber = Number(lap);
  const dataSource = useMemo(() => createSharedLapDataSource(file, lapNumber), [file, lapNumber]);

  const [metadata, setMetadata] = useState<SessionMetadata | null>(null);
  const [seriesByName, setSeriesByName] = useState<Record<string, ChannelSeries>>({});
  const [gps, setGps] = useState<{ t: number[]; lat: number[]; lon: number[] } | null>(null);
  const [trackEntry, setTrackEntry] = useState<TrackCatalogEntry | null>(null);
  const [mapImage, setMapImage] = useState<HTMLImageElement | null>(null);
  const [cursorT, setCursorT] = useState<number | null>(null);
  const [cursorLocked, setCursorLocked] = useState(false);
  const [viewRange, setViewRange] = useState<{ min: number; max: number } | null>(null);

  function handleGraphClick(value: number) {
    setCursorLocked((prevLocked) => {
      if (prevLocked) return false;
      setCursorT(value);
      return true;
    });
  }
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    async function run() {
      const laps = await dataSource.fetchLaps();
      const lapInfo = laps[0];
      if (!lapInfo) throw new Error(t('sharedLap.notFound'));
      const offset = lapInfo.startTs;

      const [meta, ...rest] = await Promise.all([
        dataSource.fetchMetadata(),
        ...DEFAULT_CHANNELS.map((name) => dataSource.fetchChannelSeries(name).catch(() => null)),
        dataSource.fetchChannelSeries('GPS Latitude').catch(() => null),
        dataSource.fetchChannelSeries('GPS Longitude').catch(() => null),
      ]);
      if (cancelled) return;

      const channelResults = rest.slice(0, DEFAULT_CHANNELS.length) as (ChannelSeries | null)[];
      const [latS, lonS] = rest.slice(DEFAULT_CHANNELS.length) as (ChannelSeries | null)[];

      const next: Record<string, ChannelSeries> = {};
      channelResults.forEach((s, i) => {
        if (s) next[DEFAULT_CHANNELS[i]] = { ...s, t: s.t.map((x) => x - offset) };
      });
      setSeriesByName(next);
      setMetadata(meta);
      if (latS && lonS) {
        setGps({
          t: latS.t.map((x) => x - offset),
          lat: latS.values.value as number[],
          lon: lonS.values.value as number[],
        });
      }
    }

    run()
      .catch((err) => {
        if (!cancelled) setError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dataSource]);

  // Same track-name → catalog resolution as TelemetryViewer.tsx — no-op,
  // no-regression fallback when the track isn't catalogued or has no map.
  useEffect(() => {
    const trackName = metadata?.info.TrackName;
    setTrackEntry(null);
    setMapImage(null);
    if (!trackName) return;
    let cancelled = false;
    fetchTrackByName(trackName).then((entry) => {
      if (cancelled) return;
      setTrackEntry(entry);
      if (entry?.mapExt) {
        const img = new Image();
        img.onload = () => {
          if (!cancelled) setMapImage(img);
        };
        img.src = `/api/track-photos/${entry.slug}-map.${entry.mapExt}`;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [metadata?.info.TrackName]);

  const lanes: Lane[] = useMemo(() => {
    const result: Lane[] = [];
    const speed = seriesByName['Ground Speed'];
    if (speed) result.push({ key: 'speed', label: 'Ground Speed', series: speed, columnStyles: [{ label: 'Ground Speed', color: channelColor(0) }], compares: [] });

    const gear = seriesByName['Gear'];
    if (gear) result.push({ key: 'gear', label: 'Gear', series: gear, columnStyles: [{ label: 'Gear', color: channelColor(1) }], compares: [] });

    const throttle = seriesByName['Throttle Pos Unfiltered'];
    const brake = seriesByName['Brake Pos Unfiltered'];
    if (throttle && brake) {
      result.push({
        key: 'pedals',
        label: t('tv.defaultGroupPedals'),
        series: {
          ...throttle,
          valueColumns: ['Throttle Pos Unfiltered', 'Brake Pos Unfiltered'],
          values: {
            'Throttle Pos Unfiltered': throttle.values.value,
            'Brake Pos Unfiltered': brake.values.value,
          },
        },
        columnStyles: [
          { label: 'Throttle Pos Unfiltered', color: '#008300' },
          { label: 'Brake Pos Unfiltered', color: '#e66767' },
        ],
        compares: [],
      });
    } else if (throttle) {
      result.push({ key: 'throttle', label: 'Throttle Pos Unfiltered', series: throttle, columnStyles: [{ label: 'Throttle Pos Unfiltered', color: '#008300' }], compares: [] });
    }

    const steering = seriesByName['Steering Pos'];
    if (steering) result.push({ key: 'steering', label: 'Steering Pos', series: steering, columnStyles: [{ label: 'Steering Pos', color: channelColor(2) }], compares: [] });

    return result;
  }, [seriesByName]);

  // Shared X domain from GPS (dense, always fetched) — without this, Gear's own
  // sparse timestamps (which don't span the full lap) would give it a narrower
  // default range than the other lanes, throwing off cursor.sync until a zoom
  // forces every lane back to the identical [min,max]. See TelemetryViewer's
  // xDomain for the full explanation.
  const xDomain = useMemo<[number, number] | null>(() => {
    if (!gps || gps.t.length === 0) return null;
    return [gps.t[0], gps.t[gps.t.length - 1]];
  }, [gps]);

  if (loading) {
    return (
      <div className="page-loading">
        <span className="spinner" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-shell">
        <div className="social-empty">{error}</div>
      </div>
    );
  }

  return (
    <div className="shared-lap-page">
      <div className="shared-lap-header">
        <div>
          <h1>
            {metadata?.info.TrackName ?? file} — {t('lap.number', { n: lapNumber })}
          </h1>
          <p>
            {metadata?.resolvedCar ?? metadata?.info.CarName}
            {metadata?.info.DriverName ? ` · ${metadata.info.DriverName}` : ''}
          </p>
        </div>
        {/* Opens the full session in the main app, but doesn't jump to this
            specific lap yet — TelemetryViewer only reads ?file=, not a lap —
            see the tracked follow-up issue for deep-linking straight to it. */}
        <Link to={`/telemetry?file=${encodeURIComponent(file)}`} className="auth-submit">
          {t('lap.openInApp')}
        </Link>
      </div>

      {gps && (
        <TrackMap
          lat={gps.lat}
          lon={gps.lon}
          t={gps.t}
          cursorT={cursorT}
          viewRange={viewRange}
          height={260}
          mapImage={mapImage}
          mapCalibration={
            trackEntry && { rotationDeg: trackEntry.mapRotationDeg, scale: trackEntry.mapScale }
          }
        />
      )}

      {cursorLocked && (
        <button className="cursor-lock-hint" onClick={() => setCursorLocked(false)}>
          {t('tv.cursorLockedHint')}
        </button>
      )}

      <TelemetryLegend lanes={lanes} cursorT={cursorT} comparedLapColumns={[]} />

      <div className="telemetry-block shared-lap-graphs">
        {lanes.map((lane, i) => (
          <ChannelPlot
            key={lane.key}
            lane={lane}
            syncKey="shared-lap"
            showXAxis={i === lanes.length - 1}
            xAxisMode="time"
            weight={1}
            xDomain={xDomain}
            viewRange={viewRange}
            cursorT={cursorT}
            cursorLocked={cursorLocked}
            onCursorMove={setCursorT}
            onCursorClick={handleGraphClick}
            onViewRangeChange={setViewRange}
          />
        ))}
      </div>
    </div>
  );
}
