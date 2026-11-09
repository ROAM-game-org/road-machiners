function pageParams(): URLSearchParams {
  return new URLSearchParams(globalThis.location?.search ?? "");
}

export type TuningKey = "color" | "shadeLine" | "shadeDark" | "shadeShift" | "shadeFoot" | "hatch" | "hatchPx" | "objectHatch" | "contour" | "contourStep" | "contourSoft" | "contourOpacity" | "contourCross" | "relief" | "reliefSteps" | "formScale" | "edgeSoft" | "heightTint" | "edgeWobble" | "waveSize" | "halo" | "grain" | "outline" | "crt";

type Knob = { label: string; min: number; max: number; step: number; start: number };

export const KNOBS: Record<TuningKey, Knob> = {
  color: { label: "Color strength", min: 0, max: 1.5, step: 0.05, start: 0.4 },
  relief: { label: "Relief", min: 0, max: 1, step: 0.05, start: 0.7 },
  reliefSteps: { label: "Relief in flat steps", min: 0, max: 1, step: 1, start: 1 },
  formScale: { label: "Shade plane form tiles", min: 0, max: 10, step: 0.5, start: 0.5 },
  edgeSoft: { label: "Material edge fade", min: 0, max: 0.2, step: 0.01, start: 0.01 },
  heightTint: { label: "Height tint", min: 0, max: 1, step: 0.05, start: 0.8 },
  edgeWobble: { label: "Edge wobble", min: 0, max: 2, step: 0.05, start: 1 },
  waveSize: { label: "Edge wave m", min: 4, max: 40, step: 1, start: 9 },
  halo: { label: "Sand halo", min: 0, max: 3, step: 0.05, start: 1 },
  grain: { label: "Scrub grain", min: 0, max: 1, step: 0.05, start: 0.35 },
  shadeLine: { label: "Shadow outline", min: 0, max: 1, step: 0.05, start: 0 },
  shadeDark: { label: "Shadow darkness", min: 0, max: 0.8, step: 0.05, start: 0.35 },
  shadeShift: { label: "Shadow color shift", min: 0, max: 1, step: 0.05, start: 0.3 },
  shadeFoot: { label: "Shade foot fade m", min: 0, max: 16, step: 0.5, start: 5 },
  hatch: { label: "Shadow strokes", min: 0, max: 1, step: 0.05, start: 0.3 },
  hatchPx: { label: "Stroke size px", min: 3, max: 24, step: 0.5, start: 8 },
  objectHatch: { label: "Object strokes", min: 0, max: 1, step: 1, start: 1 },
  contour: { label: "Elevation lines", min: 0, max: 1, step: 1, start: 0 },
  contourStep: { label: "Level step m", min: 0.25, max: 5, step: 0.25, start: 1.75 },
  contourSoft: { label: "Line as strokes", min: 0, max: 1, step: 0.05, start: 0.15 },
  contourOpacity: { label: "Line opacity", min: 0, max: 1, step: 0.05, start: 0.4 },
  contourCross: { label: "Crossed strokes", min: 0, max: 1, step: 1, start: 0 },
  outline: { label: "Object outline px", min: 0, max: 3, step: 0.1, start: 1.5 },
  crt: { label: "CRT filter", min: 0, max: 1, step: 0.05, start: 0.1 },
};

export function tuningOn(): boolean {
  return pageParams().has("tune");
}

function fromUrl(key: TuningKey): number {
  const raw = tuningOn() ? pageParams().get(key) : null;
  if (raw === null) return KNOBS[key].start;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < KNOBS[key].min || value > KNOBS[key].max) throw new Error(`Ink setting ${key}=${raw} must be a number from ${KNOBS[key].min} to ${KNOBS[key].max}`);
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
