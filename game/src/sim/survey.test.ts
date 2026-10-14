import { describe, expect, it } from 'vitest';
import { CONTRACTS, EFFORT, SHOPS } from '../data/market';
import { sitePads } from './sites';
import { emptyWorld, testDrive } from './testkit';
import { acceptContract, advanceContracts, deliverContract, haulWindow, initializeShops, siteOf, type Contract } from './market';
import { endTurn } from './world';
import { nearestRoadPoint } from './salvage';
import { isSurveyMet, startSurvey, surveyActions, liveSurveySites, surveyLoopTurns, surveyReward, surveySite, surveySites, type SurveyContract } from './survey';
import { TEST_MAP } from '../test/map';
import { dist } from './vec';
import type { Job, SalvageStock, World } from './types';
import type { Vec } from './vec';

const rules = CONTRACTS.survey;

function surveys(w: World): SurveyContract[] {
  return Object.values(w.shops).flatMap((s) => s.contracts.filter((c): c is SurveyContract => c.kind === 'survey'));
}

function boards(seed: number): World {
  const w = emptyWorld();
  w.marketRng.rngState = seed;
  initializeShops(w);
  return w;
}

function offerAt(shopId: string): { w: World; c: SurveyContract } {
  for (let seed = 1; seed < 400; seed++) {
    const w = boards(seed);
    const c = w.shops[shopId].contracts.find((x): x is SurveyContract => x.kind === 'survey');
    if (c) {
      w.vehicles[0].pos = { ...sitePads(siteOf(shopId))[0] };
      w.vehicles[0].speed = 0;
      return { w, c };
    }
  }
  throw new Error(`No survey offer at ${shopId}`);
}

describe('survey offers', () => {
  it('name one to three sites in range of the shop and within spread of the first', () => {
    let seen = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const w = boards(seed);
      for (const [shopId, state] of Object.entries(w.shops))
        for (const c of state.contracts) {
          if (c.kind !== 'survey') continue;
          seen++;
          expect(c.points.length).toBeGreaterThanOrEqual(rules.count[0]);
          expect(c.points.length).toBeLessThanOrEqual(rules.count[1]);
          const first = surveySite(w, c.points[0].site);
          for (const p of c.points) {
            const site = surveySite(w, p.site);
            expect(dist(site.pos, siteOf(shopId).pos)).toBeLessThanOrEqual(rules.range);
            expect(dist(site.pos, first.pos)).toBeLessThanOrEqual(rules.spread);
            expect(dist(p.area, site.pos)).toBeLessThanOrEqual(rules.areaOffset);
            expect(p.done).toBe(false);
          }
        }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('pay and last by the loop through the nearest sites', () => {
    const { w, c } = offerAt('bowl');
    const turns = surveyLoopTurns(siteOf('bowl').pos, c.points.map((p) => surveySite(w, p.site).pos));
    expect(c.reward).toBe(surveyReward(turns));
    expect(c.window).toBe(haulWindow(turns, false));
    expect(c.reward).toBe(Math.round(turns * EFFORT.wage[1] * rules.rewardFactor));
    expect(c.tier).toBe(1);
  });

  it('name no site twice across every board and the player', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const w = boards(seed);
      const ids = Object.values(w.shops).flatMap((s) => s.contracts.flatMap((c) => (c.kind === 'survey' ? c.points.map((p) => p.site) : [])));
      expect(new Set(ids).size).toBe(ids.length);
      expect(liveSurveySites(w).size).toBe(ids.length);
      expect(ids.length).toBeLessThanOrEqual(surveySites(TEST_MAP).length);
    }
  });

  it('repeat exactly for a seed', () => {
    expect(JSON.stringify(surveys(boards(7)))).toBe(JSON.stringify(surveys(boards(7))));
  });

  it('are posted at shops that have a site in range', () => {
    const w = boards(1);
    expect(Object.keys(w.shops)).toEqual(Object.keys(SHOPS));
  });
});

describe('survey hand-in', () => {
  it('throws when not every site is done, and when parked elsewhere', () => {
    const { w, c } = offerAt('bowl');
    const held = acceptContract(w, c.id);
    expect(() => deliverContract(held, c.id)).toThrow(/not done/);
    const mine = held.player.contracts[0] as SurveyContract;
    mine.points.forEach((p) => (p.done = true));
    held.vehicles[0].pos = { ...sitePads(siteOf('nose'))[0] };
    expect(() => deliverContract(held, c.id)).toThrow(/Not parked at bowl/);
  });

  it('pays once at the posting shop when every site is done', () => {
    const { w, c } = offerAt('bowl');
    const held = acceptContract(w, c.id);
    (held.player.contracts[0] as SurveyContract).points.forEach((p) => (p.done = true));
    const money = held.player.money;
    const paid = deliverContract(held, c.id);
    expect(paid.player.money).toBe(money + c.reward);
    expect(paid.player.contracts).toHaveLength(0);
    expect(() => deliverContract(paid, c.id)).toThrow(/No active contract/);
  });

  it('keeps a met survey past its deadline', () => {
    const { w, c } = offerAt('bowl');
    const held = acceptContract(w, c.id);
    const mine = held.player.contracts[0] as SurveyContract;
    mine.points.forEach((p) => (p.done = true));
    expect(isSurveyMet(mine)).toBe(true);
    held.turn = mine.deadline + 50;
    advanceContracts(held);
    expect(held.player.contracts).toHaveLength(1);
  });

  it('fails an unmet survey at its deadline without a charge', () => {
    const { w, c } = offerAt('bowl');
    const held = acceptContract(w, c.id);
    const money = held.player.money;
    held.turn = (held.player.contracts[0] as Contract).deadline + 1;
    advanceContracts(held);
    expect(held.player.contracts).toHaveLength(0);
    expect(held.player.money).toBe(money);
  });
});

describe('survey job', () => {
  function heldAtSite() {
    const { w, c } = offerAt('bowl');
    const held = acceptContract(w, c.id);
    const mine = held.player.contracts[0] as SurveyContract;
    const site = surveySite(held, mine.points[0].site);
    held.vehicles[0].pos = { x: site.pos.x + 1, y: site.pos.y };
    held.vehicles[0].speed = 0;
    return { w: held, mine, site };
  }

  function surveyTurns(w: World): World {
    let next = w;
    for (let i = 0; i < rules.surveyTurns; i++) next = endTurn(next, testDrive);
    return next;
  }

  it('offers Survey only in reach of an open site of a held survey', () => {
    const { w, mine, site } = heldAtSite();
    expect(surveyActions(w)).toEqual([{ contractId: mine.id, site: site.id, ready: true }]);
    w.vehicles[0].pos = { x: site.pos.x + 30, y: site.pos.y };
    expect(surveyActions(w)).toEqual([]);
  });

  it('never offers Survey from the road, for a site on no held contract, or at a site already done', () => {
    const { w, mine, site } = heldAtSite();
    const road = nearestRoadPoint(site.pos);
    w.vehicles[0].pos = road;
    expect(surveyActions(w)).toEqual([]);
    w.vehicles[0].pos = { x: site.pos.x + 1, y: site.pos.y };
    mine.points[0].done = true;
    expect(surveyActions(w)).toEqual([]);
    const free = emptyWorld();
    free.vehicles[0].pos = { ...site.pos };
    expect(surveyActions(free)).toEqual([]);
  });

  it('marks the site done after the survey turns, and not before', () => {
    const { w, mine, site } = heldAtSite();
    let next = startSurvey(w, mine.id, site.id);
    expect(next.vehicles[0].job?.kind).toBe('survey');
    for (let i = 0; i < rules.surveyTurns - 1; i++) next = endTurn(next, testDrive);
    expect((next.player.contracts[0] as SurveyContract).points[0].done).toBe(false);
    next = endTurn(next, testDrive);
    expect((next.player.contracts[0] as SurveyContract).points[0].done).toBe(true);
    expect(next.vehicles[0].job).toBeNull();
  });

  it('meets the contract when the last site is done and raises fulfilled once', () => {
    const { w, mine, site } = heldAtSite();
    mine.points.slice(1).forEach((p) => (p.done = true));
    const next = surveyTurns(startSurvey(w, mine.id, site.id));
    const outcomes = next.events.flatMap((e) => (e.t === 'contract' ? [e.outcome] : []));
    expect(outcomes.filter((o) => o === 'fulfilled')).toHaveLength(1);
    expect(outcomes).toContain('surveyed');
    expect(isSurveyMet(next.player.contracts[0] as SurveyContract)).toBe(true);
  });

  it('throws when moving, in combat or out of reach', () => {
    const { w, mine, site } = heldAtSite();
    expect(() => startSurvey(w, mine.id, 'survey-nowhere')).toThrow();
    w.vehicles[0].pos = { x: site.pos.x + 40, y: site.pos.y };
    expect(() => startSurvey(w, mine.id, site.id)).toThrow(/reach/);
  });

  it('is cancelled by moving and marks nothing', () => {
    const { w, mine, site } = heldAtSite();
    const next = startSurvey(w, mine.id, site.id);
    next.vehicles[0].speed = 5;
    const after = endTurn(next, testDrive);
    expect(after.vehicles[0].job).toBeNull();
    expect((after.player.contracts[0] as SurveyContract).points[0].done).toBe(false);
  });

  it('ends with no effect when the contract fails mid-job', () => {
    const { w, mine, site } = heldAtSite();
    const next = startSurvey(w, mine.id, site.id);
    next.turn = mine.deadline + 1;
    const after = endTurn(next, testDrive);
    expect(after.player.contracts).toHaveLength(0);
    expect(after.vehicles[0].job).toBeNull();
    expect(after.events.some((e) => e.t === 'contract' && e.outcome === 'surveyed')).toBe(false);
  });

  it('does not count a job of another contract', () => {
    const { w, mine, site } = heldAtSite();
    const next = startSurvey(w, mine.id, site.id);
    (next.vehicles[0].job as Extract<Job, { kind: 'survey' }>).contractId = 'ct-other';
    const after = surveyTurns(next);
    expect((after.player.contracts[0] as SurveyContract).points[0].done).toBe(false);
  });

  it('adds unsearched stocks with salvage near the site to the rumors', () => {
    const { w, mine, site } = heldAtSite();
    const stock = (id: string, pos: Vec, fuel: number): SalvageStock => ({ id, pos, radius: 1, goods: {}, parts: [], fuel, hidden: { goods: {}, parts: [], fuel: 0, supplies: 0 } });
    w.salvage.push(stock('rumor-near', { ...site.pos }, 5), stock('rumor-far', { x: site.pos.x + 60, y: site.pos.y }, 5), stock('rumor-empty', { ...site.pos }, 0), stock('rumor-searched', { ...site.pos }, 5));
    w.player.scavenged.push('rumor-searched');
    const after = surveyTurns(startSurvey(w, mine.id, site.id));
    expect(after.player.rumored).toContain('rumor-near');
    expect(after.player.rumored).not.toContain('rumor-far');
    expect(after.player.rumored).not.toContain('rumor-empty');
    expect(after.player.rumored).not.toContain('rumor-searched');
  });
});
