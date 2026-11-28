import { PARTS } from '../data/parts';
import { claimTargets } from '../sim/claims';
import { playerVehicle } from '../sim/damage';
import { makePart } from '../sim/factory';
import { stowPart } from '../sim/inventory';
import { siteOf } from '../sim/market';
import { pushGoal } from '../sim/npc-activities';
import { getResources } from '../sim/resources';
import type { ClaimContract } from '../sim/salvage';
import { sitePads } from '../sim/sites';
import { addVehicle, npcBrain } from '../sim/testkit';
import type { PartInstance, Vehicle, World } from '../sim/types';
import { cloneWorld } from '../sim/world';

export type RelicClaimWorld = { w: World; claim: ClaimContract; rival: Vehicle; me: Vehicle; relic: PartInstance };

export function relicClaimWorld(base: World): RelicClaimWorld {
  const w = cloneWorld(base);
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
