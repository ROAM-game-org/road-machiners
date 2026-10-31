import { TIME } from "../../data/time";
import type { Sample } from "../../sim/progression/sim-mode";
import { devEl as el } from "../dom";
import { moneyText } from "../units";
import { token } from "../tokens";

const SIZE = { money: 40, xp: 20, gap: 6, axis: 12, pad: 2 };
const LINE = 2;
export const SERIES = { money: "--accent", worth: "--ink", xp: "--good-bright" } as const;

type Panel = { top: number; height: number; max: number; lines: { look: string; value: (s: Sample) => number }[] };
type Plot = { width: number; first: number; span: number };

function dayText(turn: number): string {
  return `D${Math.floor(turn / TIME.workDayTurns) + 1}`;
}

export class RunChart {
  private samples: Sample[] = [];
  private hoverX: number | null = null;
  private readonly canvas = el("canvas", { class: "sim-chart-canvas" }) as HTMLCanvasElement;
  private readonly tip = el("div", { class: "sim-chart-tip num" });
  readonly root = el("div", { class: "sim-chart" }, this.canvas, this.tip);

  constructor(private readonly clock: (turn: number) => string) {
    this.canvas.addEventListener("pointermove", (e) => this.hover(e.offsetX));
    this.canvas.addEventListener("pointerleave", () => this.hover(null));
  }

  reset(samples: Sample[]): void {
    this.samples = [...samples];
    this.draw();
  }

  add(sample: Sample): void {
    this.samples.push(sample);
    this.draw();
  }

  private hover(x: number | null): void {
    this.hoverX = x;
    this.draw();
  }

  private panels(): Panel[] {
    const top = (lines: Panel["lines"]) => this.samples.reduce((most, s) => lines.reduce((m, l) => Math.max(m, l.value(s)), most), 1);
    const money: Panel["lines"] = [{ look: SERIES.worth, value: (s) => s.worth }, { look: SERIES.money, value: (s) => s.money }];
    const xp: Panel["lines"] = [{ look: SERIES.xp, value: (s) => s.xp }];
    return [
      { top: SIZE.pad, height: SIZE.money, max: top(money), lines: money },
      { top: SIZE.pad + SIZE.money + SIZE.gap, height: SIZE.xp, max: top(xp), lines: xp },
    ];
  }

  private draw(): void {
    const width = this.canvas.clientWidth;
    const height = SIZE.pad * 2 + SIZE.money + SIZE.gap + SIZE.xp + SIZE.axis;
    const ratio = window.devicePixelRatio;
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.canvas.style.height = `${height}px`;
    const ctx = this.canvas.getContext("2d");
    if (!ctx || width === 0 || this.samples.length === 0) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const first = this.samples[0]!.turn;
    const plot: Plot = { width, first, span: Math.max(1, this.samples[this.samples.length - 1]!.turn - first) };
    const panels = this.panels();
    this.drawDays(ctx, plot, height);
    for (const panel of panels) this.drawPanel(ctx, plot, panel);
    this.drawHover(ctx, plot, height);
  }

  private xOf(plot: Plot, turn: number): number {
    return ((turn - plot.first) / plot.span) * (plot.width - LINE) + LINE / 2;
  }

  private drawDays(ctx: CanvasRenderingContext2D, plot: Plot, height: number): void {
    ctx.font = `${token("--text-caption")} ${token("--font-mono")}`;
    ctx.textBaseline = "bottom";
    const firstDay = Math.ceil(plot.first / TIME.workDayTurns);
    const lastDay = Math.floor((plot.first + plot.span) / TIME.workDayTurns);
    for (let day = firstDay; day <= lastDay; day++) {
      const x = Math.round(this.xOf(plot, day * TIME.workDayTurns)) + 0.5;
      ctx.fillStyle = token("--line-soft");
      ctx.fillRect(x, 0, 1, height - SIZE.axis);
      ctx.fillStyle = token("--ink-muted");
      ctx.fillText(dayText(day * TIME.workDayTurns), x + SIZE.pad, height);
    }
  }

  private drawPanel(ctx: CanvasRenderingContext2D, plot: Plot, panel: Panel): void {
    ctx.fillStyle = token("--line-faint");
    ctx.fillRect(0, panel.top + panel.height, plot.width, 1);
    ctx.lineWidth = LINE;
    ctx.lineJoin = "round";
    for (const line of panel.lines) {
      ctx.strokeStyle = token(line.look);
      ctx.beginPath();
      this.samples.forEach((s, i) => {
        const y = panel.top + panel.height - (Math.max(0, line.value(s)) / panel.max) * panel.height;
        if (i === 0) ctx.moveTo(this.xOf(plot, s.turn), y);
        else ctx.lineTo(this.xOf(plot, s.turn), y);
      });
      ctx.stroke();
    }
  }

  private nearest(plot: Plot, x: number): Sample {
    const turn = plot.first + (x / plot.width) * plot.span;
    return this.samples.reduce((best, s) => (Math.abs(s.turn - turn) < Math.abs(best.turn - turn) ? s : best));
  }

  private drawHover(ctx: CanvasRenderingContext2D, plot: Plot, height: number): void {
    if (this.hoverX === null) {
      this.tip.replaceChildren();
      return;
    }
    const s = this.nearest(plot, this.hoverX);
    const x = Math.round(this.xOf(plot, s.turn)) + 0.5;
    ctx.fillStyle = token("--ink-bright");
    ctx.fillRect(x, 0, 1, height - SIZE.axis);
    this.tip.replaceChildren(
      el("span", { class: "dim" }, this.clock(s.turn)),
      tipValue(SERIES.money, moneyText(s.money)),
      tipValue(SERIES.worth, moneyText(s.worth)),
      tipValue(SERIES.xp, `${s.xp} XP`),
    );
    this.tip.classList.toggle("left", x > plot.width / 2);
  }
}

function tipValue(look: string, text: string): HTMLElement {
  const swatch = el("span", { class: "sim-swatch" });
  swatch.style.setProperty("--swatch", `var(${look})`);
  return el("span", { class: "sim-chart-value" }, swatch, text);
}

export function swatch(look: string): HTMLElement {
  const mark = el("span", { class: "sim-swatch" });
  mark.style.setProperty("--swatch", `var(${look})`);
  return mark;
}
