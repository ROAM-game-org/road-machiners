import { expect, it } from 'vitest';
import { emptyWorld, addVehicle } from './testkit';
import { launchTimedRound, landTimedRound } from './timed-combat';
import { mountedParts } from './grid';
import { refreshVision } from './vision';
import { declareFeud } from './states';

it('spends ammo at launch without applying impact damage', () => {
  const w = emptyWorld();
  const a = addVehicle(w, 'player', 'buggy', ['mg', 'stockEngine'], { x: 30, y: 30 });
  const b = addVehicle(w, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], { x: 35, y: 30 }, Math.PI);
  w.player.vehicleId = a.id;
  declareFeud(w, b, a.id);
  refreshVision(w);
  const gun = mountedParts(a, 'weapon')[0];
  const before = mountedParts(b).map(p => p.hp);
  const ammo = gun.gun!.ammo;
  const flight = launchTimedRound(w, a, gun.id, b, 'body', 0, 220, false);
  expect(flight).not.toBeNull();
  expect(mountedParts(b).map(p => p.hp)).toEqual(before);
  expect(gun.gun!.ammo).toBe(ammo - 1);
  expect(w.events.some(e => e.t === 'shot')).toBe(false);
  flight!.shot.rolls[0] = { hit: true, error: 0, crit: false };
  flight!.impactAt = { ...b.pos };
  const event = landTimedRound(w, flight!);
  expect(mountedParts(b).reduce((sum, p) => sum + p.hp, 0)).toBeLessThan(before.reduce((sum, hp) => sum + hp, 0));
  gun.hp = 0;
  expect(launchTimedRound(w, a, gun.id, b, 'body', 200, 220, true)).toBeNull();
  expect(event?.t).toBe('shot');
  expect(w.events).toContain(event);
});

it('does not move a projectile endpoint when its target moves away', () => {
  const w = emptyWorld();
  const a = addVehicle(w, 'player', 'buggy', ['mg', 'stockEngine'], { x: 30, y: 30 });
  const b = addVehicle(w, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], { x: 35, y: 30 }, Math.PI);
  w.player.vehicleId = a.id; declareFeud(w, b, a.id); refreshVision(w);
  const flight = launchTimedRound(w, a, mountedParts(a, 'weapon')[0].id, b, 'body', 0, 220, false)!;
  expect(flight).not.toBeNull();
  flight.impactAt = { ...b.pos };
  const endpoint = { ...flight.impactAt };
  b.pos.y += 5;
  const before = mountedParts(b).map(p => p.hp);
  const event = landTimedRound(w, flight)!;
  expect(event.rounds[0].struck).toBeNull();
  expect(mountedParts(b).map(p => p.hp)).toEqual(before);
  expect(flight.impactAt).toEqual(endpoint);
});
