import { beforeEach, describe, expect, it, vi } from "vitest";
import { Drawers } from "./drawers";

class FakeNode {
  className = "";
  innerHTML = "";
  dataset: Record<string, string> = {};
  attrs = new Map<string, string>();
  children: FakeNode[] = [];
  classes = new Set<string>();
  classList = { toggle: (c: string, on: boolean) => (on ? this.classes.add(c) : this.classes.delete(c)) };
  constructor(readonly tag: string) {}
  append(...c: FakeNode[]) { this.children.push(...c); }
  setAttribute(k: string, v: string) { this.attrs.set(k, v); }
  addEventListener() {}
  replaceChildren() {}
}

beforeEach(() => {
  vi.stubGlobal("document", { createElement: (t: string) => new FakeNode(t), createTextNode: () => new FakeNode("#text") });
});

describe("drawers", () => {
  it("opens a drawer on toggle and closes it on a second toggle", () => {
    const root = new FakeNode("div");
    const drawers = new Drawers(root as never);
    drawers.toggle("guns");
    expect(drawers.open()).toBe("guns");
    expect(root.dataset.drawer).toBe("guns");
    drawers.toggle("guns");
    expect(drawers.open()).toBeNull();
    expect(root.dataset.drawer).toBeUndefined();
  });

  it("keeps at most one drawer open", () => {
    const root = new FakeNode("div");
    const drawers = new Drawers(root as never);
    drawers.toggle("truck");
    drawers.toggle("radio");
    expect(drawers.open()).toBe("radio");
    expect(root.dataset.drawer).toBe("radio");
  });

  it("marks a tab for attention without opening it", () => {
    const root = new FakeNode("div");
    const drawers = new Drawers(root as never);
    drawers.mark("guns", true);
    expect(drawers.open()).toBeNull();
    const guns = (drawers.element as unknown as FakeNode).children.find((n) => n.attrs.get("data-tab") === "guns")!;
    expect(guns.classes.has("marked")).toBe(true);
  });
});
