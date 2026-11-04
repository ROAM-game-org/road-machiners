
import { RULES } from "../data/rules";
import { turnPartHits } from "./combat";
import { corePart } from "./grid";
import { chance } from "./rng";
import type { Vehicle, World } from "./types";
import { maxHp } from "./wear";

type Band = { below: number; hazard: number };

export function cabKnockChance(before: number, after: number, rule: Band): number {
  const t = rule.below;
  const a = Math.min(after, t);
  const b = Math.min(before, t);
  const weight = ((t - a) ** 2 - (t - b) ** 2) / (t * t);
  return weight > 0 ? 1 - Math.exp(-rule.hazard * weight) : 0;
}

export function cabDamageThisTurn(world: World, v: Vehicle): number {
  const id = corePart(v, "cab").id;
  return (turnPartHits(world).get(v.id) ?? []).reduce((sum, hit) => (hit.part === id ? sum + hit.damage : sum), 0);
}

export function rollCabKnock(world: World, v: Vehicle, damage = cabDamageThisTurn(world, v)): boolean {
  const cab = corePart(v, "cab");
  if (cab.hp <= 0) return false;
  const max = maxHp(cab);
  const after = cab.hp / max;
  const before = Math.min(1, after + damage / max);
  const p = cabKnockChance(before, after, RULES.cabKnock);
  return p > 0 && chance(world, p);
}
