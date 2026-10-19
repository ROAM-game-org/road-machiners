import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TIME } from "../data/time";
import { t, verbatim, type Msg } from "../text/msg";
import { resolve } from "../text/resolve";
import { clock } from "./format";
import { LOG_HISTORY, LogBook, LogStrip } from "./log";

const en = (msg: Msg): string => resolve(msg, "en");
const ru = (msg: Msg): string => resolve(msg, "ru");

describe("LogBook", () => {
  it("leads a plain line with the HUD clock stamp", () => {
    const line = new LogBook().add(1, { text: verbatim("Engine on"), cls: "good" });
    expect(en(clock(1).full)).toBe("Day 1 7:00");
    expect(en(line.text)).toBe("Day 1 7:00 Engine on");
    expect(line.spans!.map((s) => [en(s.text), s.cls])).toEqual([
      ["Day 1 7:00", "log-time"],
      ["Engine on", "good"],
    ]);
  });

  it("keeps the spans of a span line after the stamp", () => {
    const spans = [{ text: verbatim("a"), cls: "x" }, { text: verbatim("b"), cls: "" }];
    const line = new LogBook().add(TIME.turnsPerDay + 1, { text: verbatim("ab"), cls: "bad", spans });
    expect(line.spans).toEqual([{ text: clock(TIME.turnsPerDay + 1).full, cls: "log-time" }, ...spans]);
    expect(en(line.text).startsWith("Day 2 ")).toBe(true);
  });

  it("keeps the newest lines first and caps the history", () => {
    const book = new LogBook();
    for (let i = 0; i < LOG_HISTORY + 5; i++) book.add(i, { text: verbatim(`n${i}`), cls: "" });
    expect(book.lines).toHaveLength(LOG_HISTORY);
    expect(en(book.lines[0].text).endsWith(`n${LOG_HISTORY + 4}`)).toBe(true);
    expect(en(book.lines[LOG_HISTORY - 1].text).endsWith("n5")).toBe(true);
    expect(book.lines.every((l) => !/^T\d+ /.test(en(l.text)))).toBe(true);
  });

  it("keeps messages, so old lines read in the language shown now", () => {
    const line = new LogBook().add(1, { text: t("log.death"), cls: "bad" });
    expect(en(line.text)).toBe("Day 1 7:00 You died.");
    expect(ru(line.text)).toBe("День 1, 7:00 Вы погибли.");
  });
});

class FakeNode {
  className = "";
  attrs = new Map<string, string>();
  children: (FakeNode | string)[] = [];
  textContent = "";
  constructor(readonly tag: string) {}
  append(...c: (FakeNode | string)[]) { this.children.push(...c); }
  replaceChildren(...c: FakeNode[]) { this.children = c; }
  setAttribute(k: string, v: string) { this.attrs.set(k, v); }
  addEventListener() {}
}

describe("LogStrip", () => {
  beforeEach(() => {
    vi.stubGlobal("document", { createElement: (tag: string) => new FakeNode(tag), createTextNode: () => new FakeNode("#text"), getElementById: () => new FakeNode("div") });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("shows the newest line and names the whole line in its title", () => {
    const strip = new LogStrip();
    const book = new LogBook();
    book.add(1, { text: verbatim("First"), cls: "" });
    const newest = book.add(2, { text: verbatim("Second"), cls: "good" });
    strip.show(newest);
    const root = strip.root as unknown as FakeNode;
    expect(root.attrs.get("title")).toBe(`${en(clock(2).full)} Second`);
    expect(root.children).toHaveLength(1);
    expect((root.children[0] as FakeNode).className).toBe("good");
  });

  it("replaces the line it showed", () => {
    const strip = new LogStrip();
    const book = new LogBook();
    strip.show(book.add(1, { text: verbatim("A"), cls: "" }));
    strip.show(book.add(2, { text: verbatim("B"), cls: "" }));
    expect((strip.root as unknown as FakeNode).children).toHaveLength(1);
    expect((strip.root as unknown as FakeNode).attrs.get("title")).toContain("B");
  });
});
