import { describe, expect, it } from 'vitest';
import { TERRAIN } from '../data/terrain';
import { TIME } from '../data/time';
import { contactsOf, sensesOf } from './detect';
import { sunAt } from './sun';
import { addVehicle, editableTerrain, emptyWorld } from './testkit';
import type { Obstacle, Vehicle, World } from './types';
import { dist } from './vec';
import { farSightRadius, playerSees, refreshVision, sightRadius } from './vision';

const ME = { x: 30, y: 30 };

function dayWorld(): World {
  const w = emptyWorld(ME);
  w.turn = Array.from({ length: TIME.turnsPerDay }, (_, i) => i + 1).find((t) => sunAt(t))!;
  return w;
}

function parkedAt(w: World, x: number): Vehicle {
  const v = addVehicle(w, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], { x, y: ME.y });
  v.speed = 0;
  return v;
}

function betweenSights(w: World): number {
  const me = w.vehicles[0];
  return ME.x + (sightRadius(w, me) + farSightRadius(w, me)) / 2;
}

function wallAt(x: number): Obstacle {
  return { id: 'wall-0', pos: { x, y: ME.y }, r: 3, kind: 'landmark', look: 'ruin', yaw: 0 };
}

describe('far sight radius', () => {
  it('is the near sight times the far factor, and follows night', () => {
    const w = dayWorld();
    const me = w.vehicles[0];
    expect(farSightRadius(w, me)).toBeCloseTo(sightRadius(w, me) * TERRAIN.vision.farFactor, 9);
    const day = farSightRadius(w, me);
    w.turn = Array.from({ length: TIME.turnsPerDay }, (_, i) => i + 1).find((t) => !sunAt(t))!;
    expect(farSightRadius(w, me)).toBeLessThan(day);
  });
});

describe('far contacts', () => {
  it('shows a parked truck past near sight by plain distance, with nothing else sensed', () => {
    const w = dayWorld();
    const target = parkedAt(w, betweenSights(w));
    refreshVision(w);
    const contact = contactsOf(w, w.vehicles[0], Infinity).find((c) => c.vehicleId === target.id);
    expect(contact?.sources).toEqual(['far']);
    expect(contact?.loudness).toBeNull();
    expect(dist(contact!.center, target.pos)).toBeLessThanOrEqual(contact!.radius);
    expect(playerSees(w, target.pos)).toBe(false);
  });

  it('passes a hill', () => {
    const w = dayWorld();
    editableTerrain(w);
    const size = w.terrain.size;
    for (let i = 36; i <= 40; i++) for (let j = 28; j <= 32; j++) w.terrain.heights[j * (size + 1) + i] = 6;
    const target = parkedAt(w, betweenSights(w));
    refreshVision(w);
    expect(contactsOf(w, w.vehicles[0], Infinity).find((c) => c.vehicleId === target.id)?.sources).toEqual(['far']);
  });

  it('passes a standing wall', () => {
    const w = dayWorld();
    const x = betweenSights(w);
    w.obstacles = [...w.obstacles, wallAt(x - 5)];
    const target = parkedAt(w, x);
    refreshVision(w);
    expect(contactsOf(w, w.vehicles[0], Infinity).find((c) => c.vehicleId === target.id)?.sources).toEqual(['far']);
  });

  it('stops at the far sight radius', () => {
    const w = dayWorld();
    const me = w.vehicles[0];
    const target = parkedAt(w, ME.x + farSightRadius(w, me) + 0.5);
    refreshVision(w);
    expect(contactsOf(w, me, Infinity).find((c) => c.vehicleId === target.id)).toBeUndefined();
  });

  it('is seen, not a contact, inside near sight', () => {
    const w = dayWorld();
    const me = w.vehicles[0];
    const target = parkedAt(w, ME.x + sightRadius(w, me) - 2);
    refreshVision(w);
    const senses = sensesOf(w, me, Infinity);
    expect(senses.seen.map((v) => v.id)).toContain(target.id);
    expect(senses.contacts.find((c) => c.vehicleId === target.id)).toBeUndefined();
  });

  it('joins the sources of a moving truck instead of doubling the contact', () => {
    const w = dayWorld();
    const target = parkedAt(w, betweenSights(w));
    target.speed = 4;
    refreshVision(w);
    const found = contactsOf(w, w.vehicles[0], Infinity).filter((c) => c.vehicleId === target.id);
    expect(found).toHaveLength(1);
    expect(found[0].sources).toContain('far');
    expect(found[0].sources).toContain('sound');
  });

  it('reaches an NPC watcher by its own far sight', () => {
    const w = dayWorld();
    const watcher = addVehicle(w, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], { x: 30, y: 50 });
    watcher.speed = 0;
    const inside = addVehicle(w, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], { x: 30 + (sightRadius(w, watcher) + farSightRadius(w, watcher)) / 2, y: 50 });
    const outside = addVehicle(w, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], { x: 30 + farSightRadius(w, watcher) + 0.5, y: 50 });
    inside.speed = outside.speed = 0;
    const contacts = sensesOf(w, watcher, Infinity).contacts;
    expect(contacts.find((c) => c.vehicleId === inside.id)?.sources).toEqual(['far']);
    expect(contacts.find((c) => c.vehicleId === outside.id)).toBeUndefined();
  });
});
