import { describe, expect, it } from "vitest";
import { partDef } from "../data/parts";
import { makePart } from "../sim/factory";
import { mountedParts } from "../sim/grid";
import { mountPart } from "../sim/inventory";
import { askTopic, callVehicle, chooseOption, currentOptions, hangUp } from "../sim/dialogue";
import { chooseText } from "../sim/dialogue-testkit";
import { playerVehicle } from "../sim/damage";
import { addVehicle, emptyWorld, forceOption, npcBrain, startCombat } from "../sim/testkit";
import { refreshVision } from "../sim/vision";
import { lineKey } from "../text/names";
import { entryText } from "../text/resolve";
import type { GameEvent, PartInstance, Vehicle, World } from "../sim/types";
import { resolve } from "../text/resolve";
import { eventEntry, eventLevel, type LogEntry } from "./log-levels";

function fight() {
  const w = emptyWorld();
  const me = w.vehicles[0];
  const plate = makePart(w, "steelPlate", 0);
  if (!mountPart(w, me, plate)) throw new Error("No deck room for the plate");
  const raider = addVehicle(w, "scrapjaw", "buggy", ["mg"], { x: 40, y: 40 });
  const cab = coreOf(me, "cab");
  const engine = mountedParts(me).find((p) => partDef(p.defId).kind === "engine")!;
  return { w, me, raider, plate, cab, engine };
}

function coreOf(v: Vehicle, role: string): PartInstance {
  return mountedParts(v).find((p) => (partDef(p.defId) as { role?: string }).role === role)!;
}

function shotAt(world: World, shooter: Vehicle, target: Vehicle, hits: { part: string; damage: number }[]): GameEvent {
  return {
    t: "shot", shooter: shooter.id, weapon: mountedParts(shooter, "weapon")[0].id, target: target.id, aim: "body", chance: 0.5, damageChance: 0.5, side: "front",
    rounds: [{ hit: true, crit: false, offset: 0, struck: target.id, hits, blast: [], burst: null }],
  };
}

const en = (entries: { text: Parameters<typeof resolve>[0] }[]) => entries.map((e) => resolve(e.text, "en"));

describe("log levels", () => {
  it("keeps shot rolls in Verbose and a knockout in both views", () => {
    const { w, me, raider, cab } = fight();
    const shot = eventEntry(w, shotAt(w, raider, me, [{ part: cab.id, damage: 5 }]));
    expect(shot).toMatchObject({ level: "info", reach: "verbose" });
    expect(eventLevel(w, { t: "knockout", crash: false })).toBe("critical");
  });

  it("calls out a part disabled on the player's truck but not on someone else's", () => {
    const { w, me, raider, cab } = fight();
    expect(eventLevel(w, { t: "partDisabled", vehicle: me.id, part: cab.id })).toBe("attention");
    expect(eventLevel(w, { t: "partDisabled", vehicle: raider.id, part: coreOf(raider, "cab").id })).toBe("info");
  });

  it("levels supply notes by what they ask of the player", () => {
    const { w } = fight();
    expect(eventLevel(w, { t: "supply", what: "supplies", note: { id: "outOfSupplies" } } as GameEvent)).toBe("attention");
    expect(eventLevel(w, { t: "supply", what: "supplies", note: { id: "filledSupplies" } } as GameEvent)).toBe("info");
    expect(eventLevel(w, { t: "info", note: { id: "fuelLow" } } as GameEvent)).toBe("attention");
  });
});

function entries(w: World): LogEntry[] {
  return w.events.map((e) => eventEntry(w, e)).filter((e): e is LogEntry => e !== null);
}

function brief(w: World): string[] {
  return en(entries(w).filter((e) => e.reach === "both"));
}

function trader() {
  const { w, me, raider } = fight();
  raider.brain = npcBrain("buggy", raider.pos, ["raider"]);
  const helper = addVehicle(w, "independent", "scout", ["mg", "stockEngine"], { x: me.pos.x + 4, y: me.pos.y });
  helper.brain = npcBrain("trader", helper.pos, ["trader"]);
  startCombat(w, raider, playerVehicle(w));
  refreshVision(w);
  return { w, me, raider, helper };
}

describe("radio calls in the log", () => {
  it("a help call the trader turns down leaves nothing in Brief and every line in Verbose", () => {
    forceOption("helpCalled", "refuse");
    const { w, helper } = trader();
    const steps: World[] = [callVehicle(w, helper.id)];
    steps.push(askTopic(steps.at(-1)!, "askHelp"));
    steps.push(chooseOption(steps.at(-1)!, 0));
    while (steps.at(-1)!.player.call?.topic) steps.push(chooseOption(steps.at(-1)!, 0));
    steps.push(hangUp(steps.at(-1)!));
    const said = steps.flatMap((s) => s.events.filter((e) => e.t === "say"));
    expect(said.length).toBeGreaterThanOrEqual(5);
    expect(steps.flatMap(brief)).toEqual([]);
    expect(steps.flatMap((s) => entries(s).filter((e) => e.reach === "verbose"))).toHaveLength(said.length);
  });

  it("a paid truce leaves one result line in Brief and the talk in Verbose", () => {
    const { w, raider } = trader();
    raider.resources = { fuel: 10, supplies: 10, money: 0, health: 100 };
    w.player.perks = ["paidTruce"];
    w.player.money = 100000;
    let next = callVehicle(w, raider.id);
    next = chooseText(next, entryText("en", lineKey(currentOptions(next).find((o) => o.topic === "buyTruce")!.line)));
    next = chooseText(next, "Deal. Sending it.");
    expect(brief(next)).toHaveLength(1);
    expect(brief(next)[0]).toMatch(/^Truce with .+ for .+/);
  });
});

describe("deal results", () => {
  it("each result names the other truck once in Brief", () => {
    const { w, me, raider } = fight();
    const levels = (e: GameEvent) => eventEntry(w, e);
    expect(levels({ t: "truce", a: me.id, b: raider.id, fee: 0 })).toMatchObject({ level: "notable", reach: "both" });
    expect(levels({ t: "standDown", loser: me.id, winner: raider.id })).toMatchObject({ level: "notable" });
    expect(levels({ t: "standDown", loser: raider.id, winner: me.id })).toMatchObject({ level: "notable" });
    expect(levels({ t: "holdUp", robber: raider.id, victim: me.id, paid: "cargo", value: 40 })).toMatchObject({ level: "notable" });
    expect(levels({ t: "money", amount: -20, reason: { kind: "talkFee", vehicle: raider.id } })).toMatchObject({ level: "notable" });
  });

  it("keeps deals and fights between other trucks out of Brief", () => {
    const { w, raider } = fight();
    const other = addVehicle(w, "independent", "scout", [], { x: 42, y: 40 });
    refreshVision(w);
    expect(eventLevel(w, { t: "truce", a: raider.id, b: other.id, fee: 0 })).toBe("info");
    expect(eventLevel(w, { t: "npcKnockout", vehicle: other.id, by: raider.id })).toBe("info");
    expect(eventLevel(w, { t: "destroyed", vehicle: other.id, by: raider.id })).toBe("info");
    expect(eventLevel(w, { t: "cargoSpilled", vehicle: other.id, part: "x", pile: null, units: 1 })).toBe("info");
  });

  it("gives a contract reward one Brief line", () => {
    const { w, me, raider } = fight();
    expect(eventLevel(w, { t: "money", amount: 50, reason: { kind: "contract" } })).toBe("info");
    expect(eventLevel(w, { t: "npcKnockout", vehicle: raider.id, by: me.id })).toBe("notable");
  });

  it("keeps the steps of a deal in Verbose", () => {
    const { w, me, raider } = fight();
    expect(eventLevel(w, { t: "lookedOver", by: raider.id, target: me.id })).toBe("info");
    expect(eventLevel(w, { t: "searched", stock: "s" })).toBe("info");
    expect(eventLevel(w, { t: "patch", patcher: raider.id, client: me.id, outcome: "broken" })).toBe("info");
    expect(eventLevel(w, { t: "aid", giver: raider.id, receiver: me.id, fuel: 0, supplies: 0, paid: 0 })).toBe("info");
  });
});
