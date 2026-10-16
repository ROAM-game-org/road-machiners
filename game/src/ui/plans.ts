
import { baseGrid } from "../sim/grid";
import { PLAN_PAD } from "../render/partLooks";
import PLANS from "./plans.svg?raw";
import TINTS from "./tint.svg?raw";
import { el } from "./dom";

const SVG_NS = "http://www.w3.org/2000/svg";

let sheetsLoaded = false;
function loadSheets(): void {
  if (sheetsLoaded) return;
  sheetsLoaded = true;
  document.body.insertAdjacentHTML("beforeend", PLANS + TINTS);
}

export function planBox(chassisId: string, cell: number, sideInset = 0): [number, number, number, number] {
  const grid = baseGrid(chassisId);
  if (sideInset < -1 || 2 * sideInset >= grid.w - 2) throw new Error(`Plan of ${chassisId}: side inset ${sideInset} leaves no body`);
  return [1 - PLAN_PAD + sideInset, -PLAN_PAD, grid.w - 2 + 2 * PLAN_PAD - 2 * sideInset, grid.h + 2 * PLAN_PAD].map((v) => v * cell) as [
    number,
    number,
    number,
    number,
  ];
}

export function truckOutline(chassisId: string, cell: number, sideInset = 0): HTMLElement {
  const box = el("div", { class: "truck-outline", "aria-hidden": "true" }, useSvg(`plan-${chassisId}`, true));
  const [x, y, w, h] = planBox(chassisId, cell, sideInset);
  box.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`;
  return box;
}

export function tintedIcon(defId: string): SVGSVGElement {
  return useSvg(`tint-${defId}`, false);
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
