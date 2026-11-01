import { describe, expect, it } from 'vitest';
import { NPCS } from '../../data/npcs';
import { addVehicle, emptyWorld, npcBrain } from '../testkit';
import type { World } from '../types';
import { update } from '../world';
import { npcLedger } from './npc-ledger';
import { recordTurns } from './record-node';

const RECONCILED_RUN = 64;
const RUN_TIMEOUT = 360_000;

function worldWithTrader(): World {
  const w = emptyWorld({ x: 30, y: 30 });
  const npc = addVehicle(w, 'independent', 'hauler', ['stockEngine'], { x: 40, y: 40 });
  npc.brain = npcBrain('trader', npc.pos, NPCS.trader.traits);
  return w;
}

describe('npcLedger', () => {
  it('books a named shop flow by its kind', () => {
    const before = worldWithTrader();
    const npc = before.vehicles[1];
    const next = update(before, (w) => {
      w.vehicles[1].resources!.money -= 300;
    });

    const ledger = npcLedger(before, next, [{ t: 'shopMoney', vehicle: npc.id, amount: -300, kind: 'fuel' }]);

    expect(ledger).toEqual({ [npc.id]: { fuel: -300 } });
  });

  it('throws on an NPC money change no event explains', () => {
    const before = worldWithTrader();
    const npc = before.vehicles[1];
    const next = update(before, (w) => {
      w.vehicles[1].resources!.money += 500;
    });

    expect(() => npcLedger(before, next, [])).toThrow(`${npc.id} moved 500 money but its events explain 0`);
  });

  it('reconciles every NPC through a recorded run', () => {
    const booked = new Set<string>();
    for (const step of recordTurns(1, 'trader', RECONCILED_RUN)) for (const row of Object.values(step.npcMoney)) for (const kind of Object.keys(row)) booked.add(kind);

    expect(booked.size).toBeGreaterThan(0);
  }, RUN_TIMEOUT);
});
