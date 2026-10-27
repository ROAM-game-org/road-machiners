import { describe, expect, it } from "vitest";
import { sitePads } from "../sim/sites";
import { emptyWorld } from "../sim/testkit";
import { lateBy, siteOf, type Contract } from "../sim/market";
import type { CrimeCase, GameEvent } from "../sim/types";
import { refusalText } from "../text/names";
import { resolve } from "../text/resolve";
import type { Msg } from "../text/msg";
import { caseVictimName, clock, eventText, heldContractClock, heldContractDue } from "./format";

const en = (msg: Msg | null | undefined): string => resolve(msg!, "en");
const haul: Extract<Contract, { kind: "haul" }> = { id: "h", shop: "bowl", kind: "haul", good: "salt", units: 3, to: "nose", reward: 100, deadline: 500, window: 400, rush: false, tier: 1 };
const lateWorld = () => {
  const w = emptyWorld(sitePads(siteOf("bowl"))[0]);
  w.turn = 600;
  w.player.contracts = [haul];
  return w;
};
const contractEvent = (outcome: "overdue" | "late" | "expiring" | "failed"): GameEvent => ({ t: "contract", contract: haul, outcome });

describe("late haul words", () => {
  it("names the bounty time of a late haul in place of the deadline", () => {
    const w = lateWorld();
    expect(en(heldContractClock(w, haul))).toBe(`bounty ${en(clock(lateBy(haul) + 1).full)}`);
    expect(en(heldContractClock({ ...w, turn: 400 }, haul))).toBe(en(heldContractDue(haul)));
  });

  it("logs the overdue line with the crates' deadline and the shop", () => {
    const line = eventText(lateWorld(), contractEvent("overdue"))!;
    expect(en(line.text)).toMatch(/^Haul late, it pays nothing now: .+\. Hand the crates in by .+, or Bowl posts a bounty\.$/);
    expect(line.cls).toBe("bad");
  });

  it("logs a late hand-in as unpaid", () => {
    expect(en(eventText(lateWorld(), contractEvent("late"))!.text)).toMatch(/^Delivered late, no pay: /);
  });

  it("gives the late limit in the warning of a late haul and the deadline otherwise", () => {
    const late = en(eventText(lateWorld(), contractEvent("expiring"))!.text);
    const early = en(eventText({ ...lateWorld(), turn: 400 }, contractEvent("expiring"))!.text);
    expect(late).toContain(en(clock(lateBy(haul) + 1).full));
    expect(early).toContain(en(clock(haul.deadline + 1).full));
  });

  it("says why an owed crate will not sell", () => {
    expect(en(refusalText(emptyWorld(), { id: "cargoOwed" }))).toBe("Owed on a haul");
  });
});

describe("embezzlement words", () => {
  const embezzled = { id: "c", offense: "embezzled", victim: "granary", site: "granary", target: "p", issuer: { kind: "shop", shop: "granary" }, turn: 1 } as unknown as CrimeCase;

  it("names a shop as the victim of the case", () => {
    expect(en(caseVictimName(emptyWorld(), embezzled))).toBe("The Granary");
  });

  it("keeps the filing silent until a Marshall demands it", () => {
    const w = emptyWorld();
    const e: GameEvent = { t: "bountyFiled", case: "c", target: w.player.vehicleId, reporter: "granary", offense: "embezzled", victim: "granary", site: "granary", owed: 26, kept: { good: "salt", crates: 3 } };
    expect(eventText(w, e)).toBeNull();
  });
});
