import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_RANK } from "../data/skills";
import { emptyWorld } from "../sim/testkit";
import type { QuestLive, World } from "../sim/types";
import { CharacterScreen, type CharacterTab } from "./character";
import { truckChips } from "./inventory";

class FakeNode {
  className = "";
  innerHTML = "";
  style = { display: "" };
  classList = {
    add: (c: string) => { this.className += ` ${c}`; },
    remove: (c: string) => { this.className = this.className.split(" ").filter((k) => k !== c).join(" "); },
    toggle: (c: string, on: boolean) => (on ? this.classList.add(c) : this.classList.remove(c)),
  };
  children: (FakeNode | string)[] = [];
  attrs = new Map<string, string>();
  constructor(readonly tag: string) {}
  append(...c: (FakeNode | string)[]) { this.children.push(...c); }
  replaceChildren(...c: (FakeNode | string)[]) { this.children = c; }
  setAttribute(k: string, v: string) { this.attrs.set(k, v); }
  removeAttribute(k: string) { this.attrs.delete(k); }
  listeners = new Map<string, () => void>();
  addEventListener(kind: string, run: () => void) { this.listeners.set(kind, run); }
  getContext() { return null; }
  text(): string { return this.children.map((c) => (typeof c === "string" ? c : c.text())).join(""); }
  all(pred: (n: FakeNode) => boolean): FakeNode[] {
    const here = pred(this) ? [this] : [];
    return [...here, ...this.children.flatMap((c) => (typeof c === "string" ? [] : c.all(pred)))];
  }
}

const SCENE: QuestLive = { quest: "bowl_hattie", lang: "en", ink: "{}", lines: [], choices: [], costs: [], checks: [] };

const ui = new FakeNode("div");

function stubDom(): void {
  vi.stubGlobal("document", { createElement: (t: string) => new FakeNode(t), createTextNode: (text: string) => Object.assign(new FakeNode("#text"), { children: [text] }), getElementById: () => ui });
  vi.stubGlobal("window", { addEventListener: () => {}, devicePixelRatio: 1 });
  vi.stubGlobal("ResizeObserver", class { observe() {} });
}

function characterScreen(world: World): { screen: CharacterScreen; root: FakeNode } {
  stubDom();
  const screen = new CharacterScreen({ world: () => world, apply: () => {}, announce: () => {} } as never);
  return { screen, root: ui.children[ui.children.length - 1] as FakeNode };
}

function openCharacter(world: World, tab: CharacterTab = "skills"): FakeNode {
  const { screen, root } = characterScreen(world);
  screen.toggle(tab);
  return root;
}

const classed = (name: string) => (n: FakeNode) => n.className.split(" ").includes(name);
const pressedTab = (root: FakeNode) => root.all((n) => n.tag === "button" && n.attrs.get("data-tab") !== undefined && n.className === "on").map((n) => n.attrs.get("data-tab"));
const rankButtons = (root: FakeNode) => root.all(classed("buy-rank"));
const pickButtons = (root: FakeNode) => root.all(classed("pick-perk"));
const rankRows = (root: FakeNode) => root.all(classed("rank-row"));
const effectTexts = (root: FakeNode) => root.all(classed("effect-cell")).map((c) => c.children.map((k) => (k as FakeNode).text()));

describe("character screen", () => {
  afterEach(() => {
    ui.children = [];
    vi.unstubAllGlobals();
  });

  it("opens the map as a tab beside the skills, and the same key closes it", () => {
    const { screen, root } = characterScreen(emptyWorld());
    screen.toggle("map");
    expect(pressedTab(root)).toEqual(["map"]);
    expect(root.all(classed("map-tab"))).toHaveLength(1);
    expect(rankButtons(root)).toHaveLength(0);
    expect(root.all((n) => n.className === "close")[0].text()).toBe("Close [M]");
    screen.toggle("skills");
    expect(screen.isOpen()).toBe(true);
    expect(pressedTab(root)).toEqual(["skills"]);
    expect(root.all(classed("map-tab"))).toHaveLength(0);
    expect(rankButtons(root)).toHaveLength(1);
    screen.toggle("skills");
    expect(screen.isOpen()).toBe(false);
  });

  it("gives a disabled rank button its reason", () => {
    const button = rankButtons(openCharacter(emptyWorld()))[0];
    expect(button.attrs.get("aria-disabled")).toBe("true");
    expect(button.attrs.get("data-reason")).toMatch(/XP/);
  });

  it("puts one verb on the rank button and its cost beside it", () => {
    const world = emptyWorld();
    world.player.xp = 1000;
    const root = openCharacter(world);
    const next = rankRows(root).find(classed("next"))!;
    expect(rankButtons(root)[0].text()).toBe("Buy");
    expect(rankButtons(root)[0].attrs.has("aria-disabled")).toBe(false);
    expect(next.all(classed("rank-cost"))[0].text()).toBe("200 XP");
  });

  it("has a tab per skill with its next rank cost, and none on a maxed skill", () => {
    const world = emptyWorld();
    world.player.ranks.social = MAX_RANK;
    const tabs = openCharacter(world).all(classed("skill-tab"));
    expect(tabs.map((tab) => tab.attrs.get("data-skill"))).toEqual(["driving", "perception", "machining", "toughness", "social"]);
    expect(tabs[0].all(classed("skill-tab-cost"))[0].text()).toBe("200 XP");
    expect(tabs[4].all(classed("skill-tab-cost"))).toHaveLength(0);
    expect(tabs[0].attrs.get("title")).toMatch(/^Earns XP from /);
  });

  it("shows a row for every rank, with the gains only on the rank to buy", () => {
    const world = emptyWorld();
    world.player.ranks.driving = 2;
    world.player.perks.push("rammer");
    const root = openCharacter(world);
    expect(rankRows(root).map((r) => r.className.split(" ")[1])).toEqual(["owned", "owned", "next", "locked", "locked"]);
    expect(root.all(classed("rank-gains"))).toHaveLength(1);
    expect(rankRows(root)[2].all(classed("rank-gains"))[0].text()).toBe("+10%−10%−10%+10%");
  });

  it("prints effect totals with the direction they move and real bases for share effects", () => {
    const world = emptyWorld();
    world.player.ranks.machining = 3;
    world.player.perks.push("welder");
    expect(effectTexts(openSkill(world, "machining"))).toEqual([
      ["Repair time and price", "−30%"],
      ["Field repair cap", "82%"],
      ["Refit time", "−24%"],
      ["Search time", "−24%"],
      ["Engine heat", "−24%"],
    ]);
  });

  it("shows the market price gap at its base of 40% before any Social rank, and its gain in points", () => {
    const world = emptyWorld();
    world.player.ranks.driving = 1;
    world.player.ranks.perception = 1;
    world.player.ranks.machining = 1;
    world.player.ranks.toughness = 1;
    const root = openSkill(world, "social");
    expect(effectTexts(root)[0]).toEqual(["Price gap", "40%"]);
    expect(effectTexts(root)[1]).toEqual(["Tow fees", "0%"]);
    expect(root.all(classed("rank-gains"))[0].children.map((c) => (c as FakeNode).text())[0]).toBe("−4 pts");
  });

  it("opens on a skill with a perk to pick, tags its tab and offers both perks", () => {
    const world = emptyWorld();
    world.player.ranks.perception = 2;
    const root = openCharacter(world);
    expect(root.all((n) => classed("skill-tab")(n) && classed("on")(n))[0].attrs.get("data-skill")).toBe("perception");
    expect(root.all(classed("pick-tag"))).toHaveLength(1);
    expect(pickButtons(root)).toHaveLength(2);
  });

  it("marks the taken perk and the passed one once a pick is made", () => {
    const world = emptyWorld();
    world.player.ranks.machining = 2;
    world.player.perks.push("welder");
    const root = openSkill(world, "machining");
    const card = (id: string) => root.all((n) => n.attrs.get("data-perk") === id)[0];
    expect(card("welder").className).toBe("perk-card taken");
    expect(card("teardown").className).toBe("perk-card passed");
    expect(pickButtons(root)).toHaveLength(0);
  });

  it("blocks a perk pick while knocked out and says why", () => {
    const world = emptyWorld();
    world.player.ranks.driving = 2;
    world.player.state = "knockedOut";
    const perk = pickButtons(openCharacter(world))[0];
    expect(perk.attrs.get("aria-disabled")).toBe("true");
    expect(perk.attrs.get("data-reason")).toBe("Knocked out");
  });

  it("prints the XP pool as a whole number", () => {
    const world = emptyWorld();
    world.player.xp = 300.7;
    const xp = openCharacter(world).all(classed("char-pool-row")).find(classed("xp"))!;
    expect(xp.text()).toBe("XP300");
  });

  it("lists each faction with its score, its band and a breakdown that adds up to it", () => {
    const world = emptyWorld();
    world.player.standing.bowl = -30;
    const rows = openCharacter(world, "standing").all(classed("standing-row"));
    const cell = (r: FakeNode, i: number): FakeNode => r.children[i] as FakeNode;
    expect(rows.map((r) => cell(r, 0).text())).toEqual(["Bowl", "Nose", "Guidestar Guild", "Scrapjaw", "Kiln", "Sunward", "Marshalls"]);
    const score = cell(rows[0], 1);
    expect(score.className).toContain("explained");
    expect(score.text()).toContain("−30");
    expect(cell(rows[0], 2).text()).toBe("wary");
    const tipRows = score.all(classed("tooltip-row"));
    expect(tipRows).toHaveLength(2);
    expect(tipRows[0].text()).toContain("Base");
    const sum = tipRows.map((r) => Number((r.text().match(/[+−]?\d+$/) as RegExpMatchArray)[0].replace("−", "-"))).reduce((a, b) => a + b, 0);
    expect(sum).toBe(-30);
  });

  it("gives a score with nothing to explain no breakdown", () => {
    const rows = openCharacter(emptyWorld(), "standing").all(classed("standing-row"));
    expect(rows.every((r) => !(r.children[1] as FakeNode).className.includes("explained"))).toBe(true);
    expect(rows.flatMap((r) => r.all(classed("tooltip")))).toEqual([]);
  });

  it("lists one tooltip row per kind of recent deed, and the rows add up to the score", () => {
    const world = emptyWorld();
    const deed = (id: string, kind: "attacked" | "robbed", delta: number) => ({ subject: id, faction: "bowl" as const, deed: kind, delta, turn: 0 });
    world.player.deeds.push(deed("a", "attacked", -15), deed("b", "robbed", -20), deed("c", "attacked", -15));
    world.player.standing.bowl = 5 - 50 + 7;
    const rows = openCharacter(world, "standing").all(classed("standing-row"));
    const tipRows = (rows[0].children[1] as FakeNode).all(classed("tooltip-row"));
    expect(tipRows.map((r) => r.text().replace(/[+−\d]+$/, "").trim())).toEqual(["Base", "Attacked", "Robbed", "Earlier deeds and time"]);
    const values = tipRows.map((r) => Number((r.text().match(/[+−]?\d+$/) as RegExpMatchArray)[0].replace("−", "-")));
    expect(values.slice(1, 3)).toEqual([-30, -20]);
    expect(values.reduce((a, b) => a + b, 0)).toBe(-38);
  });

  it("offers Standing and Map in Roaming and neither on Chaos Highway", () => {
    const world = emptyWorld();
    const tabs = (root: FakeNode) => root.all((n) => n.attrs.get("data-tab") !== undefined).map((n) => n.attrs.get("data-tab"));
    expect(tabs(openCharacter(world))).toEqual(["skills", "standing", "map"]);
    world.setup = { ...world.setup, mode: "chaosHighway" };
    ui.children = [];
    const highway = openCharacter(world, "standing");
    expect(tabs(highway)).toEqual(["skills"]);
    expect(highway.all(classed("standing-row"))).toEqual([]);
  });

  it("turns buying a rank off during a scene, with the reason", () => {
    const world = emptyWorld();
    world.player.xp = 1000;
    world.player.quests.live = SCENE;
    const buy = rankButtons(openCharacter(world))[0];
    expect(buy.attrs.get("aria-disabled")).toBe("true");
    expect(buy.attrs.get("data-reason")).toBe("Not during a scene");
  });

  it("gives a perk pick the scene reason before any other", () => {
    const world = emptyWorld();
    world.player.ranks.driving = 2;
    world.player.state = "knockedOut";
    world.player.quests.live = SCENE;
    const perk = pickButtons(openCharacter(world))[0];
    expect(perk.attrs.get("aria-disabled")).toBe("true");
    expect(perk.attrs.get("data-reason")).toBe("Not during a scene");
  });
});

function openSkill(world: World, skill: string): FakeNode {
  const root = openCharacter(world);
  const click = root.all((n) => n.attrs.get("data-skill") === skill)[0].listeners.get("click");
  if (!click) throw new Error(`The ${skill} tab has no click handler`);
  click();
  return root;
}

describe("truck chips", () => {
  afterEach(() => vi.unstubAllGlobals());

  const chipsOf = (opts?: { feature?: boolean }): FakeNode[] => {
    stubDom();
    return (truckChips(emptyWorld(), opts) as unknown as FakeNode).all((n) => n.className.split(" ").includes("chip"));
  };
  const hasIcon = (chip: FakeNode, name: string) => chip.all((n) => n.className.split(" ").includes(`icon-${name}`)).length > 0;

  it("prints the mass as numbers in the mono class with one kg and the mass icon", () => {
    const mass = chipsOf().find((c) => hasIcon(c, "mass"))!;
    expect(mass.text()).toMatch(/^[\d,]+ \/ [\d,]+ kg$/);
    expect(mass.all((n) => n.className === "num")).toHaveLength(1);
    expect(chipsOf().some((c) => hasIcon(c, "load"))).toBe(false);
  });

  it("keeps the power chip to numbers and icons", () => {
    const power = chipsOf().find((c) => hasIcon(c, "power"))!;
    expect(power.text()).toMatch(/^[\d.]+ \/ [\d.]+(−\d+%)?$/);
    expect(power.text()).not.toMatch(/power|speed/i);
  });

  it("leaves the chassis feature off the chips when asked", () => {
    const withFeature = chipsOf();
    const without = chipsOf({ feature: false });
    expect(without.length).toBe(withFeature.length - 1);
  });

  it("never counts the player's free cells", () => {
    expect(chipsOf().some((c) => hasIcon(c, "cells"))).toBe(false);
  });

  it("keeps words out of the mono class", () => {
    const truck = chipsOf().find((c) => hasIcon(c, "truck"))!;
    expect(truck.all((n) => n.className === "num")).toHaveLength(0);
  });
});

describe("inventory header money", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("prints money as the M's coin and the number", () => {
    stubDom();
    const world = emptyWorld();
    world.player.money = 33;
    const chips = truckChips(world) as unknown as FakeNode;
    const money = chips.all((n) => n.className.split(" ").includes("amount"))[0];
    expect((money.children[0] as FakeNode).className).toBe("coin");
    expect(money.text()).toBe("33");
  });

  it("prints debt as a negative amount in danger ink", () => {
    stubDom();
    const world = emptyWorld();
    world.player.money = -33;
    const chips = truckChips(world) as unknown as FakeNode;
    const money = chips.all((n) => n.className.split(" ").includes("amount"))[0];
    expect(money.className).toContain("bad");
    expect(money.text()).toBe("−33");
  });
});
