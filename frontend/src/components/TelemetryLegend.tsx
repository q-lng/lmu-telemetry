import type { Lane } from '../types';
import { nearestValue } from '../nearest';
import { t } from '../i18n';

interface ComparedLapColumn {
  id: string;
  label: string;
  color: string;
}

interface Props {
  lanes: Lane[];
  cursorT: number | null;
  comparedLapColumns: ComparedLapColumn[];
}

// Beyond this many compared-lap columns, the table stops fitting sensibly no
// matter how narrow each column gets — cap it and say how many are hidden
// (still fully visible in the graphs themselves) rather than degrading silently.
const MAX_LEGEND_LAP_COLUMNS = 3;

function formatValue(v: number | boolean | null): string {
  if (v === null || v === undefined) return '–';
  if (typeof v === 'boolean') return v ? t('telemetryLegend.on') : t('telemetryLegend.off');
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

function formatDelta(v: number): string {
  const sign = v >= 0 ? '+' : '-';
  const abs = Math.abs(v);
  return `${sign}${Number.isInteger(abs) ? String(abs) : abs.toFixed(2)}`;
}

interface Row {
  key: string;
  label: string;
  color: string;
  dashed: boolean;
  unit: string;
  referenceValue: number | boolean | null;
  // keyed by ComparedLapColumn.id — absent when this channel has no data for that lap
  compares: Record<string, { value: number | boolean | null; delta: string | null }>;
}

export function TelemetryLegend({ lanes, cursorT, comparedLapColumns }: Props) {
  const rows: Row[] = lanes.flatMap((lane) =>
    lane.series.valueColumns.map((col, i) => {
      const referenceValue = nearestValue(lane.series.t, lane.series.values[col], cursorT);
      const compares: Row['compares'] = {};
      lane.compares.forEach((cmp) => {
        const compareValues = cmp.series.values[col];
        if (!compareValues) return;
        const compareValue = nearestValue(cmp.series.t, compareValues, cursorT);
        const delta =
          typeof compareValue === 'number' && typeof referenceValue === 'number'
            ? formatDelta(compareValue - referenceValue)
            : null;
        compares[cmp.id] = { value: compareValue, delta };
      });
      return {
        key: `${lane.key}__${col}`,
        label: lane.columnStyles[i].label,
        color: lane.columnStyles[i].color,
        dashed: !!lane.columnStyles[i].dash,
        unit: lane.series.unit,
        referenceValue,
        compares,
      };
    }),
  );

  if (rows.length === 0) {
    return (
      <div className="telemetry-legend">
        <div className="legend-empty">{t('telemetryLegend.selectChannelsHint')}</div>
      </div>
    );
  }

  const shownColumns = comparedLapColumns.slice(0, MAX_LEGEND_LAP_COLUMNS);
  const hiddenCount = comparedLapColumns.length - shownColumns.length;
  const otherColumnWidth = 68 / (1 + shownColumns.length);

  return (
    <div className="telemetry-legend">
      <table className="telemetry-legend-table">
        <colgroup>
          <col style={{ width: '32%' }} />
          <col style={{ width: `${otherColumnWidth}%` }} />
          {shownColumns.map((col) => (
            <col key={col.id} style={{ width: `${otherColumnWidth}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th>{t('telemetryLegend.channel')}</th>
            <th>{t('telemetryLegend.reference')}</th>
            {shownColumns.map((col) => (
              <th key={col.id} style={{ color: col.color }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="legend-channel-cell" title={r.label}>
                <span className={`legend-swatch${r.dashed ? ' dashed' : ''}`} style={{ borderColor: r.color }} />
                <span className="legend-channel-name">{r.label}</span>
              </td>
              <td className="legend-value-cell">
                <span className="legend-value-line">
                  {formatValue(r.referenceValue)} <span className="legend-unit">{r.unit}</span>
                </span>
              </td>
              {shownColumns.map((col) => {
                const entry = r.compares[col.id];
                return (
                  <td key={col.id} className="legend-value-cell">
                    <span className="legend-value-line">{entry ? formatValue(entry.value) : '–'}</span>
                    {/* Always rendered (even blank) so a row's height never changes as
                        delta becomes computable/not while scrubbing the cursor — a
                        conditionally-rendered line was making the whole table jump. */}
                    <span className="legend-delta">{entry?.delta ? `Δ ${entry.delta}` : ' '}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {hiddenCount > 0 && (
        <div className="legend-overflow-hint">{t('telemetryLegend.moreLapsHidden', { count: hiddenCount })}</div>
      )}
    </div>
  );
}
