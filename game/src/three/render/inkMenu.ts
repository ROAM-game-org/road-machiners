import { KNOBS, TUNING, setTuning, tuningOn, type TuningKey } from "./inkTuning";

const PANEL_CSS = "position:fixed;left:56px;top:8px;z-index:100000;background:#000d;color:#eee;font:12px sans-serif;padding:8px 10px;border-radius:6px;width:220px;display:flex;flex-direction:column;gap:6px";

function knobRow(key: TuningKey): HTMLElement {
  const knob = KNOBS[key];
  const input = document.createElement("input");
  if (knob.step === 1 && knob.max === 1) {
    input.type = "checkbox";
    input.checked = TUNING[key].value === 1;
    input.addEventListener("change", () => setTuning(key, input.checked ? 1 : 0));
    return labelled(knob.label, input);
  }
  input.type = "range";
  Object.assign(input, { min: String(knob.min), max: String(knob.max), step: String(knob.step), value: String(TUNING[key].value) });
  const shown = document.createElement("span");
  shown.textContent = String(TUNING[key].value);
  input.addEventListener("input", () => {
    setTuning(key, Number(input.value));
    shown.textContent = input.value;
  });
  const row = labelled(knob.label, input);
  row.append(shown);
  return row;
}

function labelled(text: string, control: HTMLElement): HTMLElement {
  const row = document.createElement("label");
  row.style.cssText = "display:grid;grid-template-columns:96px 1fr 30px;align-items:center;gap:4px";
  const name = document.createElement("span");
  name.textContent = text;
  row.append(name, control);
  return row;
}

export function mountInkMenu(): void {
  if (!tuningOn()) return;
  const panel = document.createElement("div");
  panel.className = "ink-menu";
  panel.style.cssText = PANEL_CSS;
  const body = document.createElement("div");
  body.style.cssText = "display:flex;flex-direction:column;gap:6px";
  body.append(...(Object.keys(KNOBS) as TuningKey[]).map(knobRow));
  const fold = document.createElement("button");
  fold.textContent = "Look";
  fold.addEventListener("click", () => body.toggleAttribute("hidden"));
  panel.append(fold, body);
  for (const kind of ["keydown", "keyup"]) panel.addEventListener(kind, (e) => e.stopPropagation());
  document.body.append(panel);
}
