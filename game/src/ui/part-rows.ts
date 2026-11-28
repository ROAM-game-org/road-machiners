
import { partDef } from "../data/parts";
import type { PartInstance, World } from "../sim/types";
import { chassisAbilityLine, chassisAbilityName, chassisName, partName } from "../text/names";
import { chassisFeatureRow, chassisMap, chassisPortrait, chassisStats, conditionTag, diffStats, footprint, headlineStat, itemTip, partDetail, partIconEl, statChip, statGrid, toneStyle } from "./cards";
import { playerVehicle } from "../sim/damage";
import { t } from "../text/msg";
import type { Msg } from "../text/msg";
import { el } from "./dom";
import { conditionStatus, conditionTier } from "./cards";
import { SPENT_DROP, type RowSlots } from "./row-slots";
import { uiSize } from "./ui-size";

export type PartRow = {
  world: World;
  part: PartInstance;
  base: PartInstance | null;
  action: HTMLElement;
  done: Msg;
  onHover: (on: boolean) => void;
};

export type ChassisRow = {
  world: World;
  chassisId: string;
  action: HTMLElement | null;
  done: Msg;
};

type RowFrame = {
  id: string;
  className: string;
  style: string | null;
  head: (Node | null)[];
  action: HTMLElement | null;
  detail: () => Node[];
  onHover: (on: boolean) => void;
};

export function focusAfter(before: string[], focused: string, after: string[]): string | null {
  const at = before.indexOf(focused);
  if (at < 0) throw new Error(`Focused part row ${focused} was not in the list`);
  const kept = new Set(after);
  if (kept.has(focused)) return focused;
  const next = before.slice(at + 1).find((id) => kept.has(id));
  if (next !== undefined) return next;
  return before.slice(0, at).reverse().find((id) => kept.has(id)) ?? null;
}

const ROW = "[data-part-row]";

type Place = {
  scrolls: [HTMLElement, number][];
  order: string[];
  focused: string | null;
  top: number;
};

export class PartRows {
  private open: string | null = null;
  private reveal = false;

  constructor(private onChange: () => void, private slots: RowSlots) {}

  collapse(): void {
    this.open = null;
  }

  list(key: string, rows: PartRow[]): HTMLElement {
    const seen = new Set<string>();
    for (const r of rows) {
      if (seen.has(r.part.id)) throw new Error(`Part ${r.part.id} is listed twice`);
      seen.add(r.part.id);
    }
    const placed = this.slots.place(key, rows.map((r) => ({ id: r.part.id, row: this.row(r), action: r.action, done: r.done })));
    return el("ul", { class: "part-rows" }, ...placed);
  }

  chassisList(key: string, rows: ChassisRow[]): HTMLElement {
    const seen = new Set<string>();
    for (const r of rows) {
      if (seen.has(r.chassisId)) throw new Error(`Truck ${r.chassisId} is listed twice`);
      seen.add(r.chassisId);
    }
    const placed = this.slots.place(key, rows.map((r) => ({ id: r.chassisId, row: this.chassisRow(r), action: r.action, done: r.done })));
    return el("ul", { class: "part-rows truck-rows" }, ...placed);
  }

  private row(r: PartRow): HTMLElement {
    const def = partDef(r.part.defId);
    return this.frame({
      id: r.part.id,
      className: `k-${def.kind}`,
      style: toneStyle(r.part.defId),
      head: [partIconEl(r.part), this.nameCell(r.part), statChip(headlineStat(r.world, r.part, r.base)), footprint(def.w, def.h)],
      action: r.action,
      detail: () => partDetail(r.world, r.part, r.base),
      onHover: r.onHover,
    });
  }

  private chassisRow(r: ChassisRow): HTMLElement {
    const id = r.chassisId;
    const mine = r.action === null ? null : chassisStats(playerVehicle(r.world).chassisId);
    const diffs = diffStats(chassisStats(id), mine);
    const ability = chassisAbilityName(id);
    return this.frame({
      id,
      className: "k-truck",
      style: null,
      head: [
        el("span", { class: "chassis-icon" }, chassisPortrait(id, r.world.player.paint)),
        el(
          "span",
          { class: "part-name" },
          el("b", {}, chassisName(id)),
          ability ? el("span", { class: "dim", title: chassisAbilityLine(id) ?? undefined }, ability) : null,
        ),
        statChip(diffs[0]),
      ],
      action: r.action,
      detail: () => [
        el(
          "div",
          { class: "truck-detail" },
          el("div", { class: "truck-pics" }, chassisPortrait(id, r.world.player.paint), chassisMap(id)),
          el("div", { class: "truck-facts" }, chassisFeatureRow(id), statGrid(diffs)),
        ),
      ],
      onHover: () => {},
    });
  }

  private frame(f: RowFrame): HTMLElement {
    const isOpen = this.open === f.id;
    const detailId = `part-detail-${f.id}`;
    const head = el(
      "button",
      { type: "button", class: "part-sum", "aria-expanded": String(isOpen), "aria-controls": detailId },
      el("span", { class: "chevron" }),
      ...f.head,
    );
    head.addEventListener("click", () => {
      head.focus({ preventScroll: true });
      this.toggle(f.id);
    });
    const li = el(
      "li",
      { class: `part-row tile toned ${f.className}${isOpen ? " on" : ""}`, ...(f.style === null ? {} : { style: f.style }), "data-part-row": f.id },
      el("div", { class: "part-line" }, head, f.action ?? el("span", { class: "tag dim" }, t("vehicle.yours"))),
      isOpen ? el("div", { class: "part-detail", id: detailId, [SPENT_DROP]: "" }, ...f.detail()) : null,
    );
    li.addEventListener("mouseenter", () => f.onHover(true));
    li.addEventListener("mouseleave", () => f.onHover(false));
    return li;
  }

  private nameCell(part: PartInstance): HTMLElement {
    const status = conditionStatus(part);
    const showStatus = status.tone === "bad" || conditionTier(part) === "junk";
    return el(
      "span",
      { class: "part-name" },
      el("b", { title: itemTip(part.defId) }, partName(part.defId)),
      conditionTag(part),
      showStatus ? el("span", { class: status.tone }, status.text) : null,
    );
  }

  private toggle(id: string): void {
    this.open = this.open === id ? null : id;
    this.reveal = this.open !== null;
    this.onChange();
  }

  keepPlace(root: HTMLElement, draw: () => void): void {
    const place = this.record(root);
    draw();
    this.restore(root, place);
  }

  toTop(root: HTMLElement): void {
    for (const box of scrollBoxes(root)) box.scrollTop = 0;
  }

  private record(root: HTMLElement): Place {
    const active = document.activeElement;
    const focusedRow = active instanceof HTMLElement && root.contains(active) ? active.closest<HTMLElement>(ROW) : null;
    return {
      scrolls: scrollBoxes(root).map((b) => [b, b.scrollTop]),
      order: rowIds(root),
      focused: focusedRow?.dataset.partRow ?? null,
      top: focusedRow?.getBoundingClientRect().top ?? 0,
    };
  }

  private restore(root: HTMLElement, place: Place): void {
    const boxes = scrollBoxes(root);
    place.scrolls.forEach(([, top], i) => {
      if (boxes[i]) boxes[i].scrollTop = top;
    });
    if (place.focused !== null) this.refocus(root, place.focused, place);
    const detail = this.open === null ? null : root.querySelector(`[id="part-detail-${this.open}"]`);
    if (this.reveal && detail) detail.scrollIntoView({ block: "nearest" });
    this.reveal = false;
  }

  private refocus(root: HTMLElement, focused: string, place: Place): void {
    const target = focusAfter(place.order, focused, rowIds(root));
    const row = target === null ? null : rowById(root, target);
    if (!row) return;
    row.querySelector<HTMLElement>(".part-sum")?.focus({ preventScroll: true });
    if (target === focused) {
      const box = scrollerOf(row);
      if (box) box.scrollTop += uiSize().toLayer(row.getBoundingClientRect().top - place.top);
    }
  }
}

function scrollBoxes(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(".shop-body, .truck-body, .ink-panel, .ink-scroll")];
}

function rowIds(root: HTMLElement): string[] {
  return [...root.querySelectorAll<HTMLElement>(ROW)].map((r) => r.dataset.partRow ?? "");
}

function rowById(root: HTMLElement, id: string): HTMLElement | undefined {
  return [...root.querySelectorAll<HTMLElement>(ROW)].find((r) => r.dataset.partRow === id);
}

function scrollerOf(node: HTMLElement): HTMLElement | null {
  for (let p = node.parentElement; p; p = p.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}
