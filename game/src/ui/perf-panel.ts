
import { perfSnapshot } from "../perf";
import { el } from "./dom";

const REFRESH_MS = 500;
const WINDOW_FRAMES = 120;
const TIMERS = ["turn", "preview", "route", "fog", "stream-build"];

export function mountPerfPanel(host: HTMLElement): { toggle(): boolean } {
  const box = el("div", { class: "perf-panel" });
  box.hidden = true;
  host.append(box);

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
    if (!box.hidden) box.textContent = readout(frames).join("\n");
  }, REFRESH_MS);

  return {
    toggle() {
      box.hidden = !box.hidden;
      return !box.hidden;
    },
  };
}

const ms = (x: number) => x.toFixed(1).padStart(6);

function readout(frames: number[]): string[] {
  const lines: string[] = [];
  if (frames.length > 0) {
    const sorted = [...frames].sort((a, b) => a - b);
    const mean = frames.reduce((a, b) => a + b, 0) / frames.length;
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    lines.push(`fps     ${(1000 / mean).toFixed(0).padStart(6)}`);
    lines.push(`p95 ms  ${ms(p95)}`);
  }
  return [...lines, ...timerLines()];
}

function timerLines(): string[] {
  const snap = perfSnapshot();
  const lines = TIMERS.map((name) => `${name.padEnd(8)}${snap[name] ? ms(snap[name].last) : "     -"}`);
  lines.push(`routes  ${String(snap.route?.calls ?? 0).padStart(6)}`);
  lines.push(`waited  ${String(snap["stream-block"]?.calls ?? 0).padStart(6)}`);
  return lines;
}
