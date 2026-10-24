import { beforeAll, describe, expect, it } from 'vitest';
import { START_KITS } from '../data/start';
import { TEST_MAP } from '../test/map';
import { claimArea, claimSpots } from './claims';
import { clueAreas } from './clue-areas';
import type { Contract } from './market';
import { defaultSetup } from './settings';
import { emptyWorld } from './testkit';
import { surveyArea, surveyClue, surveySites, type SurveyContract } from './survey';
import { newWorld } from './world';
import type { World } from './types';

let real: World;

beforeAll(() => {
  real = newWorld(1, START_KITS.standard, TEST_MAP, defaultSetup('roaming'), false);
});

function surveyOf(): SurveyContract {
  const sites = surveySites(TEST_MAP).slice(0, 3);
  const points = sites.map((s) => ({ site: s.id, found: false, done: false }));
  return { id: 'ct-survey', shop: sites[0].clues[0].landmark, kind: 'survey', points, reward: 100, deadline: 900, window: 900, tier: 1 };
}

function claimOf(): Contract {
  const stock = claimSpots(real)[0];
  return { id: 'ct-claim', shop: 'bowl', kind: 'claim', stockId: stock.id, at: { ...stock.pos }, partId: 'p', defId: 'mg', reward: 900, deadline: 900, window: 900, tier: 1, rivalAt: 900, rival: null, leads: [] };
}

describe('clueAreas', () => {
  it('lists one area per open survey point, and none for a done one', () => {
    const w = emptyWorld();
    const survey = surveyOf();
    survey.points[1].done = true;
    w.player.contracts = [survey];
    const areas = clueAreas(w);
    expect(areas.map((a) => a.site)).toEqual([survey.points[0].site, survey.points[2].site]);
    expect(areas[0]).toEqual({ ...surveyArea(surveyClue(survey, survey.points[0])), contractId: survey.id, site: survey.points[0].site });
  });

  it('lists one area per held claim, with no site', () => {
    const w = emptyWorld();
    const claim = claimOf();
    w.player.contracts = [claim];
    if (claim.kind !== 'claim') throw new Error('not a claim');
    expect(clueAreas(w)).toEqual([{ ...claimArea(claim), contractId: claim.id, site: null }]);
  });

  it('lists nothing for board offers', () => {
    const w = emptyWorld();
    for (const shop of Object.values(w.shops)) shop.contracts = [surveyOf(), claimOf()];
    expect(clueAreas(w)).toEqual([]);
  });
});
