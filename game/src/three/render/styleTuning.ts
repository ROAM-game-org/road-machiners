export function pageParams(): URLSearchParams {
  return new URLSearchParams(globalThis.location?.search ?? "");
}

export type TuningKey = "color" | "shadeLine" | "hatch" | "hatchSize" | "objectHatch" | "contour" | "contourStep" | "contourSoft" | "contourOpacity" | "contourCross" | "relief" | "heightTint" | "edgeWobble" | "waveSize" | "edgeReach" | "grain" | "outline" | "crt";

type Knob = { label: string; min: number; max: number; step: number; start: number };

export const KNOBS: Record<TuningKey, Knob> = {
  color: { label: "Color strength", min: 0, max: 1.5, step: 0.05, start: 0.4 },
  relief: { label: "Relief", min: 0, max: 1, step: 0.05, start: 0.7 },
  heightTint: { label: "Height tint", min: 0, max: 1, step: 0.05, start: 0.8 },
  edgeWobble: { label: "Edge wobble", min: 0, max: 2, step: 0.05, start: 1 },
  waveSize: { label: "Edge wave m", min: 4, max: 40, step: 1, start: 9 },
  edgeReach: { label: "Edge halo tiles", min: 0.1, max: 3, step: 0.1, start: 2 },
  grain: { label: "Scrub grain", min: 0, max: 1, step: 0.05, start: 0.35 },
  shadeLine: { label: "Shadow outline", min: 0, max: 1, step: 0.05, start: 0.7 },
  hatch: { label: "Shadow strokes", min: 0, max: 1, step: 0.05, start: 0.2 },
  hatchSize: { label: "Stroke size m", min: 0.08, max: 1.2, step: 0.02, start: 0.15 },
  objectHatch: { label: "Object strokes", min: 0, max: 1, step: 1, start: 1 },
  contour: { label: "Elevation lines", min: 0, max: 1, step: 1, start: 0 },
  contourStep: { label: "Level step m", min: 0.25, max: 5, step: 0.25, start: 1.75 },
  contourSoft: { label: "Line as strokes", min: 0, max: 1, step: 0.05, start: 0.15 },
  contourOpacity: { label: "Line opacity", min: 0, max: 1, step: 0.05, start: 0.4 },
  contourCross: { label: "Crossed strokes", min: 0, max: 1, step: 1, start: 0 },
  outline: { label: "Object outline px", min: 0, max: 3, step: 0.1, start: 1.5 },
  crt: { label: "CRT filter", min: 0, max: 1, step: 0.05, start: 0.1 },
};

function fromUrl(key: TuningKey): number {
  const raw = pageParams().get(key);
  if (raw === null) return KNOBS[key].start;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < KNOBS[key].min || value > KNOBS[key].max) throw new Error(`Style setting ${key}=${raw} must be a number from ${KNOBS[key].min} to ${KNOBS[key].max}`);
  return value;
}

export const TUNING = Object.fromEntries((Object.keys(KNOBS) as TuningKey[]).map((key) => [key, { value: fromUrl(key) }])) as Record<TuningKey, { value: number }>;

let version = 0;

export function tuningVersion(): number {
  return version;
}

export function setTuning(key: TuningKey, value: number): void {
  TUNING[key].value = value;
  version++;
  const url = new URL(location.href);
  url.searchParams.set(key, String(value));
  history.replaceState(history.state, "", url);
}
