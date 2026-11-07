import { concat, t, type Msg } from "../text/msg";
import type { LogLine, LogSpan } from "./format";

export type Volley = { key: string; gun: Msg; target: Msg; part: Msg | null; rounds: number; low: number; high: number };

export function mergeVolleys(a: Volley, b: Volley): Volley {
  return { ...a, rounds: a.rounds + b.rounds, low: Math.min(a.low, b.low), high: Math.max(a.high, b.high) };
}

export function volleyLine(v: Volley): LogLine {
  const shot = { gun: v.gun, target: v.target, hits: 0, rounds: v.rounds };
  const head = v.part === null ? t("log.shot", shot) : t("log.shotAt", { ...shot, part: v.part });
  const odds = v.low === v.high ? t("log.shotChance", { pct: v.low }) : t("log.shotChanceRange", { low: v.low, high: v.high });
  const spans: LogSpan[] = [{ text: head, cls: "" }, { text: odds, cls: "dim" }];
  return { text: concat(spans.map((s) => s.text)), cls: "", spans, volley: v };
}

export function volleyOfShot(key: string, gun: Msg, target: Msg, part: Msg | null, rounds: number, chance: number): Volley {
  const pct = Math.round(chance * 100);
  return { key, gun, target, part, rounds, low: pct, high: pct };
}
