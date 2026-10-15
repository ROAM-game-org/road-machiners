import { describe, expect, it } from 'vitest';
import { NPCS } from '../data/npcs';
import { REGION } from '../data/region';
import { START_KITS } from '../data/start';
import { TEST_MAP } from '../test/map';
import { joinCompany } from '../sim/companies';
import { musterGoal } from '../sim/crews';
import { playerVehicle } from '../sim/damage';
import { guardFee, hireGuard, playerGuard } from '../sim/hire';
import { placeBase } from '../sim/npc-activities';
import { defaultSetup } from '../sim/settings';
import { addVehicle, npcBrain } from '../sim/testkit';
import type { Vehicle, World } from '../sim/types';
import { refreshVision } from '../sim/vision';
import { newWorld } from '../sim/world';
import { loadWorld, saveOf } from './save';
import { memoryBackend, SaveSlots } from './save-db';

const KILN = REGION.locations.find((site) => site.id === 'kiln')!;

function quietWorld(): World {
  const w = newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
  w.vehicles = w.vehicles.filter((v) => v.faction === 'player');
  for (const id of Object.keys(NPCS)) w.spawnTimer[id] = Number.MAX_SAFE_INTEGER;
  return w;
}

function npc(w: World, templateId: string, x: number, y: number): Vehicle {
  const v = addVehicle(w, NPCS[templateId].faction, 'scout', ['mg', 'stockEngine'], { x, y });
  v.brain = npcBrain(templateId, templateId === 'buggy' ? KILN.pos : v.pos, NPCS[templateId].traits);
  return v;
}

function reload(w: World): World {
  const slots = new SaveSlots(memoryBackend(), new Map());
  slots.put('auto', { ...saveOf(w), savedAt: 1000, runId: 'run-1' });
  return loadWorld(slots, 'auto', TEST_MAP)!;
}

function expectSame(w: World, loaded: World): void {
  expect(loaded.states).toEqual(w.states);
  expect(loaded.vehicles.map((v) => [v.id, v.brain?.goals ?? null, v.brain?.musteredAt, v.resources])).toEqual(w.vehicles.map((v) => [v.id, v.brain?.goals ?? null, v.brain?.musteredAt, v.resources]));
  expect(loaded.player.money).toBe(w.player.money);
  expect(loaded.player.xp).toBe(w.player.xp);
  expect(loaded.events).toEqual([]);
}

describe('crews and hires across a save', () => {
  it('loads a muster and a hunting crew the same and awards nothing', () => {
    const w = quietWorld();
    const x = KILN.pos.x + KILN.radius + 4;
    const leader = npc(w, 'buggy', x, KILN.pos.y);
    const member = npc(w, 'buggy', x + 3, KILN.pos.y);
    const asker = npc(w, 'buggy', x, KILN.pos.y + 4);
    npc(w, 'buggy', x + 3, KILN.pos.y + 4);
    joinCompany(w, member, leader, 'crew', { kind: 'crew', camp: 'kiln' });
    placeBase(w, member, { kind: 'follow', targetId: leader.id, destination: { ...leader.pos }, phase: 'travel', reason: 'crewLeader' });
    leader.brain!.musteredAt = w.turn;
    refreshVision(w);
    placeBase(w, asker, musterGoal(w, asker));
    w.events = [];

    expectSame(w, reload(w));
  });

  it('loads a hired guard with the same time left and its follow goal, and awards nothing', () => {
    const w = quietWorld();
    const me = playerVehicle(w);
    const merc = npc(w, 'merc', me.pos.x + 6, me.pos.y);
    refreshVision(w);
    w.player.money = guardFee(w, merc) + 300;
    hireGuard(w, merc, guardFee(w, merc));
    w.turn += 40;
    w.states.find((s) => s.kind === 'hire')!.turnsLeft! -= 40;
    w.events = [];

    const loaded = reload(w);

    expectSame(w, loaded);
    expect(playerGuard(loaded)).toMatchObject({ merc: { id: merc.id }, turnsLeft: playerGuard(w)!.turnsLeft });
  });
});
