import { FARM_TOWER_ID, INTRO_STEP, INTRO_STEPS, type IntroStep } from '../data/arrival';
import { playerVehicle } from './damage';
import { mountedParts } from './grid';
import { setWorldVar, worldVar } from './quests';
import { engineNeedsPatch } from './repair';
import type { World } from './types';

const BEFORE_PATCH: readonly IntroStep[] = ['off', 'walk', 'drive'];

export function introStep(world: World): IntroStep {
  const step = worldVar(world, INTRO_STEP);
  const known = INTRO_STEPS.find((s) => s === step);
  if (!known) throw new Error(`World variable ${INTRO_STEP} holds ${String(step)}, which is no intro step`);
  return known;
}

export function advanceIntro(world: World): void {
  if (world.player.quests.session || !world.obstacles.some((o) => o.id === FARM_TOWER_ID)) return;
  const step = introStep(world);
  if (BEFORE_PATCH.includes(step)) settleBeforePatch(world, step);
}

function settleBeforePatch(world: World, step: IntroStep): void {
  if (step !== 'drive') setWorldVar(world, INTRO_STEP, 'drive');
  if (enginePatched(world)) setWorldVar(world, INTRO_STEP, 'patched');
}

function enginePatched(world: World): boolean {
  const me = playerVehicle(world);
  return mountedParts(me, 'engine').length > 0 && !engineNeedsPatch(world, me);
}
