import { describe, expect, it } from "vitest";
import { loadLogViewSetting, LOG_VIEW_KEY, LogViewSetting, logViewSetting } from "./log-setting";

function store(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
}

describe("log view setting", () => {
  it("is Brief with nothing stored or with a value it does not know", () => {
    expect(new LogViewSetting(store()).view()).toBe("brief");
    expect(new LogViewSetting(store({ [LOG_VIEW_KEY]: "loud" })).view()).toBe("brief");
    expect(new LogViewSetting(store({ [LOG_VIEW_KEY]: "verbose" })).view()).toBe("verbose");
  });

  it("stores the pick and tells subscribers until they leave", () => {
    const saved = store();
    const setting = new LogViewSetting(saved);
    const seen: string[] = [];
    const leave = setting.subscribe(() => seen.push(setting.view()));
    setting.set("verbose");
    setting.set("verbose");
    expect(saved.data.get(LOG_VIEW_KEY)).toBe("verbose");
    leave();
    setting.set("brief");
    expect(saved.data.get(LOG_VIEW_KEY)).toBe("brief");
    expect(seen).toEqual(["verbose"]);
  });

  it("makes the loaded setting the one the log and Options read", () => {
    const loaded = loadLogViewSetting(store({ [LOG_VIEW_KEY]: "verbose" }));
    expect(logViewSetting()).toBe(loaded);
    expect(logViewSetting().view()).toBe("verbose");
  });
});
