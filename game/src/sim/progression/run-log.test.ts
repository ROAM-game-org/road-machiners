import { describe, expect, it } from 'vitest';
import { FURY_ROAD } from '../../data/modes';
import { haulerOf, playerVehicle } from '../damage';
import { advanceFuryRoad, endRun } from '../fury-road';
import { furyRoadWorld } from '../testkit';
import type { GameEvent, World } from '../types';
import { cloneWorld } from '../world';
import { RunLog } from './run-log';

function spawnFirst(w: World): World {
  const next = cloneWorld(w);
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
    const after = cloneWorld(before);
    endRun(after, 'wrecked');

    const lines = log.note(before, after, after.events);

    expect(lines).toContainEqual(expect.objectContaining({ t: 'lost', stretch: 1, cause: 'wrecked', stretchDamageBy: [{ id: foe, template: expect.any(String), damage: 42 }] }));
    expect(lines.find((l) => l.t === 'lost')).toMatchObject({ kit: { chassis: playerVehicle(after).chassisId } });
  });
});

describe('the Fury Road run log per stretch', () => {
  it('writes the hauler damage, shots, encounters and enemy mix of a stretch when its outpost is reached, and the choice at the outpost', () => {
    const start = furyRoadWorld();
    const log = new RunLog();
    const spawned = spawnFirst(start);
    log.note(start, spawned, spawned.events);
    const hauler = haulerOf(spawned);
    const foe = spawned.furyRoad!.groups[0].vehicles[0];
    const trucks = spawned.vehicles;
    trucks.find((v) => v.id === foe)!.pos = { x: hauler.pos.x + 3, y: hauler.pos.y };
    const hit: GameEvent = { t: 'shot', shooter: foe, weapon: 'p0', target: hauler.id, aim: 'body', chance: 1, damageChance: 1, side: 'front', rounds: [{ hit: true, crit: false, offset: 0, struck: null, hits: [{ part: 'p1', damage: 14 }], blast: [], burst: null }] };
    const mine: GameEvent = { t: 'shot', shooter: spawned.player.vehicleId, weapon: 'p0', target: foe, aim: 'body', chance: 1, damageChance: 1, side: 'front', rounds: [] };
    log.note(spawned, spawned, [hit, mine]);
    const reached = cloneWorld(spawned);
    reached.events = [{ t: 'outpostReached', milestone: 1, pay: 30000, wrecks: 0 }];
    reached.furyRoad!.outposts[0].paid = true;

    const lines = log.note(spawned, reached, reached.events);
    const line = lines.find((l) => l.t === 'stretch');

    expect(line).toMatchObject({ t: 'stretch', stretch: 1, stats: { haulerDamage: 14, playerShots: 1, fights: 1 } });
    if (line?.t !== 'stretch') throw new Error('no stretch line');
    expect(line.stats.enemies).toHaveLength(1);
    expect(line.stats.firstHit).toBe(spawned.turn);
    expect(line.choice.useful).toBeGreaterThanOrEqual(line.choice.affordable);
  });

  it('writes the turns from the first hauler hit to its loss on the lost line', () => {
    const before = spawnFirst(furyRoadWorld());
    const hauler = haulerOf(before);
    const log = new RunLog();
    const hit: GameEvent = { t: 'shot', shooter: before.furyRoad!.groups[0].vehicles[0], weapon: 'p0', target: hauler.id, aim: 'body', chance: 1, damageChance: 1, side: 'front', rounds: [{ hit: true, crit: false, offset: 0, struck: null, hits: [{ part: 'p1', damage: 9 }], blast: [], burst: null }] };
    log.note(before, before, [hit]);
    const after = cloneWorld(before);
    after.turn += 6;
    endRun(after, 'haulerLost');

    const lost = log.note(before, after, after.events).find((l) => l.t === 'lost');

    expect(lost).toMatchObject({ t: 'lost', cause: 'haulerLost', stats: { haulerDamage: 9, turnsFromFirstHit: 6 } });
  });
});
