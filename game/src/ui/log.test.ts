import { describe, expect, it } from "vitest";
import { TIME } from "../data/time";
import { t, verbatim, type Msg } from "../text/msg";
import { resolve } from "../text/resolve";
import { clock } from "./format";
import { LOG_HISTORY, LogBook } from "./log";
import { volleyLine, type Volley } from "./volley";

const en = (msg: Msg): string => resolve(msg, "en");
const ru = (msg: Msg): string => resolve(msg, "ru");

describe("LogBook", () => {
  it("leads a plain line with the HUD clock stamp", () => {
    const line = new LogBook().add(1, { text: verbatim("Engine on"), cls: "good" });
    expect(en(clock(1).full)).toBe("Day 1, 07:00");
    expect(en(line.text)).toBe("Day 1, 07:00 Engine on");
    expect(line.spans!.map((s) => [en(s.text), s.cls])).toEqual([
      ["Day 1, 07:00", "log-time"],
      ["Engine on", "good"],
    ]);
  });

  it("keeps the spans of a span line after the stamp", () => {
    const spans = [{ text: verbatim("a"), cls: "x" }, { text: verbatim("b"), cls: "" }];
    const line = new LogBook().add(TIME.turnsPerDay + 1, { text: verbatim("ab"), cls: "bad", spans });
    expect(line.spans).toEqual([{ text: clock(TIME.turnsPerDay + 1).full, cls: "log-time" }, ...spans]);
    expect(en(line.text).startsWith("Day 2, ")).toBe(true);
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
    expect(en(line.text)).toBe("Day 1, 07:00 You died.");
    expect(ru(line.text)).toBe("День 1, 07:00 Вы погибли.");
  });
});

describe("LogBook volleys", () => {
  const volley = (key: string, pct: number): Volley => ({ key, gun: verbatim("Heavy MG"), target: verbatim("You"), part: null, rounds: 1, low: pct, high: pct });

  it("merges shots of one gun that dealt nothing within one minute", () => {
    const book = new LogBook();
    book.add(1, volleyLine(volley("a", 13)));
    const merged = book.place(1, volleyLine(volley("a", 22)));
    expect(merged.merged).toBe(0);
    expect(book.lines).toHaveLength(1);
    expect(en(book.lines[0].text)).toBe("Day 1, 07:00 Heavy MG fires at You, 0/2 hit (13 to 22%)");
  });

  it("keeps another gun and a line with damage apart", () => {
    const book = new LogBook();
    book.add(1, volleyLine(volley("a", 13)));
    book.add(1, volleyLine(volley("b", 13)));
    book.add(1, { text: verbatim("Heavy MG hits, Cab -5"), cls: "bad" });
    expect(book.lines).toHaveLength(3);
    expect(book.place(1, volleyLine(volley("b", 15))).merged).toBe(1);
  });

  it("starts a new line in the next minute", () => {
    const book = new LogBook();
    book.add(1, volleyLine(volley("a", 13)));
    expect(book.place(1 + TIME.turnsPerDay, volleyLine(volley("a", 15))).merged).toBeNull();
  });
});


