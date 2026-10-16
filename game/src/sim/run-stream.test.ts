import { describe, expect, it } from 'vitest';
import { atlasOf } from './atlas';
import { playerVehicle } from './damage';
import { driveOn } from './fury-road';
import { highwayMap, windowShift } from './highway';
import { playerFields, replay, replayBySession, RunStream, scopeOf, statesByHolder, truckFields, worldPos, type StreamLine } from './run-stream';
import { addVehicle, emptyWorld, parkedAtOutpost, startCombat } from './testkit';
import { clockOf } from './sun';
import type { GameEvent, Vehicle, World } from './types';
import { refreshVision } from './vision';
import { cloneWorld, endTurn, setMoveOrder } from './world';
import { FAR_MOVER } from './progression/record';

const CTX = { runId: 'test', version: 'test', sessionId: 's1' };

function ofKind(lines: StreamLine[], kind: string): StreamLine[] {
  return lines.filter((l) => l.kind === kind);
}

function seeing(): { world: World; near: Vehicle; far: Vehicle } {
  const world = emptyWorld();
  world.turn = 3;
  const near = addVehicle(world, 'scrapjaw', 'buggy', ['mg'], { x: 38, y: 30 });
  const far = addVehicle(world, 'scrapjaw', 'buggy', ['mg'], { x: 110, y: 110 });
  refreshVision(world);
  return { world, near, far };
}

function next(world: World, change: (w: World) => void = () => {}): World {
  const out = cloneWorld(world);
  out.turn += 1;
  out.events = [];
  change(out);
  return out;
}

function shot(shooter: string, target: string, weapon: string, damage: number): GameEvent {
  const hits = [{ part: 'p1', damage }];
  return { t: 'shot', shooter, weapon, target, aim: 'body', chance: 1, damageChance: 1, side: 'front', rounds: [{ hit: true, crit: false, offset: 0, struck: 'p1', hits, blast: [], burst: null }] };
}

function loggedFields(world: World, v: Vehicle) {
  return truckFields(world, v, statesByHolder(world.states).get(v.id) ?? []);
}

function expectRebuilt(lines: StreamLine[], world: World): void {
  const rebuilt = replay(lines);
  const scope = scopeOf(world, world.events).map((v) => v.id);
  expect([...rebuilt.trucks.keys()].sort()).toEqual([...scope].sort());
  for (const [id, fields] of rebuilt.trucks) expect(fields).toEqual(loggedFields(world, world.vehicles.find((x) => x.id === id)!));
  expect(rebuilt.player).toEqual(playerFields(world));
}

describe('world positions', () => {
  it('keeps one truck at one world position across a window move', () => {
    const before = parkedAtOutpost();
    const after = driveOn(before);
    expect(playerVehicle(after).pos.y).toBe(playerVehicle(before).pos.y + windowShift(before.seed, 0).y);
    expect(worldPos(after, playerVehicle(after).pos)).toEqual(worldPos(before, playerVehicle(before).pos));
  });

  it('gives each map its own origin', () => {
    expect(atlasOf(emptyWorld().terrain).origin).toEqual({ x: 0, y: 0 });
    expect(atlasOf(highwayMap(3, 2).terrain).origin).toEqual({ x: 0, y: -(windowShift(3, 0).y + windowShift(3, 1).y) });
  });

  it('writes event positions in the world frame', () => {
    const moved = driveOn(parkedAtOutpost());
    const pulse: GameEvent = { t: 'pulse', vehicle: playerVehicle(moved).id, pos: { x: 10, y: 400 }, hit: [] };
    const stream = new RunStream(CTX);
    stream.begin(moved, 'new');
    const line = ofKind(stream.step(next(moved), [pulse]), 'event')[0];
    const [x, y] = worldPos(moved, { x: 10, y: 400 });
    expect(line.pos).toEqual({ x, y });
  });
});

describe('scope and keyframe', () => {
  it('starts with a session, the player and an enter for each owned or seen truck', () => {
    const { world, near, far } = seeing();
    const lines = new RunStream(CTX).begin(world, 'new');
    expect(lines.map((l) => l.kind).slice(0, 2)).toEqual(['session', 'player']);
    expect(lines[0]).toMatchObject({ runId: 'test', mode: 'roaming', seed: world.seed, mapHash: world.mapHash, from: 'new' });
    const ids = ofKind(lines, 'enter').map((l) => l.id);
    expect(ids).toContain(near.id);
    expect(ids).toContain(playerVehicle(world).id);
    expect(ids).not.toContain(far.id);
  });

  it('enters a truck that comes into view and leaves it when it goes out of sight', () => {
    const { world, near } = seeing();
    const stream = new RunStream(CTX);
    stream.begin(world, 'new');
    const gone = next(world, (w) => {
      w.vehicles.find((v) => v.id === near.id)!.pos = { x: 110, y: 110 };
      w.player.visible = [];
    });
    expect(ofKind(stream.step(gone, []), 'leave')).toEqual([{ kind: 'leave', turn: gone.turn, id: near.id, why: 'unseen', sid: 's1' }]);
    const back = next(gone, (w) => refreshVision(w));
    expect(ofKind(stream.step(back, []), 'enter').map((l) => l.id)).toEqual([]);
  });

  it('reports a wrecked truck with its reason', () => {
    const { world, near } = seeing();
    const stream = new RunStream(CTX);
    stream.begin(world, 'new');
    const after = next(world, (w) => {
      w.vehicles = w.vehicles.filter((v) => v.id !== near.id);
    });
    const lines = stream.step(after, [{ t: 'destroyed', vehicle: near.id, by: world.player.vehicleId }]);
    expect(ofKind(lines, 'leave')[0]).toMatchObject({ id: near.id, why: 'wrecked' });
    expect(ofKind(lines, 'event')[0]).toMatchObject({ t: 'destroyed', vehicle: near.id });
  });

  it('gives a killer that is gone its own reason, not the victim one', () => {
    const { world, near } = seeing();
    const stream = new RunStream(CTX);
    stream.begin(world, 'new');
    const killer = addVehicle(world, 'scrapjaw', 'buggy', ['mg'], { x: 36, y: 30 });
    refreshVision(world);
    const both = next(world);
    stream.step(both, []);
    const after = next(both, (w) => {
      w.vehicles = w.vehicles.filter((v) => v.id !== near.id && v.id !== killer.id);
    });
    const lines = stream.step(after, [{ t: 'destroyed', vehicle: near.id, by: killer.id }]);
    const reasons = Object.fromEntries(ofKind(lines, 'leave').map((l) => [l.id, l.why]));
    expect(reasons[near.id]).toBe('wrecked');
    expect(reasons[killer.id]).toBe('gone');
  });

  it('writes a new keyframe at each day start', () => {
    const { world } = seeing();
    const stream = new RunStream(CTX);
    stream.begin(world, 'new');
    let turn = world.turn + 1;
    while (clockOf(turn).day === clockOf(world.turn).day) turn++;
    const dayStart = next(world, (w) => { w.turn = turn; });
    expect(ofKind(stream.step(dayStart, []), 'session')[0]).toMatchObject({ from: 'day' });
  });
});

describe('moves and changes', () => {
  it('writes moves only for trucks that moved, to 0.1 tile and whole degrees', () => {
    const { world, near } = seeing();
    const stream = new RunStream(CTX);
    stream.begin(world, 'new');
    const still = stream.step(next(world), []);
    expect(still).toEqual([]);
    const moved = next(world, (w) => {
      const v = w.vehicles.find((x) => x.id === near.id)!;
      v.pos = { x: 38.26, y: 30.04 };
      v.heading = 1.5;
    });
    const rows = ofKind(stream.step(moved, []), 'moves')[0].m as unknown[][];
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual([near.id, 38.3, 30, 86, 0]);
  });

  it('writes part health, goods and orders as changes with only the changed fields', () => {
    const { world, near } = seeing();
    const stream = new RunStream(CTX);
    stream.begin(world, 'new');
    const part = near.items.find((it) => it.kind === 'part')!;
    const hurt = next(world, (w) => {
      const v = w.vehicles.find((x) => x.id === near.id)!;
      const p = v.items.find((it) => it.id === part.id)!;
      if (p.kind === 'part') p.part.hp = Math.floor(p.part.hp / 2);
      v.order = { kind: 'brake' };
    });
    const change = ofKind(stream.step(hurt, []), 'change')[0];
    expect(Object.keys(change).sort()).toEqual(['id', 'kind', 'order', 'parts', 'sid', 'turn']);
    expect(Object.keys(change.parts as object)).toEqual([part.kind === 'part' ? part.part.id : '']);
  });
});

describe('events', () => {
  it('merges the shots of one shooter at one target into one line', () => {
    const { world, near } = seeing();
    const me = world.player.vehicleId;
    const stream = new RunStream(CTX);
    stream.begin(world, 'new');
    const lines = stream.step(next(world), [shot(near.id, me, 'mg', 3), shot(near.id, me, 'mg', 4), shot(me, near.id, 'mg', 5)]);
    const shots = ofKind(lines, 'event').filter((l) => l.t === 'shot');
    expect(shots).toHaveLength(2);
    expect(shots.find((l) => l.shooter === near.id)).toMatchObject({ rounds: 2, hits: 2, dmg: { p1: 7 }, weapons: ['mg'] });
  });

  it('brings an unseen shooter into scope for the turn it fires at a player truck', () => {
    const { world, far } = seeing();
    const stream = new RunStream(CTX);
    stream.begin(world, 'new');
    const fired = next(world);
    const lines = stream.step(fired, [shot(far.id, world.player.vehicleId, 'mg', 3)]);
    expect(ofKind(lines, 'enter').map((l) => l.id)).toEqual([far.id]);
    expect(ofKind(lines, 'event')).toHaveLength(1);
    const after = stream.step(next(fired), []);
    expect(ofKind(after, 'leave')).toMatchObject([{ id: far.id, why: 'unseen' }]);
  });

  it('merges a ram into one collision line and drops clutter and fights between others', () => {
    const { world, near, far } = seeing();
    const stream = new RunStream(CTX);
    stream.begin(world, 'new');
    const me = world.player.vehicleId;
    const events: GameEvent[] = [
      { t: 'collision', a: me, b: near.id, hitsA: [{ part: 'a', damage: 2 }], hitsB: [{ part: 'b', damage: 5 }] },
      { t: 'collision', a: near.id, b: me, hitsA: [{ part: 'b', damage: 1 }], hitsB: [{ part: 'a', damage: 1 }] },
      { t: 'practice', source: 'hit', amount: 1, difficulty: null, target: near.id, xp: 1 },
      { t: 'honk', vehicle: near.id },
      shot(far.id, 'ghost', 'mg', 1),
    ];
    const lines = ofKind(stream.step(next(world), events), 'event');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ t: 'collision', a: me, dmgA: { a: 3 }, dmgB: { b: 6 } });
  });

  it('keeps the line kind when an event has a kind field of its own', () => {
    const { world, near } = seeing();
    const stream = new RunStream(CTX);
    stream.begin(world, 'new');
    const lines = stream.step(next(world), [{ t: 'shopMoney', vehicle: near.id, amount: 5, kind: 'sale' as never }]);
    expect(lines.map((l) => l.kind)).toEqual(['event']);
    expect(lines[0]).toMatchObject({ t: 'shopMoney', shop: 'sale' });
  });

  it('lists a part a shot disabled inside the shot line', () => {
    const { world, near } = seeing();
    const me = world.player.vehicleId;
    const stream = new RunStream(CTX);
    stream.begin(world, 'new');
    const lines = ofKind(stream.step(next(world), [shot(me, near.id, 'mg', 9), { t: 'partDisabled', vehicle: near.id, part: 'p1' }]), 'event');
    expect(lines).toHaveLength(1);
    expect(lines[0].disabled).toEqual(['p1']);
  });
});

describe('player', () => {
  it('writes only the player fields that changed', () => {
    const { world } = seeing();
    const stream = new RunStream(CTX);
    stream.begin(world, 'new');
    const paid = next(world, (w) => { w.player.money += 40; w.player.autoFire = !w.player.autoFire; });
    const line = ofKind(stream.step(paid, []), 'player')[0];
    expect(Object.keys(line).sort()).toEqual(['autoFire', 'kind', 'money', 'sid', 'turn']);
  });
});

describe('replaying the stream', () => {
  it('rebuilds the logged fields of every truck in scope in a Roaming fight', () => {
    const { world } = seeing();
    const foe = world.vehicles.find((v) => v.faction === 'scrapjaw')!;
    startCombat(world, foe, playerVehicle(world));
    const stream = new RunStream(CTX);
    const lines = stream.begin(world, 'new');
    let at = setMoveOrder(world, { kind: 'through', dest: { x: 90, y: 40 } });
    for (let i = 0; i < 12; i++) {
      at = endTurn(at, FAR_MOVER.step(at));
      lines.push(...stream.step(at, at.events));
    }
    expect(ofKind(lines, 'moves').length).toBeGreaterThan(0);
    expectRebuilt(lines, at);
  });

  it('rebuilds across a highway window move and a session partway', () => {
    const start = parkedAtOutpost();
    const stream = new RunStream(CTX);
    const lines = stream.begin(start, 'new');
    let at = endTurn(start, () => {});
    lines.push(...stream.step(at, at.events));
    const opened = driveOn(at);
    lines.push(...stream.step(opened, opened.events));
    lines.push(...new RunStream(CTX).begin(opened, 'slot1'));
    at = endTurn(opened, () => {});
    const resumed = new RunStream(CTX);
    resumed.begin(opened, 'slot1');
    lines.push(...resumed.step(at, at.events));
    expectRebuilt(lines, at);
  });

  it('keeps one world position for a truck across the window move', () => {
    const start = parkedAtOutpost();
    const stream = new RunStream(CTX);
    const lines = stream.begin(start, 'new');
    const opened = driveOn(start);
    lines.push(...stream.step(opened, opened.events));
    const me = playerVehicle(start).id;
    const entered = ofKind(lines, 'enter').find((l) => l.id === me)!;
    expect(replay(lines).trucks.get(me)!.pos).toEqual(entered.pos);
  });
});

describe('writing the stream', () => {
  it('changes no world and draws no random number', () => {
    const start = parkedAtOutpost();
    const at = endTurn(start, () => {});
    const copy = cloneWorld(at);
    const stream = new RunStream(CTX);
    stream.begin(start, 'new');
    stream.step(at, at.events);
    expect(at).toEqual(copy);
    expect(at.rngState).toBe(copy.rngState);
  });

  it('throws when stepping before a session', () => {
    expect(() => new RunStream(CTX).step(emptyWorld(), [])).toThrow(/begin/);
  });

  it('writes lines in both modes', () => {
    for (const world of [seeing().world, parkedAtOutpost()]) {
      expect(new RunStream(CTX).begin(world, 'new').map((l) => l.kind)).toEqual(expect.arrayContaining(['session', 'player', 'enter']));
    }
  });

  it('rebuilds a truck that leaves and re-enters view, across a day-start keyframe', () => {
    const { world, near } = seeing();
    const stream = new RunStream(CTX);
    const lines = stream.begin(world, 'new');
    const hidden = next(world, (w) => {
      w.vehicles.find((v) => v.id === near.id)!.pos = { x: 110, y: 110 };
      w.player.visible = [];
    });
    lines.push(...stream.step(hidden, []));
    let turn = hidden.turn + 1;
    while (clockOf(turn).day === clockOf(hidden.turn).day) turn++;
    const dayStart = next(hidden, (w) => {
      w.turn = turn;
      w.vehicles.find((v) => v.id === near.id)!.pos = { x: 39, y: 31 };
      refreshVision(w);
    });
    lines.push(...stream.step(dayStart, []));
    const later = next(dayStart, (w) => { w.vehicles.find((v) => v.id === near.id)!.pos = { x: 40, y: 31 }; });
    lines.push(...stream.step(later, []));
    expect(ofKind(lines, 'leave').map((l) => l.id)).toContain(near.id);
    expect(ofKind(lines, 'session').map((l) => l.from)).toEqual(['new', 'day']);
    expectRebuilt(lines, later);
  });

  it('stamps the session id on every line and rebuilds two interleaved tabs apart', () => {
    const { world } = seeing();
    const a = new RunStream({ ...CTX, sessionId: 'a' });
    const b = new RunStream({ ...CTX, sessionId: 'b' });
    const lines = [...a.begin(world, 'new'), ...b.begin(world, 'auto')];
    const moved = next(world, (w) => { playerVehicle(w).pos.x += 3; });
    lines.push(...a.step(moved, []));
    const money = next(world, (w) => { w.player.money += 9; });
    lines.push(...b.step(money, []));
    expect(lines.every((l) => l.sid === 'a' || l.sid === 'b')).toBe(true);
    const readers = replayBySession(lines);
    expect(readers.get('a')!.player).toEqual(playerFields(moved));
    expect(readers.get('b')!.player).toEqual(playerFields(money));
    expect(readers.get('a')!.trucks.get(playerVehicle(moved).id)!.pos).toEqual(worldPos(moved, playerVehicle(moved).pos));
    expect(readers.get('b')!.trucks.get(playerVehicle(money).id)!.pos).toEqual(worldPos(money, playerVehicle(money).pos));
  });
});
