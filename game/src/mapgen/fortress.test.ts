
import { describe, expect, it } from 'vitest';
import { FORTRESS_SITES, NOSE_RISE, NOSE_ROCK } from '../data/fortress';
import { REGION } from '../data/region';
import { TERRAIN } from '../data/terrain';
import { FORT_MODELS, fortressPieces, insideCurtain, pitDepth } from '../sim/fortress';
import { PHYSICS } from '../data/physics';
import { noseFrame } from '../sim/nose';
import { sitePads } from '../sim/sites';
import { dist, segmentDist } from '../sim/vec';
import { newDraft, typeCode, type MapDraft } from './bake';
import { fortressLayer } from './fortress';
import { noseRiseAt, noseRiseReach } from './nose-rise';

const RIM = 5;
const SAND = typeCode('sand');
const bowl = REGION.towns.find((t) => t.id === 'bowl')!;
const pit = FORTRESS_SITES.bowl.pit!;

function flatDraft(): MapDraft {
  const d = newDraft(REGION.size);
  d.heights.fill(RIM);
  d.types.fill(SAND);
  return d;
}

describe('fortress layer', () => {
  const d = fortressLayer(flatDraft());
  const n = d.size + 1;

  it('bakes every fortress site piece as a prop of its style and Nose rock as no prop', () => {
    const sites = [...REGION.towns, ...REGION.locations].filter((s) => s.id in FORTRESS_SITES);
    expect(d.props).toHaveLength(sites.reduce((sum, s) => sum + fortressPieces(s).length, 0));
    expect(d.props.filter((p) => !FORT_MODELS.has(p.kind))).toEqual([]);
  });

  const nose = REGION.towns.find((t) => t.id === 'nose')!;
  const frame = noseFrame(nose);
  const S = PHYSICS.metersPerTile;
  const corners: { p: { x: number; y: number }; lift: number; rise: ReturnType<typeof noseRiseAt>; x: number; v: number }[] = [];
  const window = Math.ceil(noseRiseReach() / S + NOSE_ROCK.run + NOSE_ROCK.jag);
  for (let y = Math.floor(nose.pos.y - window); y <= nose.pos.y + window; y++) {
    for (let x = Math.floor(nose.pos.x - window); x <= nose.pos.x + window; x++) {
      const du = (x - nose.pos.x) * frame.u.x + (y - nose.pos.y) * frame.u.y;
      const dv = (x - nose.pos.x) * frame.v.x + (y - nose.pos.y) * frame.v.y;
      corners.push({ p: { x, y }, lift: d.heights[y * n + x] - RIM, rise: noseRiseAt(du * S, dv * S), x: du * S, v: dv * S });
    }
  }

  it('raises Nose rock to the heightfield of its model, give or take the facet jitter', () => {
    const rock = corners.filter((c) => c.rise !== null);
    expect(rock.length).toBeGreaterThan(2000);
    for (const c of rock) expect(Math.abs(c.lift - Math.max(0, c.rise!.height) / S), `corner ${c.p.x},${c.p.y}`).toBeLessThanOrEqual(c.rise!.jitter / S + 1e-4);
    expect(Math.max(...rock.map((c) => c.lift))).toBeGreaterThan(10);
  });

  it('lays a cradle under the ship below its belly, and a low front toward the yard', () => {
    const { joint, axisV, hullR, cradleTop, cradleLift, jitter, frontV } = NOSE_RISE;
    const clearOfCrag = NOSE_RISE.crag.edgeX + NOSE_RISE.crag.edgePad;
    const cradle = corners.filter((c) => c.rise !== null && Math.abs(c.v - axisV) < S && c.x > clearOfCrag && c.x < joint.x + 50);
    expect(cradle.length).toBeGreaterThan(20);
    for (const c of cradle) {
      const belly = joint.z + (c.x - joint.x) * Math.tan((NOSE_RISE.pitch * Math.PI) / 180) - hullR;
      expect(c.lift * S, `cradle at ${c.x.toFixed(0)}`).toBeLessThanOrEqual(Math.min(belly, cradleTop) + cradleLift + jitter.rubble + 1e-3);
    }
    const front = corners.filter((c) => c.rise !== null && c.v < frontV + S && Math.hypot(c.x, c.v) < NOSE_RISE.mountStart);
    expect(front.length).toBeGreaterThan(10);
    for (const c of front) expect(c.lift * S, `front at ${c.x.toFixed(0)}`).toBeLessThan(NOSE_RISE.terraceZ + 2 * jitter.rubble);
  });

  it('slopes Nose rock down into the land outside its circle, off its roads and pads, and only there', () => {
    const raised = corners.filter((c) => c.rise === null && c.lift !== 0).map((c) => ({ p: c.p, h: c.lift }));
    expect(Math.min(...raised.map((r) => r.h))).toBeGreaterThan(0);
    expect(raised.length).toBeGreaterThan(1000);
    expect(Math.max(...raised.map((r) => r.h))).toBeLessThan(NOSE_RISE.peak / S);
    for (const { p } of raised) expect(dist(p, nose.pos)).toBeGreaterThan(nose.radius);
    const scree = typeCode('scree');
    const up = (x: number, y: number) => d.heights[y * n + x] > RIM;
    for (const { p } of raised) {
      const onMargin = dist({ x: p.x + 0.5, y: p.y + 0.5 }, nose.pos) < nose.radius + TERRAIN.types.siteMargin;
      if (!onMargin && up(p.x, p.y) && up(p.x + 1, p.y) && up(p.x, p.y + 1) && up(p.x + 1, p.y + 1)) expect(d.types[p.y * d.size + p.x], `tile ${p.x},${p.y}`).toBe(scree);
    }
    const roads = REGION.roads.flatMap((road) => road.slice(1).map((b, i) => [road[i], b] as const));
    for (const { p } of raised) {
      expect(Math.min(...roads.map(([a, b]) => segmentDist(p, a, b))) - REGION.roadWidth / 2).toBeGreaterThan(NOSE_ROCK.clear);
      for (const pad of sitePads(nose)) expect(dist(p, pad) - REGION.sites.pad.width / 2).toBeGreaterThan(NOSE_ROCK.clear);
    }
  });

  it('clears the earlier props Nose rock would bury, and keeps the rest', () => {
    const draft = flatDraft();
    const nose = REGION.towns.find((t) => t.id === 'nose')!;
    const { u, v } = noseFrame(nose);
    const buried = { x: nose.pos.x + v.x * 40, y: nose.pos.y + v.y * 40 };
    const open = { x: nose.pos.x - v.x * 40 + u.x, y: nose.pos.y - v.y * 40 + u.y };
    draft.props = [buried, open].map((pos) => ({ kind: 'rock', pos, r: 1, yaw: 0, group: 0, step: 0 }));
    const kept = fortressLayer(draft).props.filter((p) => p.kind === 'rock');
    expect(kept.map((p) => p.pos)).toEqual([open]);
  });

  it('lowers each corner inside the Bowl curtain by its pit depth and no other corner (IV17)', () => {
    const lowered: number[] = [];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const h = d.heights[j * n + i];
        if (h >= RIM) continue;
        const p = { x: i, y: j };
        expect(insideCurtain(bowl, p, pit.margin), `corner ${i},${j}`).toBe(true);
        expect(h).toBeCloseTo(RIM - pitDepth(bowl, p), 5);
        lowered.push(h);
      }
    }
    expect(Math.min(...lowered)).toBeCloseTo(RIM - pit.terraces * pit.stepHeight, 5);
  });

  it('types flat pit tiles as field and its risers as scree, and leaves the rest', () => {
    const field = typeCode('field');
    const scree = typeCode('scree');
    const counts = { field: 0, scree: 0 };
    for (let y = 0; y < d.size; y++) {
      for (let x = 0; x < d.size; x++) {
        const corners = [d.heights[y * n + x], d.heights[y * n + x + 1], d.heights[(y + 1) * n + x], d.heights[(y + 1) * n + x + 1]];
        const type = d.types[y * d.size + x];
        if (corners.some((h) => h > RIM)) continue;
        if (corners.every((h) => h === RIM)) {
          expect(type, `tile ${x},${y}`).toBe(SAND);
        } else if (corners.every((h) => h === corners[0])) {
          expect(type, `tile ${x},${y}`).toBe(field);
          counts.field++;
        } else {
          expect(type, `tile ${x},${y}`).toBe(scree);
          counts.scree++;
        }
      }
    }
    expect(counts.field).toBeGreaterThan(counts.scree);
    expect(counts.scree).toBeGreaterThan(0);
  });
});
