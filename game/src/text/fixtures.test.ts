import { describe, expect, it } from 'vitest';
import type { Contract } from '../sim/market';
import type { World } from '../sim/types';
import ANCHOR_2_25 from '../three/save-fixtures/anchors/2-25-roaming.json';
import { stepsFrom } from '../three/save';
import type { SavedJson } from '../three/save-migrations';
import { lineText } from '../ui/dialogue';
import { contractSummary } from '../ui/format';
import { LOCALES } from './msg';
import { goalText, vehicleTitle } from './names';
import { resolve } from './resolve';

function renderAll(world: World): string[] {
  const words: string[] = [];
  const contracts: Contract[] = [...world.player.contracts, ...Object.values(world.shops).flatMap((s) => s.contracts)];
  for (const locale of LOCALES) {
    for (const v of [...world.vehicles, ...(world.removed ?? [])]) {
      words.push(resolve(vehicleTitle(world, v), locale));
      for (const goal of v.brain?.goals ?? []) words.push(resolve(goalText(goal.reason), locale));
    }
    for (const c of contracts) words.push(resolve(contractSummary(c), locale));
    const call = world.player.call;
    if (call) words.push(resolve(lineText(call.line.line, call.line.vars), locale));
  }
  return words;
}

describe('old saves in every language', () => {
  it('the shipped 2.25 save, from before the text ids, migrates and every goal, call, contract and title reads in both languages', () => {
    const migrated = stepsFrom(25)!.reduce((world, step) => step(world), structuredClone(ANCHOR_2_25.world) as SavedJson) as unknown as World;
    const goals = migrated.vehicles.flatMap((v) => v.brain?.goals ?? []);
    const words = renderAll(migrated);
    expect(goals.length).toBeGreaterThan(5);
    expect(words.length).toBeGreaterThan(10);
    expect(words.every((word) => word.length > 0)).toBe(true);
    expect(words.some((word) => /[а-яё]/i.test(word))).toBe(true);
  });
});
