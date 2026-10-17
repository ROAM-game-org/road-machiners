import { ECONOMY } from './goods';
import { EFFORT } from './market';
import { TIME } from './time';

const BASE = {
  reach: 2,
  fishPerTile: 0.5,
  restockShare: 1 / 7,
  sessionTurns: 10,
  fishSupplies: 0.25,
  wageShare: 0.5,
  npcRange: 40,
  fishedOutTurns: TIME.turnsPerDay,
};

export const FISHING = {
  ...BASE,
  biteChance: (BASE.wageShare * EFFORT.wage[1]) / (BASE.fishSupplies * ECONOMY.supplyPrice.supplies),
};
