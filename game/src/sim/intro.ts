import { FARM_TOWER_ID } from '../data/arrival';
import { AMBUSH, WAKE_TOWN } from '../data/intro';
import { chassisDef } from '../data/chassis';
import { START_KITS } from '../data/start';
import { atlasOf } from './atlas';
import { makePart } from './factory';
import { addStockPart, shopState } from './market';
import { AMBUSH_RAIDER, GAME_OPENED_QUESTS, TOWED_TO_BOWL, type IntroStep } from '../data/quests';
import { NPCS } from '../data/npcs';
import { RULES } from '../data/rules';
import { playerVehicle } from './damage';
import { isDefeated } from './defeat';
import { mountedParts } from './grid';
import { openingOver } from './opening';
import { fightCornered } from './npc-activities';
import { addState } from './states';
import { generateNpcLoadout } from './npc-loadout';
import { getKnownSite } from './npc-decisions';
import { introStep, openQuest, QUESTS, setIntroStep, setWorldVar, worldVar } from './quests';
import { engineNeedsPatch } from './repair';
import { drivable } from './path';
import { nearestPad, siteUnder } from './sites';
import { allegianceFor, isFree, spawnAt } from './spawn';
import { chooseOn } from './tracks';
import type { Vehicle, World } from './types';
import { dist, type Vec } from './vec';
import { playerSees, sightRadius } from './vision';

const BEFORE_PATCH: readonly IntroStep[] = ['off', 'drive'];

export function advanceIntro(w: World): void {
  if (w.player.state !== 'active' || w.player.quests.session) return;
  const step = introStep(w);
  if (BEFORE_PATCH.includes(step)) settleBeforePatch(w, step);
  else settleAfterPatch(w, step);
}

function settleAfterPatch(w: World, step: IntroStep): void {
  if (step === 'patched') launchAmbush(w);
  else if (step === 'ambush') keepHunting(w);
}

function endAmbush(w: World): void {
  setIntroStep(w, 'done');
  openQuest(w, QUESTS, GAME_OPENED_QUESTS.introRoad, 'start');
}

function keepHunting(w: World): void {
  const raider = w.vehicles.find((v) => v.id === worldVar(w, AMBUSH_RAIDER));
  if (!raider || isDefeated(raider)) return endAmbush(w);
  const me = playerVehicle(w);
  const fight = raider.brain!.goals.find((g) => g.kind === 'fight' && g.targetId === me.id);
  if (!inHuntRange(w, raider, me)) {
    if (!fight) endAmbush(w);
    return;
  }
  if (!fight) return fightCornered(w, raider, me, 'robCargo');
  chooseOn(w, raider, me.id, me.pos, 'fight', false);
  fight.worn = { ...fight.worn!, turn: w.turn };
}

function inHuntRange(w: World, raider: Vehicle, me: Vehicle): boolean {
  return dist(raider.pos, me.pos) <= sightRadius(w, me) * AMBUSH.huntSight;
}

export function wakeInTown(w: World, foes: readonly string[] | null): void {
  if (foes === null || foes.length === 0 || introStep(w) !== 'ambush') return;
  parkInWakeTown(w);
  stockLostKitParts(w);
  setIntroStep(w, 'done');
  setWorldVar(w, TOWED_TO_BOWL, true);
  openQuest(w, QUESTS, GAME_OPENED_QUESTS.introWake, 'start');
}

function parkInWakeTown(w: World): void {
  const me = playerVehicle(w);
  const site = getKnownSite(WAKE_TOWN);
  const pad = nearestPad(site, me.pos);
  me.pos = parkingSpot(w, pad, me);
  me.heading = Math.atan2(pad.y - site.pos.y, pad.x - site.pos.x);
  me.speed = 0;
  me.trail = [];
}

function stockLostKitParts(w: World): void {
  const kit = START_KITS.arrival;
  const shop = shopState(w, WAKE_TOWN);
  const held = new Set([...playerVehicle(w).items.flatMap((item) => (item.kind === 'part' ? [item.part.defId] : [])), ...shop.stock.map((part) => part.defId)]);
  for (const defId of kit.parts.filter((id) => !held.has(id))) addStockPart(shop, makePart(w, defId, kit.wear));
}

function settleBeforePatch(w: World, step: IntroStep): void {
  if (!w.obstacles.some((o) => o.id === FARM_TOWER_ID)) return;
  if (step !== 'drive') setIntroStep(w, 'drive');
  if (enginePatched(w)) setIntroStep(w, 'patched');
}

function enginePatched(w: World): boolean {
  const me = playerVehicle(w);
  return mountedParts(me, 'engine').length > 0 && !engineNeedsPatch(w, me);
}

function launchAmbush(w: World): void {
  if (!openingOver(w)) return;
  const me = playerVehicle(w);
  if (me.speed <= RULES.parkedSpeed || siteUnder(atlasOf(w.terrain), me.pos)) return;
  const template = NPCS[AMBUSH.template];
  const loadout = generateNpcLoadout(w, template, AMBUSH.chassis, AMBUSH.gear);
  const spot = ambushSpot(w, me, chassisDef(loadout.chassisId).radius);
  if (!spot) return;
  const raider = spawnAt(w, template, { ...loadout, cargo: {} }, spot, allegianceFor(w, template, null, null));
  const brain = raider.brain;
  if (!brain) throw new Error(`Ambush raider ${raider.id} has no brain`);
  brain.traits = [...new Set([...brain.traits, ...AMBUSH.addedTraits])];
  addState(w, 'feud', raider.id, me.id, { kind: 'feud', robbery: true });
  w.events.push({ t: 'hostile', vehicle: raider.id, against: me.id });
  setWorldVar(w, AMBUSH_RAIDER, raider.id);
  setIntroStep(w, 'ambush');
  fightCornered(w, raider, me, 'robCargo');
}

function ambushSpot(w: World, me: Vehicle, radius: number): Vec | null {
  const sight = sightRadius(w, me);
  const target = sight * AMBUSH.sightTarget;
  return spotsAhead(me, sight)
    .filter((p) => !siteUnder(atlasOf(w.terrain), p) && !playerSees(w, p) && isFree(w, p, radius, null) && drivable(w, me.pos, p, radius))
    .sort((a, b) => Math.abs(dist(a, me.pos) - target) - Math.abs(dist(b, me.pos) - target))[0] ?? null;
}

function spotsAhead(me: Vehicle, sight: number): Vec[] {
  const cone = Math.acos(AMBUSH.aheadCos);
  const ranges = sampled(sight * AMBUSH.sightMin, sight * AMBUSH.sightMax, AMBUSH.spotStep);
  const turns = sampled(-cone, cone, AMBUSH.spotStep / sight);
  return ranges.flatMap((r) => turns.map((a) => ({ x: me.pos.x + Math.cos(me.heading + a) * r, y: me.pos.y + Math.sin(me.heading + a) * r })));
}

function sampled(from: number, to: number, step: number): number[] {
  const count = Math.max(1, Math.ceil((to - from) / step));
  return Array.from({ length: count + 1 }, (_, k) => from + ((to - from) * k) / count);
}

function parkingSpot(w: World, pad: Vec, me: Vehicle): Vec {
  const radius = chassisDef(me.chassisId).radius;
  const step = radius * 2 + 0.4;
  for (let ring = 0; ring <= AMBUSH.parkingRings; ring++) {
    const count = ring === 0 ? 1 : AMBUSH.parkingAngles * ring;
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2;
      const spot = { x: pad.x + Math.cos(a) * ring * step, y: pad.y + Math.sin(a) * ring * step };
      if (isFree(w, spot, radius, me.id)) return spot;
    }
  }
  throw new Error(`No free spot for the player truck near the ${WAKE_TOWN} pad`);
}
