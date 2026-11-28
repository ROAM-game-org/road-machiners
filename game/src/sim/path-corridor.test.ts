import { describe, expect, it } from 'vitest';
import { resetPerf, perfSnapshot } from '../perf';
import { findCells, nearestFreeCell, stampOverlay } from './nav/astar';
import { blockedAt, buildEveryCell, COARSE, componentOf, dynamicBlockers, navLayer, slowAt } from './nav/layer';
import { regionAt } from './nav/cells';
import { isCliff, tileAt } from './terrain';
import { emptyWorld } from './testkit';
import { dist, type Vec } from './vec';
import { budget } from '../test/budget';
import { cellSpan, LONG_CELLS, mulberry, Ref, referenceLayer, startWorld } from '../test/path-reference-rules';

describe('long routes search a coarse corridor', () => {
  const w = startWorld(1);

  it('coarse regions are the connected pieces of each block, linked where their cells touch', () => {
    const layer = navLayer(w.terrain, w.obstacles, 0.6);
    buildEveryCell(layer);
    const n = layer.n;
    const { bn } = layer.grid;
    const { block, slow, links } = layer.grid.regions;
    const region = (c: number) => regionAt(layer.grid, c);
    expect(bn).toBe(Math.ceil(n / COARSE));
    const blockOfCell = (x: number, y: number) => Math.floor(y / COARSE) * bn + Math.floor(x / COARSE);
    const linked = (a: number, b: number) => links[a].includes(b);
    const slowSum = new Float64Array(block.length);
    const size = new Uint32Array(block.length);
    let wrong = 0;
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const c = y * n + x;
        const r = region(c);
        if ((r === 0) !== (layer.blocked.at(c) === 1)) wrong++;
        if (r === 0) continue;
        if (block[r] !== blockOfCell(x, y)) wrong++;
        slowSum[r] += slowAt(layer, c);
        size[r]++;
        for (const [dx, dy] of [[1, 0], [-1, 1], [0, 1], [1, 1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= n || ny >= n) continue;
          const o = region(ny * n + nx);
          if (o === 0) continue;
          if (blockOfCell(nx, ny) === blockOfCell(x, y)) {
            if (o !== r) wrong++;
          } else if (o !== r && !(linked(r, o) && linked(o, r))) wrong++;
        }
      }
    expect(wrong).toBe(0);
    for (let r = 1; r < block.length; r++) if (block[r] !== -1) expect(slow[r]).toBeCloseTo(slowSum[r] / size[r], 5);
    expect(block.length - 1).toBeGreaterThan(new Set(block.slice(1)).size);
  });

  it('free cells share a component exactly when a step path joins them', () => {
    const w = emptyWorld();
    const center = { x: 100, y: 100 };
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * 2 * Math.PI;
      w.obstacles = [...w.obstacles, { id: `ring-${i}`, pos: { x: center.x + 10 * Math.cos(a), y: center.y + 10 * Math.sin(a) }, r: 1, kind: 'rock' }];
    }
    const layer = navLayer(w.terrain, w.obstacles, 0.6);
    const n = layer.n;
    const cell = (p: Vec) => Math.floor(p.y / 0.5) * n + Math.floor(p.x / 0.5);
    const inside = cell(center);
    const outside = cell({ x: 30, y: 30 });
    const far = cell({ x: 500, y: 400 });
    expect(blockedAt(layer, inside)).toBe(false);
    expect(componentOf(layer, inside)).not.toBe(componentOf(layer, outside));
    expect(componentOf(layer, outside)).toBe(componentOf(layer, far));
    let blockedWithComponent = 0;
    for (let c = 0; c < n * n; c++) if (blockedAt(layer, c) && componentOf(layer, c) !== 0) blockedWithComponent++;
    expect(blockedWithComponent).toBe(0);
  });

  it('unreachable goals return null in under 5 ms, like the full search', () => {
    const flatAround = (p: Vec) => {
      for (let y = p.y - 14; y <= p.y + 14; y++) for (let x = p.x - 14; x <= p.x + 14; x++) if (isCliff(w.terrain, tileAt(w.terrain, { x, y }))) return false;
      return true;
    };
    const center = Array.from({ length: 25 * 25 }, (_, i) => ({ x: 60 + (i % 25) * 20, y: 60 + Math.floor(i / 25) * 20 })).find(flatAround)!;
    expect(center).toBeDefined();
    const obstacles = w.obstacles.filter((o) => dist(o.pos, center) > 14);
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * 2 * Math.PI;
      obstacles.push({ id: `ring-${i}`, pos: { x: center.x + 10 * Math.cos(a), y: center.y + 10 * Math.sin(a) }, r: 1, kind: 'rock' });
    }
    const local = { ...w, obstacles };
    const radius = 0.6;
    const layer = navLayer(local.terrain, local.obstacles, radius);
    const overlay = stampOverlay(layer, dynamicBlockers(local.obstacles, local.terrain, []), radius);
    const g = Ref.grid(referenceLayer(local.terrain, radius), Ref.blockers(local, []), radius, Ref.breakables(local));
    const goal = Ref.cellOf(g, center);
    const from = { x: 40, y: 40 };
    const start = nearestFreeCell(layer, overlay, Ref.cellOf(g, from))!;
    expect(g.blocked[goal]).toBe(0);
    expect(Ref.astar(g, start, goal)).toBeNull();
    const t = performance.now();
    const got = findCells(layer, overlay, start, goal, null);
    const ms = performance.now() - t;
    expect(got).toBeNull();
    expect(ms).toBeLessThan(5);
  }, budget(60_000));

  it('a corridor cut by a kill wreck wall plans again around the wall, never over the whole map', () => {
    const w = emptyWorld();
    for (let y = 16; y < w.size; y += 1.5) w.obstacles = [...w.obstacles, { id: `wreck-w${y}`, pos: { x: 80, y }, r: 1, kind: 'wreck' }];
    const radius = 0.6;
    const layer = navLayer(w.terrain, w.obstacles, radius);
    const overlay = stampOverlay(layer, dynamicBlockers(w.obstacles, w.terrain, []), radius);
    const n = layer.n;
    const start = 200 * n + 60;
    const goal = 200 * n + 260;
    resetPerf();
    const got = findCells(layer, overlay, start, goal, null);
    expect(perfSnapshot()['route-corridor-miss']?.calls).toBe(2);
    expect(got).not.toBeNull();
    expect(got![got!.length - 1]).toBe(goal);
    for (const c of got!) expect(layer.blocked.at(c) === 0 && overlay.stamp.at(c) !== overlay.gen).toBe(true);
    expect(Math.min(...Array.from(got!, (c) => Math.floor(c / n)))).toBeLessThan(32);
  });

  it('long routes with no dynamic blockers never miss the corridor', () => {
    const rand = mulberry(8);
    const radius = 0.8;
    const layer = navLayer(w.terrain, w.obstacles, radius);
    const overlay = stampOverlay(layer, [], radius);
    const n = layer.n;
    resetPerf();
    let found = 0;
    for (let i = 0; i < 20; i++) {
      const a = nearestFreeCell(layer, overlay, Math.floor(rand() * n * n))!;
      const b = nearestFreeCell(layer, overlay, Math.floor(rand() * n * n))!;
      if (componentOf(layer, a) !== componentOf(layer, b) || cellSpan(n, a, b) <= LONG_CELLS) continue;
      expect(findCells(layer, overlay, a, b, null)).not.toBeNull();
      found++;
    }
    expect(found).toBeGreaterThanOrEqual(5);
    expect(perfSnapshot()['route-corridor-miss']).toBeUndefined();
  }, budget(60_000));
});
