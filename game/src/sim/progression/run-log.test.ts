import { describe, expect, it } from 'vitest';
import { haulerOf, playerVehicle } from '../damage';
import { advanceChaosHighway, endRun } from '../chaos-highway';
import { chaosHighwayWorld } from '../testkit';
import type { GameEvent, World } from '../types';
import { cloneWorld } from '../world';
import { RunLog } from './run-log';

function spawnFirst(w: World): World {
  const next = cloneWorld(w);
  next.chaosHighway!.groups[0].at = 0;
  advanceChaosHighway(next);
  return next;
}

function shotAt(w: World, shooter: string, damage: number): GameEvent {
  return { t: 'shot', shooter, weapon: 'p0', target: w.player.vehicleId, aim: 'body', chance: 1, damageChance: 1, side: 'front', rounds: [{ hit: true, crit: false, offset: 0, struck: null, hits: [{ part: 'p1', damage }], blast: [], burst: null }] };
}

describe('the Chaos Highway run log', () => {
  it('names each spawned group truck with its template, chassis, guns, armor and gear value', () => {
    const before = chaosHighwayWorld();
    const after = spawnFirst(before);

    const [line] = new RunLog().note(before, after, after.events);

    expect(line).toMatchObject({ t: 'group', stretch: 1 });
    if (line.t !== 'group') throw new Error('no group line');
    expect(line.trucks).toHaveLength(after.chaosHighway!.groups[0].templates.length);
    expect(line.elite).toBe(after.chaosHighway!.groups[0].elite);
    expect(line.money).toBe(Math.round(after.chaosHighway!.groups[0].money));
    expect(line.trucks[0].guns.length).toBeGreaterThan(0);
    expect(line.trucks[0].armor).toBe(0);
    expect(line.trucks[0].gear).toBeGreaterThan(0);
  });

  it('writes a leave line with the budget and the plan when the road opens, so outpost 0 is logged', () => {
    const w = chaosHighwayWorld();
    const event: GameEvent = { t: 'roadOpened', stretch: 1 };

    const line = new RunLog().note(w, w, [event]).find((l) => l.t === 'leave');

    if (line?.t !== 'leave') throw new Error('no leave line');
    expect(line.stretch).toBe(1);
    expect(line.budget).toBeGreaterThan(0);
    expect(line.plan).toHaveLength(w.chaosHighway!.groups.length);
    expect(line.plan.reduce((n, p) => n + p.size, 0)).toBeLessThanOrEqual(line.budget);
    expect(line.plan.map((p) => p.template)).toEqual(w.chaosHighway!.groups.map((g) => g.templates[0]));
  });

  it('ranks the trucks that damaged the player this stretch when the run is lost', () => {
    const before = spawnFirst(chaosHighwayWorld());
    const foe = before.chaosHighway!.groups[0].vehicles[0];
    const log = new RunLog();
    log.note(before, before, [shotAt(before, foe, 30), shotAt(before, foe, 12)]);
    const after = cloneWorld(before);
    endRun(after, 'wrecked');

    const lines = log.note(before, after, after.events);

    expect(lines).toContainEqual(expect.objectContaining({ t: 'lost', stretch: 1, cause: 'wrecked', stretchDamageBy: [{ id: foe, template: expect.any(String), damage: 42 }] }));
    expect(lines.find((l) => l.t === 'lost')).toMatchObject({ kit: { chassis: playerVehicle(after).chassisId } });
  });
});

describe('the Chaos Highway run log per stretch', () => {
  it('writes the hauler damage, shots, encounters and enemy mix of a stretch when its outpost is reached, and the choice at the outpost', () => {
    const start = chaosHighwayWorld();
    const log = new RunLog();
    const spawned = spawnFirst(start);
    log.note(start, spawned, spawned.events);
    const hauler = haulerOf(spawned);
    const foe = spawned.chaosHighway!.groups[0].vehicles[0];
    const trucks = spawned.vehicles;
    trucks.find((v) => v.id === foe)!.pos = { x: hauler.pos.x + 3, y: hauler.pos.y };
    const hit: GameEvent = { t: 'shot', shooter: foe, weapon: 'p0', target: hauler.id, aim: 'body', chance: 1, damageChance: 1, side: 'front', rounds: [{ hit: true, crit: false, offset: 0, struck: null, hits: [{ part: 'p1', damage: 14 }], blast: [], burst: null }] };
    const mine: GameEvent = { t: 'shot', shooter: spawned.player.vehicleId, weapon: 'p0', target: foe, aim: 'body', chance: 1, damageChance: 1, side: 'front', rounds: [] };
    log.note(spawned, spawned, [hit, mine]);
    const reached = cloneWorld(spawned);
    reached.events = [{ t: 'outpostReached', milestone: 1, pay: 30000, wrecks: 0 }];
    reached.chaosHighway!.outposts[1].paid = true;
    reached.chaosHighway!.waitingAt = 1;

    const lines = log.note(spawned, reached, reached.events);
    const line = lines.find((l) => l.t === 'stretch');

    expect(line).toMatchObject({ t: 'stretch', stretch: 1, stats: { haulerDamage: 14, playerShots: 1, fights: 1 } });
    if (line?.t !== 'stretch') throw new Error('no stretch line');
    expect(line.stats.enemies).toHaveLength(spawned.chaosHighway!.groups[0].templates.length);
    expect(line.stats.firstHit).toBe(spawned.turn);
    expect(line.choice.useful).toBeGreaterThanOrEqual(line.choice.affordable);
  });

  it('writes the turns from the first hauler hit to its loss on the lost line', () => {
    const before = spawnFirst(chaosHighwayWorld());
    const hauler = haulerOf(before);
    const log = new RunLog();
    const hit: GameEvent = { t: 'shot', shooter: before.chaosHighway!.groups[0].vehicles[0], weapon: 'p0', target: hauler.id, aim: 'body', chance: 1, damageChance: 1, side: 'front', rounds: [{ hit: true, crit: false, offset: 0, struck: null, hits: [{ part: 'p1', damage: 9 }], blast: [], burst: null }] };
    log.note(before, before, [hit]);
    const after = cloneWorld(before);
    after.turn += 6;
    endRun(after, 'haulerLost');

    const lost = log.note(before, after, after.events).find((l) => l.t === 'lost');

    expect(lost).toMatchObject({ t: 'lost', cause: 'haulerLost', stats: { haulerDamage: 9, turnsFromFirstHit: 6 } });
  });
});
