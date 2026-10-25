import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CRIME, BOUNTY } from '../data/market';
import { BANDS } from '../data/npc-behavior';
import type { TraitId } from '../data/npcs';
import {
  closeCase, collectBounty, crimeOf, deskAt, deskRows, fileReports, noteKilling, openCasesOn, owedBy, payBounty, payCasesAtDesk, settle, settlementQuote, settlePrice, advanceCrimes, stepPosse, targetNeed,
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
import { addVehicle, emptyWorld, npcBrain } from './testkit';
import { startEscort } from './tow';
import type { CrimeCase, Faction, Vehicle, World } from './types';
import type { Vec } from './vec';
import { cloneWorld } from './world';

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
      remember(w, reporter, { kind: 'witnessed', crime: `${n}:${robber.id}:${victim.id}:attacked`, by: robber.id, victim: victim.id, offense: 'attacked', at: { x: 400, y: 400 }, heading: 0 });
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
    remember(w, poor, { kind: 'witnessed', crime: `1:${robber.id}:${poor.id}:attacked`, by: robber.id, victim: poor.id, offense: 'attacked', at: { x: 400, y: 400 }, heading: 0 });
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
    remember(w, poor, { kind: 'witnessed', crime: `1:${robber.id}:${poor.id}:attacked`, by: robber.id, victim: poor.id, offense: 'attacked', at: { x: 400, y: 400 }, heading: 0 });
    toPad(poor, 'granary');
    fileReports(w, poor);
    w.crimes[0].hunter = poor.id;
    advanceCrimes(w);
    expect(w.crimes[0].hunter).toBeNull();
  });

  it('pays a case once when its id is listed twice', () => {
    const w = atDesk();
    const bowl = trader(w, 'bowl', { x: 300, y: 300 });
    remember(w, bowl, { kind: 'witnessed', crime: `1:${w.player.vehicleId}:${bowl.id}:robbed`, by: w.player.vehicleId, victim: bowl.id, offense: 'robbed', at: { x: 300, y: 300 }, heading: 0 });
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
    remember(w, bowl, { kind: 'witnessed', crime: `1:${w.player.vehicleId}:${bowl.id}:robbed`, by: w.player.vehicleId, victim: bowl.id, offense: 'robbed', at: { x: 300, y: 300 }, heading: 0 });
    toPad(bowl, 'bowl');
    fileReports(w, bowl);
    w.crimes[0].hunter = 'gone';
    expect(deskRows(w).cases).toHaveLength(1);
    w.player.money = 1_000_000;
    payCasesAtDesk(w, [w.crimes[0].id]);
    expect(deskRows(w)).toMatchObject({ cases: [], owed: 0 });
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
    remember(w, bowl, { kind: 'witnessed', crime: `1:${w.player.vehicleId}:${bowl.id}:attacked`, by: w.player.vehicleId, victim: bowl.id, offense: 'attacked', at: { x: 300, y: 300 }, heading: 0 });
    toPad(bowl, 'bowl');
    fileReports(w, bowl);
    expect(settlementQuote(w, 'bowl')!.refusal).toEqual({ id: 'payBountiesFirst', faction: 'bowl' });
    expect(() => settle(w, 'bowl')).toThrow();
    closeCase(w, w.crimes[0], 'lapsed');
    settle(w, 'bowl');
    expect(bandOf(w.player.standing.bowl)).toBe('unfriendly');
    expect(w.events.filter((e) => e.t === 'standing')).toEqual([{ t: 'standing', faction: 'bowl', band: 'unfriendly', cause: { kind: 'settled' } }]);
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
    remember(w, poor, { kind: 'witnessed', crime: `1:${robber.id}:${poor.id}:attacked`, by: robber.id, victim: poor.id, offense: 'attacked', at: { x: 400, y: 400 }, heading: 0 });
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

describe('the posse a case needs', () => {
  function filedOn(): { w: World; robber: Vehicle; c: CrimeCase } {
    const { w, robber, victim, witness } = scene();
    rob(w, robber, victim);
    toPad(witness, 'nose');
    fileReports(w, witness);
    return { w, robber, c: w.crimes[0] };
  }

  it('files a new case for one Marshall', () => {
    const { w, robber, c } = filedOn();
    expect(c.posse).toBe('lone');
    expect(targetNeed(w, robber.id)).toBe('lone');
  });

  it('steps a case from one Marshall to the pair to spent, and throws past spent (IV1)', () => {
    const { w, robber, c } = filedOn();
    stepPosse([c]);
    expect(c.posse).toBe('pair');
    expect(targetNeed(w, robber.id)).toBe('pair');
    stepPosse([c]);
    expect(c.posse).toBe('spent');
    expect(targetNeed(w, robber.id)).toBeNull();
    expect(() => stepPosse([c])).toThrow(/spent/);
  });

  it('sends the pair after a target with a spent case and a new one, and nobody after a closed one (IV4)', () => {
    const { w, robber, c } = filedOn();
    c.posse = 'spent';
    const fresh = { ...structuredClone(c), id: 'case-fresh', posse: 'lone' as const };
    w.crimes = [...w.crimes, fresh];
    expect(targetNeed(w, robber.id)).toBe('pair');
    closeCase(w, fresh, 'lapsed');
    closeCase(w, c, 'lapsed');
    expect(targetNeed(w, robber.id)).toBeNull();
  });

  it("makes the hunter's escort follower's attack on the target no crime, and any other driver's a crime", () => {
    const { w, robber, c } = filedOn();
    const hunter = npc(w, 'marshals', 'marshal', ['marshal', 'brave'], { x: 390, y: 400 });
    const partner = npc(w, 'marshals', 'marshal', ['marshal', 'brave'], { x: 392, y: 404 });
    const stranger = npc(w, 'marshals', 'marshal', ['marshal', 'brave'], { x: 380, y: 404 });
    c.hunter = hunter.id;
    startEscort(w, partner, hunter, null, 0);
    expect(crimeOf(w, partner, robber, 'attacked')).toBe(false);
    expect(crimeOf(w, stranger, robber, 'attacked')).toBe(true);
  });
});
