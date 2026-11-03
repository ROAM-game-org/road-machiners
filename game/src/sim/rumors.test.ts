import { describe, expect, it } from 'vitest';
import { TOPICS } from '../data/dialogue';
import type { PersonalityId } from '../data/personalities';
import { ROAD_WATCH } from '../data/npcs';
import type { TraitId } from '../data/npcs';
import { callVehicle } from './dialogue';
import { askLinesOf, chooseLine } from './dialogue-testkit';
import { gridSquareOf } from './map-grid';
import { remember } from './memory';
import type { Vec } from './vec';
import { emptyHidden } from './salvage';
import { raiderSighting, toldWrecks } from './rumors';
import { addVehicle, emptyWorld, npcBrain } from './testkit';
import type { SalvageStock, Vehicle, World } from './types';

function wreck(id: string): SalvageStock {
  return { id, pos: { x: 50, y: 30 }, radius: 0.6, goods: { scrap: 2 }, parts: [], hidden: emptyHidden() };
}

describe('told wrecks', () => {
  it('lists the wrecks the player was told of, newest told first', () => {
    const w = emptyWorld();
    w.salvage = [wreck('wreck1'), wreck('wreck2'), wreck('wreck3'), wreck('wreck4')];
    w.player.rumored = ['wreck3', 'wreck1', 'wreck2'];

    expect(toldWrecks(w).map((s) => s.id)).toEqual(['wreck2', 'wreck1', 'wreck3']);
  });

  it('leaves out a wreck the player searched and one gone from the world', () => {
    const w = emptyWorld();
    w.salvage = [wreck('wreck1'), wreck('wreck2')];
    w.player.rumored = ['wreck1', 'wreck2', 'wreck9'];
    w.player.scavenged = ['wreck2'];

    expect(toldWrecks(w).map((s) => s.id)).toEqual(['wreck1']);
  });

  it('lists a wreck told twice once', () => {
    const w = emptyWorld();
    w.salvage = [wreck('wreck1'), wreck('wreck2')];
    w.player.rumored = ['wreck1', 'wreck2', 'wreck1'];

    expect(toldWrecks(w).map((s) => s.id)).toEqual(['wreck1', 'wreck2']);
  });
});

const ASK = TOPICS.roadWatch.ask!.say;

function watchWorld(traits: TraitId[] = ['trader'], personality?: PersonalityId): { w: World; teller: Vehicle } {
  const w = emptyWorld({ x: 30, y: 30 });
  w.player.perks = ['roadWatch'];
  const teller = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 36, y: 30 });
  teller.brain = npcBrain('trader', teller.pos, traits, personality);
  return { w, teller };
}

function raiderAt(w: World, pos: Vec): Vehicle {
  const raider = addVehicle(w, 'scrapjaw', 'buggy', ['stockEngine'], pos);
  raider.brain = npcBrain('buggy', raider.pos, ['raider']);
  return raider;
}

function saw(w: World, teller: Vehicle, seen: Vehicle, at: Vec, turn: number, heading = 0): void {
  const now = w.turn;
  w.turn = turn;
  remember(w, teller, { kind: 'sighting', vehicle: seen.id, at, heading });
  w.turn = now;
}

describe('road watch', () => {
  it('names the raider sighting nearest the player of several', () => {
    const { w, teller } = watchWorld();
    w.turn = 100;
    const far = raiderAt(w, { x: 200, y: 200 });
    const near = raiderAt(w, { x: 300, y: 300 });
    saw(w, teller, far, { x: 150, y: 30 }, 90);
    saw(w, teller, near, { x: 60, y: 30 }, 40, 1.5);

    expect(raiderSighting(w, teller)).toEqual({ kind: 'raiders', seen: { square: gridSquareOf({ x: 60, y: 30 }), turns: 60, heading: 1.5 }, count: 1 });
  });

  it('counts the raiders seen within a crew reach of the nearest one', () => {
    const { w, teller } = watchWorld();
    const crew = [0, 1, 2].map(() => raiderAt(w, { x: 400, y: 400 }));
    crew.forEach((raider, i) => saw(w, teller, raider, { x: 80 + i * (ROAD_WATCH.groupReach / 2), y: 30 }, 0));
    const loner = raiderAt(w, { x: 400, y: 400 });
    saw(w, teller, loner, { x: 80 + 2 * ROAD_WATCH.groupReach, y: 30 }, 0);

    expect(raiderSighting(w, teller).count).toBe(3);
  });

  it('ignores a non-raider sighting and a raider the teller never saw', () => {
    const { w, teller } = watchWorld();
    const trader = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 50, y: 30 });
    trader.brain = npcBrain('trader', trader.pos, ['trader']);
    saw(w, teller, trader, { x: 50, y: 30 }, 0);
    raiderAt(w, { x: 32, y: 30 });

    expect(raiderSighting(w, teller)).toEqual({ kind: 'raiders', seen: null, count: 0 });
  });

  it('ignores the player even when its faction is outlaw', () => {
    const { w, teller } = watchWorld();
    w.vehicles.find((v) => v.id === w.player.vehicleId)!.faction = 'scrapjaw';
    saw(w, teller, w.vehicles.find((v) => v.id === w.player.vehicleId)!, { x: 30, y: 30 }, 0);

    expect(raiderSighting(w, teller).seen).toBeNull();
  });

  it('counts a raider sheltered in town as still on the road', () => {
    const { w, teller } = watchWorld();
    const raider = raiderAt(w, { x: 90, y: 30 });
    saw(w, teller, raider, { x: 90, y: 30 }, 0);
    w.vehicles = w.vehicles.filter((v) => v.id !== raider.id);
    w.sheltered.push({ vehicle: raider, site: 'bowl' });

    expect(raiderSighting(w, teller).count).toBe(1);
  });

  it('names the square of the sighting, not where the raider is now', () => {
    const { w, teller } = watchWorld();
    const raider = raiderAt(w, { x: 900, y: 900 });
    saw(w, teller, raider, { x: 60, y: 30 }, 0);

    expect(raiderSighting(w, teller).seen?.square).toEqual(gridSquareOf({ x: 60, y: 30 }));
    expect(raiderSighting(w, teller).seen?.square).not.toEqual(gridSquareOf(raider.pos));
  });

  it('answers on the radio with the sighting and draws no random number', () => {
    const { w, teller } = watchWorld();
    const raider = raiderAt(w, { x: 300, y: 300 });
    saw(w, teller, raider, { x: 60, y: 30 }, 0);
    const rng = w.rngState;

    const told = chooseLine(callVehicle(w, teller.id), ASK);

    expect(told.player.call?.vars.raiders).toEqual(raiderSighting(w, teller));
    expect(told.player.call?.line.line).toBe('roadTroubleTold');
    expect(told.rngState).toBe(rng);
  });

  it('is offered only to a player with the perk', () => {
    const { w, teller } = watchWorld();
    expect(askLinesOf(callVehicle(w, teller.id))).toContain(ASK);
    w.player.perks = [];
    expect(askLinesOf(callVehicle(w, teller.id))).not.toContain(ASK);
  });

  it('is never offered by a raider', () => {
    const { w, teller } = watchWorld(['raider']);
    expect(askLinesOf(callVehicle(w, teller.id))).not.toContain(ASK);
  });

  it('stays closed with a suspicious driver', () => {
    const { w, teller } = watchWorld(['trader'], 'suspicious');
    expect(askLinesOf(callVehicle(w, teller.id))).not.toContain(ASK);
  });
});
