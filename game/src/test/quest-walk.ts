import { describe, expect, it } from 'vitest';
import { START_KITS } from '../data/start';
import { defaultSetup } from '../sim/settings';
import { newWorld } from '../sim/world';
import { TEST_MAP } from './map';
import { gameScenes, QUEST_STATE_LIMIT, questCheck, type SceneWalk } from './quest-check';
import { readQuestSources } from './quest-compile';

export const WALK_FILE_PREFIXES = ['yard_', 'pump_', 'nose_'];

export const inWalkFile = (questId: string): boolean => WALK_FILE_PREFIXES.some((prefix) => questId.startsWith(prefix));

export function describeQuestWalks(title: string, wanted: (questId: string) => boolean): void {
  describe(title, () => {
    const game = questCheck(readQuestSources('src/data/quests'));
    const scenes = gameScenes(newWorld(1, START_KITS.standard, TEST_MAP, defaultSetup('roaming'), false));

    for (const id of game.questIds.filter(wanted)) {
      describe(`walks ${id}`, () => {
        const walks: SceneWalk[] = [];
        const count = game.sceneCount(id, scenes);

        for (let index = 0; index < count; index++) {
          it(`scene ${index + 1} of ${count} has no problems`, () => {
            const walk = game.walkScene(id, scenes, QUEST_STATE_LIMIT, index);
            walks[index] = walk;
            expect(walk.problems).toEqual([]);
          });
        }

        it('reaches every section within the state limit', () => {
          expect(walks.filter(Boolean)).toHaveLength(count);
          const report = game.finish(id, walks, QUEST_STATE_LIMIT);
          expect(report.problems).toEqual([]);
          expect(report.states).toBeGreaterThan(1);
        });
      });
    }
  });
}

export const inFirstNoseFile = (questId: string): boolean => /^nose_(depot_leak|edda|ibo)$/.test(questId);
