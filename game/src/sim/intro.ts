import { AMBUSH, GREEN_PIT } from '../data/intro';
import { chassisDef } from '../data/chassis';
import { GAME_OPENED_QUESTS } from '../data/quests';
import { REGION } from '../data/region';
import { NPCS } from '../data/npcs';
import { playerVehicle } from './damage';
import { isDefeated } from './defeat';
import { fightCornered } from './npc-activities';
import { addState } from './states';
import { generateNpcLoadout } from './npc-loadout';
import { getKnownSite } from './npc-decisions';
import { introStep, openQuest, QUESTS, setIntroStep } from './quests';
import { nearestPad, siteUnder } from './sites';
import { isFree, spawnAt } from './spawn';
import { isRoadTile } from './terrain';
import type { Vehicle, World } from './types';
import { dist, type Vec } from './vec';
import { playerSees, sightRadius } from './vision';

export function advanceIntro(w: World): void {
  if (w.player.state !== 'active' || w.player.quests.session) return;
  const step = introStep(w);
  if (step === 'patched') launchAmbush(w);
  else if (step === 'ambush' && hunters(w).length === 0) setIntroStep(w, 'done');
}

export function arriveAtGreenPit(w: World, foes: readonly string[] | null): void {
  if (foes === null || foes.length === 0 || introStep(w) !== 'ambush') return;
  const me = playerVehicle(w);
  const site = getKnownSite(GREEN_PIT);
  const pad = nearestPad(site, me.pos);
  me.pos = parkingSpot(w, pad, me);
  me.heading = Math.atan2(pad.y - site.pos.y, pad.x - site.pos.x);
  me.speed = 0;
  me.trail = [];
  openQuest(w, QUESTS, GAME_OPENED_QUESTS.introGreenPit, 'start');
}

function launchAmbush(w: World): void {
  const me = playerVehicle(w);
  if (!isRoadTile(w.terrain, me.pos) || siteUnder(me.pos)) return;
  const template = NPCS[AMBUSH.template];
  const loadout = generateNpcLoadout(w, template, AMBUSH.chassis, AMBUSH.gear);
  const spot = ambushSpot(w, me, chassisDef(loadout.chassisId).radius);
  if (!spot) return;
  const raider = spawnAt(w, template, { ...loadout, cargo: {} }, spot);
  addState(w, 'feud', raider.id, me.id, { kind: 'feud', robbery: true });
  w.events.push({ t: 'hostile', vehicle: raider.id, against: me.id });
  fightCornered(w, raider, me, 'rob cargo');
  setIntroStep(w, 'ambush');
}

function ambushSpot(w: World, me: Vehicle, radius: number): Vec | null {
  const sight = sightRadius(w, me);
  const green = getKnownSite(GREEN_PIT).pos;
  const target = sight * AMBUSH.sightTarget;
  return roadPoints()
    .filter((p) => dist(p, me.pos) >= sight * AMBUSH.sightMin && dist(p, me.pos) <= sight * AMBUSH.sightMax)
    .filter((p) => dist(p, green) < dist(me.pos, green) && !playerSees(w, p) && isFree(w, p, radius, null))
    .sort((a, b) => Math.abs(dist(a, me.pos) - target) - Math.abs(dist(b, me.pos) - target))[0] ?? null;
}

function roadPoints(): Vec[] {
  return REGION.roads.flatMap((road) => road.slice(1).flatMap((b, i) => alongSegment(road[i], b)));
}

function alongSegment(a: Vec, b: Vec): Vec[] {
  const steps = Math.max(1, Math.ceil(dist(a, b) / AMBUSH.roadStep));
  return Array.from({ length: steps }, (_, k) => ({ x: a.x + ((b.x - a.x) * k) / steps, y: a.y + ((b.y - a.y) * k) / steps }));
}

function hunters(w: World): Vehicle[] {
  return w.vehicles.filter((v) => v.faction === 'raiders' && !isDefeated(v) && v.brain?.goals.some((g) => g.kind === 'fight' && g.targetId === w.player.vehicleId));
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
  throw new Error(`No free spot for the player truck near the ${GREEN_PIT} pad`);
}
