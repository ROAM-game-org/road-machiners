import { describe, expect, it } from 'vitest';
import { TOPICS, TRAIT_TALK, type TopicId } from '../data/dialogue';
import { isGroup, TOPIC_GROUPS, TOPIC_ROOT, type GroupId, type TopicChild } from '../data/personalities';
import type { TraitId } from '../data/npcs';
import { askTopic, callVehicle, canAskTopic, chooseOption, currentOptions } from './dialogue';
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

  it('places every group exactly once and holds at most four children in each node', () => {
    const groups = placesOf(TOPIC_ROOT).filter(isGroup);
    expect([...groups].sort()).toEqual(Object.keys(TOPIC_GROUPS).sort());
    expect(TOPIC_ROOT.length).toBeLessThanOrEqual(4);
    for (const [id, group] of Object.entries(TOPIC_GROUPS)) expect(group.children.length, id).toBeLessThanOrEqual(4);
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
