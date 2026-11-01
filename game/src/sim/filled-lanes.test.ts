import { describe, expect, it } from 'vitest';
import { filledLanes, laneCount } from './armor';
import { fireWeapons } from './combat';
import { gunFor } from './factory';
import { mountedParts } from './grid';
import { addVehicle, emptyWorld } from './testkit';

function semiBeside() {
  const w = emptyWorld();
  const me = addVehicle(w, 'player', 'scout', ['mg', 'stockEngine'], { x: 30, y: 30 });
  const semi = addVehicle(w, 'independent', 'semi', ['workhorseDiesel'], { x: 30, y: 36 }, 0);
  const gun = mountedParts(me, 'weapon')[0];
  me.weaponOrders[gun.id] = { targetId: semi.id, aim: 'body' };
  return { w, me, semi };
}

describe('body shots land only on lanes that hold a part', () => {
  it('leaves the empty trailer rows of a semi out of its side lanes', () => {
    const { semi } = semiBeside();
    const filled = filledLanes(semi, 'left');
    expect(filled.length).toBeGreaterThan(0);
    expect(filled.length).toBeLessThan(laneCount(semi, 'left'));
  });

  it('damages a part with every round that strikes the side of a semi whose parts all work', () => {
    const { w, me, semi } = semiBeside();
    let struck = 0;
    for (let turn = 0; turn < 30 && mountedParts(semi).every((p) => p.hp > 0); turn++) {
      for (const p of mountedParts(me, 'weapon')) Object.assign(p, gunFor(p.defId));
      w.events = [];
      fireWeapons(w);
      for (const e of w.events) {
        if (e.t !== 'shot') continue;
        for (const round of e.rounds.filter((r) => r.struck === semi.id)) {
          struck += 1;
          expect(round.hits.some((h) => h.damage > 0), `turn ${turn}`).toBe(true);
        }
      }
    }
    expect(struck).toBeGreaterThan(0);
  });
});
