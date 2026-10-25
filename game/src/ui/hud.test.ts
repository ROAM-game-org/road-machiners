import { afterEach, describe, expect, it, vi } from 'vitest';
import { addVehicle, emptyWorld, npcBrain } from '../sim/testkit';
import { lookOverError } from '../sim/look-over';
import { markError } from '../sim/detect';
import { refusalText } from '../text/names';
import { say } from '../text/language';
import { surveySites } from '../sim/survey';
import { TEST_MAP } from '../test/map';
import type { Contract } from '../sim/market';
import type { Msg } from '../text/msg';
import { resolve } from '../text/resolve';
import { Hud, cardActions, firstAidMsg, heldContractLine } from './hud';
import { maxHealthOf } from '../sim/health';
import { firstAidBlock, startFirstAid } from '../sim/jobs';
import type { CrimeCase, World } from '../sim/types';

class FakeNode {
  className = '';
  children: (FakeNode | string)[] = [];
  append(...children: (FakeNode | string)[]) { this.children.push(...children); }
  tag = '';
  attrs: Record<string, string> = {};
  setAttribute(name: string, value: string) { this.attrs[name] = value; }
  addEventListener() {}
  text(): string { return this.children.map((child) => typeof child === 'string' ? child : child.text()).join(''); }
  withTag(tag: string): FakeNode[] { return [...(this.tag === tag ? [this] : []), ...this.children.flatMap((child) => typeof child === 'string' ? [] : child.withTag(tag))]; }
  all(cls: string): FakeNode[] { return [...(this.className.split(' ').includes(cls) ? [this] : []), ...this.children.flatMap((child) => typeof child === 'string' ? [] : child.all(cls))]; }
}

describe('held contract line', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the summary and due time beside progress and every open survey clue', () => {
    vi.stubGlobal('document', {
      createElement: () => new FakeNode(),
      createTextNode: (value: string) => Object.assign(new FakeNode(), { children: [value] }),
    });
    const [first, second, third] = surveySites(TEST_MAP);
    const contract: Contract = {
      id: 'c3', kind: 'survey', shop: 'bowl', reward: 3000, deadline: 100, window: 100, tier: 1,
      points: [{ site: first.id, found: true, done: true }, { site: second.id, found: true, done: false }, { site: third.id, found: false, done: false }],
    };

    const line = heldContractLine(emptyWorld(), contract) as unknown as FakeNode;

    expect(line.text()).toContain('Survey');
    expect(line.text()).toContain('1 of 3 surveyed');
    expect(line.text()).toContain('by Day');
    expect(line.all('contract-clue')).toHaveLength(2);
    expect(line.all('tag').map((tag) => tag.text())).toEqual(['found']);
  });

  it('restores the summary of an ordinary held contract', () => {
    vi.stubGlobal('document', {
      createElement: () => new FakeNode(),
      createTextNode: (value: string) => Object.assign(new FakeNode(), { children: [value] }),
    });
    const order: Contract = { id: 'c1', kind: 'procure', shop: 'bowl', good: 'salt', units: 5, cratePay: 10, reward: 100, deadline: 100, window: 100, tier: 1 };

    const line = heldContractLine(emptyWorld(), order) as unknown as FakeNode;

    expect(line.text()).toContain('Bring 5 crates of Salt to Bowl');
    expect(line.text()).toContain('by Day');
  });

  it('toasts the found place and completed survey, while keeping a surveyed place in the log', () => {
    const w = emptyWorld();
    const [site] = surveySites(TEST_MAP);
    const contract: Contract = {
      id: 'c3', kind: 'survey', shop: 'bowl', reward: 3000, deadline: 100, window: 100, tier: 1,
      points: [{ site: site.id, found: true, done: true }],
    };
    w.events = [
      { t: 'contract', contract, outcome: 'found', site: site.id },
      { t: 'contract', contract, outcome: 'surveyed', site: site.id },
      { t: 'contract', contract, outcome: 'fulfilled' },
    ];
    const toasts: string[] = [];
    const logged: string[] = [];
    const hud = Object.assign(Object.create(Hud.prototype), {
      toast: (msg: Msg) => toasts.push(resolve(msg, 'en')),
      log: { add: (_turn: number, lines: { text: Msg }[]) => logged.push(...lines.map((line) => resolve(line.text, 'en'))) },
      radio: { hear: () => {} },
    }) as Hud;

    hud.pushEvents(w);

    expect(toasts).toHaveLength(2);
    expect(toasts[0]).toBe(`This is the ${site.type} Bowl asked about.`);
    expect(toasts[1]).toContain('Survey done: report at Bowl');
    expect(logged).toContain(`${site.type.charAt(0).toUpperCase()}${site.type.slice(1)} surveyed, 1 of 1`);
  });
});

describe('first aid reasons', () => {
  const reasonOf = (w: ReturnType<typeof emptyWorld>) => resolve(firstAidMsg(w, firstAidBlock(w)) as Msg, 'en');

  it('names the rank at Toughness 0 and each later reason in its own words', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    w.vehicles[0].speed = 0;
    Object.assign(w.player, { health: 30, supplies: 10 });
    expect(reasonOf(w)).toBe('Needs Toughness 1');
    w.player.ranks.toughness = 1;
    expect(firstAidMsg(w, firstAidBlock(w))).toBeNull();
    w.player.supplies = 0;
    expect(reasonOf(w)).toBe('Need 1 supplies');
    w.player.supplies = 10;
    w.player.health = maxHealthOf(w);
    expect(reasonOf(w)).toBe('Not hurt');
    w.player.health = 30;
    expect(reasonOf(startFirstAid(w))).toBe('Finish first aid first');
  });
});

describe('truck card actions', () => {
  afterEach(() => vi.unstubAllGlobals());

  const handlers = { call: () => {}, act: () => {}, unpin: () => {} };

  function card(gap: number, perks: boolean) {
    vi.stubGlobal('document', {
      createElement: (tag: string) => Object.assign(new FakeNode(), { tag }),
      createTextNode: (value: string) => Object.assign(new FakeNode(), { children: [value] }),
    });
    const w = emptyWorld({ x: 30, y: 30 });
    w.player.ranks.perception = 1;
    if (perks) w.player.perks.push('spotter');
    const npc = addVehicle(w, 'independent', 'hauler', ['stockEngine'], { x: 30 + gap, y: 30 });
    npc.brain = npcBrain('trader', npc.pos, ['trader']);
    const row = cardActions(w, npc, handlers) as unknown as FakeNode | null;
    return { w, npc, row };
  }

  it('draws Look over and Mark as buttons with keycaps off touch', () => {
    const { row } = card(5, true);
    const buttons = row!.withTag('button');
    expect(buttons.map((b) => b.text())).toEqual(['CallT', 'Look overB', 'MarkN']);
    expect(row!.all('key')).toHaveLength(3);
    expect(row!.className).toBe('info-actions');
    expect(buttons.every((b) => !b.className.includes('touch-only'))).toBe(true);
  });

  it('shows no Mark button without the spotter perk', () => {
    const { row } = card(5, false);
    expect(row!.withTag('button').map((b) => b.text())).toEqual(['CallT', 'Look overB']);
  });

  it('disables a refused button with the sim reason', () => {
    const { w, npc, row } = card(60, true);
    const [, lookOver, mark] = row!.withTag('button');
    const look = lookOverError(w, npc.id)!;
    expect(lookOver.attrs['aria-disabled']).toBe('true');
    expect(lookOver.attrs['data-reason']).toBe(say(refusalText(w, look)));
    const markRefusal = markError(w, npc.id);
    expect(mark.attrs['aria-disabled']).toBe(markRefusal ? 'true' : undefined);
  });

  it('writes no key text into a button label', () => {
    const { row } = card(5, true);
    expect(row!.text()).not.toMatch(/\[[A-Z]\]/);
  });
});

describe('the Wanted well', () => {
  afterEach(() => vi.unstubAllGlobals());

  class WellNode extends FakeNode {
    style = { display: '' };
    tabIndex = -1;
    innerHTML = '';
    replaceChildren(...children: FakeNode[]) { this.children = children; }
  }

  function renderWell(w: World): WellNode {
    vi.stubGlobal('document', {
      createElement: () => new WellNode(),
      createTextNode: (value: string) => Object.assign(new FakeNode(), { children: [value] }),
    });
    const host = { wanted: new WellNode() };
    (Hud.prototype as unknown as { renderWanted(this: typeof host, w: World): void }).renderWanted.call(host, w);
    return host.wanted;
  }

  function robbed(w: World): CrimeCase {
    const c: CrimeCase = {
      id: 'case1', crime: `1:${w.player.vehicleId}:npc-x:robbed`, offense: 'robbed', target: w.player.vehicleId, victim: 'npc-x', issuer: { kind: 'faction', faction: 'bowl' },
      reporters: ['npc-x'], site: 'bowl', at: { x: 30, y: 30 }, turn: 1, filed: 2, owed: 11097, restitution: 4000, escrow: 0, status: 'open',
      closed: null, hunter: null, retryAt: null, offered: null, known: false, lead: { at: { x: 30, y: 30 }, turn: 1, heading: 0 },
    };
    w.crimes = [c];
    return c;
  }

  it('stays hidden while the only open case is one the player has not learned of', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    robbed(w);
    const well = renderWell(w);
    expect(well.style.display).toBe('none');
    expect(well.children).toEqual([]);
  });

  it('shows a known case with the fine and the restitution in its total', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    robbed(w).known = true;
    const well = renderWell(w);
    expect(well.style.display).toBe('');
    expect(well.all('wanted-owed')[0].text()).toContain('151');
  });
});
