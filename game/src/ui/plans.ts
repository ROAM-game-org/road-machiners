
import { baseGrid } from "../sim/grid";
import { PLAN_PAD } from "../render/partLooks";
import PLANS from "./plans.svg?raw";
import { el } from "./dom";
import type { GridMetrics } from "./inventory-draw";

const SVG_NS = "http://www.w3.org/2000/svg";

let sheetsLoaded = false;
function loadSheets(): void {
  if (sheetsLoaded) return;
  sheetsLoaded = true;
  document.body.insertAdjacentHTML("beforeend", PLANS);
}

export function truckOutline(chassisId: string, m: GridMetrics): HTMLElement {
  return planBox(chassisId, m, `plan-${chassisId}`);
}

function planBox(chassisId: string, m: GridMetrics, symbolId: string): HTMLElement {
  const grid = baseGrid(chassisId);
  const box = el("div", { class: "truck-outline", "aria-hidden": "true" }, useSvg(symbolId, true));
  const [x, w] = [1 - PLAN_PAD, grid.w - 2 + 2 * PLAN_PAD].map((v) => v * m.cellW);
  const [y, h] = [-PLAN_PAD, grid.h + 2 * PLAN_PAD].map((v) => v * m.cellH);
  box.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
  return box;
}

function useSvg(id: string, stretch: boolean): SVGSVGElement {
  loadSheets();
  const svg = document.createElementNS(SVG_NS, "svg");
  if (stretch) {
    svg.setAttribute("viewBox", "0 0 1 1");
    svg.setAttribute("preserveAspectRatio", "none");
  }
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `#${id}`);
  use.setAttribute("width", stretch ? "1" : "100%");
  use.setAttribute("height", stretch ? "1" : "100%");
  svg.append(use);
  return svg;
}
