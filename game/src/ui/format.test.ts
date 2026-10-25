import { describe, expect, it, vi } from "vitest";
import { MAP_GRID, REGION } from "../data/region";
import { CONDITION } from "../data/wear";
import type { Contract } from "../sim/market";
import type { ClaimContract } from "../sim/salvage";
import { partDef, PARTS } from "../data/parts";
import { addVehicle, emptyWorld, npcBrain } from "../sim/testkit";
import type { GameEvent, World, Job, PartInstance, ShotRound } from "../sim/types";
import { makePart } from "../sim/factory";
import { mountPart } from "../sim/inventory";
import { maxHp } from "../sim/wear";
import { workOf, addState } from "../sim/states";
import { startAid } from "../sim/aid";
import { gridColumnLetter, gridRowNumber, gridSquareText, isNotable, surveyClueLines, surveyClueText, surveyPlacesLeft, surveyProgress, surveyWayLine, surveyWayText } from "./format";
import { gridSquareOf } from "../sim/map-grid";
import { surveyClue, surveySites } from "../sim/survey";
import { TEST_MAP } from "../test/map";
import { contractDue, heldContractDue, workLabel, contractSummary, contractWindow, rescueWhere, eventText, jobLabel, roundLabel, vehicleName, wearLabel, conditionTier, conditionStatus, showsCondition, GOODS_COLUMNS, PROFIT_HEAD_TITLE, saleEstimate, estimateText, estimateTitle, lotTitle, standingNum, standingStep, formatNpcCargo, formatNpcLookOver } from "./format";
import { bakedTier } from "../sim/claim-clue";
import { claimClue, claimWrecks } from "../sim/claims";
import { START_KITS } from "../data/start";
import { defaultSetup } from "../sim/settings";
import { newWorld } from "../sim/world";
import { mountedParts } from "../sim/grid";
import { fuelLiters } from "./units";
import { resetSeeAll, toggleSeeAll } from "./see-all";
import { wreckVehicle } from "../sim/combat";
import { partName, siteName, vehicleTitle } from "../text/names";
import { t, type Msg } from "../text/msg";
import { resolve } from "../text/resolve";

function en(msg: Msg): string;
function en(msg: Msg | null | undefined): string | null;
function en(msg: Msg | null | undefined): string | null {
  return msg ? resolve(msg, "en") : null;
}

function logEn(world: World, e: GameEvent): { text: string; cls: string } | null {
  const line = eventText(world, e);
  return line ? { text: en(line.text), cls: line.cls } : null;
}

class TextNode {
  className = "";
  children: (TextNode | string)[] = [];
  append(...children: (TextNode | string)[]) { this.children.push(...children); }
  setAttribute() {}
  text(): string { return this.children.map((child) => typeof child === "string" ? child : child.text()).join(""); }
  all(cls: string): TextNode[] { return [...(this.className.split(" ").includes(cls) ? [this] : []), ...this.children.flatMap((child) => typeof child === "string" ? [] : child.all(cls))]; }
}

function part(wear: number): PartInstance {
  return { id: "p1", defId: "mg", hp: 10, wear };
}

describe("wearLabel", () => {
  it("reads a wear-0 part as pristine", () => {
    expect(en(wearLabel(part(0)))).toBe("pristine");
  });

  it("counts rebuilds for a part that has broken and been rebuilt before", () => {
    expect(en(wearLabel(part(1)))).toBe("rebuilt x1");
    expect(en(wearLabel(part(2)))).toBe("rebuilt x2");
  });

  it("reads a part past the last wear step as junk", () => {
    expect(en(wearLabel(part(CONDITION.maxWear + 1)))).toBe("junk");
  });
});

describe("Russian part condition on every gender", () => {
  const ru = (msg: Msg) => resolve(msg, "ru");
  const PARTS_BY_GENDER = { m: "shotgun", f: "mg", n: "recoilless", pl: "plates" } as const;
  const HP = /^\d+\/\d+ прочн\.$/;
  const cases: [string, Partial<PartInstance>, string, string | RegExp][] = [
    ["pristine", { wear: 0 }, "без износа", HP],
    ["rebuilt once", { wear: 1 }, "1 капремонт", HP],
    ["rebuilt twice", { wear: 2 }, "2 капремонта", HP],
    ["rebuilt four times", { wear: CONDITION.maxWear }, `${CONDITION.maxWear} капремонта`, HP],
    ["broken", { wear: 1, hp: 0 }, "1 капремонт", "не работает"],
    ["junk", { wear: CONDITION.maxWear + 1, hp: 0 }, "лом", "только на лом"],
  ];
  for (const [gender, defId] of Object.entries(PARTS_BY_GENDER)) {
    for (const [state, fields, wear, status] of cases) {
      it(`${state} on a ${gender} part`, () => {
        const p: PartInstance = { id: "p1", defId, hp: 10, wear: 0, ...fields };
        expect(ru(wearLabel(p))).toBe(wear);
        expect(ru(conditionStatus(p).text)).toMatch(status);
      });
    }
  }

  it("counts five rebuilds with the many form", () => {
    expect(ru(t("cond.rebuilt", { n: 5 }))).toBe("5 капремонтов");
  });
});

describe("conditionTier", () => {
  it("gives one tier per wear step and junk past the last", () => {
    expect(conditionTier(part(0))).toBe("pristine");
    expect(conditionTier(part(1))).toBe("w1");
    expect(conditionTier(part(CONDITION.maxWear))).toBe(`w${CONDITION.maxWear}`);
    expect(conditionTier(part(CONDITION.maxWear + 1))).toBe("junk");
  });
});

describe("showsCondition", () => {
  it("is false for built-in core parts and true for every other part", () => {
    for (const def of Object.values(PARTS)) {
      expect(showsCondition({ ...part(0), defId: def.id })).toBe(def.kind !== "core");
    }
    expect(showsCondition({ ...part(0), defId: "cab" })).toBe(false);
  });
});

describe("conditionStatus", () => {
  it("shows HP for a working part", () => {
    const s = conditionStatus(part(1));
    expect(s.tone).toBe("dim");
    expect(en(s.text)).toMatch(/HP$/);
  });

  it("reads a broken rebuildable part as broken, never junk", () => {
    expect(conditionStatus({ ...part(2), hp: 0 }).tone).toBe("bad");
    expect(en(conditionStatus({ ...part(2), hp: 0 }).text)).toBe("broken");
    expect(en(conditionStatus({ ...part(CONDITION.maxWear), hp: 0 }).text)).toBe("broken");
  });

  it("reads junk as scrap only", () => {
    const junk = conditionStatus({ ...part(CONDITION.maxWear + 1), hp: 0 });
    expect([en(junk.text), junk.tone]).toEqual(["scrap only", "dim"]);
  });
});

describe("contract text", () => {
  const order: Contract = { id: "c1", shop: "bowl", kind: "procure", good: "salt", units: 5, cratePay: 900, reward: 100, deadline: 100, window: 100, tier: 1 };

  it("shows the deadline as the game time the contract fails", () => {
    expect(en(contractDue(order))).toBe("by Day 1 12:19");
  });

  it("names the good, the crate count and the shop that ordered it, and no source", () => {
    expect(en(contractSummary(order))).toBe("Bring 5 crates of Salt to Bowl");
    expect(en(heldContractDue(order))).toBe(en(contractDue(order)));
  });

  it("logs a collected bounty when the player's truck collected it", () => {
    const w = emptyWorld();
    const line = eventText(w, { t: "bountyClosed", case: "k1", target: "gone", status: "collected", amount: 5500, collector: w.player.vehicleId })!;
    expect([en(line.text), line.cls]).toEqual(["You collect the bounty on a driver: 55 M's", "good"]);
    expect(eventText(w, { t: "bountyClosed", case: "k1", target: "gone", status: "collected", amount: 5500, collector: "marshal-1" })).toBeNull();
  });

  describe("search", () => {
    const search: Contract = {
      id: "c3", shop: "bowl", kind: "search", target: "v1", driver: "Jed Cobb", template: "trader",
      lead: { at: { x: 1, y: 1 }, turn: 0 }, reward: 9200, deadline: 100, window: 100, tier: 1, delivered: false,
    };

    it("names who gets the parcel and where to claim", () => {
      expect(en(contractSummary(search))).toBe("Bring a parcel to Trader Jed Cobb, claim at Bowl");
    });

    it("reads a delivered search as ready to claim", () => {
      const met: Contract = { ...search, delivered: true };
      expect(en(contractSummary(met))).toBe("Parcel delivered to Trader Jed Cobb, claim at Bowl");
      expect(en(heldContractDue(met))).toBe("Ready");
      expect(en(heldContractDue(search))).toBe(en(contractDue(search)));
    });

    it("logs the handover with its reward and where to claim it", () => {
      const line = eventText(emptyWorld(), { t: "contract", contract: { ...search, delivered: true }, outcome: "fulfilled" })!;
      expect([en(line.text), line.cls]).toEqual(["Handed the parcel to Trader Jed Cobb. Claim 92 M's at Bowl.", "good"]);
    });

    it("says the parcel is void when the search fails or lapses", () => {
      const failed = eventText(emptyWorld(), { t: "contract", contract: search, outcome: "failed" })!;
      const lapsed = eventText(emptyWorld(), { t: "contract", contract: search, outcome: "lapsed" })!;
      expect(en(failed.text)).toBe("Contract failed: Bring a parcel to Trader Jed Cobb, claim at Bowl. The parcel is void.");
      expect(en(lapsed.text)).toBe("Contract lapsed: Bring a parcel to Trader Jed Cobb, claim at Bowl. The parcel is void.");
    });
  });

  describe("a rescue", () => {
    const rescue: Extract<Contract, { kind: "rescue" }> = { id: "c9", shop: "bowl", kind: "rescue", client: "v5", driver: "Jed Cobb", need: "fuel", area: { x: 0, y: 0 }, reward: 100, deadline: 100, window: 100, tier: 1, fulfilled: false };

    it("names the driver, and reads as ready to claim once met", () => {
      expect(en(contractSummary(rescue))).toBe("Rescue Jed Cobb");
      expect(en(contractSummary({ ...rescue, fulfilled: true }))).toBe("Jed Cobb is moving, claim at Bowl");
      expect(en(heldContractDue({ ...rescue, fulfilled: true }))).toBe("Ready");
      expect(en(heldContractDue(rescue))).toBe(en(contractDue(rescue)));
    });

    it("says how far and which way from the shop the driver waits", () => {
      const bowl = REGION.towns.find((t) => t.id === "bowl")!.pos;
      const east = { ...rescue, area: { x: bowl.x + 40, y: bowl.y } };
      expect(en(rescueWhere(east))).toMatch(/^\d+ m east of Bowl$|^[\d.]+ km east of Bowl$/);
      expect(en(rescueWhere({ ...east, area: { x: bowl.x, y: bowl.y - 40 } }))).toContain("north of Bowl");
    });

    it("logs a met rescue with the driver and a lapsed one without a price", () => {
      const met = eventText(emptyWorld(), { t: "contract", contract: { ...rescue, fulfilled: true }, outcome: "fulfilled" })!;
      expect([en(met.text), met.cls]).toEqual(["Rescue met: Jed Cobb is moving, claim 1 M at Bowl", "good"]);
      const lapsed = eventText(emptyWorld(), { t: "contract", contract: rescue, outcome: "lapsed" })!;
      expect([en(lapsed.text), lapsed.cls]).toEqual(["Rescue lapsed: Jed Cobb no longer needs you", "dim"]);
      const failed = eventText(emptyWorld(), { t: "contract", contract: rescue, outcome: "failed" })!;
      expect(en(failed.text)).toBe("Contract failed: Rescue Jed Cobb, pays 1 M");
    });
  });

  it("says where a claimed part lies from the posting shop, and in which territory", () => {
    const orchard = REGION.locations.find((l) => l.id === "orchard")!;
    const shop = REGION.towns.find((l) => l.id === "bowl")!;
    const claim: Contract = { id: "c4", shop: "bowl", kind: "claim", stockId: "armyTruck-1", at: { ...orchard.pos }, partId: "p1", defId: "mg", reward: 100, deadline: 100, window: 100, tier: 1, rivalAt: 100, rival: null, leads: [] };
    const text = en(contractSummary(claim));
    expect(text.startsWith("Recover MG turret from an army truck ")).toBe(true);
    expect(text).toContain(" of Bowl, about ");
    expect(text.endsWith(", in " + en(siteName("orchard")))).toBe(true);
    expect(shop).toBeDefined();
  });

  it("names the wreck kind, a compass point and a rounded distance in the clue", () => {
    const shop = REGION.towns.find((l) => l.id === "bowl")!;
    const claim: Contract = { id: "c5", shop: "bowl", kind: "claim", stockId: "tank-3", at: { x: shop.pos.x + 300, y: shop.pos.y - 10 }, partId: "p1", defId: "mg", reward: 100, deadline: 100, window: 100, tier: 1, rivalAt: 100, rival: null, leads: [] };
    expect(gridSquareOf(claim.at)).toEqual({ column: 4, row: 6 });
    expect(en(contractSummary(claim))).toBe("Recover MG turret from a dead tank in square E7, east of Bowl, about 1.3 km out");
    expect(resolve(contractSummary(claim), "ru")).toContain("в квадрате Д7,");
  });

  it("names the piece a claimed wreck lies by, inside it, beside it or offset from it", () => {
    const world = newWorld(1, START_KITS.standard, TEST_MAP, defaultSetup("roaming"), false);
    const wrecks = claimWrecks(world);
    const claimAt = (id: string, shop: string): ClaimContract => {
      const wreck = wrecks.find((w) => w.id === id)!;
      return { id: "cw", shop, kind: "claim", stockId: id, at: { ...wreck.pos }, partId: "p1", defId: "mg", reward: 100, deadline: 100, window: 100, tier: 1, rivalAt: 100, rival: null, leads: [] };
    };
    expect(en(contractSummary(claimAt("hullCache-2586", "nose")))).toMatch(/ in Fallen Sun, inside the small arch shell$/);
    const offset = wrecks.find((w) => bakedTier(w.id, "bowl") === "offset" && claimClue(claimAt(w.id, "bowl")).where?.piece === "farmhouse")!;
    expect(en(contractSummary(claimAt(offset.id, "bowl")))).toMatch(/ in Old Orchard, about \d+ m (north|south|east|west)[a-z-]* of the farmhouse$/);
    const beside = wrecks.find((w) => bakedTier(w.id, "bowl") === "piece" && claimClue(claimAt(w.id, "bowl")).where?.relation === "beside")!;
    expect(en(contractSummary(claimAt(beside.id, "bowl")))).toMatch(/, beside (the|a) [a-z ]+$/);
  });

  it("tells of a rival sent after a held claim, and of a claim lost to it, as notable lines", () => {
    const w = emptyWorld();
    const rival = addVehicle(w, "independent", "scout", ["stockEngine"], { x: 40, y: 40 });
    rival.brain = npcBrain("scavenger", rival.pos, ["scavenger"]);
    const claim: Contract = { id: "c6", shop: "bowl", kind: "claim", stockId: "tank-3", at: { x: 90, y: 40 }, partId: "p1", defId: "mg", reward: 100, deadline: 100, window: 100, tier: 1, rivalAt: 100, rival: rival.id, leads: [] };
    w.player.contracts = [claim];
    const sent = eventText(w, { t: "claimRival", contract: claim.id, vehicle: rival.id })!;
    expect([en(sent.text), sent.cls]).toEqual(["Bowl sent Jed Cobb after the MG turret too", "bad"]);
    expect(eventText(emptyWorld(), { t: "claimRival", contract: claim.id, vehicle: rival.id })).toBeNull();
    const lost = eventText(w, { t: "contract", contract: claim, outcome: "lapsed", cause: "rival" })!;
    expect(en(lost.text)).toBe("Contract lapsed: Jed Cobb brought the MG turret to Bowl first");
    expect(isNotable({ t: "contract", contract: claim, outcome: "lapsed", cause: "rival" })).toBe(true);
    expect(isNotable({ t: "contract", contract: claim, outcome: "lapsed" })).toBe(false);
  });

  it("starts a rush haul's summary with Rush and leaves a standard haul plain", () => {
    const haul: Contract = { id: "c3", shop: "bowl", kind: "haul", good: "salt", units: 3, to: "nose", reward: 100, deadline: 100, window: 100, rush: false, tier: 1 };
    expect(en(contractSummary(haul)).startsWith("Haul 3")).toBe(true);
    expect(en(contractSummary({ ...haul, rush: true })).startsWith("Rush: Haul 3")).toBe(true);
  });

  it("counts a haul in crates", () => {
    const haul: Contract = { id: "c4", shop: "bowl", kind: "haul", good: "salt", units: 5, to: "nose", reward: 100, deadline: 100, window: 100, rush: false, tier: 1 };
    expect(en(contractSummary(haul))).toBe("Haul 5 crates of Salt to Nose");
    expect(en(contractSummary({ ...haul, units: 1 }))).toBe("Haul 1 crate of Salt to Nose");
  });

  it("shows the window in whole game hours, at least one", () => {
    expect(en(contractWindow({ ...order, window: 525 }))).toBe("28 h");
    expect(en(contractWindow({ ...order, window: 1 }))).toBe("1 h");
  });
});

describe("jobLabel of site business", () => {
  const town = REGION.towns[0];
  const label = (deal: "resupply" | "sell" | "trade", siteId = town.id) => {
    const w = emptyWorld();
    return en(jobLabel(w, w.vehicles[0], { kind: "business", siteId, deal, turnsLeft: 2, total: 3 }));
  };

  it("names each deal and the site", () => {
    expect(label("resupply")).toBe(`Refuel and repair at ${en(siteName(town.id))}`);
    expect(label("sell")).toBe(`Sell cargo at ${en(siteName(town.id))}`);
    expect(label("trade")).toBe(`Buy cargo at ${en(siteName(town.id))}`);
  });

  it("reads an oasis resupply as filling water", () => {
    const oasis = REGION.locations.find((l) => l.kind === "oasis")!;
    expect(label("resupply", oasis.id)).toBe(`Fill water at ${en(siteName(oasis.id))}`);
  });

  it("throws on an unknown deal", () => {
    expect(() => label("raid" as "sell")).toThrow();
  });
});

describe("jobLabel", () => {
  function downedBuggy() {
    const w = emptyWorld();
    const buggy = addVehicle(w, "scrapjaw", "buggy", ["mg", "stockEngine"], { x: 33, y: 30 });
    buggy.brain = npcBrain("buggy", buggy.pos, ["raider"]);
    const gun = buggy.items.find((it) => it.kind === "part" && it.part.defId === "mg");
    if (gun?.kind !== "part") throw new Error("Expected a gun");
    return { w, me: w.vehicles[0], buggy, gun };
  }

  it("names the part and the truck of a removal, before and after it is done", () => {
    const { w, me, buggy, gun } = downedBuggy();
    const job: Job = { kind: "refit", moves: [], pickup: { from: "truck", vehicleId: buggy.id, partId: gun.part.id, itemId: "new", to: { x: 0, y: 0, rot: 0 } }, turnsLeft: 3, total: 3 };
    expect(en(jobLabel(w, me, job))).toBe(`Remove ${en(partName("mg"))} from ${en(vehicleTitle(w, buggy))}`);
    buggy.items = buggy.items.filter((it) => it.id !== gun.id);
    me.items.push({ ...gun, id: "new" });
    expect(en(jobLabel(w, me, job))).toBe(`Remove ${en(partName("mg"))} from ${en(vehicleTitle(w, buggy))}`);
  });

  it("names the parts a refit moves on the player's own grid", () => {
    const { w, me } = downedBuggy();
    const gun = me.items.find((it) => it.kind === "part" && partDef(it.part.defId).kind === "weapon")!;
    const job: Job = { kind: "refit", moves: [{ itemId: gun.id, from: { x: gun.x, y: gun.y, rot: gun.rot }, to: { x: 0, y: 0, rot: 0 } }], pickup: null, turnsLeft: 3, total: 3 };
    expect(en(jobLabel(w, me, job))).toBe(`Refit ${en(partName(gun.kind === "part" ? gun.part.defId : ""))}`);
  });
});

describe("roundLabel", () => {
  const w = emptyWorld();
  const v = addVehicle(w, "scrapjaw", "buggy", ["mg"], { x: 10, y: 10 });
  const idOf = (kind: string) => mountedParts(v).find((p) => partDef(p.defId).kind === kind || (partDef(p.defId) as { role?: string }).role === kind)!.id;
  
  it("names each damaged part short with its damage", () => {
    expect(en(roundLabel(w, v.id, [{ part: idOf("weapon"), damage: 3 }, { part: idOf("cab"), damage: 4.2 }], false))).toBe("Gun: 3, Cab: 5");
  });

  it("marks a crit", () => {
    expect(en(roundLabel(w, v.id, [{ part: idOf("wheel"), damage: 5 }], true))).toBe("Crit! Whl: 5");
  });

  it("shows nothing for a round that damaged no part", () => {
    expect(en(roundLabel(w, v.id, [{ part: idOf("wheel"), damage: 0 }], false))).toBeNull();
  });
});

describe("utility log", () => {
  it("logs no line for a utility use, so smoke never reads as mechanical state", () => {
    const w = emptyWorld();
    expect(eventText(w, { t: "utility", vehicle: w.player.vehicleId, part: "p1", effect: "sprout", point: null })).toBeNull();
  });
});

describe("harpoon log", () => {
  function harpooned(rounds: ShotRound[]) {
    const w = emptyWorld();
    const me = w.vehicles[0];
    const harpoon = makePart(w, "harpoon", 0);
    if (!mountPart(w, me, harpoon)) throw new Error("No deck room for the harpoon");
    const trader = addVehicle(w, "independent", "hauler", ["stockEngine"], { x: 33, y: 30 });
    const engine = mountedParts(trader, "engine")[0];
    const shot: GameEvent = { t: "shot", shooter: me.id, weapon: harpoon.id, target: trader.id, aim: "body", chance: 0.4, damageChance: 0.3, side: "left", rounds };
    return { w, me, harpoon, trader, engine, shot };
  }

  it("names the part the player's line holds", () => {
    const s = harpooned([]);
    s.w.lines = [{ id: "l1", from: s.me.id, fromPart: s.harpoon.id, to: s.trader.id, toPart: s.engine.id, length: 10, turnsLeft: 3 }];
    s.shot = { ...(s.shot as Extract<GameEvent, { t: "shot" }>), rounds: [{ hit: true, crit: false, offset: 0, struck: s.trader.id, hits: [{ part: s.engine.id, damage: 2 }], blast: [], burst: null }] };

    expect(logEn(s.w, s.shot)?.text).toBe(`Harpoon → ${en(vehicleName(s.w, s.trader.id))}: line on Stock engine (40%): Stock engine −2`);
  });

  it("reads a harpoon that holds nothing as a miss", () => {
    const s = harpooned([{ hit: false, crit: false, offset: 3, struck: null, hits: [], blast: [], burst: null }]);

    expect(logEn(s.w, s.shot)?.text).toBe(`Harpoon → ${en(vehicleName(s.w, s.trader.id))}: missed (40%)`);
  });

  it("tells the player its truck tore free of a line", () => {
    const s = harpooned([]);
    const mine = mountedParts(s.me, "engine")[0];

    expect(logEn(s.w, { t: "lineTorn", line: "l1", vehicle: s.me.id, part: mine.id, damage: 12 })).toMatchObject({ text: `You tear free of a harpoon line: ${en(partName(mine.defId))} −12`, cls: "bad" });
  });
});

describe("emitter pulse log", () => {
  it("names the trucks the player's pulse shuts down", () => {
    const w = emptyWorld();
    const me = w.player.vehicleId;
    const trader = addVehicle(w, "independent", "hauler", [], { x: 33, y: 30 });

    expect(logEn(w, { t: "pulse", vehicle: me, pos: { x: 30, y: 30 }, hit: [trader.id] })).toEqual({ text: `Your emitter pulse shuts down ${en(vehicleName(w, trader.id))}`, cls: "good" });
    expect(logEn(w, { t: "pulse", vehicle: me, pos: { x: 30, y: 30 }, hit: [] })).toEqual({ text: "Your emitter pulse catches nobody", cls: "dim" });
  });

  it("tells the player its truck is shut down and for how long", () => {
    const w = emptyWorld();
    const me = w.vehicles[0];
    const raider = addVehicle(w, "scrapjaw", "hauler", [], { x: 33, y: 30 });
    me.shutDown = { from: w.turn + 1, until: w.turn + 2 };

    expect(logEn(w, { t: "pulse", vehicle: raider.id, pos: { x: 33, y: 30 }, hit: [me.id] })).toEqual({ text: `${en(vehicleName(w, raider.id))}'s emitter pulse shuts your truck down for 2 turns`, cls: "bad" });
  });

  it("logs nothing for a pulse between other trucks", () => {
    const w = emptyWorld();
    const raider = addVehicle(w, "scrapjaw", "hauler", [], { x: 33, y: 30 });
    const trader = addVehicle(w, "independent", "hauler", [], { x: 35, y: 30 });

    expect(logEn(w, { t: "pulse", vehicle: raider.id, pos: { x: 33, y: 30 }, hit: [trader.id] })).toBeNull();
  });
});

describe("claymore log", () => {
  it("names the truck the player's claymore ram blasts and the damage it took", () => {
    const w = emptyWorld();
    const trader = addVehicle(w, "independent", "hauler", ["stockEngine"], { x: 33, y: 30 });
    const engine = mountedParts(trader, "engine")[0];
    const hits = [{ part: engine.id, damage: 20 }];

    expect(logEn(w, { t: "claymore", vehicle: w.player.vehicleId, part: "ram", other: trader.id, pos: { x: 32, y: 30 }, hits, selfHits: [] })).toMatchObject({ text: `Your claymore ram blasts ${en(vehicleName(w, trader.id))}: Stock engine −20`, cls: "good" });
  });

  it("tells the player a claymore ram blasted its truck", () => {
    const w = emptyWorld();
    const raider = addVehicle(w, "scrapjaw", "hauler", [], { x: 33, y: 30 });
    const engine = mountedParts(w.vehicles[0], "engine")[0];
    const hits = [{ part: engine.id, damage: 20 }];

    expect(logEn(w, { t: "claymore", vehicle: raider.id, part: "ram", other: w.player.vehicleId, pos: { x: 31, y: 30 }, hits, selfHits: [] })).toMatchObject({ text: `${en(vehicleName(w, raider.id))}'s claymore ram blasts your truck: ${en(partName(engine.defId))} −20`, cls: "bad" });
  });

  it("logs a seen blast between other trucks and nothing for one out of sight", () => {
    const w = emptyWorld();
    const raider = addVehicle(w, "scrapjaw", "hauler", [], { x: 33, y: 30 });
    const trader = addVehicle(w, "independent", "hauler", [], { x: 35, y: 30 });
    const far = addVehicle(w, "scrapjaw", "hauler", [], { x: 200, y: 200 });
    const farTrader = addVehicle(w, "independent", "hauler", [], { x: 202, y: 200 });

    expect(logEn(w, { t: "claymore", vehicle: raider.id, part: "ram", other: trader.id, pos: { x: 34, y: 30 }, hits: [], selfHits: [] })).toMatchObject({ text: `${en(vehicleName(w, raider.id))}'s claymore ram blasts ${en(vehicleName(w, trader.id))}`, cls: "dim" });
    expect(logEn(w, { t: "claymore", vehicle: far.id, part: "ram", other: farTrader.id, pos: { x: 201, y: 200 }, hits: [], selfHits: [] })).toBeNull();
  });
});

describe("caltrops log", () => {
  const wheelHits = (v: { items: { kind: string; part?: PartInstance }[] }) =>
    v.items.flatMap((i) => (i.part && partDef(i.part.defId).kind === "core" && i.part.defId.includes("wheel") ? [{ part: i.part.id, damage: 8 }] : []));

  it("lists the player's wheel damage like a hit", () => {
    const w = emptyWorld();
    const me = w.vehicles[0];
    const hits = wheelHits(me);

    const line = logEn(w, { t: "caltrops", vehicle: me.id, field: "g1", source: me.id, hits });

    expect(hits).toHaveLength(4);
    expect(line).toMatchObject({ cls: "bad", text: expect.stringMatching(/^You drive into caltrops: (.+ −8, ){3}.+ −8$/) });
  });

  it("names a seen truck that drives into the player's caltrops, with its wheel damage", () => {
    const w = emptyWorld();
    const trader = addVehicle(w, "independent", "hauler", [], { x: 33, y: 30 });

    const line = logEn(w, { t: "caltrops", vehicle: trader.id, field: "g1", source: w.player.vehicleId, hits: wheelHits(trader) });

    expect(line).toMatchObject({ cls: "good", text: expect.stringMatching(new RegExp(`^${en(vehicleName(w, trader.id))} drives into caltrops: .*−8`)) });
  });

  it("logs a caltrops event from an old save with no wheel numbers", () => {
    const w = emptyWorld();
    const me = w.player.vehicleId;

    expect(logEn(w, { t: "caltrops", vehicle: me, field: "g1", source: me, hits: [] })).toMatchObject({ text: "You drive into caltrops", cls: "bad" });
  });

  it("logs nothing for a truck out of sight", () => {
    const w = emptyWorld();
    const trader = addVehicle(w, "independent", "hauler", [], { x: 200, y: 200 });

    expect(logEn(w, { t: "caltrops", vehicle: trader.id, field: "g1", source: trader.id, hits: [] })).toBeNull();
  });
});

describe("collision log", () => {
  it("tells the log the title of a note written into the journal", () => {
    const w = emptyWorld();

    expect(logEn(w, { t: "note", id: "greenPit" })).toEqual({ text: "Noted in your journal: Clean water at Green Pit.", cls: "good" });
  });

  it("logs no crash, whether into a standing obstacle or through a fence", () => {
    const w = emptyWorld();
    const me = w.player.vehicleId;
    const fence = { id: "fence-3", pos: { x: 33, y: 30 }, r: 0.5, kind: "landmark" as const, look: "fence" as const, yaw: 0 };
    w.broken = [{ obstacle: fence, turn: w.turn }];
    expect(logEn(w, { t: "collision", a: me, b: "fence-3", impact: 3, hitsA: [], hitsB: [] })).toBeNull();
    expect(logEn(w, { t: "collision", a: me, b: "rock7", impact: 3, hitsA: [{ part: "x", damage: 4 }], hitsB: [] })).toBeNull();
  });
});

describe("cargo spill log", () => {
  it("names the player's broken cargo part and how many items fell out", () => {
    const w = emptyWorld();
    const panniers = mountedParts(w.vehicles[0], "cargo")[0];
    const line = logEn(w, { t: "cargoSpilled", vehicle: w.player.vehicleId, part: panniers.id, pile: "spill-1", units: 6 });
    expect(line).toEqual({ text: "Panniers broke. 6 items fell out.", cls: "bad" });
  });

  it("names the NPC whose cargo spilled", () => {
    const w = emptyWorld();
    const npc = addVehicle(w, "independent", "hauler", ["rack"], { x: 40, y: 30 });
    const line = logEn(w, { t: "cargoSpilled", vehicle: npc.id, part: mountedParts(npc, "cargo")[0].id, pile: "spill-2", units: 1 });
    expect(line).toEqual({ text: `${en(vehicleName(w, npc.id))}: cargo spilled on the ground`, cls: "good" });
  });
});

describe("patch log", () => {
  it("says a broken patch is off, naming the driver", () => {
    const w = emptyWorld();
    const npc = addVehicle(w, "independent", "scout", ["stockEngine"], { x: 40, y: 30 });
    const line = eventText(w, { t: "patch", patcher: w.player.vehicleId, client: npc.id, outcome: "broken" });
    expect(en(line?.text)).toBe(`The patch with ${en(vehicleName(w, npc.id))} is off.`);
    expect(line?.cls).toBe("dim");
  });
});

describe("shot log", () => {
  it("names stray fire that hits the player in a shot between other trucks", () => {
    const w = emptyWorld();
    const me = w.vehicles[0];
    const raider = addVehicle(w, "scrapjaw", "buggy", ["mg"], { x: 40, y: 40 });
    const trader = addVehicle(w, "independent", "hauler", ["stockEngine"], { x: 44, y: 40 });
    const cab = mountedParts(me).find((p) => (partDef(p.defId) as { role?: string }).role === "cab")!;
    const e: GameEvent = {
      t: "shot", shooter: raider.id, weapon: mountedParts(raider, "weapon")[0].id, target: trader.id, aim: "body", chance: 0.5, damageChance: 0.5, side: "front",
      rounds: [{ hit: false, crit: false, offset: 3, struck: me.id, hits: [{ part: cab.id, damage: 4 }], blast: [], burst: null }],
    };
    const line = eventText(w, e);
    expect(en(line?.text)).toContain(", stray fire hits ");
    expect(line?.cls).toBe("bad");
  });

  function duel() {
    const w = emptyWorld();
    const me = w.vehicles[0];
    const raider = addVehicle(w, "scrapjaw", "buggy", ["mg", "steelPlate"], { x: 40, y: 40 });
    const parts = mountedParts(raider);
    const cab = parts.find((p) => (partDef(p.defId) as { role?: string }).role === "cab")!;
    const armor = parts.find((p) => partDef(p.defId).kind === "armor");
    const shot = (hits: { part: string; damage: number }[], rounds = 2): GameEvent => ({
      t: "shot", shooter: me.id, weapon: mountedParts(me, "weapon")[0].id, target: raider.id, aim: "body", chance: 0.4, damageChance: 0.4, side: "front",
      rounds: Array.from({ length: rounds }, (_, i) => ({ hit: i === 0, crit: false, offset: 0, struck: raider.id, hits: i === 0 ? hits : [], blast: [], burst: null })),
    });
    return { w, raider, cab, armor, shot };
  }

  it("reads who shot whom, hits, chance and damage per part", () => {
    const { w, raider, cab, shot } = duel();
    cab.hp = maxHp(cab);
    const line = eventText(w, shot([{ part: cab.id, damage: 2 }]))!;
    expect(en(line.text)).toMatch(/^.+ → .+, 1\/2 hit \(40%\): .+ −2$/);
    expect(en(line.text)).toContain(en(vehicleTitle(w, raider)));
  });

  it("marks a part with no HP left as broken in the bad color", () => {
    const { w, cab, shot } = duel();
    cab.hp = 0;
    const line = eventText(w, shot([{ part: cab.id, damage: 5 }]))!;
    expect(line.spans!.find((s) => en(s.text).endsWith(" broken"))?.cls).toBe("bad");
  });

  it("puts inner parts before armor and dims the armor", () => {
    const { w, cab, armor, shot } = duel();
    if (!armor) throw new Error('The raider has no armor');
    armor.hp = maxHp(armor);
    cab.hp = maxHp(cab);
    const line = eventText(w, shot([{ part: armor.id, damage: 1 }, { part: cab.id, damage: 2 }]))!;
    const names = line.spans!.map((s) => en(s.text));
    expect(names.findIndex((t) => t.startsWith(en(partName(cab.defId))))).toBeLessThan(names.findIndex((t) => t.startsWith(en(partName(armor.defId)))));
    expect(line.spans!.find((s) => en(s.text).startsWith(en(partName(armor.defId))))?.cls).toBe("dim");
  });

  it("names the parts a shot hit on a truck it wrecked, which went onto the wreck's stock", () => {
    const { w, raider, armor, shot } = duel();
    if (!armor) throw new Error('The raider has no armor');
    const e = shot([{ part: armor.id, damage: 3 }]);
    w.events.push(e);
    wreckVehicle(w, raider);
    expect(en(eventText(w, e)!.text)).toContain(`${en(partName(armor.defId))} −3`);
    expect(en(roundLabel(w, raider.id, [{ part: armor.id, damage: 3 }], false))).toBe("Arm: 3");
  });

  it("logs a shot with no damage without a damage list", () => {
    const { w, shot } = duel();
    expect(en(eventText(w, shot([]))!.text)).not.toContain("−");
  });
});

describe("empty gun log", () => {
  it("leaves a gun running dry out of the log", () => {
    const w = emptyWorld();
    const me = w.vehicles[0];
    const gun = mountedParts(me, "weapon")[0];
    expect(eventText(w, { t: "empty", vehicle: me.id, weapon: gun.id })).toBeNull();
  });
});

describe("NPC names in the log", () => {
  it("names an NPC by profession and driver, also after it was removed, and the player as You", () => {
    const w = emptyWorld();
    const npc = addVehicle(w, "independent", "buggy", ["mg", "stockEngine"], { x: 20, y: 20 });
    npc.brain = { ...npcBrain("roamer", npc.pos, ["roamer"]), driver: "Silas Kane" };
    const offer: GameEvent = { t: "towOffer", by: npc.id, town: REGION.towns[0].id, fee: 40 };
    expect(en(eventText(w, offer)?.text)).toMatch(/^Roamer Silas Kane offers to tow you to /);
    w.vehicles = w.vehicles.filter((v) => v !== npc);
    w.removed.push(npc);
    expect(en(eventText(w, offer)?.text)).toMatch(/^Roamer Silas Kane offers/);
    expect(en(vehicleName(w, w.player.vehicleId))).toBe("You");
  });
});

describe("money text", () => {
  it("reads a money event in M with its sign", () => {
    const w = emptyWorld();
    const gain = eventText(w, { t: "money", amount: 4067, reason: { kind: "contract" } })!;
    const loss = eventText(w, { t: "money", amount: -100, reason: { kind: "contract" } })!;
    expect([en(gain.text), gain.cls]).toEqual(["+41 M's: contract", "good"]);
    expect(loss.cls).toBe("bad");
  });
});

describe("tow text", () => {
  it("reads the currency as M's in money lines and one-unit fees", () => {
    const w = emptyWorld({ x: 30, y: 30 });
    const npc = addVehicle(w, "independent", "scout", ["stockEngine"], { x: 34, y: 30 });
    const town = REGION.towns[0].id;
    expect(en(eventText(w, { t: "money", amount: 12000, reason: { kind: "contract" } })!.text)).toBe("+120 M's: contract");
    expect(en(eventText(w, { t: "money", amount: -4000, reason: { kind: "contract" } })!.text)).toBe("\u221240 M's: contract");
    expect(en(eventText(w, { t: "towOffer", by: npc.id, town, fee: 100 })!.text)).toMatch(/ for 1 M\.$/);
  });
  it("says free for a fee of 0 and keeps the price otherwise", () => {
    const w = emptyWorld({ x: 30, y: 30 });
    const npc = addVehicle(w, "independent", "scout", ["stockEngine"], { x: 34, y: 30 });
    const town = REGION.towns[0].id;
    expect(en(eventText(w, { t: "towOffer", by: npc.id, town, fee: 0 })?.text)).toMatch(/ for free\.$/);
    expect(en(eventText(w, { t: "towOffer", by: npc.id, town, fee: 4000 })?.text)).toMatch(/ for 40 M's\.$/);
    const free = eventText(w, { t: "towDone", by: npc.id, client: w.player.vehicleId, fee: 0 })!;
    expect([en(free.text), free.cls]).toEqual([expect.stringMatching(/tows you into town for free\.$/), ""]);
    const paid = eventText(w, { t: "towDone", by: npc.id, client: w.player.vehicleId, fee: 4067 })!;
    expect([en(paid.text), paid.cls]).toEqual([expect.stringMatching(/takes 41 M's\.$/), "bad"]);
    const other = addVehicle(w, "independent", "buggy", ["stockEngine"], { x: 50, y: 30 });
    expect(en(eventText(w, { t: "towDone", by: npc.id, client: other.id, fee: 0 })?.text)).toMatch(/ in for free\.$/);
  });
});

describe("aid handover text", () => {
  it("labels the work for both trucks and logs its start", () => {
    const w = emptyWorld({ x: 30, y: 30 });
    const npc = addVehicle(w, "independent", "scout", ["stockEngine"], { x: 34, y: 30 });
    npc.brain = npcBrain("trader", npc.pos, ["trader"]);
    addState(w, "aid", npc.id, w.player.vehicleId, { kind: "aid", giver: "player", fuel: 5, supplies: 0, price: 0, free: true, agreed: true, started: false, work: 1, workLeft: 1 });
    const next = startAid(w, npc.id);
    const mine = next.vehicles[0];
    expect(en(workLabel(next, mine, workOf(next, mine)!))).toMatch(/^Giving .* to /);
    const theirs = next.vehicles.find((v) => v.id === npc.id)!;
    expect(en(workLabel(next, theirs, workOf(next, theirs)!))).toMatch(/^Taking .* from you$/);
    expect(en(eventText(next, next.events.find((e) => e.t === "aidStarted")!)?.text)).toMatch(/^You start handing/);
  });
});

describe("look-over text", () => {
  it("labels the looker's work, logs a driver looking the player over, and shows the load once known", () => {
    const w = emptyWorld({ x: 30, y: 30 });
    w.player.ranks.perception = 1;
    const npc = addVehicle(w, "independent", "scout", ["stockEngine"], { x: 34, y: 30 });
    npc.brain = npcBrain("trader", npc.pos, ["trader"]);
    expect(en(formatNpcLookOver(w, npc))).toBe("[B] Look over");
    expect(formatNpcCargo(w, npc)).toBeNull();
    addState(w, "lookOver", w.player.vehicleId, npc.id, { kind: "none" });
    const mine = w.vehicles[0];
    expect(en(workLabel(w, mine, workOf(w, mine)!))).toMatch(/^Look over Trader /);
    const theirs = addState(w, "lookOver", npc.id, w.player.vehicleId, { kind: "none" });
    expect(en(workLabel(w, npc, workOf(w, npc)!))).toBe("Looking you over");
    w.states = w.states.filter((s) => s !== theirs);
    expect(formatNpcLookOver(w, npc)).toBeNull();
    addState(w, "sizedUp", w.player.vehicleId, npc.id, { kind: "none" });
    expect(formatNpcCargo(w, npc)).not.toBeNull();
    expect(en(eventText(w, { t: "lookedOver", by: npc.id, target: w.player.vehicleId })?.text)).toMatch(/^Trader .* looks your truck over\.$/);
    expect(eventText(w, { t: "lookedOver", by: w.player.vehicleId, target: npc.id })).toBeNull();
  });

  it("hides the look-over key without Perception 1", () => {
    const w = emptyWorld({ x: 30, y: 30 });
    const npc = addVehicle(w, "independent", "scout", ["stockEngine"], { x: 34, y: 30 });
    npc.brain = npcBrain("trader", npc.pos, ["trader"]);
    expect(formatNpcLookOver(w, npc)).toBeNull();
  });
});

describe("found log", () => {
  it("lists the goods, parts, fuel and supplies a search turn found", () => {
    const w = emptyWorld();
    const e: GameEvent = { t: "found", vehicle: w.player.vehicleId, stock: "rich", goods: { scrap: 3 }, parts: ["mg"], fuel: 2, supplies: 1 };

    expect(logEn(w, e)).toEqual({ text: `Found Scrap metal ×3, ${en(partName("mg"))}, ${fuelLiters(2)} L of fuel and 1 supply.`, cls: "good" });
  });
});

describe("saleEstimate", () => {
  it("words a loss per unit against the average cost", () => {
    const e = saleEstimate(11, 1200, 2000);
    expect(e).toEqual({ kind: "loss", perUnit: 800, avgCost: 2000 });
    expect(en(estimateText(e))).toBe("\u22128");
    expect(en(estimateTitle(e))).toBe("Avg cost 20 M's");
  });

  it("words a gain", () => {
    expect(en(estimateText(saleEstimate(1, 3800, 500)))).toBe("+33");
  });

  it("calls a rounded zero even, never -0", () => {
    for (const basis of [3700, 3700.4]) {
      const e = saleEstimate(2, 3700, basis);
      expect(e.kind).toBe("even");
      expect(en(estimateText(e))).toBe("0");
    }
  });

  it("says when no cost is on record", () => {
    const e = saleEstimate(1, 42, undefined);
    expect(en(estimateText(e))).toBe("?");
    expect(en(estimateTitle(e))).toBe("No cost on record");
  });

  it("has nothing to say when nothing is held", () => {
    const e = saleEstimate(0, 37, 45);
    expect(e.kind).toBe("none");
    expect(estimateText(e)).toBeNull();
  });

  it("keeps multi-digit values whole", () => {
    expect(en(estimateText(saleEstimate(12, 98700, 123400)))).toBe("\u2212247");
  });

  it("only ever gives a signed number, ? or nothing", () => {
    for (const e of [saleEstimate(11, 3700, 4500), saleEstimate(3, 3700, 3000), saleEstimate(2, 3700, 3700), saleEstimate(2, 3700, undefined), saleEstimate(0, 3700, 100)]) {
      expect(en(estimateText(e)) ?? "").toMatch(/^([+\u2212]\d[\d,]*|0|\?|)$/);
    }
  });

  it("fails loud on impossible input", () => {
    expect(() => saleEstimate(-1, 37, 45)).toThrow();
    expect(() => saleEstimate(1.5, 37, 45)).toThrow();
    expect(() => saleEstimate(1, NaN, 45)).toThrow();
    expect(() => saleEstimate(1, 37, -1)).toThrow();
    expect(() => saleEstimate(1, 37, Infinity)).toThrow();
  });
});

describe("goods table words", () => {
  it("has terse column heads", () => {
    expect(Object.fromEntries(Object.entries(GOODS_COLUMNS).map(([k, v]) => [k, en(v)]))).toEqual({ good: "Good", theirs: "Theirs", buy: "Buy", sell: "Sell", stock: "Stock", held: "Held", profit: "Profit/crate" });
  });

  it("explains the profit head in a hover title without turns", () => {
    expect(en(PROFIT_HEAD_TITLE)).toContain("Per unit");
    expect(en(PROFIT_HEAD_TITLE)).toContain("average cost");
    expect(en(PROFIT_HEAD_TITLE)).toContain("usual value");
    expect(en(PROFIT_HEAD_TITLE)).not.toMatch(/turn/i);
  });

  it("words lot totals", () => {
    expect(en(lotTitle("buy", 5, 180))).toBe("Buy 5 for 2 M's total");
    expect(en(lotTitle("sell", 11, 31200))).toBe("Sell all 11 for 312 M's total");
  });
});

describe("wake-up log", () => {
  it("says an NPC regains consciousness, so the line does not read as cut off", () => {
    const w = emptyWorld();
    const npc = addVehicle(w, "independent", "scout", ["stockEngine"], { x: 40, y: 30 });
    const line = eventText(w, { t: "npcWake", vehicle: npc.id });
    expect(en(line?.text)).toBe(`${en(vehicleName(w, npc.id))} regains consciousness`);
    expect(line?.cls).toBe("dim");
  });
});

describe("Fury Road log lines", () => {
  it("tells an outpost arrival with its pay once, and the run's end", () => {
    const w = emptyWorld();

    expect(logEn(w, { t: "outpostReached", milestone: 2, pay: 37000, wrecks: 3 })).toEqual({ text: "Outpost 2. Paid 370 M's for the road and 3 wrecks.", cls: "good" });
    expect(logEn(w, { t: "outpostReached", milestone: 1, pay: 15000, wrecks: 0 })?.text).toBe("Outpost 1. Paid 150 M's for the road.");
    expect(eventText(w, { t: "money", amount: 15000, reason: { kind: "outpost" } })).toBeNull();
    expect(logEn(w, { t: "runLost", stretch: 3, cause: "wrecked" })?.text).toBe("Your truck is wrecked. The run ends on stretch 3.");
    expect(logEn(w, { t: "runLost", stretch: 2, cause: "abandoned" })?.text).toBe("You end the run on stretch 2.");
  });
});

describe("loot argument log", () => {
  it("tells how an argument between two drivers the player sees ended", () => {
    const w = emptyWorld();
    const warner = addVehicle(w, "scrapjaw", "scout", ["stockEngine"], { x: 32, y: 30 });
    const looter = addVehicle(w, "independent", "scout", ["stockEngine"], { x: 33, y: 30 });
    const [a, b] = [en(vehicleName(w, warner.id)), en(vehicleName(w, looter.id))];
    const argument = (end: "yielded" | "backedOff" | "fight", place: "wreck" | "truck" = "wreck"): GameEvent => ({ t: "lootArgument", warner: warner.id, looter: looter.id, place, end });
    const said = (event: GameEvent) => {
      const line = eventText(w, event)!;
      return { text: en(line.text), cls: line.cls };
    };
    expect(said(argument("yielded"))).toEqual({ text: `${a} warns ${b} off the wreck. ${b} rolls on.`, cls: "dim" });
    expect(said(argument("backedOff", "truck")).text).toBe(`${a} warns ${b} off the truck. ${b} stays put, and ${a} rolls on.`);
    expect(said(argument("fight"))).toEqual({ text: `${a} warns ${b} off the wreck. They fight over it.`, cls: "bad" });
  });

  it("logs nothing when the player notices neither driver", () => {
    const w = emptyWorld();
    const warner = addVehicle(w, "scrapjaw", "scout", ["stockEngine"], { x: 230, y: 230 });
    const looter = addVehicle(w, "independent", "scout", ["stockEngine"], { x: 231, y: 230 });
    expect(eventText(w, { t: "lootArgument", warner: warner.id, looter: looter.id, place: "pile", end: "yielded" })).toBeNull();
  });
});

describe("a finished search in the log", () => {
  it("logs one line, the search line, and keeps the job line for other work", () => {
    const w = emptyWorld();
    const me = w.player.vehicleId;
    const search: Job = { kind: "search", stockId: "opening-wreck", turnsLeft: 0, total: 2 };
    const repair: Job = { kind: "repair", partId: mountedParts(w.vehicles[0])[0].id, parts: 1, turnsLeft: 0, total: 2 };
    expect(eventText(w, { t: "job", vehicle: me, job: search, outcome: "done" })).toBeNull();
    expect(logEn(w, { t: "searched", stock: "opening-wreck" })?.text).toBe("Search done.");
    expect(eventText(w, { t: "job", vehicle: me, job: repair, outcome: "done" })).not.toBeNull();
  });
});

describe("the discovery line", () => {
  it("is cut for a Fury Road outpost, whose label and pay line already name it", () => {
    expect(eventText(emptyWorld(), { t: "discover", location: "outpost-1" })).toBeNull();
    expect(eventText(emptyWorld(), { t: "discover", location: "outpost-12" })).toBeNull();
  });

  it("still names a Roaming site", () => {
    const site = REGION.towns[0].id;
    const line = eventText(emptyWorld(), { t: "discover", location: site })!;

    expect(resolve(line.text, "en")).toBe(`Discovered ${resolve(siteName(site), "en")}`);
  });
});

describe("site event log lines", () => {
  const surge: GameEvent = { t: "siteEvent", shop: "pump-station", kind: "surge", recipe: "pump" };

  it("tell nothing while production is hidden", () => {
    resetSeeAll();
    expect(eventText(emptyWorld(), surge)).toBeNull();
  });

  it("tell a surge under see all", () => {
    resetSeeAll();
    toggleSeeAll();
    expect(logEn(emptyWorld(), surge)?.text).toBe(`${en(siteName("pump-station"))} turns out extra fuel drums today.`);
    resetSeeAll();
  });
});

describe("standing numbers", () => {
  it("prints a real minus and a plus on gains", () => {
    expect(en(standingNum(-30))).toBe("−30");
    expect(en(standingNum(5))).toBe("5");
    expect(en(standingStep(5))).toBe("+5");
    expect(en(standingStep(-20))).toBe("−20");
    expect(en(standingStep(0))).toBe("0");
  });
});

describe("survey contract text", () => {
  const [first, second] = surveySites(TEST_MAP);
  const survey = (done: boolean[]): Extract<Contract, { kind: "survey" }> => ({
    id: "c3", shop: "bowl", kind: "survey", reward: 3000, deadline: 100, window: 100, tier: 1,
    points: [first, second].slice(0, done.length).map((site, i) => ({ site: site.id, found: done[i], done: done[i] })),
  });

  it("names the kinds of place to survey", () => {
    expect(en(contractSummary(survey([false, false])))).toMatch(/^Survey /);
    expect(en(contractSummary(survey([false])))).toContain(en(t(`contract.place.${first.type}`)));
  });

  it("reads a met survey as ready to report", () => {
    const met = survey([true, true]);
    expect(en(contractSummary(met))).toBe("Survey done, report at Bowl");
    expect(en(heldContractDue(met))).toBe("Ready");
  });


  it("counts the sites done and tells the clue of the first place left", () => {
    const c = survey([true, false]);
    expect(en(surveyProgress(c))).toBe("1 of 2 surveyed");
    expect(en(surveyPlacesLeft(c))).toBe(`1 place left: ${en(t(`contract.place.${second.type}`))}`);
    expect(en(surveyPlacesLeft(survey([false, false])))).toBe(`2 places left: ${en(t(`contract.place.${first.type}`))}, ${en(t(`contract.place.${second.type}`))}`);
    const other = surveySites(TEST_MAP).find((site) => site.type !== first.type)!;
    const mixed = { ...c, points: [{ site: first.id, found: true, done: true }, { site: second.id, found: true, done: false }, { site: other.id, found: false, done: false }] };
    expect(en(surveyPlacesLeft(mixed))).toBe(`2 places left: ${en(t(`contract.place.${second.type}`))}, ${en(t(`contract.place.${other.type}`))}`);
    expect(resolve(surveyPlacesLeft(mixed), "ru")).toBe(`Осталось 2 места: ${resolve(t(`contract.place.${second.type}`), "ru").toLowerCase()}, ${resolve(t(`contract.place.${other.type}`), "ru").toLowerCase()}`);
  });

  it("shows every open place with its kind and found state", () => {
    vi.stubGlobal("document", {
      createElement: () => new TextNode(),
      createTextNode: (value: string) => Object.assign(new TextNode(), { children: [value] }),
    });
    try {
      const sites = surveySites(TEST_MAP);
      const third = sites.find((site) => site.type !== first.type) ?? sites[2];
      const c: Extract<Contract, { kind: "survey" }> = {
        ...survey([false, false]),
        points: [{ site: first.id, found: true, done: true }, { site: second.id, found: true, done: false }, { site: third.id, found: false, done: false }],
      };
      const lines = surveyClueLines(c) as unknown as TextNode[];
      expect(lines).toHaveLength(2);
      expect(lines[0].text()).toMatch(new RegExp(`^${en(t(`contract.placeName.${second.type}`))}:`));
      expect(lines[0].text()).toContain(`: square ${en(gridSquareText(gridSquareOf(second.pos)))}, `);
      expect(lines[0].all("tag").map((node) => node.text())).toEqual(["found"]);
      expect(lines[1].text()).toMatch(new RegExp(`^${en(t(`contract.placeName.${third.type}`))}:`));
      expect(lines[1].all("tag")).toHaveLength(0);
      expect(surveyClueLines({ ...c, points: c.points.map((point) => ({ ...point, done: true })) })).toEqual([]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("uses Russian cases and agreement for every survey place", () => {
    const forms = {
      homestead: ["хутор", "Хутор разведан"],
      hamlet: ["деревню", "Деревня разведана"],
      lookout: ["вышку", "Вышка разведана"],
      hulks: ["танковые остовы", "Танковые остовы разведаны"],
    } as const;
    const w = emptyWorld();
    for (const [type, [accusative, surveyed]] of Object.entries(forms)) {
      const site = surveySites(TEST_MAP).find((item) => item.type === type);
      if (!site) continue;
      const job: Job = { kind: "survey", contractId: "c3", site: site.id, turnsLeft: 10, total: 10 };
      expect(resolve(jobLabel(w, w.vehicles[0], job), "ru")).toBe(`Разведать ${accusative}`);
      const c: Extract<Contract, { kind: "survey" }> = { ...survey([true]), points: [{ site: site.id, found: true, done: true }] };
      expect(resolve(eventText(w, { t: "contract", contract: c, outcome: "surveyed", site: site.id })!.text, "ru")).toBe(`${surveyed}, 1 из 1`);
    }
  });

  it("tells a clue as a named place, a compass word, a distance in hundreds of meters and the lay", () => {
    const clue = { type: "homestead", landmark: "pump-station", rad: -Math.PI / 4, tiles: 100, lay: "hollow", square: { column: 2, row: 3 } } as const;
    expect(en(surveyClueText(clue))).toBe("Lies in square C4, north-east of Pump Station, about 400 m out, in a hollow");
    expect(en(surveyClueText({ ...clue, lay: "rise", rad: Math.PI, tiles: 275 }))).toBe("Lies in square C4, west of Pump Station, about 1.1 km out, on high ground");
    expect(en(surveyClueText({ ...clue, lay: "flat", rad: Math.PI / 2, tiles: 25, square: { column: 7, row: 0 } }))).toBe("Lies in square H1, south of Pump Station, about 100 m out, on flat ground");
  });

  it("names a map grid square by its column letter and row number, with the Russian letters in Russian", () => {
    expect(en(gridSquareText({ column: 2, row: 3 }))).toBe("C4");
    expect(resolve(gridSquareText({ column: 2, row: 3 }), "ru")).toBe("В4");
    expect(resolve(gridSquareText({ column: 7, row: 7 }), "ru")).toBe("З8");
    expect(en(gridColumnLetter(0))).toBe("A");
  });

  it("refuses a grid column or row off the grid", () => {
    expect(() => gridColumnLetter(MAP_GRID.squares)).toThrow(/no letter/);
    expect(() => gridColumnLetter(-1)).toThrow(/no letter/);
    expect(() => gridRowNumber(MAP_GRID.squares)).toThrow(/no number/);
  });

  it("gives every grid column its own single letter in each language", () => {
    for (const locale of ["en", "ru"] as const) {
      const letters = Array.from({ length: MAP_GRID.squares }, (_, k) => resolve(gridColumnLetter(k), locale));
      expect(new Set(letters).size, locale).toBe(MAP_GRID.squares);
      for (const letter of letters) expect(letter, locale).toMatch(/^\p{Lu}$/u);
    }
  });

  it("tells the posting shop's way to a place, with the look and lay and the found tag last", () => {
    const c: Extract<Contract, { kind: "survey" }> = { ...survey([false]), shop: "bowl", points: [{ site: "survey-ruin-88", found: true, done: false }] };
    vi.stubGlobal("document", {
      createElement: () => new TextNode(),
      createTextNode: (value: string) => Object.assign(new TextNode(), { children: [value] }),
    });
    const line = surveyWayLine(emptyWorld(), c, c.points[0]) as unknown as TextNode;
    expect(line.className).toBe("contract-clue");
    expect(line.text()).toBe("Hamlet in square H3, from Bowl: Leave by the east gate. Take the road to Nose, heading north-east. It's a long haul. At Nose, leave the road and head east, a fair way. A cluster of ruined houses on flat ground. found");
    vi.unstubAllGlobals();
    expect(line.all("tag").at(-1)?.text()).toBe("found");
    expect(en(surveyWayText(emptyWorld(), c, c.points[0]))).toBe("From Bowl: Leave by the east gate. Take the road to Nose, heading north-east. It's a long haul. At Nose, leave the road and head east, a fair way. It lies in square H3, on flat ground.");
  });

  it("keeps the compass clue when no full way can be told", () => {
    const c: Extract<Contract, { kind: "survey" }> = { ...survey([false]), shop: "nose", points: [{ site: "survey-skiff-6067", found: false, done: false }] };
    const w = emptyWorld();
    expect(en(surveyWayText(w, c, c.points[0]))).toBe(en(surveyClueText(surveyClue(c, c.points[0]))));
    vi.stubGlobal("document", {
      createElement: () => new TextNode(),
      createTextNode: (value: string) => Object.assign(new TextNode(), { children: [value] }),
    });
    expect((surveyWayLine(w, c, c.points[0]) as unknown as TextNode).text()).toBe((surveyClueLines(c)[0] as unknown as TextNode).text());
    vi.unstubAllGlobals();
  });

  it("tells the same clue wherever the truck is", () => {
    const c = survey([false, false]);
    const w = emptyWorld();
    const told = en(surveyClueText(surveyClue(c, c.points[0])));
    for (const pos of [first.pos, second.pos, { x: 30, y: 30 }]) {
      w.vehicles[0].pos = { ...pos };
      expect(en(surveyClueText(surveyClue(c, c.points[0])))).toBe(told);
    }
    expect(told).not.toMatch(/^(east|west|north|south)/);
  });

  it("raises a found place and a met survey to a toast, and keeps a surveyed site to the log", () => {
    const c = survey([true, false]);
    expect(isNotable({ t: "contract", contract: c, outcome: "found", site: first.id })).toBe(true);
    expect(isNotable({ t: "contract", contract: survey([true, true]), outcome: "fulfilled" })).toBe(true);
    expect(isNotable({ t: "contract", contract: c, outcome: "surveyed", site: first.id })).toBe(false);
    expect(isNotable({ t: "contract", contract: c, outcome: "accepted" })).toBe(false);
    expect(isNotable({ t: "guardEnded", merc: "guard", end: "dismissed" })).toBe(true);
  });

  it("logs a found place by its kind and the shop that asked", () => {
    const c = survey([false, false]);
    const found = eventText(emptyWorld(), { t: "contract", contract: c, outcome: "found", site: first.id })!;
    expect(en(found.text)).toBe(`This is the ${en(t(`contract.place.${first.type}`))} Bowl asked about.`);
    expect(found.cls).toBe("good");
  });

  it("logs a surveyed site and a met survey", () => {
    const c = survey([true, false]);
    expect(en(eventText(emptyWorld(), { t: "contract", contract: c, outcome: "surveyed", site: first.id })!.text)).toBe(`${en(t(`contract.placeName.${first.type}`))} surveyed, 1 of 2`);
    const met = survey([true, true]);
    expect(en(eventText(emptyWorld(), { t: "contract", contract: met, outcome: "fulfilled" })!.text)).toContain("report at Bowl");
  });

  it("names a survey job's place and logs completion only once", () => {
    const w = emptyWorld();
    const job: Job = { kind: "survey", contractId: "c3", site: first.id, turnsLeft: 10, total: 10 };
    expect(en(jobLabel(w, w.vehicles[0], job))).toBe(`Survey the ${en(t(`contract.place.${first.type}`))}`);
    expect(eventText(w, { t: "job", vehicle: w.player.vehicleId, job, outcome: "done" })).toBeNull();
    expect(en(eventText(w, { t: "job", vehicle: w.player.vehicleId, job, outcome: "started" })!.text)).toContain(`Survey the ${en(t(`contract.place.${first.type}`))}`);
  });
});
