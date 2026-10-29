
import { FIRST_NAMES, NPCS, OPPOSED_TRAITS, SPAWN, SURNAMES, type NpcTemplate, type TraitId } from "../data/npcs";
import { SITE_FACTIONS, TOWN_TRADER_SHARE } from "../data/npc-behavior";
import { isOutlaw } from "./relations";
import { chassisDef } from "../data/chassis";
import { isRig } from "./body";
import { footprint, rigDiscs } from "./rig";
import { PERSONALITY_IDS, type PersonalityId } from "../data/personalities";
import { REGION } from "../data/region";
import { playerVehicle } from "./damage";
import { makeVehicle } from "./factory";
import { isDriveObstacle, touchesObstacle } from "./mapgen";
import { generateNpcLoadout, type NpcLoadout } from "./npc-loadout";
import { getKnownSite, profileOf } from "./npc-decisions";
import { chance, randInt, randRange, type Rng } from "./rng";
import { isFortress, siteGates, siteUnder, type Site } from "./sites";
import { modeRules } from "./settings";
import { isLone } from "./pairs";
import { startEscort } from "./tow";
import type { NpcFactionId, Vehicle, World } from "./types";
import { dist, type Vec } from "./vec";
import { atlasOf } from "./atlas";
import { bayHeading, hollowBays } from "./hollow-layout";
import { isSunwardMember, spawnsAtHollow } from "./sunward";

export function spawnNpcs(world: World): void {
  if (!modeRules(world).traffic) return;
  for (const tpl of Object.values(NPCS)) if (tpl.spawn.kind !== "escort") tickSpawn(world, tpl);
}

function tickSpawn(world: World, tpl: NpcTemplate): void {
  const left = (world.spawnTimer[tpl.id] ?? firstTimer(tpl)) - 1;
  world.spawnTimer[tpl.id] = left;
  if (left > 0) return;
  world.spawnTimer[tpl.id] = tpl.interval;
  if (tpl.pairs) tickPairs(world, tpl);
  else if (tpl.spawn.kind === 'hollow') refillHollow(world, tpl);
  else if (aliveOf(world, tpl) < tpl.cap) spawnWithEscorts(world, tpl, () => siteFor(world, tpl));
}

export function fillHollow(world: World): void {
  for (const tpl of Object.values(NPCS).filter((t) => t.spawn.kind === 'hollow')) {
    while (aliveOf(world, tpl) < tpl.cap) if (!spawnInBay(world, tpl)) break;
  }
}

function refillHollow(world: World, tpl: NpcTemplate): void {
  if (spawnsAtHollow(world) && aliveOf(world, tpl) < tpl.cap) spawnInBay(world, tpl);
}

function spawnInBay(world: World, tpl: NpcTemplate): Vehicle | null {
  const loadout = generateNpcLoadout(world, tpl);
  const radius = chassisDef(loadout.chassisId).radius;
  const homes = world.vehicles.filter(isSunwardMember).map((v) => v.brain!.home);
  const bay = hollowBays().findIndex((p) => !homes.some((h) => dist(h, p) < 0.5) && isFree(world, p, radius, null));
  if (bay < 0) {
    world.events.push({ t: 'info', note: { id: 'spawnBlocked', template: tpl.id }, debug: true });
    return null;
  }
  const v = spawnAt(world, tpl, loadout, hollowBays()[bay], allegianceFor(world, tpl, null, null));
  v.heading = bayHeading(bay);
  return v;
}

function tickPairs(world: World, tpl: NpcTemplate): void {
  const lone = world.vehicles.find((v) => v.brain?.templateId === tpl.id && isLone(world, v));
  if (!lone) {
    if (aliveOf(world, tpl) + 2 <= tpl.cap) spawnWithEscorts(world, tpl, () => siteFor(world, tpl));
    return;
  }
  if (aliveOf(world, tpl) >= tpl.cap) return;
  const site = nearestSite(tpl, lone.pos);
  const partner = spawnOne(world, tpl, () => site, null);
  if (partner) startEscort(world, partner, lone, null, 0);
}

const PHASES = phasesOf(Object.values(NPCS).filter((tpl) => tpl.spawn.kind !== "escort"));

function phasesOf(templates: readonly NpcTemplate[]): Record<string, number> {
  const phases: Record<string, number> = {};
  for (const tpl of templates) {
    const same = templates.filter((other) => other.interval === tpl.interval);
    phases[tpl.id] = Math.floor((same.indexOf(tpl) * tpl.interval) / same.length);
  }
  return phases;
}

function firstTimer(tpl: NpcTemplate): number {
  return tpl.interval + (PHASES[tpl.id] ?? 0);
}

function nearestSite(tpl: NpcTemplate, pos: Vec): Site {
  return sitesFor(tpl).reduce((a, b) => (dist(pos, a.pos) <= dist(pos, b.pos) ? a : b));
}

export function spawnInitial(world: World): void {
  const town = REGION.towns.find((t) => t.id === SPAWN.startTraffic.town);
  if (!town) throw new Error(`Unknown start traffic town ${SPAWN.startTraffic.town}`);
  const gate = nearestGate(town, playerVehicle(world).pos);
  const places: SpawnPlace[] = [{ site: town, gate }, { site: town, gate: null }];
  for (const id of SPAWN.startTraffic.templates) spawnRequired(world, NPCS[id], places);
  const decks = new Map<string, Site[]>();
  for (const id of SPAWN.initial) {
    const tpl = NPCS[id];
    spawnRequired(world, tpl, rosterPlaces(tpl, dealSite(world, decks, sitesFor(tpl))));
  }
  if (world.sunward) fillHollowAtStart(world);
}

function fillHollowAtStart(world: World): void {
  fillHollow(world);
  for (const tpl of Object.values(NPCS).filter((t) => t.spawn.kind === 'hollow')) {
    const found = aliveOf(world, tpl);
    if (found < tpl.cap) throw new Error(`A new world holds ${found} ${tpl.id} cars at the Hollow, not ${tpl.cap}`);
  }
}

type SpawnPlace = { site: Site; gate: Vec | null };

function rosterPlaces(tpl: NpcTemplate, dealt: Site): SpawnPlace[] {
  const others = sitesFor(tpl)
    .filter((site) => site !== dealt)
    .sort((a, b) => dist(a.pos, dealt.pos) - dist(b.pos, dealt.pos));
  return [dealt, ...others].map((site) => ({ site, gate: null }));
}

function nearestGate(site: Site, from: Vec): Vec {
  return siteGates(site).reduce((a, b) => (dist(from, a) <= dist(from, b) ? a : b));
}

function dealSite(world: World, decks: Map<string, Site[]>, sites: readonly Site[]): Site {
  const key = sites.map((s) => s.id).join();
  let deck = decks.get(key) ?? [];
  if (deck.length === 0) {
    deck = [...sites];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = randInt(world, 0, i);
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
  }
  const site = deck.pop()!;
  decks.set(key, deck);
  return site;
}

function aliveOf(world: World, tpl: NpcTemplate): number {
  return world.vehicles.filter((v) => v.brain?.templateId === tpl.id).length;
}

function spawnWithEscorts(world: World, tpl: NpcTemplate, pick: () => Site): void {
  const leader = spawnOne(world, tpl, pick, null);
  if (leader) spawnEscorts(world, tpl, leader);
}

function spawnRequired(world: World, tpl: NpcTemplate, places: readonly SpawnPlace[]): void {
  const loadout = generateNpcLoadout(world, tpl);
  const leader = places.reduce<Vehicle | null>(
    (placed, place) => placed ?? placeLeader(world, tpl, loadout, () => place.site, place.gate),
    null,
  );
  if (!leader) throw new Error(`No room to spawn ${tpl.id} at ${places.map((p) => p.site.id).join()} in the new world`);
  const missed = spawnEscorts(world, tpl, leader);
  if (missed.length > 0) throw new Error(`No free spot to spawn ${missed[0].id} beside ${tpl.id} in the new world`);
}

function spawnEscorts(world: World, tpl: NpcTemplate, leader: Vehicle): NpcTemplate[] {
  const missed: NpcTemplate[] = [];
  if (tpl.pairs && aliveOf(world, tpl) < tpl.cap) {
    const partner = spawnBeside(world, tpl, leader);
    if (partner) startEscort(world, partner, leader, null, 0);
    else missed.push(tpl);
  }
  for (const escort of escortsOf(tpl).filter((e) => aliveOf(world, e) < e.cap)) {
    const guard = spawnBeside(world, escort, leader);
    if (guard) startEscort(world, guard, leader, null, 0);
    else missed.push(escort);
  }
  return missed;
}

function escortsOf(tpl: NpcTemplate): NpcTemplate[] {
  return Object.values(NPCS).filter((e) => e.spawn.kind === "escort" && e.spawn.of === tpl.id);
}

function spawnBeside(world: World, tpl: NpcTemplate, leader: Vehicle): Vehicle | null {
  const loadout = generateNpcLoadout(world, tpl);
  const radius = chassisDef(loadout.chassisId).radius;
  const d = chassisDef(leader.chassisId).radius + radius + SPAWN.escortGap;
  for (let i = 0; i < SPAWN.tries; i++) {
    const a = randRange(world, -Math.PI, Math.PI);
    const pos = { x: leader.pos.x + Math.cos(a) * d, y: leader.pos.y + Math.sin(a) * d };
    if (!isFree(world, pos, radius, null) || nearPlayer(world, pos)) continue;
    return spawnAt(world, tpl, loadout, pos, allegianceFor(world, tpl, null, leader));
  }
  world.events.push({ t: 'info', note: { id: 'spawnBlocked', template: tpl.id }, debug: true });
  return null;
}

export function rollTraits(world: Rng, tpl: NpcTemplate): TraitId[] {
  const won = tpl.extraTraits.filter((extra) => chance(world, extra.chance)).map((extra) => extra.trait);
  return won.reduce((held, trait) => (opposesAny(trait, held) ? held : [...held, trait]), [...tpl.traits]);
}

export function rollPersonality(world: Rng): PersonalityId {
  return PERSONALITY_IDS[randInt(world, 0, PERSONALITY_IDS.length - 1)];
}

function opposesAny(trait: TraitId, held: TraitId[]): boolean {
  return OPPOSED_TRAITS.some(([a, b]) => (a === trait && held.includes(b)) || (b === trait && held.includes(a)));
}

function spawnOne(world: World, tpl: NpcTemplate, pick: () => Site, gate: Vec | null): Vehicle | null {
  const leader = placeLeader(world, tpl, generateNpcLoadout(world, tpl), pick, gate);
  if (!leader) world.events.push({ t: 'info', note: { id: 'spawnBlocked', template: tpl.id }, debug: true });
  return leader;
}

function placeLeader(world: World, tpl: NpcTemplate, loadout: NpcLoadout, pick: () => Site, gate: Vec | null): Vehicle | null {
  const radius = chassisDef(loadout.chassisId).radius;
  for (let i = 0; i < SPAWN.tries; i++) {
    const site = pick();
    const pos = gateSpot(world, site, gate, radius);
    if (!spawnRoom(world, pos, radius)) continue;
    return spawnAt(world, tpl, loadout, pos, allegianceFor(world, tpl, site, null));
  }
  return null;
}

function nearPlayer(world: World, pos: Vec): boolean {
  return dist(pos, playerVehicle(world).pos) < SPAWN.minPlayerDist;
}

function crowdAt(world: World, pos: Vec): number {
  return world.vehicles.filter((v) => dist(v.pos, pos) < SPAWN.crowd.reach).length;
}

export function spawnRoom(world: World, pos: Vec, radius: number): boolean {
  return isFree(world, pos, radius, null) && !nearPlayer(world, pos) && crowdAt(world, pos) < SPAWN.crowd.most;
}

export function allegianceFor(world: World, tpl: NpcTemplate, site: Site | null, leader: Vehicle | null): NpcFactionId {
  const rule = tpl.allegiance;
  if (rule.kind === 'town') return townFaction(world, site);
  if (rule.kind === 'fixed') return rule.faction;
  const given = rule.kind === 'site' ? siteFaction(site) : leaderFaction(leader);
  return given ?? fallbackFaction(tpl);
}

function siteFaction(site: Site | null): NpcFactionId | undefined {
  return site ? SITE_FACTIONS[site.id] : undefined;
}

function leaderFaction(leader: Vehicle | null): NpcFactionId | undefined {
  return leader ? npcFaction(leader) : undefined;
}

export function fallbackFaction(tpl: NpcTemplate): NpcFactionId {
  const rule = tpl.allegiance;
  if (rule.kind === 'fixed') return rule.faction;
  return rule.kind === 'town' ? 'independent' : rule.fallback;
}

function npcFaction(v: Vehicle): NpcFactionId {
  if (v.faction === 'player') throw new Error(`${v.id} is the player's side and leads no NPC escort`);
  return v.faction;
}

function townFaction(world: World, site: Site | null): NpcFactionId {
  const town = site && atlasOf(world.terrain).towns.some((t) => t.id === site.id) ? siteFaction(site) : undefined;
  if (!town || isOutlaw(town)) return 'independent';
  return chance(world, TOWN_TRADER_SHARE) ? town : 'independent';
}

export function spawnAt(world: World, tpl: NpcTemplate, loadout: NpcLoadout, pos: Vec, faction: NpcFactionId): Vehicle {
  const v = makeVehicle(world, {
    faction,
    ...loadout,
    pos,
    heading: randRange(world, -Math.PI, Math.PI),
    brain: {
      templateId: tpl.id,
      driver: driverName(world.nameRng),
      traits: rollTraits(world, tpl),
      personality: rollPersonality(world),
      goals: [],
      noticed: {},
      tracks: {},
      hurt: 0,
      attackers: {},
      goal: null,
      home: { ...pos },
      stepIndex: 0,
      memories: [],
    },
  });
  if (!v.resources) throw new Error(`${tpl.id} spawned without resources`);
  v.resources.money = tpl.money;
  world.vehicles.push(v);
  world.events.push({ t: "spawn", vehicle: v.id });
  return v;
}

const NAME_SALT = 0x6e616d65;

export function nameStream(seed: number): Rng {
  return { rngState: seed ^ NAME_SALT };
}

function driverName(names: Rng): string {
  const first = FIRST_NAMES[randInt(names, 0, FIRST_NAMES.length - 1)];
  const last = SURNAMES[randInt(names, 0, SURNAMES.length - 1)];
  return `${first} ${last}`;
}

const NEUTRAL_SITES: readonly Site[] = [...REGION.towns, ...REGION.locations.filter((l) => l.kind !== "camp" && l.kind !== "territory")];

function siteFor(world: World, tpl: NpcTemplate): Site {
  const sites = sitesFor(tpl);
  return sites[randInt(world, 0, sites.length - 1)];
}

function sitesFor(tpl: NpcTemplate): readonly Site[] {
  const place = tpl.spawn;
  if (place.kind === "camp") return campsOf(tpl);
  if (place.kind === "town") return NEUTRAL_SITES;
  if (place.kind === "sites") return place.ids.map(getKnownSite);
  if (place.kind === "hollow") throw new Error(`${tpl.id} spawns only in a bay of the Sunward Hollow`);
  throw new Error(`${tpl.id} spawns only beside a new ${place.of}`);
}

function campsOf(tpl: NpcTemplate): Site[] {
  const bases = profileOf(tpl.traits).bases;
  if (bases.length === 0) throw new Error(`${tpl.id} spawns at a camp but its traits know none`);
  return bases.map((id) => {
    const camp = REGION.locations.find((l) => l.id === id);
    if (!camp) throw new Error(`Unknown camp ${id}`);
    return camp;
  });
}

function gateSpot(world: World, site: Site, given: Vec | null, radius: number): Vec {
  const gates = siteGates(site);
  const gate = given ?? gates[randInt(world, 0, gates.length - 1)];
  const a = Math.atan2(gate.y - site.pos.y, gate.x - site.pos.x) + randRange(world, -SPAWN.gateAngle, SPAWN.gateAngle);
  const d = radius + 0.3 + randRange(world, 0, SPAWN.gateSpread);
  return { x: gate.x + Math.cos(a) * d, y: gate.y + Math.sin(a) * d };
}

function onMap(world: World, pos: Vec, radius: number): boolean {
  return pos.x >= radius && pos.y >= radius && pos.x <= world.size - radius && pos.y <= world.size - radius;
}

function insideFortress(world: World, pos: Vec): boolean {
  const site = siteUnder(atlasOf(world.terrain), pos);
  return site !== null && isFortress(site);
}

export function isFree(world: World, pos: Vec, radius: number, ignoreId: string | null): boolean {
  if (!onMap(world, pos, radius) || insideFortress(world, pos)) return false;
  const margin = 0.3;
  if (world.obstacles.some((o) => isDriveObstacle(o) && touchesObstacle(o, world.terrain, pos, radius, margin))) return false;
  return world.vehicles.every(
    (v) => v.id === ignoreId || spawnDiscs(v).every((d) => dist(d.pos, pos) >= d.r + radius + margin),
  );
}

function spawnDiscs(v: Vehicle): { pos: Vec; r: number }[] {
  return isRig(v.chassisId) ? rigDiscs(v) : [{ pos: v.pos, r: footprint(v.chassisId) }];
}
