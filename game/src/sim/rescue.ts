import { CONTRACTS } from '../data/market';
import { RULES } from '../data/rules';
import { isHostile } from './combat';
import { isKnockedOut } from './defeat';
import { corePart } from './grid';
import { contractReward, estimateTurns, finishContract, haulWindow, isExpired, siteOf, type Contract } from './market';
import { needsPatch } from './patch';
import { route } from './path';
import { nextRandom, randInt, randRange } from './rng';
import { nearestPad } from './sites';
import { aidData } from './states';
import { hasWorkingEngine, isStranded, isWorking, vehicleStats } from './stats';
import { isOnRope, towOf } from './tow';
import type { NpcState, Vehicle, World } from './types';
import { dist, type Vec } from './vec';

export type RescueNeed = 'fuel' | 'repair' | 'tow';
export type Rescue = Extract<Contract, { kind: 'rescue' }>;

const HELP_KINDS = ['tow', 'answering', 'patch'];

export function rescueNeed(world: World, v: Vehicle): RescueNeed {
  if (!isStranded(world, v)) throw new Error(`${v.id} is not stranded`);
  if (needsPatch(world, v)) return 'repair';
  return canTakeFuel(v) ? 'fuel' : 'tow';
}

function canTakeFuel(v: Vehicle): boolean {
  return hasWorkingEngine(v) && isWorking(corePart(v, 'transmission')) && isWorking(corePart(v, 'tank'));
}

function isHelped(world: World, v: Vehicle): boolean {
  return world.states.some((s) => s.other === v.id && HELP_KINDS.includes(s.kind));
}

export function isRescueCandidate(world: World, v: Vehicle, named: ReadonlySet<string>): boolean {
  if (!v.brain || v.faction === 'raiders' || named.has(v.id)) return false;
  return isStranded(world, v) && !isKnockedOut(v) && !isHelped(world, v);
}

export function namedClients(world: World): Set<string> {
  const named = new Set<string>();
  const add = (c: Contract) => {
    if (c.kind === 'rescue' && !c.fulfilled) named.add(c.client);
  };
  for (const shop of Object.values(world.shops)) shop.contracts.forEach(add);
  world.player.contracts.forEach(add);
  return named;
}

function reachable(world: World, shopId: string, v: Vehicle): boolean {
  const pad = nearestPad(siteOf(shopId), v.pos);
  const end = route(world, pad, v.pos, vehicleStats(world, v).radius, [], v).at(-1) ?? pad;
  return dist(end, v.pos) <= RULES.arriveRadius * 2;
}

export function rescueClients(world: World, shop: { id: string; pos: Vec }): Vehicle[] {
  const named = namedClients(world);
  const near = world.vehicles.filter((v) => dist(v.pos, shop.pos) <= CONTRACTS.rescue.range);
  return near.filter((v) => isRescueCandidate(world, v, named) && reachable(world, shop.id, v));
}

function areaAround(world: World, pos: Vec): Vec {
  const angle = randRange(world.marketRng, 0, Math.PI * 2);
  const d = CONTRACTS.rescue.areaOffset * Math.sqrt(nextRandom(world.marketRng));
  return { x: pos.x + Math.cos(angle) * d, y: pos.y + Math.sin(angle) * d };
}

export function rollRescue(world: World, shop: { id: string; pos: Vec }, clients: Vehicle[], id: string): Contract {
  const client = clients[randInt(world.marketRng, 0, clients.length - 1)];
  if (!isRescueCandidate(world, client, namedClients(world))) throw new Error(`${client.id} is not a stranded driver to rescue`);
  const turns = estimateTurns(shop.pos, client.pos);
  const window = haulWindow(turns, false);
  const driver = client.brain!.driver;
  const area = areaAround(world, client.pos);
  const reward = contractReward(turns, 0, false);
  return { id, shop: shop.id, kind: 'rescue', client: client.id, driver, need: rescueNeed(world, client), area, reward, deadline: world.turn + window, window, tier: 1, fulfilled: false };
}

export function rescueOfferValid(world: World, c: Rescue): boolean {
  const client = world.vehicles.find((v) => v.id === c.client);
  return client !== undefined && isRescueCandidate(world, client, new Set());
}

function playerHelps(world: World, s: NpcState, client: Vehicle): boolean {
  const me = world.player.vehicleId;
  if (s.kind === 'aid') return s.holder === client.id && s.other === me && aidData(s).giver === 'player';
  return (s.kind === 'tow' || s.kind === 'patch') && s.holder === me && s.other === client.id;
}

function fixesClient(world: World, s: NpcState, client: Vehicle): boolean {
  return s.kind === 'tow' || !isStranded(world, client);
}

function wasHelped(world: World, client: Vehicle): boolean {
  return world.events.some((e) => e.t === 'stateEnded' && e.ending === 'fulfilled' && playerHelps(world, e.state, client) && fixesClient(world, e.state, client));
}

function playerHostile(world: World, client: Vehicle): boolean {
  const me = world.vehicles.find((v) => v.id === world.player.vehicleId)!;
  return isHostile(world, me, client) || isHostile(world, client, me);
}

function onOthersRope(world: World, client: Vehicle): boolean {
  return isOnRope(world, client.id) && towOf(world, client.id)?.holder !== world.player.vehicleId;
}

function isLost(world: World, client: Vehicle | undefined): boolean {
  if (!client) return true;
  return isKnockedOut(client) || onOthersRope(world, client) || !isStranded(world, client);
}

function rescueEnding(world: World, c: Rescue, client: Vehicle | undefined): 'met' | 'failed' | 'lapsed' | null {
  if (client && wasHelped(world, client)) return 'met';
  if (client && playerHostile(world, client)) return 'failed';
  if (isLost(world, client)) return 'lapsed';
  return isExpired(world, c) ? 'failed' : null;
}

function meet(world: World, c: Rescue): void {
  c.fulfilled = true;
  world.events.push({ t: 'contract', contract: { ...c }, outcome: 'fulfilled' });
}

export function advanceRescues(world: World): void {
  for (const c of world.player.contracts) {
    if (c.kind !== 'rescue' || c.fulfilled) continue;
    const ending = rescueEnding(world, c, world.vehicles.find((v) => v.id === c.client));
    if (ending === 'met') meet(world, c);
    else if (ending) finishContract(world, c, ending);
  }
}
