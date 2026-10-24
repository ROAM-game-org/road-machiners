import { claimArea } from './claims';
import type { ClaimContract } from './salvage';
import { heldSurveys, surveyArea, surveyClue } from './survey';
import type { Vec } from './vec';
import type { World } from './types';

export type ClueArea = { center: Vec; radius: number };
export type HeldClueArea = ClueArea & { contractId: string; site: string | null };

export function clueAreas(world: World): HeldClueArea[] {
  const surveyAreas = heldSurveys(world).flatMap((c) =>
    c.points.filter((p) => !p.done).map((p) => ({ ...surveyArea(surveyClue(c, p)), contractId: c.id, site: p.site })),
  );
  const claimAreas = world.player.contracts
    .filter((c): c is ClaimContract => c.kind === 'claim')
    .map((c) => ({ ...claimArea(c), contractId: c.id, site: null }));
  return [...surveyAreas, ...claimAreas];
}
