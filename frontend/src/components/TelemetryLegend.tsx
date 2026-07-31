import { Fragment } from 'react';
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

  return (
    <div className="telemetry-legend">
      <table className="telemetry-legend-table">
        <thead>
          <tr>
            <th>{t('telemetryLegend.channel')}</th>
            <th>{t('telemetryLegend.reference')}</th>
            {comparedLapColumns.map((col) => (
              <th key={col.id} colSpan={2} style={{ color: col.color }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td className="legend-channel-cell">
                <span className={`legend-swatch${r.dashed ? ' dashed' : ''}`} style={{ borderColor: r.color }} />
                {r.label}
              </td>
              <td className="legend-value-cell">
                {formatValue(r.referenceValue)} <span className="legend-unit">{r.unit}</span>
              </td>
              {comparedLapColumns.map((col) => {
                const entry = r.compares[col.id];
                return (
                  <Fragment key={col.id}>
                    <td className="legend-value-cell">
                      {entry ? (
                        <>
                          {formatValue(entry.value)} <span className="legend-unit">{r.unit}</span>
                        </>
                      ) : (
                        '–'
                      )}
                    </td>
                    <td className="legend-delta-cell" style={{ color: col.color }}>
                      {entry?.delta ?? '–'}
                    </td>
                  </Fragment>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
