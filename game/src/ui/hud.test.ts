import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyWorld } from '../sim/testkit';
import { surveySites } from '../sim/survey';
import { TEST_MAP } from '../test/map';
import type { Contract } from '../sim/market';
import type { Msg } from '../text/msg';
import { resolve } from '../text/resolve';
import { Hud, firstAidMsg, heldContractLine } from './hud';
import { maxHealthOf } from '../sim/health';
import { firstAidBlock, startFirstAid } from '../sim/jobs';

class FakeNode {
  className = '';
  children: (FakeNode | string)[] = [];
  append(...children: (FakeNode | string)[]) { this.children.push(...children); }
  setAttribute() {}
  text(): string { return this.children.map((child) => typeof child === 'string' ? child : child.text()).join(''); }
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
    const bounty: Contract = { id: 'c1', kind: 'bounty', shop: 'bowl', template: 'buggy', reward: 100, deadline: 100, window: 100, tier: 1, fulfilled: false };

    const line = heldContractLine(emptyWorld(), bounty) as unknown as FakeNode;

    expect(line.text()).toContain('Knock out or wreck any Raider outrider');
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
