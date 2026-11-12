import { describe, expect, it } from 'vitest';
import { HIGHWAY } from '../data/modes';
import { REGION } from '../data/region';
import { TERRITORIES } from '../data/territory';
import { deckAt } from '../sim/bridge';
import { siteGap } from '../sim/sites';
import { fullRoadEnds, isTerritory, territoryRoads, territoryTracks } from '../sim/territory';
import { dist, polylineDist, type Vec } from '../sim/vec';
import { TERRAIN_MARGIN, type PaintCanvas } from './groundPaint';
import { ASPHALT_STYLE, DRAWN_ROAD_HALF, drawnTrackLines, paintRoadMask, regionRoadRuns, REGION_ROAD_STYLE, TRACK_FIELD_REACH, TRACK_MOUTH, trackEdgeAt, trackFieldCodes, type RoadHole } from './roadPaint';
import { highwayAtlas } from '../sim/highway';
import { ICARUS_DECKS } from '../sim/bridge';
import { icarusAtlas, type Atlas } from '../sim/atlas';

const sun = REGION.locations.filter(isTerritory).find((l) => l.id === 'fallen-sun')!;
const SPUR_FADE = TERRITORIES['fallen-sun'].wreck!.spurFade;

type Clip = { x: number; y: number; w: number; h: number };
type Stroke = { style: unknown; alpha: number; width: number; lines: Vec[][]; filter: string; clip: Clip | null };

class RecordingContext {
  strokes: Stroke[] = [];
  fillStyle: unknown = null;
  strokeStyle: unknown = null;
  globalAlpha = 1;
  globalCompositeOperation = 'source-over';
  filter = 'none';
  lineWidth = 1;
  lineCap = 'butt';
  lineJoin = 'miter';
  canvas = {};
  clips: (Clip | null)[] = [];
  private lines: Vec[][] = [];
  private pending: Clip | null = null;
  private saved: { filter: string; globalAlpha: number; lineCap: string }[] = [];

  fills: { style: unknown; x: number; y: number; r: number }[] = [];
  fillRect() {}
  puts = 0;
  getImageData(_x: number, _y: number, w: number, h: number) {
    return { data: new Uint8ClampedArray(w * h * 4) };
  }
  putImageData() {
    this.puts++;
  }
  drawImage() {}
  private disc: { x: number; y: number; r: number } | null = null;
  arc(x: number, y: number, r: number) {
    this.disc = { x, y, r };
  }
  fill() {
    if (this.disc) this.fills.push({ style: this.fillStyle, ...this.disc });
  }
  save() {
    this.saved.push({ filter: this.filter, globalAlpha: this.globalAlpha, lineCap: this.lineCap });
  }
  restore() {
    Object.assign(this, this.saved.pop());
    this.clips.pop();
  }
  rect(x: number, y: number, w: number, h: number) {
    this.pending = { x, y, w, h };
  }
  clip() {
    this.clips.push(this.pending);
  }
  beginPath() {
    this.lines = [];
  }
  moveTo(x: number, y: number) {
    this.lines.push([{ x, y }]);
  }
  lineTo(x: number, y: number) {
    this.lines[this.lines.length - 1].push({ x, y });
  }
  stroke() {
    this.strokes.push({ style: this.strokeStyle, alpha: this.globalAlpha, width: this.lineWidth, lines: this.lines.map((l) => [...l]), filter: this.filter, clip: this.clips[this.clips.length - 1] ?? null });
  }
}

function paintedMask(atlas: Atlas = icarusAtlas(), holes: RoadHole[] = []): { canvas: PaintCanvas; strokes: Stroke[]; fills: RecordingContext['fills']; ctx: RecordingContext } {
  const res = 2;
  const from = -TERRAIN_MARGIN;
  const ctx = new RecordingContext();
  const canvas: PaintCanvas = {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    size: 64,
    res,
    from,
    toPx: (tiles) => (tiles - from) * res,
  };
  paintRoadMask(canvas, atlas, holes);
  return { canvas, strokes: ctx.strokes, fills: ctx.fills, ctx };
}

function channelAt(mask: { canvas: PaintCanvas; strokes: Stroke[] }, style: string, p: Vec): number {
  const px = { x: mask.canvas.toPx(p.x), y: mask.canvas.toPx(p.y) };
  let most = 0;
  for (const s of mask.strokes) {
    if (s.style !== style) continue;
    if (s.lines.some((line) => line.length > 1 && polylineDist(px, line) <= s.width / 2)) most = Math.max(most, s.alpha);
  }
  return most;
}

function backFromEnd(line: readonly Vec[], d: number): Vec {
  let left = d;
  for (let i = line.length - 1; i > 0; i--) {
    const [a, b] = [line[i - 1], line[i]];
    const len = dist(a, b);
    if (left <= len) return { x: b.x + ((a.x - b.x) * left) / len, y: b.y + ((a.y - b.y) * left) / len };
    left -= len;
  }
  throw new Error(`Line is shorter than ${d} tiles`);
}

describe('road mask', () => {
  const mask = paintedMask();
  const { roads, spurs } = territoryRoads(sun);
  const RED = REGION_ROAD_STYLE;

  it('leaves the dirt tracks to the edge field, never to a stroke', () => {
    expect(mask.strokes.every((s) => s.style === RED)).toBe(true);
    expect(mask.ctx.puts).toBe(1);
  });

  it('keeps the region roads red', () => {
    const road = REGION.roads[0];
    const p = road
      .slice(1)
      .map((b, i) => ({ x: (road[i].x + b.x) / 2, y: (road[i].y + b.y) / 2 }))
      .find((m) => deckAt(ICARUS_DECKS, m.x, m.y) === null && [...REGION.towns, ...REGION.locations].every((s) => siteGap(s, m) > 2))!;
    expect(channelAt(mask, RED, p)).toBe(1);
  });

  it('blurs no stroke, since the blur would soften the green channel', () => {
    expect(mask.strokes.every((s) => s.filter === 'none')).toBe(true);
  });

  it('strokes the region roads without a clip or filter', () => {
    const red = mask.strokes.filter((s) => s.style === REGION_ROAD_STYLE);
    expect(red.length).toBeGreaterThan(0);
    for (const s of red) {
      expect(s.clip).toBeNull();
      expect(s.filter).toBe('none');
    }
  });

  it('leaves the canvas state as it found it', () => {
    expect(mask.ctx.clips).toEqual([]);
    expect(mask.ctx.filter).toBe('none');
    expect(mask.ctx.globalCompositeOperation).toBe('source-over');
    expect(mask.ctx.globalAlpha).toBe(1);
  });
});

describe('highway asphalt paint', () => {
  const highway = highwayAtlas(4, 1);

  it('paints the highway asphalt as a smooth band past the tile edge, and leaves crater holes in it', () => {
    const hole = { pos: highway.roads[0].points[40], radius: 2 };
    const mask = paintedMask(highway, [hole]);
    const band = mask.strokes.find((s) => s.style === ASPHALT_STYLE)!;

    expect(band.width).toBeCloseTo((10 + 2 * HIGHWAY.road.paint.bandSpread) * mask.canvas.res, 6);
    expect(mask.fills).toEqual([{ style: '#000', x: mask.canvas.toPx(hole.pos.x), y: mask.canvas.toPx(hole.pos.y), r: 2 * mask.canvas.res }]);
    expect(paintedMask().strokes.some((s) => s.style === ASPHALT_STYLE)).toBe(false);
  });

  it('paints only asphalt on the highway: no lane lines and no dirt road', () => {
    const strokes = paintedMask(highway).strokes.filter((s) => s.lines.length > 0);

    expect(new Set(strokes.map((s) => s.style))).toEqual(new Set([ASPHALT_STYLE]));
  });
});

describe('track edge field', () => {
  const lines = territoryTracks(sun);
  const around = { size: 400, res: 2, from: Math.min(sun.pos.x, sun.pos.y) - 60 };
  const codes = trackFieldCodes({ ...around }, lines, () => true);
  const codeAt = (p: Vec) => codes[Math.floor((p.y - around.from) * around.res) * around.size + Math.floor((p.x - around.from) * around.res)];
  const inWindow = (p: Vec) => [p.x, p.y].every((v) => v - around.from > TRACK_FIELD_REACH && (v - around.from) * around.res < around.size - TRACK_FIELD_REACH * around.res);
  const plain = lines.find((l) => l.fade === 0 && !l.joins.start && !l.joins.end && l.points.slice(0, 2).every(inWindow))!;
  const spur = lines.find((l) => l.fade > 0)!;

  it('lists every track road of every territory and no old road', () => {
    const all = REGION.locations.filter(isTerritory).flatMap(territoryTracks);
    const expected = REGION.locations.filter(isTerritory).flatMap((l) => {
      const rules = TERRITORIES[l.id];
      return [...(rules.wreck?.roads ?? []), ...(rules.wreck?.spurs ?? []), ...(rules.farm?.roads ?? [])].filter((r) => r.surface === 'track');
    });
    expect(all).toHaveLength(expected.length);
    expect(all.length).toBeGreaterThan(lines.length);
    expect(drawnTrackLines(icarusAtlas())).toEqual(all);
  });

  it('decodes below the midpoint inside a track, at it on the edge, above it outside', () => {
    const mid = { x: (plain.points[0].x + plain.points[1].x) / 2, y: (plain.points[0].y + plain.points[1].y) / 2 };
    expect(trackEdgeAt(lines, mid)).toBeCloseTo(-plain.width / 2, 1);
    expect(codeAt(mid)).toBeLessThan(128);
    expect(trackEdgeAt([plain], { x: 0, y: 0 })).toBeGreaterThan(TRACK_FIELD_REACH);
    const dx = plain.points[1].x - plain.points[0].x;
    const dy = plain.points[1].y - plain.points[0].y;
    const norm = Math.hypot(dx, dy);
    const outside = { x: mid.x - (dy / norm) * (plain.width / 2 + 2), y: mid.y + (dx / norm) * (plain.width / 2 + 2) };
    if (trackEdgeAt(lines, outside) > 1.9) expect(codeAt(outside)).toBeGreaterThan(128);
  });

  it('narrows a spur to a point at its tip', () => {
    const tip = spur.points[spur.points.length - 1];
    const back = backFromEnd(spur.points, spur.fade);
    expect(trackEdgeAt([spur], tip)).toBeCloseTo(0, 5);
    expect(trackEdgeAt([spur], backFromEnd(spur.points, spur.fade / 2))).toBeGreaterThan(-spur.width / 2);
    expect(trackEdgeAt([spur], back)).toBeLessThan(-spur.width / 2 + 1);
  });

  it('writes the outside code where no track lies, and none on a deck', () => {
    const mid = { x: (plain.points[0].x + plain.points[1].x) / 2, y: (plain.points[0].y + plain.points[1].y) / 2 };
    const blocked = trackFieldCodes({ ...around }, lines, () => false);
    expect(blocked.every((c) => c === 255)).toBe(true);
    expect(codeAt(mid)).toBeLessThan(255);
  });

  it('draws no track on Chaos Highway', () => {
    expect(drawnTrackLines(highwayAtlas(4, 1))).toEqual([]);
  });

  it('rejects a track line with one point or no width', () => {
    expect(() => territoryTracks({ ...sun, id: 'nowhere' } as never)).toThrow();
  });
});

describe('joins of tracks and full roads', () => {
  const atlas = icarusAtlas();
  const runs = regionRoadRuns(atlas);
  const orchard = REGION.locations.filter(isTerritory).find((l) => l.id === 'orchard')!;
  const lines = territoryTracks(sun);
  const roadGap = (p: Vec) => Math.min(...runs.map((run) => Math.min(...run.map((q) => dist(p, q))))) - DRAWN_ROAD_HALF;
  const union = (p: Vec) => Math.min(roadGap(p), trackEdgeAt(lines, p));
  const joins = fullRoadEnds(sun).map((end) => {
    const line = lines.find((l) => (l.joins.start && dist(l.points[0], end) < 1) || (l.joins.end && dist(l.points.at(-1)!, end) < 1))!;
    const points = line.joins.start ? line.points : [...line.points].reverse();
    return { end, line, points };
  });

  it('draws every region road to its end inside a territory (IV10)', () => {
    for (const t of [sun, orchard]) for (const end of fullRoadEnds(t)) expect(roadGap(end), `${t.id} ${end.x},${end.y}`).toBeLessThan(-DRAWN_ROAD_HALF + 0.5);
  });

  it('still stops region roads at a town with pads', () => {
    const town = REGION.towns.find((t) => REGION.roads.some((road) => siteGap(t, road[0]) < -2 || siteGap(t, road.at(-1)!) < -2))!;
    for (const run of runs) for (const p of run) expect(siteGap(town, p), `${p.x},${p.y}`).toBeGreaterThanOrEqual(0);
  });

  it('leaves no gap from the road end into the first 4 tiles of each joined track (IV11)', () => {
    expect(joins).toHaveLength(3);
    for (const { end, line, points } of joins) {
      for (const p of walk([end, ...points], 4 + dist(end, points[0]), 0.1)) {
        expect(union(p), `${p.x},${p.y}`).toBeLessThan(0);
        const dir = ahead(points, p);
        const across = { x: -dir.y, y: dir.x };
        const half = line.width / 2 - 0.05;
        for (const side of [1, -1]) expect(union({ x: p.x + across.x * half * side, y: p.y + across.y * half * side }), `${p.x},${p.y} side ${side}`).toBeLessThan(0);
      }
    }
  });

  it('opens each joined track inside the asphalt cap at the join', () => {
    for (const { end, points } of joins) {
      expect(trackEdgeAt(lines, points[0])).toBeCloseTo(-(DRAWN_ROAD_HALF - TRACK_MOUTH.inset), 5);
      expect(dist(end, points[0]) + DRAWN_ROAD_HALF - TRACK_MOUTH.inset).toBeLessThanOrEqual(DRAWN_ROAD_HALF);
    }
  });

  it('keeps a track with no join at its lane width (IV14)', () => {
    const plain = REGION.locations.filter(isTerritory).flatMap(territoryTracks).filter((l) => !l.joins.start && !l.joins.end && l.fade === 0);
    for (const line of plain) {
      const mid = { x: (line.points[0].x + line.points[1].x) / 2, y: (line.points[0].y + line.points[1].y) / 2 };
      expect(trackEdgeAt([line], mid)).toBeCloseTo(-line.width / 2, 6);
      expect(trackEdgeAt([line], line.points[0])).toBeCloseTo(-line.width / 2, 6);
    }
  });
});

function walk(points: readonly Vec[], length: number, step: number): Vec[] {
  const out: Vec[] = [];
  let gone = 0;
  for (let i = 1; i < points.length && gone < length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const d = dist(a, b);
    for (let s = 0; s < d && gone + s <= length; s += step) out.push({ x: a.x + ((b.x - a.x) * s) / d, y: a.y + ((b.y - a.y) * s) / d });
    gone += d;
  }
  return out;
}

function ahead(points: readonly Vec[], p: Vec): Vec {
  let best = { d: Infinity, dir: { x: 1, y: 0 } };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const d = polylineDist(p, [a, b]);
    const n = dist(a, b);
    if (d < best.d) best = { d, dir: { x: (b.x - a.x) / n, y: (b.y - a.y) / n } };
  }
  return best.dir;
}
