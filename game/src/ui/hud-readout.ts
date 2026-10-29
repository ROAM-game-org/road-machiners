import { deskAt, deskNear } from '../sim/crime';
import { GAME_VERSION } from "../config";
import { playerAid, readyAid } from "../sim/aid";
import { playerHandover, readyHandover } from "../sim/parcel";
import { aidData } from "../sim/states";
import { aidGoods } from "./format";
import { inMeetingReach, isMeeting, playerTrades } from "../sim/economy";
import { partDef } from "../data/parts";
import { RULES } from "../data/rules";
import { maxHp } from "../sim/wear";
import { playerVehicle, vehicleById } from "../sim/damage";
import { maxHealthOf } from "../sim/health";
import { corePart, itemSize } from "../sim/grid";
import { conditionItems, type Tier } from "../three/render/portraitPixels";
import { keyLabel } from "./input-mode";
import { fuelCap, gunDraw, hasWorkingEngine, inOverdrive, isStranded, isWorking, maxSpeedSteps, overdriveBlock, workingEngineCapacity, type OverdriveBlock, type SpeedStep } from "../sim/stats";
import { basicSkill } from "../sim/progress";
import { fuelLimit, lowFuelSpeed } from "../sim/far";
import { towData } from "../sim/states";
import { dragOf, playerTow } from "../sim/tow";
import { heatAt } from "../sim/sun";
import { TERRAIN } from "../data/terrain";
import { dist, type Vec } from "../sim/vec";
import type { NpcState, SalvageStock, Vehicle, World } from "../sim/types";
import { REGION } from "../data/region";
import { clock, vehicleName } from "./format";
import { celsius, distanceText, engineCelsius, fuelLiters, hp, kph, moneyMsg } from "./units";
import { canAbandonRun, chaosHighwayReadout, outpostNear, reachedOutpostAt } from "../sim/chaos-highway";
import { ENGINE_HEAT } from "../data/wear";
import type { IconName } from "./cards";
import { contextKey, type ContextAction } from './hud';
import { canUseSite } from '../sim/sites';
import { shopAt } from '../sim/market';
import { downedListNear, emptySalvageNear, hasLootFor, lootBlockerHere, needsSearch, salvageListNear } from '../sim/locations';
import { canLootTruck, canReachSalvage, salvagePlace } from '../sim/salvage';
import { surveyActions, surveyPlaceType, type SurveyAction } from '../sim/survey';
import { playerCanAct } from '../sim/world';
import { combatTurnsLeft } from '../sim/combat';
import { isBusy } from '../sim/jobs';
import { list, num, t, type Msg } from '../text/msg';
import { abilityName, partName, refusalText, siteName, vehicleTitle } from '../text/names';

export function overdriveSwitch(w: World): { checked: boolean; locked: boolean; reason: Msg | null; title: Msg } {
  const me = playerVehicle(w);
  const block = overdriveBlock(w, me);
  const reason = block === null ? null : overdriveReason(w, block);
  return {
    checked: inOverdrive(w, me),
    locked: block === "noBasic",
    reason,
    title: reason ?? t("hud.overdriveTitle"),
  };
}

function overdriveReason(w: World, block: OverdriveBlock): Msg {
  if (block === "noBasic") return refusalText(w, { id: "needsBasic", skill: basicSkill("overdrive") });
  if (block === "noEngine") return t("hud.overdriveNoEngine");
  return keyLabel(t("hud.overdriveWorn", { pct: Math.round(RULES.overdriveMinEngineShare * 100) }), "O");
}

function shopNear(world: World): string | null {
  const pos = playerVehicle(world).pos;
  const sites = [...REGION.towns, ...REGION.locations].filter((s) => s.id in world.shops);
  return sites.find((s) => canUseSite(pos, s))?.id ?? null;
}

export class ContextPicker {
  private selected: string | null = null;

  pick(actions: ContextAction[]): ContextAction | null {
    const found = actions.find((a) => contextKey(a.target) === this.selected) ?? actions[0] ?? null;
    this.selected = found && contextKey(found.target);
    return found;
  }

  cycle(actions: ContextAction[], step: 1 | -1): void {
    const current = this.pick(actions);
    if (!current) return;
    const next = (actions.indexOf(current) + step + actions.length) % actions.length;
    this.selected = contextKey(actions[next].target);
  }
}

export function getContextActions(world: World, playing: boolean): ContextAction[] {
  if (playing || !playerCanAct(world)) return [];
  const deals = [getAidAction(world), getHandoverAction(world), ...getTradeActions(world)].filter((d) => d !== null);
  return [...deals.filter((d) => d.ready), ...getPlaceActions(world), ...deals.filter((d) => !d.ready)];
}

function awaitsStart(s: NpcState): boolean {
  return aidData(s).agreed && !aidData(s).started;
}

function getAidAction(world: World): ContextAction | null {
  const s = playerAid(world);
  if (!s || !awaitsStart(s) || !inMeetingReach(world, s)) return null;
  const words = { goods: aidGoods(s), truck: vehicleTitle(world, vehicleById(world, s.holder)) };
  const label = aidData(s).giver === "player" ? t("action.giveAid", words) : t("action.takeAid", words);
  return { label, ready: readyAid(world)?.id === s.id, target: { kind: 'aid', id: s.holder } };
}

function getHandoverAction(world: World): ContextAction | null {
  const s = playerHandover(world);
  if (!s || !inMeetingReach(world, s)) return null;
  const label = t("action.handParcel", { truck: vehicleTitle(world, vehicleById(world, s.holder)) });
  return { label, ready: readyHandover(world)?.id === s.id, target: { kind: 'parcel', id: s.holder } };
}

function getTradeActions(world: World): ContextAction[] {
  return playerTrades(world)
    .filter((s) => inMeetingReach(world, s))
    .map((s) => ({ label: t("action.trade", { truck: vehicleTitle(world, vehicleById(world, s.holder)) }), ready: isMeeting(world, s), target: { kind: 'trade', id: s.holder } }));
}

function getPlaceActions(world: World): ContextAction[] {
  const actions: ContextAction[] = [];
  const shop = shopNear(world);
  if (shop) actions.push({ label: t("action.enter", { site: siteName(shop) }), ready: shopAt(world) === shop, target: { kind: 'shop' } });
  const desk = deskNear(world);
  if (desk) actions.push({ label: t("action.enter", { site: siteName(desk) }), ready: deskAt(world) === desk, target: { kind: 'shop' } });
  const post = outpostNear(world);
  if (post) actions.push({ label: t("action.enterOutpost", { site: siteName(post.id) }), ready: reachedOutpostAt(world) !== null, target: { kind: 'outpost' } });
  for (const downed of downedListNear(world)) {
    actions.push({ label: t("action.lootTruck", { truck: vehicleTitle(world, downed) }), ready: canLootTruck(world, playerVehicle(world), downed), target: { kind: 'downed', id: downed.id } });
  }
  if (!isBusy(playerVehicle(world))) actions.push(...getSiteActions(world));
  return actions;
}

function getSiteActions(world: World): ContextAction[] {
  const actions: ContextAction[] = [];
  const stocks = salvageListNear(world);
  actions.push(...stocks.flatMap((stock) => getStockActions(world, stock)));
  actions.push(...surveyActions(world).map((a) => surveyAction(world, a)));
  if (stocks.length === 0) {
    const empty = emptySalvageNear(world);
    if (empty) actions.push({ label: stockLabel('empty', empty), ready: false, hint: t("action.noLoot"), target: { kind: 'empty' } });
  }
  return actions;
}

function getStockActions(world: World, stock: SalvageStock): ContextAction[] {
  const actions: ContextAction[] = [];
  if (needsSearch(world, stock)) actions.push(getSearchAction(world, stock));
  if (hasLootFor(world, stock)) actions.push(withBlocker(world, stock, { label: stockLabel('loot', stock), ready: canReachSalvage(playerVehicle(world), stock), target: { kind: 'loot', id: stock.id } }));
  return actions;
}

function surveyAction(world: World, a: SurveyAction): ContextAction {
  return { label: t("action.survey", { place: t(`contract.place.${surveyPlaceType(a.site)}`) }), ready: a.ready, target: { kind: 'survey', id: a.site, contractId: a.contractId } };
}

export function getSearchAction(world: World, stock: SalvageStock): ContextAction {
  const combat = combatTurnsLeft(world, playerVehicle(world)) ?? undefined;
  const ready = combat === undefined && canReachSalvage(playerVehicle(world), stock);
  return withBlocker(world, stock, { label: stockLabel('search', stock), ready, combat, target: { kind: 'stock', id: stock.id } });
}

function withBlocker(world: World, stock: SalvageStock, action: ContextAction): ContextAction {
  const blocker = lootBlockerHere(world, stock.id);
  return blocker ? { label: action.label, ready: false, hint: t("action.lootingIt", { truck: vehicleTitle(world, blocker) }), target: action.target } : action;
}

function stockLabel(verb: 'search' | 'loot' | 'empty', stock: SalvageStock): Msg {
  const place = salvagePlace(stock);
  if (place === 'pile' || place === 'wreck' || place === 'spot') return t(`stock.${verb}.${place}`);
  return t(`stock.${verb}.site`, { site: siteName(stock.id) });
}


export const HURT_BELOW = 70;
export const CRITICAL_BELOW = 40;

export function tierOf(percent: number): Tier {
  if (percent === 0) return "broken";
  if (percent < CRITICAL_BELOW) return "crit";
  return percent < HURT_BELOW ? "hurt" : "ok";
}

export function conditionLabel(part: { name: Msg; percent: number }): Msg {
  return part.percent === 0 ? t("condition.broken", { part: part.name }) : t("condition.percent", { part: part.name, pct: part.percent });
}

export class TruckConditionReadout {
  private vehicleId: string | null = null;
  private health = new Map<string, number>();

  update(vehicle: Vehicle) {
    if (this.vehicleId !== vehicle.id) this.health.clear();
    this.vehicleId = vehicle.id;
    const previous = this.health;
    this.health = new Map();
    return conditionItems(vehicle).map((item) => {
      const def = partDef(item.part.defId);
      const hp = item.part.hp;
      this.health.set(item.part.id, hp);
      const before = previous.get(item.part.id);
      const percent = hp > 0 ? Math.max(1, Math.floor((hp / maxHp(item.part)) * 100)) : 0;
      return {
        id: item.part.id,
        name: partName(def.id),
        defId: def.id,
        x: item.x,
        y: item.y,
        ...itemSize(item),
        percent,
        tier: tierOf(percent),
        broken: hp <= 0,
        hit: before !== undefined && hp < before,
      };
    });
  }
}

const HOT = 2;

type WeatherWord = 'heatwave' | 'overcast' | 'storm' | 'stormNear';

const WEATHER_ORDER: WeatherWord[] = ["storm", "stormNear", "heatwave", "overcast"];

function weatherLabel(w: World, pos: Vec): { text: Msg; clear: boolean } {
  const words = new Set<WeatherWord>();
  for (const e of w.weather) {
    if (e.kind !== "storm") words.add(e.kind);
    else if (dist(pos, e.pos) <= e.radius) words.add("storm");
    else if (dist(pos, e.pos) - e.radius <= TERRAIN.vision.radius) words.add("stormNear");
  }
  if (words.size === 0) return { text: t("weather.clear"), clear: true };
  return { text: list(WEATHER_ORDER.filter((word) => words.has(word)).map((word) => t(`weather.${word}`))), clear: false };
}

export function moneyLabel(money: number): Msg {
  return moneyMsg(money);
}

export type RescueReadout =
  | { kind: "knockedOut" }
  | { kind: "towed"; tower: Msg; town: Msg; fee: number }
  | { kind: "dragged" }
  | { kind: "stranded"; beacon: boolean; reason: Msg | null; canEnd: boolean };

export function getRescueReadout(w: World): RescueReadout | null {
  const p = w.player;
  if (p.state === "knockedOut") return { kind: "knockedOut" };
  if (p.state === "dead") return null;
  return ropeReadout(w) ?? (showsStranded(w) ? { kind: "stranded", beacon: p.beacon, reason: strandedReason(w), canEnd: canAbandonRun(w) } : null);
}

function ropeReadout(w: World): RescueReadout | null {
  if (dragOf(w, w.player.vehicleId)) return { kind: "dragged" };
  const state = playerTow(w);
  if (!state || !towData(state).hitched) return null;
  const data = towData(state);
  return { kind: "towed", tower: vehicleName(w, state.holder), town: siteName(data.site), fee: data.fee };
}

function showsStranded(w: World): boolean {
  return w.player.beacon || isStranded(w, playerVehicle(w)) || canAbandonRun(w);
}

function strandedReason(w: World): Msg | null {
  const me = playerVehicle(w);
  if (!hasWorkingEngine(me)) return t("stranded.noEngine");
  if (!isWorking(corePart(me, "transmission"))) return t("stranded.transmission");
  if (w.player.fuel <= 0) return t("stranded.noFuel");
  return null;
}

export type SpeedRow = { label: Msg; value: Msg; delta: number };

export type TipLine = { label: Msg; value: Msg; tone: 'base' | 'bad' | 'good' | 'plain' };

export type PowerChip = { text: Msg; detail: Msg; over: boolean };

function percent(factor: number): Msg {
  const pct = Math.round((factor - 1) * 100);
  if (pct === 0) return t("speed.pctZero");
  return pct < 0 ? t("speed.pctDown", { n: -pct }) : t("speed.pctUp", { n: pct });
}

function byKph(delta: number): Msg {
  return delta < 0 ? t("speed.kphDown", { n: -delta }) : t("speed.kphUp", { n: delta });
}

export function powerNumber(n: number): number {
  return Number(n.toFixed(1));
}

type Kind<K extends SpeedStep['kind']> = Extract<SpeedStep, { kind: K }>;
type Wording = { [K in SpeedStep['kind']]: (step: Kind<K>, weather: Msg) => Msg };

const WORDING: Wording = {
  chassis: () => t("speed.chassis"),
  engine: (s) => (s.worn ? t("speed.engineWorn") : t("speed.engine")),
  ability: (s) => abilityName(s.id),
  load: () => t("speed.load"),
  wheels: (s) => t("speed.wheels", { n: s.broken }),
  guns: () => t("speed.guns"),
  floor: () => t("speed.floor"),
  overdrive: () => t("speed.overdrive"),
  transmission: () => t("speed.transmission"),
  limp: (s) => t(`speed.limp.${s.cause}`),
  weather: (_s, weather) => weather,
  towing: () => t("speed.towing"),
};

function labelOf(weather: Msg, step: SpeedStep): Msg {
  const word = WORDING[step.kind] as (step: SpeedStep, weather: Msg) => Msg;
  return word(step, weather);
}

export function speedRows(weather: Msg, steps: SpeedStep[]): SpeedRow[] {
  const rows: SpeedRow[] = [];
  steps.forEach((step, i) => {
    const label = labelOf(weather, step);
    if (step.kind === 'limp') return void rows.push({ label, value: t("speed.crawlValue", { n: kph(step.speed) }), delta: 0 });
    if (i === 0) return;
    const delta = kph(step.speed) - kph(steps[i - 1].speed);
    if (delta !== 0) rows.push({ label, value: byKph(delta), delta });
  });
  return rows;
}

export function speedNotes(w: World, v: Vehicle, steps: SpeedStep[]): TipLine[] {
  const fuel = fuelLimit(w, v, steps.some((s) => s.kind === 'guns'));
  if (fuel === 'low') return [{ label: t("speed.lowFuelLabel"), value: t("speed.lowFuelValue", { n: kph(lowFuelSpeed(steps[steps.length - 1].speed)) }), tone: 'bad' }];
  if (fuel === 'empty') return [{ label: t("speed.emptyTankLabel"), value: t("speed.crawl"), tone: 'bad' }];
  return [];
}

export function speedTip(base: number, rows: SpeedRow[], notes: TipLine[]): TipLine[] {
  const causes = rows.map((r): TipLine => ({ label: r.label, value: r.value, tone: r.delta > 0 ? 'good' : r.delta < 0 ? 'bad' : 'plain' }));
  return [{ label: t("speed.base"), value: t("speed.kph", { n: base }), tone: 'base' }, ...causes, ...notes];
}

function gunStep(steps: SpeedStep[]): { step: Kind<'guns'>; before: number } | null {
  const i = steps.findIndex((s) => s.kind === 'guns');
  const step = steps[i];
  return step?.kind === 'guns' ? { step, before: steps[i - 1].speed } : null;
}

function gunCost(steps: SpeedStep[]): { short: Msg; long: Msg } {
  const guns = gunStep(steps);
  if (!guns) return { short: t("power.noCostStalled"), long: t("power.noneStalled") };
  const lost = kph(guns.before) - kph(guns.step.speed);
  if (lost === 0) return { short: t("power.noCost"), long: t("power.none") };
  const pct = percent(guns.step.factor);
  return { short: t("power.cost", { pct }), long: t("power.costLong", { pct, n: lost }) };
}

export function powerChip(steps: SpeedStep[], v: Vehicle): PowerChip {
  const capacity = workingEngineCapacity(v);
  if (capacity === null) {
    return { text: t("power.noEngine"), detail: t("power.noEngineDetail"), over: false };
  }
  const draw = gunDraw(v);
  const over = draw > capacity;
  const balance = over ? t("power.over", { n: powerNumber(draw - capacity) }) : t("power.spare", { n: powerNumber(capacity - draw) });
  const cost = gunCost(steps);
  const power = { draw: powerNumber(draw), capacity: powerNumber(capacity) };
  const detail = t("power.detail", { ...power, balance, cost: cost.long });
  const text = over ? t("power.chipOver", { ...power, balance, cost: cost.short }) : t("power.chip", { ...power, cost: cost.short });
  return { text, detail, over };
}

export type Readout = { id: string; label: Msg; value: Msg; warning: boolean; danger?: boolean; progress?: number; idle?: boolean; icon?: IconName; balance?: number; tip?: Msg };

export function getHudReadout(w: World) {
  const me = playerVehicle(w);
  const capacity = fuelCap(me);
  const p = w.player;
  const maxHealth = maxHealthOf(w);
  const heat = heatAt(w, me.pos);
  const weather = weatherLabel(w, me.pos);
  const steps = maxSpeedSteps(w, me);
  const notes = speedNotes(w, me, steps);
  const fuelTip = notes.length > 0 ? t("speed.line", { label: notes[0].label, effect: notes[0].value }) : t("readout.fuel");
  const resources: Readout[] = [
    { id: "money", label: t("readout.money"), value: moneyLabel(p.money), balance: p.money, warning: p.money < 0 },
    { id: "fuel", label: t("readout.fuel"), value: t("readout.litersShort", { n: fuelLiters(p.fuel) }), warning: p.fuel < capacity * RULES.lowFuelThreshold, icon: "fuel", tip: fuelTip },
    { id: "supplies", label: t("readout.supplies"), value: t("readout.kgShort", { n: Math.round(p.supplies) }), warning: p.supplies <= RULES.suppliesLow, icon: "supplies" },
    { id: "driver", label: t("readout.driver"), value: num(hp(p.health), "int"), warning: p.health < maxHealth, danger: coreBurning(w, me), icon: "health" },
    ...runResources(w),
  ];
  const storm = w.weather.some((e) => e.kind === "storm" && dist(me.pos, e.pos) - e.radius <= TERRAIN.vision.radius);
  const survival: Readout[] = [
    { id: "heat", label: t("readout.heat"), value: t("readout.celsius", { n: celsius(heat) }), warning: heat >= HOT, icon: "heat" },
    { id: "engine", label: t("readout.engine"), value: t("readout.celsius", { n: engineCelsius(p.engineHeat) }), warning: p.engineHeat >= ENGINE_HEAT.warnAt, progress: p.engineHeat, icon: "engineHeat" },
    { id: "weather", label: t("readout.weather"), value: weather.text, warning: storm, idle: weather.clear, tip: weather.text },
  ];
  return {
    speed: kph(me.speed),
    heading: me.heading,
    maxSpeed: kph(steps[steps.length - 1].speed),
    maxSpeedTip: speedTip(kph(steps[0].speed), speedRows(weather.text, steps), notes),
    manual: me.direct,
    clock: clock(w.turn),
    resources,
    survival,
  };
}

function coreBurning(w: World, me: Vehicle): boolean {
  return w.events.some((e) => e.t === "coreBurn" && e.vehicle === me.id);
}

function runResources(w: World): Readout[] {
  const run = chaosHighwayReadout(w);
  if (!run) return [];
  const left = distanceText(run.toOutpost);
  const tip = t("readout.runTip", { stretch: run.stretch, left, site: siteName(run.outpostId) });
  return [{ id: "run", label: t("readout.run"), value: t("readout.runValue", { stretch: run.stretch, left }), warning: false, icon: "range", tip }];
}

export function versionLabel(): string {
  return `v${GAME_VERSION}`;
}
