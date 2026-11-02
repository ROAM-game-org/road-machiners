import { describe, expect, it } from "vitest";
import { GHOST_CLICK_MS, swallowNextClick } from "./ghost-click";

function fakeWindow() {
  const listeners = new Set<(e: Event) => void>();
  const timers: { fn: () => void; ms: number }[] = [];
  const target = {
    addEventListener: (_type: string, fn: (e: Event) => void) => listeners.add(fn),
    removeEventListener: (_type: string, fn: (e: Event) => void) => listeners.delete(fn),
    setTimeout: (fn: () => void, ms: number) => timers.push({ fn, ms }),
  } as unknown as Window;
  return { target, listeners, timers };
}

const click = () => {
  const calls: string[] = [];
  return { calls, event: { stopPropagation: () => calls.push("stop"), preventDefault: () => calls.push("prevent") } as unknown as Event };
};

describe("swallowNextClick", () => {
  it("stops the first click and then lets clicks through", () => {
    const { target, listeners } = fakeWindow();
    swallowNextClick(target);
    const first = click();
    [...listeners][0](first.event);
    expect(first.calls).toEqual(["stop", "prevent"]);
    expect(listeners.size).toBe(0);
  });

  it("gives up after the ghost click window", () => {
    const { target, listeners, timers } = fakeWindow();
    swallowNextClick(target);
    expect(timers[0].ms).toBe(GHOST_CLICK_MS);
    timers[0].fn();
    expect(listeners.size).toBe(0);
  });
});
