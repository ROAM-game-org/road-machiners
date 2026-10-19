import { describe, expect, it } from 'vitest';
import { CHASSIS } from '../data/chassis';
import { HAZARDS, HIGHWAY, type SceneKind } from '../data/modes';
import { HAULER_KIT } from '../data/start';
import { acrossOf, alongOf, fromRoad, highwayMap, windowShift, milestoneAt, stretchLength, outpostFort, outpostYardHalf, roadHeading, roadPoint, toRoad } from './highway';
import { boxDistance, mapObstacles, propBoxes, propObstacle, type PosedBox } from './mapgen';
import { CELL, componentOf, navLayer } from './nav/layer';
import { closurePieces, fortLine, fortLineHole, highwayDecks, lanesCoveredOf, leavesPassage, leavesVergeGap, scenesOf, southClosureAt, stretchLayout, type Scene } from './road-hazards';
import type { BakedMap, BakedProp } from './terrain';
import type { Vec } from './vec';
import type { RoadPiece } from './highway';
import { budget } from '../test/budget';

const SIZE = HIGHWAY.size;
const ROAD = HIGHWAY.road;
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const STRETCHES = Array.from({ length: 10 }, (_, i) => i + 1);

function baked(seed: number, p: RoadPiece, window: number): BakedProp {
  return { kind: p.kind, pos: fromRoad(seed, window, p.at.n, p.at.u), r: p.r, yaw: p.yaw, group: 0, step: 0, ...(p.hulk ? { hulk: p.hulk } : {}) };
}

function corners(b: PosedBox): Vec[] {
  return [-1, 1].flatMap((i) => [-1, 1].map((k) => ({
    x: b.center.x + b.axis.x * b.half.x * i - b.axis.y * b.half.y * k,
    y: b.center.y + b.axis.y * b.half.x * i + b.axis.x * b.half.y * k,
  })));
}

function acrossSpan(seed: number, window: number, p: RoadPiece): [number, number] {
  if (p.kind === 'rock' || p.kind === 'crag') {
    const d = acrossOf(seed, p.at);
    return [d - p.r, d + p.r];
  }
  const ds = propBoxes(propObstacle(baked(seed, p, window), 0)).flatMap(corners).map((c) => acrossOf(seed, toRoad(seed, window, c)));
  return [Math.min(...ds), Math.max(...ds)];
}

function boxesOf(seed: number, p: RoadPiece, window: number): readonly PosedBox[] {
  return propBoxes(propObstacle(baked(seed, p, window), 0));
}

function touch(seed: number, a: RoadPiece, b: RoadPiece, window: number): boolean {
  const pa = fromRoad(seed, window, a.at.n, a.at.u);
  const pb = fromRoad(seed, window, b.at.n, b.at.u);
  if (Math.hypot(pa.x - pb.x, pa.y - pb.y) > 8) return false;
  if (a.kind === 'rock' || a.kind === 'crag') return boxesOf(seed, b, window).some((box) => boxDistance(box, pa) < a.r) || ((b.kind === 'rock' || b.kind === 'crag') && Math.hypot(pa.x - pb.x, pa.y - pb.y) < a.r + b.r);
  if (b.kind === 'rock' || b.kind === 'crag') return touch(seed, b, a, window);
  const ba = boxesOf(seed, a, window);
  const bb = boxesOf(seed, b, window);
  return ba.some((x) => bb.some((y) => corners(x).some((c) => boxDistance(y, c) === 0) || corners(y).some((c) => boxDistance(x, c) === 0)));
}

function relYaw(seed: number, p: RoadPiece): number {
  const d = (((p.yaw - roadHeading(seed, p.at.n)) / (Math.PI / 180)) % 360 + 540) % 360 - 180;
  return d;
}

function allScenes(): { seed: number; j: number; scene: Scene }[] {
  return SEEDS.flatMap((seed) => STRETCHES.flatMap((j) => stretchLayout(seed, j).scenes.map((scene) => ({ seed, j, scene }))));
}

describe('a stretch layout', () => {
  it('builds the same layout every time', () => {
    expect(stretchLayout(4, 3)).toBe(stretchLayout(4, 3));
    expect(JSON.stringify(stretchLayout(4, 3))).toBe(JSON.stringify(stretchLayout(4, 3)));
  });

  it('alternates open arenas with scenes, between the clear road by each outpost', () => {
    for (const seed of SEEDS) {
      for (const j of STRETCHES) {
        const { arenas, scenes } = stretchLayout(seed, j);
        expect(scenes.length).toBeLessThanOrEqual(scenesOf(j));
        expect(arenas).toHaveLength(scenes.length + 1);
        expect(arenas[0].from).toBeCloseTo(milestoneAt(seed, j - 1) + HAZARDS.clearAfterOutpost, 6);
        expect(arenas[arenas.length - 1].to).toBeCloseTo(milestoneAt(seed, j) - HAZARDS.clearBeforeOutpost, 6);
        scenes.forEach((s, i) => {
          expect(arenas[i].to - arenas[i].from).toBeGreaterThanOrEqual(HAZARDS.arenaMin - 1e-9);
          expect(s.from).toBeCloseTo(arenas[i].to, 6);
          expect(arenas[i + 1].from).toBeCloseTo(s.to, 6);
        });
      }
    }
  });

  it('leaves every scene a way through on the road and keeps its pieces apart', () => {
    for (const { seed, j, scene } of allScenes()) {
      for (const row of scene.rows.filter((r) => r.length > 0 && scene.kind !== 'roadblock')) {
        expect(leavesPassage(row.map((p) => acrossSpan(seed, j - 1, p))), `seed ${seed} stretch ${j} ${scene.kind}`).toBe(true);
      }
      const pieces = scene.rows.flat();
      pieces.forEach((a, i) => pieces.slice(i + 1).forEach((b) => expect(touch(seed, a, b, j - 1), `seed ${seed} stretch ${j} ${scene.kind} ${a.kind} ${b.kind}`).toBe(false)));
    }
  });

  it('covers at most two lanes early on and three later, and never makes a ramp or a crater block', () => {
    for (const { seed, j, scene } of allScenes()) {
      if (scene.kind === 'rockfall' || scene.kind === 'checkpoint' || scene.kind === 'roadblock') continue;
      const onLanes = scene.rows.flat().filter((p) => p.kind !== 'tank' && Math.abs(acrossOf(seed, p.at)) <= ROAD.asphalt);
      const lanes = new Set(onLanes.flatMap((p) => {
        const [lo, hi] = acrossSpan(seed, j - 1, p);
        return ROAD.lanes.map((c, i) => [c, i] as const).filter(([c]) => hi > c - ROAD.laneWidth / 2 + 0.6 && lo < c + ROAD.laneWidth / 2 - 0.6).map(([, i]) => i);
      }));
      expect(lanes.size, `seed ${seed} stretch ${j} ${scene.kind}`).toBeLessThanOrEqual(lanesCoveredOf(j));
    }
  });

  it('turns every checkpoint barrier along its line and keeps scene vehicles at their recipe angles', () => {
    const near = (yaw: number, target: number, tol: number) => Math.min(Math.abs(yaw - target), Math.abs(yaw + target)) <= tol;
    for (const { seed, scene } of allScenes()) {
      const pieces = scene.rows.flat();
      if (scene.kind === 'checkpoint') for (const p of pieces.filter((x) => x.kind === 'barrier')) expect(near(relYaw(seed, p), 90, 5)).toBe(true);
      if (scene.kind === 'pileup') for (const p of pieces.filter((x) => x.hulk || x.kind === 'carWreck' || x.kind === 'deadTruck')) expect(Math.abs(relYaw(seed, p))).toBeGreaterThanOrEqual(HAZARDS.pileup.yaw[0] - 0.5);
      if (scene.kind === 'pileup') for (const p of pieces.filter((x) => x.hulk || x.kind === 'carWreck' || x.kind === 'deadTruck')) expect(Math.abs(relYaw(seed, p))).toBeLessThanOrEqual(HAZARDS.pileup.yaw[1] + 0.5);
      if (scene.kind === 'jackknife') {
        const hulk = pieces.find((p) => p.hulk)!;
        expect(['bus', 'hauler']).toContain(hulk.hulk);
        expect(Math.abs(relYaw(seed, hulk))).toBeGreaterThanOrEqual(HAZARDS.jackknife.yaw[0] - 0.5);
        for (const car of pieces.filter((p) => !p.hulk)) expect(Math.abs(relYaw(seed, car))).toBeLessThanOrEqual(HAZARDS.jackknife.carYaw + 0.5);
      }
    }
  });

  it('builds each scene from its recipe', () => {
    const seen = new Set<SceneKind>();
    for (const { scene } of allScenes()) {
      seen.add(scene.kind);
      const pieces = scene.rows.flat();
      const count = (kind: string) => pieces.filter((p) => p.kind === kind && !p.hulk).length;
      if (scene.kind === 'pileup') expect(pieces.filter((p) => p.hulk || p.kind === 'carWreck' || p.kind === 'deadTruck').length).toBeGreaterThanOrEqual(3);
      if (scene.kind === 'checkpoint') expect(scene.rows.length).toBeGreaterThanOrEqual(2);
      if (scene.kind === 'checkpoint') expect(count('barrier')).toBeGreaterThanOrEqual(8);
      if (scene.kind === 'tankline') expect([count('tank'), count('tankTrap') >= 6]).toEqual([1, true]);
      if (scene.kind === 'rockfall') expect([count('crag'), count('rock') >= 6]).toEqual([1, true]);
      if (scene.kind === 'craters') expect(scene.craters.length).toBeGreaterThanOrEqual(2);
      if (scene.kind === 'ramp') expect(scene.ramps).toHaveLength(1);
    }
    expect([...seen].sort()).toEqual(['checkpoint', 'craters', 'jackknife', 'pileup', 'ramp', 'roadblock', 'rockfall', 'tankline']);
  });

  it('blocks every lane center with a roadblock and leaves a verge gap wider than the semi', () => {
    const semi = CHASSIS[HAULER_KIT.chassis].radius;
    const blocks = allScenes().filter(({ scene }) => scene.kind === 'roadblock');
    expect(blocks.length).toBeGreaterThan(0);
    for (const { seed, j, scene } of blocks) {
      const spans = scene.rows.flat().map((p) => acrossSpan(seed, j - 1, p)).sort((a, b) => a[0] - b[0]);
      const label = `seed ${seed} stretch ${j}`;
      const wallLo = spans[0][0];
      const wallHi = Math.max(...spans.map((s) => s[1]));
      const gaps = spans.slice(1).map(([lo], i) => lo - Math.max(...spans.slice(0, i + 1).map((s) => s[1])));
      expect(Math.max(...gaps, 0), label).toBeLessThan(0.2);
      expect([wallLo <= -ROAD.asphalt, wallHi >= ROAD.asphalt], label).toEqual([true, true]);
      for (const c of ROAD.lanes) expect(wallLo <= c && c <= wallHi, `${label} lane ${c}`).toBe(true);
      expect(Math.max(wallLo + ROAD.verge, ROAD.verge - wallHi), label).toBeGreaterThanOrEqual(2 * semi + HAZARDS.roadblock.room);
      expect(leavesVergeGap(spans), label).toBe(true);
    }
  });

  it('draws no roadblock on stretch 1 and some on later stretches of several seeds', () => {
    const kinds = (j: number) => SEEDS.flatMap((seed) => stretchLayout(seed, j).scenes.map((s) => s.kind));
    expect(kinds(1)).not.toContain('roadblock');
    expect(kinds(2)).toContain('roadblock');
    const later = Array.from({ length: 14 }, (_, i) => i + 2);
    const perStretch = later.map((j) => kinds(j).filter((k) => k === 'roadblock').length / SEEDS.length);
    expect(perStretch.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(perStretch.reduce((a, b) => a + b, 0) / perStretch.length).toBeLessThanOrEqual(1);
    const weights = HAZARDS.tiers.map((t) => t.weights.roadblock);
    expect(weights).toEqual([...weights].sort((a, b) => a - b));
  });

  it('holds its scene count at the cap however far the run goes', () => {
    expect(scenesOf(1)).toBe(HAZARDS.scenes.first);
    expect(scenesOf(100)).toBe(HAZARDS.scenes.max);
    expect(stretchLayout(3, 60).scenes.length).toBeLessThanOrEqual(HAZARDS.scenes.max);
  });
});

function nCell(p: Vec): number {
  const n = Math.ceil(SIZE / CELL);
  return Math.floor(p.y / CELL) * n + Math.floor(p.x / CELL);
}

function inArena(seed: number, n: number): boolean {
  return STRETCHES.some((j) => stretchLayout(seed, j).arenas.some((a) => n >= a.from && n <= a.to));
}

describe('a highway window with its scenes', () => {
  it('holds nothing in an arena within the drivable corridor but poles and ditched cars', () => {
    for (const seed of SEEDS.slice(0, 8)) {
      for (const k of [0, 1, 2]) {
        const map = highwayMap(seed, k);
        const stray = map.props.filter((p) => {
          const at = toRoad(seed, k, p.pos);
          return inArena(seed, alongOf(seed, at)) && Math.abs(acrossOf(seed, at)) - p.r <= ROAD.verge && !['pole', 'carWreck', 'deadTruck'].includes(p.kind);
        });
        expect(stray.map((p) => p.kind), `seed ${seed} window ${k}`).toEqual([]);
        expect(map.props.filter((p) => p.hulk && inArena(seed, alongOf(seed, toRoad(seed, k, p.pos))))).toEqual([]);
      }
    }
  });

  it('keeps every loose piece off the fort and its concrete', () => {
    for (const seed of SEEDS.slice(0, 8)) {
      for (const k of [0, 1]) {
        const map = highwayMap(seed, k);
        const loose = map.props.filter((p) => !p.kind.startsWith('fort'));
        const forts = [k, k + 1].filter((j) => j >= 1).map((j) => ({ j, fort: outpostFort(seed, k, j) }));
        for (const { j } of forts) {
          const inYard = loose.filter((p) => {
            const at = toRoad(seed, k, p.pos);
            return Math.abs(at.n - milestoneAt(seed, j)) < outpostYardHalf() + p.r && Math.abs(at.u) < outpostYardHalf() + p.r;
          });
          expect(inYard.map((p) => p.kind), `seed ${seed} window ${k} fort ${j}`).toEqual([]);
        }
        expect(loose.filter((p) => map.terrain.types[Math.floor(p.pos.y) * SIZE + Math.floor(p.pos.x)] === 'concrete').map((p) => p.kind)).toEqual([]);
      }
    }
  });

  it('runs each fort line from its side walls to the ridges with no gap a truck could pass (IV2)', () => {
    const smallest = Math.min(...Object.values(CHASSIS).map((c) => c.radius));
    for (const seed of [1, 2, 3]) {
      for (const j of [1, 2, 3]) {
        const barriers = fortLine(seed, j).filter((p) => p.kind === 'barrier');
        expect(barriers.length).toBeGreaterThan(20);
        for (const side of [-1, 1]) {
          const across = barriers.map((p) => p.at.u * side).filter((u) => u > 0).sort((x, y) => x - y);
          expect(across[0] - 0.5, `seed ${seed} fort ${j}`).toBeLessThan(fortLineHole() + 0.5);
          expect(across[across.length - 1]).toBeGreaterThan(ROAD.badlands - 2);
        }
        const rows = [...new Set(barriers.map((p) => p.at.n.toFixed(2)))];
        expect(rows).toHaveLength(HAZARDS.closures.line.rows);
        for (const n of rows) {
          const us = barriers.filter((p) => p.at.n.toFixed(2) === n).map((p) => p.at.u).sort((x, y) => x - y);
          const gaps = us.slice(1).map((u, i) => u - us[i]).filter((g) => g < 2 * fortLineHole());
          expect(Math.max(...gaps, 0), `seed ${seed} fort ${j} row ${n}`).toBeLessThan(smallest * 2 + 2);
        }
      }
    }
  });

  it('closes the corridor of each window at both ends, so no route leaves it (IV2)', () => {
    const smallest = Math.min(...Object.values(CHASSIS).map((c) => c.radius));
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      for (const k of [0, 1, 2, 3]) {
        const map = highwayMap(seed, k);
        const layer = navLayer(map.terrain, mapObstacles(map), smallest);
        const nextYard = outpostFort(seed, k, k + 1).pos;
        const beyond = roadPoint(seed, k, milestoneAt(seed, k + 1) + 12, ROAD.lanes[1]);
        const behind = roadPoint(seed, k, (k === 0 ? southClosureAt(seed, k) : milestoneAt(seed, k)) - 12, ROAD.lanes[1]);
        const start = k === 0 ? roadPoint(seed, k, milestoneAt(seed, 0) + 4, ROAD.lanes[1]) : outpostFort(seed, k, k).pos;
        const inside = componentOf(layer, nCell(nextYard));
        expect(inside, `seed ${seed} window ${k}`).not.toBe(0);
        expect(componentOf(layer, nCell(start)), `seed ${seed} window ${k} start`).toBe(inside);
        expect(componentOf(layer, nCell(beyond)), `seed ${seed} window ${k} north`).not.toBe(inside);
        expect(componentOf(layer, nCell(behind)), `seed ${seed} window ${k} south`).not.toBe(inside);
      }
    }
  });

  it('lays the burnt pileup a fixed way behind the first milestone and only there', () => {
    for (const seed of [1, 2, 3]) {
      expect(southClosureAt(seed, 0)).toBe(milestoneAt(seed, 0) - HAZARDS.closures.south.behind);
      expect(closurePieces(seed, 0).filter((p) => Math.abs(p.at.n - southClosureAt(seed, 0)) < 5).length).toBeGreaterThan(0);
      for (const k of [1, 2, 5]) expect(closurePieces(seed, k).filter((p) => p.hulk || p.kind === 'deadTruck' || p.kind === 'carWreck')).toEqual([]);
    }
  });

  it('lays the closures from end-to-end barriers and burnt wrecks turned along their line', () => {
    const pieces = closurePieces(5, 0);
    const yaws = pieces.filter((p) => p.kind === 'barrier').map((p) => relYaw(5, p));
    expect(yaws.length).toBeGreaterThan(60);
    expect(yaws.every((y) => Math.abs(Math.abs(y) - 90) <= 5)).toBe(true);
    const wrecks = pieces.filter((p) => p.hulk || p.kind === 'carWreck' || p.kind === 'deadTruck');
    expect(wrecks.some((p) => p.hulk)).toBe(true);
    expect(wrecks.every((p) => Math.abs(Math.abs(relYaw(5, p)) - 90) <= HAZARDS.closures.south.yaw + 0.5)).toBe(true);
  });

  it('makes each hulk a lasting wreck obstacle of its chassis', () => {
    const map: BakedMap = highwayMap(2, 0);
    const hulks = mapObstacles(map).filter((o) => o.id.startsWith('hulk-'));
    expect(hulks.length).toBeGreaterThan(20);
    expect(hulks.every((o) => o.kind === 'wreck' && o.hulk !== undefined && o.hulk.chassisId in CHASSIS)).toBe(true);
    expect(() => propObstacle({ kind: 'deadTruck', pos: { x: 1, y: 1 }, r: 1, yaw: 0, group: 0, step: 0, hulk: 'nope' }, 0)).toThrow(/nope/);
  });

  it('builds a window with its scenes in good time', () => {
    const started = performance.now();
    highwayMap(13, 9);
    const ms = performance.now() - started;
    console.info(`highway window with scenes built in ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(1500);
  });
});

describe('a hull-plate ramp', () => {
  it('stands in one lane, rising north, with the rest of the road open', () => {
    for (const { seed, j, scene } of allScenes().filter((s) => s.scene.kind === 'ramp')) {
      const [ramp] = scene.ramps;
      expect(ramp.to.n).toBeGreaterThan(ramp.from.n);
      const d = acrossOf(seed, ramp.from);
      expect(leavesPassage([[d - ramp.width / 2, d + ramp.width / 2]]), `seed ${seed} stretch ${j}`).toBe(true);
    }
  });

  it('is the same deck in both windows that hold it', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      for (const k of [0, 1, 2]) {
        const stride = windowShift(seed, k).y;
        const shift = (spec: ReturnType<typeof highwayDecks>[number], by: number) => ({ ...spec, line: spec.line.map((s) => ({ at: { x: +s.at.x.toFixed(6), y: +(s.at.y + by).toFixed(6) }, rise: s.rise })) });
        const inOverlap = (spec: ReturnType<typeof highwayDecks>[number], from: number, to: number) => spec.line.every((s) => s.at.y >= from && s.at.y <= to);
        const a = highwayDecks(seed, k).filter((s) => inOverlap(s, 0, SIZE - stride)).map((s) => shift(s, 0));
        const b = highwayDecks(seed, k + 1).filter((s) => inOverlap(s, stride, SIZE)).map((s) => shift(s, -stride));
        expect(b).toEqual(a);
      }
    }
  });
});

describe('a stretch with its scenes turned off', () => {
  it('is one open arena', () => {
    const scenes = { ...HAZARDS.scenes };
    Object.assign(HAZARDS.scenes, { first: 0, max: 0 });
    try {
      const layout = stretchLayout(77, 3);
      expect(layout.scenes).toEqual([]);
      expect(layout.arenas).toHaveLength(1);
    } finally {
      Object.assign(HAZARDS.scenes, scenes);
    }
  });
});

describe('every stretch lays out', () => {
  const seeds = [...Array.from({ length: 60 }, (_, i) => i + 1), 15, 34, 38];
  const stretches = Array.from({ length: 40 }, (_, i) => i + 1);

  it('holds fewer scenes on short stretches and never throws for lack of room', () => {
    const short = seeds.flatMap((seed) => stretches.map((j) => ({ seed, j }))).filter(({ seed, j }) => j >= 3 && stretchLength(seed, j) <= HIGHWAY.stretch.min + 5);
    expect(short.length).toBeGreaterThan(20);
    for (const { seed, j } of short) {
      const layout = stretchLayout(seed, j);
      expect(layout.scenes.length).toBeLessThan(scenesOf(j));
      expect(layout.arenas.length).toBe(layout.scenes.length + 1);
    }
  });

  it('holds the full scene count on the longest stretches', () => {
    const long = seeds.flatMap((seed) => stretches.map((j) => ({ seed, j }))).filter(({ seed, j }) => stretchLength(seed, j) === HIGHWAY.stretch.max);
    expect(long.length).toBeGreaterThan(5);
    expect(long.some(({ seed, j }) => stretchLayout(seed, j).scenes.length === scenesOf(j))).toBe(true);
  });

  it('fits its scenes between arenas of the minimum length for stretches 1 to 40 on many seeds', () => {
    for (const seed of seeds.filter((_, i) => i % 3 === 0)) {
      for (const j of stretches) {
        const layout = stretchLayout(seed, j);
        expect(layout.scenes.length, `seed ${seed} stretch ${j}`).toBeLessThanOrEqual(scenesOf(j));
        for (const arena of layout.arenas) expect(arena.to - arena.from, `seed ${seed} stretch ${j}`).toBeGreaterThanOrEqual(HAZARDS.arenaMin);
        for (const [i, scene] of layout.scenes.entries()) {
          expect(scene.from).toBeGreaterThanOrEqual(layout.arenas[i].to - 1e-6);
          expect(scene.to).toBeLessThanOrEqual(layout.arenas[i + 1].from + 1e-6);
        }
      }
    }
  }, budget(90_000));
});
