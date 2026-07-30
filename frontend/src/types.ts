export interface SessionSummary {
  file: string;
  track?: string;
  sessionType?: string;
  driverName?: string;
  carName?: string;
  recordingTime?: string;
}

export interface SessionMetadata {
  info: Record<string, string>;
  carSetup: unknown;
}

export type ChannelKind = 'continuous' | 'event';

export interface ChannelDescriptor {
  name: string;
  kind: ChannelKind;
  unit: string;
  frequency?: number;
  valueColumns: string[];
}

export interface ChannelSeries {
  name: string;
  kind: ChannelKind;
  unit: string;
  frequency?: number;
  valueColumns: string[];
  t: number[];
  values: Record<string, (number | boolean | null)[]>;
}

export interface LapInfo {
  lap: number;
  startTs: number;
  endTs: number;
  lapTime: number | null;
  elapsedTime: number;
}

export interface ColumnStyle {
  label: string;
  color: string;
  dash?: number[];
}

export interface CompareSeries {
  t: number[]; // same grid as the lane's primary series.t
  values: Record<string, (number | null)[]>;
}

export interface Lane {
  key: string; // stable identity (React key, height persistence) — may be an opaque group id
  label: string; // human-readable name shown in the chart
  series: ChannelSeries;
  columnStyles: ColumnStyle[]; // same order/length as series.valueColumns
  compare?: CompareSeries | null; // only meaningful when series.valueColumns.length === 1
}
