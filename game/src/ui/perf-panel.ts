
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

function row([name, value]: Row): HTMLElement {
  const head = name === "fps" || name === "p95 ms";
  const cell = (cls: string, text: string) => Object.assign(el("span", { class: cls }), { textContent: text });
  return el("div", { class: head ? "perf-row perf-head" : "perf-row" }, cell("perf-name", name), cell("perf-value", value));
}

type Row = [name: string, value: string];

function readout(frames: number[], routeMs: number | null): Row[] {
  const rows: Row[] = [];
  if (frames.length > 0) {
    const sorted = [...frames].sort((a, b) => a - b);
    const mean = frames.reduce((a, b) => a + b, 0) / frames.length;
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    rows.push(["fps", (1000 / mean).toFixed(0)], ["p95 ms", p95.toFixed(1)]);
  }
  return [...rows, ...timerRows(perfSnapshot(), routeMs)];
}

const msValue = (x: number | undefined) => (x === undefined ? "-" : x.toFixed(1));

function timerRows(snap: Record<string, PerfStat>, routeMs: number | null): Row[] {
  return [
    ["wait", msValue(snap["turn-wait"]?.last)],
    ["turn", msValue(snap.turn?.last)],
    ["preview", msValue(snap.preview?.last)],
    ["route", msValue(routeMs ?? undefined)],
    ["fog", msValue(snap.fog?.last)],
    ["stream-build", msValue(snap["stream-build"]?.last)],
    ["routes", String(snap.route?.calls ?? 0)],
    ["waited", String(snap["stream-block"]?.calls ?? 0)],
  ];
}

export function timerLines(snap: Record<string, PerfStat>, routeMs: number | null): string[] {
  return timerRows(snap, routeMs).map(([name, value]) => `${name.padEnd(8)}${value.padStart(6)}`);
}
