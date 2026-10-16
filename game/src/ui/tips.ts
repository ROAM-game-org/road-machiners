
import { touchMode } from "./input-mode";
import { isKnockedOut } from "../sim/defeat";
import { playerVehicle } from "../sim/damage";
import { introStep } from "../sim/quests";
import { cageMounted, openingState, openingStockOf, type OpeningState, type OpeningStep } from "../sim/opening";
import { OPENING } from "../data/start";
import { RULES } from "../data/rules";
import { engineNeedsPatch } from "../sim/repair";
import { canReachSalvage, hasSalvage } from "../sim/salvage";
import type { World } from "../sim/types";
import { vehicleStats } from "../sim/stats";
import { playerSees } from "../sim/vision";
import { dist, type Vec } from "../sim/vec";
import { playerCanAct, hostileToPlayer, startPose } from "../sim/world";
import { t } from "../text/msg";
import { modeRules } from "../sim/settings";
import { el, panel } from "./dom";

const TIPS_KEY = "roam.tips";
const TIPS_OFF_KEY = "roam.tipsOff";

export type TipId = OpeningStep | "waypoint" | "drive" | "autoStop" | "stop" | "stopAt" | "manual" | "zones" | "aim" | "honk" | "farewell";

type Tip = {
  id: TipId;
  opening?: true;
  after?: TipId;
  seenWhenOver?: true;
  turns?: number;
  duringOpening?: (w: World) => boolean;
  when: (w: World, auto: boolean, o: OpeningState) => boolean;
  done: (w: World, o: OpeningState) => boolean;
};

const TIP_PAUSE_AFTER_QUEST_MS = 3000;
const ZONES_TIP_TURNS = 2;
const spawn = startPose().pos;
const departureFrom = (w: World): Vec => openingStockOf(w)?.pos ?? spawn;

const npcInSight = (w: World): boolean =>
  w.vehicles.some((v) => v.brain && !isKnockedOut(v) && playerSees(w, v.pos));

const hostileInSight = (w: World): boolean =>
  w.vehicles.some((v) => v.brain && !isKnockedOut(v) && hostileToPlayer(w, v) && playerSees(w, v.pos));

const moving = (w: World): boolean => playerVehicle(w).speed > RULES.parkedSpeed;

const hasWaypoint = (w: World): boolean => {
  const kind = playerVehicle(w).order?.kind;
  return kind === "through" || kind === "stopAt";
};

const searchedOpening = (w: World, { stock }: OpeningState): boolean => stock !== null && w.player.scavenged.includes(stock.id);

const inOpeningReach = (w: World, { stock }: OpeningState): boolean => stock !== null && canReachSalvage(playerVehicle(w), stock);

const openingTip = (id: OpeningStep, done: (w: World, o: OpeningState) => boolean): Tip => ({
  id,
  opening: true,
  when: (w, _auto, o) => !playerVehicle(w).direct && o.step === id,
  done,
});

const TIPS: readonly Tip[] = [
  openingTip(
    "wreck",
    (w, o) => inOpeningReach(w, o) || searchedOpening(w, o),
  ),
  openingTip("search", searchedOpening),
  openingTip(
    "loot",
    (w, o) => o.stock !== null && searchedOpening(w, o) && !hasSalvage(o.stock),
  ),
  openingTip(
    "patch",
    (w, o) => o.stock !== null && !engineNeedsPatch(w, playerVehicle(w)),
  ),
  openingTip(
    "install",
    (w, o) => o.stock !== null && cageMounted(w),
  ),
  {
    id: "waypoint",
    when: (w) => !playerVehicle(w).direct,
    done: (w) => hasWaypoint(w),
  },
  {
    id: "drive",
    after: "waypoint",
    when: (w) => !playerVehicle(w).direct && hasWaypoint(w),
    done: moving,
  },
  {
    id: "autoStop",
    after: "drive",
    when: (_w, auto) => auto,
    done: () => false,
    seenWhenOver: true,
  },
  {
    id: "stop",
    after: "drive",
    duringOpening: (w) => moving(w) && playerVehicle(w).order?.kind === "through",
    when: moving,
    done: (w) => playerVehicle(w).order?.kind === "brake",
  },
  {
    id: "stopAt",
    after: "stop",
    when: (w) => !playerVehicle(w).direct,
    done: (w) => playerVehicle(w).order?.kind === "stopAt",
  },
  {
    id: "manual",
    after: "stopAt",
    when: (w) => !playerVehicle(w).direct,
    done: (w) => playerVehicle(w).direct,
  },
  {
    id: "zones",
    turns: ZONES_TIP_TURNS,
    when: (w) => playerVehicle(w).direct,
    done: () => false,
  },
  {
    id: "aim",
    when: (w) => vehicleStats(w, playerVehicle(w)).weapons.length > 0 && hostileInSight(w),
    done: (w) => Object.values(playerVehicle(w).weaponOrders).some((o) => o.aim !== "body"),
  },
  {
    id: "honk",
    when: (w) => modeRules(w).radio && npcInSight(w),
    done: (w) => w.events.some((e) => e.t === "honk" && e.vehicle === w.player.vehicleId),
  },
  {
    id: "farewell",
    after: "honk",
    when: (w) => introStep(w) === "off" && dist(playerVehicle(w).pos, departureFrom(w)) >= OPENING.leaveDistance,
    done: () => false,
  },
];

const openingLive = (o: OpeningState, seen: ReadonlySet<TipId>): boolean => o.step !== null && !seen.has(o.step);

export function doneTips(world: World, seen: ReadonlySet<TipId>): TipId[] {
  const o = openingState(world);
  const live = openingLive(o, seen);
  return TIPS.filter((t) => (t.opening || t.duringOpening || !live) && t.done(world, o)).map((t) => t.id);
}

function isOpen(t: Tip, seen: ReadonlySet<TipId>, live: boolean): boolean {
  if (seen.has(t.id)) return false;
  return (t.opening === true || !live) && (!t.after || seen.has(t.after));
}

function earlyTip(world: World, seen: ReadonlySet<TipId>, live: boolean): TipId | null {
  return live ? (TIPS.find((t) => t.duringOpening?.(world) && !seen.has(t.id))?.id ?? null) : null;
}

function regularTip(world: World, auto: boolean, seen: ReadonlySet<TipId>, shown: TipId | null, o: OpeningState): TipId | null {
  const live = openingLive(o, seen);
  const open = TIPS.filter((t) => isOpen(t, seen, live) && t.when(world, auto, o));
  return (open.find((t) => t.id === shown) ?? open[0])?.id ?? null;
}

export function tipToShow(world: World, auto: boolean, seen: ReadonlySet<TipId>, shown: TipId | null): TipId | null {
  if (!playerCanAct(world) || world.player.quests.live) return null;
  const o = openingState(world);
  return earlyTip(world, seen, openingLive(o, seen)) ?? regularTip(world, auto, seen, shown, o);
}

export function clearTips(storage: Storage): void {
  storage.removeItem(TIPS_KEY);
  storage.removeItem(TIPS_OFF_KEY);
}

export function tipsOff(storage: Storage): boolean {
  const raw = storage.getItem(TIPS_OFF_KEY);
  if (raw === null) return false;
  if (raw !== "1") throw new Error(`Stored tips switch is not "1": ${raw}`);
  return true;
}

export function setTipsOff(storage: Storage, off: boolean): void {
  if (off) storage.setItem(TIPS_OFF_KEY, "1");
  else storage.removeItem(TIPS_OFF_KEY);
}

export class TipTurns {
  private last: number | null = null;
  private readonly played = new Map<TipId, number>();

  count(world: World, shown: TipId | null): TipId | null {
    const gained = this.advance(world.turn);
    const needed = TIPS.find((t) => t.id === shown)?.turns;
    if (shown === null || needed === undefined) return null;
    return this.add(shown, playerVehicle(world).direct ? gained : 0) >= needed ? shown : null;
  }

  private advance(turn: number): number {
    const gained = this.last === null ? 0 : Math.max(0, turn - this.last);
    this.last = turn;
    return gained;
  }

  private add(id: TipId, gained: number): number {
    const total = (this.played.get(id) ?? 0) + gained;
    this.played.set(id, total);
    return total;
  }
}

export type TipSwitch = { isOn: () => boolean; setOn: (on: boolean) => void };

export function readSeen(storage: Storage): Set<TipId> {
  const raw = storage.getItem(TIPS_KEY);
  if (raw === null) return new Set();
  const ids: unknown = JSON.parse(raw);
  const known = new Set<string>(TIPS.map((t) => t.id));
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === "string" && known.has(id)))
    throw new Error(`Stored tips are not a list of tip ids: ${raw}`);
  return new Set(ids as TipId[]);
}

export class Tips {
  private readonly box: HTMLElement;
  private readonly seen: Set<TipId>;
  private shown: TipId | null = null;
  private moment: { world: World; auto: boolean } | null = null;
  private questWasOpen = false;
  private heldUntil = 0;
  private readonly turns = new TipTurns();

  private off: boolean;

  constructor(
    private readonly storage: Storage,
    parent: HTMLElement,
    private readonly onTurnedOff: () => void,
  ) {
    this.box = panel("tip", parent);
    this.seen = readSeen(storage);
    this.off = tipsOff(storage);
    this.box.style.display = "none";
  }

  update(world: World, auto: boolean): void {
    this.moment = { world, auto };
    this.markDone(world);
    if (this.off) {
      if (this.shown !== null) {
        this.shown = null;
        this.render();
      }
      return;
    }
    this.holdAfterQuest(world);
    const next = performance.now() < this.heldUntil ? null : tipToShow(world, auto, this.seen, this.shown);
    if (next === this.shown) return;
    this.passShown();
    this.shown = next;
    this.render();
  }

  private markDone(world: World): void {
    const counted = this.turns.count(world, this.shown);
    if (counted) this.markSeen(counted);
    for (const id of doneTips(world, this.seen)) this.markSeen(id);
  }

  private holdAfterQuest(world: World): void {
    const questOpen = world.player.quests.live !== null;
    if (this.questWasOpen && !questOpen) {
      this.heldUntil = performance.now() + TIP_PAUSE_AFTER_QUEST_MS;
      window.setTimeout(() => {
        if (this.moment) this.update(this.moment.world, this.moment.auto);
      }, TIP_PAUSE_AFTER_QUEST_MS);
    }
    this.questWasOpen = questOpen;
  }

  isOn(): boolean {
    return !this.off;
  }

  setOn(on: boolean): void {
    if (on === !this.off) return;
    setTipsOff(this.storage, !on);
    this.off = !on;
    this.shown = null;
    this.render();
    if (on && this.moment) this.update(this.moment.world, this.moment.auto);
    if (!on) this.onTurnedOff();
  }

  private passShown(): void {
    const tip = TIPS.find((t) => t.id === this.shown);
    if (tip?.seenWhenOver) this.markSeen(tip.id);
  }

  private markSeen(id: TipId): void {
    if (this.seen.has(id)) return;
    this.seen.add(id);
    this.storage.setItem(TIPS_KEY, JSON.stringify([...this.seen]));
  }

  private close(): void {
    if (!this.shown || !this.moment) throw new Error("Closed a tip that was never shown");
    this.markSeen(this.shown);
    this.shown = null;
    this.render();
    this.update(this.moment.world, this.moment.auto);
  }

  private render(): void {
    const tip = TIPS.find((t) => t.id === this.shown);
    this.box.style.display = tip ? "" : "none";
    if (!tip) return;
    this.box.classList.toggle("opening-tip", tip.opening === true);
    this.box.replaceChildren(
      el("span", { class: "tip-text" }, t(touchMode() ? `hint.touch.${tip.id}` : `hint.${tip.id}`)),
      el("button", { class: "tip-close", title: t("hint.closeThis"), "aria-label": t("hint.closeThis"), onclick: () => this.close() }, t("hint.closeMark")),
      el("div", { class: "tip-actions" }, el("button", { class: "tip-off", onclick: () => this.setOn(false) }, t("hint.turnOff"))),
    );
  }
}
