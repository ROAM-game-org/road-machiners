import { TIME } from './time';

export const ENCOUNTERS = {
  gapTurns: TIME.turnsPerDay / 3,
  pendingTurns: 10,
  storyGapTurns: TIME.turnsPerDay * 2,
  wrongedTurns: TIME.turnsPerDay * 6,
  tip: { valueShare: 0.1 },
  favorShare: 2,
  favorReserve: 500,
};
