import { afterEach, describe, expect, it, vi } from 'vitest';
import { installCensus, readCensus } from '../../scripts/census-page.mjs';

let used = 0;

class Labels {
  update(world: { turn: number }, rig: { x: number }): number {
    used += 300;
    return world.turn + rig.x;
  }
}

class Fx {
  tick(): void {
    used += 50;
    this.helper();
  }

  helper(): void {
    used += 10;
  }
}

class FakeGame {
  world = { turn: 1 };
  labels = new Labels();
  fx = new Fx();
  rig = { x: 2 };
  frame(): void {
    this.labels.update(this.world, this.rig);
    this.fx.tick();
  }

  tick(): void {
    this.frame();
  }
}

function installOn(game: FakeGame): number {
  vi.stubGlobal('window', { __ROAM__: game });
  vi.stubGlobal('Node', class {});
  vi.stubGlobal('performance', { now: () => 0, memory: { get usedJSHeapSize() { return used; } } });
  return installCensus();
}

describe('census instrument', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('wraps the game and its system objects, leaving plain objects and the game loop alone', () => {
    const game = new FakeGame();
    expect(installOn(game)).toBe(3);
    expect(Object.hasOwn(game, 'tick')).toBe(false);
    expect(Object.hasOwn(game.fx, 'tick')).toBe(true);
  });

  it('counts each call with its own garbage and marks calls on the same world and objects', () => {
    const game = new FakeGame();
    installOn(game);
    for (let i = 0; i < 3; i++) game.frame();
    game.world = { turn: 2 };
    game.frame();
    const { stats, frames } = readCensus();
    expect(frames).toBe(4);
    expect(stats['labels.update']).toMatchObject({ calls: 4, selfBytes: 1200, sameCalls: 2 });
    expect(stats['fx.tick']).toMatchObject({ calls: 4, selfBytes: 200, sameCalls: 2 });
    expect(stats['fx.helper']).toMatchObject({ calls: 4, selfBytes: 40 });
    expect(stats['game.frame']).toMatchObject({ calls: 4, selfBytes: 0 });
  });

  it('fails loud without the dev game on the page', () => {
    vi.stubGlobal('window', {});
    expect(() => installCensus()).toThrow('window.__ROAM__');
  });
});
