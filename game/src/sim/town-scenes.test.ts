import { describe, expect, it } from 'vitest';
import { GAME_WORLD_VARS, TOWN_SCENES, TOWN_SECTIONS } from '../data/quests';
import { RULES } from '../data/rules';
import { startKit } from '../data/start';
import { playerVehicle } from './damage';
import { siteOf } from './market';
import { barDrivers, pickTownSection, QUESTS, townSections } from './quests';
import { defaultSetup } from './settings';
import { nearestPad } from './sites';
import { addVehicle, finishQuest, npcBrain } from './testkit';
import type { Vehicle, World } from './types';
import { newWorld } from './world';
import { TEST_MAP } from '../test/map';

function quietWorld(): World {
  const w = newWorld(1337, startKit('standard'), TEST_MAP, defaultSetup('roaming'));
  w.vehicles = w.vehicles.filter((v) => v.id === playerVehicle(w).id);
  w.events = [];
  return w;
}

function parkAt(w: World, siteId: string): World {
  const me = playerVehicle(w);
  me.pos = { ...nearestPad(siteOf(siteId), me.pos) };
  me.speed = 0;
  me.trail = [];
  return w;
}

function parkNeighbor(w: World, siteId: string, dx: number): Vehicle {
  const pad = nearestPad(siteOf(siteId), playerVehicle(w).pos);
  const v = addVehicle(w, 'scrapjaw', 'buggy', [], { x: pad.x + dx, y: pad.y });
  v.brain = npcBrain('scrapjaw', v.pos, []);
  v.speed = 0;
  return v;
}

function see(w: World, v: Vehicle): void {
  const index = Math.floor(v.pos.y) * w.size + Math.floor(v.pos.x);
  if (!w.player.visible.includes(index)) w.player.visible = [...w.player.visible, index];
}

describe('town sections', () => {
  it('opens Garage, Market and Board at every shop and People where locals live', () => {
    const w = quietWorld();
    const bowl = townSections(parkAt(w, 'bowl'), 'bowl');
    expect(bowl).toMatchObject({ garage: { open: true }, market: { open: true }, board: { open: true }, people: { open: true } });
    expect(townSections(w, 'nowhere').people).toEqual({ open: false, reason: 'noLocals' });
  });

  it('keeps the Bar off while no driver is in sight', () => {
    const w = parkAt(quietWorld(), 'bowl');
    expect(townSections(w, 'bowl').bar).toEqual({ open: false, reason: 'noDrivers' });
  });

  it('lists the five sections in a fixed order', () => {
    expect(TOWN_SECTIONS).toEqual(['garage', 'market', 'board', 'people', 'bar']);
    expect(Object.keys(townSections(parkAt(quietWorld(), 'bowl'), 'bowl'))).toEqual([...TOWN_SECTIONS]);
  });
});

describe('the Bar list', () => {
  it('holds parked drivers in sight on this place, nearest first', () => {
    const w = parkAt(quietWorld(), 'bowl');
    const far = parkNeighbor(w, 'bowl', 1.2);
    const near = parkNeighbor(w, 'bowl', 0.4);
    see(w, far);
    see(w, near);
    expect(barDrivers(w, 'bowl').map((v) => v.id)).toEqual([near.id, far.id]);
    expect(townSections(w, 'bowl').bar).toEqual({ open: true });
  });

  it('leaves out moving, knocked-out, brainless and other-place trucks', () => {
    const w = parkAt(quietWorld(), 'bowl');
    const moving = parkNeighbor(w, 'bowl', 0.4);
    moving.speed = RULES.parkedSpeed + 2;
    const down = parkNeighbor(w, 'bowl', 1.2);
    down.defeat = { phase: 'out', turns: 0, unseen: 0, foes: [], gaveUp: false };
    const wreck = parkNeighbor(w, 'bowl', 1.6);
    wreck.brain = null;
    const elsewhere = parkNeighbor(w, 'nose', 0.4);
    for (const v of [moving, down, wreck, elsewhere]) see(w, v);
    expect(barDrivers(w, 'bowl')).toEqual([]);
  });
});

describe('the Bar list and sight', () => {
  it('leaves out a truck the player cannot see', () => {
    const w = parkAt(quietWorld(), 'bowl');
    parkNeighbor(w, 'bowl', 0.4);
    w.player.visible = [];
    expect(barDrivers(w, 'bowl')).toEqual([]);
  });
});

describe('picking a section', () => {
  it('throws away from a shop and into an off section', () => {
    const w = quietWorld();
    playerVehicle(w).pos = { x: 1, y: 1 };
    expect(() => pickTownSection(w, null, 'market')).toThrow('Not parked at a shop');
    expect(() => pickTownSection(parkAt(quietWorld(), 'bowl'), null, 'bar')).toThrow('off');
  });

  it('changes nothing but the scene gate and the quest session', () => {
    const w = parkAt(quietWorld(), 'bowl');
    const next = pickTownSection(w, null, 'market');
    expect(next.player.money).toBe(w.player.money);
    expect(next.player.xp).toBe(w.player.xp);
    expect(next.turn).toBe(w.turn);
    expect(playerVehicle(next).items).toEqual(playerVehicle(w).items);
    expect(next.shops).toEqual(w.shops);
    expect(next.player.contracts).toEqual(w.player.contracts);
  });

  it('opens one scene at most, and a leave scene wins over an enter scene', () => {
    const w = parkAt(quietWorld(), 'bowl');
    const table = TOWN_SCENES as unknown as typeof TOWN_SCENES[number][];
    const leave = { ...table[0]!, section: 'garage' as const, moment: 'leave' as const, quest: 'bowl_hattie', checkpoint: 'start', gate: 'hattie_met', when: null };
    table.unshift(leave);
    try {
      const next = pickTownSection(w, 'garage', 'market');
      expect(next.player.quests.session?.quest).toBe('bowl_hattie');
      expect(next.player.quests.world.scale_seen).toBeUndefined();
    } finally {
      table.shift();
    }
  });
});

describe('the scene table', () => {
  it('names a shop, a section, a gate that gates its quest and a checkpoint of the quest', () => {
    for (const scene of TOWN_SCENES) {
      expect(siteOf(scene.place)).toBeTruthy();
      expect(TOWN_SECTIONS).toContain(scene.section);
      expect(GAME_WORLD_VARS[scene.gate]?.gates).toBe(scene.quest);
      expect(QUESTS.quests[scene.quest]?.checkpoints).toContain(scene.checkpoint);
    }
  });
});

describe('a finished scene', () => {
  it('stays shut when the same section is entered again', () => {
    const first = pickTownSection(parkAt(quietWorld(), 'bowl'), null, 'market');
    expect(first.player.quests.session).not.toBeNull();
    const again = pickTownSection(finishQuest(first), null, 'market');
    expect(again.player.quests.session).toBeNull();
  });
});

describe('the Nose counter scene', () => {
  it('opens when the player leaves Garage at Nose, once', () => {
    const w = parkAt(quietWorld(), 'nose');
    const next = pickTownSection(w, 'garage', 'market');
    expect(next.player.quests.session?.quest).toBe('nose_counter');
    expect(next.player.quests.world.counter_seen).toBe(true);
    const again = pickTownSection(finishQuest(next), 'garage', 'market');
    expect(again.player.quests.session).toBeNull();
  });

  it('opens nothing on entering Garage, nor on leaving Garage at Bowl', () => {
    expect(pickTownSection(parkAt(quietWorld(), 'nose'), null, 'garage').player.quests.session).toBeNull();
    expect(pickTownSection(parkAt(quietWorld(), 'bowl'), 'garage', 'board').player.quests.session).toBeNull();
  });

  it('pays nothing and changes no money or items', () => {
    const w = parkAt(quietWorld(), 'nose');
    const next = pickTownSection(w, 'garage', null);
    expect(next.player.money).toBe(w.player.money);
    expect(next.player.xp).toBe(w.player.xp);
  });
});
