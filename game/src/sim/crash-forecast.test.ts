import { describe, expect, it, vi } from 'vitest';
import { applyContactCrash, applyGroundCrash, applyLanding, estimateCrashGeometry, forecastRam, ramImpact, ramValue } from './crash-contact';
import { mountedItems, mountedParts } from './grid';
import { addVehicle, emptyWorld } from './testkit';
import type { Vehicle, World } from './types';

type Duel = { w: World; a: Vehicle; b: Vehicle };

function duel(aParts: string[], bParts: string[], gap = 1.5, chassisA = 'hauler', chassisB = 'hauler'): Duel {
  const w = emptyWorld({ x: 80, y: 80 });
  const a = addVehicle(w, 'scrapjaw', chassisA, aParts, { x: 40, y: 40 }, 0);
  const b = addVehicle(w, 'independent', chassisB, bParts, { x: 40 + gap, y: 40 }, Math.PI);
  a.speed = 5;
  return { w, a, b };
}

function plowToNose(v: Vehicle): void {
  const item = mountedItems(v).find((it) => it.part.defId === 'plowRam')!;
  Object.assign(v.items.find((it) => it.id === item.id)!, { x: 3, y: 0, rot: 0 });
}

function playerAttacker(): Duel {
  const w = emptyWorld({ x: 80, y: 80 });
  const a = w.vehicles[0];
  a.pos = { x: 40, y: 40 };
  a.heading = 0;
  a.speed = 5;
  const b = addVehicle(w, 'independent', 'hauler', ['mg', 'stockEngine'], { x: 41.5, y: 40 }, Math.PI);
  return { w, a, b };
}

function playerTarget(): Duel {
  const w = emptyWorld({ x: 80, y: 80 });
  const b = w.vehicles[0];
  b.pos = { x: 41.5, y: 40 };
  b.heading = Math.PI;
  const a = addVehicle(w, 'scrapjaw', 'hauler', ['mg', 'stockEngine', 'plowRam'], { x: 40, y: 40 }, 0);
  a.speed = 5;
  return { w, a, b };
}

const ROWS: Record<string, () => Duel> = {
  lightVsHeavy: () => duel(['mg', 'stockEngine'], ['mg', 'stockEngine'], 1.5, 'buggy', 'hauler'),
  heavyVsLight: () => duel(['mg', 'stockEngine'], ['mg', 'stockEngine'], 1.5, 'hauler', 'buggy'),
  barVsBare: () => {
    const d = duel(['cannon', 'stockEngine', 'plowRam'], ['cannon', 'stockEngine'], 6);
    plowToNose(d.a);
    return d;
  },
  brokenBar: () => {
    const d = duel(['cannon', 'stockEngine', 'plowRam'], ['cannon', 'stockEngine'], 6);
    plowToNose(d.a);
    mountedParts(d.a, 'accessory')[0].hp = 1;
    return d;
  },
  junkTarget: () => {
    const d = duel(['cannon', 'stockEngine', 'plowRam'], ['cannon', 'stockEngine'], 6);
    plowToNose(d.a);
    mountedParts(d.b, 'weapon')[0].hp = 0;
    return d;
  },
  worndTarget: () => {
    const d = duel(['cannon', 'stockEngine', 'plowRam'], ['cannon', 'stockEngine'], 6);
    plowToNose(d.a);
    for (const part of mountedParts(d.b)) part.hp = Math.ceil(part.hp * 0.4);
    return d;
  },
  hurtAttacker: () => {
    const d = duel(['cannon', 'stockEngine', 'plowRam'], ['cannon', 'stockEngine'], 6);
    plowToNose(d.a);
    for (const part of mountedParts(d.a)) part.hp = Math.ceil(part.hp * 0.3);
    return d;
  },
  playerAttacker,
  playerTarget,
  sideContact: () => {
    const d = duel(['mg', 'stockEngine'], ['mg', 'stockEngine'], 1.5);
    d.b.heading = Math.PI / 2;
    return d;
  },
};

const IMPACT = 6;

function crashed(row: string): unknown {
  const { w, a, b } = ROWS[row]();
  const world = structuredClone(w);
  const own = world.vehicles.find((v) => v.id === a.id)!;
  const other = world.vehicles.find((v) => v.id === b.id)!;
  applyContactCrash(world, own, other, other.id, IMPACT, estimateCrashGeometry(own, other, other.pos), { a: IMPACT, b: 0 });
  return { events: world.events, hp: [own, other].map((v) => mountedParts(v).map((part) => [part.id, part.hp])), player: [world.player.xp, world.player.xpBySource] };
}

function forecasted(row: string): unknown {
  const { w, a, b } = ROWS[row]();
  const before = JSON.stringify(w);
  const impact = ramImpact(w, a, b);
  const forecast = forecastRam(w, a, b, impact ?? IMPACT);
  expect(JSON.stringify(w)).toBe(before);
  return { impact, forecast, value: ramValue(w, a, b) };
}

describe('crash outputs pinned', () => {
  for (const row of Object.keys(ROWS)) {
    it(`${row}: the contact crash gives the pinned hits`, () => {
      expect(crashed(row)).toEqual(PINNED_CRASH[row]);
    });
    it(`${row}: the ram forecast and value are the pinned ones`, () => {
      expect(forecasted(row)).toEqual(PINNED_FORECAST[row]);
    });
  }

  it('a ram that loses value copies no truck once the target is known', () => {
    const w = emptyWorld({ x: 80, y: 80 });
    const buggy = addVehicle(w, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], { x: 30, y: 30 }, 0);
    const hauler = addVehicle(w, 'independent', 'hauler', ['mg', 'stockEngine', 'plowRam'], { x: 36, y: 30 }, Math.PI);
    buggy.speed = 5;
    expect(ramValue(w, buggy, hauler)).toBe(0);
    const clone = vi.spyOn(globalThis, 'structuredClone');
    try {
      expect(ramValue(w, buggy, hauler)).toBe(0);
      expect(clone).not.toHaveBeenCalled();
    } finally {
      clone.mockRestore();
    }
  });

  it('a forecast sees a target part that turned to junk after an earlier forecast', () => {
    const { w, a, b } = ROWS.barVsBare();
    const before = forecastRam(w, a, b, IMPACT);
    Object.assign(mountedParts(b, 'weapon')[0], { wear: 1000, hp: 1 });
    const after = forecastRam(w, a, b, IMPACT);
    expect(after.dealt).not.toEqual(before.dealt);
  });

  it('a ground crash gives the pinned hits', () => {
    const { w, a } = ROWS.lightVsHeavy();
    applyGroundCrash(w, a, 'rock', IMPACT, { side: 'front', lanes: [1, 2] });
    expect({ events: w.events, hp: mountedParts(a).map((part) => [part.id, part.hp]) }).toEqual(PINNED_GROUND);
  });

  it('a landing gives the pinned hits', () => {
    const { w, a } = ROWS.lightVsHeavy();
    applyLanding(w, a, 'ground', IMPACT);
    expect({ events: w.events, hp: mountedParts(a).map((part) => [part.id, part.hp]) }).toEqual(PINNED_LANDING);
  });
});

const PINNED_CRASH: Record<string, unknown> = {"lightVsHeavy":{"events":[{"t":"collision","a":"v917","b":"v936","impact":6,"hitsA":[{"part":"p932","damage":13},{"part":"p925","damage":0},{"part":"p934","damage":18},{"part":"p927","damage":13}],"hitsB":[{"part":"p951","damage":3},{"part":"p946","damage":4},{"part":"p953","damage":4},{"part":"p940","damage":3}]}],"hp":[[["p925",30],["p932",27],["p927",17],["p934",32],["p919",30],["p923",120],["p929",30],["p921",40],["p931",30]],[["p951",37],["p938",30],["p953",46],["p940",27],["p946",116],["p948",40],["p950",30],["p942",30],["p944",30]]],"player":[0,{"roughTiles":0,"ram":0,"escape":0,"hit":0,"contact":0,"discover":0,"fieldJob":0,"patch":0,"search":0,"heat":0,"damage":0,"knockout":0,"profit":0,"deal":0,"call":0,"honk":0,"contract":0,"freeTow":0,"aid":0}]},"heavyVsLight":{"events":[{"t":"collision","a":"v917","b":"v936","impact":6,"hitsA":[{"part":"p932","damage":3},{"part":"p927","damage":4},{"part":"p934","damage":4},{"part":"p921","damage":3}],"hitsB":[{"part":"p951","damage":13},{"part":"p944","damage":0},{"part":"p953","damage":18},{"part":"p946","damage":13}]}],"hp":[[["p932",37],["p919",30],["p934",46],["p921",27],["p927",116],["p929",40],["p931",30],["p923",30],["p925",30]],[["p944",30],["p951",27],["p946",17],["p953",32],["p938",30],["p942",120],["p948",30],["p940",40],["p950",30]]],"player":[0,{"roughTiles":0,"ram":0,"escape":0,"hit":0,"contact":0,"discover":0,"fieldJob":0,"patch":0,"search":0,"heat":0,"damage":0,"knockout":0,"profit":0,"deal":0,"call":0,"honk":0,"contract":0,"freeTow":0,"aid":0}]},"barVsBare":{"events":[{"t":"collision","a":"v917","b":"v938","impact":6,"hitsA":[{"part":"p932","damage":12},{"part":"p936","damage":8}],"hitsB":[{"part":"p953","damage":36},{"part":"p940","damage":6},{"part":"p944","damage":0},{"part":"p948","damage":28},{"part":"p955","damage":36},{"part":"p950","damage":0},{"part":"p952","damage":4},{"part":"p942","damage":18},{"part":"p946","damage":1}]}],"hp":[[["p936",162],["p932",48],["p919",30],["p934",50],["p921",30],["p927",120],["p929",40],["p931",30],["p923",30],["p925",30]],[["p953",24],["p940",24],["p955",14],["p942",12],["p948",92],["p950",40],["p952",26],["p944",30],["p946",29]]],"player":[0,{"roughTiles":0,"ram":0,"escape":0,"hit":0,"contact":0,"discover":0,"fieldJob":0,"patch":0,"search":0,"heat":0,"damage":0,"knockout":0,"profit":0,"deal":0,"call":0,"honk":0,"contract":0,"freeTow":0,"aid":0}]},"brokenBar":{"events":[{"t":"partDisabled","vehicle":"v917","part":"p936"},{"t":"collision","a":"v917","b":"v938","impact":6,"hitsA":[{"part":"p932","damage":12},{"part":"p936","damage":1}],"hitsB":[{"part":"p953","damage":36},{"part":"p940","damage":6},{"part":"p944","damage":0},{"part":"p948","damage":28},{"part":"p955","damage":36},{"part":"p950","damage":0},{"part":"p952","damage":4},{"part":"p942","damage":18},{"part":"p946","damage":1}]}],"hp":[[["p936",0],["p932",48],["p919",30],["p934",50],["p921",30],["p927",120],["p929",40],["p931",30],["p923",30],["p925",30]],[["p953",24],["p940",24],["p955",14],["p942",12],["p948",92],["p950",40],["p952",26],["p944",30],["p946",29]]],"player":[0,{"roughTiles":0,"ram":0,"escape":0,"hit":0,"contact":0,"discover":0,"fieldJob":0,"patch":0,"search":0,"heat":0,"damage":0,"knockout":0,"profit":0,"deal":0,"call":0,"honk":0,"contract":0,"freeTow":0,"aid":0}]},"junkTarget":{"events":[{"t":"collision","a":"v917","b":"v938","impact":6,"hitsA":[{"part":"p932","damage":12},{"part":"p936","damage":8}],"hitsB":[{"part":"p940","damage":18},{"part":"p944","damage":1},{"part":"p948","damage":44},{"part":"p955","damage":36},{"part":"p950","damage":0},{"part":"p952","damage":4},{"part":"p942","damage":18},{"part":"p946","damage":1}]}],"hp":[[["p936",162],["p932",48],["p919",30],["p934",50],["p921",30],["p927",120],["p929",40],["p931",30],["p923",30],["p925",30]],[["p953",0],["p940",12],["p955",14],["p942",12],["p948",76],["p950",40],["p952",26],["p944",29],["p946",29]]],"player":[0,{"roughTiles":0,"ram":0,"escape":0,"hit":0,"contact":0,"discover":0,"fieldJob":0,"patch":0,"search":0,"heat":0,"damage":0,"knockout":0,"profit":0,"deal":0,"call":0,"honk":0,"contract":0,"freeTow":0,"aid":0}]},"worndTarget":{"events":[{"t":"partDisabled","vehicle":"v938","part":"p953"},{"t":"partDisabled","vehicle":"v938","part":"p955"},{"t":"partDisabled","vehicle":"v938","part":"p942"},{"t":"collision","a":"v917","b":"v938","impact":6,"hitsA":[{"part":"p932","damage":12},{"part":"p936","damage":8}],"hitsB":[{"part":"p953","damage":24},{"part":"p940","damage":6},{"part":"p944","damage":0},{"part":"p948","damage":28},{"part":"p955","damage":20},{"part":"p950","damage":0},{"part":"p952","damage":4},{"part":"p942","damage":12},{"part":"p946","damage":1}]}],"hp":[[["p936",162],["p932",48],["p919",30],["p934",50],["p921",30],["p927",120],["p929",40],["p931",30],["p923",30],["p925",30]],[["p953",0],["p940",6],["p955",0],["p942",0],["p948",20],["p950",16],["p952",8],["p944",12],["p946",11]]],"player":[0,{"roughTiles":0,"ram":0,"escape":0,"hit":0,"contact":0,"discover":0,"fieldJob":0,"patch":0,"search":0,"heat":0,"damage":0,"knockout":0,"profit":0,"deal":0,"call":0,"honk":0,"contract":0,"freeTow":0,"aid":0}]},"hurtAttacker":{"events":[{"t":"collision","a":"v917","b":"v938","impact":6,"hitsA":[{"part":"p932","damage":12},{"part":"p936","damage":8}],"hitsB":[{"part":"p953","damage":36},{"part":"p940","damage":6},{"part":"p944","damage":0},{"part":"p948","damage":28},{"part":"p955","damage":36},{"part":"p950","damage":0},{"part":"p952","damage":4},{"part":"p942","damage":18},{"part":"p946","damage":1}]}],"hp":[[["p936",43],["p932",6],["p919",9],["p934",15],["p921",9],["p927",36],["p929",12],["p931",9],["p923",9],["p925",9]],[["p953",24],["p940",24],["p955",14],["p942",12],["p948",92],["p950",40],["p952",26],["p944",30],["p946",29]]],"player":[0,{"roughTiles":0,"ram":0,"escape":0,"hit":0,"contact":0,"discover":0,"fieldJob":0,"patch":0,"search":0,"heat":0,"damage":0,"knockout":0,"profit":0,"deal":0,"call":0,"honk":0,"contract":0,"freeTow":0,"aid":0}]},"playerAttacker":{"events":[{"t":"collision","a":"v1","b":"v917","impact":6,"hitsA":[{"part":"p22","damage":22},{"part":"p18","damage":4},{"part":"p20","damage":9},{"part":"p16","damage":10}],"hitsB":[{"part":"p932","damage":4},{"part":"p927","damage":4},{"part":"p934","damage":6},{"part":"p921","damage":4}]},{"t":"practice","source":"ram","amount":18,"difficulty":0.6730512789429022,"target":"v917","xp":2.1417596072251186}],"hp":[[["p22",35],["p18",15],["p20",38],["p31",28],["p32",28],["p16",28],["p28",114],["p30",28],["p33",28],["p29",38],["p34",28]],[["p932",36],["p919",30],["p934",44],["p921",26],["p927",116],["p929",40],["p931",30],["p923",30],["p925",30]]],"player":[2.1417596072251186,{"roughTiles":0,"ram":2.1417596072251186,"escape":0,"hit":0,"contact":0,"discover":0,"fieldJob":0,"patch":0,"search":0,"heat":0,"damage":0,"knockout":0,"profit":0,"deal":0,"call":0,"honk":0,"contract":0,"freeTow":0,"aid":0}]},"playerTarget":{"events":[{"t":"partDisabled","vehicle":"v1","part":"p22"},{"t":"partDisabled","vehicle":"v1","part":"p18"},{"t":"practice","source":"damage","amount":4,"difficulty":null,"target":"driver","xp":2},{"t":"collision","a":"v917","b":"v1","impact":6,"hitsA":[{"part":"p932","damage":4},{"part":"p936","damage":8},{"part":"p921","damage":4}],"hitsB":[{"part":"p22","damage":57},{"part":"p18","damage":19},{"part":"p31","damage":8},{"part":"p28","damage":14},{"part":"p20","damage":45},{"part":"p29","damage":0},{"part":"p16","damage":32},{"part":"p32","damage":22}]},{"t":"practice","source":"ram","amount":16,"difficulty":0.6760204694519857,"target":"v917","xp":1.9107144287212998}],"hp":[[["p936",162],["p932",36],["p919",30],["p934",50],["p921",26],["p927",120],["p929",40],["p931",30],["p923",30],["p925",30]],[["p22",0],["p18",0],["p20",2],["p31",20],["p32",6],["p16",6],["p28",100],["p30",28],["p33",28],["p29",38],["p34",28]]],"player":[3.9107144287213,{"roughTiles":0,"ram":1.9107144287212998,"escape":0,"hit":0,"contact":0,"discover":0,"fieldJob":0,"patch":0,"search":0,"heat":0,"damage":2,"knockout":0,"profit":0,"deal":0,"call":0,"honk":0,"contract":0,"freeTow":0,"aid":0}]},"sideContact":{"events":[{"t":"collision","a":"v917","b":"v936","impact":6,"hitsA":[{"part":"p932","damage":6},{"part":"p927","damage":8},{"part":"p934","damage":8},{"part":"p921","damage":6}],"hitsB":[{"part":"p940","damage":5},{"part":"p953","damage":1},{"part":"p946","damage":4},{"part":"p950","damage":6},{"part":"p948","damage":0},{"part":"p944","damage":5}]}],"hp":[[["p932",34],["p919",30],["p934",42],["p921",24],["p927",112],["p929",40],["p931",30],["p923",30],["p925",30]],[["p951",40],["p938",30],["p953",49],["p940",25],["p946",116],["p948",40],["p950",24],["p942",30],["p944",25]]],"player":[0,{"roughTiles":0,"ram":0,"escape":0,"hit":0,"contact":0,"discover":0,"fieldJob":0,"patch":0,"search":0,"heat":0,"damage":0,"knockout":0,"profit":0,"deal":0,"call":0,"honk":0,"contract":0,"freeTow":0,"aid":0}]}};
const PINNED_FORECAST: Record<string, unknown> = {"lightVsHeavy":{"impact":6.887161005244939,"forecast":{"dealt":[{"defId":"mg","lost":4},{"defId":"stockEngine","lost":4},{"defId":"wheel","lost":4},{"defId":"cabBroad","lost":4}],"cost":[{"defId":"mg","lost":17},{"defId":"wheel","lost":17},{"defId":"stockEngine","lost":22}],"fit":true},"value":0},"heavyVsLight":{"impact":5.9065785305162155,"forecast":{"dealt":[{"defId":"mg","lost":13},{"defId":"wheel","lost":13},{"defId":"stockEngine","lost":16}],"cost":[{"defId":"mg","lost":3},{"defId":"stockEngine","lost":4},{"defId":"wheel","lost":3},{"defId":"cabBroad","lost":2}],"fit":true},"value":0.875646152093965},"barVsBare":{"impact":5.595611505768395,"forecast":{"dealt":[{"defId":"cannon","lost":32},{"defId":"wheel","lost":6},{"defId":"stockEngine","lost":32},{"defId":"wheel","lost":16},{"defId":"cabBroad","lost":24},{"defId":"tank","lost":4},{"defId":"wheel","lost":1}],"cost":[{"defId":"plowRam","lost":8},{"defId":"cannon","lost":10}],"fit":true},"value":0.7829076446147363},"brokenBar":{"impact":5.595611505768395,"forecast":{"dealt":[{"defId":"cannon","lost":32},{"defId":"wheel","lost":6},{"defId":"stockEngine","lost":32},{"defId":"wheel","lost":16},{"defId":"cabBroad","lost":24},{"defId":"tank","lost":4},{"defId":"wheel","lost":1}],"cost":[{"defId":"plowRam","lost":1},{"defId":"cannon","lost":10}],"fit":true},"value":0.7838753240485157},"junkTarget":{"impact":5.595611505768395,"forecast":{"dealt":[{"defId":"cannon","lost":32},{"defId":"wheel","lost":6},{"defId":"stockEngine","lost":32},{"defId":"wheel","lost":16},{"defId":"cabBroad","lost":24},{"defId":"tank","lost":4},{"defId":"wheel","lost":1}],"cost":[{"defId":"plowRam","lost":8},{"defId":"cannon","lost":10}],"fit":true},"value":0.7829076446147363},"worndTarget":{"impact":5.595611505768395,"forecast":{"dealt":[{"defId":"cannon","lost":32},{"defId":"wheel","lost":6},{"defId":"stockEngine","lost":32},{"defId":"wheel","lost":16},{"defId":"cabBroad","lost":24},{"defId":"tank","lost":4},{"defId":"wheel","lost":1}],"cost":[{"defId":"plowRam","lost":8},{"defId":"cannon","lost":10}],"fit":true},"value":0.7829076446147363},"hurtAttacker":{"impact":5.595611505768395,"forecast":{"dealt":[{"defId":"cannon","lost":32},{"defId":"wheel","lost":6},{"defId":"stockEngine","lost":32},{"defId":"wheel","lost":16},{"defId":"cabBroad","lost":24},{"defId":"tank","lost":4},{"defId":"wheel","lost":1}],"cost":[{"defId":"plowRam","lost":8},{"defId":"cannon","lost":10}],"fit":false},"value":0},"playerAttacker":{"impact":5.794655882092423,"forecast":{"dealt":[{"defId":"mg","lost":4},{"defId":"stockEngine","lost":6},{"defId":"wheel","lost":4},{"defId":"cabBroad","lost":4}],"cost":[{"defId":"cage","lost":22},{"defId":"panniers","lost":4},{"defId":"stockEngine","lost":9},{"defId":"mg","lost":9}],"fit":true},"value":0},"playerTarget":{"impact":5.894399744371673,"forecast":{"dealt":[{"defId":"cage","lost":57},{"defId":"panniers","lost":18},{"defId":"stockEngine","lost":44},{"defId":"wheel","lost":8},{"defId":"wheel","lost":21},{"defId":"mg","lost":31},{"defId":"cabBroad","lost":14}],"cost":[{"defId":"plowRam","lost":4},{"defId":"mg","lost":4},{"defId":"wheel","lost":4}],"fit":true},"value":0.973534048399801},"sideContact":{"impact":5.9065785305162155,"forecast":{"dealt":[{"defId":"stockEngine","lost":1},{"defId":"wheel","lost":5},{"defId":"cabBroad","lost":4},{"defId":"tank","lost":6},{"defId":"wheel","lost":5}],"cost":[{"defId":"mg","lost":6},{"defId":"stockEngine","lost":8},{"defId":"wheel","lost":6},{"defId":"cabBroad","lost":6}],"fit":true},"value":0}};
const PINNED_GROUND: unknown = {"events":[{"t":"collision","a":"v917","b":"rock","impact":6,"hitsA":[{"part":"p932","damage":25},{"part":"p925","damage":10},{"part":"p934","damage":40}],"hitsB":[]}],"hp":[["p925",20],["p932",15],["p927",30],["p934",10],["p919",30],["p923",120],["p929",30],["p921",40],["p931",30]]};
const PINNED_LANDING: unknown = {"events":[{"t":"collision","a":"v917","b":"ground","impact":6,"hitsA":[{"part":"p925","damage":13},{"part":"p927","damage":13},{"part":"p929","damage":13},{"part":"p931","damage":13}],"hitsB":[]}],"hp":[["p925",17],["p932",40],["p927",17],["p934",50],["p919",30],["p923",120],["p929",17],["p921",40],["p931",17]]};
