import { describe, expect, it } from 'vitest';
import { CRIME } from '../data/market';
import type { TraitId } from '../data/npcs';
import { TEST_MAP } from '../test/map';
import { fileReports } from '../sim/crime';
import { recall } from '../sim/memory';
import { getKnownSite } from '../sim/npc-decisions';
import { reportIncident } from '../sim/relations';
import { nearestPad } from '../sim/sites';
import { addVehicle, emptyWorld, npcBrain } from '../sim/testkit';
import type { Faction, Vehicle, World } from '../sim/types';
import type { Vec } from '../sim/vec';
import { loadWorld, saveOf } from './save';
import { memoryBackend, SaveSlots } from './save-db';

function trader(w: World, faction: Faction, pos: Vec): Vehicle {
  const v = addVehicle(w, faction, 'scout', ['mg', 'stockEngine'], pos);
  v.brain = npcBrain('trader', pos, ['trader'] as TraitId[]);
  v.resources = { money: 50000, fuel: 50, supplies: 10, health: 100 };
  return v;
}

function reload(w: World): World {
  const slots = new SaveSlots(memoryBackend(), new Map());
  slots.put('auto', { ...saveOf(w), savedAt: 1000, runId: 'run-1' });
  return loadWorld(slots, 'auto', TEST_MAP)!;
}

function toPad(v: Vehicle, siteId: string): void {
  v.pos = { ...nearestPad(getKnownSite(siteId), v.pos) };
  v.speed = 0;
}

const witnessed = (v: Vehicle) => recall(v, 'witnessed');

describe('crimes across a save', () => {
  it('turns a robbery seen by a witness into a memory, files it only when the witness reaches a pad, and keeps it across a save', () => {
    const w = emptyWorld({ x: 200, y: 200 });
    const robber = trader(w, 'independent', { x: 400, y: 400 });
    const victim = trader(w, 'bowl', { x: 404, y: 400 });
    const witness = trader(w, 'independent', { x: 402, y: 405 });
    reportIncident(w, { aggressor: robber, victim, deed: 'robbed', victimFights: false });
    expect(witnessed(witness).map((m) => m.fact.by)).toEqual([robber.id]);
    expect(witnessed(victim).map((m) => m.fact.by)).toEqual([robber.id]);
    fileReports(w, witness);
    expect(w.crimes).toEqual([]);

    const loaded = reload(w);
    const later = loaded.vehicles.find((v) => v.id === witness.id)!;
    expect(witnessed(later)).toHaveLength(1);
    toPad(later, 'nose');
    fileReports(loaded, later);
    expect(loaded.crimes).toHaveLength(1);
    expect(loaded.crimes[0]).toMatchObject({ target: robber.id, victim: victim.id, offense: 'robbed', site: 'nose', status: 'open', issuer: { kind: 'faction', faction: 'bowl' }, owed: CRIME.fine.robbed });
    expect(witnessed(later)).toEqual([]);
    expect(loaded.events.filter((e) => e.t === 'bountyFiled')).toHaveLength(1);
  });

  it('loads the crime ledger and the Marshalls standing the same and awards nothing (IV11)', () => {
    const w = emptyWorld({ x: 200, y: 200 });
    const robber = trader(w, 'independent', { x: 400, y: 400 });
    const victim = trader(w, 'bowl', { x: 404, y: 400 });
    reportIncident(w, { aggressor: robber, victim, deed: 'robbed', victimFights: false });
    toPad(victim, 'bowl');
    fileReports(w, victim);
    w.crimes[0].hunter = victim.id;
    w.player.standing.marshals = -12;
    const loaded = reload(w);
    expect(loaded.crimes).toEqual(w.crimes);
    expect(loaded.player.standing).toEqual(w.player.standing);
    expect(loaded.player.money).toBe(w.player.money);
    expect(loaded.player.xp).toBe(w.player.xp);
    expect(loaded.events).toEqual([]);
  });
});
