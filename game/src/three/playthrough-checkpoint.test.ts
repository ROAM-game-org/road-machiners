import { describe, expect, it } from 'vitest';
import { activityFrom, playthroughWorld } from '../sim/progression/activity';
import { TEST_MAP } from '../test/map';
import type { World } from '../sim/types';
import { checkpointOf, checkResume, resumeCheckpoint } from './playthrough-checkpoint';
import { saveOf } from './save';

const SEED = 4;
const HALF = 3;

function play(start: World, turns: number): World {
  let last = start;
  const lines = activityFrom(start, { seed: SEED, archetype: 'markov', turns, every: 50, sha: null, onWorld: (world) => { last = world; } });
  for (const _line of lines) continue;
  return last;
}

describe('playthrough checkpoints', () => {
  it('resumes a run into the same game an unbroken run plays', async () => {
    const straight = play(playthroughWorld(TEST_MAP, SEED, 'markov'), 2 * HALF);
    const half = play(playthroughWorld(TEST_MAP, SEED, 'markov'), HALF);
    const text = JSON.stringify(checkpointOf(half, 'markov'));
    const resumed = await resumeCheckpoint(text, TEST_MAP);
    expect(resumed.world.turn).toBe(half.turn);
    const finished = play(resumed.world, HALF);
    expect(finished.turn).toBe(straight.turn);
    expect(saveOf(finished).world).toEqual(saveOf(straight).world);
  }, 600000);

  it('refuses a resume under another seed or archetype than its checkpoint', async () => {
    const world = playthroughWorld(TEST_MAP, SEED, 'markov');
    const resumed = await resumeCheckpoint(JSON.stringify(checkpointOf(world, 'markov')), TEST_MAP);
    expect(() => checkResume(resumed, SEED + 1, 'markov')).toThrow(/seed/);
    expect(() => checkResume(resumed, SEED, 'trader')).toThrow(/archetype/);
    expect(() => checkResume(resumed, SEED, 'markov')).not.toThrow();
  }, 240000);
});
