import type { Msg } from "../text/msg";
import { el } from "./dom";

export type SlotRow = { id: string; row: HTMLElement; action: HTMLElement | null; done: Msg };

type Shown = { row: HTMLElement; done: Msg };

type Memory = { order: string[]; last: Map<string, Shown>; spent: Set<string> };

type MakeSpent = (last: HTMLElement, done: Msg) => HTMLElement;

export const ROW_ACTION = "data-row-action";
export const SPENT_DROP = "data-spent-drop";

export function slotOrder(before: readonly string[], live: readonly string[], spent: ReadonlySet<string>): string[] {
  const liveSet = new Set(live);
  const kept = before.filter((id) => liveSet.has(id) || spent.has(id));
  const known = new Set(kept);
  return [...kept, ...live.filter((id) => !known.has(id))];
}

export function spentRow(last: HTMLElement, done: Msg): HTMLElement {
  const row = last.cloneNode(true) as HTMLElement;
  row.classList.add("spent");
  row.querySelectorAll(`[${SPENT_DROP}]`).forEach((n) => n.remove());
  row.querySelector(`[${ROW_ACTION}]`)?.replaceWith(el("span", { class: "tag" }, done));
  row.querySelectorAll("button").forEach((b) => {
    b.setAttribute("aria-disabled", "true");
    b.removeAttribute("data-key");
    b.removeAttribute("aria-controls");
    if (b.hasAttribute("aria-expanded")) b.setAttribute("aria-expanded", "false");
  });
  return row;
}

export class RowSlots {
  private lists = new Map<string, Memory>();
  private acted: { list: string; ids: Set<string> } | null = null;

  constructor(private makeSpent: MakeSpent = spentRow) {}

  has(list: string): boolean {
    return (this.lists.get(list)?.spent.size ?? 0) > 0;
  }

  forget(): void {
    this.lists.clear();
    this.acted = null;
  }

  actOn(list: string, ids: readonly string[]): void {
    this.acted = { list, ids: new Set(ids) };
  }

  place(list: string, rows: SlotRow[]): HTMLElement[] {
    const memory = this.lists.get(list) ?? { order: [], last: new Map(), spent: new Set() };
    const live = rows.map((r) => r.id);
    this.settle(list, memory, new Set(live));
    const order = slotOrder(memory.order, live, memory.spent);
    const byId = new Map(rows.map((r) => [r.id, r]));
    const placed = order.map((id) => {
      const row = byId.get(id);
      if (row) return row.row;
      const last = memory.last.get(id);
      if (!last) throw new Error(`Row ${id} of ${list} has nothing drawn to keep`);
      return this.makeSpent(last.row, last.done);
    });
    for (const r of rows) {
      memory.last.set(r.id, { row: r.row, done: r.done });
      this.watch(list, r);
    }
    memory.order = order;
    this.lists.set(list, memory);
    return placed;
  }

  private settle(list: string, memory: Memory, live: ReadonlySet<string>): void {
    for (const id of [...memory.spent]) if (live.has(id)) memory.spent.delete(id);
    if (this.acted?.list !== list) return;
    for (const id of this.acted.ids) if (!live.has(id) && memory.order.includes(id)) memory.spent.add(id);
    this.acted = null;
  }

  private watch(list: string, r: SlotRow): void {
    if (!r.action) return;
    r.action.setAttribute(ROW_ACTION, "");
    if (r.action.getAttribute("aria-disabled") === "true") return;
    r.action.addEventListener("click", () => this.actOn(list, [r.id]), true);
  }
}
