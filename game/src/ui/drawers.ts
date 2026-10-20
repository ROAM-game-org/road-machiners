import { t } from "../text/msg";
import { el } from "./dom";

export const DRAWERS = ["truck", "guns", "radio", "log"] as const;
export type Drawer = (typeof DRAWERS)[number];

export class Drawers {
  readonly element: HTMLElement;
  private current: Drawer | null = null;
  private readonly tabs = new Map<Drawer, HTMLElement>();

  constructor(
    private readonly root: HTMLElement,
    private readonly onChange: () => void = () => {},
  ) {
    for (const drawer of DRAWERS) this.tabs.set(drawer, this.tab(drawer));
    this.element = el("div", { class: "drawer-tabs", role: "toolbar" }, ...this.tabs.values());
    this.root.append(this.element);
  }

  open(): Drawer | null {
    return this.current;
  }

  toggle(drawer: Drawer): void {
    this.current = this.current === drawer ? null : drawer;
    if (this.current === null) delete this.root.dataset.drawer;
    else this.root.dataset.drawer = this.current;
    for (const [name, tab] of this.tabs) {
      tab.classList.toggle("selected", name === this.current);
      tab.setAttribute("aria-pressed", String(name === this.current));
    }
    this.onChange();
  }

  mark(drawer: Drawer, on: boolean): void {
    this.tabs.get(drawer)!.classList.toggle("marked", on);
  }

  private tab(drawer: Drawer): HTMLElement {
    return el(
      "button",
      { class: "btn-l", "data-tab": drawer, "aria-pressed": "false", onclick: () => this.toggle(drawer) },
      t(`drawer.${drawer}`),
    );
  }
}
