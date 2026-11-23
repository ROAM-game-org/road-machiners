import { partDef } from "../data/parts";
import { fireBlock, gunOf, hitOdds, type FireBlock } from "../sim/combat";
import { gaveUp, isKnockedOut } from "../sim/defeat";
import { findPart, playerVehicle, vehicleById } from "../sim/damage";
import { vehicleStats, type MountedWeapon } from "../sim/stats";
import type { Aim, PartInstance, UtilityOrder, Vehicle, World } from "../sim/types";
import { playerSees } from "../sim/vision";
import { workOf, type WorkLeft } from "../sim/states";
import { actBlock, cutPlayerLine, reloadWeapon, setAutoFire, setUtilityOrder, setWeaponOrder } from "../sim/world";
import { chargeOf, chargedParts, orderKindOf, utilityBlock, utilityOrderError, wornReload } from "../sim/utility";
import { oilShort } from "../sim/hazards";
import { bottomLeft } from "./dom";
import type { UiHost } from "./host";
import { FASTER_KEY, heldPick, SLOWER_KEY } from "./travel-speed";
import { clockOf } from "../sim/sun";
import { clock } from "./format";
import { modeRules } from "../sim/settings";
import { WeaponsPanel, type AmmoCell, type GunCellView, type GunStatus, type KeyView, type UtilitySlotView, type WeaponsView } from "./dash/weapon-blocks";
import { RadioDeck, type DeckView, type TurnKeyView } from "./dash/panels";
import { canCall } from "./dialogue";
import { workLabel } from "./format";
import { concat, LINE_BREAK, t, verbatim, type Msg, type PlainKey } from "../text/msg";
import { partName } from "../text/names";

export const blockWords = (block: FireBlock): Msg => t(`block.${block}`);

export type WeaponMark = { slot: number; defId: string; status: Msg; ready: boolean };
export type JobMark = { label: Msg; work: WorkLeft };
export type VehicleMark = { weapons: WeaponMark[]; radio: boolean; job: JobMark | null; out: boolean; gaveUp: boolean };

export function vehicleMarks(w: World, hovered: string | null): Map<string, VehicleMark> {
  const marks = new Map<string, VehicleMark>();
  const markOf = (id: string) => {
    const found = marks.get(id);
    if (found) return found;
    const made: VehicleMark = { weapons: [], radio: false, job: null, out: false, gaveUp: false };
    marks.set(id, made);
    return made;
  };
  vehicleStats(w, playerVehicle(w)).weapons.forEach((mw, i) => {
    const readout = getWeaponReadout(w, mw);
    if (readout.target)
      markOf(readout.target.id).weapons.push({ slot: i + 1, defId: mw.part.defId, status: readout.status, ready: readout.canFire });
  });
  if (hovered && canCall(w, hovered)) markOf(hovered).radio = true;
  markSeenNpcs(w, markOf);
  return marks;
}

function ownJob(w: World): JobMark | null {
  const me = playerVehicle(w);
  const work = workOf(w, me);
  if (!work) return null;
  const label = workLabel(w, me, work);
  return { label: work.queued > 0 ? t("hud.workQueued", { label, k: work.queued }) : label, work: { turnsLeft: work.turnsLeft, total: work.total } };
}

function markSeenNpcs(w: World, markOf: (id: string) => VehicleMark): void {
  const own = ownJob(w);
  if (own) markOf(w.player.vehicleId).job = own;
  for (const v of w.vehicles.filter((x) => x.brain && playerSees(w, x.pos))) {
    const job = seenNpcJob(w, v);
    if (job) markOf(v.id).job = job;
    if (isKnockedOut(v)) {
      markOf(v.id).out = true;
      markOf(v.id).gaveUp = gaveUp(v);
    }
  }
}

function seenNpcJob(w: World, v: Vehicle): JobMark | null {
  const work = workOf(w, v);
  return work && { label: workLabel(w, v, work), work: { turnsLeft: work.turnsLeft, total: work.total } };
}

export function aimsBody(w: World, weapons: readonly MountedWeapon[], targetId: string): boolean {
  const orders = playerVehicle(w).weaponOrders;
  return weapons.length > 0 && weapons.every((mw) => orders[mw.part.id]?.targetId === targetId && orders[mw.part.id].aim === "body");
}

export function gunsLabel(w: World, selected: readonly string[]): Msg {
  if (selected.length === 0) return t("weapon.noGunSelected");
  if (selected.length > 1) return t("weapon.allGuns");
  const i = vehicleStats(w, playerVehicle(w)).weapons.findIndex((mw) => mw.part.id === selected[0]);
  return i < 0 ? t("weapon.noGunSelected") : t("weapon.gunN", { n: i + 1 });
}

export type AimState = { guns: Msg; body: number[]; bodyAimed: boolean; locked: boolean; hasGuns: boolean };

export function aimStateOf(w: World, selected: readonly string[], locked: boolean, targetId: string): AimState {
  const weapons = weaponsForClick(w, selected);
  return { guns: gunsLabel(w, selected), body: bodyMarks(w, targetId), bodyAimed: aimsBody(w, weapons, targetId), locked, hasGuns: weapons.length > 0 };
}

type AimHost = { world: () => World; selected: () => readonly string[]; canAim: () => boolean; apply: (next: () => World) => void };

export function aimActions(h: AimHost) {
  const guns = () => weaponsForClick(h.world(), h.selected());
  return {
    aimState: (id: string) => aimStateOf(h.world(), h.selected(), !h.canAim(), id),
    aimPart: (id: string, partId: string) => h.canAim() && h.apply(() => aimAtPart(h.world(), guns(), vehicleById(h.world(), id), partId)),
  };
}

export function toggleBodyAim(w: World, weapons: readonly MountedWeapon[], target: Vehicle): World {
  const aimed = aimsBody(w, weapons, target.id);
  if (w.player.autoFire) w = setAutoFire(w, false);
  for (const mw of weapons)
    w = setWeaponOrder(w, mw.part.id, aimed ? null : { targetId: target.id, aim: "body" });
  return w;
}

export function aimAtPart(w: World, weapons: readonly MountedWeapon[], target: Vehicle, partId: string): World {
  const orders = playerVehicle(w).weaponOrders;
  const aimed = weapons.length > 0 && weapons.every((mw) => orders[mw.part.id]?.targetId === target.id && orders[mw.part.id].aim === partId);
  if (w.player.autoFire) w = setAutoFire(w, false);
  for (const mw of weapons)
    w = setWeaponOrder(w, mw.part.id, aimed ? null : { targetId: target.id, aim: partId });
  return w;
}

export function aimMarks(w: World, targetId: string): Map<string, number[]> {
  const marks = new Map<string, number[]>();
  const orders = playerVehicle(w).weaponOrders;
  vehicleStats(w, playerVehicle(w)).weapons.forEach((mw, i) => {
    const order = orders[mw.part.id];
    if (!order || order.targetId !== targetId || order.aim === "body") return;
    marks.set(order.aim, [...(marks.get(order.aim) ?? []), i + 1]);
  });
  return marks;
}

export function bodyMarks(w: World, targetId: string): number[] {
  const orders = playerVehicle(w).weaponOrders;
  const marks: number[] = [];
  vehicleStats(w, playerVehicle(w)).weapons.forEach((mw, i) => {
    const order = orders[mw.part.id];
    if (order?.targetId === targetId && order.aim === "body") marks.push(i + 1);
  });
  return marks;
}

export function aimName(target: Vehicle, aim: Aim): Msg {
  const part = aim === "body" ? null : findPart(target, aim);
  return part ? partName(part.defId) : t("weapon.bodyShot");
}

export function blockText(mw: MountedWeapon, block: FireBlock): Msg {
  const gun = gunOf(mw.part);
  if (block === "cooldown") return t("weapon.readyIn", { n: gun.cooldown });
  if (block === "empty") return t("weapon.reloadingFor", { n: mw.def.reload - gun.reloadWork });
  return blockWords(block);
}

export function ammoText(mw: MountedWeapon): Msg {
  return t("weapon.ammo", { n: gunOf(mw.part).ammo, of: mw.def.magazine });
}





export function lineOut(w: World, mw: MountedWeapon): boolean {
  const me = playerVehicle(w);
  return w.lines.some((line) => line.from === me.id && line.fromPart === mw.part.id);
}

export function ammoCells(magazine: number, ammo: number, reloadWork: number, reload: number): AmmoCell[] {
  const spent = magazine - ammo;
  const filled = reloadWork > 0 ? Math.min(spent, Math.ceil((reloadWork / reload) * spent)) : 0;
  return Array.from({ length: magazine }, (_, i) => (i < ammo ? "loaded" : i < ammo + filled ? "refill" : "spent"));
}

const ERROR_BLOCKS: readonly FireBlock[] = ["disabled", "shutDown"];

function broken(mw: MountedWeapon, block: FireBlock | null): boolean {
  return mw.part.hp <= 0 || (block !== null && ERROR_BLOCKS.includes(block));
}

function gunAimStatus(w: World, mw: MountedWeapon, readout: ReturnType<typeof getWeaponReadout>): GunStatus {
  const order = playerVehicle(w).weaponOrders[mw.part.id];
  if (readout.chance === null || readout.target === null || !order) return { kind: "noTarget" };
  return { kind: "aiming", part: aimName(readout.target, order.aim), chance: t("hit.chance", { pct: Math.round(readout.chance * 100) }) };
}

export function gunStatus(w: World, mw: MountedWeapon): GunStatus {
  const readout = getWeaponReadout(w, mw);
  if (broken(mw, readout.block)) return { kind: "error" };
  if (mw.def.line && lineOut(w, mw)) return { kind: "gotEm" };
  if (gunOf(mw.part).reloadWork > 0 || readout.block === "empty") return { kind: "reloading" };
  return gunAimStatus(w, mw, readout);
}

function magazineBlock(mw: MountedWeapon): Msg | null {
  const gun = gunOf(mw.part);
  if (gun.ammo === 0 || gun.reloadWork > 0) return t("weapon.reloadBusy");
  return gun.ammo < mw.def.magazine ? null : t("weapon.reloadFull");
}

export function reloadBlock(w: World, mw: MountedWeapon): Msg | null {
  if (mw.part.hp <= 0) return t("weapon.reloadBroken");
  if (mw.def.line) return lineOut(w, mw) ? null : t("weapon.noLineOut");
  return magazineBlock(mw);
}

export const NO_GUN_SELECTED: Msg = t("weapon.noGunSelected");

function firstReason(guns: readonly MountedWeapon[], blockOf: (mw: MountedWeapon) => Msg | null): Msg | null {
  if (guns.length === 0) return NO_GUN_SELECTED;
  const reasons = guns.map(blockOf);
  return reasons.some((r) => r === null) ? null : reasons[0];
}

export function reloadReason(w: World, guns: readonly MountedWeapon[]): Msg | null {
  return firstReason(guns, (mw) => reloadBlock(w, mw));
}

export function holdReason(w: World, guns: readonly MountedWeapon[]): Msg | null {
  const orders = playerVehicle(w).weaponOrders;
  return firstReason(guns, (mw) => (orders[mw.part.id] ? null : t("weapon.noHoldTarget")));
}

export function reloadGuns(w: World, guns: readonly MountedWeapon[]): World {
  for (const mw of guns.filter((g) => reloadBlock(w, g) === null)) w = mw.def.line ? cutPlayerLine(w, mw.part.id) : reloadWeapon(w, mw.part.id);
  return w;
}

export function holdGuns(w: World, guns: readonly MountedWeapon[]): World {
  let next = setAutoFire(w, false);
  for (const mw of guns) next = setWeaponOrder(next, mw.part.id, null);
  return next;
}

export function orderLock(w: World): Msg | null {
  return actBlock(w) === "knockedOut" ? t("actBlock.knockedOut") : null;
}

export function lockReason(w: World): Msg | null {
  const block = actBlock(w);
  return orderLock(w) ?? (block === null ? null : t(`actBlock.${block}`));
}







export function getWeaponReadout(w: World, mw: MountedWeapon) {
  const me = playerVehicle(w);
  const order = me.weaponOrders[mw.part.id];
  const assigned = order
    ? (w.vehicles.find((v) => v.id === order.targetId) ?? null)
    : null;
  const target = assigned && playerSees(w, assigned.pos) ? assigned : null;
  const block = fireBlock(w, me, mw, assigned);
  const status = block ? blockText(mw, block) : t("weapon.ready");
  return {
    target,
    status,
    chance:
      block === null && target && order
        ? hitOdds(w, me, mw, target, order.aim).damageChance
        : null,
    canFire: block === null,
    block,
  };
}

export const UTILITY_SLOTS = 4;
export const SLOT_KEYS = 9;

export function utilityKey(w: World, i: number): number | null {
  const key = vehicleStats(w, playerVehicle(w)).weapons.length + i + 1;
  return key <= SLOT_KEYS ? key : null;
}


export type UtilityState = "ready" | "aiming" | "set" | "armed" | "recharging" | "blocked";
export type UtilityStatus = { state: UtilityState; text: Msg; reload?: { left: number; total: number } };

export function utilitySlots(w: World): PartInstance[] {
  return chargedParts(playerVehicle(w)).slice(0, UTILITY_SLOTS);
}

export function utilityStatus(w: World, part: PartInstance, selected: boolean): UtilityStatus {
  const kind = orderKindOf(part);
  if (kind === null) throw new Error(`${part.defId} is passive and has no slot`);
  const order = playerVehicle(w).utilityOrders[part.id];
  if (order) return { state: "set", text: t(order.kind === "disarm" ? "utility.disarms" : "utility.fires") };
  if (chargeOf(part).armed) return { state: "armed", text: t("utility.armed") };
  return aimingStatus(w, part, kind, selected) ?? idleStatus(w, part);
}

function aimingStatus(w: World, part: PartInstance, kind: UtilityOrder["kind"], selected: boolean): UtilityStatus | null {
  if (!selected || kind === "self" || aimBlock(w, part) !== null) return null;
  return { state: "aiming", text: t("utility.aiming") };
}

function idleStatus(w: World, part: PartInstance): UtilityStatus {
  const block = utilityBlock(w, playerVehicle(w), part);
  if (block === "cooldown") return { state: "recharging", text: utilityBlockText(part, block), reload: { left: chargeOf(part).reload, total: wornReload(part) } };
  if (block) return { state: "blocked", text: utilityBlockText(part, block) };
  return noFuel(w, part) ? { state: "blocked", text: t("utility.noFuel") } : { state: "ready", text: t("weapon.ready") };
}

function noFuel(w: World, part: PartInstance): boolean {
  const def = partDef(part.defId);
  return def.kind === "utility" && def.effect.type === "oil" && oilShort(w, playerVehicle(w), def.effect.fuel);
}

export function aimBlock(w: World, part: PartInstance): FireBlock | null {
  return utilityBlock(w, playerVehicle(w), part);
}

export function utilityBlockText(part: PartInstance, block: FireBlock): Msg {
  if (block === "cooldown") return t("utility.recharging", { n: chargeOf(part).reload });
  return block === "disabled" ? t("blockShort.disabled") : blockWords(block);
}

export class UtilityRow {
  constructor(private host: UiHost) {}

  selectUtility(i: number): void {
    this.host.whenTurnEnds(() => this.selectNow(i));
  }

  private selectNow(i: number): void {
    const w = this.host.world();
    if (orderLock(w) !== null) return;
    const part = utilitySlots(w)[i];
    if (!part) return;
    if (playerVehicle(w).utilityOrders[part.id]) return this.clearOrder(w, part);
    if (orderKindOf(part) === "self") return chargeOf(part).armed ? this.disarm(w, part) : this.useSelf(w, part);
    this.togglePick(w, part);
  }

  private togglePick(w: World, part: PartInstance): void {
    const repeat = this.host.selectedUtility() === part.id;
    this.host.selectUtility(repeat || aimBlock(w, part) ? null : part.id);
  }

  private clearOrder(w: World, part: PartInstance): void {
    if (this.host.selectedUtility() === part.id) this.host.selectUtility(null);
    this.host.apply(setUtilityOrder(w, part.id, null));
  }

  private disarm(w: World, part: PartInstance): void {
    if (utilityOrderError(w, playerVehicle(w), part.id, { kind: "disarm" }) === null)
      this.host.apply(setUtilityOrder(w, part.id, { kind: "disarm" }));
  }

  private useSelf(w: World, part: PartInstance): void {
    if (utilityOrderError(w, playerVehicle(w), part.id, { kind: "self" }) === null)
      this.host.apply(setUtilityOrder(w, part.id, { kind: "self" }));
  }
}



function speedTitle(index: number, playing: number | null): Msg {
  const pick = heldPick(index, playing);
  const lines = [concat([verbatim(`${SLOWER_KEY} `), t("turn.speed.slower")]), concat([verbatim(`${FASTER_KEY} `), t("turn.speed.faster")])];
  if (pick !== null) lines.push(t("turn.speed.held", { pick }));
  return concat(lines.flatMap((line, i) => (i === 0 ? [line] : [LINE_BREAK, line])));
}

function gunCell(w: World, mw: MountedWeapon, i: number, selected: readonly string[]): GunCellView {
  const gun = gunOf(mw.part);
  const status = gunStatus(w, mw);
  return {
    defId: mw.part.defId,
    name: partName(mw.def.id),
    cells: mw.def.line || status.kind === "error" ? null : ammoCells(mw.def.magazine, gun.ammo, gun.reloadWork, mw.def.reload),
    status,
    picked: selected.includes(mw.part.id),
    title: partName(mw.def.id),
    key: i < SLOT_KEYS ? String(i + 1) : null,
  };
}

function keyView(title: Msg, locked: Msg | null, reason: Msg | null): KeyView {
  return { title, reason: locked ?? reason };
}

function utilitySlotView(host: UiHost, w: World, part: PartInstance, i: number): UtilitySlotView {
  const selected = host.selectedUtility() === part.id;
  const status = utilityStatus(w, part, selected);
  const key = utilityKey(w, i);
  return {
    defId: part.defId,
    label: t(`utility.short.${part.defId}` as Extract<PlainKey, `utility.short.${string}`>),
    state: status.state,
    picked: selected,
    title: t("utility.slotLabel", { name: partName(part.defId), status: status.text }),
    key: key === null ? null : String(key),
  };
}

export function weaponsViewOf(host: UiHost): WeaponsView {
  const w = host.world();
  const locked = lockReason(w);
  const selected = host.selectedWeapons();
  const guns = vehicleStats(w, playerVehicle(w)).weapons;
  return {
    guns: guns.map((mw, i) => gunCell(w, mw, i, selected)),
    all: { on: guns.length > 0 && selected.length === guns.length, title: t("weapon.allSwitchTitle"), reason: locked },
    auto: { on: w.player.autoFire, title: t("weapon.autoSwitchTitle"), reason: locked },
    reload: keyView(t("weapon.reload"), locked, reloadReason(w, weaponsForClick(w, selected))),
    hold: keyView(t("weapon.hold"), locked, holdReason(w, weaponsForClick(w, selected))),
    utilities: utilitySlots(w).map((part, i) => utilitySlotView(host, w, part, i)),
    pageTitle: (page, pages) => t("hud.gunPageTitle", { page, pages }),
  };
}

function turnView(host: UiHost): TurnKeyView {
  const phase = host.getTurnPhase();
  if (host.autoTravel()) return { title: t("turn.autoTitle"), label: t("turn.stopAuto"), disabled: false, auto: true };
  return { title: t("turn.endTitle"), label: phase ? t("turn.inProgress", { phase: t(`phase.${phase}`) }) : t("turn.end"), disabled: false, auto: false };
}

export function deckViewOf(host: UiHost): DeckView {
  const w = host.world();
  const { day, hour } = clockOf(w.turn);
  const playing = host.travelPlaySpeed();
  const index = host.travelSpeedIndex();
  return {
    clock: { day, hour: Math.floor(hour), minute: Math.floor((hour % 1) * 60), title: t("hud.clockLabel", { when: clock(w.turn).full }) },
    speed: { index, title: speedTitle(index, playing), reason: null, running: playing !== null },
    turn: turnView(host),
    offAir: !modeRules(w).radio,
  };
}

export class WeaponOrders {
  readonly utilities: UtilityRow;

  constructor(protected host: UiHost) {
    this.utilities = new UtilityRow(host);
  }

  protected ordersLocked(): boolean {
    return orderLock(this.host.world()) !== null;
  }

  selectWeapons(ids: readonly string[]): void {
    this.host.whenTurnEnds(() => {
      if (!this.ordersLocked()) this.host.selectWeapons(ids);
    });
  }

  toggleAll(): void {
    const w = this.host.world();
    const all = vehicleStats(w, playerVehicle(w)).weapons.map((mw) => mw.part.id);
    this.selectWeapons(all.length > 0 && this.host.selectedWeapons().length === all.length ? [] : all);
  }

  pressKey(n: number): void {
    const w = this.host.world();
    const guns = vehicleStats(w, playerVehicle(w)).weapons.length;
    if (n <= guns) this.selectIndex(n - 1);
    else this.utilities.selectUtility(n - guns - 1);
  }

  selectIndex(i: number): void {
    const w = this.host.world();
    const all = vehicleStats(w, playerVehicle(w)).weapons;
    if (i < 0 || i >= all.length) return;
    const id = all[i].part.id;
    const picked = this.host.selectedWeapons();
    this.selectWeapons(picked.length === 1 && picked[0] === id ? [] : [id]);
  }

  reloadSelected(): void {
    this.host.whenTurnEnds(() => {
      if (this.ordersLocked()) return;
      const w = this.host.world();
      this.host.apply(reloadGuns(w, weaponsForClick(w, this.host.selectedWeapons())));
    });
  }

  holdSelected(): void {
    this.host.whenTurnEnds(() => {
      if (this.ordersLocked()) return;
      const w = this.host.world();
      this.host.apply(holdGuns(w, weaponsForClick(w, this.host.selectedWeapons())));
    });
  }

  toggleAuto(): void {
    this.host.whenTurnEnds(() => {
      if (this.ordersLocked()) return;
      const w = this.host.world();
      this.host.apply(setAutoFire(w, !w.player.autoFire));
    });
  }

  goToSpeed(index: number): void {
    const from = this.host.travelSpeedIndex();
    const delta = index > from ? 1 : -1;
    for (let i = 0; i < Math.abs(index - from); i++) this.host.stepTravelSpeed(delta);
  }
}

export class WeaponPanel extends WeaponOrders {
  readonly panel: WeaponsPanel;
  readonly deck: RadioDeck;

  constructor(host: UiHost) {
    super(host);
    this.panel = new WeaponsPanel({
      labels: { all: t("weapon.all"), autoFire: t("weapon.autoFire") },
      onPickGun: (i) => this.pressKey(i + 1),
      onAll: () => this.toggleAll(),
      onAuto: () => this.toggleAuto(),
      onReload: () => this.reloadSelected(),
      onHold: () => this.holdSelected(),
      onUtility: (i) => this.utilities.selectUtility(i),
    });
    this.deck = new RadioDeck({
      dayWord: t("clock.dayWord"),
      turnLabel: t("turn.end"),
      speedLabel: (speed) => t("turn.speed.value", { n: speed }),
      onSpeed: (index) => {
        this.goToSpeed(index);
        this.render();
      },
      onTurnPress: () => host.pressTurn(),
      onTurnRelease: () => host.releaseTurn(),
    });
    this.panel.root.classList.add("weapons");
    bottomLeft().append(this.panel.root);
  }

  render(): void {
    this.panel.update(weaponsViewOf(this.host));
    this.deck.update(deckViewOf(this.host));
  }

  stepTravelSpeed(delta: 1 | -1): void {
    this.host.stepTravelSpeed(delta);
    this.render();
  }

  slotControl(n: number): HTMLElement | null {
    const w = this.host.world();
    const guns = vehicleStats(w, playerVehicle(w)).weapons.length;
    return n <= guns ? this.panel.gunControl(n - 1) : this.panel.utilityControl(n - guns - 1);
  }

  playKey(): HTMLElement {
    return this.deck.playKey();
  }

  speedKnob(): HTMLElement {
    return this.deck.speedKnob();
  }

  allKey(): HTMLElement {
    return this.panel.allKey();
  }

  autoKey(): HTMLElement {
    return this.panel.autoKey();
  }
}

export function mountedSelection(mounted: readonly MountedWeapon[], selected: readonly string[]): readonly string[] {
  const kept = selected.filter((id) => mounted.some((mw) => mw.part.id === id));
  return kept.length === selected.length ? selected : kept;
}

export function weaponsForClick(
  world: World,
  selected: readonly string[],
): readonly MountedWeapon[] {
  return vehicleStats(world, playerVehicle(world)).weapons.filter((m) => selected.includes(m.part.id));
}

export class HoverHold {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private apply: (id: string | null) => void, private delayMs: number) {}

  move(next: string | null, current: string | null): void {
    if (next !== null || current === null) return this.now(next);
    this.timer ??= setTimeout(() => this.now(null), this.delayMs);
  }

  cancel(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private now(id: string | null): void {
    this.cancel();
    this.apply(id);
  }

  watch(panel: EventTarget): void {
    panel.addEventListener("mouseenter", () => this.cancel());
    panel.addEventListener("mouseleave", () => this.now(null));
  }
}

export class InspectPin {
  private current: string | null = null;

  private seen = false;

  constructor(
    private readonly onChange: () => void,
    private readonly visible: (v: Vehicle) => boolean,
  ) {}

  get id(): string | null {
    return this.current;
  }

  click(id: string): void {
    if (id === "") throw new Error("InspectPin.click needs a vehicle id");
    this.set(id);
  }

  clear(): void {
    this.set(null);
  }

  note(v: Vehicle, inWorld: boolean): void {
    if (v.id === this.current && inWorld && this.visible(v)) this.seen = true;
  }

  settle(): void {
    if (this.current !== null && !this.seen) this.set(null);
    this.seen = false;
  }

  private set(id: string | null): void {
    if (id === this.current) return;
    this.current = id;
    this.onChange();
  }
}
