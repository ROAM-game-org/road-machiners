import { describe, expect, it } from 'vitest';
import { NPC_BEHAVIOR } from '../data/npcs';
import { sightRadius } from './vision';
import { addVehicle, emptyWorld, npcBrain } from './testkit';
import { berthsOf, chooseOn } from './tracks';

function driverWithWorld() {
  const w = emptyWorld({ x: 30, y: 30 });
  const driver = addVehicle(w, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], { x: 60, y: 60 });
  driver.brain = npcBrain('buggy', driver.pos, ['trader']);
  return { w, driver };
}

describe('berthsOf', () => {
  it('gives no disc without a flee track', () => {
    const { w, driver } = driverWithWorld();
    chooseOn(w, driver, 'v300', { x: 80, y: 60 }, 'investigate', true);
    expect(berthsOf(w, driver)).toEqual([]);
  });

  it('gives a disc at the last sensed point, as wide as sight plus the margin', () => {
    const { w, driver } = driverWithWorld();
    chooseOn(w, driver, 'v300', { x: 80, y: 60 }, 'flee', true);
    expect(berthsOf(w, driver)).toEqual([{ x: 80, y: 60, r: sightRadius(w, driver) + NPC_BEHAVIOR.berthMargin }]);
  });

  it('forgets the truck once the flee memory lapses', () => {
    const { w, driver } = driverWithWorld();
    chooseOn(w, driver, 'v300', { x: 80, y: 60 }, 'flee', true);
    w.turn += NPC_BEHAVIOR.fleeMemory;
    expect(berthsOf(w, driver)).toHaveLength(1);
    w.turn += 1;
    expect(berthsOf(w, driver)).toEqual([]);
  });

  it('skips the truck the top goal targets', () => {
    const { w, driver } = driverWithWorld();
    driver.brain!.goals = [{ kind: 'fight', targetId: 'v300', destination: null, phase: 'travel', reason: 'fightBack' }];
    chooseOn(w, driver, 'v300', { x: 80, y: 60 }, 'flee', true);
    chooseOn(w, driver, 'v301', { x: 90, y: 60 }, 'flee', true);
    expect(berthsOf(w, driver)).toHaveLength(1);
    expect(berthsOf(w, driver)[0].x).toBe(90);
  });
});
