import { CHAOS_HIGHWAY, GAME_MODES, HAZARDS, type EnemyCard, type Line } from '../data/modes';
import { PARTS } from '../data/parts';
import { HAULER_KIT, startKit } from '../data/start';
import { milestoneAt, stretchStream } from './highway';
import { nextRandom, randInt, randRange, type Rng } from './rng';
import { enemyGearGrowth } from './settings';
import type { World } from './types';

const DIRECTOR = CHAOS_HIGHWAY.director;

export type PlannedWave = { at: number; template: string; size: number; money: number; elite: boolean };
export type StretchBudget = { budget: number; base: number; growth: number };

export function payOf(j: number): number {
  return lineAt(CHAOS_HIGHWAY.pay.base, j);
}

function lineAt(line: Line, j: number): number {
  return line.first + line.step * (j - 1);
}

export function expectedGear(j: number): number {
  requireStretch(j);
  let paid = 0;
  for (let k = 1; k < j; k++) paid += payOf(k);
  return startGear() + DIRECTOR.gearShare * paid;
}

export function stretchBudget(world: World, j: number): StretchBudget {
  const growth = enemyGearGrowth(world);
  const gear = expectedGear(1) + growth * (expectedGear(j) - expectedGear(1));
  return { budget: lineAt(DIRECTOR.budget, j), base: Math.round((DIRECTOR.truckShare / 100) * gear), growth };
}

export function directStretch(world: World, j: number): PlannedWave[] {
  const { budget, base } = stretchBudget(world, j);
  return planWaves(world.seed, j, budget, base);
}

type Wave = Omit<PlannedWave, 'at'>;

export function planWaves(seed: number, j: number, budget: number, base: number): PlannedWave[] {
  requireStretch(j);
  const rng = stretchStream(seed, j, 'director');
  const from = milestoneAt(seed, j - 1) + HAZARDS.clearAfterOutpost;
  const to = milestoneAt(seed, j) - HAZARDS.clearBeforeOutpost - CHAOS_HIGHWAY.sides.ahead;
  const count = Math.min(Math.floor((to - from) / DIRECTOR.spacing), roll(rng, lineAt(DIRECTOR.waves, j)));
  const waves = fitBudget(Array.from({ length: count }, () => drawWave(rng, j, base)), budget);
  let left = budget - trucksIn(waves);
  let elites = 0;
  for (const wave of shuffled(rng, waves)) {
    const extra = wave.size * (DIRECTOR.elite.cost - 1);
    if (extra > left || elites >= eliteCap(j) || !CHAOS_HIGHWAY.cards[wave.template].chase) continue;
    elites++;
    wave.money *= DIRECTOR.elite.money;
    wave.elite = true;
    left -= extra;
  }
  const slot = (to - from) / waves.length;
  return waves.map((wave, i) => ({ ...wave, at: from + slot * (i + 0.5) + randRange(rng, -1, 1) * DIRECTOR.jitter * slot }));
}

function drawWave(rng: Rng, j: number, base: number): Wave {
  const [template, card] = drawCard(rng, cardsOf(j));
  const size = Math.max(DIRECTOR.wave.min, Math.min(DIRECTOR.wave.cap, roll(rng, lineAt(DIRECTOR.wave.size, j))));
  return { template, size, money: Math.max(card.floor, base), elite: false };
}

function fitBudget(waves: Wave[], budget: number): Wave[] {
  const kept = [...waves];
  while (kept.length && trucksIn(kept) > budget) {
    const largest = kept.reduce((a, c) => (c.size > a.size ? c : a));
    if (largest.size > DIRECTOR.wave.min) largest.size--;
    else kept.pop();
  }
  return kept;
}

function trucksIn(waves: Wave[]): number {
  return waves.reduce((sum, wave) => sum + wave.size, 0);
}

function roll(rng: Rng, mean: number): number {
  const whole = Math.floor(mean);
  return whole + (nextRandom(rng) < mean - whole ? 1 : 0);
}

function shuffled<T>(rng: Rng, items: T[]): T[] {
  const order = [...items];
  for (let i = order.length - 1; i > 0; i--) {
    const k = randInt(rng, 0, i);
    [order[i], order[k]] = [order[k], order[i]];
  }
  return order;
}

export function eliteCap(j: number): number {
  return j < DIRECTOR.elite.from ? 0 : 1 + Math.floor((j - DIRECTOR.elite.from) / DIRECTOR.elite.every);
}

export function cardsOf(j: number): [string, EnemyCard][] {
  const cards = Object.entries(CHAOS_HIGHWAY.cards).filter(([, card]) => card.from <= j && card.weight > 0);
  if (cards.length === 0) throw new Error(`Stretch ${j} has no enemy cards`);
  return cards;
}

function drawCard(rng: Rng, cards: [string, EnemyCard][]): [string, EnemyCard] {
  let roll = nextRandom(rng) * cards.reduce((sum, [, card]) => sum + card.weight, 0);
  for (const entry of cards) {
    roll -= entry[1].weight;
    if (roll < 0) return entry;
  }
  return cards[cards.length - 1];
}

function startGear(): number {
  const id = GAME_MODES.chaosHighway.kit;
  if (id === null) throw new Error('Chaos Highway has no start kit to measure the player gear from');
  const kit = startKit(id);
  const defs = [...kit.parts, ...(kit.placed ?? []).map((p) => p.defId), ...HAULER_KIT.parts];
  return kit.money + defs.reduce((sum, defId) => sum + PARTS[defId].value, 0);
}

function requireStretch(j: number): void {
  if (!Number.isInteger(j) || j < 1) throw new Error(`Stretch ${j} is not a stretch`);
}
