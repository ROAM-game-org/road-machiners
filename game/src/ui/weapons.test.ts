import { afterEach, describe, expect, it, vi } from "vitest";
import { hitOdds } from "../sim/combat";
import { playerVehicle } from "../sim/damage";
import { mountedParts } from "../sim/grid";
import type { Vehicle, World } from "../sim/types";
import { addState } from "../sim/states";
import { vehicleStats } from "../sim/stats";
import { addVehicle, emptyWorld, npcBrain } from "../sim/testkit";
import { refreshVision } from "../sim/vision";
import type { UiHost } from "./host";
import { makePart } from "../sim/factory";
import { mountPart } from "../sim/inventory";
import { wornReload } from "../sim/utility";
import { orderLock, lockReason } from "./weapons";
import { HoverHold, UtilityRow, WeaponOrders, aimAtPart, aimMarks, aimsBody, bodyMarks, InspectPin, gunsLabel, aimName, deckViewOf, getWeaponReadout, toggleBodyAim, vehicleMarks, utilityKey, utilitySlots, utilityStatus, weaponsViewOf } from "./weapons";
import type { Msg } from "../text/msg";
import { partName } from "../text/names";
import { resolve } from "../text/resolve";

function readout(world: World, gun: Parameters<typeof getWeaponReadout>[1]) {
  const r = getWeaponReadout(world, gun);
  return { ...r, status: en(r.status) };
}

function utilityEn(...args: Parameters<typeof utilityStatus>) {
  const s = utilityStatus(...args);
  return { ...s, text: en(s.text) };
}

function marksEn(world: World, id: string) {
  const mark = vehicleMarks(world, null).get(id);
  return mark && { ...mark, weapons: mark.weapons.map((w) => ({ ...w, status: en(w.status) })), job: mark.job && { ...mark.job, label: en(mark.job.label) } };
}

const jobEn = (world: World, id: string) => marksEn(world, id)?.job;

function en(msg: Msg): string;
function en(msg: Msg | null | undefined): string | null;
function en(msg: Msg | null | undefined): string | null {
  return msg ? resolve(msg, "en") : null;
}

function createDuel() {
  const world = emptyWorld();
  const me = world.vehicles[0];
  const target = addVehicle(world, "scrapjaw", "buggy", ["mg", "stockEngine"], {
    x: 33,
    y: 30,
  });
  refreshVision(world);
  const gun = vehicleStats(world, me).weapons[0];
  me.weaponOrders[gun.part.id] = { targetId: target.id, aim: "body" };
  return { world, me, target, gun };
}

describe("weapon readout at current positions", () => {
  it("shows the simulation hit chance for a ready weapon", () => {
    const { world, me, target, gun } = createDuel();
    expect(readout(world, gun)).toEqual({
      target,
      status: "ready",
      chance: hitOdds(world, me, gun, target, "body").damageChance,
      canFire: true,
      block: null,
    });
  });

  it("labels hold fire without a hit chance", () => {
    const { world, me, gun } = createDuel();
    me.weaponOrders = {};
    expect(readout(world, gun)).toEqual({
      target: null,
      status: "hold fire",
      chance: null,
      canFire: false,
      block: "noTarget",
    });
  });

  it("shows remaining cooldown turns without implying a shot can fire", () => {
    const { world, gun } = createDuel();
    gun.part.gun = { cooldown: 2, ammo: 1, reloadWork: 0 };
    expect(readout(world, gun)).toMatchObject({
      status: "ready in 2 turns",
      chance: null,
      canFire: false,
    });
  });

  it("shows remaining reload turns for an empty gun", () => {
    const { world, gun } = createDuel();
    gun.part.gun = { cooldown: 0, ammo: 0, reloadWork: 1 };
    expect(readout(world, gun)).toMatchObject({
      status: `reloading ${gun.def.reload - 1} ${gun.def.reload - 1 === 1 ? "turn" : "turns"}`,
      chance: null,
      canFire: false,
    });
  });

  it("hides the hit chance for an out-of-range order but keeps the target", () => {
    const { world, target, gun } = createDuel();
    target.pos.x = 30 + gun.def.range + 1;
    refreshVision(world);
    expect(readout(world, gun)).toEqual({
      target,
      status: "out of range",
      chance: null,
      canFire: false,
      block: "range",
    });
  });

  it("uses the forward arc restriction", () => {
    const { world, target, gun } = createDuel();
    const forward = { ...gun, def: { ...gun.def, arc: 60 } };
    target.pos = { x: 30, y: 33 };
    refreshVision(world);
    expect(readout(world, forward)).toMatchObject({
      status: "out of arc",
      chance: null,
      canFire: false,
    });
  });

  it("does not expose a hidden target through a stale order", () => {
    const { world, target, gun } = createDuel();
    target.pos = { x: 36, y: 30 };
    world.obstacles = [
      { id: "rock", kind: "rock", pos: { x: 33, y: 30 }, r: 1.2 },
    ];
    refreshVision(world);
    expect(readout(world, gun)).toEqual({
      target: null,
      status: "not in sight",
      chance: null,
      canFire: false,
      block: "unseen",
    });
    expect(world.vehicles).toContain(target);
  });

  it("keeps disabled status ahead of reload", () => {
    const { world, gun } = createDuel();
    gun.part.hp = 0;
    gun.part.gun = { cooldown: 2, ammo: 1, reloadWork: 0 };
    expect(readout(world, gun)).toMatchObject({
      status: "disabled",
      chance: null,
      canFire: false,
    });
  });

  it("handles a removed target as hold fire", () => {
    const { world, target, gun } = createDuel();
    world.vehicles = world.vehicles.filter((v) => v !== target);
    expect(readout(world, gun)).toEqual({
      target: null,
      status: "hold fire",
      chance: null,
      canFire: false,
      block: "noTarget",
    });
  });
});

describe("aiming the body", () => {
  it("aims at the clicked vehicle, and a second click clears the order", () => {
    const { world, target, gun } = createDuel();
    world.vehicles[0].weaponOrders = {};
    const aimed = toggleBodyAim(world, [gun], target);
    expect(aimed.vehicles[0].weaponOrders[gun.part.id]).toEqual({ targetId: target.id, aim: "body" });
    expect(toggleBodyAim(aimed, [gun], target).vehicles[0].weaponOrders).toEqual({});
  });

  it("refuses an unseen target and leaves the orders empty", () => {
    const { world, target, gun } = createDuel();
    world.vehicles[0].weaponOrders = {};
    target.pos = { x: 400, y: 400 };
    refreshVision(world);
    expect(() => toggleBodyAim(world, [gun], target)).toThrow("Refused: unseen");
    expect(world.vehicles[0].weaponOrders).toEqual({});
  });

  it("moves an order from another vehicle instead of clearing it", () => {
    const { world, gun } = createDuel();
    const other = addVehicle(world, "scrapjaw", "buggy", ["mg", "stockEngine"], { x: 30, y: 33 });
    refreshVision(world);
    const moved = toggleBodyAim(world, [gun], other);
    expect(moved.vehicles[0].weaponOrders[gun.part.id].targetId).toBe(other.id);
  });
});

describe("aim query", () => {
  it("tells whether the chosen guns have a body shot at a target, and names them", () => {
    const { world, target, gun } = createDuel();
    world.vehicles[0].weaponOrders = {};
    expect(aimsBody(world, [gun], target.id)).toBe(false);
    expect(aimsBody(world, [], target.id)).toBe(false);
    const aimed = toggleBodyAim(world, [gun], target);
    expect(aimsBody(aimed, [gun], target.id)).toBe(true);
    expect(bodyMarks(aimed, target.id)).toEqual([1]);
    expect(en(gunsLabel(world, []))).toBe("No gun selected");
    expect(en(gunsLabel(world, [gun.part.id]))).toBe("gun 1");
  });

  it("moves a part aim to the body, and a second toggle clears it", () => {
    const { world, target, gun } = createDuel();
    world.vehicles[0].weaponOrders = {};
    const wheel = mountedParts(target).find((p) => p.defId === "wheel")!;
    const onPart = aimAtPart(world, [gun], target, wheel.id);
    expect(bodyMarks(onPart, target.id)).toEqual([]);
    const body = toggleBodyAim(onPart, [gun], target);
    expect(playerVehicle(body).weaponOrders[gun.part.id]).toEqual({ targetId: target.id, aim: "body" });
    expect(toggleBodyAim(body, [gun], target).vehicles[0].weaponOrders).toEqual({});
  });
});

describe("vehicle marks", () => {
  it("shows each aimed weapon on its target with slot, look and status", () => {
    const { world, target, gun } = createDuel();
    expect(marksEn(world, target.id)).toEqual({
      weapons: [{ slot: 1, defId: gun.part.defId, status: "ready", ready: true }],
      radio: false,
      job: null,
      out: false,
      gaveUp: false,
    });
  });

  it("leaves no player mark without a weapon aimed at it", () => {
    const { world } = createDuel();
    expect(vehicleMarks(world, null).has(world.player.vehicleId)).toBe(false);
  });

  it("shows nothing for a vehicle without orders", () => {
    const { world, target } = createDuel();
    world.vehicles[0].weaponOrders = {};
    expect(vehicleMarks(world, null).has(target.id)).toBe(false);
  });

  it("shows the job of a seen NPC with its progress", () => {
    const { world, target } = createDuel();
    target.brain = npcBrain("scavenger", target.pos, ["scavenger"]);
    target.job = { kind: "search", stockId: "wreck-1", turnsLeft: 3, total: 4 };
    expect(jobEn(world, target.id)).toEqual({ label: "Search", work: { turnsLeft: 3, total: 4 } });
  });

  it("shows the own job as a label with no turn count and its work for the meter", () => {
    const { world, me } = createDuel();
    me.job = { kind: "search", stockId: "wreck-1", turnsLeft: 4, total: 8 };
    expect(jobEn(world, me.id)).toEqual({ label: "Search", work: { turnsLeft: 4, total: 8 } });
  });

  it("shows the patch a seen NPC does with its progress", () => {
    const { world, me, target } = createDuel();
    target.brain = npcBrain("scavenger", target.pos, ["scavenger"]);
    target.pos = { x: me.pos.x + 1, y: me.pos.y };
    target.speed = 0;
    me.speed = 0;
    addState(world, "patch", target.id, me.id, { kind: "patch", deal: "free", parts: 1, partIds: [], price: 0, work: 4, workLeft: 3 });
    expect(jobEn(world, target.id)).toEqual({ label: 'Patch Your truck', work: { turnsLeft: 3, total: 4 } });
  });

  it("shows the patch a seen NPC gets with its patcher", () => {
    const { world, me, target } = createDuel();
    target.brain = npcBrain("scavenger", target.pos, ["scavenger"]);
    target.pos = { x: me.pos.x + 1, y: me.pos.y };
    target.speed = 0;
    me.speed = 0;
    addState(world, "patch", me.id, target.id, { kind: "patch", deal: "free", parts: 1, partIds: [], price: 0, work: 4, workLeft: 1 });
    expect(jobEn(world, target.id)).toEqual({ label: 'Patched by Your truck', work: { turnsLeft: 1, total: 4 } });
  });

  it("marks a seen knocked-out NPC and offers no radio key on it", () => {
    const { world, target } = createDuel();
    target.brain = npcBrain("scavenger", target.pos, ["scavenger"]);
    target.defeat = { phase: "out", turns: 0, unseen: 0, foes: [], gaveUp: true };
    expect(vehicleMarks(world, target.id).get(target.id)).toMatchObject({ out: true, gaveUp: true, radio: false });
    target.defeat.gaveUp = false;
    expect(vehicleMarks(world, target.id).get(target.id)).toMatchObject({ out: true, gaveUp: false });
    target.defeat.phase = "retreat";
    expect(vehicleMarks(world, target.id).get(target.id)).toMatchObject({ out: false, radio: true });
  });

  it("hides the job of an NPC out of sight", () => {
    const { world, target } = createDuel();
    world.vehicles[0].weaponOrders = {};
    target.brain = npcBrain("scavenger", target.pos, ["scavenger"]);
    target.job = { kind: "search", stockId: "wreck-1", turnsLeft: 3, total: 4 };
    target.pos = { x: 58, y: 58 };
    expect(vehicleMarks(world, null).has(target.id)).toBe(false);
  });
});

describe("aiming at parts", () => {
  function wheelOf(target: Vehicle) {
    const wheel = mountedParts(target).find((p) => p.defId === "wheel");
    if (!wheel) throw new Error("Target has no wheel");
    return wheel;
  }

  it("aims the given guns at a part and marks it with the gun number", () => {
    const { world, target, gun } = createDuel();
    const wheel = wheelOf(target);
    const next = aimAtPart(world, [gun], target, wheel.id);
    expect(playerVehicle(next).weaponOrders[gun.part.id]).toEqual({ targetId: target.id, aim: wheel.id });
    expect(aimMarks(next, target.id).get(wheel.id)).toEqual([1]);
  });

  it("stops the guns when they already aim at the part", () => {
    const { world, target, gun } = createDuel();
    const wheel = wheelOf(target);
    const again = aimAtPart(aimAtPart(world, [gun], target, wheel.id), [gun], target, wheel.id);
    expect(playerVehicle(again).weaponOrders[gun.part.id]).toBeUndefined();
    expect(aimMarks(again, target.id).size).toBe(0);
  });

  it("names the aimed part or a body shot", () => {
    const { target } = createDuel();
    expect(en(aimName(target, "body"))).toBe("body shot");
    expect(en(aimName(target, wheelOf(target).id))).toBe("Wheel");
  });

  it("rejects a part the target does not have", () => {
    const { world, target, gun } = createDuel();
    expect(() => aimAtPart(world, [gun], target, "nope")).toThrow();
  });
});

describe("hover hold", () => {
  afterEach(() => vi.useRealTimers());

  function setup() {
    vi.useFakeTimers();
    const seen: (string | null)[] = [];
    const hold = new HoverHold((id) => seen.push(id), 400);
    return { seen, hold };
  }

  it("passes a hover on a truck at once", () => {
    const { seen, hold } = setup();
    hold.move("v2", "v1");
    expect(seen).toEqual(["v2"]);
  });

  it("ends the hover after the delay when the pointer leaves the truck", () => {
    const { seen, hold } = setup();
    hold.move(null, "v1");
    vi.advanceTimersByTime(399);
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual([null]);
  });

  it("keeps the hover while the pointer is on the panel and ends it when the pointer leaves", () => {
    const { seen, hold } = setup();
    const panel = new EventTarget();
    hold.watch(panel);
    hold.move(null, "v1");
    panel.dispatchEvent(new Event("mouseenter"));
    vi.advanceTimersByTime(1000);
    expect(seen).toEqual([]);
    panel.dispatchEvent(new Event("mouseleave"));
    expect(seen).toEqual([null]);
  });

  it("does nothing when nothing was hovered", () => {
    const { seen, hold } = setup();
    hold.move(null, null);
    expect(seen).toEqual([null]);
  });
});

function make() {
  const calls = { n: 0 };
  const sight = { seen: true };
  const pass = (pin: InspectPin, id: string, inWorld = true) => {
    pin.note({ id } as Vehicle, inWorld);
    pin.settle();
  };
  return { calls, sight, pass, pin: new InspectPin(() => calls.n++, () => sight.seen) };
}

describe("InspectPin", () => {
  it("pins and switches, and a second click keeps the pin", () => {
    const { pin, calls } = make();
    pin.click("a");
    expect(pin.id).toBe("a");
    pin.click("b");
    expect(pin.id).toBe("b");
    pin.click("b");
    expect(pin.id).toBe("b");
    expect(calls.n).toBe(2);
  });

  it("clears, and tells only about real changes", () => {
    const { pin, calls, pass } = make();
    pin.clear();
    pass(pin, "a");
    expect(calls.n).toBe(0);
    pin.click("a");
    pass(pin, "a");
    expect(pin.id).toBe("a");
    pin.clear();
    expect(pin.id).toBeNull();
    expect(calls.n).toBe(2);
  });

  it("drops the pin when its truck is out of sight, gone from the world or not in the pass", () => {
    const { pin, sight, pass } = make();
    pin.click("a");
    sight.seen = false;
    pass(pin, "a");
    expect(pin.id).toBeNull();
    sight.seen = true;
    pin.click("a");
    pass(pin, "a", false);
    expect(pin.id).toBeNull();
    pin.click("a");
    pass(pin, "b");
    expect(pin.id).toBeNull();
  });

  it("rejects an empty id", () => {
    expect(() => make().pin.click("")).toThrow();
  });
});

describe("orderLock", () => {
  const reason = (w: World) => en(orderLock(w));

  it("says Knocked out and nothing else, whether or not a turn plays", () => {
    const { world } = createDuel();
    expect(reason(world)).toBeNull();
    world.player.state = "knockedOut";
    expect(reason(world)).toBe("Knocked out");
  });

  it("leaves towed and on the radio to lockReason", () => {
    const { world } = createDuel();
    world.player.call = { with: "x" } as never;
    expect(reason(world)).toBeNull();
    expect(en(lockReason(world))).not.toBeNull();
  });

});

describe("the utility row", () => {
  function build() {
    const world = { w: emptyWorld() };
    const me = world.w.vehicles[0];
    const sprout = makePart(world.w, "sprout", 0);
    const mortar = makePart(world.w, "smokeMortar", 0);
    for (const part of [sprout, mortar]) if (!mountPart(world.w, me, part)) throw new Error(`No room for ${part.defId}`);
    const host = {
      world: () => world.w,
      apply: vi.fn((next: World) => { world.w = next; }),
      selectedWeapons: () => [],
      selectWeapons: vi.fn(),
      announce: vi.fn((next: World) => { world.w = next; }),
      selectedUtility: vi.fn<() => string | null>(() => null),
      selectUtility: vi.fn(),
      pressTurn: vi.fn(),
      releaseTurn: vi.fn(),
      runKey: vi.fn(),
      searchStock: vi.fn(),
      autoTravel: () => false,
      travelSpeedIndex: vi.fn(() => 0),
      travelPlaySpeed: () => null,
      stepTravelSpeed: vi.fn(),
      getTurnPhase: vi.fn<() => "moving" | null>(() => null),
      menuOpen: () => false,
      whenTurnEnds: (action: () => void) => { action(); },
    } satisfies UiHost;
    return { world, host, row: new UtilityRow(host), sprout, mortar };
  }

  it("lists the active utilities in mount order, not the passive ones", () => {
    const { world, sprout, mortar } = build();
    const crane = makePart(world.w, "patcherCrane", 0);
    mountPart(world.w, world.w.vehicles[0], crane);
    expect(utilitySlots(world.w).map((p) => p.id)).toEqual([sprout.id, mortar.id]);
  });

  it("a self utility's press sets its use for this turn, and a second press clears it", () => {
    const { world, row, sprout } = build();
    row.selectUtility(0);
    expect(world.w.vehicles[0].utilityOrders).toEqual({ [sprout.id]: { kind: "self" } });
    expect(utilityEn(world.w, sprout, false)).toEqual({ state: "set", text: "fires this turn" });
    row.selectUtility(0);
    expect(world.w.vehicles[0].utilityOrders).toEqual({});
  });

  it("a point utility's press selects it and a second press drops the selection", () => {
    const { host, row, mortar } = build();
    row.selectUtility(1);
    expect(host.selectUtility).toHaveBeenLastCalledWith(mortar.id);
    host.selectedUtility.mockReturnValue(mortar.id);
    row.selectUtility(1);
    expect(host.selectUtility).toHaveBeenLastCalledWith(null);
  });

  it("a recharging utility shows its turns left out of its reload and its press does nothing", () => {
    const { world, host, row, sprout, mortar } = build();
    sprout.charge = { reload: 3 };
    mortar.charge = { reload: 1 };
    row.selectUtility(0);
    row.selectUtility(1);
    expect(host.apply).not.toHaveBeenCalled();
    expect(host.selectUtility).toHaveBeenLastCalledWith(null);
    expect(utilityEn(world.w, sprout, false)).toEqual({ state: "recharging", text: "recharging 3 turns", reload: { left: 3, total: wornReload(sprout) } });
    expect(utilityEn(world.w, mortar, true)).toEqual({ state: "recharging", text: "recharging 1 turn", reload: { left: 1, total: wornReload(mortar) } });
  });

  it("shows a broken utility, a ready one, a selected point utility, a set point and an armed claymore", () => {
    const { world, sprout, mortar } = build();
    sprout.hp = 0;
    expect(utilityEn(world.w, sprout, false)).toEqual({ state: "blocked", text: "broken" });
    expect(utilityEn(world.w, mortar, false)).toEqual({ state: "ready", text: "ready" });
    expect(utilityEn(world.w, mortar, true)).toEqual({ state: "aiming", text: "aiming" });
    world.w.vehicles[0].utilityOrders[mortar.id] = { kind: "point", pos: { x: 40, y: 30 } };
    expect(utilityEn(world.w, mortar, true)).toEqual({ state: "set", text: "fires this turn" });
    const claymore = makePart(world.w, "claymoreRam", 0);
    claymore.charge = { reload: 0, armed: true };
    expect(utilityEn(world.w, claymore, false)).toEqual({ state: "armed", text: "armed" });
  });

  describe("an armed claymore ram", () => {
    function armed() {
      const built = build();
      const claymore = makePart(built.world.w, "claymoreRam", 0);
      if (!mountPart(built.world.w, built.world.w.vehicles[0], claymore)) throw new Error("No room for the claymore ram");
      claymore.charge = { reload: 0, armed: true };
      const slot = utilitySlots(built.world.w).indexOf(claymore);
      return { ...built, claymore, slot };
    }

    it("takes a disarm order on a press, shows it as set, and drops it on a second press", () => {
      const { world, host, row, claymore, slot } = armed();
      row.selectUtility(slot);
      expect(world.w.vehicles[0].utilityOrders[claymore.id]).toEqual({ kind: "disarm" });
      expect(utilityEn(world.w, claymore, false)).toEqual({ state: "set", text: "disarms this turn" });
      row.selectUtility(slot);
      expect(world.w.vehicles[0].utilityOrders[claymore.id]).toBeUndefined();
      expect(utilityEn(world.w, claymore, false)).toEqual({ state: "armed", text: "armed" });
      expect(host.apply).toHaveBeenCalledTimes(2);
    });

    it("takes no order on a shut down truck", () => {
      const { world, host, row, slot } = armed();
      world.w.vehicles[0].shutDown = { from: world.w.turn, until: world.w.turn + 2 };
      row.selectUtility(slot);
      expect(host.apply).not.toHaveBeenCalled();
    });
  });

  it("blocks an oil spiller with too little fuel to spill", () => {
    const w = emptyWorld();
    const spiller = makePart(w, "oilSpiller", 0);
    if (!mountPart(w, w.vehicles[0], spiller)) throw new Error("No room for the oil spiller");
    w.player.fuel = 0;
    expect(utilityEn(w, spiller, false)).toEqual({ state: "blocked", text: "no fuel" });
  });

  it("throws for a passive utility, which has no slot", () => {
    const { world } = build();
    const crane = makePart(world.w, "patcherCrane", 0);
    expect(() => utilityStatus(world.w, crane, false)).toThrow(/passive/);
  });

  it("ignores presses on an empty slot, and holds a press while a turn plays until it ends", () => {
    const { host, row } = build();
    row.selectUtility(3);
    expect(host.apply).not.toHaveBeenCalled();
    const waiting: (() => void)[] = [];
    host.whenTurnEnds = (action: () => void) => { waiting.push(action); };
    row.selectUtility(0);
    expect(host.apply).not.toHaveBeenCalled();
    expect(host.selectUtility).not.toHaveBeenCalled();
    waiting.forEach((action) => action());
    expect(host.apply.mock.calls.length + host.selectUtility.mock.calls.length).toBe(1);
  });
});

function harpoonDuel(gap = 5) {
  const w = emptyWorld();
  const me = w.vehicles[0];
  const harpoon = makePart(w, "harpoon", 0);
  me.items.push({ id: "i-harpoon", kind: "part", part: harpoon, x: 1, y: 9, rot: 1 });
  const target = addVehicle(w, "independent", "hauler", ["stockEngine"], { x: me.pos.x - gap, y: me.pos.y }, Math.PI / 2);
  refreshVision(w);
  return { w, me, harpoon, target };
}

describe("slot keys", () => {
  it("gives the utility slots the numbers after the last gun, so a gun and a utility never share a key", () => {
    const keysWith = (parts: string[]) => {
      const w = emptyWorld();
      const me = w.vehicles[0];
      for (const defId of parts) if (!mountPart(w, me, makePart(w, defId, 0))) throw new Error(`No room for ${defId}`);
      return { guns: vehicleStats(w, me).weapons.length, keys: utilitySlots(w).map((_, i) => utilityKey(w, i)) };
    };
    const plain = keysWith(["sprout"]);
    const hooked = keysWith(["harpoon", "sprout"]);

    expect(plain.keys).toEqual([plain.guns + 1]);
    expect(hooked.guns).toBe(plain.guns + 1);
    expect(hooked.keys).toEqual([hooked.guns + 1]);
  });

  it("leaves a utility slot past key 9 without a key", () => {
    const w = emptyWorld();
    const me = w.vehicles[0];
    if (!mountPart(w, me, makePart(w, "sprout", 0))) throw new Error("No room for the sprout");
    const guns = vehicleStats(w, me).weapons.length;
    expect(utilityKey(w, 9 - guns - 1)).toBe(9);
    expect(utilityKey(w, 9 - guns)).toBeNull();
  });
});

describe("the harpoon on the weapon panel", () => {
  const harpoonGun = (s: ReturnType<typeof harpoonDuel>) => {
    const mw = vehicleStats(s.w, s.me).weapons.find((m) => m.part.id === s.harpoon.id);
    if (!mw) throw new Error("The harpoon is not a mounted gun");
    return mw;
  };

  it("is a gun slot and not a utility slot", () => {
    const s = harpoonDuel();
    expect(en(partName(s.harpoon.defId))).toBe("Harpoon");
    expect(utilitySlots(s.w)).not.toContain(s.harpoon);
  });

  it("reads ready only with its round loaded, and reloading with the turns left after a shot", () => {
    const s = harpoonDuel();
    s.me.weaponOrders[s.harpoon.id] = { targetId: s.target.id, aim: "body" };
    expect(readout(s.w, harpoonGun(s))).toMatchObject({ status: "ready", canFire: true });
    s.harpoon.gun = { cooldown: 0, ammo: 0, reloadWork: 1 };
    expect(readout(s.w, harpoonGun(s))).toMatchObject({ status: "reloading 4 turns", canFire: false, chance: null });
  });

  it("marks its target like a gun, with why it waits", () => {
    const far = harpoonDuel(9);
    far.me.weaponOrders[far.harpoon.id] = { targetId: far.target.id, aim: "body" };
    const slot = vehicleStats(far.w, far.me).weapons.findIndex((m) => m.part.id === far.harpoon.id) + 1;
    expect(marksEn(far.w, far.target.id)?.weapons).toEqual([{ slot, defId: far.harpoon.defId, status: "out of range", ready: false }]);
  });
});

function hostOf(world: World, edit: Partial<UiHost> = {}): UiHost {
  return {
    world: () => world, apply: vi.fn(), announce: vi.fn(), selectedWeapons: () => [], selectWeapons: vi.fn(), selectedUtility: () => null, selectUtility: vi.fn(),
    searchStock: vi.fn(), pressTurn: vi.fn(), releaseTurn: vi.fn(), runKey: vi.fn(), autoTravel: () => false, travelSpeedIndex: () => 0, travelPlaySpeed: () => null,
    stepTravelSpeed: vi.fn(), getTurnPhase: () => null, menuOpen: () => false, whenTurnEnds: (action) => action(), ...edit,
  };
}

describe("the weapons panel view", () => {
  it("keeps All and Auto fire on while a turn plays", () => {
    const { world } = createDuel();
    const view = weaponsViewOf(hostOf(world, { getTurnPhase: () => "moving" }));
    expect(view.all.reason).toBeNull();
    expect(view.auto.reason).toBeNull();
  });

  it("names a knocked out driver, also while a turn plays", () => {
    const { world } = createDuel();
    world.player.state = "knockedOut";
    for (const phase of [null, "moving"] as const) {
      const view = weaponsViewOf(hostOf(world, { getTurnPhase: () => phase }));
      expect(en(view.auto.reason)).toBe("Knocked out");
    }
  });

  it("lights All only when every gun is selected, and marks the selected guns", () => {
    const { world, gun } = createDuel();
    expect(weaponsViewOf(hostOf(world)).all.on).toBe(false);
    const picked = weaponsViewOf(hostOf(world, { selectedWeapons: () => [gun.part.id] }));
    expect(picked.all.on).toBe(true);
    expect(picked.guns.map((cell) => cell.picked)).toEqual([true]);
  });

  it("gives Reload and Hold the reason No gun selected with nothing selected", () => {
    const { world } = createDuel();
    const view = weaponsViewOf(hostOf(world));
    expect(en(view.reload.reason!)).toBe("No gun selected");
    expect(en(view.hold.reason!)).toBe("No gun selected");
  });

  it("shows one cell per round for a gun and none for a line gun", () => {
    const s = harpoonDuel();
    const guns = weaponsViewOf(hostOf(s.w)).guns;
    const at = vehicleStats(s.w, s.me).weapons.findIndex((m) => m.part.id === s.harpoon.id);
    expect(guns[at].cells).toBeNull();
    expect(guns.filter((_, i) => i !== at).every((cell) => Array.isArray(cell.cells))).toBe(true);
  });

  it("shows a utility with its short label, state and key", () => {
    const w = emptyWorld();
    if (!mountPart(w, w.vehicles[0], makePart(w, "sprout", 0))) throw new Error("No room for the sprout");
    const [slot] = weaponsViewOf(hostOf(w)).utilities;
    expect(en(slot.label)).toBe("SPRT");
    expect(slot.state).toBe("ready");
    expect(slot.key).toBe(String(utilityKey(w, 0)));
  });
});

describe("the radio deck view", () => {
  it("offers End turn when idle and names the phase while a turn plays", () => {
    const { world } = createDuel();
    expect(deckViewOf(hostOf(world)).turn).toMatchObject({ disabled: false, auto: false });
    const playing = deckViewOf(hostOf(world, { getTurnPhase: () => "moving" })).turn;
    expect(playing.disabled).toBe(false);
    expect(en(playing.label)).toMatch(/in progress/);
  });

  it("stops automatic travel from the same key", () => {
    const { world } = createDuel();
    expect(deckViewOf(hostOf(world, { autoTravel: () => true })).turn).toMatchObject({ disabled: false, auto: true });
  });

  it("shows the knob at the picked travel speed", () => {
    const { world } = createDuel();
    expect(deckViewOf(hostOf(world, { travelSpeedIndex: () => 2 })).speed.index).toBe(2);
  });
});

describe("weapon orders", () => {
  it("does not select or toggle auto fire while knocked out", () => {
    const { world } = createDuel();
    world.player.state = "knockedOut";
    const host = hostOf(world);
    const orders = new WeaponOrders(host);
    orders.selectWeapons(["x"]);
    orders.toggleAuto();
    orders.pressKey(1);
    expect(host.selectWeapons).not.toHaveBeenCalled();
    expect(host.apply).not.toHaveBeenCalled();
  });

  it("picks a gun alone by key and clears it on a repeat", () => {
    const { world, gun } = createDuel();
    const picked = { ids: [] as readonly string[] };
    const host = hostOf(world, { selectedWeapons: () => picked.ids, selectWeapons: vi.fn((ids: readonly string[]) => { picked.ids = ids; }) });
    const orders = new WeaponOrders(host);
    orders.pressKey(1);
    expect(picked.ids).toEqual([gun.part.id]);
    orders.pressKey(1);
    expect(picked.ids).toEqual([]);
  });

  it("selects every gun with All and clears them on a second press", () => {
    const { world, gun } = createDuel();
    const picked = { ids: [] as readonly string[] };
    const host = hostOf(world, { selectedWeapons: () => picked.ids, selectWeapons: vi.fn((ids: readonly string[]) => { picked.ids = ids; }) });
    const orders = new WeaponOrders(host);
    orders.toggleAll();
    expect(picked.ids).toEqual([gun.part.id]);
    orders.toggleAll();
    expect(picked.ids).toEqual([]);
  });

  it("steps the travel speed to the knob position picked", () => {
    const { world } = createDuel();
    const host = hostOf(world, { travelSpeedIndex: () => 1 });
    new WeaponOrders(host).goToSpeed(3);
    expect(host.stepTravelSpeed).toHaveBeenCalledTimes(2);
    expect(host.stepTravelSpeed).toHaveBeenCalledWith(1);
  });
});
