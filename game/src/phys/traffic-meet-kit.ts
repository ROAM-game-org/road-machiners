import { NPCS } from '../data/npcs';
import { REGION } from '../data/region';
import { START_KITS } from '../data/start';
import { addGoods } from '../sim/inventory';
import { defaultSetup } from '../sim/settings';
import { addVehicle, npcBrain } from '../sim/testkit';
import type { Vehicle, World } from '../sim/types';
import { isFree } from '../sim/spawn';
import { vehicleStats } from '../sim/stats';
import { dist, type Vec } from '../sim/vec';
import { endTurn, newWorld, setMoveOrder } from '../sim/world';
import { TEST_MAP } from '../test/map';
import { buildDrive, freeDrive, type Drive } from './drive';
import { physicsMove } from './turn';

export type Meeting = { impacts: number[]; arrivedIn: number | null };

type Bump = { a: string; b: string; impact: number };

const MEETING_TURNS = 12;
const OVERTAKE_GAP = 6;
const START_SEARCH = 40;
const MIN_BACK = 6;
const CLEAR_OF_TOWN = 30;

function turn(w: World, d: Drive, bumps: Bump[]): { w: World; d: Drive } {
  let next: Drive | null = null;
  const after = endTurn(w, physicsMove(d, (r) => {
    next = r.next;
    bumps.push(...r.crashes);
  }));
  freeDrive(d);
  after.player.call = null;
  return { w: after, d: next! };
}

function tradingWorld(): { w: World; traderId: string } {
  const w = newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
  w.vehicles = w.vehicles.filter((v) => v.faction === 'player');
  for (const id of Object.keys(NPCS)) w.spawnTimer[id] = Number.MAX_SAFE_INTEGER;
  const [bowl, nose] = REGION.towns;
  const trader = addVehicle(w, 'independent', 'hauler', ['mg', 'stockEngine'], { x: bowl.pos.x + bowl.radius + 2, y: bowl.pos.y });
  trader.brain = npcBrain('trader', trader.pos, ['trader']);
  addGoods(w, trader, 'scrap', 1);
  trader.brain.goals = [{ kind: 'sell', targetId: nose.id, destination: { ...nose.pos }, phase: 'travel', reason: 'deliverCargo' }];
  return { w, traderId: trader.id };
}

function underway(trader: Vehicle): boolean {
  const [bowl] = REGION.towns;
  return trader.speed >= 3 && dist(trader.pos, bowl.pos) > bowl.radius + CLEAR_OF_TOWN;
}

function freeStart(w: World, me: Vehicle, ahead: Vec, dir: number, back: number): Vec {
  const radius = vehicleStats(w, me).radius;
  for (let step = 0; step <= START_SEARCH * 2; step++) {
    const extra = (step % 2 === 0 ? step / 2 : -(step + 1) / 2) * 0.5;
    if (back + extra < MIN_BACK) continue;
    const pos = { x: ahead.x + Math.cos(dir) * (back + extra), y: ahead.y + Math.sin(dir) * (back + extra) };
    if (isFree(w, pos, radius, me.id)) return pos;
  }
  throw new Error(`No free ground for the player on the line ${back} tiles from ${ahead.x.toFixed(1)}, ${ahead.y.toFixed(1)}`);
}

export function meet(angle: number, speed: number, seconds: number): Meeting {
  const bumps: Bump[] = [];
  let { w, traderId } = tradingWorld();
  let d = buildDrive(w);
  const traderOf = () => w.vehicles.find((v) => v.id === traderId)!;
  const playerOf = () => w.vehicles.find((v) => v.faction === 'player')!;
  for (let i = 0; i < 30 && !underway(traderOf()); i++) ({ w, d } = turn(w, d, bumps));
  const t = traderOf();
  const ahead = { x: t.pos.x + Math.cos(t.heading) * seconds * t.speed, y: t.pos.y + Math.sin(t.heading) * seconds * t.speed };
  const dir = t.heading + Math.PI + angle;
  const me = playerOf();
  t.brain!.noticed[`preySeen:${me.id}`] = w.turn;
  me.pos = freeStart(w, me, ahead, dir, speed * seconds + (angle === 0 ? t.speed * seconds + OVERTAKE_GAP : 0));
  me.heading = dir + Math.PI;
  me.speed = speed;
  freeDrive(d);
  d = buildDrive(w);
  const dest = { x: ahead.x - Math.cos(dir) * 10, y: ahead.y - Math.sin(dir) * 10 };
  w = setMoveOrder(w, { kind: 'through', dest });
  bumps.length = 0;
  let arrivedIn: number | null = null;
  for (let i = 1; i <= MEETING_TURNS && arrivedIn === null; i++) {
    ({ w, d } = turn(w, d, bumps));
    if (!playerOf().order) arrivedIn = i;
  }
  freeDrive(d);
  const pair = [playerOf().id, traderId];
  return { impacts: bumps.filter((c) => pair.includes(c.a) && pair.includes(c.b)).map((c) => c.impact), arrivedIn };
}

export type HeadOn = Meeting & { stalls: number };

const HEAD_ON_GAP = 20;
const STALL_FAR = 8;
const STALL_STEP = 0.5;

export function meetHeadOn(lane: number, speed: number): HeadOn {
  const bumps: Bump[] = [];
  let { w, traderId } = tradingWorld();
  let d = buildDrive(w);
  const traderOf = () => w.vehicles.find((v) => v.id === traderId)!;
  const playerOf = () => w.vehicles.find((v) => v.faction === 'player')!;
  for (let i = 0; i < 30 && !underway(traderOf()); i++) ({ w, d } = turn(w, d, bumps));
  const t = traderOf();
  const side = { x: t.pos.x - Math.sin(t.heading) * lane, y: t.pos.y + Math.cos(t.heading) * lane };
  const me = playerOf();
  me.pos = freeStart(w, me, side, t.heading, HEAD_ON_GAP);
  me.heading = t.heading + Math.PI;
  me.speed = speed;
  freeDrive(d);
  d = buildDrive(w);
  const dest = { x: t.pos.x - Math.cos(t.heading) * 10, y: t.pos.y - Math.sin(t.heading) * 10 };
  w = setMoveOrder(w, { kind: 'through', dest });
  bumps.length = 0;
  let arrivedIn: number | null = null;
  let stalls = 0;
  for (let i = 1; i <= MEETING_TURNS && arrivedIn === null; i++) {
    const from = { ...playerOf().pos };
    const apart = Math.hypot(traderOf().pos.x - from.x, traderOf().pos.y - from.y);
    ({ w, d } = turn(w, d, bumps));
    const moved = Math.hypot(playerOf().pos.x - from.x, playerOf().pos.y - from.y);
    if (apart > STALL_FAR && moved < STALL_STEP && playerOf().order) stalls++;
    if (!playerOf().order) arrivedIn = i;
  }
  freeDrive(d);
  const pair = [playerOf().id, traderId];
  return { impacts: bumps.filter((c) => pair.includes(c.a) && pair.includes(c.b)).map((c) => c.impact), arrivedIn, stalls };
}
