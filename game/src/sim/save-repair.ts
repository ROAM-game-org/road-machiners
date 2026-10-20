import { CHASSIS, chassisDef } from '../data/chassis';
import { GOODS } from '../data/goods';
import { HUB, LINE_IDS, REFUSED, TOPICS } from '../data/dialogue';
import { isNoteId } from '../data/locals';
import { SHOPS, SITE_EVENTS } from '../data/market';
import { FURY_ROAD } from '../data/modes';
import { FIRST_NAMES, NPCS, SURNAMES, TRAITS } from '../data/npcs';
import { PARTS, partDef } from '../data/parts';
import { PERSONALITIES } from '../data/personalities';
import { REGION } from '../data/region';
import { SKILL_IDS } from '../data/skills';
import { HAULER_KIT, START_KITS } from '../data/start';
import { CONDITION } from '../data/wear';
import { settleAims } from './combat';
import { newId, chargeFor, gunFor, makePart, addCoreParts } from './factory';
import { findSpot, gridOf, mountedItems, onDeadRow, placementError, type Grid } from './grid';
import { addGoods } from './inventory';
import { addShop, parcelOf, removeParcel, type Contract, type ShopState } from './market';
import { reviseMemories } from './memory';
import { getResources } from './resources';
import { isPerkId } from './progress';
import { modeRules } from './settings';
import { endState, STATE_KINDS, settleStates } from './states';
import { fuelCap, suppliesCap } from './stats';
import type { Call, GridItem, Job, NpcActivity, NpcState, OutpostFacts, PartInstance, RefitJob, RefitPickup, SalvageStock, Vehicle, World } from './types';
import { carryHp, maxHp } from './wear';
import { wornReload } from './utility';

type PartItem = Extract<GridItem, { kind: 'part' }>;
type ParcelItem = Extract<GridItem, { kind: 'parcel' }>;
type ShopDefinition = (typeof SHOPS)[string];

export function repairContent(world: World): string[] {
  const lost: string[] = [];
  dropStateKinds(world);
  dropGoneContent(world, lost);
  const doomed = new Set<string>();
  repairTrucks(world, doomed, lost);
  removeNpcs(world, doomed);
  clampParts(world);
  for (const v of world.vehicles) fitGoals(world, v);
  repairShops(world);
  renameDrivers(world);
  lost.push(...repairPlayer(world));
  repairCall(world);
  for (const v of world.vehicles) fitPriceMemories(v);
  fitRoadNews(world);
  fitSites(world);
  fitWaves(world);
  return [...new Set(lost)];
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

function goalFits(world: World, goal: NpcActivity): boolean {
  if (!targetFits(world, goal)) return false;
  const names = goalNames(goal);
  return names.goods.every(isGood) && names.shops.every(isShop);
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

function dropGoneContent(world: World, lost: string[]): void {
  const own = ownTruckIds(world);
  for (const v of world.vehicles) {
    const gone = stripVehicle(v);
    if (own.has(v.id)) lost.push(...gone);
  }
  lost.push(...world.player.storage.filter((p) => !isPart(p.defId)).map((p) => p.defId));
  world.player.storage = knownParts(world.player.storage);
  for (const stock of world.salvage) stripSalvage(stock);
  for (const shop of Object.values(world.shops)) stripShop(shop);
  for (const outpost of outpostsOf(world)) outpost.stock = knownParts(outpost.stock);
  dropOwnContracts(world, lost);
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
  shop.contracts = shop.contracts.filter((c) => contractGone(c) === null);
}

function knownParts(parts: PartInstance[]): PartInstance[] {
  return parts.filter((p) => isPart(p.defId));
}

function dropUnknownKeys(goods: Record<string, number>): void {
  for (const good of Object.keys(goods)) if (!isGood(good)) delete goods[good];
}

function stripVehicle(v: Vehicle): string[] {
  const gone = v.items.filter((it) => (isPartItem(it) && !isPart(it.part.defId)) || (it.kind === 'good' && !isGood(it.good)));
  if (gone.length === 0) return [];
  v.items = v.items.filter((it) => !gone.includes(it));
  forget(v, idsOf(gone));
  return gone.map(itemContent);
}

function itemContent(item: GridItem): string {
  if (isPartItem(item)) return item.part.defId;
  if (item.kind === 'good') return item.good;
  return item.contract;
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

function contractGone(c: Contract): string | null {
  return goneIf(isShop, c.shop) ?? contentGone(c);
}

const CONTRACT_CONTENT: { [K in Contract['kind']]: (c: Extract<Contract, { kind: K }>) => string | null } = {
  haul: (c) => goneIf(isGood, c.good) ?? goneIf(isShop, c.to),
  escort: (c) => goneIf(isSite, c.to),
  fetch: (c) => goneIf(isPart, c.defId),
  claim: (c) => goneIf(isPart, c.defId),
  bounty: (c) => goneIf(isTemplate, c.template),
  search: (c) => goneIf(isTemplate, c.template),
  rescue: () => null,
  survey: () => null,
};

function contentGone(c: Contract): string | null {
  return (CONTRACT_CONTENT[c.kind] as (c: Contract) => string | null)(c);
}

function goneIf(known: (id: string) => boolean, id: string): string | null {
  return known(id) ? null : id;
}

function isTemplate(id: string): boolean {
  return Object.hasOwn(NPCS, id);
}

function dropOwnContracts(world: World, lost: string[]): void {
  const doomed = world.player.contracts.filter((c) => contractGone(c) !== null);
  if (doomed.length === 0) return;
  const truck = world.vehicles.find((v) => v.id === world.player.vehicleId);
  for (const c of doomed) if (c.kind === 'search' && truck && parcelOf(truck, c.id)) removeParcel(truck, c.id);
  lost.push(...doomed.map((c) => contractGone(c)!));
  world.player.contracts = world.player.contracts.filter((c) => !doomed.includes(c));
}

function dropHulks(world: World): void {
  for (const o of world.obstacles) if (o.kind !== 'landmark' && o.hulk && !isChassis(o.hulk.chassisId)) delete o.hulk;
}

function ownTruckIds(world: World): Set<string> {
  return new Set([world.player.vehicleId, ...(world.furyRoad ? [world.furyRoad.hauler.id] : [])]);
}

function repairTrucks(world: World, doomed: Set<string>, lost: string[]): void {
  const own = ownTruckIds(world);
  for (const v of world.vehicles) {
    if (own.has(v.id)) repairOwnTruck(world, v, lost);
    else repairNpc(world, v, doomed);
  }
}

function repairOwnTruck(world: World, v: Vehicle, lost: string[]): void {
  if (!isChassis(v.chassisId)) {
    lost.push(v.chassisId);
    swapChassis(world, v, lost);
  } else if (!coresSeated(v)) reseatCores(world, v, lost);
  lost.push(...fitItems(world, v, true));
}

function repairNpc(world: World, v: Vehicle, doomed: Set<string>): void {
  if (unknownOf(v) === null && coresSeated(v)) fitItems(world, v, false);
  else doomed.add(v.id);
}

function unknownOf(v: Vehicle): string | null {
  if (!isChassis(v.chassisId)) return v.chassisId;
  const brain = v.brain;
  if (!brain) return null;
  if (!Object.hasOwn(NPCS, brain.templateId)) return brain.templateId;
  const trait = brain.traits.find((id) => !Object.hasOwn(TRAITS, id));
  if (trait !== undefined) return trait;
  return Object.hasOwn(PERSONALITIES, brain.personality) ? null : brain.personality;
}

function startChassis(world: World, v: Vehicle): string {
  return v.id === world.player.vehicleId ? START_KITS.standard.chassis : HAULER_KIT.chassis;
}

function swapChassis(world: World, v: Vehicle, lost: string[]): void {
  const spares = v.items.filter(isPartItem).filter((it) => !isCoreItem(it));
  const parcels = v.items.filter((it): it is ParcelItem => it.kind === 'parcel');
  const goods = Object.entries(goodsHeld(v));
  world.player.storage.push(...spares.map((it) => it.part));
  v.chassisId = startChassis(world, v);
  v.items = [];
  v.weaponOrders = {};
  v.utilityOrders = {};
  v.job = null;
  addCoreParts(world, v);
  for (const parcel of parcels) if (!placeParcel(v, parcel)) lost.push(...dropParcelContract(world, parcel.contract));
  for (const [good, units] of goods) for (let i = addGoods(world, v, good, units); i < units; i++) lost.push(good);
  fitFuel(world, v);
}

function goodsHeld(v: Vehicle): Record<string, number> {
  const held: Record<string, number> = {};
  for (const it of v.items) if (it.kind === 'good') held[it.good] = (held[it.good] ?? 0) + 1;
  return held;
}

function placeParcel(v: Vehicle, parcel: GridItem): boolean {
  const spot = findSpot(gridOf(v), v.items, parcel, null, null);
  if (!spot) return false;
  v.items.push({ ...parcel, ...spot });
  return true;
}

function fitFuel(world: World, v: Vehicle): void {
  const stores = getResources(world, v);
  stores.fuel = Math.min(stores.fuel, fuelCap(v));
  stores.supplies = Math.min(stores.supplies, suppliesCap(v));
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

function reseatCores(world: World, v: Vehicle, lost: string[]): void {
  const pool = v.items.filter(isPartItem).filter(isCoreItem) as PartItem[];
  const seated = chassisDef(v.chassisId).core.map((spec) => seatedCore(world, spec, takeCore(pool, spec)));
  lost.push(...pool.map((it) => it.part.defId));
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

function fitItems(world: World, v: Vehicle, mine: boolean): string[] {
  const dropped = misfits(v);
  if (dropped.length === 0) return [];
  v.items = v.items.filter((it) => !dropped.includes(it));
  forget(v, idsOf(dropped));
  return dropped.flatMap((item) => displaced(world, item, mine));
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

function displaced(world: World, item: GridItem, mine: boolean): string[] {
  if (item.kind === 'parcel') return dropParcelContract(world, item.contract);
  if (!isPartItem(item) || !mine || isCoreItem(item)) return [itemContent(item)];
  world.player.storage.push(item.part);
  return [];
}

function dropParcelContract(world: World, id: string): string[] {
  const contract = world.player.contracts.find((c) => c.id === id);
  if (!contract) throw new Error(`Parcel names contract ${id}, which the player does not hold`);
  world.player.contracts = world.player.contracts.filter((c) => c !== contract);
  return [contract.kind === 'search' ? contract.template : contract.id];
}

function removeNpcs(world: World, doomed: ReadonlySet<string>): void {
  if (doomed.size === 0) return;
  world.vehicles = world.vehicles.filter((v) => !doomed.has(v.id));
  if (world.player.call && doomed.has(world.player.call.with)) world.player.call = null;
  settleStates(world);
  settleAims(world);
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

function repairPlayer(world: World): string[] {
  const player = world.player;
  const unknown = player.notes.filter((n) => !isNoteId(n.id));
  if (unknown.length > 0) player.notes = player.notes.filter((n) => isNoteId(n.id));
  for (const skill of SKILL_IDS) {
    if (player.ranks[skill] === undefined) player.ranks[skill] = 0;
    if (player.xpToday[skill] === undefined) player.xpToday[skill] = 0;
  }
  const perks = player.perks.filter((id) => !isPerkId(id));
  player.perks = player.perks.filter(isPerkId);
  return [...unknown.map((n) => n.id), ...perks];
}

function talkGone(call: Call): string | null {
  if (call.topic === null) return call.node === HUB || call.node === REFUSED ? null : call.node;
  if (!Object.hasOwn(TOPICS, call.topic)) return call.topic;
  return Object.hasOwn(TOPICS[call.topic].nodes, call.node) ? null : call.node;
}

function lineGone(call: Call): string | null {
  return goneIf((id) => (LINE_IDS as readonly string[]).includes(id), call.line.line);
}

function repairCall(world: World): void {
  const call = world.player.call;
  if (call && (talkGone(call) ?? lineGone(call)) !== null) world.player.call = null;
}
