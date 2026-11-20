import { describe, expect, it } from 'vitest';
import { TIME } from '../data/time';
import { litAt } from './hazards';
import { vigilPosts } from './sunward';
import { lightZone } from './sunward-crater';
import { sunAt } from './sun';
import { addVehicle, emptyWorld } from './testkit';
import type { Vec } from './vec';
import { dist } from './vec';
import { canVehicleSee, tileOf, visibleTiles } from './vision';

const turns = Array.from({ length: TIME.turnsPerDay }, (_, i) => i + 1);
const night = turns.find((t) => !sunAt(t))!;
const day = turns.find((t) => sunAt(t))!;

function reactor() {
  const zone = lightZone();
  return { light: zone.core!.light.pos, glow: zone.core!.glow };
}

function westOf(p: Vec, apart: number): Vec {
  return { x: p.x - apart, y: p.y };
}

describe('the reactor light at night', () => {
  it('reaches every vigil post with a margin', () => {
    const { light, glow } = reactor();
    const w = emptyWorld(westOf(light, 30));
    for (const post of vigilPosts(w)) expect(dist(post, light)).toBeLessThanOrEqual(glow - 2);
  });

  it('lights the glow and nothing past it', () => {
    const { light, glow } = reactor();
    const w = emptyWorld(westOf(light, 30));
    w.turn = night;
    expect(litAt(w, westOf(light, glow - 1))).toBe(true);
    expect(litAt(w, westOf(light, glow + 2))).toBe(false);
  });

  it('shows a lit truck at day sight and an unlit one at night sight', () => {
    const { light, glow } = reactor();
    const viewerPos = westOf(light, glow + 12);
    const w = emptyWorld(viewerPos);
    const viewer = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: viewerPos.x + 1, y: viewerPos.y });
    const inside = westOf(light, glow - 4);
    w.turn = night;
    const insideTruck = addVehicle(w, 'independent', 'scout', ['stockEngine'], inside);
    const outsideTruck = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: viewerPos.x, y: viewerPos.y + 20 });
    expect(canVehicleSee(w, viewer, insideTruck.pos)).toBe(true);
    expect(canVehicleSee(w, viewer, outsideTruck.pos)).toBe(false);
    expect(dist(viewer.pos, insideTruck.pos)).toBeGreaterThan(12.5);
  });

  it('shows the lit ground on the player view at night only', () => {
    const { light, glow } = reactor();
    const w = emptyWorld(westOf(light, glow + 12));
    const post = westOf(light, glow - 4);
    w.turn = night;
    expect(visibleTiles(w, w.vehicles[0].pos).has(tileOf(w, post))).toBe(true);
    w.turn = day;
    expect(litAt(w, post)).toBe(false);
  });
});
