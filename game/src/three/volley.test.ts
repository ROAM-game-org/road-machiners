import { describe, expect, it, vi } from "vitest";
import type { Break, Crash, Landing } from "../phys/drive";
import { MIX } from "../data/sounds";
import { RULES } from "../data/rules";
import { addVehicle, emptyWorld } from "../sim/testkit";
import type { GameEvent, ShotRound } from "../sim/types";
import { groundPoint, type V3 } from "../phys/frames";
import { FLARE_LOOK, SHELL } from "./render/hazards";
import { BreakCues, type PartBreak, type ShotLike } from "./breakCues";
import { PARTS } from "../data/parts";
import { projectileOf, type Muzzle } from "./render/projectiles";
import { bodyOf } from "../sim/body";
import { CollisionCues, collisionSteps, fireSteps, scoreEventMs, planShot, playCrashes, playShotFx, playUtilitySounds, playVolley, posesOf, spreadOver, type CombatHost, type Gun, type PlannedRound, type Shot, type TurnPoses, type VolleyHost } from "./volley";

const hit = (a: string, b: string): GameEvent => ({ t: "collision", a, b, impact: 3, hitsA: [], hitsB: [] });
const crash = (a: string, b: string, step: number) => ({ a, b, impact: 5, step }) as Crash;
const smash = (prop: string, vehicle: string, step: number): Break => ({ prop, vehicle, impact: 3, step });
const land = (vehicle: string, step: number): Landing => ({ vehicle, impact: 3, step });
const none = { crashes: [], breaks: [], landings: [] };

describe("scoreEventMs", () => {
  const knockout: GameEvent = { t: "npcKnockout", by: "p" } as GameEvent;

  it("puts a crash on its physics step, or at the move's end when it has none", () => {
    const crashed = hit("a", "b");
    const far = hit("a", "fence1");
    const timed = collisionSteps([crashed, far], { ...none, crashes: [crash("a", "b", 30)] });
    expect(scoreEventMs(crashed, timed, 60, 1500)).toBe(500);
    expect(scoreEventMs(far, timed, 60, 1500)).toBe(1000);
  });

  it("leaves shots to their volleys and puts a knockout where the shots land", () => {
    expect(scoreEventMs({ t: "shot" } as GameEvent, [], 60, 1500)).toBeNull();
    expect(scoreEventMs(knockout, [], 60, 1500)).toBe(1500);
  });
});

describe("collisionSteps", () => {
  it("matches a truck crash by pair in either order", () => {
    const timed = collisionSteps([hit("b", "a")], { ...none, crashes: [crash("a", "b", 12)] });
    expect(timed.map((t) => t.step)).toEqual([12]);
  });

  it("matches a ground crash and a landing of one truck once each", () => {
    const timed = collisionSteps([hit("a", "ground"), hit("a", "ground")], { ...none, crashes: [crash("a", "ground", 30)], landings: [land("a", 20)] });
    expect(timed.map((t) => t.step)).toEqual([30, 20]);
  });

  it("matches a break by prop and truck", () => {
    const timed = collisionSteps([hit("a", "fence1")], { ...none, breaks: [smash("fence1", "a", 7)] });
    expect(timed.map((t) => t.step)).toEqual([7]);
  });

  it("gives a far break no step", () => {
    expect(collisionSteps([hit("a", "fence1")], none).map((t) => t.step)).toEqual([null]);
  });

  it("takes each candidate once", () => {
    const timed = collisionSteps([hit("a", "b"), hit("a", "b")], { ...none, crashes: [crash("a", "b", 4)] });
    expect(timed.map((t) => t.step)).toEqual([4, null]);
  });
});

describe("collisionSteps with claymore blasts", () => {
  const blast = (vehicle: string, other: string): GameEvent => ({ t: "claymore", vehicle, part: "ram", other, pos: { x: 0, y: 0 }, hits: [], selfHits: [] });

  it("times each blast at the step of the crash it follows", () => {
    const timed = collisionSteps([hit("a", "b"), blast("a", "b"), blast("b", "a")], { ...none, crashes: [crash("a", "b", 12)] });
    expect(timed.map((t) => [t.event.t, t.step])).toEqual([["collision", 12], ["claymore", 12], ["claymore", 12]]);
  });

  it("throws on a blast that follows no crash of its trucks", () => {
    expect(() => collisionSteps([hit("a", "c"), blast("a", "b")], { ...none, crashes: [crash("a", "c", 3)] })).toThrow(/follows no crash/);
  });
});

describe("playCrashes with claymore blasts", () => {
  const blast = (other: string): GameEvent => ({ t: "claymore", vehicle: "a", part: "ram", other, pos: { x: 30, y: 30 }, hits: [], selfHits: [] });

  const RAM_AT = { x: 7, y: 2, z: 9 };
  const drawn = (ram: boolean) => new Map([["a", { hasPart: (id: string) => ram && id === "ram", partPoint: () => RAM_AT }]]);

  function played(e: GameEvent, seen: string[], views = drawn(true)): (string | V3)[] {
    const out: (string | V3)[] = [];
    const world = emptyWorld();
    const host = {
      world,
      views,
      fx: { claymoreBlast: (p: V3) => out.push(p), crash: () => out.push("crash") },
      sound: { at: (cue: string) => out.push(cue), atLevel: (cue: string) => out.push(cue) },
      eventPoint: (id: string) => (seen.includes(id) ? { x: 0, y: 0, z: 0 } : null),
    } as unknown as CombatHost;
    playCrashes(host, new CollisionCues([{ event: e as never, step: null }]), null);
    return out;
  }

  it("shows the blast at the ram on its drawn truck, also against an obstacle", () => {
    expect(played(blast("rock1"), ["a"])).toEqual([RAM_AT, "explosion"]);
    expect(played(blast("b"), ["b"])).toEqual([RAM_AT, "explosion"]);
  });

  it("shows the blast at the ram's saved face when the view does not draw the ram", () => {
    const g = groundPoint(emptyWorld().terrain, { x: 30, y: 30 });
    expect(played(blast("b"), ["a"], drawn(false))[0]).toEqual({ x: g.x, y: g.y + 1, z: g.z });
  });

  it("shows no blast when neither truck in it is seen", () => {
    expect(played(blast("b"), [])).toEqual([]);
  });
});

describe("playCrashes levels", () => {
  function levels(impacts: number[]): number[] {
    const out: number[] = [];
    const host = {
      world: emptyWorld(),
      views: new Map(),
      fx: { crash: () => {} },
      sound: { atLevel: (_cue: string, _p: V3, _delay: number, level: number) => out.push(level) },
      eventPoint: () => ({ x: 0, y: 0, z: 0 }),
    } as unknown as CombatHost;
    const events: GameEvent[] = impacts.map((impact) => ({ ...(hit("a", "b") as object), impact }) as GameEvent);
    const timed = collisionSteps(events, { ...none, crashes: [] });
    playCrashes(host, new CollisionCues(timed), null);
    return out;
  }

  it("hands a soft bump a quiet level and a hard ram the full level", () => {
    const [soft, hard, over] = levels([RULES.collisionMinImpact, RULES.hardCrashSpeed, RULES.hardCrashSpeed * 2]);
    expect(soft).toBe(MIX.crash.quietGain);
    expect(hard).toBe(1);
    expect(over).toBe(1);
  });

  it("plays a middle hit between the quiet and the full level", () => {
    const [middle] = levels([(RULES.collisionMinImpact + RULES.hardCrashSpeed) / 2]);
    expect(middle).toBeGreaterThan(MIX.crash.quietGain);
    expect(middle).toBeLessThan(1);
  });
});

describe("CollisionCues", () => {
  it("returns each event once, when its step is reached, and the rest when movement ends", () => {
    const [e1, e2, e3] = [hit("a", "b"), hit("a", "c"), hit("a", "d")];
    const cues = new CollisionCues([
      { event: e1 as never, step: 5 },
      { event: e2 as never, step: 9 },
      { event: e3 as never, step: null },
    ]);
    expect(cues.due(4)).toEqual([]);
    expect(cues.due(6)).toEqual([e1]);
    expect(cues.due(6)).toEqual([]);
    expect(cues.due(null)).toEqual([e2, e3]);
    expect(cues.due(null)).toEqual([]);
  });
});

describe("playUtilitySounds", () => {
  type Effect = "mortar" | "flare" | "sprout" | "caltrops" | "oil" | "claymore";
  const use = (vehicle: string, effect: Effect, point: { x: number; y: number } | null = null): GameEvent => ({ t: "utility", vehicle, part: `${vehicle}-p`, effect, point });
  const pulse = (vehicle: string): GameEvent => ({ t: "pulse", vehicle, pos: { x: 0, y: 0 }, hit: [] });
  const seen: Record<string, V3> = { a: { x: 1, y: 2, z: 3 }, b: { x: 4, y: 5, z: 6 } };
  const terrain = emptyWorld().terrain;

  function played(events: GameEvent[], at: "start" | "end" = "start"): { cue: string; p: V3; delayMs: number }[] {
    const out: { cue: string; p: V3; delayMs: number }[] = [];
    let waited = 0;
    const later = (ms: number, run: () => void) => {
      waited = ms;
      run();
    };
    playUtilitySounds({ world: { events, terrain }, eventPoint: (id) => seen[id] ?? null, fx: { later }, sound: { at: (cue, p, delayMs) => out.push({ cue, p, delayMs: waited + delayMs }) } }, at);
    return out;
  }

  it("plays each utility's own cue at its user as it is used, and the pulse's crack", () => {
    expect(played([use("a", "mortar"), use("b", "flare"), use("a", "sprout"), use("a", "caltrops"), use("b", "oil"), pulse("b")]).map((s) => [s.cue, s.p, s.delayMs])).toEqual([
      ["mortar-fire", seen.a, 0],
      ["flare-fire", seen.b, 0],
      ["smoke-burst", seen.a, 0],
      ["caltrops-drop", seen.a, 0],
      ["oil-spill", seen.b, 0],
      ["emitter-pulse", seen.b, 0],
    ]);
  });

  it("booms the mortar's shell where it lands and bursts the flare at its point, when each flight ends", () => {
    const point = { x: 40, y: 30 };
    const ground = groundPoint(terrain, point);
    expect(played([use("a", "mortar", point), use("a", "flare", point)]).filter((s) => s.delayMs > 0)).toEqual([
      { cue: "cannon-fire", p: ground, delayMs: SHELL.flightMs },
      { cue: "flare-burst", p: ground, delayMs: FLARE_LOOK.flightMs },
    ]);
  });

  it("bursts a tire on a truck that drives into caltrops as the move ends, not at turn start", () => {
    const hit: GameEvent = { t: "caltrops", vehicle: "b", field: "g1", source: "a", hits: [] };
    expect(played([hit], "end")).toEqual([{ cue: "caltrops-hit", p: seen.b, delayMs: 0 }]);
    expect(played([hit], "start")).toEqual([]);
  });

  it("plays no use or pulse again as the move ends", () => {
    expect(played([use("a", "sprout"), pulse("b")], "end")).toEqual([]);
  });

  it("stays silent for unseen users and for a claymore, whose blast plays with its crash", () => {
    expect(played([use("hidden", "mortar", { x: 40, y: 30 }), pulse("hidden"), use("a", "claymore")])).toEqual([]);
  });

  it("snaps a torn harpoon line at the truck it held, and stays silent when that truck is unseen", () => {
    const torn = (vehicle: string): GameEvent => ({ t: "lineTorn", line: "l1", vehicle, part: `${vehicle}-p`, damage: 12 });
    expect(played([torn("a"), torn("hidden")], "end")).toEqual([{ cue: "line-tear", p: seen.a, delayMs: 0 }]);
  });
});

const ORIGIN = { x: 0, y: 0, z: 0 };
const MUZZLE = () => ({ pos: { x: 0, y: 1, z: 0 }, dir: { x: 1, y: 0, z: 0 } }) as never;
const POSES = { end: () => ORIGIN };

function plansOf(rounds: ShotRound[], shown: (id: string) => boolean = () => true): PlannedRound[] {
  return rounds.map((r) => {
    const struckAt = r.struck !== null && shown(r.struck) ? ORIGIN : null;
    return { land: ORIGIN, impact: struckAt ? "truck" : r.struck === null ? "ground" : "none", delayMs: 0, flightMs: 10, struckAt };
  });
}

describe("playVolley sounds", () => {
  function cuesOf(weapon: string, struck: boolean): string[] {
    const cues: string[] = [];
    const p = { x: 0, y: 0, z: 0 };
    const round: ShotRound = { hit: struck, crit: false, offset: 0, struck: struck ? "t" : null, hits: [], blast: [], burst: null };
    const event = { t: "shot", shooter: "s", weapon: "w", target: "t", aim: "center", chance: 1, damageChance: 1, side: "front", rounds: [round] } as ShotLike;
    const fly = (_s: unknown, _m: unknown, _p: unknown, _r: unknown, c: { fired: (m: never) => void; landed: () => void }) => {
      c.fired({ pos: p } as never);
      c.landed();
    };
    const host = { world: emptyWorld(), fx: { shot: fly, label: () => {} }, sound: { at: (cue: string) => cues.push(cue) }, eventPoint: () => p, breakPart: () => {}, poses: POSES, startMs: 0 } as unknown as VolleyHost;
    playVolley(host, plansOf([round]), MUZZLE, event, new BreakCues([event]), weapon, new Map(), false, null);
    return cues;
  }

  it("fires and hooks with the harpoon's own cues", () => {
    expect(cuesOf("harpoon", true)).toEqual(["harpoon-fire", "harpoon-hook"]);
  });

  it("lets a harpoon miss like any round, and keeps every other gun on its look's cues", () => {
    expect(cuesOf("harpoon", false)).toEqual(["harpoon-fire", "miss"]);
    expect(cuesOf("mg", true)).toEqual(["mg-fire", "hit-metal"]);
  });
});

describe("playVolley breaks", () => {
  const rd = (hits: { part: string; damage: number }[]): ShotRound => ({ hit: hits.length > 0, crit: false, offset: 0, struck: hits.length ? "t" : null, hits, blast: [], burst: null });
  const GUN = (() => { const w = emptyWorld(); const v = addVehicle(w, "scrapjaw", "buggy", ["mg", "stockEngine"], { x: 33, y: 30 }, 0); const it = v.items.find((i) => i.kind === "part" && i.part.defId === "mg"); return it && it.kind === "part" ? it.part.id : ""; })();
  const event = { t: "shot", shooter: "s", weapon: "mg", target: "t", aim: "center", chance: 1, damageChance: 1, side: "front", rounds: [rd([]), rd([{ part: GUN, damage: 2 }]), rd([{ part: GUN, damage: 3 }])] } as ShotLike;
  const partOff: GameEvent = { t: "partDisabled", vehicle: "t", part: GUN };

  function play(eventPoint: (id: string) => { x: number; y: number; z: number } | null = () => ({ x: 0, y: 0, z: 0 })) {
    const landed: (() => void)[] = [];
    const sounds: string[] = [];
    const broken: PartBreak[] = [];
    const world = emptyWorld();
    const target = addVehicle(world, "scrapjaw", "buggy", ["mg", "stockEngine"], { x: 33, y: 30 }, 0);
    target.id = "t";
    const host = {
      world,
      fx: { shot: (_s: unknown, _m: unknown, _p: unknown, _r: unknown, cues: { landed: () => void }) => landed.push(cues.landed), label: () => {} },
      sound: { at: (cue: string) => sounds.push(cue) },
      eventPoint,
      breakPart: (b: PartBreak) => broken.push(b),
      poses: POSES,
      startMs: 0,
    } as unknown as VolleyHost;
    return { landed, broken, sounds, host };
  }

  it("shows each round's damage label as that round lands, on the truck it hit", () => {
    const { host } = play();
    const labels: { at: () => V3 | null; ms: number }[] = [];
    (host.fx as unknown as { label: unknown }).label = (at: () => V3 | null, _t: unknown, _c: unknown, _r: unknown, ms: number) => labels.push({ at, ms });
    const plans = plansOf(event.rounds).map((p, k) => ({ ...p, delayMs: k * 300, flightMs: 50 }));
    playVolley(host, plans, MUZZLE, event, new BreakCues([event]), "mg", new Map(), false, null);
    expect(labels.map((l) => l.ms)).toEqual([350, 650]);
    expect(labels[0].at()).toEqual(ORIGIN);
  });

  it("breaks the part as its breaking round lands, once", () => {
    const { landed, broken, host } = play();
    const breaks = new BreakCues([partOff, event]);
    playVolley(host, plansOf(event.rounds), MUZZLE, event, breaks, "mg", new Map(), false, null);
    expect(landed).toHaveLength(3);
    landed[0]();
    landed[1]();
    expect(broken).toEqual([]);
    landed[2]();
    landed[2]();
    expect(broken).toEqual([{ vehicle: "t", part: GUN }]);
  });

  const volley = (rounds: ShotRound[], shown?: (id: string) => boolean) => {
    const played = play();
    const ev = { ...event, rounds } as ShotLike;
    playVolley(played.host, plansOf(rounds, shown), MUZZLE, ev, new BreakCues([ev]), "mg", new Map(), false, null);
    played.landed.forEach((l) => l());
    return played.sounds;
  };
  const plain = (struck: string | null, blast: ShotRound["blast"] = []): ShotRound => ({ hit: struck === "t", crit: false, offset: 3, struck, hits: [], blast, burst: null });

  it("sounds a ground miss as a miss and a hit as metal", () => {
    expect(volley([plain(null)])).toEqual(["miss"]);
    expect(volley([plain("t")])).toEqual(["hit-metal"]);
  });

  it("sounds a ground miss whose blast damaged a truck as metal", () => {
    expect(volley([plain(null, [{ vehicle: "o", hits: [] }])])).toEqual(["hit-metal"]);
  });

  const sheet = (parts: string[]) => {
    const w = emptyWorld();
    const v = addVehicle(w, "scrapjaw", "buggy", parts, { x: 33, y: 30 }, 0);
    v.id = "t";
    const idOf = (defId: string) => {
      const it = v.items.find((i) => i.kind === "part" && i.part.defId === defId);
      return it && it.kind === "part" ? it.part.id : "";
    };
    return { world: w, idOf };
  };

  const volleyOn = (world: ReturnType<typeof emptyWorld>, rounds: ShotRound[], weapon = "mg") => {
    const played = play();
    const ev = { ...event, rounds } as ShotLike;
    playVolley({ ...played.host, world }, plansOf(rounds), MUZZLE, ev, new BreakCues([ev]), weapon, new Map(), false, null);
    played.landed.forEach((l) => l());
    return played.sounds;
  };
  const dealt = (part: string, damage: number, vehicle = "t"): ShotRound => ({ hit: true, crit: false, offset: 0, struck: vehicle, hits: [{ part, damage }], blast: [], burst: null });

  describe("struck cue by the parts a round damaged", () => {
    const { world, idOf } = sheet(["mg", "stockEngine", "plates", "ram"]);
    const engine = idOf("stockEngine");
    const plates = idOf("plates");
    const ram = idOf("ram");

    it("plays hit-part for a damaged engine and hit-metal for plates, a ram or no damage", () => {
      expect(volleyOn(world, [dealt(engine, 2)])).toEqual(["hit-part"]);
      expect(volleyOn(world, [dealt(plates, 2)])).toEqual(["hit-metal"]);
      expect(volleyOn(world, [dealt(ram, 2)])).toEqual(["hit-metal"]);
      expect(volleyOn(world, [dealt(engine, 0)])).toEqual(["hit-metal"]);
    });

    it("plays hit-part when a round cracks a plate and then reaches the engine", () => {
      const both: ShotRound = { ...dealt(plates, 2), hits: [{ part: plates, damage: 2 }, { part: engine, damage: 1 }] };
      expect(volleyOn(world, [both])).toEqual(["hit-part"]);
    });

    it("plays hit-part for a splash miss whose blast damaged another truck's part", () => {
      const splash: ShotRound = { ...dealt(engine, 1), struck: null, hit: false, hits: [], blast: [{ vehicle: "t", hits: [{ part: engine, damage: 1 }] }] };
      expect(volleyOn(world, [splash])).toEqual(["hit-part"]);
    });

    it("keeps the harpoon's hook for either kind of hit", () => {
      expect(volleyOn(world, [dealt(engine, 2)], "harpoon")).toEqual(["harpoon-hook"]);
      expect(volleyOn(world, [dealt(plates, 2)], "harpoon")).toEqual(["harpoon-hook"]);
    });

    it("keeps a miss as a miss", () => {
      expect(volleyOn(world, [plain(null)])).toEqual(["miss"]);
    });

    it("applies the same rule when neither truck is the player's", () => {
      expect(world.vehicles.some((v) => v.id === "t" && v.faction !== "player")).toBe(true);
      expect(volleyOn(world, [dealt(engine, 2)])).toEqual(["hit-part"]);
    });

    it("throws on a damaged part the truck does not carry", () => {
      expect(() => volleyOn(world, [dealt("nope", 2)])).toThrow(/does not carry/);
    });

    it("sounds the same for every gun but the harpoon", () => {
      const weapons = Object.values(PARTS).filter((d) => d.kind === "weapon" && d.id !== "harpoon");
      expect(weapons.length).toBeGreaterThan(0);
      for (const w of weapons) {
        expect(volleyOn(world, [dealt(engine, 2)], w.id)).toEqual(["hit-part"]);
        expect(volleyOn(world, [dealt(plates, 2)], w.id)).toEqual(["hit-metal"]);
      }
    });
  });

  it("sounds nothing for a stray into a truck that is not shown", () => {
    expect(volley([plain("o")], (id) => id !== "o")).toEqual([]);
  });

  it("throws when a shot names a truck that is in neither list", () => {
    const { host } = play();
    const e = { ...event, t: "shot" } as unknown as GameEvent;
    host.world.events = [e];
    expect(() => playShotFx(host as unknown as CombatHost, new BreakCues([]))).toThrow(/unknown vehicle/);
  });
});

const STEPS = 60;
const STEP_MS = 1000 / STEPS;
const MOVE_MS = STEPS * STEP_MS;

const shooterAt = (s: number) => ({ x: s * 0.2, y: 2, z: 0 });
const targetAt = (s: number) => ({ x: 40, y: 2, z: s * 0.2 });

const poses: TurnPoses = {
  moveMs: MOVE_MS,
  stepMs: STEP_MS,
  at: (id, s) => (s < 0 || s >= STEPS ? null : id === "s" ? shooterAt(s) : id === "t" ? targetAt(s) : null),
  headingAt: (id, s) => (s < 0 || s >= STEPS || (id !== "s" && id !== "t") ? null : 0),
  end: (id) => (id === "s" ? shooterAt(STEPS - 1) : id === "t" ? targetAt(STEPS - 1) : id === "o" ? { x: 50, y: 2, z: 50 } : null),
  endHeading: (id) => (id === "s" || id === "t" || id === "o" ? 0 : null),
};

const gun = (key: string, covers: Gun["covers"] = () => true, blastRadius = 0): Gun => ({ spec: projectileOf(key), rangeM: 100, blastRadius, unit: 0, covers });
const round = (struck: string | null, offset = 0, more: Partial<ShotRound> = {}): ShotRound => ({ hit: struck === "t", crit: false, offset, struck, hits: [], blast: [], burst: null, ...more });
const TARGET_HALF = { length: 2.5, width: 1 };
const shot = (rounds: ShotRound[], late: (k: number) => boolean = () => false): Shot => ({ shooter: "s", target: "t", rounds, late, missAt: (offset) => ({ x: 40, y: 0, z: 11.8 + offset }), targetHalf: TARGET_HALF });
const flatGround = () => 0;
const half = () => 0.5;

describe("planShot", () => {
  it("spreads a machine gun's rounds through the move instead of one burst", () => {
    const plans = planShot(poses, shot([round("t"), round(null, 3), round("t"), round("t"), round(null, -3)]), gun("mg"), flatGround, half);
    const fired = plans.map((p) => p.delayMs);
    expect(fired).toEqual([...fired].sort((a, b) => a - b));
    expect(fired[0]).toBeLessThan(MOVE_MS * 0.2);
    expect(fired[4]).toBeGreaterThan(MOVE_MS * 0.7);
    for (const p of plans) expect(p.delayMs + p.flightMs).toBeLessThanOrEqual(MOVE_MS + STEP_MS);
  });

  it("lands a hit on the target where it is when the round arrives", () => {
    const [p] = planShot(poses, shot([round("t")]), gun("cannon"), flatGround, half);
    const landMs = p.delayMs + p.flightMs;
    const there = targetAt(Math.round(landMs / STEP_MS));
    expect(p.impact).toBe("truck");
    expect(p.land.x).toBeCloseTo(there.x, 0);
    expect(Math.abs(p.land.z - there.z)).toBeLessThan(0.5);
    expect(p.struckAt).not.toBeNull();
  });

  it("flies a miss close past the target and lands it on the ground behind", () => {
    const [p] = planShot(poses, shot([round(null, 2)]), gun("mg"), flatGround, half);
    const there = targetAt(Math.round((p.delayMs + p.flightMs) / STEP_MS));
    expect(p.impact).toBe("ground");
    expect(p.land.y).toBe(0);
    expect(p.land.x).toBeGreaterThan(there.x + 1);
    expect(Math.abs(p.land.z - there.z)).toBeLessThan(4);
  });

  it("fires only on steps where the gun covers the target", () => {
    const turning: TurnPoses = { ...poses, headingAt: (_id, s) => (s >= 40 ? 0 : 1) };
    const facing = gun("mg", (heading) => heading === 0);
    expect(fireSteps(turning, { shooter: "s", target: "t" }, facing)[0]).toBe(40);
    const plans = planShot(turning, shot([round("t"), round("t"), round("t")]), facing, flatGround, half);
    for (const p of plans) expect(p.delayMs).toBeGreaterThanOrEqual(40 * STEP_MS);
  });

  it("spreads a grenade volley through the move and bursts each miss on the sim's burst point", () => {
    const rounds = [round(null, 1, { burst: { x: 10, y: 3 } }), round("t", 0, { blast: [{ vehicle: "t", hits: [] }] }), round(null, -1, { burst: { x: 10, y: 2 } })];
    const plans = planShot(poses, shot(rounds), gun("grenadeLauncher", () => true, 2), flatGround, half);
    expect(plans[0].delayMs).toBeLessThan(MOVE_MS * 0.4);
    expect(plans[0]).toMatchObject({ land: { x: 40, y: 0, z: 12.8 }, impact: "ground" });
    expect(plans[1].impact).toBe("truck");
    expect(plans[2].land).toEqual({ x: 40, y: 0, z: 10.8 });
  });

  it("lands a stray on the third truck where it is when the round arrives", () => {
    const third = (s: number) => ({ x: 30, y: 2, z: 5 + s * 0.1 });
    const withThird: TurnPoses = { ...poses, at: (id, s) => (id === "o" && s >= 0 && s < STEPS ? third(s) : poses.at(id, s)) };
    const [p] = planShot(withThird, shot([round("o")]), gun("cannon"), flatGround, half);
    const aimed = Math.round(p.delayMs / STEP_MS);
    expect(p.delayMs).toBeLessThan(MOVE_MS * 0.5);
    expect(p.impact).toBe("truck");
    expect(p.struckAt!.z).toBeGreaterThan(third(aimed).z);
    expect(p.struckAt!.z).toBeLessThan(third(STEPS - 1).z);
  });

  it("fires a late burst so its last round lands as the move ends when the gun covers the target on no step", () => {
    const plans = planShot(poses, shot([round("t"), round("t"), round("t"), round("t")]), gun("mg", () => false), flatGround, half);
    const gap = projectileOf("mg").gapMs;
    plans.slice(1).forEach((p, i) => expect(p.delayMs - plans[i].delayMs).toBeCloseTo(gap, 6));
    for (const p of plans) expect(p.delayMs + p.flightMs).toBeLessThanOrEqual(MOVE_MS + 1e-6);
    expect(plans[3].delayMs + plans[3].flightMs).toBeCloseTo(MOVE_MS, -1);
    expect(plans[0].struckAt).toEqual(targetAt(STEPS - 1));
  });

  it("lands every late round of a heavy gun's burst by the end of the move", () => {
    const plans = planShot(poses, shot([round("t"), round(null, 2), round("t")], () => true), gun("autocannon"), flatGround, half);
    for (const p of plans) expect(p.delayMs + p.flightMs).toBeLessThanOrEqual(MOVE_MS + STEP_MS);
    expect(plans.map((p) => p.delayMs)).toEqual(plans.map((p) => p.delayMs).sort((a, b) => a - b));
  });

  it("fires all shotgun pellets in one blast", () => {
    const plans = planShot(poses, shot([round("t"), round(null, 1), round("t")]), gun("shotgun"), flatGround, half);
    const gap = projectileOf("shotgun").gapMs;
    expect(plans.map((p) => p.delayMs - plans[0].delayMs)).toEqual([0, gap, 2 * gap]);
  });

  it("strays a late round into a shown third truck and draws no landing for an unseen one", () => {
    const [seen, hidden] = planShot(poses, shot([round("o"), round("x")], () => true), gun("mg"), flatGround, half);
    expect(seen.impact).toBe("truck");
    expect(seen.struckAt).toEqual({ x: 50, y: 2, z: 50 });
    expect(hidden.impact).toBe("none");
  });
});

describe("planShot against the end of the move", () => {
  it("fires a late round so it lands as the move ends, even when the gun only covers early", () => {
    const early: TurnPoses = { ...poses, headingAt: (_id, s) => (s < 10 ? 0 : 1) };
    const burst = round(null, 1, { burst: { x: 10, y: 3 } });
    const [p] = planShot(early, shot([burst], () => true), gun("rocketRack", (heading) => heading === 0, 2), flatGround, half);
    expect(p.delayMs).toBeLessThan(MOVE_MS);
    expect(p.delayMs + p.flightMs).toBeCloseTo(MOVE_MS, -1);
  });

  it("widens a hit's offset when the target shows more of its side than at the end of the move", () => {
    const parked = (id: string) => (id === "s" ? { x: 0, y: 2, z: 0 } : id === "t" ? { x: 40, y: 2, z: 0 } : null);
    const sideOn: TurnPoses = { ...poses, at: (id, s) => (s < STEPS ? parked(id) : null), end: parked, headingAt: (id) => (id === "t" ? Math.PI / 2 : 0) };
    const [p] = planShot(sideOn, shot([round("t", 0.8)]), gun("cannon"), flatGround, half);
    expect(p.land.z).toBeCloseTo(0.8 * (TARGET_HALF.length / TARGET_HALF.width), 5);
  });

  it("keeps a truck's length on the x axis of its body box", () => {
    const body = bodyOf("buggy").half;
    expect(body.x).toBeGreaterThan(body.z);
  });
});

describe("playShotFx before a shooter's view exists", () => {
  it("fires the shooter's rounds as the move ends instead of failing the turn", () => {
    const world = emptyWorld();
    const shooter = addVehicle(world, "scrapjaw", "buggy", ["mg", "stockEngine"], { x: 30, y: 30 }, 0);
    const target = addVehicle(world, "scrapjaw", "buggy", ["stockEngine"], { x: 36, y: 30 }, 0);
    const mg = shooter.items.find((i) => i.kind === "part" && i.part.defId === "mg");
    if (!mg || mg.kind !== "part") throw new Error("test truck has no mg");
    world.events = [{ t: "shot", shooter: shooter.id, weapon: mg.part.id, target: target.id, aim: "center", chance: 1, damageChance: 1, side: "front", rounds: [round(target.id)] } as GameEvent];
    const launched: { delayMs: number; flightMs: number }[] = [];
    const host = {
      world,
      views: new Map(),
      fx: { shot: (_s: unknown, _m: unknown, plan: { delayMs: number; flightMs: number }) => launched.push(plan), label: () => {} },
      sound: { at: () => {}, queueScoreEvent: () => {} },
      eventPoint: () => ORIGIN,
      breakPart: () => {},
      onBurst: () => {},
      poses: posesOf(world, {}, { moveMs: MOVE_MS, stepMs: STEP_MS, gunHeight: 1.6 }, () => true),
      startMs: 0,
      lineHooked: () => {},
    } as unknown as CombatHost;
    playShotFx(host, new BreakCues(world.events));
    expect(launched).toHaveLength(1);
    expect(launched[0].delayMs + launched[0].flightMs).toBeCloseTo(MOVE_MS, 6);
  });
});

describe("playShotFx after the shooter's view is gone", () => {
  type Kept = { muzzle: () => Muzzle; landed: () => void };
  const M1: Muzzle = { pos: { x: 4, y: 2, z: 6 }, dir: { x: 1, y: 0, z: 0 } };

  const emptyingShot = (views: Map<string, unknown>) => {
    const world = emptyWorld();
    const shooter = addVehicle(world, "scrapjaw", "buggy", ["mg", "stockEngine"], { x: 30, y: 30 }, 0);
    const target = addVehicle(world, "scrapjaw", "buggy", ["stockEngine"], { x: 36, y: 30 }, 0);
    const mg = shooter.items.find((i) => i.kind === "part" && i.part.defId === "mg");
    if (!mg || mg.kind !== "part") throw new Error("test truck has no mg");
    world.events = [
      { t: "shot", shooter: shooter.id, weapon: mg.part.id, target: target.id, aim: "center", chance: 1, damageChance: 1, side: "front", rounds: [round(target.id), round(target.id)] } as GameEvent,
      { t: "empty", vehicle: shooter.id, weapon: mg.part.id } as GameEvent,
    ];
    const kept: Kept[] = [];
    const sounds: { cue: string; at: V3 }[] = [];
    const poses = posesOf(world, {}, { moveMs: MOVE_MS, stepMs: STEP_MS, gunHeight: 1.6 }, () => true);
    const host = {
      world,
      views,
      fx: { shot: (_s: unknown, muzzle: () => Muzzle, _p: unknown, _r: unknown, cues: { landed: () => void }) => kept.push({ muzzle, landed: cues.landed }), label: () => {} },
      sound: { at: (cue: string, at: V3) => sounds.push({ cue, at }), accents: () => {} },
      eventPoint: () => ORIGIN,
      breakPart: () => {},
      onBurst: () => {},
      poses,
      startMs: 0,
      lineHooked: () => {},
    } as unknown as CombatHost;
    playShotFx(host, new BreakCues(world.events));
    return { shooter: shooter.id, kept, sounds, poses };
  };

  it("plays the gun-empty cue once at the last muzzle when the view goes before the rounds land", () => {
    const views = new Map<string, unknown>();
    const { shooter, kept, sounds } = emptyingShot(views);
    views.set(shooter, { covers: () => true, turretUnit: () => 0, muzzle: () => M1 });
    kept.forEach((k) => k.muzzle());
    views.delete(shooter);
    for (const k of kept) k.landed();
    expect(sounds.filter((s) => s.cue === "gun-empty")).toEqual([{ cue: "gun-empty", at: M1.pos }]);
  });

  it("aims from the shooter's end pose when it never read the view", () => {
    const { shooter, kept, poses } = emptyingShot(new Map());
    const heading = poses.endHeading(shooter) ?? NaN;
    const m = kept[0].muzzle();
    expect(m.pos).toEqual(poses.end(shooter));
    expect(m.dir.x).toBeCloseTo(Math.cos(heading), 9);
    expect(m.dir.y).toBe(0);
    expect(m.dir.z).toBeCloseTo(Math.sin(heading), 9);
  });

  it("reads the live muzzle on every call while the view exists", () => {
    const views = new Map<string, unknown>();
    const { shooter, kept } = emptyingShot(views);
    const M2: Muzzle = { pos: { x: 9, y: 2, z: 1 }, dir: { x: 0, y: 0, z: 1 } };
    let live = M1;
    views.set(shooter, { covers: () => true, turretUnit: () => 0, muzzle: () => live });
    expect(kept[0].muzzle()).toEqual(M1);
    live = M2;
    expect(kept[0].muzzle()).toEqual(M2);
  });
});

describe("playShotFx through the move", () => {
  const parked = (x: number) => Array.from({ length: STEPS }, () => ({ pos: { x, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0, w: 1 }, acc: ORIGIN, wheels: [] }));

  const queued: [string, number][] = [];
  const fire = (weapon: string, rounds: (target: string) => ShotRound[], more: (target: string) => GameEvent[] = () => []) => {
    const world = emptyWorld();
    const shooter = addVehicle(world, "scrapjaw", "buggy", [weapon, "stockEngine"], { x: 30, y: 30 }, 0);
    const target = addVehicle(world, "scrapjaw", "buggy", ["stockEngine"], { x: 36, y: 30 }, 0);
    const gunPart = shooter.items.find((i) => i.kind === "part" && i.part.defId === weapon);
    if (!gunPart || gunPart.kind !== "part") throw new Error(`test truck has no ${weapon}`);
    world.events = [{ t: "shot", shooter: shooter.id, weapon: gunPart.part.id, target: target.id, aim: "center", chance: 1, damageChance: 1, side: "front", rounds: rounds(target.id) } as GameEvent, ...more(target.id)];
    const launched: PlannedRound[] = [];
    const hooked: string[] = [];
    const frames = { [shooter.id]: parked(0), [target.id]: parked(15) };
    const host = {
      world,
      views: new Map([[shooter.id, { covers: () => true, turretUnit: () => 0 }]]),
      fx: { shot: (_s: unknown, _m: unknown, plan: PlannedRound, _r: unknown, cues: { landed: () => void }) => (launched.push(plan), cues.landed()), label: () => {} },
      sound: { at: () => {}, queueScoreEvent: (kind: string, atMs: number) => queued.push([kind, atMs]) },
      eventPoint: () => ORIGIN,
      breakPart: () => {},
      onBurst: () => {},
      lineHooked: (_shooter: string, part: string) => hooked.push(part),
      poses: posesOf(world, frames, { moveMs: MOVE_MS, stepMs: STEP_MS, gunHeight: 1.6 }, () => true),
      startMs: 0,
    } as unknown as CombatHost;
    world.player.vehicleId = shooter.id;
    queued.length = 0;
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    playShotFx(host, new BreakCues(world.events));
    vi.restoreAllMocks();
    return { launched, hooked, gunId: gunPart.part.id };
  };

  it("queues the volley's score event at the landing of the round that earns it", () => {
    const { launched } = fire("mg", () => [round(null), round("t")]);
    expect(queued).toHaveLength(1);
    expect(queued[0][0]).toBe("hit");
    expect(queued[0][1]).toBe(launched[1].delayMs + launched[1].flightMs);
  });

  it("fires every round into a truck that dies during the move but lands the killing one as the move ends", () => {
    const { launched } = fire("mg", (t) => [round(t), round(t), round(t)], (t) => [{ t: "destroyed", vehicle: t } as GameEvent]);
    expect(launched[0].delayMs).toBeLessThan(MOVE_MS / 2);
    expect(launched[1].delayMs).toBeLessThan(MOVE_MS * 0.9);
    expect(launched[2].delayMs + launched[2].flightMs).toBeGreaterThan(MOVE_MS - 3 * STEP_MS);
  });

  it("lands a struck harpoon during the move and shows its line from that moment", () => {
    const { launched, hooked, gunId } = fire("harpoon", (t) => [round(t)]);
    expect(launched[0].delayMs + launched[0].flightMs).toBeLessThan(MOVE_MS * 0.9);
    expect(hooked).toEqual([gunId]);
  });

  it("hooks no line with a harpoon that misses", () => {
    expect(fire("harpoon", () => [round(null, 3)]).hooked).toEqual([]);
  });
});

describe("spreadOver", () => {
  it("gives each round its own slice of the fire steps", () => {
    expect(spreadOver([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 5, () => 0)).toEqual([0, 2, 4, 6, 8]);
  });

  it("throws with rounds to place and no step to fire on", () => {
    expect(() => spreadOver([], 1, half)).toThrow(/at least one fire step/);
  });
});
