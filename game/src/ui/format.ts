
import { CONTRACTS } from '../data/market';
import { partDef } from '../data/parts';
import { isMet, siteOf, type Contract } from '../sim/market';
import { openSurveyPoint, surveyClue, surveyPlaceType, type SurveyClue, type SurveyContract } from '../sim/survey';
import { claimClue, rivalRunning } from '../sim/claims';
import type { ClaimLook } from '../data/market';
import { createIcon } from './cards';
import { el } from './dom';
import { escortStatus, turnsLeft } from '../sim/escort-job';
import { PERK_LEVELS } from '../data/skills';
import { TERRAIN } from '../data/terrain';
import { TIME } from '../data/time';
import { playerVehicle, vehicleById } from '../sim/damage';
import { gaveUp, isKnockedOut } from '../sim/defeat';
import { OPENING_WRECK_ID } from '../sim/opening';
import type { Work, WorkLeft } from '../sim/states';
import { dist } from '../sim/vec';
import { goodsCount } from '../sim/grid';
import { spareParts } from '../sim/inventory';
import { carriedPart, isStoryWreck } from '../sim/salvage';
import { canVehicleSee, playerSees } from '../sim/vision';
import { topGoal } from '../sim/npc-activities';
import { judgeDanger, npcTraits, passReason } from '../sim/npc-decisions';
import { huntsOffRoad } from '../sim/hunt-style';
import { isHostile } from '../sim/combat';
import { trackOf } from '../sim/tracks';
import { hasBasic, hasPerk } from '../sim/progress';
import { canLookOver, knowsCargo } from '../sim/look-over';
import { aidData, lootWarningData, pleaData, statesHeld, strayData, towData } from '../sim/states';
import { REGION } from '../data/region';
import { RULES } from '../data/rules';
import { isJunk, maxHp } from '../sim/wear';
import { clockOf } from '../sim/sun';
import type { PartHit } from '../sim/armor';
import { shotDamage } from '../sim/combat';
import { shutDownTurnsLeft } from '../sim/utility';
import type { GameEvent, GridItem, Job, NpcActivity, NpcState, PartInstance, RefitJob, ShotRound, SkillId, StateEnding, StateKindId, Vehicle, World } from '../sim/types';
import { concat, list, MINUS_SIGN, num, PLUS, t, verbatim, type Msg } from '../text/msg';
import { siteRecipes } from '../data/market';
import { keyLabel } from './input-mode';
import { driverName, factionName, fullName, goalText, goodLower, goodName, moneyReasonText, noteText, noteTitle, partName as partNameOf, professionName, refusalText, siteName, skillName, templateName, traitName, vehicleTitle } from '../text/names';
import { playerCanAct, Refused } from '../sim/world';
import { aidWords, lineText } from './dialogue';
import { isOutpostSite, outpostId } from '../sim/highway';
import { compassText, damage, distanceText, fuelLiters, hp, kg, kph, moneyM, moneyMsg } from './units';
import { seesAll } from './see-all';
import { bandAtLeast, isRaider } from '../sim/relations';

export function jobLabel(world: World, v: Vehicle, job: Job): Msg {
  if (job.kind === 'refit') return refitLabel(world, v, job);
  if (job.kind === 'business') return businessLabel(job);
  if (job.kind === 'search') return t('job.search');
  if (job.kind === 'weld') return t('job.weld');
  if (job.kind === 'survey') return t('job.survey');
  return partJobLabel(v, job);
}

function partJobLabel(v: Vehicle, job: Extract<Job, { kind: 'repair' | 'strip' }>): Msg {
  const part = v.items.find((it) => it.kind === 'part' && it.part.id === job.partId);
  const what = part ? itemName(part) : t('job.somePart');
  return job.kind === 'repair' ? t('job.repair', { part: what }) : t('job.strip', { part: what });
}

const BUSINESS_LABELS = { resupply: 'job.business.resupply', sell: 'job.business.sell', trade: 'job.business.trade' } as const;

function businessLabel(job: Extract<Job, { kind: 'business' }>): Msg {
  const key: (typeof BUSINESS_LABELS)[keyof typeof BUSINESS_LABELS] | undefined = BUSINESS_LABELS[job.deal];
  if (!key) throw new Error(`No business label for ${job.deal}`);
  const oasis = job.deal === 'resupply' && REGION.locations.some((l) => l.id === job.siteId && l.kind === 'oasis');
  return t(oasis ? 'job.business.fillWater' : key, { site: siteName(job.siteId) });
}

function refitLabel(world: World, v: Vehicle, job: RefitJob): Msg {
  const pickup = job.pickup;
  if (pickup?.from === 'truck') {
    const truck = world.vehicles.find((x) => x.id === pickup.vehicleId);
    const from = truck ? vehicleTitle(world, truck) : t('job.theTruck');
    return t('job.remove', { part: partNameIn([v, truck], [], pickup.partId), truck: from });
  }
  const moved = job.moves.flatMap((m) => v.items.filter((it) => it.id === m.itemId).map(itemName));
  const parts = [...stockPickupName(world, v, pickup), ...moved];
  return parts.length > 0 ? t('job.refit', { parts: list(parts) }) : t('job.refitNothing');
}

function stockPickupName(world: World, v: Vehicle, pickup: RefitJob['pickup']): Msg[] {
  if (pickup?.from !== 'stock') return [];
  return [partNameIn([v], world.salvage.find((s) => s.id === pickup.stockId)?.parts ?? [], pickup.partId)];
}

function partNameIn(vehicles: (Vehicle | undefined)[], loose: PartInstance[], partId: string): Msg {
  const parts = [...loose, ...vehicles.flatMap((v) => (v?.items ?? []).flatMap((it) => (it.kind === 'part' ? [it.part] : [])))];
  const part = parts.find((p) => p.id === partId);
  return part ? partNameOf(part.defId) : t('job.somePart');
}

function itemName(it: GridItem): Msg {
  if (it.kind === 'parcel') return t('item.parcel');
  return it.kind === 'part' ? partNameOf(it.part.defId) : goodName(it.good);
}

export function workLabel(world: World, v: Vehicle, work: Work): Msg {
  if (work.from === 'job') return jobLabel(world, v, work.job);
  const s = work.state;
  if (s.kind === 'aid') return aidWorkLabel(world, v, s);
  if (s.kind === 'lookOver') return lookOverLabel(world, s);
  if (s.kind !== 'patch') throw new Error(`No work label for a ${s.kind} state`);
  if (s.holder === v.id) return t('job.patch', { truck: vehicleTitle(world, vehicleById(world, s.other)) });
  return t('job.patchedBy', { truck: vehicleTitle(world, vehicleById(world, s.holder)) });
}

function lookOverLabel(world: World, s: NpcState): Msg {
  return s.other === world.player.vehicleId ? t('state.lookOver') : t('job.lookOver', { truck: vehicleTitle(world, vehicleById(world, s.other)) });
}

export function aidGoods(s: NpcState): Msg {
  const data = aidData(s);
  return aidWords(data.fuel, data.supplies);
}

function aidWorkLabel(world: World, v: Vehicle, s: NpcState): Msg {
  const npc = vehicleTitle(world, vehicleById(world, s.holder));
  const playerGives = aidData(s).giver === 'player';
  const goods = aidGoods(s);
  if (v.id === s.holder) return playerGives ? t('job.takingFromYou', { goods }) : t('job.givingYou', { goods });
  return playerGives ? t('job.givingTo', { goods, truck: npc }) : t('job.takingFrom', { goods, truck: npc });
}

export function workProgress(work: WorkLeft): number {
  return 1 - work.turnsLeft / work.total;
}

export function wearLabel(part: PartInstance): Msg {
  if (isJunk(part)) return t('cond.junk');
  if (part.wear === 0) return t('cond.pristine');
  return t('cond.rebuilt', { n: part.wear });
}

export type ConditionTier = 'pristine' | `w${number}` | 'junk';

export function conditionTier(part: PartInstance): ConditionTier {
  if (isJunk(part)) return 'junk';
  if (part.wear === 0) return 'pristine';
  return `w${part.wear}`;
}

export function showsCondition(part: PartInstance): boolean {
  return partDef(part.defId).kind !== 'core';
}

export function conditionStatus(part: PartInstance): { text: Msg; tone: 'dim' | 'bad' } {
  if (isJunk(part)) return { text: t('cond.scrapOnly'), tone: 'dim' };
  if (part.hp === 0) return { text: t('cond.broken'), tone: 'bad' };
  return { text: t('cond.hp', { hp: hp(part.hp), max: hp(maxHp(part)) }), tone: 'dim' };
}

const OBSTACLE_ID = new RegExp(`^(wreck|rock|bld|${OPENING_WRECK_ID}$)`);

export function vehicleName(world: World, id: string): Msg {
  if (id === world.player.vehicleId) return t('log.you');
  const v = findAny(world, id);
  if (v) return vehicleTitle(world, v);
  return OBSTACLE_ID.test(id) || isStoryWreck({ id }) ? t('log.anObstacle') : t('log.something');
}

function findAny(world: World, id: string): Vehicle | undefined {
  return world.vehicles.find((v) => v.id === id) ?? world.removed.find((v) => v.id === id);
}

function partName(world: World, vehicleId: string, partId: string): Msg {
  const p = carriedPart(world, vehicleId, partId);
  return p ? partNameOf(p.defId) : t('job.somePart');
}

export function formatNpcActivity(world: World, vehicle: Vehicle): Msg | null {
  if (!vehicle.brain || !playerSees(world, vehicle.pos)) return null;
  if (isKnockedOut(vehicle)) return gaveUp(vehicle) ? t('npc.gaveUp') : t('npc.knockedOut');
  const activity = topGoal(vehicle);
  return activity ? goalLine(activity) : null;
}

function goalLine(activity: NpcActivity): Msg {
  const shipment = activity.shipment;
  return shipment ? t('goal.deliverShipment', { good: goodLower(shipment.good), site: siteName(shipment.to) }) : goalText(activity.reason);
}

export function formatNpcPass(world: World, vehicle: Vehicle): Msg | null {
  if (!vehicle.brain || !playerSees(world, vehicle.pos)) return null;
  if (!isRaider(vehicle) || !huntsOffRoad(vehicle.brain)) return null;
  const player = playerVehicle(world);
  const track = trackOf(vehicle, player.id);
  const kept = track?.choice === 'keep' && track.chosenInSight;
  const ignored = canVehicleSee(world, vehicle, player.pos) && !isHostile(world, vehicle, player);
  if (!kept && !ignored) return null;
  return t('npc.letsPass', { why: t(`pass.${passReason(world, vehicle, player, judgeDanger(world, vehicle, player))}`) });
}

function revealedBy(world: World, perk: 'readDriver'): boolean {
  return hasPerk(world, perk) || seesAll();
}

export function formatNpcTraits(world: World, vehicle: Vehicle): Msg | null {
  const traits = npcTraits(vehicle);
  return revealedBy(world, 'readDriver') ? t('npc.traits', { traits: list(traits.map(traitName)) }) : null;
}

function showsCargo(world: World, vehicle: Vehicle): boolean {
  return knowsCargo(world, playerVehicle(world), vehicle) || seesAll();
}

export function formatNpcCargo(world: World, vehicle: Vehicle): Msg | null {
  if (!showsCargo(world, vehicle)) return null;
  const goods = Object.entries(goodsCount(vehicle)).map(([good, n]) => t('npc.goodCount', { good: goodName(good), n }));
  const spares = spareParts(vehicle).map((part) => partNameOf(part.defId));
  if (goods.length === 0 && spares.length === 0) return t('npc.cargoEmpty');
  if (spares.length === 0) return t('npc.cargo', { goods: list(goods) });
  if (goods.length === 0) return t('npc.spares', { spares: list(spares) });
  return t('npc.cargoAndSpares', { goods: list(goods), spares: list(spares) });
}

export function formatNpcLookOver(world: World, vehicle: Vehicle): Msg | null {
  if (!hasBasic(world, 'lookOver') || !playerCanAct(world)) return null;
  return canLookOver(world, playerVehicle(world), vehicle) === null ? keyLabel(t('npc.lookOverKey'), 'B', 'before') : null;
}

export function formatNpcMark(world: World, vehicle: Vehicle): Msg | null {
  if (!hasPerk(world, 'spotter')) return null;
  const mark = world.player.marked.find((m) => m.vehicleId === vehicle.id && world.turn <= m.until);
  return mark ? t('npc.marked', { n: mark.until - world.turn }) : keyLabel(t('npc.markKey'), 'N', 'before');
}

const STATE_LABELS: Record<StateKindId, (s: NpcState) => Msg> = {
  feud: () => t('state.feud'),
  backedOff: () => t('state.backedOff'),
  tow: (s) => (towData(s).hitched ? t('state.towing') : t('state.towOffer')),
  turnedDown: () => t('state.turnedDown'),
  towPromise: () => t('state.towPromise'),
  answering: () => t('state.answering'),
  patch: () => t('state.patch'),
  truce: () => t('state.truce'),
  grievance: () => t('state.grievance'),
  plea: (s) => (pleaData(s).plea === 'truce' ? t('state.pleaTruce') : t('state.pleaMercy')),
  trade: () => t('state.trade'),
  handover: () => t('state.handover'),
  revenge: () => t('state.revenge'),
  escort: () => t('state.escort'),
  crew: () => t('state.crew'),
  hire: () => t('state.hire'),
  cavalcade: () => t('state.cavalcade'),
  offering: () => t('state.offering'),
  drag: () => t('state.drag'),
  aid: (s) => (aidData(s).giver === 'npc' ? t('state.aidBringing') : t('state.aidWaiting')),
  combat: () => t('state.combat'),
  lootWarning: (s) => (lootWarningData(s).answer === 'comply' ? t('state.lootAgreed') : t('state.lootWarning')),
  lookOver: () => t('state.lookOver'),
  sizedUp: () => t('state.sizedUp'),
  strayFire: (s) => t('state.strayFire', { forgiven: Math.round(strayData(s).damage), of: RULES.stray.feudDamage }),
};

export function formatNpcStates(world: World, vehicle: Vehicle): Msg[] {
  const held = statesHeld(world, vehicle.id).filter((s) => s.other === world.player.vehicleId);
  const lines = held.map((s) => (s.kind === 'combat' ? t('state.combat') : turnsText(STATE_LABELS[s.kind](s), s.turnsLeft)));
  const combat = combatLine(world, vehicle);
  const own = held.findIndex((s) => s.kind === 'combat');
  const out = lines.filter((_, i) => held[i].kind !== 'combat');
  if (combat === null) return out;
  out.splice(own < 0 ? out.length : held.slice(0, own).filter((s) => s.kind !== 'combat').length, 0, combat);
  return out;
}

export function formatVehicleState(world: World, vehicle: Vehicle): Msg {
  const motion = vehicle.speed > 0 ? t('state.moving', { n: kph(vehicle.speed) }) : t('state.parked');
  const left = shutDownTurnsLeft(world, vehicle);
  const shutDown = left > 0 ? turnsText(t('state.shutDown'), left) : null;
  const brain = vehicle.brain ? [formatNpcActivity(world, vehicle), ...formatNpcStates(world, vehicle)] : [];
  const parts = [motion, shutDown, ...brain].filter((part) => part !== null);
  return parts.reduce((first, rest) => t('state.join', { first, rest }));
}

function turnsText(label: Msg, turnsLeft: number | null): Msg {
  return turnsLeft === null ? label : t('state.withTurns', { label, n: turnsLeft });
}

function combatLine(world: World, vehicle: Vehicle): Msg | null {
  const playerId = world.player.vehicleId;
  const turns = world.states
    .filter((s) => s.kind === 'combat' && ((s.holder === vehicle.id && s.other === playerId) || (s.holder === playerId && s.other === vehicle.id)))
    .map((s) => s.turnsLeft ?? 0);
  return turns.length > 0 ? turnsText(t('state.combat'), Math.max(...turns)) : null;
}

export type LogSpan = { text: Msg; cls: string };
export type LogLine = { text: Msg; cls: string; spans?: LogSpan[] };

const line = (text: Msg, cls: string): LogLine => ({ text, cls });

function recipeOutput(shopId: string, recipeId: string): string {
  const recipe = siteRecipes(shopId).find((r) => r.id === recipeId);
  if (!recipe) throw new Error(`${shopId} has no recipe ${recipeId}`);
  return Object.keys(recipe.outputs)[0];
}

function spanLine(cls: string, spans: LogSpan[]): LogLine {
  return { text: concat(spans.map((s) => s.text)), cls, spans };
}

const STATE_ENDED_TEXT: Partial<Record<StateKindId, Record<StateEnding, ((holder: Msg) => LogLine) | null>>> = {
  aid: {
    expired: (holder) => line(t('log.aidExpired', { who: holder }), 'dim'),
    fulfilled: null,
    broken: (holder) => line(t('log.aidBroken', { who: holder }), 'dim'),
  },
};

function stateEndedText(world: World, e: Extract<GameEvent, { t: 'stateEnded' }>): LogLine | null {
  if (e.state.other !== world.player.vehicleId) return null;
  const words = STATE_ENDED_TEXT[e.state.kind]?.[e.ending];
  return words ? words(vehicleName(world, e.state.holder)) : null;
}

function partDamage(hits: PartHit[]): Map<string, number> {
  const dealt = new Map<string, number>();
  for (const h of hits) if (h.damage > 0) dealt.set(h.part, (dealt.get(h.part) ?? 0) + h.damage);
  return dealt;
}

const PART_SHORT = {
  weapon: 'gun', engine: 'eng', armor: 'arm', cargo: 'cargo', scanner: 'scan', store: 'store', utility: 'util',
  cab: 'cab', transmission: 'trans', wheel: 'whl', tank: 'tank',
} as const;

function partShort(world: World, vehicleId: string, partId: string): Msg {
  const p = carriedPart(world, vehicleId, partId);
  if (!p) throw new Error(`Round hit part ${partId}, which ${vehicleId} does not carry`);
  const def = partDef(p.defId);
  return t(`short.${PART_SHORT[def.kind === 'core' ? def.role : def.kind]}`);
}

export function roundLabel(world: World, vehicleId: string, hits: PartHit[], crit: boolean): Msg | null {
  const dealt = partDamage(hits);
  if (dealt.size === 0) return null;
  const parts = list([...dealt].map(([id, d]) => t('log.partDamage', { part: partShort(world, vehicleId, id), n: damage(d) })));
  return crit ? t('log.critParts', { parts }) : parts;
}

function shotText(world: World, e: Extract<GameEvent, { t: 'shot' }>): LogLine | null {
  return firedWithLine(world, e) ? harpoonText(world, e) : gunShotText(world, e);
}

function gunShotText(world: World, e: Extract<GameEvent, { t: 'shot' }>): LogLine | null {
  const me = world.player.vehicleId;
  const damaged = shotDamage(e);
  if (e.shooter !== me && e.target !== me && !damaged.has(me)) return null;
  const strays = [...damaged].filter(([id]) => id !== e.target).flatMap(([id, h]) => [
    { text: t('log.strayHits', { who: vehicleName(world, id) }), cls: '' },
    ...damageSpans(world, id, h),
  ]);
  return spanLine(hurts(damaged.get(me)) ? 'bad' : '', [...aimedSpans(world, e, damaged.get(e.target) ?? []), ...strays]);
}

function firedWithLine(world: World, e: Extract<GameEvent, { t: 'shot' }>): boolean {
  const part = carriedPart(world, e.shooter, e.weapon);
  const def = part && partDef(part.defId);
  return def?.kind === 'weapon' && def.line !== undefined;
}

function harpoonText(world: World, e: Extract<GameEvent, { t: 'shot' }>): LogLine | null {
  const me = world.player.vehicleId;
  if (e.shooter !== me && e.target !== me) return null;
  const onTarget = shotDamage(e).get(e.target) ?? [];
  const what = harpoonOutcome(world, e);
  return spanLine(e.target === me && hurts(onTarget) ? 'bad' : '', [
    { text: t('log.harpoon', { gun: partName(world, e.shooter, e.weapon), target: vehicleName(world, e.target), what }), cls: '' },
    { text: t('log.shotChance', { pct: Math.round(e.chance * 100) }), cls: 'dim' },
    ...damageSpans(world, e.target, onTarget),
  ]);
}

function harpoonOutcome(world: World, e: Extract<GameEvent, { t: 'shot' }>): Msg {
  const held = world.lines.find((l) => l.from === e.shooter && l.fromPart === e.weapon && l.to === e.target);
  return held ? t('log.harpoonLine', { part: partName(world, e.target, held.toPart) }) : t('log.harpoonMissed');
}

function lineTornText(world: World, e: Extract<GameEvent, { t: 'lineTorn' }>): LogLine {
  const mine = e.vehicle === world.player.vehicleId;
  return spanLine(mine ? 'bad' : '', [
    { text: mine ? t('log.lineTornYou') : t('log.lineTornThem', { who: vehicleName(world, e.vehicle) }), cls: '' },
    ...damageSpans(world, e.vehicle, [{ part: e.part, damage: e.damage }]),
  ]);
}

function hurts(hits: PartHit[] | undefined): boolean {
  return hits !== undefined && hits.some((h) => h.damage > 0);
}

function hitsAim(e: Extract<GameEvent, { t: 'shot' }>, r: ShotRound): boolean {
  const onTarget = [...(r.struck === e.target ? r.hits : []), ...r.blast.filter((b) => b.vehicle === e.target).flatMap((b) => b.hits)];
  return onTarget.some((h) => h.damage > 0 && (e.aim === 'body' || h.part === e.aim));
}

function aimedSpans(world: World, e: Extract<GameEvent, { t: 'shot' }>, onTarget: PartHit[]): LogSpan[] {
  const hits = e.rounds.filter((r) => hitsAim(e, r)).length;
  const crits = e.rounds.filter((r) => r.crit).length;
  const shot = { gun: partName(world, e.shooter, e.weapon), target: vehicleName(world, e.target), hits, rounds: e.rounds.length };
  const head = e.aim === 'body' ? t('log.shot', shot) : t('log.shotAt', { ...shot, part: partName(world, e.target, e.aim) });
  return [
    { text: head, cls: '' },
    { text: t('log.shotChance', { pct: Math.round(e.damageChance * 100) }), cls: 'dim' },
    ...(crits ? [{ text: t('log.shotCrits', { n: crits }), cls: '' }] : []),
    ...damageSpans(world, e.target, onTarget),
  ];
}

function damageSpans(world: World, vehicleId: string, hits: PartHit[]): LogSpan[] {
  const parts = [...partDamage(hits)].map(([id, d]) => {
    const part = carriedPart(world, vehicleId, id);
    if (!part) throw new Error(`Round hit part ${id}, which ${vehicleId} does not carry`);
    return { part, armor: partDef(part.defId).kind === 'armor', d };
  });
  const spans = [...parts.filter((p) => !p.armor), ...parts.filter((p) => p.armor)].map(({ part, armor, d }): LogSpan => {
    const broken = part.hp <= 0;
    const hit = { part: partNameOf(part.defId), n: damage(d) };
    return { text: broken ? t('log.hitBroken', hit) : t('log.hit', hit), cls: broken ? 'bad' : armor ? 'dim' : '' };
  });
  return spans.flatMap((s, i) => [{ text: i === 0 ? t('log.damageLead') : t('log.damageSep'), cls: '' }, s]);
}

function jobText(world: World, e: Extract<GameEvent, { t: 'job' }>): LogLine | null {
  if (e.vehicle !== world.player.vehicleId || (e.outcome === 'done' && e.job.kind === 'search')) return null;
  const what = jobLabel(world, playerVehicle(world), e.job);
  const lines = {
    started: line(t('log.jobStarted', { what, n: e.job.turnsLeft }), ''),
    cancelled: line(t('log.jobCancelled', { what }), 'bad'),
    done: line(t('log.jobDone', { what }), 'good'),
  };
  return lines[e.outcome];
}

function weatherText(world: World, e: Extract<GameEvent, { t: 'weather' }>): LogLine | null {
  const ev = e.event;
  if (ev.kind === 'storm' && dist(playerVehicle(world).pos, ev.pos) - ev.radius > TERRAIN.vision.radius) return null;
  return line(t(`log.weather.${ev.kind}.${e.outcome}`), 'dim');
}

function honkText(world: World, e: Extract<GameEvent, { t: 'honk' }>): LogLine {
  if (e.vehicle === world.player.vehicleId) return line(t('log.youHonk'), 'dim');
  const v = findAny(world, e.vehicle);
  return line(v && playerSees(world, v.pos) ? t('log.honksBack', { who: vehicleTitle(world, v) }) : t('log.hornUnseen'), '');
}

function patchText(world: World, e: Extract<GameEvent, { t: 'patch' }>): LogLine | null {
  if (e.outcome === 'lapsed') return null;
  const me = world.player.vehicleId;
  const other = vehicleName(world, e.patcher === me ? e.client : e.patcher);
  const mine = e.patcher === me;
  const lines = {
    started: mine ? t('log.patchStartYou', { who: other }) : t('log.patchStartThem', { who: other }),
    done: mine ? t('log.patchDoneYou', { who: other }) : t('log.patchDoneThem', { who: other }),
    broken: t('log.patchBroken', { who: other }),
  };
  const cls = { started: '', done: 'good', broken: 'dim' }[e.outcome];
  return line(lines[e.outcome], cls);
}

function aidText(world: World, e: Extract<GameEvent, { t: 'aid' }>): LogLine {
  const me = world.player.vehicleId;
  if (e.fuel === 0 && e.supplies === 0) return line(t('log.aidNothing', { who: vehicleName(world, e.giver === me ? e.receiver : e.giver) }), 'dim');
  const goods = aidWords(e.fuel, e.supplies);
  const moved = e.paid > 0 ? t('log.aidPaid', { goods, paid: moneyMsg(e.paid) }) : goods;
  if (e.giver === me) return line(t('log.aidYouGive', { who: vehicleName(world, e.receiver), moved }), '');
  return line(t('log.aidGivesYou', { who: vehicleName(world, e.giver), moved }), 'good');
}

function aidStartedText(world: World, e: Extract<GameEvent, { t: 'aidStarted' }>): LogLine {
  const me = world.player.vehicleId;
  if (e.giver === me) return line(t('log.aidStartYou', { who: vehicleName(world, e.receiver) }), '');
  return line(t('log.aidStartThem', { who: vehicleName(world, e.giver) }), '');
}

function sayText(world: World, e: Extract<GameEvent, { t: 'say' }>): LogLine {
  const cls = e.speaker === world.player.vehicleId ? 'dim' : '';
  return line(t('log.say', { who: vehicleName(world, e.speaker), line: lineText(e.line, e.vars) }), cls);
}

function towOfferText(world: World, e: Extract<GameEvent, { t: 'towOffer' }>): LogLine {
  const who = vehicleName(world, e.by);
  const site = siteName(e.town);
  return line(e.fee > 0 ? t('log.towOffer', { who, site, fee: moneyMsg(e.fee) }) : t('log.towOfferFree', { who, site }), '');
}

function towHitchedText(world: World, e: Extract<GameEvent, { t: 'towHitched' }>): LogLine {
  return line(t('log.towHitched', { who: vehicleName(world, e.by), client: vehicleName(world, e.client), site: siteName(e.site) }), 'dim');
}

function towDoneText(world: World, e: Extract<GameEvent, { t: 'towDone' }>): LogLine {
  const by = vehicleName(world, e.by);
  const free = e.fee === 0;
  if (e.client === world.player.vehicleId) {
    return free ? line(t('log.towedYouFree', { who: by }), '') : line(t('log.towedYouPaid', { who: by, fee: moneyMsg(e.fee) }), 'bad');
  }
  const client = vehicleName(world, e.client);
  return line(free ? t('log.towedFree', { who: by, client }) : t('log.towedPaid', { who: by, client, fee: moneyMsg(e.fee) }), 'dim');
}

function escortPaidText(world: World, e: Extract<GameEvent, { t: 'escortPaid' }>): LogLine {
  return line(t('log.escortPaid', { client: vehicleName(world, e.client), who: vehicleName(world, e.by), fee: moneyMsg(e.fee) }), 'dim');
}

function escortHiredText(world: World, e: Extract<GameEvent, { t: 'escortHired' }>): LogLine {
  return line(t('log.escortHired', { client: vehicleName(world, e.client), who: vehicleName(world, e.by), site: siteName(e.site), fee: moneyMsg(e.fee) }), 'dim');
}

function crewAskedText(world: World, e: Extract<GameEvent, { t: 'crewAsked' }>): LogLine {
  return line(t(`log.crewAsked.${e.cause}`, { member: vehicleName(world, e.member), leader: vehicleName(world, e.leader) }), 'dim');
}

function crewFormedText(world: World, e: Extract<GameEvent, { t: 'crewFormed' }>): LogLine {
  return line(t('log.crewFormed', { leader: vehicleName(world, e.leader), members: list(e.members.map((id) => vehicleName(world, id))) }), 'dim');
}

function crewLeftText(world: World, e: Extract<GameEvent, { t: 'crewLeft' }>): LogLine {
  return line(t(`log.crewLeft.${e.cause}`, { member: vehicleName(world, e.member), leader: vehicleName(world, e.leader) }), 'dim');
}

function guardHiredText(world: World, e: Extract<GameEvent, { t: 'guardHired' }>): LogLine {
  return line(t('log.guardHired', { merc: vehicleName(world, e.merc), when: clock(e.until).full, fee: moneyMsg(e.fee) }), '');
}

function guardEndedText(world: World, e: Extract<GameEvent, { t: 'guardEnded' }>): LogLine {
  const lost = e.end === 'knockedOut' || e.end === 'hostile';
  return line(t(`log.guardEnded.${e.end}`, { merc: vehicleName(world, e.merc) }), lost ? 'bad' : 'dim');
}

function escortRefusedText(world: World, e: Extract<GameEvent, { t: 'escortRefused' }>): LogLine {
  return line(t('log.escortRefused', { who: vehicleName(world, e.by), client: vehicleName(world, e.client) }), 'dim');
}

function cargoSpilledText(world: World, e: Extract<GameEvent, { t: 'cargoSpilled' }>): LogLine {
  if (e.vehicle !== world.player.vehicleId) return line(t('log.cargoSpilledOther', { who: vehicleName(world, e.vehicle) }), 'good');
  return line(t('log.cargoSpilledYours', { part: partName(world, e.vehicle, e.part), n: e.units }), 'bad');
}

function pleaText(world: World, e: Extract<GameEvent, { t: 'plea' }>): LogLine | null {
  const me = world.player.vehicleId;
  if (e.from === me || e.to === me) return null;
  const who = { who: vehicleName(world, e.from), to: vehicleName(world, e.to) };
  return line(t(`log.plea.${e.plea}.${e.accepted ? 'granted' : 'refused'}`, who), 'dim');
}

function towDroppedText(world: World, e: Extract<GameEvent, { t: 'towDropped' }>): LogLine {
  const by = vehicleName(world, e.by);
  if (e.client === world.player.vehicleId) return playerTowDroppedText(by, e.reason);
  const client = vehicleName(world, e.client);
  return line(e.reason === 'gone' ? t('log.towGone', { who: by, client }) : t('log.towDropped', { who: by, client }), 'dim');
}

function playerTowDroppedText(by: Msg, reason: Extract<GameEvent, { t: 'towDropped' }>['reason']): LogLine {
  return line(t(`log.towDroppedYou.${reason}`, { who: by }), reason === 'refused' || reason === 'unhitched' ? 'dim' : 'bad');
}

function playerNotices(world: World, ...ids: string[]): boolean {
  if (world.player.fullLog) return true;
  return ids.some((id) => {
    if (id === world.player.vehicleId) return true;
    if (world.player.contacts.some((c) => c.vehicleId === id)) return true;
    const v = findAny(world, id);
    return v !== undefined && playerSees(world, v.pos);
  });
}

const NOTICED: { [K in GameEvent['t']]?: (e: Extract<GameEvent, { t: K }>) => string[] } = {
  collision: (e) => [e.a, e.b],
  partDisabled: (e) => [e.vehicle],
  cargoSpilled: (e) => [e.vehicle],
  destroyed: (e) => [e.vehicle],
  npcKnockout: (e) => [e.vehicle],
  npcWake: (e) => [e.vehicle],
  towHitched: (e) => [e.by, e.client],
  towDone: (e) => [e.by, e.client],
  towDropped: (e) => [e.by, e.client],
  plea: (e) => [e.from, e.to],
  escortPaid: (e) => [e.by, e.client],
  aidStarted: (e) => [e.giver, e.receiver],
  escortHired: (e) => [e.by, e.client],
  escortRefused: (e) => [e.by, e.client],
  crewAsked: (e) => [e.leader, e.member],
  crewFormed: (e) => [e.leader, ...e.members],
  crewFailed: (e) => [e.leader],
  crewLeft: (e) => [e.leader, e.member],
  crewLed: (e) => [e.leader, e.fallen],
  crewDisbanded: (e) => [e.leader],
  lootArgument: (e) => [e.warner, e.looter],
  caltrops: (e) => [e.vehicle],
  lineTorn: (e) => [e.vehicle],
  claymore: (e) => [e.vehicle, e.other],
};

function unnoticed(world: World, e: GameEvent): boolean {
  const vehicles = NOTICED[e.t] as ((e: GameEvent) => string[]) | undefined;
  return vehicles !== undefined && !playerNotices(world, ...vehicles(e));
}

function searchedText(stock: string): LogLine {
  const site = [...REGION.towns, ...REGION.locations].some((l) => l.id === stock);
  return line(site ? t('log.searchDoneAt', { site: siteName(stock) }) : t('log.searchDone'), 'good');
}

const CONTRACT_CLS = { accepted: '', found: 'good', surveyed: 'dim', fulfilled: 'good', expiring: 'bad', done: 'good', failed: 'bad', lapsed: 'dim', released: '', apart: 'bad' } as const;

function escortContractText(outcome: keyof typeof CONTRACT_CLS, what: Msg, reward: number): Msg {
  if (outcome === 'accepted' || outcome === 'done') return t(`log.escort.${outcome}`, { what, reward: moneyMsg(reward) });
  if (outcome === 'failed' || outcome === 'released' || outcome === 'apart') return t(`log.escort.${outcome}`, { what });
  throw new Error(`An escort is never ${outcome}`);
}

export function isNotable(e: GameEvent): boolean {
  if (e.t === 'contract') return e.outcome === 'found' || e.outcome === 'fulfilled' || e.cause === 'rival';
  return e.t === 'skillUp' || e.t === 'discover' || e.t === 'standing' || e.t === 'claimRival';
}

function contractEventText(e: Extract<GameEvent, { t: 'contract' }>): LogLine {
  if (e.outcome !== 'found') return contractText(e.contract, e.outcome);
  return line(t('log.contract.found', { place: t(`contract.place.${surveyPlaceType(e.site)}`), site: siteName(e.contract.shop) }), CONTRACT_CLS.found);
}

function contractText(c: Contract, outcome: Exclude<keyof typeof CONTRACT_CLS, 'found'>): LogLine {
  const cls = CONTRACT_CLS[outcome];
  if (outcome === 'surveyed') {
    if (c.kind !== 'survey') throw new Error(`Only a survey is surveyed, not a ${c.kind} contract`);
    return line(t('log.contract.surveyed', { done: c.points.filter((p) => p.done).length, n: c.points.length }), cls);
  }
  if (outcome === 'fulfilled') return line(fulfilledText(c), cls);
  if (outcome === 'lapsed' && c.kind === 'rescue') return line(t('log.contract.rescueLapsed', { driver: verbatim(c.driver) }), cls);
  const what = contractSummary(c);
  if (c.kind === 'search' && (outcome === 'failed' || outcome === 'lapsed')) return line(t(SEARCH_ENDS[outcome], { what }), cls);
  if (c.kind === 'escort') return line(escortContractText(outcome, what, c.reward), cls);
  if (outcome === 'released' || outcome === 'apart') throw new Error(`Only an escort is ${outcome}, not a ${c.kind} contract`);
  const text = outcome === 'expiring' ? t('log.contract.expiring', { what, due: contractDue(c) }) : t(`log.contract.${outcome}`, { what, reward: moneyMsg(c.reward) });
  return line(text, cls);
}

const SEARCH_ENDS = { failed: 'log.contract.searchFailed', lapsed: 'log.contract.searchLapsed' } as const;

function fulfilledText(c: Contract): Msg {
  if (c.kind === 'survey') return t('log.contract.surveyMet', { reward: moneyMsg(c.reward), site: siteName(c.shop) });
  if (c.kind === 'search') return t('log.contract.parcelHanded', { who: searchTarget(c), reward: moneyMsg(c.reward), site: siteName(c.shop) });
  if (c.kind === 'rescue') return t('log.contract.rescueFulfilled', { driver: verbatim(c.driver), reward: moneyMsg(c.reward), site: siteName(c.shop) });
  if (c.kind !== 'bounty') throw new Error(`Only a bounty, a rescue, a search or a survey is fulfilled, not a ${c.kind} contract`);
  return t('log.contract.fulfilled', { target: templateName(c.template), reward: moneyMsg(c.reward), site: siteName(c.shop) });
}

export function parcelTitle(world: World, parcel: Extract<GridItem, { kind: 'parcel' }>): Msg {
  const c = world.player.contracts.find((x) => x.id === parcel.contract);
  if (c?.kind !== 'search') throw new Error(`Parcel ${parcel.id} has no search contract ${parcel.contract}`);
  return t('item.parcelFor', { who: searchTarget(c) });
}

export function searchTarget(c: Extract<Contract, { kind: 'search' }>): Msg {
  return t('vehicle.npc', { profession: professionName(c.template), driver: fullName(c.driver) });
}

function rivalFirstText(world: World, c: Contract): LogLine {
  if (c.kind !== 'claim' || c.rival === null) throw new Error(`Contract ${c.id} lapsed to a rival it never had`);
  const rival = world.vehicles.find((v) => v.id === c.rival) ?? world.removed.find((v) => v.id === c.rival);
  if (!rival) throw new Error(`No rival truck ${c.rival} for contract ${c.id}`);
  return line(t('log.contract.lapsedRival', { driver: driverName(rival), part: partNameOf(c.defId), shop: siteName(c.shop) }), 'bad');
}

export function contractSummary(c: Contract): Msg {
  if (c.kind === 'haul') {
    const haul = { n: c.units, good: goodName(c.good), site: siteName(c.to) };
    return c.rush ? t('contract.rushHaul', haul) : t('contract.haul', haul);
  }
  if (c.kind === 'fetch') return t('contract.fetch', { part: partNameOf(c.defId), site: siteName(c.shop), n: CONTRACTS.fetch.maxWear });
  if (c.kind === 'survey') return isMet(c) ? t('contract.surveyMet', { site: siteName(c.shop) }) : t('contract.survey', { places: surveyPlaces(c) });
  if (c.kind === 'claim') return claimSummary(c);
  if (c.kind === 'escort') return t('contract.escort', { site: siteName(c.to) });
  if (c.kind === 'rescue') return c.fulfilled ? t('contract.rescueMet', { driver: verbatim(c.driver), site: siteName(c.shop) }) : t('contract.rescue', { driver: verbatim(c.driver) });
  if (c.kind === 'search') return t(c.delivered ? 'contract.searchMet' : 'contract.search', { who: searchTarget(c), site: siteName(c.shop) });
  const bounty = { target: templateName(c.template), site: siteName(c.shop) };
  return c.fulfilled ? t('contract.bountyMet', bounty) : t('contract.bountyAt', bounty);
}

export function gameHours(turns: number): number {
  return Math.max(1, Math.round(turns / (TIME.turnsPerDay / 24)));
}

function surveyPlaces(c: SurveyContract): Msg {
  const types = [...new Set(c.points.map((p) => surveyPlaceType(p.site)))];
  return list(types.map((type) => t(`contract.place.${type}`)));
}

export function surveyProgress(c: SurveyContract): Msg {
  return t('contract.surveyed', { done: c.points.filter((p) => p.done).length, n: c.points.length });
}

export function surveyClueText(clue: SurveyClue): Msg {
  return t('contract.surveyClue', { dir: compassText(clue.rad), site: siteName(clue.landmark), distance: distanceText(clue.tiles), lay: t(`contract.lay.${clue.lay}`) });
}

export function nextSurveyClue(c: SurveyContract): Msg | null {
  const open = openSurveyPoint(c);
  return open ? surveyClueText(surveyClue(c, open)) : null;
}

function claimSummary(c: Extract<Contract, { kind: 'claim' }>): Msg {
  const clue = claimClue(c);
  const words = { part: partNameOf(c.defId), wreck: claimLookText(clue.look), bearing: compassText(clue.angle), shop: siteName(c.shop), distance: distanceText(clue.distance) };
  return clue.territory ? t('contract.salvageIn', { ...words, place: siteName(clue.territory) }) : t('contract.salvage', words);
}

export function claimLookText(look: ClaimLook): Msg {
  return t(`claim.look.${look}`);
}

export function claimRivalMark(world: World, c: Contract): HTMLElement | null {
  const rival = c.kind === 'claim' ? rivalRunning(world, c) : null;
  return rival ? el('div', { class: 'claim-rival dim' }, createIcon('driver'), t('contract.rivalOut', { driver: driverName(rival) })) : null;
}

function claimRivalText(world: World, e: Extract<GameEvent, { t: 'claimRival' }>): LogLine | null {
  const c = world.player.contracts.find((x) => x.id === e.contract);
  if (c?.kind !== 'claim') return null;
  return line(t('log.contract.rival', { shop: siteName(c.shop), driver: driverName(vehicleById(world, e.vehicle)), part: partNameOf(c.defId) }), 'bad');
}

function claimLeadText(world: World, e: Extract<GameEvent, { t: 'claimLead' }>): LogLine {
  const c = world.player.contracts.find((x) => x.id === e.contract);
  if (c?.kind !== 'claim') throw new Error(`A lead names claim ${e.contract}, which the player does not hold`);
  return line(t('log.noted', { title: partNameOf(c.defId) }), 'good');
}

export function rescueWhere(c: Extract<Contract, { kind: 'rescue' }>): Msg {
  const shop = siteOf(c.shop).pos;
  const rad = Math.atan2(c.area.y - shop.y, c.area.x - shop.x);
  return t('contract.rescueWhere', { distance: distanceText(dist(shop, c.area)), direction: compassText(rad), site: siteName(c.shop) });
}

export function contractWindow(c: Contract): Msg {
  return t('contract.window', { h: gameHours(c.window) });
}

export function contractDue(c: Contract): Msg {
  return t('contract.due', { when: clock(c.deadline + 1).full });
}

export function heldContractDue(c: Contract): Msg {
  if (c.kind === 'escort') return t('contract.noDeadline');
  return isMet(c) ? t('contract.ready') : contractDue(c);
}

export function escortLeaves(c: Contract): Msg {
  return t('contract.leaves', { when: clock(c.deadline + 1).full });
}

export function escortStatusText(world: World, c: Contract): Msg | null {
  if (c.kind !== 'escort') return null;
  const status = escortStatus(world, c);
  if (status === 'together') return null;
  if (status === 'waiting') return t('contract.status.waiting');
  return t(`contract.status.${status}`, { n: Math.max(0, turnsLeft(world, c) ?? 0) });
}

const ESCORT_ENDED_CLS = { arrived: 'good', strayed: 'bad', hostile: 'bad', knockedOut: 'bad', stuck: 'dim', apartAtArrival: 'dim', lost: 'dim' } as const;

function escortEndedText(world: World, e: Extract<GameEvent, { t: 'escortEnded' }>): LogLine {
  return line(t(`log.escortEnded.${e.end}`, { who: vehicleName(world, e.client) }), ESCORT_ENDED_CLS[e.end]);
}

export function clock(turn: number): { dayLabel: Msg; day: Msg; time: Msg; full: Msg } {
  const { day, hour } = clockOf(turn);
  const hh = Math.floor(hour);
  const mm = Math.floor((hour - hh) * 60);
  const time = verbatim(`${hh}:${String(mm).padStart(2, '0')}`);
  return { dayLabel: t('clock.day'), day: verbatim(String(day)), time, full: t('clock.full', { day, time }) };
}

function skillUpText(skill: SkillId, rank: number): Msg {
  const bought = { skill: skillName(skill), rank };
  return (PERK_LEVELS as readonly number[]).includes(rank) ? t('log.rankBoughtPerk', bought) : t('log.rankBought', bought);
}

function activityText(world: World, e: Extract<GameEvent, { t: 'activity' }>): LogLine | null {
  const vehicle = world.vehicles.find((v) => v.id === e.vehicle);
  return world.player.fullLog && vehicle ? line(t('log.debugActivity', { who: vehicleTitle(world, vehicle), what: debugId(e.activity ?? 'idle'), why: goalText(e.reason) }), 'dim') : null;
}

function preyPassedText(world: World, e: Extract<GameEvent, { t: 'preyPassed' }>): LogLine | null {
  return world.player.fullLog ? line(t('log.preyPassed', { who: vehicleName(world, e.vehicle), prey: vehicleName(world, e.prey), why: t(`pass.${e.reason}`) }), 'dim') : null;
}

function stallText(world: World, e: Extract<GameEvent, { t: 'stall' }>): LogLine | null {
  return world.player.fullLog ? line(t('log.debugStall', { who: vehicleName(world, e.vehicle), what: debugId(e.goal ?? 'idle'), why: goalText(e.reason) }), 'bad') : null;
}

const debugId = (id: string): Msg => verbatim(id);

function infoText(world: World, e: Extract<GameEvent, { t: 'info' }>): LogLine | null {
  return e.debug && !world.player.fullLog ? null : line(noteText(e.note), 'dim');
}

function lootArgumentText(world: World, e: Extract<GameEvent, { t: 'lootArgument' }>): LogLine {
  const words = { warner: vehicleName(world, e.warner), looter: vehicleName(world, e.looter), place: t(`loot.place.${e.place}`) };
  const text = { yielded: t('log.lootYielded', words), backedOff: t('log.lootBackedOff', words), fight: t('log.lootFight', words) }[e.end];
  return line(text, e.end === 'fight' ? 'bad' : 'dim');
}

function outpostReachedText(world: World, e: Extract<GameEvent, { t: 'outpostReached' }>): LogLine {
  const site = siteName(outpostId(e.milestone));
  const pay = moneyMsg(e.pay);
  return line(e.wrecks === 0 ? t('log.outpostReached', { site, pay }) : t('log.outpostReachedWrecks', { site, pay, n: e.wrecks }), 'good');
}

function runLostText(_world: World, e: Extract<GameEvent, { t: 'runLost' }>): LogLine {
  return line(t(e.cause === 'wrecked' ? 'log.runWrecked' : 'log.runEnded', { n: e.stretch }), 'bad');
}

function moneyText(world: World, e: Extract<GameEvent, { t: 'money' }>): LogLine | null {
  if (e.reason.kind === 'outpost') return null;
  const reason = moneyReasonText(world, e.reason);
  return e.amount > 0 ? line(t('log.moneyGain', { n: moneyMsg(e.amount), reason }), 'good') : line(t('log.moneyLoss', { n: moneyMsg(-e.amount), reason }), 'bad');
}

function lookedOverText(world: World, e: Extract<GameEvent, { t: 'lookedOver' }>): LogLine | null {
  if (e.target !== world.player.vehicleId) return null;
  const looker = findAny(world, e.by);
  if (!looker || !playerSees(world, looker.pos)) return null;
  return line(t('log.lookedOver', { who: vehicleName(world, e.by) }), '');
}

function holdUpText(world: World, e: Extract<GameEvent, { t: 'holdUp' }>): LogLine | null {
  if (e.paid !== 'money') return null;
  const me = world.player.vehicleId;
  if (e.victim !== me && e.robber !== me) return null;
  const reason = moneyReasonText(world, { kind: 'holdUp', vehicle: e.victim === me ? e.robber : e.victim });
  return e.victim === me ? line(t('log.moneyLoss', { n: moneyMsg(e.value), reason }), 'bad') : line(t('log.moneyGain', { n: moneyMsg(e.value), reason }), 'good');
}

function discoverText(e: Extract<GameEvent, { t: 'discover' }>): LogLine | null {
  if (isOutpostSite(e.location)) return null;
  return line(t('log.discovered', { site: siteName(e.location) }), 'good');
}

function partDisabledText(world: World, e: Extract<GameEvent, { t: 'partDisabled' }>): LogLine {
  const cls = e.vehicle === world.player.vehicleId ? 'bad' : 'good';
  return line(t('log.partDisabled', { who: vehicleName(world, e.vehicle), part: partName(world, e.vehicle, e.part) }), cls);
}

function breakdownText(world: World, e: Extract<GameEvent, { t: 'breakdown' }>): LogLine | null {
  return e.vehicle === world.player.vehicleId ? line(t('log.breakdown', { part: partName(world, e.vehicle, e.part) }), 'bad') : null;
}

function foundText(e: Extract<GameEvent, { t: 'found' }>): LogLine {
  const stores = e.fuel > 0 || e.supplies > 0 ? [aidWords(e.fuel, e.supplies)] : [];
  const items = [...Object.entries(e.goods).map(([good, count]) => t('npc.goodCount', { good: goodName(good), n: count })), ...e.parts.map(partNameOf), ...stores];
  return line(t('log.found', { items: list(items) }), 'good');
}

function caltropsText(world: World, e: Extract<GameEvent, { t: 'caltrops' }>): LogLine {
  const me = world.player.vehicleId;
  const mine = e.vehicle === me;
  const head = mine ? t('log.caltropsYou') : t('log.caltropsThem', { who: vehicleName(world, e.vehicle) });
  return spanLine(mine ? 'bad' : e.source === me ? 'good' : 'dim', [{ text: head, cls: '' }, ...damageSpans(world, e.vehicle, e.hits)]);
}

function pulseText(world: World, e: Extract<GameEvent, { t: 'pulse' }>): LogLine | null {
  const me = playerVehicle(world);
  if (e.vehicle === me.id) {
    if (e.hit.length === 0) return line(t('log.pulseNone'), 'dim');
    return line(t('log.pulseYours', { who: list(e.hit.map((id) => vehicleName(world, id))) }), 'good');
  }
  if (!e.hit.includes(me.id)) return null;
  return line(t('log.pulseTheirs', { who: vehicleName(world, e.vehicle), n: shutDownTurnsLeft(world, me) }), 'bad');
}

function cookOffText(world: World, e: Extract<GameEvent, { t: 'claymoreCookOff' }>): LogLine {
  const me = world.player.vehicleId;
  const hitByMe = world.vehicles.find((v) => v.id === e.vehicle)?.lastHitBy === me;
  const mine = e.vehicle === me;
  const head = mine ? t('log.cookOffYours') : t('log.cookOffTheirs', { who: vehicleName(world, e.vehicle) });
  return spanLine(mine ? 'bad' : hitByMe ? 'good' : 'dim', [{ text: head, cls: '' }, ...damageSpans(world, e.vehicle, e.hits)]);
}

function claymoreText(world: World, e: Extract<GameEvent, { t: 'claymore' }>): LogLine {
  const me = world.player.vehicleId;
  const obstacle = world.obstacles.find((o) => o.id === e.other);
  if (obstacle) {
    const what = t(`log.obstacle.${obstacle.kind}`);
    const head = e.vehicle === me ? t('log.claymoreWallYours', { what }) : t('log.claymoreWallTheirs', { who: vehicleName(world, e.vehicle), what });
    return spanLine(e.vehicle === me ? 'bad' : 'dim', [{ text: head, cls: '' }, ...damageSpans(world, e.vehicle, e.selfHits)]);
  }
  const who = vehicleName(world, e.vehicle);
  const [head, cls] =
    e.vehicle === me ? [t('log.claymoreYours', { whom: vehicleName(world, e.other) }), 'good']
    : e.other === me ? [t('log.claymoreYou', { who }), 'bad']
    : [t('log.claymoreTheirs', { who, whom: vehicleName(world, e.other) }), 'dim'];
  return spanLine(cls, [{ text: head, cls: '' }, ...damageSpans(world, e.other, e.hits)]);
}

const quiet = (): null => null;

const EVENT_TEXTS: { [K in GameEvent['t']]: (world: World, e: Extract<GameEvent, { t: K }>) => LogLine | null } = {
  activity: activityText,
  stall: stallText,
  preyPassed: preyPassedText,
  info: infoText,
  townPatch: () => line(t('log.townPatch'), 'good'),
  siteEvent: (_, e) => {
    if (!seesAll()) return null;
    const params = { site: siteName(e.shop), good: goodLower(recipeOutput(e.shop, e.recipe)) };
    return line(e.kind === 'surge' ? t('log.siteEvent.surge', params) : t('log.siteEvent.breakdown', params), 'dim');
  },
  engineCredit: (_, e) => line(t('log.engineCredit', { part: partNameOf(e.part) }), 'good'),
  scrapPatch: (_, e) => line(e.fuel > 0 ? t('log.scrapPatchFuel', { liters: fuelLiters(e.fuel) }) : t('log.scrapPatch'), 'good'),
  npcKnockout: (world, e) => line(t('log.npcKnockout', { who: vehicleName(world, e.vehicle) }), 'good'),
  npcWake: (world, e) => line(t('log.npcWake', { who: vehicleName(world, e.vehicle) }), 'dim'),
  stateEnded: stateEndedText,
  lookedOver: lookedOverText,
  empty: quiet,
  utility: quiet,
  caltrops: caltropsText,
  lineTorn: lineTornText,
  pulse: pulseText,
  claymore: claymoreText,
  claymoreCookOff: cookOffText,
  found: (_, e) => foundText(e),
  say: sayText,
  job: jobText,
  weather: weatherText,
  honk: honkText,
  patch: patchText,
  aid: aidText,
  aidStarted: aidStartedText,
  towOffer: towOfferText,
  towHitched: towHitchedText,
  towDone: towDoneText,
  towDropped: towDroppedText,
  call: quiet,
  plea: pleaText,
  cargoSpilled: cargoSpilledText,
  escortPaid: escortPaidText,
  guardPaid: quiet,
  shopMoney: quiet,
  transfer: quiet,
  holdUp: holdUpText,
  escortHired: escortHiredText,
  escortRefused: escortRefusedText,
  crewAsked: crewAskedText,
  crewFormed: crewFormedText,
  crewFailed: (world, e) => line(t('log.crewFailed', { leader: vehicleName(world, e.leader) }), 'dim'),
  crewLeft: crewLeftText,
  crewLed: (world, e) => line(t('log.crewLed', { leader: vehicleName(world, e.leader), fallen: vehicleName(world, e.fallen) }), 'dim'),
  crewDisbanded: (world, e) => line(t('log.crewDisbanded', { leader: vehicleName(world, e.leader) }), 'dim'),
  guardHired: guardHiredText,
  guardEnded: guardEndedText,
  note: (_, e) => line(t('log.noted', { title: noteTitle(e.id) }), 'good'),
  lootArgument: lootArgumentText,
  collision: quiet,
  shot: shotText,
  partDisabled: partDisabledText,
  destroyed: (world, e) => line(t('log.destroyed', { who: vehicleName(world, e.vehicle) }), 'good'),
  hostile: quiet,
  joins: (world, e) => line(t('log.joins', { who: vehicleName(world, e.vehicle) }), e.against === world.player.vehicleId ? 'bad' : 'good'),
  standing: (_, e) => line(t(`log.standing.${e.band}`, { faction: factionName(e.faction) }), bandAtLeast(e.band, 'neutral') ? 'good' : 'bad'),
  practice: quiet,
  skillUp: (_, e) => line(skillUpText(e.skill, e.level), 'good'),
  money: moneyText,
  outpostReached: outpostReachedText,
  roadOpened: quiet,
  runLost: runLostText,
  discover: (_, e) => discoverText(e),
  encounter: quiet,
  supply: (_, e) => line(noteText(e.note), 'bad'),
  death: () => line(t('log.death'), 'bad'),
  coreBurn: () => null,
  sunwardFallen: () => line(t('log.sunwardFallen'), 'good'),
  knockout: () => line(t('log.knockout'), 'bad'),
  wake: () => line(t('log.wake'), 'dim'),
  searched: (_, e) => searchedText(e.stock),
  contract: (world, e) => (e.cause === 'rival' ? rivalFirstText(world, e.contract) : contractEventText(e)),
  claimRival: claimRivalText,
  claimLead: claimLeadText,
  escortEnded: escortEndedText,
  breakdown: breakdownText,
  spawn: quiet,
  despawn: quiet,
  arrived: quiet,
};

export function eventText(world: World, e: GameEvent): LogLine | null {
  if (unnoticed(world, e)) return null;
  return (EVENT_TEXTS[e.t] as (world: World, e: GameEvent) => LogLine | null)(world, e);
}

export type SaleEstimate =
  | { kind: "none" }
  | { kind: "unrecorded" }
  | { kind: "gain" | "loss"; perUnit: number; avgCost: number }
  | { kind: "even"; avgCost: number };

export const GOODS_COLUMNS = {
  good: t('goods.good'), theirs: t('goods.theirs'), buy: t('goods.buy'), sell: t('goods.sell'), stock: t('goods.stock'), held: t('goods.held'), profit: t('goods.profit'),
} as const;

export const PROFIT_HEAD_TITLE = t('goods.profitTitle');

function checkEstimate(held: number, sell: number, basis: number | undefined): void {
  if (!Number.isInteger(held) || held < 0) throw new Error(`saleEstimate: bad held count ${held}`);
  if (!Number.isFinite(sell)) throw new Error(`saleEstimate: bad sell price ${sell}`);
  if (basis !== undefined) checkBasis(basis);
}

function checkBasis(basis: number): void {
  if (!Number.isFinite(basis) || basis < 0) throw new Error(`saleEstimate: bad cost basis ${basis}`);
}

export function saleEstimate(held: number, sell: number, basis: number | undefined): SaleEstimate {
  checkEstimate(held, sell, basis);
  if (held === 0) return { kind: "none" };
  if (basis === undefined) return { kind: "unrecorded" };
  const diff = Math.round(sell - basis);
  const avgCost = Math.round(basis);
  if (diff === 0) return { kind: "even", avgCost };
  return { kind: diff > 0 ? "gain" : "loss", perUnit: Math.abs(diff), avgCost };
}

export function estimateText(e: SaleEstimate): Msg | null {
  switch (e.kind) {
    case "none": return null;
    case "unrecorded": return t('goods.unknown');
    case "even": return t('goods.even');
    case "gain": return t('goods.gain', { n: moneyM(e.perUnit) });
    case "loss": return t('goods.loss', { n: moneyM(e.perUnit) });
  }
}

export function estimateTitle(e: SaleEstimate): Msg | undefined {
  switch (e.kind) {
    case "none": return undefined;
    case "unrecorded": return t('goods.noCost');
    default: return t('goods.avgCost', { cost: moneyMsg(e.avgCost) });
  }
}

export function lotTitle(direction: "buy" | "sell", count: number, total: number): Msg {
  return direction === "buy" ? t('goods.buyLot', { n: count, total: moneyMsg(total) }) : t('goods.sellLot', { n: count, total: moneyMsg(total) });
}

export function commandFailure(world: World, err: unknown): Msg {
  if (err instanceof Refused) return refusalText(world, err.refusal);
  console.error(err);
  return t('refusal.failed');
}

export function standingNum(score: number): Msg {
  return score < 0 ? concat([MINUS_SIGN, num(-score, 'int')]) : num(score, 'int');
}

export function standingStep(delta: number): Msg {
  if (delta > 0) return concat([PLUS, num(delta, 'int')]);
  return standingNum(delta);
}
