import { describe, expect, it } from 'vitest';
import { noteLead, soughtBy, soughtDrivers } from './leads';
import type { Contract } from './market';
import type { Vehicle, World } from './types';

const base = { shop: 'bowl', reward: 1, deadline: 900, window: 400, tier: 1 as const };
const search = (id: string, target: string, delivered = false): Contract => ({ ...base, id, kind: 'search', target, driver: 'Mack Holt', template: 'trader', lead: { at: { x: 1, y: 1 }, turn: 5 }, delivered });
const rescue = (id: string, client: string, fulfilled = false): Contract => ({ ...base, id, kind: 'rescue', client, driver: 'Jed Cobb', need: 'fuel', area: { x: 9, y: 9 }, lead: null, fulfilled });
const haul = (id: string): Contract => ({ ...base, id, kind: 'haul', good: 'salt', units: 1, to: 'nose', rush: false });

const worldOf = (contracts: Contract[]): World => ({ player: { contracts } }) as unknown as World;
const npc = (id: string): Vehicle => ({ id }) as Vehicle;

describe('sought drivers', () => {
  it('lists the open search and every open rescue in held order', () => {
    const w = worldOf([rescue('r1', 'v1'), haul('h'), search('s1', 'v2'), rescue('r2', 'v3')]);
    expect(soughtDrivers(w).map((s) => s.vehicle)).toEqual(['v1', 'v2', 'v3']);
  });

  it('leaves out a delivered search and a fulfilled rescue', () => {
    const w = worldOf([search('s1', 'v2', true), rescue('r1', 'v1', true)]);
    expect(soughtDrivers(w)).toEqual([]);
  });

  it('leaves out the asked driver itself', () => {
    const w = worldOf([rescue('r1', 'v1'), search('s1', 'v2')]);
    expect(soughtBy(w, npc('v1')).map((s) => s.contract)).toEqual(['s1']);
    expect(soughtBy(worldOf([rescue('r1', 'v1')]), npc('v1'))).toEqual([]);
  });
});

describe('noting a lead', () => {
  it('sets a rescue lead, then moves it only to a newer sighting', () => {
    const w = worldOf([rescue('r1', 'v1')]);
    noteLead(w, 'r1', { x: 4, y: 4 }, 30);
    noteLead(w, 'r1', { x: 8, y: 8 }, 10);
    expect(w.player.contracts[0]).toMatchObject({ lead: { at: { x: 4, y: 4 }, turn: 30 } });
    noteLead(w, 'r1', { x: 8, y: 8 }, 40);
    expect(w.player.contracts[0]).toMatchObject({ lead: { at: { x: 8, y: 8 }, turn: 40 } });
  });

  it('throws for a contract that is not open to seek', () => {
    const w = worldOf([search('s1', 'v2', true), rescue('r1', 'v1', true), haul('h')]);
    for (const id of ['s1', 'r1', 'h', 'ghost']) expect(() => noteLead(w, id, { x: 1, y: 1 }, 99)).toThrow();
  });
});
