import { expect, it, vi } from 'vitest';
import { emptyWorld, addVehicle, npcBrain } from '../sim/testkit';
import { callVehicle } from '../sim/dialogue';
import { refreshVision } from '../sim/vision';
import type { World } from '../sim/types';
import { closeBenchCall, finishBenchDrive } from './bench';

function fixture() {
  const input = emptyWorld({ x: 30, y: 30 });
  const npc = addVehicle(input, 'independent', 'scout', ['stockEngine'], { x: 31, y: 30 });
  npc.brain = npcBrain('trader', npc.pos, ['trader']);
  refreshVision(input);
  let world = callVehicle(input, npc.id);
  const game = { get state() { return world; }, busy: false, apply: vi.fn((next: World) => { world = next; }) };
  return { game, npc };
}

it('ends an incidental call through the normal game command before continuing the bench', () => {
  const { game, npc } = fixture();
  const before = game.state;

  expect(closeBenchCall(game)).toBe(true);

  expect(game.state.player.call).toBe(null);
  expect(game.state.events).toContainEqual({ t: 'call', with: npc.id, outcome: 'ended' });
  expect(before.player.call?.with).toBe(npc.id);
  expect(game.apply).toHaveBeenCalledOnce();
  expect(closeBenchCall(game)).toBe(false);
  expect(game.apply).toHaveBeenCalledOnce();
});

it('leaves a playing turn untouched until playback ends', () => {
  const { game, npc } = fixture();
  game.busy = true;

  expect(closeBenchCall(game)).toBe(false);

  expect(game.state.player.call?.with).toBe(npc.id);
  expect(game.apply).not.toHaveBeenCalled();
});

it('stops automatic travel at the requested turn before waiting for playback', () => {
  const game = { state: emptyWorld(), busy: true };
  const target = game.state.turn + 6;
  const travel = { stopAuto: vi.fn(() => true) };
  expect(finishBenchDrive(game, target, travel)).toBe(false);
  expect(travel.stopAuto).not.toHaveBeenCalled();

  game.state.turn = target;
  expect(finishBenchDrive(game, target, travel)).toBe(false);
  expect(travel.stopAuto).toHaveBeenCalledWith(game.state);

  game.busy = false;
  expect(finishBenchDrive(game, target, travel)).toBe(true);
});

it('rejects a drive pass that advanced beyond the requested turn', () => {
  const game = { state: emptyWorld(), busy: false };
  const travel = { stopAuto: vi.fn(() => true) };
  expect(() => finishBenchDrive(game, game.state.turn - 1, travel)).toThrow('overshot');
});
