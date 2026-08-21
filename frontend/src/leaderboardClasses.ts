import type { LeaderboardClass } from './types';
import type { BadgeTone } from './components/Badge';

export const LEADERBOARD_CLASS_ORDER: LeaderboardClass[] = [
  'hypercar',
  'lmp2-wec',
  'lmp2-elms',
  'lmp3',
  'gt3',
  'gte',
  'lmp2',
  'unknown',
];

export const LEADERBOARD_CLASS_LABELS: Record<LeaderboardClass, string> = {
  hypercar: 'Hypercar',
  'lmp2-wec': 'LMP2 WEC',
  'lmp2-elms': 'LMP2 ELMS',
  lmp2: 'LMP2',
  lmp3: 'LMP3',
  gte: 'LMGTE',
  gt3: 'LMGT3',
  unknown: 'Unknown',
};

export const LEADERBOARD_CLASS_TONES: Record<LeaderboardClass, BadgeTone> = {
  hypercar: 'red',
  'lmp2-wec': 'blue-dark',
  'lmp2-elms': 'orange',
  // Ambiguous fallback (no catalog match) — same tone as -wec since it's
  // most often that same Oreca hiding behind an unmapped livery.
  lmp2: 'blue-dark',
  lmp3: 'purple',
  gte: 'yellow',
  gt3: 'green-dark',
  unknown: 'neutral',
};
