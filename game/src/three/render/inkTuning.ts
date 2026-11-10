function pageParams(): URLSearchParams {
  return new URLSearchParams(globalThis.location?.search ?? "");
}

export type TuningKey = "color" | "shadeLine" | "shadeDark" | "shadeShift" | "castDark" | "shadeCut" | "hatch" | "hatchPx" | "objectHatch" | "contour" | "contourStep" | "contourSoft" | "contourOpacity" | "contourCross" | "relief" | "litFace" | "cliffStreaks" | "crestLine" | "crestWidth" | "crestFold" | "edgeSoft" | "materialContrast" | "surround" | "farMarks" | "heightTint" | "edgeWobble" | "waveSize" | "halo" | "tufts" | "edgeShadow" | "edgeShadowWidth" | "outline" | "fxInk" | "smokeLines" | "dustSize" | "dustAmount" | "plumeOpacity" | "dustEdge" | "dustThin" | "dustThick" | "dustTint" | "dustShade" | "dustShadeReach" | "dustBands" | "dustBandStep" | "dustBandShade" | "dustLines" | "dustStreaks" | "dustStreakPx" | "dustStreakDark" | "crt";

export type Knob = { label: string; min: number; max: number; step: number; start: number; unit?: "m" | "px" | "tiles" | "°" };

export const KNOBS: Record<TuningKey, Knob> = {
  color: { label: "Color strength", min: 0, max: 1.5, step: 0.05, start: 0.4 },
  relief: { label: "Relief", min: 0, max: 1, step: 0.05, start: 0.2 },
  litFace: { label: "Lit face", min: 0, max: 1, step: 0.05, start: 0.5 },
  cliffStreaks: { label: "Cliff streaks", min: 0, max: 1, step: 0.05, start: 0.35 },
  crestLine: { label: "Crest line", min: 0, max: 1, step: 0.05, start: 0.45 },
  crestWidth: { label: "Crest width", min: 0.1, max: 3, step: 0.05, start: 0.3, unit: "m" },
  crestFold: { label: "Crest least fold", min: 1, max: 12, step: 0.5, start: 4, unit: "m" },
  edgeSoft: { label: "Edge fade", min: 0, max: 0.2, step: 0.01, start: 0.01 },
  materialContrast: { label: "Material contrast", min: 0, max: 1, step: 0.05, start: 0.8 },
  surround: { label: "Blend with surroundings", min: 0, max: 1, step: 0.05, start: 0.25 },
  farMarks: { label: "Far mark ink", min: 0, max: 1, step: 0.05, start: 0.5 },
  heightTint: { label: "Height tint", min: 0, max: 1, step: 0.05, start: 0.7 },
  edgeWobble: { label: "Edge wobble", min: 0, max: 2, step: 0.05, start: 1 },
  waveSize: { label: "Edge wave size", min: 4, max: 40, step: 1, start: 9, unit: "m" },
  halo: { label: "Sand halo", min: 0, max: 3, step: 0.05, start: 1.5 },
  tufts: { label: "Grass tufts", min: 0, max: 1, step: 0.05, start: 0.6 },
  edgeShadow: { label: "Edge shadow", min: 0, max: 1, step: 0.05, start: 0.4 },
  edgeShadowWidth: { label: "Edge shadow width", min: 0.05, max: 2, step: 0.05, start: 0.35, unit: "m" },
  shadeLine: { label: "Outline", min: 0, max: 1, step: 0.05, start: 0 },
  shadeDark: { label: "Darkness", min: 0, max: 0.8, step: 0.05, start: 0.15 },
  shadeShift: { label: "Color shift", min: 0, max: 1, step: 0.05, start: 0.2 },
  castDark: { label: "Cast shadow extra dark", min: 0, max: 0.8, step: 0.05, start: 0.15 },
  shadeCut: { label: "Shade cut", min: 0, max: 45, step: 1, start: 10, unit: "°" },
  hatch: { label: "Shadow strokes", min: 0, max: 1, step: 0.05, start: 0.3 },
  hatchPx: { label: "Stroke size", min: 3, max: 24, step: 0.5, start: 8, unit: "px" },
  objectHatch: { label: "Object strokes", min: 0, max: 1, step: 1, start: 1 },
  contour: { label: "Lines on", min: 0, max: 1, step: 1, start: 0 },
  contourStep: { label: "Level step", min: 0.25, max: 5, step: 0.25, start: 1.75, unit: "m" },
  contourSoft: { label: "Line as strokes", min: 0, max: 1, step: 0.05, start: 0.15 },
  contourOpacity: { label: "Opacity", min: 0, max: 1, step: 0.05, start: 0.4 },
  contourCross: { label: "Crossed strokes", min: 0, max: 1, step: 1, start: 0 },
  outline: { label: "Object outline", min: 0, max: 3, step: 0.1, start: 1.5, unit: "px" },
  fxInk: { label: "Ink effects", min: 0, max: 1, step: 0.05, start: 1 },
  smokeLines: { label: "Smoke lines", min: 0, max: 1, step: 0.05, start: 0.5 },
  dustSize: { label: "Puff size", min: 0.1, max: 2, step: 0.05, start: 0.55 },
  dustAmount: { label: "Wheel dust amount", min: 0, max: 3, step: 0.05, start: 1.3 },
  plumeOpacity: { label: "Plume puff opacity", min: 0, max: 1, step: 0.05, start: 0.8 },
  dustEdge: { label: "Edge threshold", min: 0.05, max: 2, step: 0.05, start: 0.25 },
  dustThin: { label: "Thin opacity", min: 0, max: 1, step: 0.01, start: 0.6 },
  dustThick: { label: "Thick opacity", min: 0, max: 1, step: 0.01, start: 0.89 },
  dustTint: { label: "Sand tint", min: 0, max: 1, step: 0.05, start: 0.35 },
  dustShade: { label: "Underside shade", min: 0, max: 1, step: 0.05, start: 0.4 },
  dustShadeReach: { label: "Underside reach", min: 0.02, max: 1, step: 0.01, start: 0.14, unit: "m" },
  dustBands: { label: "Billow bands", min: 0, max: 4, step: 1, start: 2 },
  dustBandStep: { label: "Band spacing", min: 1.5, max: 16, step: 0.25, start: 8 },
  dustBandShade: { label: "Band shade", min: 0, max: 1, step: 0.02, start: 0.32 },
  dustLines: { label: "Streak strength", min: 0, max: 1, step: 0.05, start: 0.3 },
  dustStreaks: { label: "Streak count", min: 0, max: 5, step: 1, start: 3 },
  dustStreakPx: { label: "Streak width", min: 0.5, max: 4, step: 0.1, start: 0.9, unit: "px" },
  dustStreakDark: { label: "Streak darkness", min: 0, max: 1, step: 0.02, start: 0.3 },
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
  url.searchParams.set("tune", "1");
  if (value === KNOBS[key].start) url.searchParams.delete(key);
  else url.searchParams.set(key, String(value));
  history.replaceState(history.state, "", url);
}
