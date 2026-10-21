import { CHASSIS, chassisDef } from '../data/chassis';
import { GOODS } from '../data/goods';
import { HUB, LINE_IDS, REFUSED, TOPICS } from '../data/dialogue';
import { isNoteId } from '../data/locals';
import { SHOPS, SITE_EVENTS } from '../data/market';
import { FURY_ROAD } from '../data/modes';
import { FACTIONS } from '../data/npc-behavior';
import { FIRST_NAMES, NPCS, SURNAMES, TRAITS } from '../data/npcs';
import { PARTS, partDef } from '../data/parts';
import { PERSONALITIES } from '../data/personalities';
import { REGION } from '../data/region';
import { SKILL_IDS } from '../data/skills';
import { HAULER_KIT, START_KITS } from '../data/start';
import { CONDITION } from '../data/wear';
import { settleAims } from './combat';
import { newId, chargeFor, gunFor, makePart } from './factory';
import { findSpot, gridOf, mountedItems, onDeadRow, placementError, type Grid } from './grid';
import { settleEscortJob } from './escort-job';
import { addShop, bountyLapsed, finishContract, isMet, parcelOf, removeParcel, type Contract, type ShopState } from './market';
import { reviseMemories } from './memory';
import { isPerkId } from './progress';
import { modeRules } from './settings';
import { endState, STATE_KINDS, settleStates } from './states';
import { DECKS } from './bridge';
import type { Call, CallVar, CallVars, Cue, DirectionStep, RoadName, GridItem, Job, NpcActivity, NpcState, OutpostFacts, PartInstance, RefitJob, RefitPickup, SalvageStock, Vehicle, World } from './types';
import { carryHp, maxHp } from './wear';
import { wornReload } from './utility';

type PartItem = Extract<GridItem, { kind: 'part' }>;
type ShopDefinition = (typeof SHOPS)[string];

export function repairContent(world: World): void {
  dropStateKinds(world);
  dropGoneContent(world);
  const doomed = new Set<string>();
  repairTrucks(world, doomed);
  removeNpcs(world, doomed);
  clampParts(world);
  for (const v of world.vehicles) fitGoals(world, v);
  repairShops(world);
  renameDrivers(world);
  repairPlayer(world);
  repairCall(world);
  for (const v of world.vehicles) fitPriceMemories(v);
  fitRoadNews(world);
  fitSites(world);
  fitWaves(world);
}

function isShop(id: string): boolean {
  return Object.hasOwn(SHOPS, id);
}

function isSite(id: string): boolean {
  return [...REGION.towns, ...REGION.locations].some((site) => site.id === id);
}

function goalNames(goal: NpcActivity): { goods: string[]; shops: string[] } {
  const purchase = goal.purchase ? [goal.purchase] : [];
  const shipment = goal.shipment ? [goal.shipment] : [];
  return {
    goods: [...purchase, ...shipment].map((x) => x.good),
    shops: [...purchase.map((p) => p.sellShop), ...shipment.flatMap((s) => [s.from, s.to])],
  };
}

const SITE_GOALS: ReadonlySet<NpcActivity['kind']> = new Set(['travel', 'resupply', 'sell', 'trade', 'retreat']);

function targetFits(world: World, goal: NpcActivity): boolean {
  const id = goal.targetId;
  if (id === null) return true;
  if (Object.hasOwn(world.shops, id) && !isShop(id)) return false;
  return isSite(id) || siteOptional(world, goal.kind, id);
}

function siteOptional(world: World, kind: NpcActivity['kind'], id: string): boolean {
  if (kind === 'tow') return world.vehicles.some((v) => v.id === id);
  return !SITE_GOALS.has(kind);
}

function boughtThere(goal: NpcActivity): boolean {
  const shop = goal.targetId;
  return !goal.purchase || shop === null || !isShop(shop) || SHOPS[shop].goods.includes(goal.purchase.good);
}

function goalFits(world: World, goal: NpcActivity): boolean {
  if (!targetFits(world, goal)) return false;
  const names = goalNames(goal);
  return names.goods.every(isGood) && names.shops.every(isShop) && boughtThere(goal);
}

function fitGoals(world: World, v: Vehicle): void {
  if (v.brain) v.brain.goals = v.brain.goals.filter((goal) => goalFits(world, goal));
}

function fitRoadNews(world: World): void {
  world.roadNews = world.roadNews.filter((n) => isGood(n.good) && isShop(n.from) && isShop(n.to));
}

function stateSite(s: NpcState): string | null {
  return s.data.kind === 'tow' || s.data.kind === 'towPromise' || s.data.kind === 'escort' ? s.data.site : null;
}

function jobSite(job: Job | null): string | null {
  return job?.kind === 'business' ? job.siteId : null;
}

function siteGone(site: string | null): boolean {
  return site !== null && !isSite(site);
}

function fitSites(world: World): void {
  for (const s of world.states.filter((x) => siteGone(stateSite(x)))) if (world.states.includes(s)) endState(world, s, 'broken');
  for (const v of world.vehicles) if (siteGone(jobSite(v.job))) v.job = null;
}

function isWaveTemplate(id: string): boolean {
  return Object.hasOwn(NPCS, id) && Object.hasOwn(FURY_ROAD.cards, id);
}

function fitWaves(world: World): void {
  for (const group of world.furyRoad?.groups ?? []) {
    if (group.spawned) continue;
    group.templates = group.templates.filter(isWaveTemplate);
    if (group.templates.length === 0) group.spawned = true;
  }
}

function fitPriceMemories(v: Vehicle): void {
  if (!v.brain) return;
  reviseMemories(v, (memory) => {
    if (memory.fact.kind !== 'prices') return memory;
    const shop = SHOPS[memory.fact.shop] as ShopDefinition | undefined;
    if (!shop) return null;
    const pressure = Object.fromEntries(Object.entries(memory.fact.pressure).filter(([good]) => shop.goods.includes(good)));
    return { ...memory, fact: { ...memory.fact, pressure } };
  });
}

function isPart(id: string): boolean {
  return Object.hasOwn(PARTS, id);
}

function isGood(id: string): boolean {
  return Object.hasOwn(GOODS, id);
}

function isChassis(id: string): boolean {
  return Object.hasOwn(CHASSIS, id);
}

function isPartItem(item: GridItem): item is PartItem {
  return item.kind === 'part';
}

function isCoreItem(item: GridItem): boolean {
  return isPartItem(item) && partDef(item.part.defId).kind === 'core';
}

function dropStateKinds(world: World): void {
  world.states = world.states.filter((s) => Object.hasOwn(STATE_KINDS, s.kind));
}

function dropGoneContent(world: World): void {
  for (const v of world.vehicles) stripVehicle(v);
  world.player.storage = knownParts(world.player.storage);
  for (const stock of world.salvage) stripSalvage(stock);
  for (const shop of Object.values(world.shops)) stripShop(shop);
  for (const outpost of outpostsOf(world)) outpost.stock = knownParts(outpost.stock);
  dropOwnContracts(world);
  dropUnknownKeys(world.player.costBasis);
  dropHulks(world);
}

function outpostsOf(world: World): OutpostFacts[] {
  return world.furyRoad ? world.furyRoad.outposts : [];
}

function stripSalvage(stock: SalvageStock): void {
  stock.parts = knownParts(stock.parts);
  stock.hidden.parts = knownParts(stock.hidden.parts);
  dropUnknownKeys(stock.goods);
  dropUnknownKeys(stock.hidden.goods);
  if (stock.pile) dropUnknownKeys(stock.pile.basis);
}

function stripShop(shop: ShopState): void {
  shop.stock = knownParts(shop.stock);
  shop.contracts = shop.contracts.filter(contractFits);
}

function knownParts(parts: PartInstance[]): PartInstance[] {
  return parts.filter((p) => isPart(p.defId));
}

function dropUnknownKeys(goods: Record<string, number>): void {
  for (const good of Object.keys(goods)) if (!isGood(good)) delete goods[good];
}

function stripVehicle(v: Vehicle): void {
  const gone = v.items.filter((it) => (isPartItem(it) && !isPart(it.part.defId)) || (it.kind === 'good' && !isGood(it.good)));
  if (gone.length === 0) return;
  v.items = v.items.filter((it) => !gone.includes(it));
  forget(v, idsOf(gone));
}

function idsOf(items: GridItem[]): Set<string> {
  return new Set(items.flatMap((it) => (isPartItem(it) ? [it.id, it.part.id] : [it.id])));
}

function forget(v: Vehicle, ids: ReadonlySet<string>): void {
  for (const orders of [v.weaponOrders, v.utilityOrders]) {
    for (const id of Object.keys(orders)) if (ids.has(id)) delete orders[id];
  }
  if (v.job && jobUses(v.job, ids)) v.job = null;
}

function jobUses(job: Job, ids: ReadonlySet<string>): boolean {
  if (job.kind === 'repair' || job.kind === 'strip') return ids.has(job.partId);
  return job.kind === 'refit' && refitUses(job, ids);
}

function refitUses(job: RefitJob, ids: ReadonlySet<string>): boolean {
  return job.moves.some((m) => ids.has(m.itemId)) || pickupUses(job.pickup, ids);
}

function pickupUses(pickup: RefitPickup | null, ids: ReadonlySet<string>): boolean {
  return pickup !== null && (ids.has(pickup.partId) || ids.has(pickup.itemId));
}

function contractFits(c: Contract): boolean {
  return isShop(c.shop) && (CONTRACT_CONTENT[c.kind] as (c: Contract) => boolean)(c);
}

const CONTRACT_CONTENT: { [K in Contract['kind']]: (c: Extract<Contract, { kind: K }>) => boolean } = {
  haul: (c) => isGood(c.good) && isShop(c.to),
  escort: (c) => isSite(c.to),
  fetch: (c) => isPart(c.defId),
  claim: (c) => isPart(c.defId),
  bounty: (c) => isTemplate(c.template),
  search: (c) => isTemplate(c.template),
  rescue: () => true,
  survey: () => true,
};

function isTemplate(id: string): boolean {
  return Object.hasOwn(NPCS, id);
}

function clearContractWork(truck: Vehicle, ids: ReadonlySet<string>): void {
  for (const id of ids) if (parcelOf(truck, id)) removeParcel(truck, id);
  if (truck.job?.kind === 'survey' && ids.has(truck.job.contractId)) truck.job = null;
}

function dropOwnContracts(world: World): void {
  const doomed = world.player.contracts.filter((c) => !contractFits(c));
  if (doomed.length === 0) return;
  const truck = world.vehicles.find((v) => v.id === world.player.vehicleId);
  if (truck) clearContractWork(truck, new Set(doomed.map((c) => c.id)));
  for (const c of doomed.filter(isMet)) world.player.money += c.reward;
  endEscorts(world, new Set(doomed.flatMap((c) => (c.kind === 'escort' ? [c.client] : []))));
  world.player.contracts = world.player.contracts.filter((c) => !doomed.includes(c));
}

function endEscorts(world: World, clients: ReadonlySet<string>): void {
  for (const s of world.states.filter((x) => x.kind === 'escort' && (clients.has(x.holder) || clients.has(x.other)))) endState(world, s, 'broken');
}

function dropHulks(world: World): void {
  for (const o of world.obstacles) if (o.kind !== 'landmark' && o.hulk && !isChassis(o.hulk.chassisId)) delete o.hulk;
}

function ownTruckIds(world: World): Set<string> {
  return new Set([world.player.vehicleId, ...(world.furyRoad ? [world.furyRoad.hauler.id] : [])]);
}

function repairTrucks(world: World, doomed: Set<string>): void {
  const own = ownTruckIds(world);
  for (const v of world.vehicles) {
    if (own.has(v.id)) repairOwnTruck(world, v);
    else repairNpc(world, v, doomed);
  }
}

function repairOwnTruck(world: World, v: Vehicle): void {
  const gone = !isChassis(v.chassisId);
  if (gone) v.chassisId = startChassis(world, v);
  if (gone || !coresSeated(v)) reseatCores(world, v);
  for (const item of fitItems(v)) displaced(world, item);
}

function repairNpc(world: World, v: Vehicle, doomed: Set<string>): void {
  if (npcKnown(v) && coresSeated(v)) fitItems(v);
  else doomed.add(v.id);
}

function npcKnown(v: Vehicle): boolean {
  const brain = v.brain;
  if (!isChassis(v.chassisId) || !Object.hasOwn(FACTIONS, v.faction)) return false;
  if (!brain) return true;
  return Object.hasOwn(NPCS, brain.templateId) && brain.traits.every((id) => Object.hasOwn(TRAITS, id)) && Object.hasOwn(PERSONALITIES, brain.personality);
}

function startChassis(world: World, v: Vehicle): string {
  return v.id === world.player.vehicleId ? START_KITS.standard.chassis : HAULER_KIT.chassis;
}

function roleCounts(defIds: string[]): string {
  const counts: Record<string, number> = {};
  for (const id of defIds) {
    const def = partDef(id);
    if (def.kind === 'core') counts[def.role] = (counts[def.role] ?? 0) + 1;
  }
  return JSON.stringify(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function coresSeated(v: Vehicle): boolean {
  const wanted = chassisDef(v.chassisId).core.map((c) => c.defId);
  return roleCounts(wanted) === roleCounts(mountedItems(v, 'core').map((it) => it.part.defId));
}

function reseatCores(world: World, v: Vehicle): void {
  const pool = v.items.filter(isPartItem).filter(isCoreItem) as PartItem[];
  const seated = chassisDef(v.chassisId).core.map((spec) => seatedCore(world, spec, takeCore(pool, spec)));
  forget(v, idsOf(pool));
  v.items = [...v.items.filter((it) => !isCoreItem(it)), ...seated];
}

type CoreSpec = ReturnType<typeof chassisDef>['core'][number];

function takeCore(pool: PartItem[], spec: CoreSpec): PartItem | null {
  const exact = pool.findIndex((it) => it.part.defId === spec.defId && it.x === spec.x && it.y === spec.y);
  const index = exact >= 0 ? exact : pool.findIndex((it) => it.part.defId === spec.defId);
  return index >= 0 ? pool.splice(index, 1)[0] : null;
}

function seatedCore(world: World, spec: CoreSpec, old: PartItem | null): GridItem {
  const [id, part] = old ? [old.id, old.part] : [newId(world, 'i'), makePart(world, spec.defId, 0)];
  return { id, kind: 'part', part, x: spec.x, y: spec.y, rot: spec.rot ?? 0 };
}

function fitRank(item: GridItem): number {
  if (item.kind === 'part') return partDef(item.part.defId).kind === 'cargo' ? 0 : 2;
  return item.kind === 'parcel' ? 1 : 3;
}

function fitItems(v: Vehicle): GridItem[] {
  const dropped = misfits(v);
  if (dropped.length === 0) return [];
  v.items = v.items.filter((it) => !dropped.includes(it));
  forget(v, idsOf(dropped));
  return dropped;
}

function misfits(v: Vehicle): GridItem[] {
  const mountedCores: GridItem[] = mountedItems(v, 'core');
  const kept: GridItem[] = v.items.filter((it) => mountedCores.includes(it));
  const dropped: GridItem[] = [];
  const rest = v.items.filter((it) => !kept.includes(it)).sort((a, b) => fitRank(a) - fitRank(b));
  for (const item of rest) {
    const grid = gridOf({ ...v, items: kept });
    if (fitsGrid(grid, kept, item)) kept.push(item);
    else if (!relocated(grid, kept, item)) dropped.push(item);
  }
  return dropped;
}

function fitsGrid(grid: Grid, kept: GridItem[], item: GridItem): boolean {
  return onDeadRow(grid, item) || placementError(grid, kept, item, item.id) === null;
}

function relocated(grid: Grid, kept: GridItem[], item: GridItem): boolean {
  if (item.kind === 'part') return false;
  const spot = findSpot(grid, kept, item, null, null);
  if (!spot) return false;
  Object.assign(item, spot);
  kept.push(item);
  return true;
}

function displaced(world: World, item: GridItem): void {
  if (item.kind === 'parcel') dropParcelContract(world, item.contract);
  else if (item.kind === 'good') world.player.money += GOODS[item.good].value;
  else if (!isCoreItem(item)) world.player.storage.push(item.part);
}

function dropParcelContract(world: World, id: string): void {
  if (!world.player.contracts.some((c) => c.id === id)) throw new Error(`Parcel names contract ${id}, which the player does not hold`);
  world.player.contracts = world.player.contracts.filter((c) => c.id !== id);
}

function removeNpcs(world: World, doomed: ReadonlySet<string>): void {
  if (doomed.size === 0) return;
  const templates = new Set(world.vehicles.flatMap((v) => (doomed.has(v.id) && v.brain ? [v.brain.templateId] : [])));
  world.vehicles = world.vehicles.filter((v) => !doomed.has(v.id));
  if (world.player.call && doomed.has(world.player.call.with)) world.player.call = null;
  settleStates(world);
  settleAims(world);
  for (const c of world.player.contracts.filter((x) => !isMet(x) && namesGone(world, x, doomed, templates))) settleLost(world, c);
}

function namesGone(world: World, c: Contract, doomed: ReadonlySet<string>, templates: ReadonlySet<string>): boolean {
  if (c.kind === 'escort' || c.kind === 'rescue') return doomed.has(c.client);
  if (c.kind === 'search') return doomed.has(c.target);
  return c.kind === 'bounty' && templates.has(c.template) && bountyLapsed(world, c);
}

function settleLost(world: World, c: Contract): void {
  if (c.kind === 'escort') settleEscortJob(world, c);
  else finishContract(world, c, 'lapsed');
}

function allParts(world: World): PartInstance[] {
  return [
    ...world.vehicles.flatMap((v) => v.items.filter(isPartItem).map((it) => it.part)),
    ...world.player.storage,
    ...world.salvage.flatMap((s) => [...s.parts, ...s.hidden.parts]),
    ...Object.values(world.shops).flatMap((s) => s.stock),
    ...(world.furyRoad?.outposts ?? []).flatMap((o) => o.stock),
  ];
}

function clampParts(world: World): void {
  for (const part of allParts(world)) {
    part.wear = Math.min(CONDITION.maxWear + 1, Math.max(0, part.wear));
    if (part.hp > maxHp(part)) carryHp(part, part.hp);
    clampGun(part);
    clampCharge(part);
  }
}

function clampGun(part: PartInstance): void {
  const def = partDef(part.defId);
  if (def.kind !== 'weapon') return void delete part.gun;
  if (!part.gun) return void Object.assign(part, gunFor(part.defId));
  part.gun.ammo = Math.min(part.gun.ammo, def.magazine);
  part.gun.cooldown = Math.min(part.gun.cooldown, def.cooldown);
}

function clampCharge(part: PartInstance): void {
  const fresh = chargeFor(part.defId).charge;
  if (!fresh) return void delete part.charge;
  if (!part.charge) return void (part.charge = fresh);
  part.charge.reload = Math.min(part.charge.reload, wornReload(part));
}

function repairShops(world: World): void {
  for (const id of Object.keys(world.shops)) if (!Object.hasOwn(SHOPS, id)) delete world.shops[id];
  for (const [id, state] of Object.entries(world.shops)) {
    fitGoods(state, SHOPS[id]);
    fitEvent(id, state);
  }
  if (modeRules(world).traffic) addMissingShops(world);
}

function addMissingShops(world: World): void {
  for (const id of Object.keys(SHOPS)) if (!Object.hasOwn(world.shops, id)) addShop(world, id);
}

function fitEvent(id: string, state: ShopState): void {
  const event = state.event;
  if (event && !SITE_EVENTS.some((e) => e.site === id && e.kind === event.kind && e.recipe === event.recipe)) state.event = null;
}

function fitGoods(state: ShopState, def: ShopDefinition): void {
  for (const good of Object.keys(state.goods)) if (!def.goods.includes(good)) delete state.goods[good];
  for (const good of def.goods) if (!Object.hasOwn(state.goods, good)) state.goods[good] = 0;
}

function isName(name: string): boolean {
  const [first, last, ...rest] = name.split(' ');
  return rest.length === 0 && FIRST_NAMES.includes(first) && SURNAMES.includes(last);
}

function hashOf(text: string): number {
  let hash = 2166136261;
  for (const ch of text) hash = Math.imul(hash ^ ch.codePointAt(0)!, 16777619) >>> 0;
  return hash;
}

function nameFor(seed: string, taken: ReadonlySet<string>): string {
  const tries = FIRST_NAMES.length * SURNAMES.length;
  for (let k = 0; k < tries; k++) {
    const hash = hashOf(`${seed}#${k}`);
    const name = `${FIRST_NAMES[hash % FIRST_NAMES.length]} ${SURNAMES[(hash >>> 8) % SURNAMES.length]}`;
    if (!taken.has(name)) return name;
  }
  throw new Error(`Every driver name is taken, so ${seed} cannot get one`);
}

function renameDrivers(world: World): void {
  const renames = new Map<string, string>();
  const taken = new Set(world.vehicles.flatMap((v) => (v.brain && isName(v.brain.driver) ? [v.brain.driver] : [])));
  const fixed = (name: string, seed: string): string => {
    if (isName(name)) return name;
    const known = renames.get(name);
    if (known !== undefined) return known;
    const next = nameFor(seed, taken);
    taken.add(next);
    renames.set(name, next);
    return next;
  };
  for (const v of world.vehicles) if (v.brain) v.brain.driver = fixed(v.brain.driver, v.id);
  for (const c of [...world.player.contracts, ...Object.values(world.shops).flatMap((s) => s.contracts)]) renameInContract(c, fixed);
}

function renameInContract(c: Contract, fixed: (name: string, seed: string) => string): void {
  if (c.kind === 'rescue' || c.kind === 'search') c.driver = fixed(c.driver, c.id);
  if (c.kind === 'claim') for (const lead of c.leads) lead.driver = fixed(lead.driver, c.id);
}

function repairPlayer(world: World): void {
  const player = world.player;
  player.notes = player.notes.filter((n) => isNoteId(n.id));
  for (const skill of SKILL_IDS) {
    if (player.ranks[skill] === undefined) player.ranks[skill] = 0;
    if (player.xpToday[skill] === undefined) player.xpToday[skill] = 0;
  }
  player.perks = player.perks.filter(isPerkId);
}

function talkFits(call: Call): boolean {
  if (call.topic === null) return call.node === HUB || call.node === REFUSED;
  return Object.hasOwn(TOPICS, call.topic) && Object.hasOwn(TOPICS[call.topic].nodes, call.node);
}

function isLine(id: string): boolean {
  return (LINE_IDS as readonly string[]).includes(id);
}

function trades(shop: string, good: string): boolean {
  return isShop(shop) && SHOPS[shop].goods.includes(good);
}

function cueFits(cue: Cue): boolean {
  if (cue.kind === 'site') return isSite(cue.id);
  return cue.kind !== 'deck' || DECKS.some((d) => d.id === cue.id);
}

function roadFits(road: RoadName): boolean {
  return road.kind !== 'to' || isSite(road.site);
}

function wayFits(step: DirectionStep): boolean {
  return (!('at' in step) || cueFits(step.at)) && (!('road' in step) || roadFits(step.road));
}

function stepFits(step: DirectionStep): boolean {
  if (step.do === 'arrive') return isSite(step.site);
  if (step.do === 'search') return step.clue.kind !== 'site' || isSite(step.clue.id);
  return wayFits(step);
}

const CALL_VAR_FITS: { [K in CallVar['kind']]: (v: Extract<CallVar, { kind: K }>) => boolean } = {
  town: (v) => isSite(v.id),
  site: (v) => isSite(v.id),
  money: () => true,
  count: () => true,
  deal: () => true,
  haul: (v) => Object.keys(v.goods).every(isGood) && v.parts.every(isPart),
  aid: () => true,
  prices: (v) => v.goods.every((g) => trades(v.town, g.good)),
  tip: (v) => v.tip === null || trades(v.tip.shop, v.tip.good),
  sighting: (v) => isName(v.driver),
  bearing: () => true,
  distance: () => true,
  answer: () => true,
  line: (v) => isLine(v.line),
  directions: (v) => v.steps.every(stepFits),
};

function varsFit(vars: CallVars): boolean {
  return Object.values(vars).every((v) => (CALL_VAR_FITS[v.kind] as (v: CallVar) => boolean)(v));
}

function repairCall(world: World): void {
  const call = world.player.call;
  if (!call) return;
  if (!talkFits(call) || !isLine(call.line.line) || !varsFit(call.vars) || !varsFit(call.line.vars)) world.player.call = null;
}
