import { describe, expect, it } from 'vitest';
import { NPCS, NPC_BEHAVIOR } from '../data/npcs';
import { REGION } from '../data/region';
import { SHOPS } from '../data/market';
import { addGoods } from './inventory';
import { exploreGoal, IDLE_GOALS, saleGoal } from './npc-activities';
import { beatGates, huntingGroundsAway, npcProfile, onBeat, patrolStopsOf, supplyOffers, tradeOffers } from './npc-decisions';
import { siteGates, sitePads } from './sites';
import { addVehicle, emptyWorld, npcBrain } from './testkit';
import { fallbackFaction } from './spawn';
import { dist, type Vec } from './vec';
import type { Vehicle, World } from './types';
import type { TraitId } from '../data/npcs';

const town = (id: string) => REGION.towns.find((t) => t.id === id)!;
const DRAWS = 50;

function driver(w: World, templateId: string, traits: TraitId[], home: Vec, pos: Vec): Vehicle {
  const npc = addVehicle(w, fallbackFaction(NPCS[templateId]), 'scout', ['mg', 'stockEngine'], pos);
  npc.brain = npcBrain(templateId, home, traits);
  return npc;
}

const lawman = (w: World, templateId: string, homeTown: string, farTown: string) => driver(w, templateId, ['lawman', 'brave'], sitePads(town(homeTown))[0], sitePads(town(farTown))[0]);

const withinReach = (point: Vec, townId: string) => siteGates(town(townId)).some((gate) => dist(gate, point) <= NPC_BEHAVIOR.patrolRadius);

function farLawmen(): { w: World; nose: Vehicle; bowl: Vehicle } {
  const w = emptyWorld({ x: 300, y: 300 });
  w.vehicles[0].pos = { x: 5, y: 5 };
  const nose = lawman(w, 'noseArmy', 'nose', 'bowl');
  const bowl = lawman(w, 'bowlFarmer', 'bowl', 'nose');
  return { w, nose, bowl };
}

describe('a lawman keeps its own errands on its beat', () => {
  it('looks around only on the beat, wherever it stands', () => {
    const { w, nose, bowl } = farLawmen();
    for (let i = 0; i < DRAWS; i++) {
      const noseGoal = exploreGoal(w, nose);
      const bowlGoal = exploreGoal(w, bowl);
      expect(noseGoal.kind).toBe('explore');
      expect(bowlGoal.kind).toBe('explore');
      expect(withinReach(noseGoal.destination!, 'nose')).toBe(true);
      expect(withinReach(bowlGoal.destination!, 'bowl')).toBe(true);
    }
  });

  it('offers no hunting ground, trade or supply run off the beat', () => {
    const { w, nose, bowl } = farLawmen();
    for (const [npc, townId] of [[nose, 'nose'], [bowl, 'bowl']] as const) {
      for (const point of huntingGroundsAway(w, npc)) expect(withinReach(point, townId)).toBe(true);
      for (const plan of [...tradeOffers(w, npc), ...supplyOffers(w, npc)]) {
        expect(withinReach(shopPos(plan.value.source), townId)).toBe(true);
        expect(withinReach(shopPos(plan.value.sellShop), townId)).toBe(true);
      }
    }
  });

  it('sells at a beat shop that buys the load', () => {
    const { w, nose } = farLawmen();
    const beatShops = Object.values(SHOPS).filter((shop) => onBeat(nose, shopPos(shop.id)));
    expect(beatShops.length).toBeGreaterThan(0);
    const good = beatShops[0].goods[0];
    addGoods(w, nose, good, 1);
    const goal = saleGoal(w, nose, npcProfile(nose));
    expect(onBeat(nose, shopPos(goal.targetId!))).toBe(true);
  });

  it('sells off the beat only when no beat shop buys any of the load', () => {
    const { w, nose } = farLawmen();
    const beat = Object.values(SHOPS).filter((shop) => onBeat(nose, shopPos(shop.id)));
    const foreign = Object.values(SHOPS).flatMap((shop) => shop.goods).find((good) => beat.every((shop) => !shop.goods.includes(good)));
    if (!foreign) return;
    addGoods(w, nose, foreign, 1);
    const goal = saleGoal(w, nose, npcProfile(nose));
    expect(SHOPS[goal.targetId!].goods).toContain(foreign);
  });

  it('leaves a driver without the lawman trait free to roam', () => {
    const { w } = farLawmen();
    const roamer = driver(w, 'noseArmy', ['roamer'], sitePads(town('nose'))[0], { x: 5, y: 5 });
    expect(beatGates(roamer)).toBeNull();
    const farthest = Math.max(...Array.from({ length: DRAWS }, () => dist(sitePads(town('nose'))[0], exploreGoal(w, roamer).destination!)));
    expect(farthest).toBeGreaterThan(NPC_BEHAVIOR.patrolRadius * 2);
    expect(onBeat(roamer, { x: 280, y: 280 })).toBe(true);
  });

  it('keeps the patrol stops of each town where they were', () => {
    const { w, nose, bowl } = farLawmen();
    for (const npc of [nose, bowl]) {
      const stops = patrolStopsOf(w, npc);
      expect(stops.length).toBeGreaterThan(0);
      for (const stop of stops) expect(onBeat(npc, stop)).toBe(true);
    }
    expect(IDLE_GOALS.explore).toBe(exploreGoal);
  });
});

function shopPos(id: string): Vec {
  const site = [...REGION.towns, ...REGION.locations].find((s) => s.id === id)!;
  return site.pos;
}
