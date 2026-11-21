import { describe, expect, it } from "vitest";
import { TIME } from "../data/time";
import { t, verbatim, type Msg } from "../text/msg";
import { resolve } from "../text/resolve";
import { clock } from "./format";
import { LOG_HISTORY, LogBook } from "./log";
import { leveled, type LogEntry, type LogLevel } from "./log-levels";
import { volleyLine, type Volley } from "./volley";

const en = (msg: Msg): string => resolve(msg, "en");
const ru = (msg: Msg): string => resolve(msg, "ru");
const entry = (text: string, level: LogLevel = "notable"): LogEntry => leveled({ text: verbatim(text), cls: "" }, level);
const brief = (text: string): LogEntry => ({ ...entry(text), reach: "brief" });

describe("LogBook", () => {
  it("leads a plain line with the HUD clock stamp", () => {
    const line = new LogBook().add(1, leveled({ text: verbatim("Engine on"), cls: "good" }, "notable"));
    expect(en(clock(1).full)).toBe("Day 1, 07:00");
    expect(en(line.text)).toBe("Day 1, 07:00 Engine on");
    expect(line.spans!.map((s) => [en(s.text), s.cls])).toEqual([
      ["Day 1, 07:00", "log-time"],
      ["Engine on", "good"],
    ]);
  });

  it("keeps the spans of a span line after the stamp", () => {
    const spans = [{ text: verbatim("a"), cls: "x" }, { text: verbatim("b"), cls: "" }];
    const line = new LogBook().add(TIME.turnsPerDay + 1, leveled({ text: verbatim("ab"), cls: "bad", spans }, "notable"));
    expect(line.spans).toEqual([{ text: clock(TIME.turnsPerDay + 1).full, cls: "log-time" }, ...spans]);
    expect(en(line.text).startsWith("Day 2, ")).toBe(true);
  });

  it("keeps the newest lines first and caps the history", () => {
    const book = new LogBook();
    for (let i = 0; i < LOG_HISTORY + 5; i++) book.add(i, entry(`n${i}`));
    expect(book.lines).toHaveLength(LOG_HISTORY);
    expect(en(book.lines[0].text).endsWith(`n${LOG_HISTORY + 4}`)).toBe(true);
    expect(en(book.lines[LOG_HISTORY - 1].text).endsWith("n5")).toBe(true);
    expect(book.lines.every((l) => !/^T\d+ /.test(en(l.text)))).toBe(true);
  });

  it("keeps messages, so old lines read in the language shown now", () => {
    const line = new LogBook().add(1, leveled({ text: t("log.death"), cls: "bad" }, "critical"));
    expect(en(line.text)).toBe("Day 1, 07:00 You died.");
    expect(ru(line.text)).toBe("День 1, 07:00 Вы погибли.");
  });
});

describe("LogBook volleys", () => {
  const shots = (v: Volley): LogEntry => leveled(volleyLine(v), "info");
  const volley = (key: string, pct: number): Volley => ({ key, gun: verbatim("Heavy MG"), target: verbatim("You"), part: null, rounds: 1, low: pct, high: pct });

  it("merges shots of one gun that dealt nothing within one minute", () => {
    const book = new LogBook();
    book.add(1, shots(volley("a", 13)));
    const merged = book.place(1, shots(volley("a", 22)));
    expect(merged.merged).toBe(0);
    expect(book.lines).toHaveLength(1);
    expect(en(book.lines[0].text)).toBe("Day 1, 07:00 Heavy MG fires at You, 0/2 hit (13 to 22%)");
  });

  it("keeps another gun and a line with damage apart", () => {
    const book = new LogBook();
    book.add(1, shots(volley("a", 13)));
    book.add(1, shots(volley("b", 13)));
    book.add(1, leveled({ text: verbatim("Heavy MG hits, Cab -5"), cls: "bad" }, "info"));
    expect(book.lines).toHaveLength(3);
    expect(book.place(1, shots(volley("b", 15))).merged).toBe(1);
  });

  it("starts a new line in the next minute", () => {
    const book = new LogBook();
    book.add(1, shots(volley("a", 13)));
    expect(book.place(1 + TIME.turnsPerDay, shots(volley("a", 15))).merged).toBeNull();
  });
});



describe("LogBook views", () => {
  const shown = (book: LogBook, reach: "brief" | "verbose") => book.lines.filter((l) => l.reach === "both" || l.reach === reach);

  it("keeps the last Brief lines through a long run of Verbose-only shot rolls", () => {
    const book = new LogBook();
    book.add(0, entry("you hit the road"));
    for (let i = 1; i <= LOG_HISTORY * 3; i++) book.add(i, entry(`roll ${i}`, "info"));
    expect(shown(book, "brief").map((l) => en(l.text))).toEqual(["Day 1, 06:59 you hit the road"]);
    expect(shown(book, "verbose").filter((l) => l.level === "info")).toHaveLength(LOG_HISTORY);
    expect(book.lines.length).toBeLessThanOrEqual(LOG_HISTORY * 2);
  });

  it("caps each view at its own newest lines", () => {
    const book = new LogBook();
    for (let i = 0; i < LOG_HISTORY * 2; i++) book.add(i, i % 2 ? brief(`brief ${i}`) : entry(`roll ${i}`, "info"));
    for (let i = 0; i < LOG_HISTORY + 10; i++) book.add(1000 + i, entry(`both ${i}`));
    expect(shown(book, "brief")).toHaveLength(LOG_HISTORY);
    expect(shown(book, "verbose")).toHaveLength(LOG_HISTORY);
    expect(book.lines).toHaveLength(LOG_HISTORY);
  });

  it("reports the trimmed rows by their place, oldest last", () => {
    const book = new LogBook();
    for (let i = 0; i < LOG_HISTORY; i++) book.place(i, entry(`roll ${i}`, "info"));
    book.place(LOG_HISTORY, brief("hurt"));
    book.place(LOG_HISTORY + 1, entry("one more roll", "info"));
    expect(book.trim()).toEqual([LOG_HISTORY + 1]);
    expect(book.trim()).toEqual([]);
  });

  it("keeps the level and reach of a merged volley", () => {
    const v: Volley = { key: "a", gun: verbatim("MG"), target: verbatim("You"), part: null, rounds: 1, low: 10, high: 10 };
    const book = new LogBook();
    book.add(1, leveled(volleyLine(v), "info"));
    const { line } = book.place(1, leveled(volleyLine(v), "info"));
    expect(line).toMatchObject({ level: "info", reach: "verbose", turn: 1 });
    expect(en(line.source.text)).toContain("0/2 hit");
  });
});
