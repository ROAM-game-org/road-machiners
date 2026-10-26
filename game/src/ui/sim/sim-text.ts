import { isKnockedOut } from '../../sim/defeat';
import { topGoal } from '../../sim/npc-activities';
import type { SimText } from '../../sim/progression/sim-mode';
import type { Vehicle, World } from '../../sim/types';
import { t, type Msg } from '../../text/msg';
import { goalText, vehicleTitle } from '../../text/names';
import { resolve } from '../../text/resolve';
import { eventText, formatVehicleState, jobLabel, type LogLine } from '../format';
import { fuelLiters, kph, moneyMsg } from '../units';

const english = (msg: Msg): string => resolve(msg, 'en');

function seeingAll(world: World): World {
  return { ...world, player: { ...world.player, fullLog: true } };
}

function lineText(line: LogLine): string {
  return [line.text, ...(line.spans ?? []).map((s) => s.text)].map(english).join(' ');
}

function doingOf(world: World, v: Vehicle): Msg {
  if (v.job) return jobLabel(world, v, v.job);
  if (isKnockedOut(v)) return t('npc.knockedOut');
  const goal = v.brain ? topGoal(v) : null;
  return goal ? goalText(goal.reason) : formatVehicleState(world, v);
}

export const SIM_TEXT: SimText = {
  event(world, e) {
    const line = eventText(seeingAll(world), e);
    return line ? { text: lineText(line), tone: line.cls } : null;
  },
  truck: (world, v) => english(vehicleTitle(world, v)),
  doing: (world, v) => english(doingOf(world, v)),
  money: (cents) => english(moneyMsg(cents)),
  fuel: (units) => `${fuelLiters(units)} L`,
  speed: (tilesPerTurn) => `${kph(tilesPerTurn)} km/h`,
};
