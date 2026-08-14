import type { LeaderboardClass } from './types';
import type { BadgeTone } from './components/Badge';

export const LEADERBOARD_CLASS_ORDER: LeaderboardClass[] = ['hypercar', 'lmp2', 'lmp3', 'gt3', 'gte', 'unknown'];

export const LEADERBOARD_CLASS_LABELS: Record<LeaderboardClass, string> = {
  hypercar: 'Hypercar',
  lmp2: 'LMP2',
  lmp3: 'LMP3',
  gte: 'LMGTE',
  gt3: 'LMGT3',
  unknown: 'Unknown',
};

export const LEADERBOARD_CLASS_TONES: Record<LeaderboardClass, BadgeTone> = {
  hypercar: 'red',
  lmp2: 'blue-dark',
  lmp3: 'purple',
  gte: 'yellow',
  gt3: 'green-dark',
  unknown: 'neutral',
};
