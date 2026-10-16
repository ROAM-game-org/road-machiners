import { describe, expect, it } from 'vitest';
import { chooseQuestOption, QUESTS, questView, restoreQuest, setWorldVar, startQuest } from '../sim/quests';
import { emptyWorld } from '../sim/testkit';
import type { World } from '../sim/types';

const at = (): World => {
  const w = emptyWorld({ x: 10, y: 10 });
  setWorldVar(w, 'towed_to_bowl', true);
  return startQuest(w, QUESTS, 'intro_bowl', 'start.ask');
};
const offered = (w: World) => questView(w, QUESTS).choices;

function ask(w: World, text: string): World {
  const index = offered(w).indexOf(text);
  if (index < 0) throw new Error(`No choice ${text} in ${offered(w).join(', ')}`);
  return chooseQuestOption(w, QUESTS, index);
}

describe('Hattie after the first fall', () => {
  it('opens on the questions with a line before them', () => {
    const w = at();
    expect(questView(w, QUESTS).lines.length).toBeGreaterThan(0);
    expect(offered(w)).toEqual(['Where am I?', 'What happened to me?', 'What do I do now?', 'What is out there?', 'Any advice?', "I'll go."]);
  });

  it('answers each question once and takes it off the list', () => {
    let w = at();
    for (const question of ['Where am I?', 'What do I do now?', 'Any advice?']) {
      w = ask(w, question);
      expect(questView(w, QUESTS).lines.length).toBeGreaterThan(0);
      expect(offered(w)).not.toContain(question);
    }
    expect(w.player.quests.session).not.toBeNull();
  });

  it('opens the follow-ups only after their parent', () => {
    let w = at();
    expect(offered(w)).not.toContain('Who brought me in?');
    w = ask(w, 'What happened to me?');
    expect(offered(w)).toContain('Who brought me in?');
    expect(offered(w).some((c) => c.startsWith('And '))).toBe(false);
    w = ask(w, 'What is out there?');
    expect(offered(w).filter((c) => c.startsWith('And '))).toHaveLength(4);
  });

  it('keeps the place after a load and awards nothing', () => {
    const w = ask(at(), 'Where am I?');
    const loaded = structuredClone(w);
    restoreQuest(loaded, QUESTS);
    expect(offered(loaded)).toEqual(offered(w));
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.player.xp).toEqual(w.player.xp);
  });

  it('ends the scene only when the player leaves', () => {
    const w = ask(ask(at(), 'Any advice?'), "I'll go.");
    expect(w.player.quests.session).toBeNull();
  });
});
