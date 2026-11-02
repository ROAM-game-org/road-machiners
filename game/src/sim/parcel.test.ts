import { describe, expect, it } from 'vitest';
import { PARCEL } from '../data/goods';
import { playerVehicle } from './damage';
import { swapChassis } from './economy';
import { hasLoot } from './grid';
import { cargoHaul } from './haul';
import { addGoods, dumpItem, stowParcel, storePart, type ParcelItem } from './inventory';
import { vehicleMass } from './mass';
import { standDownTo } from './parley';
import { hasCargo, looseCargo } from './salvage';
import { addVehicle, emptyWorld, forceOption, npcBrain, startCombat, testDrive } from './testkit';
import { askHandover, handOverParcel, readyHandover } from './parcel';
import { searchReward } from './market';
import type { Vehicle, World } from './types';
import { endTurn, Refused, update } from './world';

function parcelOf(v: Vehicle): ParcelItem | undefined {
  return v.items.find((it): it is ParcelItem => it.kind === 'parcel');
}

function withParcel(w: World): ParcelItem {
  const me = playerVehicle(w);
  if (!stowParcel(me, { id: 'i-parcel', x: 0, y: 0, rot: 0, kind: 'parcel', contract: 'ct-search' })) throw new Error('No room for the test parcel');
  return parcelOf(me)!;
}

function robberScene(): { w: World; robber: Vehicle } {
  forceOption('preySeen', 'rob');
  const w = emptyWorld({ x: 15, y: 10 });
  const robber = addVehicle(w, 'independent', 'wagon', ['heavyMg', 'mg', 'stockEngine'], { x: 10, y: 10 });
  robber.brain = npcBrain('scavenger', robber.pos, ['scavenger', 'scumbag']);
  addGoods(w, playerVehicle(w), 'scrap', 2);
  withParcel(w);
  return { w, robber };
}

describe('the parcel cargo item', () => {
  it('is nobody\'s loot: loose cargo, hauls and loot checks leave it', () => {
    const { robber, w } = robberScene();
    const me = playerVehicle(w);
    expect(looseCargo(me).some((it) => it.kind === 'parcel')).toBe(false);
    expect(cargoHaul(robber, me).some((it) => it.kind === 'parcel')).toBe(false);
    const alone = { ...me, items: me.items.filter((it) => it.kind === 'parcel') };
    expect(hasCargo(alone)).toBe(false);
    expect(hasLoot(alone)).toBe(false);
  });

  it('stays aboard when the player stands down to a robber', () => {
    const { robber, w } = robberScene();
    const parcel = parcelOf(playerVehicle(w))!;
    const after = update(w, (d) => standDownTo(d, playerVehicle(d), d.vehicles.find((v) => v.id === robber.id)!));
    const me = playerVehicle(after);
    expect(parcelOf(me)).toEqual(parcel);
    expect(after.salvage.flatMap((s) => s.parts).some((p) => p.id === parcel.id)).toBe(false);
  });

  it('refuses to be dumped or stored', () => {
    const w = emptyWorld();
    const parcel = withParcel(w);
    const dumped = (() => {
      try {
        dumpItem(w, parcel.id);
      } catch (err) {
        return err;
      }
      return null;
    })();
    expect(dumped).toBeInstanceOf(Refused);
    expect((dumped as Refused).refusal).toEqual({ id: 'parcelKept' });
    expect(() => storePart(w, parcel.id)).toThrow();
    expect(parcelOf(playerVehicle(w))).toEqual(parcel);
  });

  it('keeps its id through a chassis swap', () => {
    const w = emptyWorld();
    const parcel = withParcel(w);
    const after = update(w, (d) => {
      d.player.money = 1_000_000;
      swapChassis(d, playerVehicle(d).chassisId === 'hauler' ? 'van' : 'hauler');
    });
    expect(parcelOf(playerVehicle(after))).toMatchObject({ id: parcel.id, kind: 'parcel', contract: 'ct-search' });
    expect(playerVehicle(after).items.filter((it) => it.kind === 'parcel')).toHaveLength(1);
  });

  it('weighs PARCEL.mass', () => {
    const w = emptyWorld();
    const before = vehicleMass(playerVehicle(w));
    withParcel(w);
    expect(vehicleMass(playerVehicle(w))).toBeCloseTo(before + PARCEL.mass);
  });
});

function meetingScene(): { w: World; target: Vehicle; other: Vehicle } {
  const w = emptyWorld({ x: 30, y: 30 });
  const target = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 33, y: 30 });
  target.brain = npcBrain('trader', target.pos, ['trader']);
  const other = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 30, y: 33 });
  other.brain = npcBrain('trader', other.pos, ['trader']);
  w.player.contracts.push({
    id: 'ct-search', shop: 'bowl', kind: 'search', target: target.id, driver: target.brain.driver, template: 'trader',
    lead: { at: { x: 0, y: 0 }, turn: 0 }, reward: searchReward(), deadline: 900, window: 600, tier: 1, delivered: false,
  });
  withParcel(w);
  return { w, target, other };
}

describe('handing the parcel over', () => {
  it('is ready only in a meeting with the target, and moves the parcel out once', () => {
    const { w, target } = meetingScene();
    expect(readyHandover(w)).toBeNull();
    askHandover(w, target);
    const s = readyHandover(w);
    expect(s).toMatchObject({ kind: 'handover', holder: target.id, other: w.player.vehicleId });
    const done = handOverParcel(w, target.id);
    expect(parcelOf(playerVehicle(done))).toBeUndefined();
    expect(done.player.contracts[0]).toMatchObject({ delivered: true });
    expect(done.events.filter((e) => e.t === 'contract')).toHaveLength(1);
    expect(readyHandover(done)).toBeNull();
    expect(() => handOverParcel(done, target.id)).toThrow();
  });

  it('refuses another truck, a truck with no meeting, one out of reach and a fight', () => {
    const { w, target, other } = meetingScene();
    expect(() => handOverParcel(w, target.id)).toThrow('Not meeting');
    askHandover(w, target);
    expect(() => handOverParcel(w, other.id)).toThrow('Not meeting');
    const far = update(w, (d) => {
      d.vehicles.find((v) => v.id === target.id)!.pos = { x: 90, y: 90 };
    });
    expect(readyHandover(far)).toBeNull();
    expect(() => handOverParcel(far, target.id)).toThrow('Not meeting');
    const fight = update(w, (d) => startCombat(d, d.vehicles.find((v) => v.id === other.id)!, playerVehicle(d)));
    expect(readyHandover(fight)).toBeNull();
    expect(() => handOverParcel(fight, target.id)).toThrow('combat');
    expect(parcelOf(playerVehicle(w))).toBeDefined();
  });

  it('breaks the meeting when the target gets into a fight, and leaves the parcel undelivered', () => {
    const { w, target } = meetingScene();
    const raider = addVehicle(w, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], { x: 36, y: 36 });
    raider.brain = npcBrain('buggy', raider.pos, ['raider']);
    askHandover(w, target);
    startCombat(w, raider, target);
    const after = endTurn(w, testDrive);
    expect(after.states.some((s) => s.kind === 'handover')).toBe(false);
    expect(after.player.contracts[0]).toMatchObject({ delivered: false });
    expect(parcelOf(playerVehicle(after))).toBeDefined();
  });

  it('breaks the meeting when the search fails', () => {
    const { w, target } = meetingScene();
    askHandover(w, target);
    w.turn = 901;
    const after = endTurn(w, testDrive);
    expect(after.player.contracts).toEqual([]);
    expect(after.states.some((s) => s.kind === 'handover')).toBe(false);
    expect(parcelOf(playerVehicle(after))).toBeUndefined();
  });
});
