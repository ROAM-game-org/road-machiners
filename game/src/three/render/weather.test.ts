import type * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WEATHER } from '../../data/weather';
import { emptyWorld } from '../../sim/testkit';
import { advanceWeather } from '../../sim/weather';
import { cloneWorld } from '../../sim/world';
import { PHYSICS } from '../../data/physics';
import type { WeatherEvent, World } from '../../sim/types';
import { stepFade, WeatherView } from './weather';

const FADE = WEATHER.sim.stormFadeTurns;
type Storm = Extract<WeatherEvent, { kind: 'storm' }>;

function withStorm(w: World, id: string, age: number, turnsLeft: number): Storm {
  const s: Storm = { id, kind: 'storm', pos: { ...w.vehicles[0].pos }, radius: 60, vel: { x: 0, y: 0 }, turnsLeft, born: w.turn - age };
  w.weather.push(s);
  return s;
}

function stormGroups(view: WeatherView) {
  return view.root.children.filter((g) => g.name === 'dust-storm');
}

describe('stepFade', () => {
  it('moves toward the target by at most the step and stops on it', () => {
    expect(stepFade(0, 1, 0.25)).toBe(0.25);
    expect(stepFade(0.9, 1, 0.25)).toBe(1);
    expect(stepFade(0.5, 0, 0.2)).toBeCloseTo(0.3);
    expect(stepFade(0.1, 0, 0.2)).toBe(0);
    expect(stepFade(0.4, 0.4, 0.2)).toBe(0.4);
  });
});

describe('WeatherView storm haze', () => {
  beforeEach(() => {
    const ctx = { createRadialGradient: () => ({ addColorStop: () => {} }), fillRect: () => {}, fillStyle: '' };
    vi.stubGlobal('document', { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) });
  });
  afterEach(() => vi.unstubAllGlobals());

  const opacityOf = (view: WeatherView, id: string) => (view.shownOf(id) ?? 0) * WEATHER.storm.opacity;

  it('shows a loaded storm mid-fade at its strength from the first frame', () => {
    const w = emptyWorld();
    withStorm(w, 'w1', 9, 100);
    const view = new WeatherView(w);
    expect(opacityOf(view, 'w1')).toBeCloseTo((WEATHER.storm.opacity * 10) / FADE);
    expect(view.shownOf('w1')).toBeLessThan(1);
  });

  it('starts a storm that spawns in play from no haze and eases it up', () => {
    const w = emptyWorld();
    const view = new WeatherView(w);
    withStorm(w, 'w1', FADE, 100);
    view.sync(w);
    expect(view.shownOf('w1')).toBe(0);
    view.fade(1000);
    expect(view.shownOf('w1')).toBeCloseTo(WEATHER.storm.fadePerSecond);
    view.fade(10_000);
    expect(view.shownOf('w1')).toBe(1);
  });

  it('holds the haze still on a frame whose clock ran backwards', () => {
    const w = emptyWorld();
    withStorm(w, 'w1', FADE, 100);
    const view = new WeatherView(w);
    w.weather = [];
    view.sync(w);
    view.fade(-500);
    expect(view.shownOf('w1')).toBe(1);
  });

  it('fades out a storm that ended, then removes its bank and frees its material', () => {
    const w = emptyWorld();
    withStorm(w, 'w1', FADE, 1);
    withStorm(w, 'w2', FADE, 100);
    const view = new WeatherView(w);
    expect(stormGroups(view)).toHaveLength(2);
    const puff = stormGroups(view)[0].children[0] as THREE.Sprite;
    const dispose = vi.spyOn(puff.material, 'dispose');
    w.weather = w.weather.filter((e) => e.id !== 'w1');
    view.sync(w);
    view.fade(10);
    expect(view.shownOf('w1')).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) {
      view.sync(w);
      view.fade(100);
    }
    expect(view.shownOf('w1')).toBeNull();
    expect(dispose).toHaveBeenCalledOnce();
    expect(stormGroups(view)).toHaveLength(1);
    expect(view.shownOf('w2')).toBe(1);
  });

  it('slides a storm bank from its before-turn spot to its sim spot over the turn', () => {
    const before = emptyWorld();
    const storm = withStorm(before, 'w1', FADE, 100);
    storm.vel = { x: 0.5, y: 0.25 };
    const view = new WeatherView(before);
    const after = cloneWorld(before);
    advanceWeather(after);
    const moved = after.weather.find((e) => e.id === 'w1') as Storm;
    const clock = (progress: number) => ({ before, progress, moved: true, hookedLines: new Set<string>() });
    const S = PHYSICS.metersPerTile;
    const spot = () => stormGroups(view)[0].position;
    view.sync(after, clock(0));
    expect(spot().x).toBeCloseTo(storm.pos.x * S, 6);
    view.sync(after, clock(0.5));
    expect(spot().x).toBeCloseTo(((storm.pos.x + moved.pos.x) / 2) * S, 6);
    view.sync(after, clock(1));
    expect(spot().x).toBeCloseTo(moved.pos.x * S, 6);
    view.sync(after, clock(0));
    view.sync(after);
    expect(spot().z).toBeCloseTo(moved.pos.y * S, 6);
  });
});
