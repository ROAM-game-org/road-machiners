import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkCompanies, combatStatesOf, companyOf, followersOf, followingOf, joinCompany, leaderOf, sameCompany } from './companies';
import { addState, endState } from './states';
import { addVehicle, emptyWorld, npcBrain } from './testkit';
import type { Vehicle, World } from './types';
import { cloneWorld } from './world';

function npc(w: World, templateId: string, faction: Vehicle['faction'], x: number): Vehicle {
  const v = addVehicle(w, faction, 'scout', ['mg', 'stockEngine'], { x, y: 40 });
  v.brain = npcBrain(templateId, { x, y: 40 }, templateId === 'merc' ? ['merc'] : ['trader']);
  return v;
}

const escort = { kind: 'escort', site: null, fee: 0 } as const;

describe('companies', () => {
  it('lets a truck hold one following state and refuses a second', () => {
    const w = emptyWorld();
    const [a, b, c] = [npc(w, 'merc', 'independent', 40), npc(w, 'trader', 'bowl', 44), npc(w, 'trader', 'bowl', 48)];
    joinCompany(w, a, b, 'escort', escort);

    expect(() => joinCompany(w, a, c, 'escort', escort)).toThrow(/already follows/);
    expect(followingOf(w, a)?.other).toBe(b.id);
  });

  it('refuses a loop of following states', () => {
    const w = emptyWorld();
    const [a, b] = [npc(w, 'merc', 'independent', 40), npc(w, 'trader', 'bowl', 44)];
    joinCompany(w, a, b, 'escort', escort);

    expect(() => joinCompany(w, b, a, 'escort', escort)).toThrow(/loop/);
    expect(() => joinCompany(w, b, b, 'escort', escort)).toThrow(/loop/);
  });

  it('roots the trader, player and merc tree at the trader', () => {
    const w = emptyWorld();
    const me = w.vehicles[0];
    const trader = npc(w, 'trader', 'bowl', 44);
    const merc = npc(w, 'merc', 'independent', 48);
    joinCompany(w, me, trader, 'escort', escort);
    joinCompany(w, merc, me, 'hire', { kind: 'hire', fee: 100 });

    expect(leaderOf(w, merc).id).toBe(trader.id);
    expect(companyOf(w, merc).members.map((v) => v.id)).toEqual([me.id, merc.id]);
    expect(sameCompany(w, merc, trader)).toBe(true);
    expect(followersOf(w, me.id).map((v) => v.id)).toEqual([merc.id]);
    expect(followersOf(w, me.id, ['escort'])).toEqual([]);
  });

  it('ranks followers by birth and then id', () => {
    const w = emptyWorld();
    const leader = npc(w, 'trader', 'bowl', 44);
    const [x, y] = [npc(w, 'merc', 'independent', 40), npc(w, 'merc', 'independent', 48)];
    w.turn = 5;
    joinCompany(w, y, leader, 'escort', escort);
    w.turn = 3;
    joinCompany(w, x, leader, 'escort', escort);

    expect(followersOf(w, leader.id).map((v) => v.id)).toEqual([x.id, y.id]);
  });

  it('refreshes after a state starts or ends and after a clone', () => {
    const w = emptyWorld();
    const [a, b] = [npc(w, 'merc', 'independent', 40), npc(w, 'trader', 'bowl', 44)];
    expect(followersOf(w, b.id)).toEqual([]);
    const s = joinCompany(w, a, b, 'escort', escort);
    expect(followersOf(w, b.id).map((v) => v.id)).toEqual([a.id]);
    const copy = cloneWorld(w);
    endState(w, s, 'broken');
    expect(followersOf(w, b.id)).toEqual([]);
    expect(followersOf(copy, b.id).map((v) => v.id)).toEqual([a.id]);
    addState(w, 'combat', a.id, b.id, { kind: 'none' });
    expect(combatStatesOf(w, b.id)).toHaveLength(1);
  });

  it('throws at load on a saved truck with two following states', () => {
    const w = emptyWorld();
    const [a, b, c] = [npc(w, 'merc', 'independent', 40), npc(w, 'trader', 'bowl', 44), npc(w, 'trader', 'bowl', 48)];
    addState(w, 'escort', a.id, b.id, escort);
    addState(w, 'escort', a.id, c.id, escort);

    expect(() => checkCompanies(w)).toThrow(/two following states/);
  });

  it('keeps every write of the state list in states.ts, and only joinCompany adds a following state', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles('src')) {
      const text = readFileSync(file, 'utf8');
      if (!file.endsWith('states.ts') && /\.states\.(push|splice|pop|shift|unshift|sort|reverse)\(/.test(text)) offenders.push(`${file}: in-place write`);
      if (/\b(s|state|held|ended)\.(kind|holder|other)\s*=[^=]/.test(text)) offenders.push(`${file}: state edge write`);
      if (!file.endsWith('companies.ts') && /addState\([^,]+,\s*['"](escort|crew|hire)['"]/.test(text)) offenders.push(`${file}: following state outside joinCompany`);
    }
    expect(offenders).toEqual([]);
  });
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.test.ts') && !path.includes('/test/') ? [path] : [];
  });
}
