import { describe, expect, it } from 'vitest';
import { playerVehicle } from '../sim/damage';
import { mountedItems } from '../sim/grid';
import { chooseQuestOption, QUEST_QUERIES, QUESTS, questView, restoreQuest, setWorldVar, startQuest } from '../sim/quests';
import { flatChoices, pickText } from '../sim/quest-testkit';
import { emptyWorld } from '../sim/testkit';
import type { World } from '../sim/types';

const at = (): World => {
  const w = emptyWorld({ x: 10, y: 10 });
  setWorldVar(w, 'towed_to_bowl', true);
  return startQuest(w, QUESTS, 'intro_bowl', 'start.ask');
};
const offered = (w: World) => questView(w, QUESTS).choices;

const ask = (w: World, text: string): World => pickText(w, text);

describe('Hattie after the first fall', () => {
  it('opens on the questions with a line before them', () => {
    const w = at();
    expect(questView(w, QUESTS).lines.length).toBeGreaterThan(0);
    expect(offered(w)).toEqual(['About me and Bowl…', 'What is out there?', "I'll go."]);
    expect(flatChoices(w)).toEqual(expect.arrayContaining(['Where am I?', 'What happened to me?', 'What do I do now?', 'Any advice?']));
  });

  it('answers each question once and takes it off the list', () => {
    let w = at();
    for (const question of ['Where am I?', 'What do I do now?', 'Any advice?']) {
      w = ask(w, question);
      expect(questView(w, QUESTS).lines.length).toBeGreaterThan(0);
      expect(flatChoices(w)).not.toContain(question);
    }
    expect(w.player.quests.session).not.toBeNull();
  });

  it('opens the follow-ups only after their parent', () => {
    let w = at();
    expect(offered(w).some((c) => c.startsWith('And '))).toBe(false);
    w = ask(w, 'What is out there?');
    expect(offered(w).filter((c) => c.startsWith('And '))).toHaveLength(4);
  });

  it('keeps the place after a load and awards nothing', () => {
    const w = ask(at(), 'Where am I?');
    const loaded = structuredClone(w);
    restoreQuest(loaded, QUESTS);
    expect(flatChoices(loaded)).toEqual(flatChoices(w));
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.player.xp).toEqual(w.player.xp);
  });

  it('ends the scene only when the player leaves', () => {
    const w = ask(ask(at(), 'Any advice?'), "I'll go.");
    expect(w.player.quests.session).toBeNull();
  });
});

const stripEngine = (w: World): World => {
  const me = playerVehicle(w);
  const engines = new Set(mountedItems(me, 'engine'));
  me.items = me.items.filter((item) => !engines.has(item as never));
  return w;
};
const said = (w: World): string => questView(w, QUESTS).lines.map((line) => line.text).join(' ');
const intro = (checkpoint: string, stripped: boolean): World => {
  const w = emptyWorld({ x: 10, y: 10 });
  if (stripped) stripEngine(w);
  setWorldVar(w, 'towed_to_bowl', true);
  return startQuest(w, QUESTS, 'intro_bowl', checkpoint);
};

describe('Hattie and the engine', () => {
  it('knows whether the truck has an engine', () => {
    const w = emptyWorld({ x: 10, y: 10 });
    expect(QUEST_QUERIES.engine_missing(w, [])).toBe(false);
    expect(QUEST_QUERIES.engine_missing(stripEngine(w), [])).toBe(true);
  });

  it.each(['start', 'again'])('does not say the engine was taken at %s when it was not', (checkpoint) => {
    const text = said(intro(checkpoint, false));
    expect(text).not.toMatch(/took your engine|went through the engine|parts for that engine|engine parts/);
    expect(text).toContain('still bolted in');
  });

  it.each(['start', 'again'])('says the engine was taken at %s when it was', (checkpoint) => {
    expect(said(intro(checkpoint, true))).toMatch(/went through the engine/);
  });

  it('answers the questions by what the truck holds', () => {
    const intact = ask(intro('start.ask', false), 'What happened to me?');
    expect(said(intact)).toContain('left the engine alone');
    expect(said(ask(intact, 'What do I do now?'))).not.toMatch(/for an engine/);
    const stripped = ask(intro('start.ask', true), 'What happened to me?');
    expect(said(stripped)).toContain('took your engine');
    expect(said(ask(stripped, 'What do I do now?'))).toContain('for an engine');
  });

  it('keeps the strip question for a stripped truck and awards nothing on load', () => {
    const hub = (stripped: boolean) => {
      const w = emptyWorld({ x: 10, y: 10 });
      if (stripped) stripEngine(w);
      setWorldVar(w, 'towed_to_bowl', true);
      return startQuest(w, QUESTS, 'bowl_hattie', 'start.hub');
    };
    expect(flatChoices(hub(false))).not.toContain('Who stripped my truck?');
    const w = hub(true);
    expect(flatChoices(w)).toContain('Who stripped my truck?');
    const loaded = structuredClone(w);
    restoreQuest(loaded, QUESTS);
    expect(offered(loaded)).toEqual(offered(w));
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.player.xp).toEqual(w.player.xp);
  });
});
