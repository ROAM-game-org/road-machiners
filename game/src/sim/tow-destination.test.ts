import { describe, expect, it } from 'vitest';
import { NPCS } from '../data/npcs';
import { REGION } from '../data/region';
import { playerVehicle } from './damage';
import { makePart } from './factory';
import { mountedParts } from './grid';
import { getResources } from './resources';
import { addVehicle, emptyWorld, npcBrain } from './testkit';
import { npcTowTerms, towSite } from './tow';
import type { Vehicle, World } from './types';
import type { Vec } from './vec';

const posOf = (id: string): Vec => REGION.towns.concat(REGION.locations as never).find((s) => s.id === id)!.pos;
const nearDustwell: Vec = { x: posOf('dustwell').x + 20, y: posOf('dustwell').y };

function quietWorld(playerPos: Vec): World {
  const w = emptyWorld(playerPos);
  for (const id of Object.keys(NPCS)) w.spawnTimer[id] = Number.MAX_SAFE_INTEGER;
  return w;
}

function tower(w: World, templateId = 'trader', pos: Vec = { x: nearDustwell.x + 8, y: nearDustwell.y }): Vehicle {
  const v = addVehicle(w, 'independent', 'hauler', ['stockEngine'], pos, 0);
  v.brain = npcBrain(templateId, pos, NPCS[templateId].traits);
  return v;
}

function stripEngine(v: Vehicle): void {
  for (const part of mountedParts(v, 'engine')) v.items = v.items.filter((it) => !(it.kind === 'part' && it.part === part));
}

describe('tow destination for a player', () => {
  it('goes to the stall nearest the stranded truck', () => {
    const w = quietWorld(nearDustwell);
    expect(towSite(w, tower(w), playerVehicle(w)).id).toBe('dustwell');
  });

  it('goes to a town when no engine is mounted or loose', () => {
    const w = quietWorld(nearDustwell);
    stripEngine(playerVehicle(w));
    expect(['bowl', 'nose']).toContain(towSite(w, tower(w), playerVehicle(w)).id);
  });

  it('goes to the stall again when a loose engine waits in storage', () => {
    const w = quietWorld(nearDustwell);
    stripEngine(playerVehicle(w));
    w.player.storage.push(makePart(w, 'stockEngine', 0));
    expect(towSite(w, tower(w), playerVehicle(w)).id).toBe('dustwell');
  });
});

describe('tow destination for an NPC', () => {
  function client(w: World, money: number): Vehicle {
    const v = tower(w, 'trader', nearDustwell);
    getResources(w, v).money = money;
    return v;
  }

  it('is a stall for a client with money and a working engine', () => {
    const w = quietWorld({ x: 30, y: 30 });
    const c = client(w, 5000);
    const helper = tower(w, 'trader', { x: c.pos.x + 8, y: c.pos.y });
    expect(towSite(w, helper, c).id).toBe('dustwell');
  });

  it('is a town for a broke client', () => {
    const w = quietWorld({ x: 30, y: 30 });
    const c = client(w, 0);
    const helper = tower(w, 'trader', { x: c.pos.x + 8, y: c.pos.y });
    expect(['bowl', 'nose']).toContain(towSite(w, helper, c).id);
  });

  it('is a town for a client with no engine', () => {
    const w = quietWorld({ x: 30, y: 30 });
    const c = client(w, 5000);
    stripEngine(c);
    const helper = tower(w, 'trader', { x: c.pos.x + 8, y: c.pos.y });
    expect(['bowl', 'nose']).toContain(towSite(w, helper, c).id);
  });

  it('is its camp for a raider', () => {
    const w = quietWorld({ x: 30, y: 30 });
    const c = addVehicle(w, 'raider', 'buggy', ['stockEngine'], nearDustwell, 0);
    c.brain = npcBrain('buggy', nearDustwell, NPCS.buggy.traits);
    getResources(w, c).money = 5000;
    const helper = tower(w, 'trader', { x: c.pos.x + 8, y: c.pos.y });
    expect(['scrapjaw', 'kiln']).toContain(towSite(w, helper, c).id);
  });

  it('names the stall in the terms the player gets for towing it', () => {
    const w = quietWorld(nearDustwell);
    const c = client(w, 5000);
    c.pos = { x: nearDustwell.x - 10, y: nearDustwell.y };
    expect(npcTowTerms(w, c).site.id).toBe('dustwell');
  });
});
