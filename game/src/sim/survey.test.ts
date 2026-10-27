import { describe, expect, it } from 'vitest';
import { CONTRACTS, EFFORT, SHOPS } from '../data/market';
import { ECONOMY } from '../data/goods';
import { sitePads } from './sites';
import { standardWorld } from '../test/world-cache';
import { addVehicle, emptyWorld, startCombat, testDrive } from './testkit';
import { acceptContract, advanceContracts, deliverContract, haulWindow, initializeShops, siteOf, type Contract } from './market';
import { endTurn } from './world';
import { nearestRoadPoint } from './salvage';
import { compassSector, findSurveySites, isSurveyMet, startSurvey, surveyActions, surveyClue, liveSurveySites, surveyLoopTurns, surveyWay, surveyReward, surveySite, surveySites, type SurveyContract } from './survey';
import { refreshVision, sightRadius, visibleTiles, tileOf } from './vision';
import { addState } from './states';
import { corePart } from './grid';
import { playerVehicle } from './damage';
import { followSteps } from './directions-follower.test-helper';
import { directionsFromSite } from './directions';
import { DIRECTIONS } from '../data/directions';
import { bearing } from './vec';
import { TEST_MAP } from '../test/map';
import { dist } from './vec';
import type { DirectionStep, Job, SalvageStock, World } from './types';
import { distinctCardinals } from './direction-cues';
import { roadNetworkOf } from './road-network';
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
            expect(p).toEqual({ site: site.id, found: false, done: false });
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

  it('pay the search around each clue on top of the drive and the survey', () => {
    const at = siteOf('bowl').pos;
    expect(surveyLoopTurns(at, [at, at]) - surveyLoopTurns(at, [at])).toBe(rules.surveyTurns + rules.searchTurns + EFFORT.handlingTurns);
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
    expect(() => deliverContract(held, c.id)).toThrow(/not met/);
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
    mine.points[0].found = true;
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
    expect(next.events.find((e) => e.t === 'contract' && e.outcome === 'surveyed')).toMatchObject({ site: site.id });
    expect(isSurveyMet(next.player.contracts[0] as SurveyContract)).toBe(true);
  });

  it('throws for an unknown place or out of reach', () => {
    const { w, mine, site } = heldAtSite();
    expect(() => startSurvey(w, mine.id, 'survey-nowhere')).toThrow();
    w.vehicles[0].pos = { x: site.pos.x + 40, y: site.pos.y };
    expect(() => startSurvey(w, mine.id, site.id)).toThrow(/reach/);
  });

  function heldUnderFire() {
    const held = heldAtSite();
    const me = held.w.vehicles[0];
    const raider = addVehicle(held.w, 'scrapjaw', 'buggy', ['mg'], { x: me.pos.x + 6, y: me.pos.y });
    addState(held.w, 'feud', raider.id, me.id, { kind: 'feud', robbery: false });
    startCombat(held.w, raider, me);
    return { ...held, me, raider };
  }

  function underFireTurn(w: World): World {
    const next = endTurn(w, testDrive);
    const raider = next.vehicles.find((v) => v.id !== next.player.vehicleId);
    if (raider) startCombat(next, raider, next.vehicles[0]);
    return next;
  }

  it('starts a survey in combat', () => {
    const { w, mine, site } = heldUnderFire();
    expect(startSurvey(w, mine.id, site.id).vehicles[0].job?.kind).toBe('survey');
  });

  it('finishes a survey under fire and marks the place surveyed', () => {
    const { w, mine, site } = heldUnderFire();
    let next = startSurvey(w, mine.id, site.id);
    for (let i = 0; i < rules.surveyTurns; i++) next = underFireTurn(next);
    expect((next.player.contracts[0] as SurveyContract).points[0].done).toBe(true);
    expect(next.vehicles[0].job).toBeNull();
  });

  it('keeps a running survey when combat starts', () => {
    const { w, mine, site } = heldAtSite();
    const next = startSurvey(w, mine.id, site.id);
    const me = next.vehicles[0];
    const raider = addVehicle(next, 'scrapjaw', 'buggy', ['mg'], { x: me.pos.x + 6, y: me.pos.y });
    startCombat(next, raider, me);
    next.events = [];
    const after = endTurn(next, testDrive);
    expect(after.vehicles[0].job?.kind).toBe('survey');
    expect(after.events.some((e) => e.t === 'job' && e.outcome === 'cancelled')).toBe(false);
  });

  it('is cancelled by moving in combat and marks nothing', () => {
    const { w, mine, site } = heldUnderFire();
    const next = startSurvey(w, mine.id, site.id);
    next.vehicles[0].speed = 5;
    const after = underFireTurn(next);
    expect(after.vehicles[0].job).toBeNull();
    expect((after.player.contracts[0] as SurveyContract).points[0].done).toBe(false);
  });

  it('is cancelled by a knockout under fire and marks nothing', () => {
    const { w, mine, site } = heldUnderFire();
    const next = startSurvey(w, mine.id, site.id);
    corePart(next.vehicles[0], 'cab').hp = 0;
    const after = underFireTurn(next);
    expect(after.vehicles[0].job).toBeNull();
    expect((after.player.contracts[0] as SurveyContract).points[0].done).toBe(false);
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

function heldSurvey(siteId: string, shop = 'bowl'): { w: World; mine: SurveyContract } {
  const { w, c } = offerAt(shop);
  const held = acceptContract(w, c.id);
  const mine = held.player.contracts[0] as SurveyContract;
  mine.points = [{ site: siteId, found: false, done: false }];
  return { w: held, mine };
}

function parkAt(w: World, pos: Vec): void {
  w.vehicles[0].pos = { ...pos };
  w.vehicles[0].speed = 0;
  refreshVision(w);
}

function foundEvents(w: World) {
  return w.events.filter((e) => e.t === 'contract' && e.outcome === 'found');
}

describe('survey clue', () => {
  it('names the posting shop when it gives a fair clue, and the nearest fair place otherwise', () => {
    const sites = surveySites(TEST_MAP);
    const byShop = sites.find((s) => s.clues.some((k) => k.landmark === 'bowl'));
    const elsewhere = sites.find((s) => !s.clues.some((k) => k.landmark === 'bowl'))!;
    if (byShop) expect(surveyClue(heldSurvey(byShop.id).mine, { site: byShop.id, found: false, done: false }).landmark).toBe('bowl');
    const clue = surveyClue(heldSurvey(elsewhere.id).mine, { site: elsewhere.id, found: false, done: false });
    expect(clue.landmark).toBe(elsewhere.clues[0].landmark);
    expect(clue.tiles).toBe(elsewhere.clues[0].tiles);
    expect(clue.type).toBe(elsewhere.type);
    expect(clue.lay).toBe(elsewhere.lay);
    expect(compassSector(clue.rad)).toBe(compassSector(bearing(siteOf(clue.landmark).pos, elsewhere.pos)));
  });

  it('is told for every site from every shop in its range', () => {
    for (const s of surveySites(TEST_MAP))
      for (const shop of Object.keys(SHOPS)) {
        if (dist(siteOf(shop).pos, s.pos) > rules.range) continue;
        const clue = surveyClue({ ...heldSurvey(s.id).mine, shop }, { site: s.id, found: false, done: false });
        expect(clue.tiles % rules.clue.roundTiles).toBe(0);
        expect(clue.rad % (Math.PI / 4)).toBeCloseTo(0);
      }
  });

  it('reads the same from every truck position', () => {
    const site = surveySites(TEST_MAP)[0];
    const { w, mine } = heldSurvey(site.id);
    const told = surveyClue(mine, mine.points[0]);
    for (const pos of [site.pos, { x: 30, y: 30 }, siteOf('nose').pos]) {
      parkAt(w, pos);
      expect(surveyClue(mine, mine.points[0])).toEqual(told);
    }
  });

  it('throws for a site the bake does not know', () => {
    const { mine } = heldSurvey(surveySites(TEST_MAP)[0].id);
    expect(() => surveyClue(mine, { site: 'survey-nowhere', found: false, done: false })).toThrow(/survey-nowhere/);
  });
});

describe('finding a survey place', () => {
  const site = surveySites(TEST_MAP)[0];

  it('finds the place once when the truck sees one of its props', () => {
    const { w, mine } = heldSurvey(site.id);
    parkAt(w, { x: site.pos.x + 4, y: site.pos.y });
    findSurveySites(w);
    expect(mine.points[0].found).toBe(true);
    expect(foundEvents(w)).toHaveLength(1);
    expect(foundEvents(w)[0]).toMatchObject({ site: site.id });
    findSurveySites(w);
    expect(foundEvents(w)).toHaveLength(1);
  });

  it('does not find the place from gray vision range', () => {
    const { w, mine } = heldSurvey(site.id);
    for (const far of [40, 60, 80]) {
      parkAt(w, { x: site.pos.x, y: site.pos.y + far });
      findSurveySites(w);
    }
    expect(mine.points[0].found).toBe(false);
    expect(foundEvents(w)).toHaveLength(0);
  });

  it('does not count a sighting from before the contract was taken', () => {
    const { w, c } = offerAt('bowl');
    const point = c.points[0];
    const s = surveySite(w, point.site);
    const shopPad = { ...w.vehicles[0].pos };
    parkAt(w, { x: s.pos.x + 4, y: s.pos.y });
    findSurveySites(w);
    expect(foundEvents(w)).toHaveLength(0);
    parkAt(w, shopPad);
    const held = acceptContract(w, c.id);
    findSurveySites(held);
    expect((held.player.contracts[0] as SurveyContract).points.every((p) => !p.found)).toBe(true);
    parkAt(held, { x: s.pos.x + 4, y: s.pos.y });
    const next = endTurn(held, testDrive);
    expect((next.player.contracts[0] as SurveyContract).points.find((p) => p.site === point.site)!.found).toBe(true);
    expect(foundEvents(next)).toHaveLength(1);
  });

  it('finds the place in the turn the truck comes into sight', () => {
    const { w, mine } = heldSurvey(site.id);
    parkAt(w, { x: site.pos.x + 4, y: site.pos.y });
    const next = endTurn(w, testDrive);
    expect((next.player.contracts[0] as SurveyContract).points[0].found).toBe(true);
    expect(mine.points[0].found).toBe(false);
  });
});

describe('survey gate', () => {
  it('never offers Survey from the road nearest any prop of any site, even once found', () => {
    for (const s of surveySites(TEST_MAP)) {
      const { w, mine } = heldSurvey(s.id);
      mine.points[0].found = true;
      for (const prop of s.props) {
        parkAt(w, nearestRoadPoint(prop.pos));
        expect(surveyActions(w)).toEqual([]);
      }
    }
  });

  it('offers no Survey at a place not found yet, even in reach, and refuses to start one', () => {
    const s = surveySites(TEST_MAP)[0];
    const { w, mine } = heldSurvey(s.id);
    parkAt(w, { x: s.pos.x + 1, y: s.pos.y });
    expect(surveyActions(w)).toEqual([]);
    expect(() => startSurvey(w, mine.id, s.id)).toThrow(/reach of an open survey site/);
  });

  it('offers Survey by any prop of a found place', () => {
    const s = surveySites(TEST_MAP).find((x) => x.props.length > 1 && dist(x.props[1].pos, x.pos) > 6)!;
    const { w, mine } = heldSurvey(s.id);
    mine.points[0].found = true;
    const [first, second] = s.props;
    const away = dist(first.pos, second.pos);
    const park = { x: second.pos.x + (second.pos.x - first.pos.x) / away, y: second.pos.y + (second.pos.y - first.pos.y) / away };
    expect(dist(park, first.pos)).toBeGreaterThan((first.reach + ECONOMY.useRange) * ECONOMY.interactionScale);
    parkAt(w, park);
    expect(surveyActions(w)).toEqual([{ contractId: mine.id, site: s.id, ready: true }]);
  });

  it('pays once after the place is found, surveyed and reported', () => {
    const s = surveySites(TEST_MAP).find((x) => dist(x.pos, siteOf('bowl').pos) <= rules.range)!;
    const { w, mine } = heldSurvey(s.id);
    const money = w.player.money;
    parkAt(w, { x: s.pos.x + 1, y: s.pos.y });
    let next = endTurn(w, testDrive);
    expect(surveyActions(next)).toHaveLength(1);
    next = startSurvey(next, mine.id, s.id);
    for (let i = 0; i < rules.surveyTurns; i++) next = endTurn(next, testDrive);
    expect(isSurveyMet(next.player.contracts[0] as SurveyContract)).toBe(true);
    parkAt(next, sitePads(siteOf('bowl'))[0]);
    const paid = deliverContract(next, mine.id);
    expect(paid.player.money).toBe(money + mine.reward);
    expect(() => deliverContract(paid, mine.id)).toThrow();
  });
});

const CARDINAL_ANGLE = { east: 0, south: Math.PI / 2, west: Math.PI, north: -Math.PI / 2 };
const OCTANT_ANGLE = { east: 0, southEast: 1, south: 2, southWest: 3, west: 4, northWest: 5, north: 6, northEast: 7 };

function toldAim(leave: Extract<DirectionStep, { do: 'leave' }>): number {
  const angle = (OCTANT_ANGLE[leave.octant] * Math.PI) / 4;
  if (leave.lean === null) return angle;
  const toward = CARDINAL_ANGLE[leave.lean];
  const diff = Math.atan2(Math.sin(toward - angle), Math.cos(toward - angle));
  return angle + Math.sign(diff) * (Math.PI / 8);
}

function fakeSurvey(shop: string, site: string): SurveyContract {
  return { id: 'ct-way', shop, kind: 'survey', points: [{ site, found: false, done: false }], reward: 0, deadline: 0, window: 0, tier: 1 };
}

function surveyPairs(w: World): { shop: string; site: string }[] {
  return surveySites({ hash: w.mapHash, terrain: w.terrain }).flatMap((s) =>
    Object.keys(SHOPS).filter((shop) => dist(siteOf(shop).pos, s.pos) <= rules.range).map((shop) => ({ shop, site: s.id })),
  );
}

describe('survey way', () => {
  const w = standardWorld(1);
  const pairs = surveyPairs(w);

  it('tells a full way to every survey site from every shop in range', () => {
    const untold = pairs.filter((p) => surveyWay(w, fakeSurvey(p.shop, p.site), { site: p.site, found: false, done: false }) === null);
    expect(untold).toEqual([]);
  });

  it('leads the truck in sight of the place', () => {
    const lost: string[] = [];
    let walked = 0;
    expect(pairs.length).toBeGreaterThanOrEqual(35);
    for (const { shop, site } of pairs) {
      const place = surveySite(w, site);
      const way = surveyWay(w, fakeSurvey(shop, site), { site, found: false, done: false });
      if (!way) throw new Error(`${shop} ${site}`);
      const leave = way.find((s): s is Extract<DirectionStep, { do: 'leave' }> => s.do === 'leave');
      if (!leave) continue;
      const gate = directionsFromSite(w, shop, { kind: 'spot', pos: place.pos, clue: 'place' });
      expect(gate).toEqual(way);
      const gates = roadNetworkOf(w).nodes.filter((n) => n.site === shop && roadNetworkOf(w).incident[n.id].length > 0);
      const from = gates.map((g) => g.pos).sort((a, b) => dist(a, place.pos) - dist(b, place.pos))[0];
      const sides = way[0].do === 'gate' ? way[0].side : null;
      const gateSides = distinctCardinals(gates.map((g) => ({ x: g.pos.x - siteOf(shop).pos.x, y: g.pos.y - siteOf(shop).pos.y })));
      const start = sides === null || !gateSides ? from : gates[gateSides.indexOf(sides)]?.pos ?? from;
      walked++;
      const followed = followSteps(w, start, way, { spot: place.pos });
      if (followed.closest > DIRECTIONS.leaveReach) {
        lost.push(`${shop} ${site} road ${followed.closest}`);
        continue;
      }
      const reach = leave.span === 'near' ? DIRECTIONS.spans.near : DIRECTIONS.spans.fair;
      const aim = toldAim(leave);
      const sight = sightRadius(w, playerVehicle(w));
      const seesFrom = (p: Vec) => {
        const tiles = visibleTiles(w, p);
        return place.props.some((prop) => tiles.has(tileOf(w, prop.pos)));
      };
      const nearest = (p: Vec) => place.props.reduce((a, b) => (dist(p, b.pos) < dist(p, a.pos) ? b : a)).pos;
      let seen = false;
      let close: Vec | null = null;
      for (let d = 0; d <= reach && !seen && !close; d += 3) {
        const p = { x: followed.closestAt.x + Math.cos(aim) * d, y: followed.closestAt.y + Math.sin(aim) * d };
        seen = seesFrom(p);
        if (!seen && dist(p, nearest(p)) <= sight) close = p;
      }
      if (!seen && close) {
        const target = nearest(close);
        const length = dist(close, target);
        for (let d = 0; d <= length && !seen; d += 2) seen = seesFrom({ x: close.x + ((target.x - close.x) * d) / length, y: close.y + ((target.y - close.y) * d) / length });
      }
      if (!seen) lost.push(`${shop} ${site} unseen`);
    }
    expect(walked).toBeGreaterThanOrEqual(30);
    expect(lost).toEqual([]);
  });

  it('is pure', () => {
    const { shop, site } = pairs[0];
    const before = JSON.stringify(w.marketRng);
    const a = surveyWay(w, fakeSurvey(shop, site), { site, found: false, done: false });
    expect(surveyWay(w, fakeSurvey(shop, site), { site, found: false, done: false })).toEqual(a);
    expect(JSON.stringify(w.marketRng)).toBe(before);
  });
});
