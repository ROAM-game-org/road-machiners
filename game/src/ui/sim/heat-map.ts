import { MAP_GRID, REGION } from "../../data/region";
import type { Marker } from "../../sim/progression/sim-mode";
import { toPx, type Viewport } from "../map-geometry";
import { token } from "../tokens";

export type HeatLayer = "raiders" | "traffic" | "fights";
export const HEAT_LAYERS: { layer: HeatLayer | null; label: string; title: string }[] = [
  { layer: null, label: "Off", title: "No heat" },
  { layer: "raiders", label: "Raiders", title: "Where outlaw trucks spent their turns" },
  { layer: "traffic", label: "Traffic", title: "Where town crews and independents spent their turns, the prey raiders look for" },
  { layer: "fights", label: "Fights", title: "Where trucks were in combat" },
];
const LOOK: Record<HeatLayer, string> = { raiders: "--danger-bright", traffic: "--path-contact", fights: "--alarm" };
const CELLS_PER_SQUARE = 4;
const CELLS = MAP_GRID.squares * CELLS_PER_SQUARE;
const CELL_TILES = REGION.size / CELLS;
const STRONGEST = 0.7;

export class HeatMap {
  private readonly counts: Record<HeatLayer, Float32Array> = { raiders: new Float32Array(CELLS * CELLS), traffic: new Float32Array(CELLS * CELLS), fights: new Float32Array(CELLS * CELLS) };
  private firstTurn: number | null = null;
  private lastTurn = 0;
  shown: HeatLayer | null = null;

  constructor(private readonly classOf: (m: Marker) => HeatLayer | null) {}

  add(turn: number, markers: Marker[]): void {
    this.firstTurn ??= turn;
    this.lastTurn = turn;
    for (const m of markers) {
      const cell = cellOf(m.x, m.y);
      const layer = this.classOf(m);
      if (layer) this.counts[layer][cell] += 1;
      if (m.combat) this.counts.fights[cell] += 1;
    }
  }

  turnsCovered(): number {
    return this.firstTurn === null ? 0 : this.lastTurn - this.firstTurn + 1;
  }

  draw(ctx: CanvasRenderingContext2D, view: Viewport): void {
    if (!this.shown) return;
    const counts = this.counts[this.shown];
    const most = counts.reduce((a, b) => Math.max(a, b), 0);
    if (most === 0) return;
    ctx.fillStyle = token(LOOK[this.shown]);
    for (let i = 0; i < counts.length; i++) if (counts[i]! > 0) this.drawCell(ctx, view, i, Math.sqrt(counts[i]! / most) * STRONGEST);
    ctx.globalAlpha = 1;
  }

  private drawCell(ctx: CanvasRenderingContext2D, view: Viewport, index: number, alpha: number): void {
    const x = (index % CELLS) * CELL_TILES;
    const y = Math.floor(index / CELLS) * CELL_TILES;
    const a = toPx(view, { x, y });
    const b = toPx(view, { x: x + CELL_TILES, y: y + CELL_TILES });
    ctx.globalAlpha = alpha;
    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
  }
}

function cellOf(x: number, y: number): number {
  const column = Math.min(CELLS - 1, Math.max(0, Math.floor(x / CELL_TILES)));
  const row = Math.min(CELLS - 1, Math.max(0, Math.floor(y / CELL_TILES)));
  return row * CELLS + column;
}
