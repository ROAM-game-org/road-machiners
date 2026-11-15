import { beforeAll, describe, expect, it } from 'vitest';
import { PHYSICS } from '../data/physics';
import { mountedItems } from '../sim/grid';
import { refreshVision } from '../sim/vision';
import { vehicleStats } from '../sim/stats';
import { beginTimedCombat, endTimedCombat, launchTimedRound } from '../sim/timed-combat';
import { addVehicle, emptyWorld } from '../sim/testkit';
import type { World } from '../sim/types';
import { buildDrive, freeDrive, initPhysics, simulateTurn } from './drive';
import { upOf } from './frames';

beforeAll(async () => {
  await initPhysics();
});

const S = PHYSICS.metersPerTile;
const IMPACT_MS = 500;

type Setup = { weapon: string; playerShoots?: boolean; playerTargeted?: boolean; fire?: boolean; damage?: number; chassis?: string };

function duel(o: Setup) {
  const w: World = emptyWorld();
  const shooter = addVehicle(w, o.playerShoots ? 'player' : 'independent', 'hauler', ['stockEngine', o.weapon], { x: 38, y: 24 });
  const victim = addVehicle(w, o.playerTargeted ? 'player' : 'independent', o.chassis ?? 'jeep', ['stockEngine'], { x: 36, y: 30 });
  victim.speed = 3;
  victim.order = { kind: 'through', dest: { x: 200, y: 30 }, pace: 3 };
  const idle = w.vehicles[0];
  idle.pos = { x: 30, y: 60 };
  const playerCar = o.playerShoots ? shooter : o.playerTargeted ? victim : null;
  w.vehicles = playerCar ? [shooter, victim] : [idle, shooter, victim];
  if (playerCar) w.player.vehicleId = playerCar.id;
  return { w, shooter, victim };
}

function run(o: Setup): { x: number[]; up: number; impactAt: number | undefined } {
  const { w, shooter, victim } = duel(o);
  const stats = vehicleStats(w, shooter).weapons.find((m) => m.def.id === o.weapon);
  if (!stats) throw new Error('weapon not mounted');
  shooter.heading = Math.PI / 2 - stats.facing * Math.PI / 180;
  refreshVision(w);
  if (o.fire !== false) {
    const flight = launchTimedRound(w, shooter, stats.part.id, victim, 'body', 0, 80, false)!;
    w.combat.flights.push({ ...flight, roll: { hit: true, error: 0, crit: false }, impactAt: { x: victim.pos.x + 3 * IMPACT_MS / 1000 / PHYSICS.turnSeconds * 0.9, y: victim.pos.y }, round: { ...flight.round, ...(o.damage ? { damage: o.damage } : {}) }, landsAt: IMPACT_MS });
  }
  beginTimedCombat(w, w.combat, 1000);
  const drive = buildDrive(w);
  try {
    const result = simulateTurn(drive, w);
    endTimedCombat(w, w.combat);
    const frames = result.frames[victim.id];
    return { x: frames.map((f) => f.pos.z), up: upOf(frames.at(-1)!.rot), impactAt: w.combat.records.find(r => r.kind === 'impact')?.at };
  } finally {
    freeDrive(drive);
  }
}

describe('hit pushes in physics', () => {
  it('moves the target in the step the round lands and not before', () => {
    const shot = run({ weapon: 'cannon' });
    const none = run({ weapon: 'cannon', fire: false });
    const first = shot.x.findIndex((x, i) => Math.abs(x - none.x[i]) > 1e-3);
    const impactStep = Math.ceil(shot.impactAt! / (1000 / PHYSICS.stepsPerSecond));
    expect(first).toBe(impactStep - 1);
  });

  it('shoves a shell harder than a bullet of equal damage', () => {
    const none = run({ weapon: 'cannon', fire: false });
    const shell = run({ weapon: 'cannon' });
    const bullet = run({ weapon: 'mg', damage: 95 });
    expect(shell.x.at(-1)!).toBeGreaterThan(none.x.at(-1)!);
    const shellMove = shell.x.at(-1)! - none.x.at(-1)!;
    const bulletMove = bullet.x.at(-1)! - none.x.at(-1)!;
    expect(bulletMove).toBeGreaterThan(0);
    expect(bulletMove).toBeLessThan(shellMove);
    expect(shellMove).toBeGreaterThan(bulletMove * 2);
  });

  it('moves a target the same way when the shooter is the player or an NPC', () => {
    const npc = run({ weapon: 'cannon' });
    const targeted = run({ weapon: 'cannon', playerTargeted: true });
    const player = run({ weapon: 'cannon', playerShoots: true });
    expect(player.x.at(-1)! - player.x[0]).toBeCloseTo(npc.x.at(-1)! - npc.x[0], 0);
    expect(targeted.x.at(-1)! - targeted.x[0]).toBeCloseTo(npc.x.at(-1)! - npc.x[0], 0);
  });

  it('leaves the lightest chassis upright after a tank-gun hit', () => {
    const hit = run({ weapon: 'tankGun', chassis: 'buggy' });
    expect(hit.up).toBeGreaterThan(0.5);
  });

  it('keeps the push to metres, not tiles', () => {
    const none = run({ weapon: 'cannon', fire: false });
    const shell = run({ weapon: 'cannon' });
    expect((shell.x.at(-1)! - none.x.at(-1)!) / S).toBeLessThan(6);
  });
});
