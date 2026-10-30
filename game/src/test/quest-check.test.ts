import { describe, expect, it } from 'vitest';
import { START_KITS } from '../data/start';
import { defaultSetup } from '../sim/settings';
import { newWorld } from '../sim/world';
import { TEST_MAP } from './map';
import { checkQuests, gameScenes, QUEST_STATE_LIMIT, questCheck, type QuestReport } from './quest-check';
import { readQuestSources, withEnglishTwins, type QuestSources } from './quest-compile';
import { describeQuestWalks, inWalkFile } from './quest-walk';

const WORLD = `VAR heard = false\n${readQuestSources('src/data/quests')['world.ink']}`;
const LIMIT = 200;

const world = () => newWorld(1, START_KITS.standard, TEST_MAP, defaultSetup('roaming'), false);

function check(quest: string, worldInk = WORLD): string[] {
  const sources: QuestSources = withEnglishTwins({ 'world.ink': worldInk, 'q.ink': `INCLUDE world.ink\n${quest}` });
  return checkQuests(sources, () => [world()], LIMIT).flatMap((report: QuestReport) => report.problems);
}

describe('checkQuests', () => {
  describe('the game quests', () => {
    const game = questCheck(readQuestSources('src/data/quests'));

    it('compile with no problems and cover every quest', () => {
      expect(game.shared.problems).toEqual([]);
      expect(game.questIds).toContain('bowl_hattie');
    });
  });

  describeQuestWalks('the other game quests', (id) => !inWalkFile(id));

  describe('a load that shows no text before its choices', () => {
    const scene = (hubTag: string) =>
      `=== start ===\n# checkpoint: start\nThe road bends.\n-> hub\n= hub\n${hubTag}+ [Go on.]\n  -> END\n+ [Wait.]\n  -> hub\n`;
    const problems = (view: string, hubTag: string): string[] => {
      const sources: QuestSources = withEnglishTwins({ 'world.ink': WORLD, 'q.ink': `${view}INCLUDE world.ink\n${scene(hubTag)}` });
      return checkQuests(sources, () => [world()], LIMIT).flatMap((report: QuestReport) => report.problems);
    };

    it('fails a page quest and names the checkpoint', () => {
      expect(problems('# view: page\n', '# checkpoint: start.hub\n').join('\n')).toContain('a load at checkpoint start.hub shows no text before its choices');
    });

    it('lets a talk keep a checkpoint on its choices', () => {
      expect(problems('', '# checkpoint: start.hub\n')).toEqual([]);
    });

    it('passes a page quest whose choices sit in an untagged stitch', () => {
      expect(problems('# view: page\n', '')).toEqual([]);
    });
  });

  describe('the cap on choices shown at once', () => {
    const hub = (questions: number, back = '') =>
      `=== start ===\n# checkpoint: start\n-> hub\n= hub\n# checkpoint: start.hub\n${Array.from({ length: questions }, (_, i) => `+ [Question ${i}?]\n  Answer ${i}.\n  -> hub\n`).join('')}${back}+ [Leave.]\n  -> END\n`;

    it('passes a hub of four questions and a way out', () => {
      expect(check(hub(4))).toEqual([]);
    });

    it('fails a hub of five questions and a way out, and names the choices', () => {
      const problems = check(hub(5)).join('\n');
      expect(problems).toContain('shows 6 choices at once, over the cap of 5');
      expect(problems).toContain('Question 4? | Leave.');
    });

    it('leaves out a choice while its guard is shut', () => {
      const guarded = hub(4).replace('+ [Leave.]', '+ {heard} [Extra?]\n  -> hub\n+ [Leave.]');
      expect(check(guarded, WORLD)).toEqual([]);
    });
  });

  it('walks a branch on a game query both ways across the scenes', () => {
    const sources = readQuestSources('src/data/quests');
    const kovac = { 'world.ink': sources['world.ink'], 'nose_kovac.ink': sources['nose_kovac.ink'], 'ru/nose_kovac.ink': sources['ru/nose_kovac.ink'] };
    const one = checkQuests(kovac, (id) => gameScenes(world())(id).slice(0, 1), QUEST_STATE_LIMIT);
    const both = checkQuests(kovac, gameScenes(world()), QUEST_STATE_LIMIT);
    expect(both[1].states).toBeGreaterThan(one[1].states);
  });

  it('walks a branch on a world variable that another quest sets', () => {
    const quests = {
      'world.ink': WORLD.replace('VAR heard = false', 'VAR heard = false\nVAR deal = "none"'),
      'a.ink': 'INCLUDE world.ink\n=== start ===\n# checkpoint: start\n+ [Shake.]\n  ~ deal = "struck"\n  -> END\n',
      'b.ink': 'INCLUDE world.ink\n=== start ===\n# checkpoint: start\n+ {deal == "struck"} [About the deal.] -> broken\n+ [Bye.] -> END\n= broken\nHi.\n',
    };
    const problems = checkQuests(withEnglishTwins(quests), () => [world()], LIMIT).flatMap((r) => r.problems);
    expect(problems.join('\n')).toMatch(/b: after About the deal\.: .*(loose end|ran out of content)/i);
  });

  it('passes a quest with a hub that loops back and an exit', () => {
    expect(check('=== start ===\n# checkpoint: start\n- (hub)\n+ [Ask again.] Sure. -> hub\n+ [Bye.] -> END\n')).toEqual([]);
  });

  it('fails a missing divert target', () => {
    expect(check('=== start ===\n# checkpoint: start\nHi.\n-> nowhere\n').join('\n')).toMatch(/q: .*nowhere/);
  });

  it('fails a section that runs out of content without an end', () => {
    expect(check('=== start ===\n# checkpoint: start\nHi.\n').join('\n')).toMatch(/loose end|ran out of content/i);
  });

  it('fails a loop the player can never leave and names the picks that reach it', () => {
    const problems = check('=== start ===\n# checkpoint: start\n+ [Stay.] -> trap\n+ [Leave.] -> END\n= trap\n- (loop)\n+ [Again.] -> loop\n');
    expect(problems).toContain('q: after Stay.: no choice leads to an end from here');
  });

  it('fails a checkpoint tag on the wrong section', () => {
    expect(check('=== start ===\n# checkpoint: begin\nHi.\n-> END\n').join('\n')).toContain('Section start carries the checkpoint tag of begin');
  });

  it('fails a list variable', () => {
    expect(check('LIST moods = calm, angry\n=== start ===\n# checkpoint: start\nHi.\n-> END\n').join('\n')).toContain('List moods cannot be saved');
  });

  it('fails unknown or unclosed markup and an unknown line tag, and names the picks', () => {
    const problems = check('=== start ===\n# checkpoint: start\n+ [Go.]\n  A <glow>bright</glow> sky. # mood:dark\n  So <b>bold.\n  -> END\n').join('\n');
    expect(problems).toContain('q: after Go.: Unknown markup <glow>');
    expect(problems).toContain('Unknown line tag # mood:dark');
    expect(problems).toContain('Markup <b> is never closed');
  });

  it('fails an external with no game function behind it', () => {
    expect(check('=== start ===\n# checkpoint: start\nHi.\n-> END\n', `${WORLD}EXTERNAL teleport()\n`)).toContain('External function teleport has no query or effect in src/sim/quests.ts');
  });

  it('fails a section no checkpoint ever reaches', () => {
    expect(check('=== start ===\n# checkpoint: start\nHi.\n-> END\n=== attic ===\nDust.\n-> END\n')).toContain('q: section attic is never reached');
  });

  it('counts an entry knot as reached when it shares its hub with another entry', () => {
    const hub = '=== start ===\n# checkpoint: start\n-> hub\n= hub\n+ [Ask.]\n  -> END\n=== again ===\n# checkpoint: again\n-> start.hub\n';
    expect(check(hub)).toEqual([]);
  });

  it('fails an effect that throws on the way and names the picks', () => {
    const problems = check('=== start ===\n# checkpoint: start\n+ [Take it.]\n  ~ give_money(-1)\n  -> END\n');
    expect(problems.join('\n')).toContain('q: after Take it.: give_money takes no negative amount');
  });

  it('fails a checkpoint that a load would replay with an effect', () => {
    const problems = check('=== start ===\n# checkpoint: start\n+ [Pay me.] -> paid\n+ [Bye.] -> END\n= paid\n# checkpoint: start.paid\n~ give_money(1)\nHere.\n+ [Bye.] -> END\n');
    expect(problems.join('\n')).toContain('a load here fails: Effect give_money ran while loading checkpoint start.paid');
  });

  it('fails a quest whose states outgrow the limit instead of passing it', () => {
    const problems = check('VAR n = 0\n=== start ===\n# checkpoint: start\n- (hub)\n+ [More.]\n  ~ n += 1\n  -> hub\n+ [Bye.] -> END\n');
    expect(problems).toContain(`q: stopped after ${LIMIT} states, so loops and reach are unchecked`);
  });
});
