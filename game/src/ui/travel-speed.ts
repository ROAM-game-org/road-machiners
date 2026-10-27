import { CONFIG } from "../config";
import { bindAttr, textNode } from "../text/language";
import { t, type Msg } from "../text/msg";
import { el, markDisabled } from "./dom";
import type { UiHost } from "./host";
import { keyLabel } from "./input-mode";

export const SLOWER_KEY = "[";
export const FASTER_KEY = "]";

export const TRAVEL_SPEED_CODES: Readonly<Record<string, 1 | -1>> = { BracketLeft: -1, BracketRight: 1 };

const LAST = CONFIG.travelSpeeds.length - 1;

const SVG_NS = "http://www.w3.org/2000/svg";
const MARKS = { faster: "M0 0L5 4L0 8ZM5 0L10 4L5 8Z", slower: "M14 0L9 4L14 8ZM9 0L4 4L9 8Z" };

export function speedKey(kind: "slower" | "faster", onclick: () => void): HTMLElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 14 8");
  svg.setAttribute("focusable", "false");
  const mark = document.createElementNS(SVG_NS, "path");
  mark.setAttribute("d", MARKS[kind]);
  svg.append(mark);
  const button = el("button", { class: `radio-next speed-key ${kind}`, onclick });
  button.append(svg);
  return button;
}

export class TravelSpeed {
  readonly root: HTMLElement;
  private readonly slower: HTMLElement;
  private readonly faster: HTMLElement;
  private readonly lcd = el("span", { class: "speed-lcd" });
  private shown: number | null = null;

  constructor(private readonly host: UiHost) {
    this.slower = speedKey("slower", () => host.stepTravelSpeed(-1));
    this.faster = speedKey("faster", () => host.stepTravelSpeed(1));
    this.root = el("div", { class: "speed-keys", role: "group", "aria-label": t("turn.speed") }, this.slower, this.lcd, this.faster);
    bindAttr(this.lcd, "title", t("turn.speed"));
    bindAttr(this.slower, "aria-label", t("turn.speed.slower"));
    bindAttr(this.faster, "aria-label", t("turn.speed.faster"));
    bindAttr(this.slower, "title", keyLabel(t("turn.speed.slower"), SLOWER_KEY));
    bindAttr(this.faster, "title", keyLabel(t("turn.speed.faster"), FASTER_KEY));
  }

  sync(): void {
    const index = this.host.travelSpeedIndex();
    const playing = this.host.travelPlaySpeed();
    this.lcd.classList.toggle("running", playing !== null);
    this.show(playing ?? CONFIG.travelSpeeds[index]);
    markDisabled(this.slower, index === 0 ? t("turn.speed.slowest") : null);
    markDisabled(this.faster, index === LAST ? t("turn.speed.fastest") : null);
  }

  private show(speed: number): void {
    if (speed === this.shown) return;
    this.shown = speed;
    const msg: Msg = t("turn.speed.value", { n: speed });
    this.lcd.replaceChildren(textNode(msg));
  }
}
