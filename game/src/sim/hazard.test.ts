import { describe, expect, it } from 'vitest';
import { FALLEN_SUN_POS, REGION } from '../data/region';
import { TERRAIN } from '../data/terrain';
import { TERRITORIES } from '../data/territory';
import { applyHazards, inCore } from './hazard';
import { siteGap } from './sites';
import { hazardZoneOf, hazardZones, reactorPos, territoryEntries, territoryGrounds, territoryPieces } from './territory';
import { route } from './path';
import { addVehicle, emptyWorld } from './testkit';
import { getResources } from './resources';
import type { World } from './types';
import { dist, polylineDist } from './vec';

const sun = REGION.locations.find((l) => l.id === 'fallen-sun')!;
const hazard = TERRITORIES['fallen-sun'].reactor!.hazard!;
const core = reactorPos(sun as never);
const ring = { x: core.x, y: core.y - (hazard.core!.radius + hazard.radius) / 2 };
const outsidePos = { x: core.x + hazard.radius + 3, y: core.y };

function worldAt(pos: { x: number; y: number }): World {
  const w = emptyWorld(pos);
  w.player.health = 100;
  return w;
}

describe('the reactor hazard', () => {
  it('sits at the reactor inside the bow', () => {
    const bow = territoryPieces(sun as never).find((p) => p.look === 'shipBow')!;
    expect(hazardZones().find((z) => z.id === 'fallen-sun')!.pos).toEqual(core);
    expect(dist(core, bow.pos)).toBeLessThan(bow.r);
  });

  it('costs driver health inside the zone, stops at the floor and spares trucks outside', () => {
    const w = worldAt(ring);
    applyHazards(w);
    expect(w.player.health).toBe(100 - hazard.healthPerTurn);
    for (let i = 0; i < 30; i++) applyHazards(w);
    expect(w.player.health).toBe(hazard.floor);
    const out = worldAt(outsidePos);
    applyHazards(out);
    expect(out.player.health).toBe(100);
  });

  it('leaves health already below the floor alone', () => {
    const w = worldAt(ring);
    w.player.health = hazard.floor - 10;
    applyHazards(w);
    expect(w.player.health).toBe(hazard.floor - 10);
  });

  it('hurts an NPC truck by the same rule, and spares its parts', () => {
    const w = worldAt(outsidePos);
    const npc = addVehicle(w, 'independent', 'scout', [], ring);
    npc.resources = { money: 0, fuel: 10, supplies: 10, health: 100 };
    const hp = npc.items.map((i) => (i.kind === 'part' ? i.part.hp : 0));
    applyHazards(w);
    expect(getResources(w, npc).health).toBe(100 - hazard.healthPerTurn);
    expect(npc.items.map((i) => (i.kind === 'part' ? i.part.hp : 0))).toEqual(hp);
    expect(w.player.health).toBe(100);
  });

  it('tells the player once for each entry, and uses no numbers', () => {
    const w = worldAt(ring);
    const me = w.vehicles[0];
    me.trail = [{ ...outsidePos, heading: 0 }];
    applyHazards(w);
    const lines = w.events.filter((e) => e.t === 'info');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({ t: 'info', note: { id: 'hazard' } });
    me.trail = [{ ...ring, heading: 0 }];
    applyHazards(w);
    expect(w.events.filter((e) => e.t === 'info')).toHaveLength(1);
  });

  it('burns with no floor inside the core, for NPCs too, and tells the player once on entry', () => {
    const w = worldAt(core);
    const me = w.vehicles[0];
    me.trail = [{ ...ring, heading: 0 }];
    const npc = addVehicle(w, 'independent', 'scout', [], { x: core.x + 0.5, y: core.y });
    npc.resources = { money: 0, fuel: 10, supplies: 10, health: hazard.floor };
    w.player.health = hazard.floor;
    applyHazards(w);
    expect(w.player.health).toBe(hazard.floor - hazard.core!.healthPerTurn);
    expect(getResources(w, npc).health).toBe(hazard.floor - hazard.core!.healthPerTurn);
    expect(w.events.filter((e) => e.t === 'info').map((e) => e.t === 'info' && e.note.id)).toEqual(['core']);
    me.trail = [{ ...core, heading: 0 }];
    for (let i = 0; i < 10; i++) applyHazards(w);
    expect(w.player.health).toBe(0);
    expect(w.events.filter((e) => e.t === 'info')).toHaveLength(1);
  });

  it('reports a core burn only when it took health', () => {
    const w = worldAt(core);
    w.player.health = 0;
    applyHazards(w);
    expect(w.events.some((e) => e.t === 'coreBurn')).toBe(false);
    w.player.health = 5;
    applyHazards(w);
    expect(w.events.some((e) => e.t === 'coreBurn')).toBe(true);
  });

  describe('the breach light', () => {
    const light = hazardZones().find((z) => z.id === 'fallen-sun')!.core!.light;
    const reported = { x: FALLEN_SUN_POS.x + 24.55, y: FALLEN_SUN_POS.y - 24.21 };

    function burnAt(pos: { x: number; y: number }): World {
      const w = worldAt(pos);
      w.player.health = 35;
      w.vehicles[0].trail = [{ ...outsidePos, heading: 0 }];
      applyHazards(w);
      return w;
    }

    it('burns with no floor, tells the player and raises the core burn', () => {
      for (const pos of [light.pos, { x: light.pos.x, y: light.pos.y - 1.9 }, reported]) {
        expect(dist(pos, core)).toBeGreaterThan(hazard.core!.radius);
        const w = burnAt(pos);
        expect(w.player.health).toBe(35 - hazard.core!.healthPerTurn);
        expect(w.events).toContainEqual({ t: 'info', note: { id: 'core' } });
        expect(w.events.some((e) => e.t === 'coreBurn')).toBe(true);
      }
    });

    it('burns an NPC the same way', () => {
      const w = worldAt(outsidePos);
      const npc = addVehicle(w, 'independent', 'scout', [], light.pos);
      npc.resources = { money: 0, fuel: 10, supplies: 10, health: hazard.floor };
      applyHazards(w);
      expect(getResources(w, npc).health).toBe(hazard.floor - hazard.core!.healthPerTurn);
    });

    it('still drains to the floor just outside the light', () => {
      const w = worldAt({ x: light.pos.x, y: light.pos.y - light.radius - 0.15 });
      for (let i = 0; i < 30; i++) applyHazards(w);
      expect(w.player.health).toBe(hazard.floor);
    });

    it('is refused when it reaches past the drain', () => {
      const wide = { ...hazard, core: { ...hazard.core!, light: { ...hazard.core!.light, radius: hazard.radius } } };
      expect(() => hazardZoneOf(sun as never, wide, core)).toThrow(/reaches past its drain/);
      expect(inCore(hazardZones()[0], light.pos)).toBe(true);
    });
  });

  it('keeps routes out of the zone', () => {
    const w = worldAt(outsidePos);
    const far = { x: core.x - hazard.radius - 3, y: core.y };
    const path = route(w, outsidePos, far, 0.6, []);
    let at = outsidePos;
    for (const p of path) {
      for (let k = 0; k <= 20; k++) {
        const s = { x: at.x + ((p.x - at.x) * k) / 20, y: at.y + ((p.y - at.y) * k) / 20 };
        expect(dist(s, core)).toBeGreaterThanOrEqual(hazard.radius - 0.01);
      }
      at = p;
    }
  });
});

describe('hunting grounds in the Fallen Sun', () => {
  const furrow = TERRAIN.features.furrow;
  const entries = territoryEntries(sun as never);
  const inner = territoryGrounds(sun as never).filter((p) => !entries.some((e) => dist(e, p) < 1e-9));

  it('wait at every patch, each inside the outline and clear of the hazard', () => {
    expect(inner).toHaveLength(TERRITORIES['fallen-sun'].wreck!.patches.length);
    for (const p of inner) {
      const where = `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
      expect(siteGap(sun, p), where).toBeLessThan(0);
      expect(dist(p, core), where).toBeGreaterThan(hazard.radius);
    }
  });

  it('reach down the crash furrow', () => {
    expect(inner.filter((p) => polylineDist(p, furrow.path) < furrow.width).length).toBeGreaterThanOrEqual(2);
  });
});
