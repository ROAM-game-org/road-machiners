import { describe, expect, it } from "vitest";
import { partDef } from "../data/parts";
import { makePart } from "../sim/factory";
import { mountedParts } from "../sim/grid";
import { mountPart } from "../sim/inventory";
import { addVehicle, emptyWorld } from "../sim/testkit";
import type { GameEvent, PartInstance, Vehicle, World } from "../sim/types";
import { resolve } from "../text/resolve";
import { eventEntry, eventLevel } from "./log-levels";

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
  it("keeps routine call lines in Verbose and every other role the player is party to in Brief", () => {
    const { w, me, raider } = fight();
    const call = (role: "routine" | "hail" | "settles" | "shout", speaker: string, to: string): GameEvent => ({ t: "say", speaker, to, line: "hangUp", vars: {}, role });
    expect(eventEntry(w, call("routine", raider.id, me.id))).toMatchObject({ level: "info", reach: "verbose" });
    expect(eventEntry(w, call("routine", me.id, raider.id))).toMatchObject({ level: "info", reach: "verbose" });
    for (const role of ["hail", "settles", "shout"] as const) expect(eventEntry(w, call(role, raider.id, me.id))).toMatchObject({ level: "notable", reach: "both" });
    const other = addVehicle(w, "independent", "scout", [], { x: 50, y: 50 });
    expect(eventLevel(w, call("settles", raider.id, other.id))).toBe("info");
  });

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
