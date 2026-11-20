
import { perfSnapshot, type PerfStat } from "../perf";
import { el, panel } from "./dom";

const REFRESH_MS = 500;
const WINDOW_FRAMES = 120;

export function mountPerfPanel(host: HTMLElement, routeMs: () => number | null): { toggle(): boolean } {
  const box = panel("perf-panel", host);
  box.hidden = true;

  const frames: number[] = [];
  let prev = performance.now();
  const sample = (t: number) => {
    frames.push(t - prev);
    if (frames.length > WINDOW_FRAMES) frames.shift();
    prev = t;
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);

  window.setInterval(() => {
    if (!box.hidden) box.replaceChildren(...readout(frames, routeMs()).map(row));
  }, REFRESH_MS);

  return {
    toggle() {
      box.hidden = !box.hidden;
      return !box.hidden;
    },
  };
}

function row(text: string): HTMLElement {
  const cut = text.search(/\s{2,}|\s(?=-$)/);
  const name = cut < 0 ? text : text.slice(0, cut);
  const value = cut < 0 ? "" : text.slice(cut).trim();
  const head = name === "fps" || name === "p95 ms";
  const cell = (cls: string, text: string) => Object.assign(el("span", { class: cls }), { textContent: text });
  return el("div", { class: head ? "perf-row perf-head" : "perf-row" }, cell("perf-name", name), cell("perf-value", value));
}

const ms = (x: number) => x.toFixed(1).padStart(6);

function readout(frames: number[], routeMs: number | null): string[] {
  const lines: string[] = [];
  if (frames.length > 0) {
    const sorted = [...frames].sort((a, b) => a - b);
    const mean = frames.reduce((a, b) => a + b, 0) / frames.length;
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    lines.push(`fps     ${(1000 / mean).toFixed(0).padStart(6)}`);
    lines.push(`p95 ms  ${ms(p95)}`);
  }
  return [...lines, ...timerLines(perfSnapshot(), routeMs)];
}

const line = (name: string, value: number | undefined) => `${name.padEnd(8)}${value === undefined ? "     -" : ms(value)}`;

export function timerLines(snap: Record<string, PerfStat>, routeMs: number | null): string[] {
  return [
    line("wait", snap["turn-wait"]?.last),
    line("turn", snap.turn?.last),
    line("preview", snap.preview?.last),
    line("route", routeMs ?? undefined),
    line("fog", snap.fog?.last),
    line("stream-build", snap["stream-build"]?.last),
    `routes  ${String(snap.route?.calls ?? 0).padStart(6)}`,
    `waited  ${String(snap["stream-block"]?.calls ?? 0).padStart(6)}`,
  ];
}
