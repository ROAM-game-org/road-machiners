import { partDef } from '../data/parts';
import { describe, expect, it } from 'vitest';
import { RULES } from '../data/rules';
import { applyContactCrash, computeClosingSpeed, crashFault, locateCrashContact } from './crash-contact';
import { addVehicle, emptyWorld, npcBrain, practiceOf } from './testkit';
import { PERK_NUMBERS } from '../data/skills';
import { isHostile } from './combat';
import { addState } from './states';
import { vehicleMass } from './mass';
import { mountedParts } from './grid';
import type { Vehicle } from './types';

function wheelLoss(v: Vehicle, x: number, y: number): number {
  const item = v.items.find((it) => it.kind === 'part' && it.part.defId === 'wheel' && it.x === x && it.y === y);
  if (item?.kind !== 'part') throw new Error(`No wheel at ${x},${y}`);
  return partDef('wheel').hp - item.part.hp;
}

describe('crash contacts', () => {
  it('ignores sliding speed and separating contacts', () => {
    expect(computeClosingSpeed({ x: 2, y: 20 }, { x: 1, y: 0 })).toBe(2);
    expect(computeClosingSpeed({ x: -2, y: 20 }, { x: 1, y: 0 })).toBe(0);
  });

  it('selects the touched front lane rather than the whole vehicle', () => {
    const contact = locateCrashContact('scout', 0, [{ x: 2, y: 0 }], { x: 1, y: 0 });
    expect(contact.side).toBe('front');
    expect(contact.lanes).toHaveLength(1);
  });

  it('uses the captured side even after the vehicle turns away', () => {
    const run = (heading: number) => {
      const world = emptyWorld();
      const vehicle = addVehicle(world, 'scrapjaw', 'scout', ['stockEngine', 'ram'], { x: 40, y: 40 });
      vehicle.heading = heading;
      applyContactCrash(world, vehicle, null, 'rock', 6, { a: { side: 'front', lanes: [2] }, b: null }, null);
      return mountedParts(vehicle).map((part) => ({ def: part.defId, hp: part.hp }));
    };
    expect(run(Math.PI)).toEqual(run(0));
  });

  it('does not damage wheels outside the touched lanes and the lanes beside them', () => {
    const world = emptyWorld();
    const vehicle = addVehicle(world, 'scrapjaw', 'scout', ['stockEngine', 'ram'], { x: 40, y: 40 });
    const wheels = mountedParts(vehicle).filter((part) => part.defId === 'wheel');
    const before = wheels.map((part) => part.hp);
    applyContactCrash(world, vehicle, null, 'rock', 6, { a: { side: 'front', lanes: [3] }, b: null }, null);
    expect(wheels.map((part) => part.hp)).toEqual(before);
    expect(mountedParts(vehicle).find((part) => part.defId === 'ram')?.hp).toBeLessThan(partDef('ram').hp);
  });

  it('a hard front crash hurts the rear wheel in the same lane far less than the front wheel', () => {
    const world = emptyWorld();
    const vehicle = addVehicle(world, 'scrapjaw', 'scout', ['stockEngine'], { x: 40, y: 40 });
    applyContactCrash(world, vehicle, null, 'rock', RULES.hardCrashSpeed * 1.5, { a: { side: 'front', lanes: [1] }, b: null }, null);
    expect(wheelLoss(vehicle, 1, 1)).toBeGreaterThan(0);
    expect(wheelLoss(vehicle, 1, 5)).toBeGreaterThan(0);
    expect(wheelLoss(vehicle, 1, 5)).toBeLessThan(wheelLoss(vehicle, 1, 1) * RULES.crashFalloff ** 3);
  });

  it('spills a smaller hit into the lanes beside the touched lane', () => {
    const run = (lane: number) => {
      const world = emptyWorld();
      const vehicle = addVehicle(world, 'scrapjaw', 'scout', ['stockEngine'], { x: 40, y: 40 });
      applyContactCrash(world, vehicle, null, 'rock', 3, { a: { side: 'front', lanes: [lane] }, b: null }, null);
      return wheelLoss(vehicle, 1, 1);
    };
    expect(run(2)).toBeGreaterThan(0);
    expect(run(2)).toBeCloseTo(run(1) * RULES.crashFalloff, 0);
    expect(run(3)).toBe(0);
  });

  it('keeps armor protection across simultaneous contact lanes', () => {
    const world = emptyWorld();
    const vehicle = addVehicle(world, 'scrapjaw', 'scout', ['stockEngine', 'ram'], { x: 40, y: 40 });
    const parts = mountedParts(vehicle);
    const ram = parts.find((part) => part.defId === 'ram');
    const engine = parts.find((part) => part.defId === 'stockEngine');
    if (!ram || !engine) throw new Error('Missing front armor or engine');
    ram.hp = 1;
    const hp = engine.hp;
    applyContactCrash(world, vehicle, null, 'rock', 5, { a: { side: 'front', lanes: [1, 2, 3] }, b: null }, null);
    expect(ram.hp).toBe(0);
    expect(engine.hp).toBe(hp);
  });

  it('rejects missing geometry', () => {
    expect(() => locateCrashContact('scout', 0, [], { x: 1, y: 0 })).toThrow('no contact points');
    expect(() => computeClosingSpeed({ x: 2, y: 0 }, { x: 0, y: 0 })).toThrow('no horizontal direction');
  });
});

describe('ram practice', () => {
  const geometry = { a: { side: 'front' as const, lanes: [1, 2] }, b: { side: 'left' as const, lanes: [1, 2] } };

  it('pays the player for damage dealt, harder against a heavier truck', () => {
    const world = emptyWorld();
    const me = world.vehicles[0];
    const other = addVehicle(world, 'scrapjaw', 'hauler', ['stockEngine'], { x: 32, y: 30 });
    applyContactCrash(world, me, other, other.id, 6, geometry, { a: 6, b: 0 });
    const collision = world.events.find((e) => e.t === 'collision');
    if (collision?.t !== 'collision') throw new Error('No collision');
    const dealt = collision.hitsB.reduce((sum, hit) => sum + hit.damage, 0);
    expect(dealt).toBeGreaterThan(0);
    const [event] = practiceOf(world, 'ram');
    expect(event.amount).toBe(dealt);
    expect(event.difficulty).toBeCloseTo(vehicleMass(other) / (vehicleMass(other) + vehicleMass(me)));
  });

  it('pays the player as the second body of a crash', () => {
    const world = emptyWorld();
    const me = world.vehicles[0];
    const other = addVehicle(world, 'scrapjaw', 'hauler', ['stockEngine'], { x: 32, y: 30 });
    applyContactCrash(world, other, me, me.id, 6, geometry, { a: 6, b: 0 });
    expect(practiceOf(world, 'ram')).toHaveLength(1);
  });

  it('pays nothing for a crash into a rock', () => {
    const world = emptyWorld();
    applyContactCrash(world, world.vehicles[0], null, 'rock', 6, { a: { side: 'front', lanes: [2] }, b: null }, null);
    expect(practiceOf(world, 'ram')).toEqual([]);
  });

  it('pays nothing for a crash between two NPCs', () => {
    const world = emptyWorld();
    const a = addVehicle(world, 'scrapjaw', 'scout', ['stockEngine', 'ram'], { x: 40, y: 40 });
    const b = addVehicle(world, 'independent', 'hauler', ['stockEngine'], { x: 42, y: 40 });
    applyContactCrash(world, a, b, b.id, 6, geometry, { a: 6, b: 0 });
    expect(practiceOf(world, 'ram')).toEqual([]);
  });
});


describe('crash damage multiplier', () => {
  function rockCrash(mult: number, impact: number): number {
    const saved = RULES.crashDamage;
    (RULES as { crashDamage: number }).crashDamage = mult;
    try {
      const world = emptyWorld();
      const vehicle = world.vehicles[0];
      const before = mountedParts(vehicle).reduce((sum, part) => sum + part.hp, 0);
      applyContactCrash(world, vehicle, null, 'rock', impact, { a: { side: 'front', lanes: [1, 2, 3] }, b: null }, null);
      return before - mountedParts(vehicle).reduce((sum, part) => sum + part.hp, 0);
    } finally {
      (RULES as { crashDamage: number }).crashDamage = saved;
    }
  }

  it('acts on crash energy like a slower impact', () => {
    const impact = RULES.hardCrashSpeed;
    expect(rockCrash(0.5, impact)).toBe(rockCrash(1, impact / Math.SQRT2));
    expect(rockCrash(0.5, impact)).toBeLessThan(rockCrash(1, impact));
  });

  it('a crash into an obstacle past the hard crash speed hits much harder than its energy alone', () => {
    const slow = rockCrash(1, RULES.hardCrashSpeed);
    expect(rockCrash(1, RULES.hardCrashSpeed * 2)).toBeGreaterThan(slow * 4 * 1.5);
  });
});

describe('the rammer perk', () => {
  const geometry = { a: { side: 'front' as const, lanes: [1, 2] }, b: { side: 'left' as const, lanes: [1, 2] } };

  function rammerWorld() {
    const world = emptyWorld();
    const me = world.vehicles[0];
    const foe = addVehicle(world, 'scrapjaw', 'hauler', ['stockEngine'], { x: 32, y: 30 });
    foe.brain = npcBrain('buggy', foe.pos, ['raider']);
    addState(world, 'feud', foe.id, me.id, { kind: 'feud', robbery: false });
    expect(isHostile(world, me, foe)).toBe(true);
    return { world, me, foe };
  }

  it('stalls a hostile truck the player damages through the next turn', () => {
    const { world, me, foe } = rammerWorld();
    world.player.perks.push('rammer');
    applyContactCrash(world, me, foe, foe.id, 6, geometry, { a: 6, b: 0 });
    expect(foe.stalledUntil).toBe(world.turn + PERK_NUMBERS.rammer.stallTurns);
  });

  it('stalls the hostile truck when the player is the second body of the crash', () => {
    const { world, me, foe } = rammerWorld();
    world.player.perks.push('rammer');
    applyContactCrash(world, foe, me, me.id, 6, geometry, { a: 6, b: 0 });
    expect(foe.stalledUntil).toBe(world.turn + PERK_NUMBERS.rammer.stallTurns);
    expect(me.stalledUntil).toBeUndefined();
  });

  it('stalls nothing without the perk', () => {
    const { world, me, foe } = rammerWorld();
    applyContactCrash(world, me, foe, foe.id, 6, geometry, { a: 6, b: 0 });
    expect(foe.stalledUntil).toBeUndefined();
  });

  it('stalls nothing when the rammed truck is not hostile', () => {
    const world = emptyWorld();
    world.player.perks.push('rammer');
    const me = world.vehicles[0];
    const trader = addVehicle(world, 'independent', 'hauler', ['stockEngine'], { x: 32, y: 30 });
    trader.brain = npcBrain('trader', trader.pos, ['trader']);
    applyContactCrash(world, me, trader, trader.id, 6, geometry, { a: 6, b: 0 });
    expect(trader.stalledUntil).toBeUndefined();
  });

  it('stalls nothing in a crash between two NPCs', () => {
    const { world, foe } = rammerWorld();
    world.player.perks.push('rammer');
    const other = addVehicle(world, 'independent', 'scout', ['stockEngine', 'ram'], { x: 34, y: 30 });
    applyContactCrash(world, other, foe, foe.id, 6, geometry, { a: 6, b: 0 });
    expect(foe.stalledUntil).toBeUndefined();
  });
});

describe('crash with a tow client', () => {
  const geometry = { a: { side: 'front' as const, lanes: [1, 2] }, b: { side: 'left' as const, lanes: [1, 2] } };
  const damages = (world: ReturnType<typeof emptyWorld>) => {
    const collision = world.events.find((e) => e.t === 'collision');
    if (collision?.t !== 'collision') throw new Error('No collision');
    const sum = (hits: { damage: number }[]) => hits.reduce((total, hit) => total + hit.damage, 0);
    return { onA: sum(collision.hitsA), onB: sum(collision.hitsB) };
  };

  function pair() {
    const world = emptyWorld();
    const client = world.vehicles[0];
    const tower = addVehicle(world, 'independent', 'hauler', ['stockEngine'], { x: 32, y: 30 });
    return { world, client, tower };
  }

  it('hurts neither truck once the tower answers', () => {
    const { world, client, tower } = pair();
    addState(world, 'answering', tower.id, client.id, { kind: 'none' });
    applyContactCrash(world, client, tower, tower.id, 6, geometry, { a: 6, b: 0 });
    expect(damages(world)).toEqual({ onA: 0, onB: 0 });
  });

  it('hurts neither truck when the tower is the first body', () => {
    const { world, client, tower } = pair();
    addState(world, 'tow', tower.id, client.id, { kind: 'tow', site: 'bowl', fee: 10, waived: 0, hitched: false });
    applyContactCrash(world, tower, client, client.id, 6, geometry, { a: 6, b: 0 });
    expect(damages(world)).toEqual({ onA: 0, onB: 0 });
  });

  it('still hurts both trucks with no tow between them', () => {
    const { world, client, tower } = pair();
    applyContactCrash(world, client, tower, tower.id, 6, geometry, { a: 6, b: 0 });
    expect(damages(world).onA).toBeGreaterThan(0);
    expect(damages(world).onB).toBeGreaterThan(0);
  });
});

describe('the hauler semi ramming a buggy', () => {
  it('wrecks the buggy side and barely scratches its own nose', () => {
    const world = emptyWorld();
    const semi = addVehicle(world, 'player', 'semi', ['workhorseDiesel'], { x: 30, y: 30 });
    const buggy = addVehicle(world, 'scrapjaw', 'buggy', ['stockEngine'], { x: 34, y: 30 });
    applyContactCrash(world, semi, buggy, buggy.id, 6, { a: { side: 'front', lanes: [3, 4] }, b: { side: 'left', lanes: [1, 2] } }, { a: 6, b: 0 });
    const collision = world.events.find((e) => e.t === 'collision');
    if (collision?.t !== 'collision') throw new Error('No collision');
    const sum = (hits: { damage: number }[]) => hits.reduce((total, hit) => total + hit.damage, 0);
    expect(sum(collision.hitsB)).toBeGreaterThan(15 * sum(collision.hitsA));
  });
});

describe('crash fault', () => {
  it('blames the mover and not the parked truck', () => {
    expect(crashFault({ a: 6, b: 0 })).toEqual({ a: true, b: false });
    expect(crashFault({ a: 0, b: 6 })).toEqual({ a: false, b: true });
  });

  it('blames neither when both crawl', () => {
    expect(crashFault({ a: 0.9, b: 0.5 })).toEqual({ a: false, b: false });
  });

  it('blames both in a head-on that is close to even', () => {
    expect(crashFault({ a: 3, b: 3 })).toEqual({ a: true, b: true });
    expect(crashFault({ a: 2.7, b: 3.3 })).toEqual({ a: true, b: true });
  });

  it('blames only the faster truck when it carried over 60 percent', () => {
    expect(crashFault({ a: 7, b: 3 })).toEqual({ a: true, b: false });
  });

  it('counts a truck moving away as still', () => {
    expect(crashFault({ a: 5, b: -4 })).toEqual({ a: true, b: false });
  });

  it('throws on a drive-in that is not a number', () => {
    expect(() => crashFault({ a: Number.NaN, b: 1 })).toThrow('Bad crash approach');
  });
});

describe('crash approach', () => {
  const front = { side: 'front' as const, lanes: [2] };

  it('throws when a body crash comes without drive-ins', () => {
    const world = emptyWorld();
    const a = addVehicle(world, 'independent', 'scout', ['stockEngine'], { x: 40, y: 40 });
    const b = addVehicle(world, 'independent', 'scout', ['stockEngine'], { x: 42, y: 40 });
    expect(() => applyContactCrash(world, a, b, b.id, 6, { a: front, b: front }, null)).toThrow('approach');
  });

  it('throws when an obstacle crash comes with drive-ins', () => {
    const world = emptyWorld();
    const a = addVehicle(world, 'independent', 'scout', ['stockEngine'], { x: 40, y: 40 });
    expect(() => applyContactCrash(world, a, null, 'rock', 6, { a: front, b: null }, { a: 6, b: 0 })).toThrow('approach');
  });
});
