import { beforeAll, describe, expect, it } from 'vitest';
import { START_KITS } from '../data/start';
import { TEST_MAP } from '../test/map';
import { acceptClaimBid, bidData, canBidFor, claimBidPrice, offerClaimBid, playerBid, refuseClaimBid } from './claim-bid';
import { carriesPart, claimPartHeld, claimTargets } from './claims';
import { playerVehicle } from './damage';
import { makePart } from './factory';
import { stowPart } from './inventory';
import { siteOf } from './market';
import { pushGoal } from './npc-activities';
import { getResources } from './resources';
import { type ClaimContract } from './salvage';
import { defaultSetup } from './settings';
import { sitePads } from './sites';
import { declareFeud, advanceStates, settleStates } from './states';
import { addVehicle, npcBrain } from './testkit';
import type { PartInstance, Vehicle, World } from './types';
import { cloneWorld, newWorld } from './world';
import { partValue } from './wear';
import { loadWorld, saveOf } from '../three/save';
import { memoryBackend, SaveSlots } from '../three/save-db';
import { PARTS } from '../data/parts';

let real: World;

beforeAll(() => {
  real = newWorld(1, START_KITS.standard, TEST_MAP, defaultSetup('roaming'), false);
});

type Setup = { w: World; claim: ClaimContract; rival: Vehicle; me: Vehicle; relic: PartInstance };

function bidWorld(): Setup {
  const w = cloneWorld(real);
  w.vehicles = w.vehicles.filter((v) => v.id === w.player.vehicleId);
  for (const shop of Object.values(w.shops)) Object.assign(shop, { contracts: [], restockAt: 1e9 });
  const { stock } = claimTargets(w, 'bowl')[0];
  const relic = makePart(w, 'relicComputer', 0);
  stock.parts = [];
  stock.hidden.parts = [];
  const claim: ClaimContract = { id: 'ct-claim', shop: 'bowl', kind: 'claim', stockId: stock.id, at: { ...stock.pos }, partId: relic.id, defId: relic.defId, reward: 9, deadline: 5000, window: 5000, tier: PARTS[relic.defId].tier, rivalAt: 50, rival: null, leads: [], };
  w.player.contracts = [claim];
  const me = playerVehicle(w);
  me.pos = { ...sitePads(siteOf('bowl'))[0] };
  me.speed = 0;
  stowPart(w, me, relic);
  const rival = addVehicle(w, 'independent', 'hauler', ['mg', 'stockEngine'], { x: me.pos.x + 1, y: me.pos.y });
  rival.brain = npcBrain('scavenger', rival.pos, ['scavenger']);
  rival.speed = 0;
  claim.rival = rival.id;
  pushGoal(w, rival, { kind: 'claim', claim: claim.id, left: [], targetId: claim.shop, destination: { ...siteOf(claim.shop).pos }, phase: 'travel', reason: 'claimRun' });
  getResources(w, rival).money = 100000;
  return { w, claim, rival, me, relic };
}

function moneyOf(w: World, v: Vehicle): number {
  return getResources(w, v).money;
}

describe('claim bid', () => {
  it('prices the relic at its fair value', () => {
    const { relic } = bidWorld();
    expect(claimBidPrice(relic)).toBeGreaterThan(0);
    expect(claimBidPrice(relic)).toBeLessThanOrEqual(partValue(relic));
  });

  it('is open to a rival with the money and room, and closed to one who is broke', () => {
    const { w, rival, me } = bidWorld();
    expect(canBidFor(w, rival, me)).toBe(true);
    getResources(w, rival).money = 0;
    expect(canBidFor(w, rival, me)).toBe(false);
  });

  it('moves the relic and exactly the price when both agree and park side by side', () => {
    const { w, rival, me, relic, claim } = bidWorld();
    const price = claimBidPrice(relic);
    const mineBefore = moneyOf(w, me);
    const theirsBefore = moneyOf(w, rival);
    offerClaimBid(w, rival, me);
    acceptClaimBid(w);
    w.turn += 1;
    settleStates(w);
    expect(carriesPart(me, relic.id)).toBe(false);
    expect(carriesPart(rival, relic.id)).toBe(true);
    expect(moneyOf(w, me)).toBe(mineBefore + price);
    expect(moneyOf(w, rival)).toBe(theirsBefore - price);
    expect(playerBid(w)).toBeNull();
    expect(claimPartHeld(w, claim)).toBe('rival');
  });

  it('changes nothing when the player refuses', () => {
    const { w, rival, me, relic } = bidWorld();
    const mineBefore = moneyOf(w, me);
    offerClaimBid(w, rival, me);
    refuseClaimBid(w);
    settleStates(w);
    expect(playerBid(w)).toBeNull();
    expect(carriesPart(me, relic.id)).toBe(true);
    expect(moneyOf(w, me)).toBe(mineBefore);
  });

  it('ends without a sale when the trucks do not stand side by side before the offer expires', () => {
    const { w, rival, me, relic } = bidWorld();
    rival.pos = { x: me.pos.x + 80, y: me.pos.y };
    offerClaimBid(w, rival, me);
    acceptClaimBid(w);
    for (let i = 0; i < 30; i++) {
      w.turn += 1;
      advanceStates(w);
    }
    expect(playerBid(w)).toBeNull();
    expect(carriesPart(me, relic.id)).toBe(true);
  });

  it('ends without a sale when the rival and the player fall into a feud', () => {
    const { w, rival, me, relic } = bidWorld();
    offerClaimBid(w, rival, me);
    acceptClaimBid(w);
    declareFeud(w, rival, me.id);
    w.turn += 1;
    settleStates(w);
    expect(playerBid(w)).toBeNull();
    expect(carriesPart(me, relic.id)).toBe(true);
  });

  it('ends without a sale when the relic leaves the player truck', () => {
    const { w, rival, me, relic } = bidWorld();
    offerClaimBid(w, rival, me);
    me.items = me.items.filter((it) => !(it.kind === 'part' && it.part.id === relic.id));
    w.turn += 1;
    settleStates(w);
    expect(playerBid(w)).toBeNull();
  });

  it('refuses a second offer while one is open, and an offer when no claim is run', () => {
    const { w, rival, me, claim } = bidWorld();
    offerClaimBid(w, rival, me);
    expect(() => offerClaimBid(w, rival, me)).toThrow();
    refuseClaimBid(w);
    claim.rival = null;
    expect(() => offerClaimBid(w, rival, me)).toThrow();
  });

  it('keeps the open offer through a save and load, awarding nothing', () => {
    const { w, rival, me } = bidWorld();
    offerClaimBid(w, rival, me);
    acceptClaimBid(w);
    const slots = new SaveSlots(memoryBackend(), new Map());
    slots.put('auto', { ...JSON.parse(JSON.stringify(saveOf(w))), savedAt: 1000, runId: 'run-1' });
    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;
    expect(bidData(playerBid(loaded)!)).toEqual(bidData(playerBid(w)!));
    expect(loaded.events).toEqual([]);
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.player.xp).toEqual(w.player.xp);
  });
});
