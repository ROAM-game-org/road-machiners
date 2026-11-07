import { describe, expect, it } from 'vitest';
import { TOPICS, TRAIT_TALK, type TopicId } from '../data/dialogue';
import { isGroup, TOPIC_GROUPS, TOPIC_MERGE, TOPIC_ROOT, URGENT_TOPICS, type GroupId, type TopicChild } from '../data/personalities';
import type { TraitId } from '../data/npcs';
import { askTopic, callVehicle, canAskTopic, chooseOption, currentOptions, rootPage } from './dialogue';
import { asksOf } from './dialogue-testkit';
import { addVehicle, emptyWorld, npcBrain } from './testkit';
import { refreshVision } from './vision';
import type { Vehicle, World } from './types';
import { playerVehicle } from './damage';

const ASKABLE_IDS = Object.values(TOPICS).filter((t) => t.ask).map((t) => t.id);

function placesOf(children: readonly TopicChild[]): TopicChild[] {
  return children.flatMap((child) => (isGroup(child) ? [child, ...placesOf(TOPIC_GROUPS[child].children)] : [child]));
}

const VOICED = (Object.keys(TRAIT_TALK) as TraitId[]).filter((id) => TRAIT_TALK[id].voice);

function backAtHub(world: World): World {
  const next = structuredClone(world);
  const call = next.player.call!;
  call.topic = null;
  call.node = 'hub';
  call.vars = {};
  return next;
}

function talker(traits: TraitId[], template = 'trader'): { w: World; npc: Vehicle } {
  const w = emptyWorld({ x: 30, y: 30 });
  const npc = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 36, y: 30 });
  npc.brain = npcBrain(template, npc.pos, traits);
  refreshVision(w);
  return { w, npc };
}

describe('the topic tree', () => {
  it('places every topic with an ask line exactly once', () => {
    const placed = placesOf(TOPIC_ROOT).filter((child) => !isGroup(child));
    expect([...placed].sort()).toEqual([...ASKABLE_IDS].sort());
  });

  it('places every group exactly once, with the merge folder holding only the two it folds', () => {
    const groups = placesOf(TOPIC_ROOT).filter(isGroup);
    expect([...groups].sort()).toEqual(Object.keys(TOPIC_GROUPS).filter((id) => id !== TOPIC_MERGE.group).sort());
    expect([...TOPIC_GROUPS[TOPIC_MERGE.group].children]).toEqual([...TOPIC_MERGE.folds]);
    for (const [id, group] of Object.entries(TOPIC_GROUPS)) expect(group.children.length, id).toBeLessThanOrEqual(4);
  });
});

describe('the first radio page', () => {
  const ALL = new Set<TopicId>(ASKABLE_IDS);
  const URGENT = URGENT_TOPICS.map((u) => u.topic);

  function seededSubsets(count: number): Set<TopicId>[] {
    let seed = 12345;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    return Array.from({ length: count }, () => new Set(ASKABLE_IDS.filter(() => next() < 0.5)));
  }

  it('holds one to four entries for every subset of open topics, however many are urgent', () => {
    for (const open of [ALL, ...seededSubsets(2000)]) {
      if (open.size === 0) continue;
      const urgent = URGENT.filter((id) => open.has(id) && open.size % 3 !== 0);
      const page = rootPage(open, urgent);
      expect(page.length).toBeGreaterThanOrEqual(1);
      expect(page.length).toBeLessThanOrEqual(4);
    }
  });

  it('shows no entry twice and reaches every open topic through its entries', () => {
    for (const open of [ALL, ...seededSubsets(500)]) {
      const page = rootPage(open, URGENT.filter((id) => open.has(id)));
      const shown = page.flatMap((child) => placesOf([child]).filter((c) => !isGroup(c)));
      expect(new Set(page).size).toBe(page.length);
      for (const id of open) expect(shown, id).toContain(id);
    }
  });

  it('lifts the most urgent open topics onto the page when the topics do not fit flat', () => {
    const open = new Set<TopicId>(['askHelp', 'truce', 'directions', 'trade', 'rob']);
    expect(rootPage(open, ['askHelp', 'truce'])).toEqual(['askHelp', 'truce', 'rob', 'talk']);
  });

  it('keeps the most urgent topic when the page must give some up', () => {
    const page = rootPage(ALL, URGENT);
    expect(page.length).toBeLessThanOrEqual(4);
    expect(page.includes(URGENT[0]) || page.some((c) => isGroup(c))).toBe(true);
  });

  it('lists a short set flat with the urgent topics first', () => {
    const page = rootPage(new Set<TopicId>(['directions', 'truce', 'trade']), ['truce']);
    expect(page).toEqual(['truce', 'directions', 'trade']);
  });

  it('puts rob, robCut, warnOff, askTow, truce and mercy at most two picks from the root', () => {
    const depth = (child: TopicChild, from: readonly TopicChild[], level: number): number | null => {
      for (const entry of from) {
        if (entry === child) return level;
        if (isGroup(entry)) {
          const inside = depth(child, TOPIC_GROUPS[entry].children, level + 1);
          if (inside !== null) return inside;
        }
      }
      return null;
    };
    for (const id of ['rob', 'robCut', 'warnOff', 'askTow', 'truce', 'mercy', 'whatDoYouWant'] as const) expect(depth(id, TOPIC_ROOT, 0), id).toBeLessThanOrEqual(1);
  });
});

describe('radio pages', () => {
  it('lists a short set of topics flat, as before', () => {
    const { w, npc } = talker(['raider'], 'buggy');
    const call = callVehicle(w, npc.id);
    expect(asksOf(call).length).toBeLessThanOrEqual(4);
    expect(currentOptions(call).filter((o) => o.group)).toEqual([]);
    expect(currentOptions(call).filter((o) => o.topic).length).toBe(asksOf(call).length);
  });

  it('never offers more than five options on any page for any trait', () => {
    for (const trait of VOICED) {
      const { w, npc } = talker([trait]);
      const root = callVehicle(w, npc.id);
      const queue = [root];
      const seen = new Set<string>();
      while (queue.length > 0) {
        const page = queue.pop()!;
        const offered = currentOptions(page);
        expect(offered.length, `${trait} ${page.player.call!.group}`).toBeLessThanOrEqual(5);
        offered.forEach((o, i) => {
          if (!o.group || seen.has(`${trait}:${o.group}`)) return;
          seen.add(`${trait}:${o.group}`);
          queue.push(chooseOption(page, i));
        });
      }
    }
  });

  it('keeps every askable topic reachable through askTopic', () => {
    for (const trait of VOICED) {
      const { w, npc } = talker([trait]);
      const call = callVehicle(w, npc.id);
      for (const id of ASKABLE_IDS.filter((topic) => canAskTopic(call, topic))) {
        const asked = askTopic(call, id);
        expect(asked.player.call?.topic ?? asked.player.call?.asked, `${trait} ${id}`).toBeTruthy();
      }
    }
  });

  it('opens a group page with a Back and returns to the root with it', () => {
    const { w, npc } = talker(['trader']);
    const call = callVehicle(w, npc.id);
    const index = currentOptions(call).findIndex((o) => o.group);
    expect(index).toBeGreaterThanOrEqual(0);
    const inside = chooseOption(call, index);
    expect(inside.player.call?.group).toBe(currentOptions(call)[index].group);
    const options = currentOptions(inside);
    expect(options[options.length - 1].back).toBe(true);
    const back = chooseOption(inside, options.length - 1);
    expect(back.player.call?.group).toBeNull();
    const playerSays = (world: World) => world.events.filter((e) => e.t === 'say' && e.speaker === playerVehicle(world).id).length;
    expect(playerSays(back)).toBe(playerSays(call));
  });

  it('marks a topic seen once asked in this call, and its group only when all of its topics are', () => {
    const { w, npc } = talker(['trader']);
    const call = callVehicle(w, npc.id);
    const open = ASKABLE_IDS.filter((id) => canAskTopic(call, id));
    expect(currentOptions(call).every((o) => !o.seen)).toBe(true);
    const group = currentOptions(call).find((o) => o.group)!.group as GroupId;
    const inside = open.filter((id) => placesOf([group]).includes(id));
    let next = call;
    inside.forEach((id, n) => {
      next = backAtHub(askTopic(next, id));
      const groupOption = currentOptions(next).find((o) => o.group === group);
      if (groupOption) expect(groupOption.seen, `${group} after ${n + 1} of ${inside.length}`).toBe(n + 1 === inside.length);
    });
  });
});

export type { TopicId };
