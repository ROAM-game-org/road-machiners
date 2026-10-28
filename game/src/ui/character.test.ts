import { afterEach, describe, expect, it, vi } from "vitest";
import { XP_RULES } from "../data/skills";
import { emptyWorld } from "../sim/testkit";
import type { QuestLive, World } from "../sim/types";
import { CharacterScreen } from "./character";
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
  addEventListener() {}
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

function openCharacter(world: World): FakeNode {
  const { screen, root } = characterScreen(world);
  screen.toggle();
  return root;
}

const pressedTab = (root: FakeNode) => root.all((n) => n.tag === "button" && n.attrs.get("data-tab") !== undefined && n.className === "on").map((n) => n.attrs.get("data-tab"));

const rankButtons = (root: FakeNode) => root.all((n) => n.className.includes("buy-rank"));

describe("character screen", () => {
  afterEach(() => {
    ui.children = [];
    vi.unstubAllGlobals();
  });

  it("opens the map as a tab beside the skills, and the same key closes it", () => {
    const { screen, root } = characterScreen(emptyWorld());
    screen.toggle("map");
    expect(pressedTab(root)).toEqual(["map"]);
    expect(root.all((n) => n.className.includes("map-tab"))).toHaveLength(1);
    expect(rankButtons(root)).toHaveLength(0);
    expect(root.all((n) => n.className === "close")[0].text()).toBe("Close [M]");
    screen.toggle("skills");
    expect(screen.isOpen()).toBe(true);
    expect(pressedTab(root)).toEqual(["skills"]);
    expect(root.all((n) => n.className.includes("map-tab"))).toHaveLength(0);
    expect(rankButtons(root).length).toBeGreaterThan(0);
    screen.toggle("skills");
    expect(screen.isOpen()).toBe(false);
  });

  it("gives a disabled rank button its reason", () => {
    const root = openCharacter(emptyWorld());
    const button = rankButtons(root)[0];
    expect(button.attrs.get("aria-disabled")).toBe("true");
    expect(button.attrs.get("data-reason")).toMatch(/XP/);
  });

  it("prints a rank price as one plain phrase", () => {
    const world = emptyWorld();
    world.player.xp = 1000;
    const button = rankButtons(openCharacter(world))[0];
    expect(button.text()).toMatch(/^Buy \d+ XP$/);
    expect(button.attrs.has("aria-disabled")).toBe(false);
  });

  it("has one row per skill and says today and the cap once", () => {
    const root = openCharacter(emptyWorld());
    expect(root.all((n) => n.className.includes("skill-row"))).toHaveLength(5);
    expect(root.text().match(/Today/g)).toHaveLength(1);
    expect(root.text()).toContain(`max ${XP_RULES.dailyCap} XP`);
    expect(root.all((n) => n.className === "skill-name")[0].attrs.get("title")).toMatch(/^Earns XP from /);
  });

  it("marks a row with an open perk pair and shows both perks as buttons", () => {
    const world = emptyWorld();
    world.player.ranks.driving = 2;
    const root = openCharacter(world);
    const pending = root.all((n) => n.className.includes("pending"));
    expect(pending).toHaveLength(1);
    expect(pending[0].all((n) => n.tag === "button" && n.className.includes("perk"))).toHaveLength(2);
  });

  it("blocks a perk pick while knocked out and says why", () => {
    const world = emptyWorld();
    world.player.ranks.driving = 2;
    world.player.state = "knockedOut";
    const perk = openCharacter(world).all((n) => n.tag === "button" && n.className === "perk")[0];
    expect(perk.attrs.get("aria-disabled")).toBe("true");
    expect(perk.attrs.get("data-reason")).toBe("Knocked out");
  });

  it("prints the XP pool as a number and a unit", () => {
    const world = emptyWorld();
    world.player.xp = 300.7;
    expect(openCharacter(world).all((n) => n.className.includes("xp-pool"))[0].text()).toBe("300 XP");
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
  it("lists each faction on fixed columns with the score and a breakdown that adds up to it", () => {
    const world = emptyWorld();
    world.player.standing.bowl = -30;
    const rows = openCharacter(world).all((n) => n.className.split(" ").includes("standing-row"));
    const cell = (r: FakeNode, i: number): FakeNode => r.children[i] as FakeNode;
    expect(rows.map((r) => cell(r, 0).text())).toEqual(["Bowl", "Nose", "Guidestar Guild", "Scrapjaw", "Kiln", "Sunward", "Marshalls"]);
    const score = cell(rows[0], 1);
    expect(score.className).toContain("standing-score");
    expect(score.text()).toContain("−30");
    expect(cell(rows[0], 2).text()).toBe("wary");
    expect(cell(rows[0], 2).className).toBe("tag dim");
    const tipRows = score.all((n) => n.className.split(" ").includes("tooltip-row"));
    expect(tipRows.map((r) => r.text())).toHaveLength(2);
    expect(tipRows[0].className).toContain("base");
    expect(tipRows[0].text()).toContain("Base");
    const sum = tipRows.map((r) => Number((r.text().match(/[+−]?\d+$/) as RegExpMatchArray)[0].replace("−", "-"))).reduce((a, b) => a + b, 0);
    expect(sum).toBe(-30);
    const head = openCharacter(world).all((n) => n.className === "standing-head")[0];
    expect(head.attrs.get("title")).toBeUndefined();
  });
  it("lists one tooltip row per kind of recent deed, and the rows add up to the score", () => {
    const world = emptyWorld();
    const deed = (id: string, kind: "attacked" | "robbed", delta: number) => ({ subject: id, faction: "bowl" as const, deed: kind, delta, turn: 0 });
    world.player.deeds.push(deed("a", "attacked", -15), deed("b", "robbed", -20), deed("c", "attacked", -15));
    world.player.standing.bowl = 5 - 50 + 7;
    const rows = openCharacter(world).all((n) => n.className.split(" ").includes("standing-row"));
    const tipRows = (rows[0].children[1] as FakeNode).all((n) => n.className.split(" ").includes("tooltip-row"));
    expect(tipRows.map((r) => r.text().replace(/[+−\d]+$/, "").trim())).toEqual(["Base", "Attacked", "Robbed", "Earlier deeds and time"]);
    const values = tipRows.map((r) => Number((r.text().match(/[+−]?\d+$/) as RegExpMatchArray)[0].replace("−", "-")));
    expect(values.slice(1, 3)).toEqual([-30, -20]);
    expect(values.reduce((a, b) => a + b, 0)).toBe(-38);
  });
  it("hides the standing list on Chaos Highway", () => {
    const world = emptyWorld();
    world.setup = { ...world.setup, mode: "chaosHighway" };
    expect(openCharacter(world).all((n) => n.className.split(" ").includes("standing-row"))).toEqual([]);
  });

  it("has a Map tab in Roaming and none on Chaos Highway", () => {
    const world = emptyWorld();
    const roaming = openCharacter(world).all((n) => n.tag === "button" && n.text() === "Map").length;
    world.setup = { ...world.setup, mode: "chaosHighway" };
    ui.children = [];
    expect(roaming).toBe(1);
    expect(openCharacter(world).all((n) => n.tag === "button" && n.text() === "Map")).toEqual([]);
  });

  it("turns buying a rank and picking a perk off during a scene, with the reason", () => {
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
    const perk = openCharacter(world).all((n) => n.tag === "button" && n.className === "perk")[0];
    expect(perk.attrs.get("aria-disabled")).toBe("true");
    expect(perk.attrs.get("data-reason")).toBe("Not during a scene");
  });
});
