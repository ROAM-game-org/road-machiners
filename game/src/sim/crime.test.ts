import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CRIME, BOUNTY } from '../data/market';
import { BANDS } from '../data/npc-behavior';
import type { TraitId } from '../data/npcs';
import {
  canPayBounty, caseOwed, closeCase, knownCasesOn, collectBounty, crimeOf, deskAt, deskRows, fileReports, finesOn, noteHandover, noteKilling, offerCases, openCasesOn, owedBy, payBounty, payCasesAtDesk, settle, settlementQuote, settlePrice, advanceCrimes,
} from './crime';
import { playerVehicle } from './damage';
import { knockOutNpc } from './defeat';
import { recall, remember } from './memory';
import { getKnownSite } from './npc-decisions';
import { npcLedger } from './progression/npc-ledger';
import { attitude, bandOf, reportIncident } from './relations';
import { getResources } from './resources';
import { nearestPad } from './sites';
import { addState } from './states';
import { addVehicle, emptyWorld, npcBrain, testDrive } from './testkit';
import type { CrimeCase, Faction, Vehicle, World } from './types';
import type { Vec } from './vec';
import { cloneWorld, endTurn } from './world';
import { addGoods } from './inventory';
import { hearTerms } from './marshals';
import { giveInTo, payOff, settleCashThreat, settlePlayerPlea, settleThreat, surrenderTo } from './parley';

function npc(w: World, faction: Faction, template: string, traits: TraitId[], pos: Vec): Vehicle {
  const v = addVehicle(w, faction, 'scout', ['mg', 'stockEngine'], pos);
  v.brain = npcBrain(template, pos, traits);
  v.resources = { money: 50000, fuel: 50, supplies: 10, health: 100 };
  return v;
}

const trader = (w: World, faction: Faction, pos: Vec) => npc(w, faction, 'trader', ['trader'], pos);
const raider = (w: World, pos: Vec) => npc(w, 'kiln', 'buggy', ['raider'], pos);

function scene(): { w: World; robber: Vehicle; victim: Vehicle; witness: Vehicle } {
  const w = emptyWorld({ x: 200, y: 200 });
  const robber = trader(w, 'independent', { x: 400, y: 400 });
  const victim = trader(w, 'bowl', { x: 404, y: 400 });
  const witness = trader(w, 'independent', { x: 402, y: 405 });
  return { w, robber, victim, witness };
}

function rob(w: World, robber: Vehicle, victim: Vehicle): void {
  reportIncident(w, { aggressor: robber, victim, deed: 'robbed', victimFights: false });
}

function toPad(v: Vehicle, siteId: string): void {
  v.pos = { ...nearestPad(getKnownSite(siteId), v.pos) };
  v.speed = 0;
}

function witnessed(v: Vehicle) {
  return recall(v, 'witnessed');
}

function moneyOf(w: World, v: Vehicle): number {
  return getResources(w, v).money;
}

describe('witnessed crimes', () => {
  it('files nothing for a robbery nobody saw (IV3)', () => {
    const w = emptyWorld({ x: 200, y: 200 });
    const robber = trader(w, 'independent', { x: 400, y: 400 });
    const victim = trader(w, 'bowl', { x: 404, y: 400 });
    victim.heading = Math.PI;
    victim.brain = null;
    rob(w, robber, victim);
    expect(w.vehicles.filter((v) => v.brain).flatMap((v) => witnessed(v))).toEqual([]);
    expect(w.crimes).toEqual([]);
  });

  it('lets a witness knocked out by the culprit forget, so it never files', () => {
    const { w, robber, victim, witness } = scene();
    rob(w, robber, victim);
    witness.lastHitBy = robber.id;
    knockOutNpc(w, witness);
    expect(witnessed(witness)).toEqual([]);
    toPad(witness, 'nose');
    fileReports(w, witness);
    expect(w.crimes).toEqual([]);
  });

  it('makes one case of one crime, however many witnesses file it, and moves no money for the later ones (IV2)', () => {
    const { w, robber, victim, witness } = scene();
    const third = trader(w, 'independent', { x: 400, y: 406 });
    rob(w, robber, victim);
    for (const v of [witness, third, victim]) {
      toPad(v, 'bowl');
      fileReports(w, v);
    }
    expect(w.crimes).toHaveLength(1);
    expect(w.crimes[0].reporters.sort()).toEqual([victim.id, witness.id, third.id].sort());
    expect(w.events.filter((e) => e.t === 'bountyFiled')).toHaveLength(1);
  });

  it('files nothing for a raid by or on a raider, or for stepping in on an aggressor', () => {
    const w = emptyWorld({ x: 200, y: 200 });
    const kiln = raider(w, { x: 400, y: 400 });
    const road = trader(w, 'independent', { x: 404, y: 400 });
    expect(crimeOf(w, kiln, road, 'robbed')).toBe(false);
    expect(crimeOf(w, road, kiln, 'attacked')).toBe(false);
    const bully = trader(w, 'independent', { x: 410, y: 400 });
    const third = trader(w, 'bowl', { x: 414, y: 400 });
    addState(w, 'combat', bully.id, third.id, { kind: 'none' });
    expect(crimeOf(w, road, bully, 'attacked')).toBe(false);
    expect(crimeOf(w, road, third, 'attacked')).toBe(true);
  });

  it('makes a killing of a driver the killer wronged a crime, for an NPC killer as for the player', () => {
    const { w, robber, victim, witness } = scene();
    remember(w, victim, { kind: 'wronged', by: robber.id, deed: 'robbed' });
    noteKilling(w, robber, victim);
    expect(witnessed(witness).map((m) => m.fact.offense)).toEqual(['killed']);
    const stranger = trader(w, 'independent', { x: 300, y: 300 });
    noteKilling(w, stranger, witness);
    expect(witnessed(victim)).toEqual([]);
  });

  it('checks for witnessed memories before it looks at any site (R1)', () => {
    const { w, witness } = scene();
    const sites = CRIME.reportSites as string[];
    const touched: string[] = [];
    const watched = new Proxy(sites, { get: (t, k, r) => { touched.push(String(k)); return Reflect.get(t, k, r); } });
    (CRIME as { reportSites: readonly string[] }).reportSites = watched;
    try {
      fileReports(w, witness);
    } finally {
      (CRIME as { reportSites: readonly string[] }).reportSites = sites;
    }
    expect(touched).toEqual([]);
  });
});

describe('funding', () => {
  it('stakes a faction fine in full, an independent purse up to half its spendable money, and caps the owed total on one target (IV6)', () => {
    const { w, robber } = scene();
    const poor = trader(w, 'independent', { x: 300, y: 300 });
    poor.resources!.money = 20000;
    const before = poor.resources!.money;
    const fileCase = (reporter: Vehicle, victim: Vehicle, n: number) => {
      remember(w, reporter, { kind: 'witnessed', crime: `${n}:${robber.id}:${victim.id}:attacked`, by: robber.id, victim: victim.id, offense: 'attacked', at: { x: 400, y: 400 }, heading: 0, restitution: 0 });
      toPad(reporter, 'granary');
      fileReports(w, reporter);
    };
    fileCase(poor, poor, 1);
    const own = w.crimes[0];
    expect(own.issuer).toEqual({ kind: 'driver', id: poor.id });
    expect(own.escrow).toBe(own.owed);
    expect(own.owed).toBeLessThanOrEqual(CRIME.fine.attacked);
    expect(poor.resources!.money).toBe(before - own.owed);
    for (let n = 2; n < 22; n++) {
      const bowl = trader(w, 'bowl', { x: 300 + n, y: 320 });
      fileCase(bowl, bowl, n);
    }
    expect(owedBy(w, robber.id)).toBeLessThanOrEqual(CRIME.maxOwed);
    expect(w.crimes.filter((c) => c.issuer.kind === 'faction').every((c) => c.owed <= CRIME.fine.attacked)).toBe(true);
  });
});

describe('closing a case', () => {
  function filed(): { w: World; robber: Vehicle; witness: Vehicle; marshal: Vehicle; c: CrimeCase } {
    const { w, robber, victim, witness } = scene();
    rob(w, robber, victim);
    toPad(witness, 'nose');
    fileReports(w, witness);
    const marshal = npc(w, 'marshals', 'marshal', ['marshal', 'brave'], { x: 390, y: 400 });
    return { w, robber, witness, marshal, c: w.crimes[0] };
  }

  it('throws on a second close (IV1)', () => {
    const { w, c } = filed();
    closeCase(w, c, 'lapsed');
    expect(() => closeCase(w, c, 'paid')).toThrow(/already/);
  });

  it('moves the money of a paid case once: a cut to the Marshall, the rest to the faction coffers, with events the ledger explains (IV10)', () => {
    const { w, robber, marshal, c } = filed();
    const before = cloneWorld(w);
    w.events = [];
    const owed = c.owed;
    payBounty(w, robber, [c], marshal);
    expect(c.status).toBe('paid');
    const fee = Math.round(owed * CRIME.feeShare);
    expect(moneyOf(w, marshal) - moneyOf(before, before.vehicles.find((v) => v.id === marshal.id)!)).toBe(fee);
    expect(moneyOf(before, before.vehicles.find((v) => v.id === robber.id)!) - moneyOf(w, robber)).toBe(owed);
    expect(() => npcLedger(before, w, w.events)).not.toThrow();
    expect(() => payBounty(w, robber, [c], marshal)).toThrow();
  });

  it('pays a collecting Marshall from the faction fund and takes nothing from the target', () => {
    const { w, robber, marshal } = filed();
    const before = cloneWorld(w);
    w.events = [];
    const owed = owedBy(w, robber.id);
    collectBounty(w, marshal, robber);
    expect(openCasesOn(w, robber.id)).toEqual([]);
    expect(moneyOf(w, robber)).toBe(robber.resources!.money);
    expect(moneyOf(w, marshal) - before.vehicles.find((v) => v.id === marshal.id)!.resources!.money).toBe(owed);
    expect(() => npcLedger(before, w, w.events)).not.toThrow();
  });

  it('lapses a case after its days and returns an independent escrow', () => {
    const { w, robber } = scene();
    const poor = trader(w, 'independent', { x: 300, y: 300 });
    remember(w, poor, { kind: 'witnessed', crime: `1:${robber.id}:${poor.id}:attacked`, by: robber.id, victim: poor.id, offense: 'attacked', at: { x: 400, y: 400 }, heading: 0, restitution: 0 });
    toPad(poor, 'granary');
    fileReports(w, poor);
    const before = cloneWorld(w);
    w.events = [];
    w.turn += BOUNTY.lapseTurns;
    advanceCrimes(w);
    expect(w.crimes[0].status).toBe('lapsed');
    expect(poor.resources!.money).toBe(before.vehicles.find((v) => v.id === poor.id)!.resources!.money + w.crimes[0].escrow);
    expect(() => npcLedger(before, w, w.events)).not.toThrow();
  });

  it('keeps cases apart in a cloned world (R6)', () => {
    const { w } = filed();
    const copy = cloneWorld(w);
    copy.crimes[0].lead!.at.x = 1;
    copy.crimes[0].reporters.push('nobody');
    expect(w.crimes[0].lead!.at.x).not.toBe(1);
    expect(w.crimes[0].reporters).not.toContain('nobody');
  });

  it('keeps world.crimes written by crime.ts alone', () => {
    const dir = join(__dirname);
    const writers = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).filter((f) => /\.crimes\s*=(?!=)|\.crimes\.(push|splice)/.test(readFileSync(join(dir, f), 'utf8')));
    expect(writers).toEqual(['crime.ts']);
  });
});

describe('the Marshalls desk', () => {
  function atDesk(): World {
    const w = emptyWorld({ x: 200, y: 200 });
    const me = playerVehicle(w);
    me.pos = { ...nearestPad(getKnownSite('marshal-post'), me.pos) };
    me.speed = 0;
    return w;
  }

  it('opens only on a pad of the post', () => {
    expect(deskAt(emptyWorld({ x: 200, y: 200 }))).toBeNull();
    expect(deskAt(atDesk())).toBe('marshal-post');
  });

  it('frees a case whose hunter no longer pursues its target (R3)', () => {
    const { w, robber } = scene();
    const poor = trader(w, 'independent', { x: 300, y: 300 });
    remember(w, poor, { kind: 'witnessed', crime: `1:${robber.id}:${poor.id}:attacked`, by: robber.id, victim: poor.id, offense: 'attacked', at: { x: 400, y: 400 }, heading: 0, restitution: 0 });
    toPad(poor, 'granary');
    fileReports(w, poor);
    w.crimes[0].hunter = poor.id;
    advanceCrimes(w);
    expect(w.crimes[0].hunter).toBeNull();
  });

  it('pays a case once when its id is listed twice', () => {
    const w = atDesk();
    const bowl = trader(w, 'bowl', { x: 300, y: 300 });
    remember(w, bowl, { kind: 'witnessed', crime: `1:${w.player.vehicleId}:${bowl.id}:robbed`, by: w.player.vehicleId, victim: bowl.id, offense: 'robbed', at: { x: 300, y: 300 }, heading: 0, restitution: 0 });
    toPad(bowl, 'bowl');
    fileReports(w, bowl);
    w.player.money = 1_000_000;
    const id = w.crimes[0].id;
    payCasesAtDesk(w, [id, id]);
    expect(w.crimes[0].status).toBe('paid');
  });

  it('gives rows with no case, with a closed case and with a lost hunter (R5)', () => {
    const w = atDesk();
    expect(deskRows(w)).toEqual({ cases: [], owed: 0, settlements: [] });
    const bowl = trader(w, 'bowl', { x: 300, y: 300 });
    remember(w, bowl, { kind: 'witnessed', crime: `1:${w.player.vehicleId}:${bowl.id}:robbed`, by: w.player.vehicleId, victim: bowl.id, offense: 'robbed', at: { x: 300, y: 300 }, heading: 0, restitution: 0 });
    toPad(bowl, 'bowl');
    fileReports(w, bowl);
    w.crimes[0].hunter = 'gone';
    expect(deskRows(w).cases).toHaveLength(1);
    w.player.money = 1_000_000;
    payCasesAtDesk(w, [w.crimes[0].id]);
    expect(deskRows(w)).toMatchObject({ cases: [], owed: 0 });
  });

  it('sums fine and restitution of every case for Pay all', () => {
    const w = atDesk();
    const bowl = trader(w, 'bowl', { x: 300, y: 300 });
    remember(w, bowl, { kind: 'witnessed', crime: `1:${w.player.vehicleId}:${bowl.id}:robbed`, by: w.player.vehicleId, victim: bowl.id, offense: 'robbed', at: { x: 300, y: 300 }, heading: 0, restitution: 2500 });
    toPad(bowl, 'bowl');
    fileReports(w, bowl);
    expect(deskRows(w).owed).toBe(CRIME.fine.robbed + 2500);
  });

  it('quotes a settlement only for a hostile faction, refuses it while its cases are open, and lifts standing to wary (IV7)', () => {
    const w = atDesk();
    w.player.standing.bowl = BANDS.hostile;
    expect(settlementQuote(w, 'marshals')).toBeNull();
    expect(settlementQuote(w, 'nose')).toBeNull();
    const quote = settlementQuote(w, 'bowl')!;
    expect(quote.price).toBe(settlePrice(BANDS.hostile));
    w.player.money = quote.price - 1;
    expect(settlementQuote(w, 'bowl')!.refusal).toEqual({ id: 'noMoney' });
    w.player.money = quote.price;
    const bowl = trader(w, 'bowl', { x: 300, y: 300 });
    remember(w, bowl, { kind: 'witnessed', crime: `1:${w.player.vehicleId}:${bowl.id}:attacked`, by: w.player.vehicleId, victim: bowl.id, offense: 'attacked', at: { x: 300, y: 300 }, heading: 0, restitution: 0 });
    toPad(bowl, 'bowl');
    fileReports(w, bowl);
    expect(settlementQuote(w, 'bowl')!.refusal).toEqual({ id: 'payBountiesFirst', faction: 'bowl' });
    expect(() => settle(w, 'bowl')).toThrow();
    closeCase(w, w.crimes[0], 'lapsed');
    settle(w, 'bowl');
    expect(bandOf(w.player.standing.bowl)).toBe('unfriendly');
    expect(w.player.money).toBe(0);
  });

  it('settles from -100 for the days of drift it skips, and keeps a personal grudge hostile (IV8)', () => {
    const w = atDesk();
    w.player.standing.bowl = -100;
    const price = settlementQuote(w, 'bowl')!.price;
    expect(price).toBe(settlePrice(-100));
    w.player.money = price;
    const wronged = trader(w, 'bowl', { x: 300, y: 300 });
    remember(w, wronged, { kind: 'wronged', by: w.player.vehicleId, deed: 'robbed' });
    const stranger = trader(w, 'bowl', { x: 310, y: 300 });
    const standing = { ...w.player.standing };
    settle(w, 'bowl');
    expect(w.player.standing).toEqual({ ...standing, bowl: BANDS.hostile + 1 });
    expect(bandOf(attitude(w, stranger, playerVehicle(w)))).not.toBe('hostile');
    expect(bandOf(attitude(w, wronged, playerVehicle(w)))).toBe('hostile');
    expect(w.events.filter((e) => e.t === 'settlement')).toHaveLength(1);
  });
});

describe('the Bounty hunter perk', () => {
  function wanted(perk: boolean): { w: World; robber: Vehicle; me: Vehicle; c: CrimeCase } {
    const { w, robber, victim, witness } = scene();
    rob(w, robber, victim);
    toPad(witness, 'nose');
    fileReports(w, witness);
    if (perk) w.player.perks = ['bountyHunter'];
    const me = playerVehicle(w);
    me.pos = { x: 396, y: 400 };
    return { w, robber, me, c: w.crimes[0] };
  }

  it('collects every open case on a truck the player knocks out, from the fund, with the events a Marshall raises (IV9)', () => {
    const { w, robber, me, c } = wanted(true);
    const owed = owedBy(w, robber.id);
    const before = cloneWorld(w);
    w.events = [];
    robber.lastHitBy = me.id;
    knockOutNpc(w, robber);
    expect(c.status).toBe('collected');
    expect(w.player.money - before.player.money).toBe(owed);
    expect(w.events).toContainEqual(expect.objectContaining({ t: 'shopMoney', kind: 'bountyFund' }));
    expect(w.events).toContainEqual(expect.objectContaining({ t: 'bountyClosed', status: 'collected', collector: me.id, amount: owed }));
    expect(() => npcLedger(before, w, w.events)).not.toThrow();
  });

  it('pays the escrow of an independent case to the player, and only that', () => {
    const { w, robber } = scene();
    const poor = trader(w, 'independent', { x: 300, y: 300 });
    remember(w, poor, { kind: 'witnessed', crime: `1:${robber.id}:${poor.id}:attacked`, by: robber.id, victim: poor.id, offense: 'attacked', at: { x: 400, y: 400 }, heading: 0, restitution: 0 });
    toPad(poor, 'granary');
    fileReports(w, poor);
    w.player.perks = ['bountyHunter'];
    const escrow = w.crimes[0].escrow;
    const money = w.player.money;
    robber.lastHitBy = w.player.vehicleId;
    knockOutNpc(w, robber);
    expect(w.crimes[0].status).toBe('collected');
    expect(w.player.money - money).toBe(escrow);
  });

  it('collects nothing without the perk', () => {
    const { w, robber, me, c } = wanted(false);
    const money = w.player.money;
    robber.lastHitBy = me.id;
    knockOutNpc(w, robber);
    expect(c.status).toBe('open');
    expect(w.player.money).toBe(money);
  });

  it('collects nothing on a knockout another truck dealt', () => {
    const { w, robber, c } = wanted(true);
    const other = trader(w, 'independent', { x: 410, y: 400 });
    const money = w.player.money;
    robber.lastHitBy = other.id;
    knockOutNpc(w, robber);
    expect(c.status).toBe('open');
    expect(w.player.money).toBe(money);
  });

  it('makes an attack on a wanted truck no crime with the perk, and still a crime without it', () => {
    const hunter = wanted(true);
    expect(crimeOf(hunter.w, hunter.me, hunter.robber, 'attacked')).toBe(false);
    const plain = wanted(false);
    expect(crimeOf(plain.w, plain.me, plain.robber, 'attacked')).toBe(true);
  });

  it('keeps an attack on a truck with no open case a crime', () => {
    const { w, me } = wanted(true);
    const clean = trader(w, 'independent', { x: 398, y: 404 });
    expect(crimeOf(w, me, clean, 'attacked')).toBe(true);
  });

  it('never makes a raider collectable, since a raid on a raider files no case', () => {
    const { w, me } = wanted(true);
    const r = raider(w, { x: 398, y: 398 });
    rob(w, me, r);
    expect(openCasesOn(w, r.id)).toEqual([]);
    const money = w.player.money;
    r.lastHitBy = me.id;
    knockOutNpc(w, r);
    expect(w.player.money).toBe(money);
  });
});

function holdUpValue(w: World): number {
  const held = w.events.filter((e) => e.t === 'holdUp');
  expect(held).toHaveLength(1);
  return (held[0] as Extract<World['events'][number], { t: 'holdUp' }>).value;
}

function fileBy(w: World, reporter: Vehicle): CrimeCase {
  toPad(reporter, 'nose');
  fileReports(w, reporter);
  expect(w.crimes).toHaveLength(1);
  return w.crimes[0];
}

describe('restitution of a robbery', () => {
  function playerRobs(): { w: World; me: Vehicle; victim: Vehicle; witness: Vehicle } {
    const w = emptyWorld({ x: 398, y: 400 });
    const victim = trader(w, 'bowl', { x: 404, y: 400 });
    const witness = trader(w, 'independent', { x: 402, y: 405 });
    return { w, me: playerVehicle(w), victim, witness };
  }

  it('adds the value of the cargo a victim drops to the player\'s threat', () => {
    const { w, victim, witness } = playerRobs();
    addGoods(w, victim, 'electronics', 2);
    w.events = [];
    settleThreat(w, victim, 'comply');
    const value = holdUpValue(w);
    expect(value).toBeGreaterThan(0);
    expect(witnessed(witness).map((m) => m.fact.restitution)).toEqual([value]);
    expect(fileBy(w, witness).restitution).toBe(value);
  });

  it('adds the money of a cash cut', () => {
    const { w, victim, witness } = playerRobs();
    w.events = [];
    settleCashThreat(w, victim, 'comply');
    const value = holdUpValue(w);
    expect(value).toBeGreaterThan(0);
    expect(fileBy(w, witness).restitution).toBe(value);
  });

  it('adds what an NPC victim pays turns after the robbery began, and the case owes fine and restitution', () => {
    const { w, robber, victim, witness } = scene();
    rob(w, robber, victim);
    w.turn += 6;
    w.events = [];
    giveInTo(w, victim, robber, { haul: [], money: 2500 });
    expect(holdUpValue(w)).toBe(2500);
    const c = fileBy(w, witness);
    expect(c.restitution).toBe(2500);
    expect(caseOwed(c)).toBe(c.owed + 2500);
    expect(owedBy(w, robber.id)).toBe(c.owed + 2500);
    expect(finesOn(w, robber.id)).toBe(c.owed);
  });

  it('adds what a surrender hands over', () => {
    const { w, robber, victim, witness } = scene();
    addGoods(w, victim, 'scrap', 2);
    rob(w, robber, victim);
    w.events = [];
    surrenderTo(w, victim, robber);
    const value = holdUpValue(w);
    expect(value).toBeGreaterThan(0);
    expect(fileBy(w, witness).restitution).toBe(value);
  });

  it('adds what the player pays for mercy in a robbery fight', () => {
    const w = emptyWorld({ x: 398, y: 400 });
    const me = playerVehicle(w);
    const robber = trader(w, 'independent', { x: 404, y: 400 });
    const witness = trader(w, 'bowl', { x: 402, y: 405 });
    w.player.money = 10_000;
    w.player.standing.bowl = 30;
    rob(w, robber, me);
    w.events = [];
    settlePlayerPlea(w, robber, 'mercy', true, 3000);
    expect(holdUpValue(w)).toBe(3000);
    expect(fileBy(w, witness).restitution).toBe(3000);
  });

  it('adds nothing to an attack, even one that ends in a paid plea, and nothing to a robbery that took nothing', () => {
    const attacked = scene();
    reportIncident(attacked.w, { aggressor: attacked.robber, victim: attacked.victim, deed: 'attacked', victimFights: false });
    payOff(attacked.w, attacked.victim, attacked.robber, 2000);
    expect(fileBy(attacked.w, attacked.witness).restitution).toBe(0);
    const refused = scene();
    rob(refused.w, refused.robber, refused.victim);
    expect(fileBy(refused.w, refused.witness).restitution).toBe(0);
  });

  it('adds to a case filed before the hand-over and to the memory a later witness still holds', () => {
    const { w, robber, victim, witness } = scene();
    const third = trader(w, 'independent', { x: 400, y: 406 });
    rob(w, robber, victim);
    const c = fileBy(w, witness);
    payOff(w, victim, robber, 1800);
    expect(c.restitution).toBe(1800);
    expect(witnessed(third).map((m) => m.fact.restitution)).toEqual([1800]);
    toPad(third, 'nose');
    fileReports(w, third);
    expect(w.crimes).toHaveLength(1);
    expect(c.restitution).toBe(1800);
  });

  it('adds to the newest crime of the pair only, and nothing when the pair has none', () => {
    const { w, robber, victim, witness } = scene();
    reportIncident(w, { aggressor: robber, victim, deed: 'attacked', victimFights: false });
    w.turn += 3;
    rob(w, robber, victim);
    payOff(w, victim, robber, 1200);
    expect(witnessed(witness).map((m) => [m.fact.offense, m.fact.restitution])).toEqual([['robbed', 1200], ['attacked', 0]]);
    const stranger = trader(w, 'independent', { x: 300, y: 300 });
    payOff(w, stranger, robber, 1000);
    expect(witnessed(witness).map((m) => m.fact.restitution)).toEqual([1200, 0]);
  });

  it('throws on a negative or endless value, and on a negative restitution', () => {
    const { w, robber, victim } = scene();
    expect(() => noteHandover(w, robber, victim, -1)).toThrow();
    expect(() => noteHandover(w, robber, victim, Infinity)).toThrow();
    rob(w, robber, victim);
    const c = fileBy(w, victim);
    c.restitution = -5;
    expect(() => caseOwed(c)).toThrow();
  });
});

describe('paying restitution', () => {
  function robbedCase(): { w: World; robber: Vehicle; victim: Vehicle; witness: Vehicle; c: CrimeCase } {
    const { w, robber, victim, witness } = scene();
    rob(w, robber, victim);
    payOff(w, victim, robber, 4000);
    const c = fileBy(w, witness);
    return { w, robber, victim, witness, c };
  }

  it('sends the restitution to the victim and splits the fine as before, with events the ledger explains (IV4)', () => {
    const { w, robber, victim, c } = robbedCase();
    const marshal = npc(w, 'marshals', 'marshal', ['marshal', 'brave'], { x: 390, y: 400 });
    const before = cloneWorld(w);
    w.events = [];
    const fee = Math.round(c.owed * CRIME.feeShare);
    payBounty(w, robber, [c], marshal);
    const was = (v: Vehicle) => moneyOf(before, before.vehicles.find((x) => x.id === v.id)!);
    expect(was(robber) - moneyOf(w, robber)).toBe(c.owed + 4000);
    expect(moneyOf(w, victim) - was(victim)).toBe(4000);
    expect(moneyOf(w, marshal) - was(marshal)).toBe(fee);
    expect(w.events).toContainEqual(expect.objectContaining({ t: 'bountyClosed', status: 'paid', amount: c.owed + 4000 }));
    expect(() => npcLedger(before, w, w.events)).not.toThrow();
  });

  it('sends it to the issuing faction\'s coffers when the victim is gone', () => {
    const { w, robber, victim, c } = robbedCase();
    w.vehicles = w.vehicles.filter((v) => v.id !== victim.id);
    const before = cloneWorld(w);
    w.events = [];
    payBounty(w, robber, [c], null);
    expect(w.events).toContainEqual({ t: 'shopMoney', vehicle: robber.id, amount: -4000, kind: 'bountyCoffers' });
    expect(moneyOf(before, before.vehicles.find((v) => v.id === robber.id)!) - moneyOf(w, robber)).toBe(c.owed + 4000);
    expect(() => npcLedger(before, w, w.events)).not.toThrow();
  });

  it('sends it to the Marshall office when a lone driver filed and the victim is gone', () => {
    const { w, robber } = scene();
    const poor = trader(w, 'independent', { x: 406, y: 402 });
    rob(w, robber, poor);
    payOff(w, poor, robber, 4000);
    const c = fileBy(w, poor);
    expect(c.issuer).toEqual({ kind: 'driver', id: poor.id });
    w.vehicles = w.vehicles.filter((v) => v.id !== poor.id);
    w.events = [];
    payBounty(w, robber, [c], null);
    expect(w.events).toContainEqual({ t: 'shopMoney', vehicle: robber.id, amount: -4000, kind: 'bountyOffice' });
  });

  it('keeps a hunter\'s collection, an escrow and a lapse on the fine alone (IV5)', () => {
    const { w, robber, c } = robbedCase();
    const marshal = npc(w, 'marshals', 'marshal', ['marshal', 'brave'], { x: 390, y: 400 });
    const hunterMoney = moneyOf(w, marshal);
    collectBounty(w, marshal, robber);
    expect(moneyOf(w, marshal) - hunterMoney).toBe(c.owed);
    const poor = scene();
    const lone = trader(poor.w, 'independent', { x: 406, y: 402 });
    rob(poor.w, poor.robber, lone);
    payOff(poor.w, lone, poor.robber, 4000);
    const own = fileBy(poor.w, lone);
    expect(own.escrow).toBe(own.owed);
    const purse = moneyOf(poor.w, lone);
    poor.w.turn += BOUNTY.lapseTurns;
    advanceCrimes(poor.w);
    expect(moneyOf(poor.w, lone) - purse).toBe(own.escrow);
  });

  it('caps the open fines at four robberies whatever the restitution', () => {
    const { w, robber } = scene();
    for (let n = 1; n <= 5; n++) {
      const bowl = trader(w, 'bowl', { x: 404, y: 400 + n });
      w.turn = n;
      rob(w, robber, bowl);
      payOff(w, bowl, robber, 20_000);
      toPad(bowl, 'bowl');
      fileReports(w, bowl);
    }
    expect(finesOn(w, robber.id)).toBeLessThanOrEqual(CRIME.maxOwed);
    expect(openCasesOn(w, robber.id)).toHaveLength(Math.floor(CRIME.maxOwed / CRIME.fine.robbed));
    expect(owedBy(w, robber.id)).toBe(finesOn(w, robber.id) + 20_000 * openCasesOn(w, robber.id).length);
  });

  it('lets a target pay only when its money covers the fine and the restitution', () => {
    const { w, robber, c } = robbedCase();
    robber.resources!.money = c.owed + 3999;
    expect(canPayBounty(w, robber)).toBe(false);
    robber.resources!.money = c.owed + 4000;
    expect(canPayBounty(w, robber)).toBe(true);
  });
});

describe('knowing a case', () => {
  function filedOnPlayer(): World {
    const w = emptyWorld({ x: 398, y: 400 });
    const bowl = trader(w, 'bowl', { x: 404, y: 400 });
    remember(w, bowl, { kind: 'witnessed', crime: `1:${w.player.vehicleId}:${bowl.id}:robbed`, by: w.player.vehicleId, victim: bowl.id, offense: 'robbed', at: { x: 300, y: 300 }, heading: 0, restitution: 0 });
    toPad(bowl, 'bowl');
    fileReports(w, bowl);
    expect(w.crimes).toHaveLength(1);
    return w;
  }

  const known = (w: World) => knownCasesOn(w, w.player.vehicleId).length;

  it('files a case the target has not learned of (IV1)', () => {
    const w = filedOnPlayer();
    expect(w.crimes[0].known).toBe(false);
    expect(known(w)).toBe(0);
  });

  it('tells the target when a Marshall demands payment', () => {
    const w = filedOnPlayer();
    offerCases(w, openCasesOn(w, w.player.vehicleId));
    expect(known(w)).toBe(1);
  });

  it('tells the target when it hears a hunting Marshall\'s terms, with the same price', () => {
    const w = filedOnPlayer();
    const terms = hearTerms(w);
    expect(terms.price).toEqual({ kind: 'money', amount: caseOwed(w.crimes[0]) });
    expect(known(w)).toBe(1);
  });

  it('tells the player at the end of a turn parked at the Roadhouse desk, and not one parked elsewhere (IV2)', () => {
    const elsewhere = filedOnPlayer();
    toPad(playerVehicle(elsewhere), 'bowl');
    expect(known(endTurn(elsewhere, testDrive))).toBe(0);
    const desk = filedOnPlayer();
    toPad(playerVehicle(desk), CRIME.post);
    expect(deskAt(desk)).toBe(CRIME.post);
    expect(known(endTurn(desk, testDrive))).toBe(1);
  });
});
