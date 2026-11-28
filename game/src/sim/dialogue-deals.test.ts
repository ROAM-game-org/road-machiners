import { describe, expect, it } from 'vitest';
import { TOPICS, type LineId } from '../data/dialogue';
import { ESCORT_JOB } from '../data/market';
import { NPCS } from '../data/npcs';
import { URGENT_TOPICS } from '../data/personalities';
import { getResources } from './resources';
import { callVehicle, currentLine, currentOptions } from './dialogue';
import { holdEscort, heldEscort, postEscortOffer, type EscortContract } from './escort-job';
import { guardFee, hireGuard } from './hire';
import { addGoods } from './inventory';
import { acceptContract, siteOf } from './market';
import { sitePads } from './sites';
import { addVehicle, emptyWorld, npcBrain } from './testkit';
import { CONDITION } from '../data/wear';
import { playerVehicle } from './damage';
import { mountedParts } from './grid';
import { hitchNpc } from './tow';
import type { NpcActivity, Vehicle, World } from './types';
import { refreshVision } from './vision';

const BOWL = siteOf('bowl');
const NOSE = siteOf('nose');

function rootLines(w: World): LineId[] {
  return currentOptions(w).map((o) => o.line);
}

function escortCase(): { w: World; trader: Vehicle; stranger: Vehicle } {
  const pad = sitePads(BOWL)[0];
  const w = emptyWorld(pad);
  const pos = { x: pad.x + 20, y: pad.y };
  const trader = addVehicle(w, 'independent', 'hauler', ['stockEngine'], pos);
  trader.brain = npcBrain('trader', pos, ['trader']);
  const sell: NpcActivity = { kind: 'sell', targetId: 'nose', destination: { ...NOSE.pos }, phase: 'travel', reason: 'deliverCargo', shipment: { good: 'fuelDrums', from: 'bowl', to: 'nose' } };
  const wait: NpcActivity = { kind: 'wait', targetId: null, destination: null, phase: 'act', reason: 'awaitEscort', until: ESCORT_JOB.postTurns };
  trader.brain.goals = [sell, wait];
  addGoods(w, trader, 'fuelDrums', 3);
  postEscortOffer(w, trader, 'bowl', 'nose');
  const stranger = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: pad.x - 20, y: pad.y });
  stranger.brain = npcBrain('trader', stranger.pos, ['trader']);
  const offer = w.shops.bowl.contracts.find((c): c is EscortContract => c.kind === 'escort')!;
  const taken = acceptContract(w, offer.id);
  refreshVision(taken);
  return { w: taken, trader, stranger };
}

describe('a call to a driver in a deal with the player', () => {
  it('shows the escort order on the first page and greets the escort', () => {
    const { w, trader } = escortCase();
    const call = callVehicle(w, trader.id);
    expect(rootLines(call)).toContain('waitHereForMe');
    expect(currentLine(call)).toBe('escortedGoAhead');
  });

  it('shows the move-on order once held', () => {
    const { w, trader } = escortCase();
    holdEscort(w, heldEscort(w)!);
    const call = callVehicle(w, trader.id);
    expect(rootLines(call)).toContain('letsMove');
    expect(rootLines(call)).not.toContain('waitHereForMe');
  });

  it('leaves an unrelated trader as it was', () => {
    const { w, stranger } = escortCase();
    const call = callVehicle(w, stranger.id);
    expect(rootLines(call)).not.toContain('waitHereForMe');
    expect(rootLines(call)).not.toContain('letsMove');
    expect(currentLine(call)).toBe('goAhead');
  });

  it('shows the release order and the tow greeting for a driver on the rope', () => {
    const w = emptyWorld(sitePads(BOWL)[0]);
    const npc = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: BOWL.pos.x + 30, y: BOWL.pos.y });
    npc.brain = npcBrain('trader', npc.pos, ['trader']);
    npc.resources!.money = 5000;
    mountedParts(npc, 'engine')[0].hp = 0;
    mountedParts(npc, 'engine')[0].wear = CONDITION.maxWear + 1;
    playerVehicle(w).pos = { x: npc.pos.x - 4, y: npc.pos.y };
    hitchNpc(w, npc, true);
    refreshVision(w);
    const call = callVehicle(w, npc.id);
    expect(rootLines(call)).toContain('iAmLettingYou');
    expect(currentLine(call)).toBe('onYourRopeGoAhead');
  });

  it('shows the dismissal and the guard greeting for the hired guard', () => {
    const w = emptyWorld({ x: 40, y: 40 });
    const merc = addVehicle(w, 'independent', 'scout', ['mg', 'stockEngine'], { x: 46, y: 40 });
    merc.brain = npcBrain('merc', merc.pos, NPCS.merc.traits);
    refreshVision(w);
    const fee = guardFee(w, merc);
    w.player.money = fee + 500;
    hireGuard(w, merc, fee);
    const call = callVehicle(w, merc.id);
    expect(rootLines(call)).toContain('thatsAllRideOff');
    expect(currentLine(call)).toBe('guardListening');
  });

  it('keeps the plight greeting ahead of the deal greeting', () => {
    const { w, trader } = escortCase();
    getResources(w, playerVehicle(w)).fuel = 0;
    const call = callVehicle(w, trader.id);
    expect(currentLine(call)).toBe('youLookStuckNeedPull');
  });
});

describe('the urgent list', () => {
  it('holds every control of a running player deal after the fight and rescue topics', () => {
    const controls = Object.values(TOPICS).filter((t) => t.ask?.when.some((c) => ['escortFollowed', 'escortHeld', 'towedByPlayer', 'guardOfMine'].includes(c))).map((t) => t.id);
    const urgent = URGENT_TOPICS.map((u) => u.topic);
    expect(controls.length).toBe(4);
    for (const id of controls) {
      expect(urgent).toContain(id);
      expect(urgent.indexOf(id)).toBeGreaterThan(urgent.indexOf('payBounty'));
      expect(urgent.indexOf(id)).toBeLessThan(urgent.indexOf('lastSeen'));
    }
  });
});
