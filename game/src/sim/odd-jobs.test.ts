import { describe, expect, it } from "vitest";
import { EFFORT } from "../data/market";
import { ODD_JOBS } from "../data/odd-jobs";
import { RULES } from "../data/rules";
import { ECONOMY } from "../data/goods";
import { REGION } from "../data/region";
import { autoRuns } from "./world";
import { TIME } from "../data/time";
import { advanceJobs } from "./jobs";
import { oddJobsBlock, oddJobsPay, payOddJobs, startOddJobs } from "./odd-jobs";
import { sitePads } from "./sites";
import { addVehicle, emptyWorld, startCombat } from "./testkit";
import type { GameEvent, World } from "./types";

const bowl = REGION.towns.find((t) => t.id === "bowl")!;

function brokeAtBowl(money = 1000): World {
  const w = emptyWorld(sitePads(bowl)[0]);
  w.vehicles[0].speed = 0;
  w.player.money = money;
  return w;
}

function workTurns(w: World, turns: number): void {
  for (let i = 0; i < turns; i++) advanceJobs(w);
}

function moneyEvents(w: World): GameEvent[] {
  return w.events.filter((e) => e.t === "money");
}

describe("who is hired", () => {
  it("hires a driver under a day of the tier 1 wage", () => {
    expect(oddJobsBlock(brokeAtBowl(10 * 100))).toBeNull();
    expect(oddJobsBlock(brokeAtBowl(-4000))).toBeNull();
  });

  it("turns away a driver at the limit", () => {
    expect(oddJobsBlock(brokeAtBowl(ODD_JOBS.hireBelow - 1))).toBeNull();
    expect(oddJobsBlock(brokeAtBowl(ODD_JOBS.hireBelow))).toEqual({ id: "notHiring" });
    expect(() => startOddJobs(brokeAtBowl(ODD_JOBS.hireBelow))).toThrow("Refused: notHiring");
  });

  it("needs a shop site, no combat, no other job and a stopped truck", () => {
    const away = emptyWorld({ x: 30, y: 30 });
    away.vehicles[0].speed = 0;
    expect(oddJobsBlock(away)).toEqual({ id: "stopFirst" });

    const fight = brokeAtBowl();
    const raider = addVehicle(fight, "scrapjaw", "buggy", ["mg"], { x: 35, y: 30 });
    startCombat(fight, raider, fight.vehicles[0]);
    expect(oddJobsBlock(fight)).toEqual({ id: "inCombat" });

    const busy = startOddJobs(brokeAtBowl());
    expect(oddJobsBlock(busy)).toEqual({ id: "busy", job: "oddJobs" });

    const moving = brokeAtBowl();
    moving.vehicles[0].speed = 20;
    expect(oddJobsBlock(moving)).toEqual({ id: "stopFirst" });
  });
});

describe("the pay", () => {
  it("nets 20 M a day after a day of food, and below the tier 1 wage", () => {
    const food = TIME.turnsPerDay * RULES.suppliesPerTurn * ECONOMY.supplyPrice.supplies;
    expect(Math.abs(oddJobsPay(TIME.turnsPerDay) - food - ODD_JOBS.netPerDay)).toBeLessThanOrEqual(2);
    expect(ODD_JOBS.payPerTurn).toBeLessThan(EFFORT.wage[1]);
  });

  it("rejects a negative or fractional turn count", () => {
    expect(() => oddJobsPay(-1)).toThrow();
    expect(() => oddJobsPay(1.5)).toThrow();
  });
});

describe("a shift", () => {
  it("pays the full shift once, in one money event", () => {
    const w = startOddJobs(brokeAtBowl());
    w.events = [];
    workTurns(w, ODD_JOBS.shiftTurns);
    expect(w.vehicles[0].job).toBeNull();
    expect(w.player.money).toBe(1000 + oddJobsPay(ODD_JOBS.shiftTurns));
    expect(moneyEvents(w)).toEqual([{ t: "money", amount: oddJobsPay(ODD_JOBS.shiftTurns), reason: { kind: "oddJobs" } }]);
    expect(w.events).toContainEqual(expect.objectContaining({ t: "job", outcome: "done" }));
  });

  it("pays off debt first because money is one number", () => {
    const w = startOddJobs(brokeAtBowl(-4000));
    workTurns(w, ODD_JOBS.shiftTurns);
    expect(w.player.money).toBe(-4000 + oddJobsPay(ODD_JOBS.shiftTurns));
  });

  it("pays the worked turns when the truck drives off", () => {
    const w = startOddJobs(brokeAtBowl());
    workTurns(w, 40);
    w.events = [];
    w.vehicles[0].speed = 30;
    advanceJobs(w);
    expect(w.vehicles[0].job).toBeNull();
    expect(w.player.money).toBe(1000 + oddJobsPay(40));
    expect(moneyEvents(w)).toHaveLength(1);
    expect(w.events).toContainEqual(expect.objectContaining({ t: "job", outcome: "cancelled" }));
  });

  it("pays the worked turns when a fight starts", () => {
    const w = startOddJobs(brokeAtBowl());
    workTurns(w, 10);
    const raider = addVehicle(w, "scrapjaw", "buggy", ["mg"], { x: 35, y: 30 });
    startCombat(w, raider, w.vehicles[0]);
    advanceJobs(w);
    expect(w.vehicles[0].job).toBeNull();
    expect(w.player.money).toBe(1000 + oddJobsPay(10));
  });

  it("pays the worked turns when the truck leaves the pad", () => {
    const w = startOddJobs(brokeAtBowl());
    workTurns(w, 25);
    w.vehicles[0].pos = { x: 30, y: 30 };
    advanceJobs(w);
    expect(w.vehicles[0].job).toBeNull();
    expect(w.player.money).toBe(1000 + oddJobsPay(25));
  });

  it("pays nothing and raises no money event for a shift cancelled at once", () => {
    const w = startOddJobs(brokeAtBowl());
    w.events = [];
    w.vehicles[0].speed = 30;
    advanceJobs(w);
    expect(w.player.money).toBe(1000);
    expect(moneyEvents(w)).toEqual([]);
  });

  it("throws for a job on a truck that is not the player's", () => {
    const w = brokeAtBowl();
    const npc = addVehicle(w, "scrapjaw", "buggy", ["mg"], { x: 40, y: 40 });
    npc.speed = 0;
    npc.job = { kind: "oddJobs", turnsLeft: 10, total: 10 };
    expect(() => advanceJobs(w)).toThrow();
    expect(() => payOddJobs(w, npc, { kind: "oddJobs", turnsLeft: 0, total: 10 })).toThrow();
  });
});

describe("turns that run on their own", () => {
  it("run while the shift runs and stop with it", () => {
    const w = startOddJobs(brokeAtBowl());
    expect(autoRuns(w)).toBe(true);
    workTurns(w, ODD_JOBS.shiftTurns);
    expect(autoRuns(w)).toBe(false);
  });

  it("stop while a call waits for the player", () => {
    const w = startOddJobs(brokeAtBowl());
    w.player.call = { with: "x" } as never;
    expect(autoRuns(w)).toBe(false);
  });
});
