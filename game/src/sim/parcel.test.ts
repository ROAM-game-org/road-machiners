import { describe, expect, it } from 'vitest';
import { PARCEL } from '../data/goods';
import { playerVehicle } from './damage';
import { swapChassis } from './economy';
import { hasLoot } from './grid';
import { cargoHaul, surrenderHaul } from './haul';
import { addGoods, dumpItem, stowParcel, storePart, type ParcelItem } from './inventory';
import { vehicleMass } from './mass';
import { surrenderTo } from './parley';
import { hasCargo, looseCargo } from './salvage';
import { addVehicle, emptyWorld, forceOption, npcBrain } from './testkit';
import type { Vehicle, World } from './types';
import { Refused, update } from './world';

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
  const robber = addVehicle(w, 'scavengers', 'wagon', ['heavyMg', 'mg', 'stockEngine'], { x: 10, y: 10 });
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
    expect(surrenderHaul(robber, me).some((it) => it.kind === 'parcel')).toBe(false);
    const alone = { ...me, items: me.items.filter((it) => it.kind === 'parcel') };
    expect(hasCargo(alone)).toBe(false);
    expect(hasLoot(alone)).toBe(false);
  });

  it('stays aboard when the player surrenders to a robber', () => {
    const { robber, w } = robberScene();
    const parcel = parcelOf(playerVehicle(w))!;
    const after = update(w, (d) => surrenderTo(d, playerVehicle(d), d.vehicles.find((v) => v.id === robber.id)!));
    const me = playerVehicle(after);
    expect(me.items.filter((it) => it.kind === 'good')).toEqual([]);
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
