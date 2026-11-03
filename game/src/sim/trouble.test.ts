import { describe, expect, it } from "vitest";
import { noteTrouble, troubleOf } from "./trouble";
import { emptyWorld } from "./testkit";
import { fuelCap } from "./stats";
import { playerVehicle } from "./damage";
import { RULES } from "../data/rules";

describe("player trouble notes", () => {
  it("notes low fuel once, when fuel crosses the line", () => {
    const world = emptyWorld({ x: 50, y: 50 });
    world.player.fuel = fuelCap(playerVehicle(world));
    const before = troubleOf(world);
    world.player.fuel = fuelCap(playerVehicle(world)) * RULES.lowFuelThreshold * 0.5;
    noteTrouble(world, before);
    expect(world.events).toEqual([{ t: "info", note: { id: "fuelLow" } }]);
    world.events = [];
    noteTrouble(world, troubleOf(world));
    expect(world.events).toEqual([]);
  });

  it("notes stranded, not low fuel, when the tank runs dry", () => {
    const world = emptyWorld({ x: 50, y: 50 });
    world.player.fuel = fuelCap(playerVehicle(world));
    const before = troubleOf(world);
    world.player.fuel = 0;
    noteTrouble(world, before);
    expect(world.events).toEqual([{ t: "info", note: { id: "stranded" } }]);
  });
});
