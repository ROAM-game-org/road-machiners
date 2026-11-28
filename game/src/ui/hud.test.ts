import { addState } from '../sim/states';
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
import { Hud, actionSlot, cardActions, recenterTip, driveControlsOf, firstAidMsg, heldContractLine, systemViewsOf } from './hud';
import { followError, followTruck } from '../sim/follow';
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
  listeners: Record<string, () => void> = {};
  addEventListener(type: string, fn: () => void) { this.listeners[type] = fn; }
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
      id: 'c3', kind: 'survey', shop: 'bowl', reward: 30, deadline: 100, window: 100, tier: 1,
      points: [{ site: first.id, found: true, done: true }, { site: second.id, found: true, done: false }, { site: third.id, found: false, done: false }],
    };

    const line = heldContractLine(emptyWorld(), contract) as unknown as FakeNode;

    expect(line.text()).toContain('Survey');
    expect(line.text()).toContain('1 of 3 surveyed');
    expect(line.text()).not.toMatch(/(Safe|Risky|Dangerous) ground/);
    expect(line.text()).toContain(' left');
    expect(line.all('contract-clue')).toHaveLength(2);
    expect(line.all('tag').map((tag) => tag.text())).toEqual(['found']);
  });

  it('restores the summary of an ordinary held contract', () => {
    vi.stubGlobal('document', {
      createElement: () => new FakeNode(),
      createTextNode: (value: string) => Object.assign(new FakeNode(), { children: [value] }),
    });
    const order: Contract = { id: 'c1', kind: 'procure', shop: 'bowl', good: 'salt', units: 5, cratePay: 10, reward: 1, deadline: 100, window: 100, tier: 1 };

    const line = heldContractLine(emptyWorld(), order) as unknown as FakeNode;

    expect(line.text()).toContain('Bring 5 crates of Salt to Bowl');
    expect(line.text()).toContain(' left');
  });

  it('toasts the found place and completed survey, while keeping a surveyed place in the log', () => {
    const w = emptyWorld();
    const [site] = surveySites(TEST_MAP);
    const contract: Contract = {
      id: 'c3', kind: 'survey', shop: 'bowl', reward: 30, deadline: 100, window: 100, tier: 1,
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

describe('the wake', () => {
  it('toasts You wake up. once and logs it', () => {
    const w = emptyWorld();
    w.events = [{ t: 'wake', gaveUp: false }];
    const toasts: string[] = [];
    const logged: string[] = [];
    const hud = Object.assign(Object.create(Hud.prototype), {
      toast: (msg: Msg) => toasts.push(resolve(msg, 'en')),
      log: { add: (_turn: number, lines: { text: Msg }[]) => logged.push(...lines.map((line) => resolve(line.text, 'en'))) },
      radio: { hear: () => {} },
    }) as Hud;
    hud.pushEvents(w);
    expect(toasts).toEqual(['You wake up.']);
    expect(logged).toEqual(['You wake up.']);
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

  const handlers = { call: () => {}, act: () => {} };

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

  it('draws Call, Look over and Mark as buttons with no keycap on their faces', () => {
    const { row } = card(5, true);
    const buttons = row!.withTag('button');
    expect(buttons.map((b) => b.text())).toEqual(['Radio', 'Look over', 'Follow', 'Mark']);
    expect(row!.all('key')).toHaveLength(0);
    expect(row!.all('cost')).toHaveLength(0);
    expect(buttons[1].attrs.title).toContain('Look over, takes 1 turn');
    expect(row!.className).toBe('info-actions hud-controls');
    expect(buttons.every((b) => !b.className.includes('touch-only'))).toBe(true);
  });

  it('keeps Look over enabled and free of the turn cost once the load is known', () => {
    const { w, npc } = card(5, false);
    addState(w, 'sizedUp', w.player.vehicleId, npc.id, { kind: 'none' });
    const row = cardActions(w, npc, handlers) as unknown as FakeNode;
    const lookOver = row.withTag('button')[1];
    expect(lookOver.text()).toBe('Look over');
    expect(lookOver.attrs['aria-disabled']).toBeUndefined();
    expect(lookOver.attrs.title).not.toContain('takes');
  });

  it('shows no Mark button without the spotter perk', () => {
    const { row } = card(5, false);
    expect(row!.withTag('button').map((b) => b.text())).toEqual(['Radio', 'Look over', 'Follow']);
  });

  it('disables a refused button with the sim reason', () => {
    const { w, npc, row } = card(60, true);
    const [, lookOver, , mark] = row!.withTag('button');
    const look = lookOverError(w, npc.id)!;
    expect(lookOver.attrs['aria-disabled']).toBe('true');
    expect(lookOver.attrs['data-reason']).toBe(say(refusalText(w, look)));
    const markRefusal = markError(w, npc.id);
    expect(mark.attrs['aria-disabled']).toBe(markRefusal ? 'true' : undefined);
  });

  it('enables Follow with its tip, lights it while following and disables it with the sim reason', () => {
    const { w, npc, row } = card(5, false);
    const follow = row!.withTag('button')[2];
    expect(follow.attrs['aria-disabled']).toBeUndefined();
    expect(follow.attrs['aria-pressed']).toBe('false');
    expect(follow.attrs.title).toContain('Follow at its speed until you steer');
    const lit = cardActions(followTruck(w, npc.id), npc, handlers) as unknown as FakeNode;
    expect(lit.withTag('button')[2].attrs['aria-pressed']).toBe('true');
    const far = card(60, false);
    const refused = far.row!.withTag('button')[2];
    expect(refused.attrs['aria-disabled']).toBe('true');
    expect(refused.attrs['data-reason']).toBe(say(refusalText(far.w, followError(far.w, far.npc.id)!)));
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
    get childNodes(): (FakeNode | string)[] { return this.children; }
    isEqualNode(): boolean { return false; }
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
      reporters: ['npc-x'], site: 'bowl', at: { x: 30, y: 30 }, turn: 1, filed: 2, owed: 111, restitution: 40, escrow: 0, status: 'open',
      closed: null, hunter: null, retryAt: null, offered: null, known: false, posse: 'lone', lead: { at: { x: 30, y: 30 }, turn: 1, heading: 0 },
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

describe('order controls while knocked out', () => {
  const orderReasons = (w: World) => Object.values(driveControlsOf(w, false, false)).map((control) => control.reason);

  it('dims every order control with Knocked out, at any time', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    w.player.state = 'knockedOut';
    for (const reason of orderReasons(w)) expect(reason && resolve(reason, 'en')).toBe('Knocked out');
  });

  it('keeps Driver and Journal usable while knocked out and idle', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    w.player.state = 'knockedOut';
    const keys = systemViewsOf(w);
    expect(keys.character.reason).toBeNull();
    expect(keys.journal.reason).toBeNull();
  });

  it('shows no Knocked out reason on an active player', () => {
    const w = emptyWorld({ x: 30, y: 30 });
    expect(orderReasons(w).slice(0, 2)).toEqual([null, null]);
  });
});

describe('panel placement', () => {
  const sideNode = (display: string): HTMLElement => ({ style: { display }, classList: { contains: (name: string) => name === 'journal-side' } }) as unknown as HTMLElement;

  function placing(extra: object = {}) {
    const placed: (HTMLElement | null | undefined)[] = [];
    const observed: HTMLElement[] = [];
    const hud = Object.assign(Object.create(Hud.prototype), {
      side: null,
      sideWasShown: false,
      infoPlacedFor: null,
      placeWatch: { observe: (node: HTMLElement) => observed.push(node) },
      wantPortraits: () => {},
      info: { style: { display: '' } },
      ...extra,
    }) as Hud;
    hud.placeSide = (node?: HTMLElement | null) => {
      placed.push(node);
      Object.assign(hud, { side: node ?? (hud as unknown as { side: HTMLElement | null }).side, sideWasShown: true });
    };
    return { hud, placed, observed };
  }

  it('places and watches a journal side node the first time it moves, then only when it shows or hides', () => {
    const { hud, placed, observed } = placing();
    const node = sideNode('');
    hud.sideMoved(node);
    expect(placed).toEqual([node]);
    expect(observed).toEqual([node]);
    hud.sideMoved(node);
    hud.sideMoved(node);
    expect(placed).toEqual([node]);
    node.style.display = 'none';
    hud.sideMoved(node);
    expect(placed).toEqual([node, undefined]);
  });

  it('places once when the card closes and not on later refreshes with no card', () => {
    const { hud, placed } = placing({ infoPlacedFor: 'truck-1' });
    hud.showInfo(emptyWorld(), null, false);
    hud.showInfo(emptyWorld(), null, false);
    hud.showInfo(emptyWorld(), null, false);
    expect(placed).toHaveLength(1);
  });
});

describe('the picked clean status', () => {
  const status = { id: 'stock.empty.wreck' } as unknown as Msg;
  const action = { label: status, ready: true, target: { kind: 'shop' } } as const;

  it('takes the action bar slot when no action shows', () => {
    expect(actionSlot(null, null, status)).toBe('status');
  });

  it('gives way to a real action', () => {
    expect(actionSlot(action, null, status)).toBe('action');
  });

  it('hides while work shows and when there is no status', () => {
    expect(actionSlot(null, {}, status)).toBe('none');
    expect(actionSlot(action, {}, status)).toBe('none');
    expect(actionSlot(null, null, null)).toBe('none');
  });
});

describe('truck card head', () => {
  afterEach(() => vi.unstubAllGlobals());

  function head(pinned: boolean, unpin: () => void) {
    vi.stubGlobal('document', {
      createElement: (tag: string) => Object.assign(new FakeNode(), { tag }),
      createTextNode: (value: string) => Object.assign(new FakeNode(), { children: [value] }),
    });
    const w = emptyWorld({ x: 30, y: 30 });
    const npc = addVehicle(w, 'independent', 'hauler', ['stockEngine'], { x: 35, y: 30 });
    const hud = Object.assign(Object.create(Hud.prototype), { actions: { unpin } }) as unknown as {
      infoHead(w: World, v: typeof npc, pinned: boolean): unknown;
    };
    return hud.infoHead(w, npc, pinned) as FakeNode;
  }

  it('gives a pinned card one close key that unpins and names Esc', () => {
    const unpin = vi.fn();
    const keys = head(true, unpin).withTag('button');
    expect(keys).toHaveLength(1);
    expect(keys[0].className).toContain('hud-close');
    expect(keys[0].attrs.title).toContain('Esc');
    keys[0].listeners.click();
    expect(unpin).toHaveBeenCalledOnce();
  });

  it('gives a hover card no close key', () => {
    expect(head(false, vi.fn()).withTag('button')).toHaveLength(0);
  });
});

describe('recenter tip', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is a real button so its press sound can be read and a click recenters', () => {
    vi.stubGlobal('document', {
      createElement: (tag: string) => Object.assign(new FakeNode(), { tag }),
      createTextNode: (value: string) => Object.assign(new FakeNode(), { children: [value] }),
    });
    const onclick = vi.fn();
    const tip = recenterTip(onclick) as unknown as FakeNode;
    expect(tip.tag).toBe('button');
    expect(tip.attrs.role).toBeUndefined();
    tip.listeners.click();
    expect(onclick).toHaveBeenCalledOnce();
  });
});
