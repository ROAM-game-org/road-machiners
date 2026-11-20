import { describe, expect, it } from 'vitest';
import { NPCS } from '../data/npcs';
import { BOUNTY } from '../data/market';
import { REGION } from '../data/region';
import { playerVehicle } from './damage';
import { advanceCrimes } from './crime';
import { canEnter, enterSite, isSheltered, leaveSite, sitePads } from './sites';
import { addState, advanceStates, endState, stateOf } from './states';
import { addVehicle, emptyWorld, npcBrain } from './testkit';
import type { CrimeCase, Vehicle, World } from './types';
import type { Vec } from './vec';

const BOWL = REGION.towns.find((t) => t.id === 'bowl')!;
const PAD = sitePads(BOWL)[0];

function bowlWorld(): { w: World; car: Vehicle; me: Vehicle } {
  const w = emptyWorld({ x: BOWL.pos.x - BOWL.radius - 30, y: BOWL.pos.y });
  for (const id of Object.keys(NPCS)) w.spawnTimer[id] = Number.MAX_SAFE_INTEGER;
  const car = addVehicle(w, 'scrapjaw', 'scout', ['stockEngine'], { ...PAD } as Vec, 0);
  car.brain = npcBrain('raider', car.pos, ['raider']);
  car.speed = 0;
  return { w, car, me: playerVehicle(w) };
}

function openCase(w: World, car: Vehicle, filed: number): CrimeCase {
  const c = { id: 'case-x', crime: `1:${car.id}:${w.player.vehicleId}:robbed`, offense: 'robbed', target: car.id, victim: w.player.vehicleId, issuer: { kind: 'faction', faction: 'bowl' }, reporters: [], site: 'bowl', at: { ...car.pos }, turn: 1, filed, owed: 10, restitution: 0, escrow: 7, status: 'open', closed: null, hunter: null, retryAt: null, offered: null, known: true, posse: 'lone', lead: { at: { ...car.pos }, turn: 1, heading: null } } as CrimeCase;
  w.crimes.push(c);
  return c;
}

describe('what a state does when a truck goes inside a site', () => {
  it('keeps a memory state, which goes inside with the truck and keeps counting down', () => {
    const { w, car, me } = bowlWorld();
    const revenge = addState(w, 'revenge', car.id, me.id, { kind: 'none' });
    expect(canEnter(w, car, BOWL)).toBe(true);
    const left = revenge.turnsLeft!;

    enterSite(w, car, BOWL);
    w.turn++;
    advanceStates(w);

    expect(stateOf(w, 'revenge', car.id, me.id)).toBe(revenge);
    expect(revenge.turnsLeft).toBe(left - 1);
    expect(leaveSite(w, car.id)).toBe(true);
    expect(stateOf(w, 'revenge', car.id, me.id)).toBe(revenge);
  });

  it('keeps a truce and a grievance on a truck that goes inside', () => {
    const { w, car, me } = bowlWorld();
    addState(w, 'truce', car.id, me.id, { kind: 'none' });
    addState(w, 'grievance', car.id, me.id, { kind: 'none' });

    enterSite(w, car, BOWL);

    expect(stateOf(w, 'truce', car.id, me.id)).not.toBeNull();
    expect(stateOf(w, 'grievance', car.id, me.id)).not.toBeNull();
  });

  it('keeps a state that stays outside until it ends, like a feud', () => {
    const { w, car, me } = bowlWorld();
    const feud = addState(w, 'feud', car.id, me.id, { kind: 'feud', robbery: false });
    expect(canEnter(w, car, BOWL)).toBe(false);
    endState(w, feud, 'expired');
    expect(canEnter(w, car, BOWL)).toBe(true);
  });

  it('ends a stranded truck\'s rescue offers when it goes home', () => {
    const { w, car, me } = bowlWorld();
    addState(w, 'turnedDown', car.id, me.id, { kind: 'none' });

    expect(canEnter(w, car, BOWL)).toBe(true);
    enterSite(w, car, BOWL);

    expect(stateOf(w, 'turnedDown', car.id, me.id)).toBeNull();
  });

  it('ends a memory state when its other party is gone from the world', () => {
    const { w, car, me } = bowlWorld();
    addState(w, 'revenge', car.id, me.id, { kind: 'none' });
    enterSite(w, car, BOWL);
    w.vehicles = w.vehicles.filter((v) => v !== me);
    w.turn++;
    advanceStates(w);

    expect(stateOf(w, 'revenge', car.id, me.id)).toBeNull();
    expect(isSheltered(w, car.id)).toBe(true);
  });

  it('keeps a truck outside while it is the driver of a pending encounter', () => {
    const { w, car } = bowlWorld();
    w.player.encounters.pending = { encounter: 'tip', driver: car.id, until: w.turn + 5 } as World['player']['encounters']['pending'];
    expect(canEnter(w, car, BOWL)).toBe(false);
    w.player.encounters.pending = null;
    expect(canEnter(w, car, BOWL)).toBe(true);
  });
});

describe('a crime case on a truck that is inside', () => {
  it('stays open with its escrow while the target is inside', () => {
    const { w, car } = bowlWorld();
    const c = openCase(w, car, w.turn);
    enterSite(w, car, BOWL);
    w.turn += BOUNTY.lapseTurns - 1;

    advanceCrimes(w);

    expect(c.status).toBe('open');
    expect(c.escrow).toBe(7);
  });

  it('still lapses once its time is up', () => {
    const { w, car } = bowlWorld();
    const c = openCase(w, car, w.turn);
    enterSite(w, car, BOWL);
    w.turn += BOUNTY.lapseTurns;

    advanceCrimes(w);

    expect(c.status).toBe('lapsed');
  });
});
