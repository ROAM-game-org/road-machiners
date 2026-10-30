import { ECONOMY } from "./goods";
import { EFFORT } from "./market";
import { RULES } from "./rules";
import { TIME } from "./time";

const NET_PER_DAY = 20;
const SHIFT_TURNS = TIME.turnsPerDay / 3;
const FOOD_PER_TURN = RULES.suppliesPerTurn * ECONOMY.supplyPrice.supplies;

export const ODD_JOBS = {
  shiftTurns: SHIFT_TURNS,
  netPerDay: NET_PER_DAY,
  payPerTurn: NET_PER_DAY / TIME.turnsPerDay + FOOD_PER_TURN,
  hireBelow: Math.round(EFFORT.wage[1] * TIME.turnsPerDay),
};
