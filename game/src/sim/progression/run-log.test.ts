import { describe, expect, it } from 'vitest';
import { FURY_ROAD } from '../../data/modes';
import { playerVehicle } from '../damage';
import { advanceFuryRoad, endRun } from '../fury-road';
import { furyRoadWorld } from '../testkit';
import type { GameEvent, World } from '../types';
import { RunLog } from './run-log';

function spawnFirst(w: World): World {
  const next = structuredClone(w);
  next.turn = next.furyRoad!.quietFrom + FURY_ROAD.pacing.quiet;
  advanceFuryRoad(next);
  return next;
}

function shotAt(w: World, shooter: string, damage: number): GameEvent {
  return { t: 'shot', shooter, weapon: 'p0', target: w.player.vehicleId, aim: 'body', chance: 1, damageChance: 1, side: 'front', rounds: [{ hit: true, crit: false, offset: 0, struck: null, hits: [{ part: 'p1', damage }], blast: [], burst: null }] };
}

describe('the Fury Road run log', () => {
  it('names each spawned group truck with its template, chassis, guns, armor and gear value', () => {
    const before = furyRoadWorld();
    const after = spawnFirst(before);

    const [line] = new RunLog().note(before, after, after.events);

    expect(line).toMatchObject({ t: 'group', stretch: 1 });
    if (line.t !== 'group') throw new Error('no group line');
    expect(line.trucks).toHaveLength(1);
    expect(line.trucks[0].guns.length).toBeGreaterThan(0);
    expect(line.trucks[0].armor).toBe(0);
    expect(line.trucks[0].gear).toBeGreaterThan(0);
  });

  it('ranks the trucks that damaged the player this stretch when the run is lost', () => {
    const before = spawnFirst(furyRoadWorld());
    const foe = before.furyRoad!.groups[0].vehicles[0];
    const log = new RunLog();
    log.note(before, before, [shotAt(before, foe, 30), shotAt(before, foe, 12)]);
    const after = structuredClone(before);
    endRun(after, 'wrecked');

    const lines = log.note(before, after, after.events);

    expect(lines).toContainEqual(expect.objectContaining({ t: 'lost', stretch: 1, cause: 'wrecked', stretchDamageBy: [{ id: foe, template: expect.any(String), damage: 42 }] }));
    expect(lines.find((l) => l.t === 'lost')).toMatchObject({ kit: { chassis: playerVehicle(after).chassisId } });
  });
});
