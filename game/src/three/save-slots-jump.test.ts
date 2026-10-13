import { describe, expect, it } from 'vitest';
import { START_KITS } from '../data/start';
import { QUESTS, questView, startQuest } from '../sim/quests';
import { defaultSetup } from '../sim/settings';
import { newWorld } from '../sim/world';
import { TEST_MAP } from '../test/map';
import { jumpToQuest, questJumpOf } from './save-slots';

function world() {
  return newWorld(1, START_KITS.standard, TEST_MAP, defaultSetup('roaming'), false);
}

describe('quest jump', () => {
  it('reads no jump from a page address without a quest', () => {
    expect(questJumpOf('?play')).toBeNull();
  });

  it('reads the quest, checkpoint, picks and page counted from 1', () => {
    expect(questJumpOf('?play&quest=intro_arrival&checkpoint=start.farm&picks=3,1&page=4')).toEqual({ quest: 'intro_arrival', checkpoint: 'start.farm', picks: [2, 0], page: 3 });
  });

  it('opens on the first page with no picks by default', () => {
    expect(questJumpOf('?quest=intro_arrival')).toEqual({ quest: 'intro_arrival', checkpoint: null, picks: [], page: 0 });
  });

  it('refuses a pick or page that is no number from 1', () => {
    expect(() => questJumpOf('?quest=intro_arrival&picks=0')).toThrow('?picks holds 0, which is no number from 1');
    expect(() => questJumpOf('?quest=intro_arrival&page=x')).toThrow('?page holds x, which is no number from 1');
  });

  it('opens the quest at its checkpoint', () => {
    const w = jumpToQuest(world(), { quest: 'intro_arrival', checkpoint: 'start.farm', picks: [], page: 0 });
    expect(w.player.quests.session?.quest).toBe('intro_arrival');
    expect(questView(w, QUESTS).choices).toContain('Go to the shed.');
  });

  it('opens the first checkpoint when none is named', () => {
    const w = jumpToQuest(world(), { quest: 'intro_arrival', checkpoint: null, picks: [], page: 0 });
    expect(w.player.quests.session).toEqual(startQuest(world(), QUESTS, 'intro_arrival', QUESTS.quests.intro_arrival.checkpoints[0]).player.quests.session);
  });

  it('names the known quests when the quest is unknown', () => {
    expect(() => jumpToQuest(world(), { quest: 'nowhere', checkpoint: null, picks: [], page: 0 })).toThrow('names no quest');
  });
});
