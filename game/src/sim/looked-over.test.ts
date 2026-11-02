import { describe, expect, it } from 'vitest';
import { NPCS } from '../data/npcs';
import { lineKey } from '../text/names';
import { entryText } from '../text/resolve';
import { vehicleById } from './damage';
import { chooseOption, currentOptions } from './dialogue';
import { addGoods } from './inventory';
import { lookOver, startLookOver } from './look-over';
import { optionWeights } from './npc-decisions';
import { thinkNpc, topGoal } from './npc-activities';
import { hasCargo } from './salvage';
import { stateOf } from './states';
import { addVehicle, emptyWorld, forceOption, npcBrain, testDrive } from './testkit';
import type { Vehicle, World } from './types';
import { endTurn } from './world';

const en = (line: Parameters<typeof lineKey>[0]): string => entryText('en', lineKey(line));
const texts = (w: World): string[] => currentOptions(w).map((o) => en(o.line));

function pick(w: World, text: string): World {
  const i = texts(w).indexOf(text);
  if (i < 0) throw new Error(`No option "${text}" in ${texts(w).join(' | ')}`);
  return chooseOption(w, i);
}

function playerLooksAt(traits: Parameters<typeof npcBrain>[2]): { w: World; npc: Vehicle } {
  const w = emptyWorld({ x: 30, y: 30 });
  for (const id of Object.keys(NPCS)) w.spawnTimer[id] = Number.MAX_SAFE_INTEGER;
  w.player.ranks.perception = 1;
  const npc = addVehicle(w, 'independent', 'hauler', ['stockEngine'], { x: 36, y: 30 }, Math.PI);
  npc.brain = npcBrain('trader', npc.pos, traits);
  addGoods(w, npc, 'scrap', 3);
  return { w, npc };
}

describe('a driver that is looked over', () => {
  it('rolls once while the looker stays in sight', () => {
    forceOption('lookedOver', 'keep');
    const { w, npc } = playerLooksAt(['trader']);
    const done = endTurn(lookOver(w, npc.id), testDrive);
    expect(vehicleById(done, npc.id).brain!.noticed).toHaveProperty([`lookedOver:${done.player.vehicleId}`]);
    const again = vehicleById(done, npc.id);
    done.events.push({ t: 'lookedOver', by: done.player.vehicleId, target: npc.id });
    const before = done.rngState;
    thinkNpc(done, again);
    expect(done.rngState).toBe(before);
  });

  it('may keep away from the looker, with no feud', () => {
    forceOption('lookedOver', 'keepAway');
    const { w, npc } = playerLooksAt(['trader']);
    const done = endTurn(lookOver(w, npc.id), testDrive);
    const me = vehicleById(done, npc.id);
    expect(topGoal(me)).toMatchObject({ kind: 'flee', targetId: done.player.vehicleId, reason: 'sizedUpBy' });
    expect(stateOf(done, 'feud', me.id, done.player.vehicleId)).toBeNull();
  });

  it('offers the radio warning only against the player', () => {
    const { w, npc } = playerLooksAt(['trader', 'brave']);
    expect(optionWeights(w, npc, 'lookedOver', w.player.vehicleId, null)).toHaveProperty('warn');
    const other = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 40, y: 30 });
    expect(optionWeights(w, npc, 'lookedOver', other.id, null)).not.toHaveProperty('warn');
  });

  it('notices an NPC looker too', () => {
    forceOption('lookedOver', 'keepAway');
    const { w, npc } = playerLooksAt(['trader']);
    const looker = addVehicle(w, 'independent', 'scout', ['stockEngine', 'mg'], { x: 40, y: 30 });
    startLookOver(w, looker, npc);
    const done = endTurn(w, testDrive);
    expect(topGoal(vehicleById(done, npc.id))).toMatchObject({ kind: 'flee', targetId: looker.id, reason: 'sizedUpBy' });
  });
});

describe('the look warning on the radio', () => {
  function warned(): { w: World; npc: Vehicle } {
    forceOption('lookedOver', 'warn');
    const { w, npc } = playerLooksAt(['trader', 'brave']);
    const done = endTurn(lookOver(w, npc.id), testDrive);
    if (done.player.call?.topic !== 'lookWarning') throw new Error(`No look warning, call ${JSON.stringify(done.player.call)}`);
    return { w: done, npc: vehicleById(done, npc.id) };
  }

  it('asks what the player is looking at, and moving on ends it in peace', () => {
    const { w, npc } = warned();
    expect(texts(w)).toContain('Nothing. Moving on.');
    const next = pick(w, 'Nothing. Moving on.');
    expect(next.player.call).toBeNull();
    expect(vehicleById(next, npc.id).brain!.noticed).not.toHaveProperty([`lookWarning:${next.player.vehicleId}`]);
    expect(stateOf(next, 'feud', npc.id, next.player.vehicleId)).toBeNull();
    expect(endTurn(next, testDrive).player.call?.topic).not.toBe('lookWarning');
  });

  it('takes "your load" as a threat, like a hold-up', () => {
    forceOption('threatened', 'comply');
    const { w, npc } = warned();
    const next = pick(w, 'Your load.');
    expect(hasCargo(vehicleById(next, npc.id))).toBe(false);
    expect(next.player.talked[npc.id]?.rob).toBe('agreed');
  });

});
