import { MINIMAP, WORLD_MAP } from '../data/minimap';
import { paintBase, newFogImage, paintFog } from '../render/minimap-paint';
import { atlasKeyString, atlasOf, atlasSites } from '../sim/atlas';
import { mappedSites } from '../sim/locations';
import { gridSquareTiles } from '../sim/map-grid';
import { MAP_GRID } from '../data/region';
import type { Terrain } from '../sim/terrain';
import { playerVehicle } from '../sim/damage';
import type { World } from '../sim/types';
import type { Vec } from '../sim/vec';
import { say } from '../text/language';
import { el } from './dom';
import { gridColumnLetter, gridRowNumber } from './format';
import { distanceText } from './units';
import { siteName } from '../text/names';
import { t, type Msg } from '../text/msg';
import { canvasTransform, fitTileSize, scaleBarTiles, fitted, pinToEdge, toPx, toTile, viewport, zoomAround, panBy, clampPan, type MapPoint, type Viewport } from './map-geometry';
import { token } from './tokens';
import { uiSize } from './ui-size';

export type MapRule = { kind: 'follow'; reach: number } | { kind: 'free' } | { kind: 'fit' };
export type MapTruck = { pos: Vec; heading: number };
export type MapSite = { id: string; kind: 'town' | 'site'; pos: Vec; known: boolean };
export type MapOverlay = (ctx: CanvasRenderingContext2D, view: Viewport) => void;

const BASES_KEPT = 3;
const TIP_GAP = 12;
const ZOOM_SLACK = 1.001;
const MARK = { town: 5, site: 4, truck: 8, hit: 8, pinned: 0.6 };
const NAME = { gap: 6, padX: 4, padY: 2 };
const GRID = { width: 1, alpha: 0.3, gap: 3, padX: 3, padY: 1 };
const PLATE = { inset: 8, pad: 5, arrowWidth: 10, arrowHeight: 12, tick: 5, gap: 3 };
const bases = new Map<string, HTMLCanvasElement>();

function clipSegment(from: Vec, to: Vec, box: Box): [Vec, Vec] | null {
  let enter = 0;
  let leave = 1;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const edges: [number, number][] = [[-dx, from.x - box.x0], [dx, box.x1 - from.x], [-dy, from.y - box.y0], [dy, box.y1 - from.y]];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) enter = Math.max(enter, t);
    else leave = Math.min(leave, t);
  }
  if (enter > leave) return null;
  return [{ x: from.x + enter * dx, y: from.y + enter * dy }, { x: from.x + leave * dx, y: from.y + leave * dy }];
}

function tileCanvas(size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return c;
}

function putPixels(canvas: HTMLCanvasElement, pixels: Uint8ClampedArray): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.putImageData(new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, canvas.width, canvas.height), 0, 0);
}

function baseFor(terrain: Terrain): HTMLCanvasElement {
  const key = `${atlasKeyString(terrain.atlas)}:${terrain.size}`;
  const found = bases.get(key);
  if (found) return found;
  const canvas = tileCanvas(terrain.size);
  putPixels(canvas, paintBase(terrain));
  bases.set(key, canvas);
  while (bases.size > BASES_KEPT) bases.delete(bases.keys().next().value as string);
  return canvas;
}

type Box = { x0: number; y0: number; x1: number; y1: number };
type Plates = { north: Box; scale: Box; tiles: number; label: Msg };
type GridLabel = { text: string; font: string; box: Box };
function around(at: { x: number; y: number }, r: number): Box {
  return { x0: at.x - r, y0: at.y - r, x1: at.x + r, y1: at.y + r };
}

function overlaps(a: Box, b: Box): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

function placePlate(at: { x: number; y: number }, wide: number, tall: number, taken: Box[]): Box {
  const side = MARK.town + NAME.gap;
  const middle = { y0: at.y - tall / 2, y1: at.y + tall / 2 };
  const centred = { x0: at.x - wide / 2, x1: at.x + wide / 2 };
  const choices: Box[] = [
    { x0: at.x + side, x1: at.x + side + wide, ...middle },
    { x0: at.x - side - wide, x1: at.x - side, ...middle },
    { ...centred, y0: at.y + side - NAME.gap / 2, y1: at.y + side - NAME.gap / 2 + tall },
    { ...centred, y0: at.y - side + NAME.gap / 2 - tall, y1: at.y - side + NAME.gap / 2 },
  ];
  return choices.find((box) => taken.every((other) => !overlaps(box, other))) ?? choices[0];
}

export function observeBox(box: HTMLElement, view: MapView, resized: () => void = () => {}): void {
  new ResizeObserver(([entry]) => {
    const size = entry.contentRect;
    view.resize(Math.floor(size.width), Math.floor(size.height), uiSize().applied() * window.devicePixelRatio);
    resized();
  }).observe(box);
}

export function poseOf(world: World): MapTruck {
  const me = playerVehicle(world);
  return { pos: me.pos, heading: me.heading };
}

export function mapSites(world: World): MapSite[] {
  const found = new Set(world.player.discovered);
  const mapped = mappedSites(world);
  const towns = new Set(atlasOf(world.terrain).towns.map((s) => s.id));
  return atlasSites(atlasOf(world.terrain))
    .filter((s) => mapped.has(s.id))
    .map((s): MapSite => ({ id: s.id, kind: towns.has(s.id) ? 'town' : 'site', pos: s.pos, known: found.has(s.id) }));
}

export function markName(site: MapSite): Msg {
  return site.known ? siteName(site.id) : t('map.unknownSite');
}

export class MapView {
  readonly canvas: HTMLCanvasElement;
  private fog: ReturnType<typeof newFogImage> | null = null;
  private fogCanvas: HTMLCanvasElement | null = null;
  private fogSize = 0;
  private view: Viewport | null = null;
  private sites: MapSite[] = [];
  private world: World | null = null;
  private truck: MapTruck | null = null;
  private ratio: number;
  private drawRequest = 0;

  constructor(private rule: MapRule, private width: number, private height: number, private overlay: MapOverlay | null = null, ratio = 2) {
    this.ratio = ratio;
    this.canvas = el('canvas', { class: 'map-view', width: Math.round(width * ratio), height: Math.round(height * ratio) }) as HTMLCanvasElement;
  }

  setReach(reach: number): void {
    this.rule = { kind: 'follow', reach };
    this.draw();
  }

  resize(width: number, height: number, ratio: number): void {
    if (width <= 0 || height <= 0 || ratio <= 0) return;
    if (width === this.width && height === this.height && ratio === this.ratio) return;
    this.width = width;
    this.height = height;
    this.ratio = ratio;
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    if (this.view) this.view = { ...this.view, width, height };
    this.draw();
  }

  reset(): void {
    this.view = null;
  }

  update(world: World, truck: MapTruck | null): void {
    this.world = world;
    this.truck = truck;
    this.sites = mapSites(world);
    this.syncFog(world.player.explored, world.terrain.size);
    this.draw();
  }

  zoomBy(factor: number, px = this.width / 2, py = this.height / 2): void {
    const v = this.view;
    if (!v || !this.world) return;
    this.view = zoomAround(v, factor, px, py, this.world.terrain.size, WORLD_MAP.maxTileSize);
    this.drawSoon();
  }

  panBy(dx: number, dy: number): void {
    const v = this.view;
    if (!v || !this.world) return;
    this.view = panBy(v, dx, dy, this.world.terrain.size);
    this.drawSoon();
  }

  canZoomIn(): boolean {
    return this.view !== null && this.view.tileSize * ZOOM_SLACK < WORLD_MAP.maxTileSize;
  }

  canZoomOut(): boolean {
    const v = this.view;
    if (!v || !this.world) return false;
    return v.tileSize > fitTileSize(this.world.terrain.size, v.width, v.height) * ZOOM_SLACK;
  }

  localPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const box = this.canvas.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return null;
    return { x: ((clientX - box.left) / box.width) * this.width, y: ((clientY - box.top) / box.height) * this.height };
  }

  bindTip(tip: HTMLElement): void {
    let shown: string | null = null;
    const hide = () => {
      shown = null;
      tip.style.display = 'none';
    };
    hide();
    this.canvas.addEventListener('pointerleave', hide);
    this.canvas.addEventListener('pointermove', (e) => {
      const site = this.siteAt(e.clientX, e.clientY);
      if (!site) return hide();
      if (shown !== site.id) {
        shown = site.id;
        tip.replaceChildren(el('span', {}, markName(site)));
      }
      const box = this.canvas.getBoundingClientRect();
      tip.style.display = '';
      tip.style.left = `${uiSize().toLayer(e.clientX - box.left) + TIP_GAP}px`;
      tip.style.top = `${uiSize().toLayer(e.clientY - box.top) + TIP_GAP}px`;
    });
  }

  private requireWorld(): World {
    if (!this.world) throw new Error('The map has no world yet');
    return this.world;
  }

  pick(clientX: number, clientY: number): Vec | null {
    const at = this.localPoint(clientX, clientY);
    if (!at || !this.view) return null;
    return toTile(this.view, at.x, at.y);
  }

  siteAt(clientX: number, clientY: number): MapSite | null {
    const at = this.localPoint(clientX, clientY);
    if (!at || !this.view) return null;
    let best: { site: MapSite; gap: number } | null = null;
    for (const site of this.sites) {
      const mark = this.markAt(this.view, site);
      const gap = Math.hypot(mark.x - at.x, mark.y - at.y);
      if (gap <= MARK.hit && (!best || gap < best.gap)) best = { site, gap };
    }
    return best?.site ?? null;
  }

  private viewFor(world: World): Viewport {
    const size = world.terrain.size;
    const middle = { x: size / 2, y: size / 2 };
    const rule = this.rule;
    if (rule.kind === 'follow') return viewport(this.truck?.pos ?? middle, this.width / 2 / rule.reach, this.width, this.height);
    if (rule.kind === 'fit') return fitted(size, this.width, this.height, middle);
    if (!this.view) return fitted(size, this.width, this.height, this.truck?.pos ?? middle);
    const least = fitTileSize(size, this.width, this.height);
    const view = { ...this.view, width: this.width, height: this.height };
    return view.tileSize < least ? zoomAround(view, 1, this.width / 2, this.height / 2, size, WORLD_MAP.maxTileSize) : clampPan(view, size);
  }

  private drawSoon(): void {
    if (this.drawRequest !== 0) return;
    this.drawRequest = requestAnimationFrame(() => {
      this.drawRequest = 0;
      this.draw();
    });
  }

  private draw(): void {
    const world = this.world;
    const ctx = this.canvas.getContext('2d');
    if (!world || !ctx) return;
    const view = this.viewFor(world);
    this.view = view;
    const r = this.ratio;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const [a, b, c, d, e, f] = canvasTransform(view);
    ctx.setTransform(a * r, b * r, c * r, d * r, e * r, f * r);
    ctx.imageSmoothingEnabled = view.tileSize * r < 1;
    ctx.drawImage(baseFor(world.terrain), 0, 0);
    if (this.fogCanvas) ctx.drawImage(this.fogCanvas, 0, 0);
    ctx.setTransform(r, 0, 0, r, 0, 0);
    this.drawGrid(ctx, view);
    this.overlay?.(ctx, view);
    const plates = this.platesFor(ctx, view);
    const labels = this.gridLabels(ctx, view, plates);
    if (this.rule.kind === 'free') this.drawNames(ctx, view, [plates.north, plates.scale, ...labels.map((l) => l.box)]);
    this.drawMarks(ctx, view);
    if (this.truck) this.drawTruck(ctx, view, this.truck);
    this.drawGridLabels(ctx, labels);
    this.drawPlates(ctx, view, plates);
  }

  private syncFog(explored: Uint8Array, size: number): void {
    if (!this.fog || this.fogSize !== size) {
      this.fog = newFogImage(size);
      this.fogCanvas = tileCanvas(size);
      this.fogSize = size;
    }
    if (paintFog(explored, this.fog.image, this.fog.previous) > 0 && this.fogCanvas) putPixels(this.fogCanvas, this.fog.image);
  }

  private markAt(view: Viewport, site: MapSite): MapPoint {
    return this.rule.kind === 'follow' ? pinToEdge(view, site.pos, MINIMAP.edgeInset) : { ...toPx(view, site.pos), pinned: false };
  }

  private drawMarks(ctx: CanvasRenderingContext2D, view: Viewport): void {
    ctx.fillStyle = token('--ink-bright');
    ctx.strokeStyle = token('--surface-sunk');
    ctx.lineWidth = 3;
    for (const site of this.sites) {
      const at = this.markAt(view, site);
      const scale = at.pinned ? MARK.pinned : 1;
      if (site.kind === 'town') this.drawSquare(ctx, at, scale);
      else this.drawDot(ctx, at, scale);
    }
  }

  private drawNames(ctx: CanvasRenderingContext2D, view: Viewport, kept: readonly Box[]): void {
    ctx.font = `${token('--text-dense')} ${token('--font-ui')}`;
    ctx.textBaseline = 'middle';
    const tall = parseFloat(token('--text-dense')) + 2 * NAME.padY;
    const named = [...this.sites]
      .sort((a, b) => Number(b.kind === 'town') - Number(a.kind === 'town'))
      .map((site) => ({ site, at: toPx(view, site.pos) }));
    const taken: Box[] = [...kept, ...named.map(({ at }) => around(at, MARK.town + 1))];
    if (this.truck) taken.push(around(toPx(view, this.truck.pos), MARK.truck + 1));
    for (const { site, at } of named) {
      const text = say(markName(site));
      const plate = placePlate(at, ctx.measureText(text).width + 2 * NAME.padX, tall, taken);
      taken.push(plate);
      ctx.fillStyle = token('--surface-overlay');
      ctx.fillRect(plate.x0, plate.y0, plate.x1 - plate.x0, plate.y1 - plate.y0);
      ctx.fillStyle = token('--ink-bright');
      ctx.fillText(text, plate.x0 + NAME.padX, (plate.y0 + plate.y1) / 2);
    }
  }

  private drawGrid(ctx: CanvasRenderingContext2D, view: Viewport): void {
    const side = gridSquareTiles();
    const size = side * MAP_GRID.squares;
    ctx.save();
    ctx.strokeStyle = token('--surface-sunk');
    ctx.globalAlpha = GRID.alpha;
    ctx.lineWidth = GRID.width;
    ctx.beginPath();
    for (let k = 1; k < MAP_GRID.squares; k++) {
      const column = [toPx(view, { x: k * side, y: 0 }), toPx(view, { x: k * side, y: size })];
      const row = [toPx(view, { x: 0, y: k * side }), toPx(view, { x: size, y: k * side })];
      for (const [from, to] of [column, row]) {
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  private gridLabels(ctx: CanvasRenderingContext2D, view: Viewport, plates: Plates): GridLabel[] {
    const side = gridSquareTiles();
    const size = side * MAP_GRID.squares;
    const tall = parseFloat(token('--text-caption')) + 2 * GRID.padY;
    const inset = this.rule.kind === 'follow' ? MINIMAP.edgeInset + MARK.town * MARK.pinned + GRID.gap : GRID.gap;
    const kept = [plates.north, plates.scale, ...this.sites.map((site) => around(this.markAt(view, site), MARK.town + 1))];
    const labels: GridLabel[] = [];
    const letters = `${token('--text-caption')} ${token('--font-ui')}`;
    const numbers = `${token('--text-caption')} ${token('--font-mono')}`;
    const place = (text: string, font: string, from: Vec, to: Vec): void => {
      ctx.font = font;
      const wide = ctx.measureText(text).width + 2 * GRID.padX;
      const room = { x0: inset + wide / 2, x1: view.width - inset - wide / 2, y0: inset + tall / 2, y1: view.height - inset - tall / 2 };
      const span = clipSegment(from, to, room);
      if (!span) return;
      const at = span[0];
      const box = { x0: at.x - wide / 2, x1: at.x + wide / 2, y0: at.y - tall / 2, y1: at.y + tall / 2 };
      const padded = { x0: box.x0 - GRID.gap, x1: box.x1 + GRID.gap, y0: box.y0 - GRID.gap, y1: box.y1 + GRID.gap };
      const crowded = [...kept, ...labels.map((l) => l.box)].some((b) => overlaps(b, padded));
      if (!crowded) labels.push({ text, font, box });
    };
    for (let k = 0; k < MAP_GRID.squares; k++) {
      const middle = (k + 0.5) * side;
      place(say(gridColumnLetter(k)), letters, toPx(view, { x: middle, y: 0 }), toPx(view, { x: middle, y: size }));
    }
    for (let k = 0; k < MAP_GRID.squares; k++) {
      const middle = (k + 0.5) * side;
      place(say(gridRowNumber(k)), numbers, toPx(view, { x: 0, y: middle }), toPx(view, { x: size, y: middle }));
    }
    return labels;
  }

  private drawGridLabels(ctx: CanvasRenderingContext2D, labels: readonly GridLabel[]): void {
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    for (const { text, font, box } of labels) {
      ctx.fillStyle = token('--surface-overlay');
      ctx.fillRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
      ctx.font = font;
      ctx.fillStyle = token('--ink-muted');
      ctx.fillText(text, (box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2);
    }
    ctx.restore();
  }

  private shownBox(view: Viewport): Box {
    return { x0: 0, y0: 0, x1: view.width, y1: view.height };
  }

  private platesFor(ctx: CanvasRenderingContext2D, view: Viewport): Plates {
    ctx.font = `${token('--text-dense')} ${token('--font-ui')}`;
    const letter = parseFloat(token('--text-dense'));
    const shown = this.shownBox(view);
    const northWide = Math.max(ctx.measureText(say(t('map.north'))).width, PLATE.arrowWidth) + 2 * PLATE.pad;
    const northTall = letter + PLATE.gap + PLATE.arrowHeight + 2 * PLATE.pad;
    const north = { x0: shown.x1 - PLATE.inset - northWide, y0: shown.y0 + PLATE.inset, x1: shown.x1 - PLATE.inset, y1: shown.y0 + PLATE.inset + northTall };
    const tiles = scaleBarTiles(view.tileSize, view.width);
    const label = distanceText(tiles);
    ctx.font = `${token('--text-dense')} ${token('--font-mono')}`;
    const barPx = tiles * view.tileSize;
    const scaleWide = Math.max(barPx, ctx.measureText(say(label)).width) + 2 * PLATE.pad;
    const scaleTall = letter + PLATE.gap + PLATE.tick + 2 * PLATE.pad;
    const scale = { x0: shown.x0 + PLATE.inset, y0: shown.y1 - PLATE.inset - scaleTall, x1: shown.x0 + PLATE.inset + scaleWide, y1: shown.y1 - PLATE.inset };
    return { north, scale, tiles, label };
  }

  private drawPlates(ctx: CanvasRenderingContext2D, view: Viewport, plates: Plates): void {
    const { north, scale } = plates;
    ctx.save();
    ctx.fillStyle = token('--surface-overlay');
    for (const box of [north, scale]) ctx.fillRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
    ctx.fillStyle = token('--ink-bright');
    ctx.strokeStyle = token('--ink-bright');
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    const letter = parseFloat(token('--text-dense'));
    const middle = (north.x0 + north.x1) / 2;
    ctx.font = `${token('--text-dense')} ${token('--font-ui')}`;
    ctx.fillText(say(t('map.north')), middle, north.y0 + PLATE.pad);
    const tip = north.y0 + PLATE.pad + letter + PLATE.gap;
    ctx.beginPath();
    ctx.moveTo(middle, tip);
    ctx.lineTo(middle + PLATE.arrowWidth / 2, tip + PLATE.arrowHeight);
    ctx.lineTo(middle - PLATE.arrowWidth / 2, tip + PLATE.arrowHeight);
    ctx.closePath();
    ctx.fill();
    ctx.font = `${token('--text-dense')} ${token('--font-mono')}`;
    ctx.textAlign = 'left';
    ctx.fillText(say(plates.label), scale.x0 + PLATE.pad, scale.y0 + PLATE.pad);
    const left = scale.x0 + PLATE.pad;
    const right = left + plates.tiles * view.tileSize;
    const y = scale.y1 - PLATE.pad - PLATE.tick / 2;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.moveTo(left, y - PLATE.tick / 2);
    ctx.lineTo(left, y + PLATE.tick / 2);
    ctx.moveTo(right, y - PLATE.tick / 2);
    ctx.lineTo(right, y + PLATE.tick / 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawSquare(ctx: CanvasRenderingContext2D, at: { x: number; y: number }, scale: number): void {
    const r = MARK.town * scale;
    ctx.strokeRect(at.x - r, at.y - r, 2 * r, 2 * r);
    ctx.fillRect(at.x - r, at.y - r, 2 * r, 2 * r);
  }

  private drawDot(ctx: CanvasRenderingContext2D, at: { x: number; y: number }, scale: number): void {
    ctx.beginPath();
    ctx.arc(at.x, at.y, MARK.site * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();
  }

  private drawTruck(ctx: CanvasRenderingContext2D, view: Viewport, truck: MapTruck): void {
    const at = toPx(view, truck.pos);
    const r = MARK.truck;
    ctx.save();
    ctx.translate(at.x, at.y);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = token('--surface-sunk');
    ctx.fill();
    ctx.strokeStyle = token('--ink-bright');
    ctx.lineWidth = 2;
    ctx.stroke();
    const ahead = toPx(view, { x: truck.pos.x + Math.cos(truck.heading), y: truck.pos.y + Math.sin(truck.heading) });
    ctx.rotate(Math.atan2(ahead.y - at.y, ahead.x - at.x));
    ctx.beginPath();
    ctx.moveTo(r * 0.7, 0);
    ctx.lineTo(-r * 0.45, r * 0.5);
    ctx.lineTo(-r * 0.45, -r * 0.5);
    ctx.closePath();
    ctx.fillStyle = token('--ink-bright');
    ctx.fill();
    ctx.restore();
  }
}
