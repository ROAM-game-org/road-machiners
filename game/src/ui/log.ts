import { bindAttr, say } from "../text/language";
import { LOCALES, t, type Msg } from "../text/msg";
import { msgData, msgOfData, type MsgData } from "../text/msg-data";
import { resolve } from "../text/resolve";
import { el } from "./dom";
import { clock, type LogLine } from "./format";
import type { LogEntry, LogLevel, LogReach } from "./log-levels";
import { mergeVolleys, volleyLine } from "./volley";

export const LOG_HISTORY = 200;

export type LogView = "brief" | "verbose";
export type BookLine = LogEntry & { turn: number; source: LogEntry };

export type SavedLogLine = { turn: number; level: LogLevel; reach: LogReach; cls: string; text: MsgData; spans?: { text: MsgData; cls: string }[] };
export type SavedLog = SavedLogLine[];
export type PlacedEntry = { turn: number; entry: LogEntry };

const LEVELS: readonly string[] = ["info", "notable", "attention", "critical"];
const REACHES: readonly string[] = ["both", "verbose"];

const SHOWN_IN: Record<LogView, (reach: LogReach) => boolean> = {
  brief: (reach) => reach !== "verbose",
  verbose: () => true,
};

export class LogBook {
  private history: BookLine[] = [];

  static restored(newestFirst: readonly PlacedEntry[]): LogBook {
    const book = new LogBook();
    for (const { turn, entry } of [...newestFirst].reverse()) book.place(turn, entry);
    book.trim();
    return book;
  }

  placed(): PlacedEntry[] {
    return this.history.map(({ turn, source }) => ({ turn, entry: source }));
  }

  get lines(): readonly BookLine[] {
    return this.history;
  }

  add(turn: number, line: LogEntry): BookLine {
    const placed = this.place(turn, line).line;
    this.trim();
    return placed;
  }

  place(turn: number, line: LogEntry): { line: BookLine; merged: number | null } {
    const stamp = clock(turn).full;
    const at = this.sameVolleyAt(say(stamp), line);
    if (at !== null) {
      const volley = volleyLine(mergeVolleys(this.history[at].volley!, line.volley!));
      const merged = stampedLine(turn, stamp, { ...volley, level: line.level, reach: line.reach });
      this.history[at] = merged;
      return { line: merged, merged: at };
    }
    const stamped = stampedLine(turn, stamp, line);
    this.history.unshift(stamped);
    return { line: stamped, merged: null };
  }

  trim(): number[] {
    if (this.history.length <= LOG_HISTORY) return [];
    const seen: Record<LogView, number> = { brief: 0, verbose: 0 };
    const gone: number[] = [];
    this.history = this.history.filter((line, i) => {
      const kept = (["brief", "verbose"] as const).filter((view) => SHOWN_IN[view](line.reach) && ++seen[view] <= LOG_HISTORY);
      if (kept.length === 0) gone.push(i);
      return kept.length > 0;
    });
    return gone;
  }

  saved(): SavedLog {
    return this.placed().map(({ turn, entry }) => savedLine(turn, entry));
  }

  private sameVolleyAt(stamp: string, line: LogLine): number | null {
    if (!line.volley) return null;
    for (let i = 0; i < this.history.length && this.history[i].stamp === stamp; i++) if (this.history[i].volley?.key === line.volley.key) return i;
    return null;
  }
}

function savedLine(turn: number, line: LogEntry): SavedLogLine {
  const saved: SavedLogLine = { turn, level: line.level, reach: line.reach, cls: line.cls, text: msgData(line.text) };
  if (line.spans) saved.spans = line.spans.map((span) => ({ text: msgData(span.text), cls: span.cls }));
  return saved;
}

export function readSavedLog(data: unknown): PlacedEntry[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((line) => {
    const placed = placedEntryOf(line);
    return placed && readsInEveryLanguage(placed.entry) ? [placed] : [];
  });
}

function placedEntryOf(data: unknown): PlacedEntry | null {
  if (!isSavedHead(data)) return null;
  const text = msgOfData(data.text);
  const spans = data.spans === undefined ? undefined : spansOf(data.spans);
  if (!text || spans === null) return null;
  const entry: LogEntry = { text, cls: data.cls, level: data.level, reach: data.reach };
  if (spans) entry.spans = spans;
  return { turn: data.turn, entry };
}

type SavedHead = { turn: number; level: LogLevel; reach: LogReach; cls: string; text: unknown; spans?: unknown };

function isSavedHead(data: unknown): data is SavedHead {
  if (typeof data !== "object" || data === null) return false;
  const { turn, level, reach, cls } = data as Record<string, unknown>;
  return Number.isInteger(turn) && LEVELS.includes(level as string) && REACHES.includes(reach as string) && typeof cls === "string";
}

function spansOf(data: unknown): { text: Msg; cls: string }[] | null {
  if (!Array.isArray(data)) return null;
  const spans = data.map((span) => {
    const text = msgOfData((span as { text?: unknown } | null)?.text);
    const cls = (span as { cls?: unknown } | null)?.cls;
    return text && typeof cls === "string" ? { text, cls } : null;
  });
  return spans.every((span) => span !== null) ? (spans as { text: Msg; cls: string }[]) : null;
}

function readsInEveryLanguage(entry: LogEntry): boolean {
  try {
    for (const locale of LOCALES) for (const msg of [entry.text, ...(entry.spans ?? []).map((span) => span.text)]) resolve(msg, locale);
    return true;
  } catch {
    return false;
  }
}

function stampedLine(turn: number, stamp: Msg, line: LogEntry): BookLine {
  return {
    text: t("log.stamped", { time: stamp, line: line.text }),
    cls: line.cls,
    stamp: say(stamp),
    volley: line.volley,
    spans: [{ text: stamp, cls: "log-time" }, ...(line.spans ?? [{ text: line.text, cls: line.cls }])],
    level: line.level,
    reach: line.reach,
    turn,
    source: line,
  };
}

function lineRow(l: BookLine): HTMLElement {
  const spans = l.spans ?? [{ text: l.text, cls: "" }];
  return el(
    "div",
    { class: `${l.cls} log-reach-${l.reach}`.trim() },
    ...spans.flatMap((sp) => {
      const span = el("span", { class: sp.cls }, sp.text);
      return sp.cls === "log-time" ? [span, document.createTextNode(" ")] : [span];
    }),
  );
}

export class LogPanel {
  private book = new LogBook();
  readonly lines = el("div", { class: "log-lines", tabindex: 0 });
  readonly root = el("div", { class: "log log-brief" }, this.lines);
  private get box(): HTMLElement {
    return this.lines;
  }
  constructor() {
    bindAttr(this.lines, "aria-label", t("log.panel"));
  }

  view(view: LogView): void {
    this.root.classList.toggle("log-brief", view === "brief");
    this.root.classList.toggle("log-verbose", view === "verbose");
  }

  newest(): BookLine | null {
    return this.book.lines[0] ?? null;
  }

  get texts(): string[] {
    return this.book.lines.map((line) => say(line.text));
  }

  saved(): SavedLog {
    return this.book.saved();
  }

  restore(saved: readonly PlacedEntry[]): void {
    this.book = LogBook.restored([...this.book.placed(), ...saved]);
    this.box.replaceChildren(...this.book.lines.map(lineRow));
  }

  add(turn: number, lines: LogEntry[]): void {
    if (lines.length === 0) return;
    const reading = this.box.scrollTop > 0;
    const before = this.box.scrollHeight;
    for (const line of lines) this.placeRow(turn, line);
    for (const i of this.book.trim().reverse()) this.box.children[i].remove();
    if (reading) this.box.scrollTop += this.box.scrollHeight - before;
  }

  private placeRow(turn: number, line: LogEntry): void {
    const placed = this.book.place(turn, line);
    if (placed.merged === null) this.box.prepend(lineRow(placed.line));
    else this.box.children[placed.merged].replaceWith(lineRow(placed.line));
  }
}
