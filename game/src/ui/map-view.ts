import { paintBase, newFogImage, paintFog } from '../render/minimap-paint';
import { atlasKeyString, atlasOf, atlasSites } from '../sim/atlas';
import type { Terrain } from '../sim/terrain';
import type { World } from '../sim/types';
import type { Vec } from '../sim/vec';
import { SCREEN_UP } from '../three/render/camera';
import { el } from './dom';
import { siteName } from '../text/names';
import { canvasTransform, discFrame, pinToRim, toPx, toTile, wholeFrame, type MapFrame } from './map-geometry';
import { token } from './tokens';
import { uiSize } from './ui-size';

export type MapShape = { kind: 'disc'; reach: number } | { kind: 'whole' };
export type MapTruck = { pos: Vec; heading: number };
export type MapSite = { id: string; kind: 'town' | 'site' | 'wreck'; pos: Vec };
export type MapOverlay = (ctx: CanvasRenderingContext2D, frame: MapFrame) => void;

const BASES_KEPT = 3;
const TIP_GAP = 12;
const MARK = { town: 5, site: 4, wreck: 5, truck: 7, hit: 8 };
const bases = new Map<string, HTMLCanvasElement>();

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

export function mapSites(world: World): MapSite[] {
  const known = new Set(world.player.discovered);
  const towns = new Set(atlasOf(world.terrain).towns.map((s) => s.id));
  const sites: MapSite[] = atlasSites(atlasOf(world.terrain))
    .filter((s) => known.has(s.id))
    .map((s) => ({ id: s.id, kind: towns.has(s.id) ? 'town' : 'site', pos: s.pos }));
  const wrecks = world.salvage.filter((s) => world.player.rumored.includes(s.id));
  return [...sites, ...wrecks.map((s): MapSite => ({ id: s.id, kind: 'wreck', pos: s.pos }))];
}

export class MapView {
  readonly canvas: HTMLCanvasElement;
  private fog: ReturnType<typeof newFogImage> | null = null;
  private fogCanvas: HTMLCanvasElement | null = null;
  private fogSize = 0;
  private frame: MapFrame;
  private sites: MapSite[] = [];

  constructor(private shape: MapShape, private backing: number, private overlay: MapOverlay | null = null) {
    this.canvas = el('canvas', { class: 'map-view', width: backing, height: backing }) as HTMLCanvasElement;
    this.frame = wholeFrame(1, SCREEN_UP, backing / 2);
  }

  update(world: World, truck: MapTruck | null): void {
    const terrain = world.terrain;
    this.frame = this.shape.kind === 'disc'
      ? discFrame(truck?.pos ?? { x: terrain.size / 2, y: terrain.size / 2 }, SCREEN_UP, this.shape.reach, this.backing / 2)
      : wholeFrame(terrain.size, SCREEN_UP, this.backing / 2);
    this.sites = mapSites(world);
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    this.syncFog(world.player.explored, terrain.size);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.backing, this.backing);
    ctx.save();
    if (this.shape.kind === 'disc') this.clipDisc(ctx);
    ctx.setTransform(...canvasTransform(this.frame));
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(baseFor(terrain), 0, 0);
    if (this.fogCanvas) ctx.drawImage(this.fogCanvas, 0, 0);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.overlay?.(ctx, this.frame);
    ctx.restore();
    this.drawMarks(ctx);
    if (truck) this.drawTruck(ctx, truck);
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
      if (!site || site.kind === 'wreck') return hide();
      if (shown !== site.id) {
        shown = site.id;
        tip.replaceChildren(el('span', {}, siteName(site.id)));
      }
      const box = this.canvas.getBoundingClientRect();
      tip.style.display = '';
      tip.style.left = `${uiSize().toLayer(e.clientX - box.left) + TIP_GAP}px`;
      tip.style.top = `${uiSize().toLayer(e.clientY - box.top) + TIP_GAP}px`;
    });
  }

  pick(clientX: number, clientY: number): Vec | null {
    const box = this.canvas.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return null;
    const px = ((clientX - box.left) / box.width) * this.backing;
    const py = ((clientY - box.top) / box.height) * this.backing;
    return toTile(this.frame, px, py);
  }

  siteAt(clientX: number, clientY: number): MapSite | null {
    const box = this.canvas.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return null;
    const px = ((clientX - box.left) / box.width) * this.backing;
    const py = ((clientY - box.top) / box.height) * this.backing;
    let best: { site: MapSite; gap: number } | null = null;
    for (const site of this.sites) {
      const at = this.markAt(site);
      const gap = Math.hypot(at.x - px, at.y - py);
      if (gap <= MARK.hit && (!best || gap < best.gap)) best = { site, gap };
    }
    return best?.site ?? null;
  }

  private syncFog(explored: Uint8Array, size: number): void {
    if (!this.fog || this.fogSize !== size) {
      this.fog = newFogImage(size);
      this.fogCanvas = tileCanvas(size);
      this.fogSize = size;
    }
    if (paintFog(explored, this.fog.image, this.fog.previous) > 0 && this.fogCanvas) putPixels(this.fogCanvas, this.fog.image);
  }

  private clipDisc(ctx: CanvasRenderingContext2D): void {
    ctx.beginPath();
    ctx.arc(this.backing / 2, this.backing / 2, this.backing / 2, 0, Math.PI * 2);
    ctx.clip();
  }

  private markAt(site: MapSite): { x: number; y: number } {
    return this.shape.kind === 'disc' ? pinToRim(this.frame, site.pos) : toPx(this.frame, site.pos);
  }

  private drawMarks(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = token('--ink-bright');
    ctx.strokeStyle = token('--surface-sunk');
    ctx.lineWidth = 3;
    for (const site of this.sites) {
      const at = this.markAt(site);
      if (site.kind === 'wreck') this.drawRumor(ctx, at);
      else if (site.kind === 'town') this.drawSquare(ctx, at);
      else this.drawDot(ctx, at);
    }
  }

  private drawSquare(ctx: CanvasRenderingContext2D, at: { x: number; y: number }): void {
    const r = MARK.town;
    ctx.strokeRect(at.x - r, at.y - r, 2 * r, 2 * r);
    ctx.fillRect(at.x - r, at.y - r, 2 * r, 2 * r);
  }

  private drawDot(ctx: CanvasRenderingContext2D, at: { x: number; y: number }): void {
    ctx.beginPath();
    ctx.arc(at.x, at.y, MARK.site, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fill();
  }

  private drawRumor(ctx: CanvasRenderingContext2D, at: { x: number; y: number }): void {
    ctx.save();
    ctx.setLineDash([2, 2]);
    ctx.strokeStyle = token('--ink-bright');
    ctx.beginPath();
    ctx.arc(at.x, at.y, MARK.wreck, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawTruck(ctx: CanvasRenderingContext2D, truck: MapTruck): void {
    const at = toPx(this.frame, truck.pos);
    const ahead = toPx(this.frame, { x: truck.pos.x + Math.cos(truck.heading), y: truck.pos.y + Math.sin(truck.heading) });
    const angle = Math.atan2(ahead.y - at.y, ahead.x - at.x);
    const r = MARK.truck;
    ctx.save();
    ctx.translate(at.x, at.y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(-r * 0.7, r * 0.6);
    ctx.lineTo(-r * 0.3, 0);
    ctx.lineTo(-r * 0.7, -r * 0.6);
    ctx.closePath();
    ctx.fillStyle = token('--ink-bright');
    ctx.strokeStyle = token('--surface-sunk');
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fill();
    ctx.restore();
  }
}
