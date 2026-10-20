import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyWorld } from "../sim/testkit";
import { resolve } from "../text/resolve";
import { t } from "../text/msg";
import { mapInstrument } from "./hud";

class FakeNode {
  className = "";
  children: (FakeNode | string)[] = [];
  attrs = new Map<string, string>();
  listeners = new Map<string, () => void>();
  constructor(readonly tag: string) {}
  append(...c: (FakeNode | string)[]) { this.children.push(...c); }
  setAttribute(k: string, v: string) { this.attrs.set(k, v); }
  removeAttribute(k: string) { this.attrs.delete(k); }
  addEventListener(k: string, f: () => void) { this.listeners.set(k, f); }
  text(): string { return this.children.map((c) => (typeof c === "string" ? c : c.text())).join(""); }
}

function stubDom(): void {
  vi.stubGlobal("document", {
    createElement: (tag: string) => new FakeNode(tag),
    createTextNode: (text: string) => Object.assign(new FakeNode("#text"), { children: [text] }),
  });
}

describe("map instrument", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows a Map button with a K corner in a mode with the exploration map", () => {
    stubDom();
    const [button] = mapInstrument(emptyWorld(), false, () => {}) as unknown as FakeNode[];

    expect(button.className).toBe("instrument-button");
    expect(button.text()).toContain("Map");
    expect(button.text()).toContain("K");
    expect(resolve(t("map.full"), "ru")).toBe("Карта");
  });

  it("opens the map on click", () => {
    stubDom();
    const open = vi.fn();
    const [button] = mapInstrument(emptyWorld(), false, open) as unknown as FakeNode[];

    button.listeners.get("click")?.();

    expect(open).toHaveBeenCalledOnce();
  });

  it("blocks the click and gives the turn-playing reason while a turn plays", () => {
    stubDom();
    const open = vi.fn();
    const [button] = mapInstrument(emptyWorld(), true, open) as unknown as FakeNode[];

    button.listeners.get("click")?.();

    expect(open).not.toHaveBeenCalled();
    expect(button.attrs.get("aria-disabled")).toBe("true");
    expect(button.attrs.get("title")).toBeTruthy();
  });

  it("is absent in Chaos Highway, where K does nothing", () => {
    stubDom();
    const w = emptyWorld();
    w.setup = { ...w.setup, mode: "furyRoad" };

    expect(mapInstrument(w, false, () => {})).toEqual([]);
  });
});
