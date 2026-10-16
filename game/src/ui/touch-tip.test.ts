import { describe, expect, it } from "vitest";
import { disabledReasonAt, registerTipSource, tipTextOf, type ClosestTarget, type TipTarget } from "./touch-tip";

function node(attrs: Record<string, string>, parent: TipTarget | null = null): TipTarget {
  return {
    parentElement: parent,
    getAttribute: (name) => attrs[name] ?? null,
    hasAttribute: (name) => name in attrs,
  };
}

describe("tip text", () => {
  it("prefers a registered source over the reason and the title", () => {
    const target = node({ "data-reason": "reason", title: "title" });
    registerTipSource(target, () => "source");
    expect(tipTextOf(target)).toBe("source");
  });

  it("prefers the reason over the title", () => {
    expect(tipTextOf(node({ "data-reason": "reason", title: "title" }))).toBe("reason");
  });

  it("falls back to the title", () => {
    expect(tipTextOf(node({ title: "title" }))).toBe("title");
  });

  it("finds the text on an ancestor", () => {
    expect(tipTextOf(node({}, node({ title: "outer" })))).toBe("outer");
  });

  it("stops at an element that owns a hold", () => {
    expect(tipTextOf(node({ "data-hold": "" }, node({ title: "outer" })))).toBeNull();
  });

  it("gives nothing for a bare element", () => {
    expect(tipTextOf(node({}))).toBeNull();
  });
});

function clickable(attrs: Record<string, string>, disabled: ClosestTarget | null): ClosestTarget {
  return { ...node(attrs), closest: () => disabled };
}

describe("a click on a disabled control", () => {
  it("opens the reason of the nearest disabled control", () => {
    const button = clickable({ "aria-disabled": "true", "data-reason": "Stop the truck first" }, null);
    const label = clickable({}, button);
    expect(disabledReasonAt(label)).toBe("Stop the truck first");
  });

  it("opens nothing for a control that works", () => {
    expect(disabledReasonAt(clickable({ "data-reason": "unused" }, null))).toBeNull();
  });
});
