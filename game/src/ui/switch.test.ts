import { describe, expect, it, vi } from "vitest";
import { t } from "../text/msg";

type Node = { tag: string; props: Record<string, unknown>; children: unknown[] };

vi.mock("./dom", () => ({
  el: (tag: string, props: Record<string, unknown> | null, ...children: unknown[]): Node => ({ tag, props: props ?? {}, children: children.flat().filter((c) => c !== null) }),
}));
vi.mock("./cards", () => ({ createIcon: (name: string) => ({ tag: "svg", props: { class: `icon-${name}` }, children: [] }) }));
vi.mock("./input-mode", () => ({ keyLabel: (title: unknown) => title }));

const { createSwitch, lockSlot, stackedLabel } = await import("./switch");

function find(node: unknown, test: (n: Node) => boolean): Node[] {
  if (typeof node !== "object" || node === null || !("children" in node)) return [];
  const n = node as Node;
  return [...(test(n) ? [n] : []), ...n.children.flatMap((c) => find(c, test))];
}

const hasClass = (n: Node, name: string) => String(n.props?.class ?? "").split(" ").includes(name);

describe("switch", () => {
  const base = { on: t("hud.driver"), off: t("hud.driverMarked"), title: t("hud.driver"), onclick: () => {} };
  it("renders both labels and shows only the current one", () => {
    for (const checked of [true, false]) {
      const sw = createSwitch({ ...base, checked }) as unknown as Node;
      const stack = find(sw, (n) => hasClass(n, "label-stack"))[0];
      expect(stack.children).toHaveLength(2);
      const hidden = stack.children.filter((c) => hasClass(c as Node, "label-reserve") && (c as Node).props["aria-hidden"] === "true");
      expect(hidden).toHaveLength(1);
      expect((stack.children[checked ? 0 : 1] as Node).props.class).toBeUndefined();
    }
  });
  it("keeps one handle box for the lever and the lock", () => {
    const lever = createSwitch({ ...base, checked: true }) as unknown as Node;
    expect(find(lever, (n) => hasClass(n, "switch-handle") && find(n, (m) => hasClass(m, "switch-lever")).length === 1)).toHaveLength(1);
    const locked = createSwitch({ ...base, checked: true, locked: true }) as unknown as Node;
    expect(find(locked, (n) => hasClass(n, "switch-handle") && find(n, (m) => hasClass(m, "icon-lock")).length === 1)).toHaveLength(1);
  });
  it("stacks label variants with one shown", () => {
    const stack = stackedLabel([t("hud.driver"), t("hud.driverMarked")], 1) as unknown as Node;
    expect(hasClass(stack.children[0] as Node, "label-reserve")).toBe(true);
    expect(hasClass(stack.children[1] as Node, "label-reserve")).toBe(false);
  });
  it("keeps the lock slot when unlocked", () => {
    expect(hasClass(lockSlot(false) as unknown as Node, "label-reserve")).toBe(true);
    expect(hasClass(lockSlot(true) as unknown as Node, "label-reserve")).toBe(false);
  });
});
