import { ECONOMY } from './goods';
import { EFFORT } from './market';

const BASE = {
  reach: 2,
  fishPerTile: 0.5,
  restockShare: 1 / 7,
  sessionTurns: 10,
  fishSupplies: 0.25,
  wageShare: 0.5,
  npcRange: 40,
};

export const FISHING = {
  ...BASE,
  biteChance: (BASE.wageShare * EFFORT.wage[1]) / (BASE.fishSupplies * ECONOMY.supplyPrice.supplies),
};
