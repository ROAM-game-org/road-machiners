import { chassisAbility } from '../sim/chassis-features';
import type { AbilityId, ChassisAbility } from '../data/chassis';
import { WORLD_SETTINGS } from '../data/modes';
import type { LineId } from '../data/dialogue';
import type { LocalId, NoteId, TermId } from '../data/locals';
import { FEMALE_NAMES, FIRST_NAMES, SURNAMES, type TraitId } from '../data/npcs';
import { BASIC_RANK, type BasicId, type PerkId } from '../data/skills';
import type { CrimeOffense, Faction, GameModeId, GoalReason, MoneyReason, Refusal, SimNote, SkillId, UnitId, Vehicle, World, WorldSetup, WorldSettings } from '../sim/types';
import { byId, list, t, type Msg } from './msg';

export const partName = (defId: string): Msg => byId(`part.${defId}`);
export const partLore = (defId: string): Msg => byId(`lore.part.${defId}`);
export const goodLore = (id: string): Msg => byId(`lore.good.${id}`);
export const chassisName = (id: string): Msg => byId(`chassis.${id}`);
export const abilityName = (id: AbilityId): Msg => byId(`chassis.ability.${id}`);
export const chassisAbilityName = (chassisId: string): Msg | null => {
  const ability = chassisAbility(chassisId);
  return ability && abilityName(ability.id);
};
export const chassisAbilityLine = (chassisId: string): Msg | null => {
  const a = chassisAbility(chassisId);
  return a && abilityLine(a);
};
const pct = (factor = 1): number => Math.round((factor - 1) * 100);
const share = (value = 1): number => Math.round(value * 100);
const have = (value = 0): number => value;

type LineOf = (a: ChassisAbility) => Msg;

const ABILITY_LINES: Record<AbilityId, LineOf> = {
  bed: (a) => t('chassis.ability.bed.line', { n: have(a.bedRows) }),
  nimble: (a) => t('chassis.ability.nimble.line', { a: pct(a.accel), b: Number(((have(a.nimble) * 180) / Math.PI).toFixed(1)) }),
  racing: (a) => t('chassis.ability.racing.line', { n: pct(a.topSpeed) }),
  offRoad: (a) => t('chassis.ability.offRoad.line', { n: 100 - share(a.offRoadWear) }),
  armored: (a) => t('chassis.ability.armored.line', { n: have(a.partArmor) }),
  gunMounts: (a) => t('chassis.ability.gunMounts.line', { n: pct(a.gunPower) }),
  battle: (a) => t('chassis.ability.battle.line', { a: have(a.partArmor), b: pct(a.gunPower) }),
  springs: (a) => t('chassis.ability.springs.line', { n: share(a.mountedMass) }),
  openTop: (a) => t('chassis.ability.openTop.line', { a: pct(a.sight), b: pct(a.range) }),
  tourer: (a) => t('chassis.ability.tourer.line', { a: pct(a.sight), b: pct(a.range), c: pct(a.topSpeed) }),
  trailer: (a) => t('chassis.ability.trailer.line', { a: have(a.arc), b: have(a.reloadCut), c: pct(a.cargoRows), d: have(a.deckArmor) }),
};

const abilityLine = (a: ChassisAbility): Msg => ABILITY_LINES[a.id](a);

export const goodName = (id: string): Msg => byId(`good.${id}`);
export const goodLower = (id: string): Msg => byId(`good.${id}.lower`);
export const questTitle = (id: string): Msg => byId(`quest.${id}.title`);
const OUTPOST_ID = /^outpost-(\d+)$/;

export const outpostName = (milestone: number): Msg => t('outpost.name', { word: t('outpost.word'), n: milestone });
export const siteName = (id: string): Msg => {
  const outpost = OUTPOST_ID.exec(id);
  return outpost ? outpostName(Number(outpost[1])) : byId(`site.${id}`);
};
export const siteSign = (id: string): Msg => byId(`way.sign.${id}`);
export const placeProse = (shopId: string): Msg => byId(`town.place.${shopId}`);
export const propName = (look: string): Msg => byId(`way.prop.${look}`);
export const compassName = (octant: string): Msg => byId(`compass.${octant}`);
export const terrainName = (id: string): Msg => byId(`terrain.${id}`);
export const templateName = (id: string): Msg => byId(`npc.${id}`);
export const professionName = (id: string): Msg => byId(`npc.${id}.profession`);
export const traitName = (id: TraitId): Msg => t(`trait.${id}`);
export const factionName = (id: Faction): Msg => t(`faction.${id}`);
export const offenseName = (id: CrimeOffense): Msg => t(`offense.${id}`);
export const skillName = (id: SkillId): Msg => t(`skill.${id}`);
export const skillGrows = (id: SkillId): Msg => t(`skill.${id}.grows`);
export const basicName = (id: BasicId): Msg => t(`basic.${id}`);
export const basicRule = (id: BasicId): Msg => t(`basic.${id}.rule`);
export const perkName = (id: PerkId): Msg => t(`perk.${id}`);
export const perkRule = (id: PerkId): Msg => t(`perk.${id}.rule`);
export const goalText = (reason: GoalReason): Msg => t(`goal.${reason}`);
export const lineKey = (id: LineId): `line.${LineId}` => `line.${id}`;
export const unitCount = (unit: UnitId, n: number): Msg => t(`unit.${unit}`, { n });
export const modeName = (id: GameModeId): Msg => t(`mode.${id}`);
export const modeDescription = (id: GameModeId): Msg => t(`mode.${id}.description`);
export const settingName = (id: keyof WorldSettings): Msg => t(`setting.${id}`);
export const settingDescription = (id: keyof WorldSettings): Msg => t(`setting.${id}.description`);

export function setupText(setup: WorldSetup): Msg {
  const ids = (Object.keys(WORLD_SETTINGS) as (keyof WorldSettings)[]).filter((id) => WORLD_SETTINGS[id].modes.includes(setup.mode));
  const settings = ids.map((id) =>
    t('setup.part', { setting: settingName(id), pct: t('setting.percent', { n: Math.round(setup.settings[id] * 100) }) }));
  return list([modeName(setup.mode), ...settings]);
}

export function vehicleTitle(world: World, v: Vehicle): Msg {
  if (v.id === world.player.vehicleId) return t('vehicle.yours');
  if (!v.brain) return chassisName(v.chassisId);
  return t('vehicle.npc', { profession: professionName(v.brain.templateId), driver: driverName(v) });
}

export function vehicleTitleOf(world: World, id: string): Msg {
  const v = world.vehicles.find((x) => x.id === id) ?? world.removed.find((x) => x.id === id);
  if (!v) throw new Error(`No vehicle ${id} to name`);
  return vehicleTitle(world, v);
}

export function driverName(v: Vehicle): Msg {
  if (!v.brain) throw new Error(`${v.id} has no driver`);
  return fullName(v.brain.driver);
}

export function fullName(driver: string): Msg {
  const [first, last, ...rest] = driver.split(' ');
  if (rest.length > 0 || !FIRST_NAMES.includes(first) || !SURNAMES.includes(last)) {
    throw new Error(`Driver "${driver}" is not a first name and a surname from the name lists`);
  }
  const surname = FEMALE_NAMES.has(first) ? `driver.last.${last}.f` : `driver.last.${last}`;
  return t('driver.full', { first: byId(`driver.first.${first}`), last: byId(surname) });
}

type NoteWords = { [K in SimNote['id']]: (note: Extract<SimNote, { id: K }>) => Msg };
const NOTES: NoteWords = {
  engineHot: () => t('note.engineHot'),
  engineOverheat: (n) => t('note.engineOverheat', { hp: n.hp }),
  overdriveCutOut: () => t('note.overdriveCutOut'),
  engineDoused: (n) => t('note.engineDoused', { supplies: n.supplies }),
  outOfSupplies: (n) => t('note.outOfSupplies', { health: n.health }),
  noRoomFuel: (n) => t('note.noRoomFuel', { fuel: n.fuel }),
  noRoomSupplies: (n) => t('note.noRoomSupplies', { supplies: n.supplies }),
  tankLeak: (n) => t('note.tankLeak', { fuel: n.fuel }),
  filledSupplies: (n) => t('note.filledSupplies', { site: siteName(n.site) }),
  hazard: () => t('note.hazard'),
  core: () => t('note.core'),
  spawnBlocked: (n) => t('note.spawnBlocked', { template: templateName(n.template) }),
};

export const noteTitle = (id: NoteId): Msg => byId(`journalNote.${id}.title`);
export const noteFrom = (id: NoteId): Msg => byId(`journalNote.${id}.from`);
export const noteBody = (id: NoteId): Msg => byId(`journalNote.${id}.text`);
export const localName = (id: LocalId): Msg => byId(`local.${id}.name`);
export const localRole = (id: LocalId): Msg => byId(`local.${id}.role`);
export const termText = (id: TermId): Msg => byId(`term.${id}`);

export function noteText(note: SimNote): Msg {
  return (NOTES[note.id] as (n: SimNote) => Msg)(note);
}

export function moneyReasonText(world: World, reason: MoneyReason): Msg {
  if (reason.kind === 'towing') return t('money.towing', { vehicle: vehicleTitleOf(world, reason.vehicle) });
  if (reason.kind === 'outpost') return t('money.outpost');
  if (reason.kind === 'holdUp') return t('money.holdUp', { vehicle: vehicleTitleOf(world, reason.vehicle) });
  return t('money.contract');
}

type Plain<R> = R extends { id: infer I } ? (keyof R extends 'id' ? I : never) : never;
type RefusalWords = { [K in Exclude<Refusal['id'], Plain<Refusal>>]: (world: World, r: Extract<Refusal, { id: K }>) => Msg };
const REFUSALS: RefusalWords = {
  badLayout: (world, r) => t('refusal.badLayout', { cause: refusalText(world, r.cause) }),
  looting: (world, r) => t(`refusal.looting.${r.place}`, { by: vehicleTitleOf(world, r.by) }),
  notActive: (_, r) => t(`refusal.notActive.${r.state}`),
  topRank: (_, r) => t('refusal.topRank', { skill: skillName(r.skill) }),
  needsBasic: (_, r) => t('refusal.needsBasic', { skill: skillName(r.skill), rank: BASIC_RANK }),
  utilityPassive: (_, r) => t('refusal.utilityPassive', { part: partName(r.part) }),
  utilityOrder: (_, r) => t(`refusal.utilityOrder.${r.order}`, { part: partName(r.part) }),
  utilityBlocked: (_, r) => t('refusal.utilityBlocked', { part: partName(r.part), reason: t(`block.${r.block}`) }),
  busy: (_, r) => t(`refusal.busy.${r.job}`),
  needsXp: (_, r) => t('refusal.needsXp', { cost: r.cost, have: r.have }),
  payBountiesFirst: (_, r) => t('refusal.payBountiesFirst', { faction: factionName(r.faction) }),
};

export function refusalText(world: World, r: Refusal): Msg {
  const words = (REFUSALS as Record<string, ((world: World, r: Refusal) => Msg) | undefined>)[r.id];
  return words ? words(world, r) : t(`refusal.${r.id as Plain<Refusal>}`);
}
