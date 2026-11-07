import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubPage, type FakeNode } from "../test/fake-dom";
import { el, replaceChanged } from "./dom";

const fake = (node: HTMLElement) => node as unknown as FakeNode;

describe("replaceChanged", () => {
  beforeEach(() => void stubPage());
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the shown nodes when the new ones look the same", () => {
    const slot = el("div");
    const shown = el("button", { class: "a" }, el("span", {}));
    replaceChanged(slot, shown);
    replaceChanged(slot, el("button", { class: "a" }, el("span", {})));
    expect(fake(slot).children[0]).toBe(shown);
  });

  it("swaps the nodes when anything differs", () => {
    const slot = el("div");
    replaceChanged(slot, el("button", { class: "a" }));
    const next = el("button", { class: "b" });
    replaceChanged(slot, next);
    expect(fake(slot).children[0]).toBe(next);
  });

  it("runs only the newest listeners on kept nodes, children included", () => {
    const slot = el("div");
    const old = vi.fn();
    const fresh = vi.fn();
    const inner = el("button", { onclick: old });
    replaceChanged(slot, el("div", {}, inner));
    replaceChanged(slot, el("div", {}, el("button", { onclick: fresh })));
    fake(inner).fire("click");
    expect(old).not.toHaveBeenCalled();
    expect(fresh).toHaveBeenCalledOnce();
  });

  it("leaves the listeners of a live child that comes back", () => {
    const slot = el("div");
    const click = vi.fn();
    const live = el("button", { onclick: click });
    replaceChanged(slot, live, el("span", {}));
    replaceChanged(slot, live, el("span", {}));
    fake(live).fire("click");
    expect(click).toHaveBeenCalledOnce();
  });
});
