import { describe, expect, it } from 'vitest';
import { NPCS } from '../../data/npcs';
import { generateNpcLoadout } from '../../sim/npc-loadout';
import { makeVehicle } from '../../sim/factory';
import { emptyWorld, npcBrain } from '../../sim/testkit';
import { fallbackFaction } from '../../sim/spawn';
import type { Vehicle } from '../../sim/types';
import { PAINT } from '../../data/chassis';
import { SLOW, gunContacts, gunOverlaps, headCount, loneHeadY, headY, mountedGuns } from '../../test/gun-clearance-kit';
import { VehicleView } from './vehicle';

function rolled(templateId: string, seed: number): Vehicle {
  const t = NPCS[templateId];
  const world = { ...emptyWorld(), rngState: seed * 7 + 3 };
  const l = generateNpcLoadout(world, t, null, 'loaded');
  return makeVehicle(world, { ...l, faction: fallbackFaction(t), brain: npcBrain(t.id, { x: 50, y: 50 }, t.traits), pos: { x: 50, y: 50 }, heading: 0 });
}

function sample(): { label: string; v: Vehicle }[] {
  const out: { label: string; v: Vehicle }[] = [];
  for (const id of Object.keys(NPCS)) {
    for (let seed = 1; seed <= 6; seed++) {
      try {
        out.push({ label: `${id}#${seed}`, v: rolled(id, seed) });
      } catch {
        continue;
      }
    }
  }
  return out;
}

describe('guns on one truck at rest', () => {
  it('never meet on NPC loadouts of every template', () => {
    const problems: string[] = [];
    for (const { label, v } of sample()) {
      for (const mode of ['world', 'portrait'] as const) {
        problems.push(...gunContacts(v, mode).map((p) => `${label} ${mode} ${p}`));
        problems.push(...gunOverlaps(v, mode).map((p) => `${label} ${mode} ${p}`));
      }
    }
    expect(problems).toEqual([]);
  }, SLOW);

  it('keep every mounted gun drawn', () => {
    const problems: string[] = [];
    for (const { label, v } of sample()) {
      const heads = headCount(new VehicleView(v, true, PAINT.standard, 'world'));
      if (heads !== mountedGuns(v).length) problems.push(`${label}: ${heads} heads for ${mountedGuns(v).length} guns`);
    }
    expect(problems).toEqual([]);
  }, SLOW);

  it('stand at the height each has alone', () => {
    const problems: string[] = [];
    for (const { label, v } of sample()) {
      for (const g of mountedGuns(v)) {
        const full = headY(v, g.id, 'world');
        const alone = loneHeadY(v, g.id, 'world');
        if (Math.abs(full - alone) > 0.001) problems.push(`${label} ${g.part.defId}@${g.x},${g.y}: ${full.toFixed(3)} vs ${alone.toFixed(3)}`);
      }
    }
    expect(problems).toEqual([]);
  }, SLOW);

  it('keep the reported pair, apart and at their lone heights', () => {
    const v = rolled('vulture', 2);
    expect(mountedGuns(v).map((g) => g.part.defId)).toEqual(expect.arrayContaining(['shotgun', 'slugCannon']));
    expect(gunContacts(v, 'world')).toEqual([]);
    expect(gunOverlaps(v, 'world')).toEqual([]);
    for (const g of mountedGuns(v)) expect(headY(v, g.id, 'world')).toBeCloseTo(loneHeadY(v, g.id, 'world'), 3);
  }, SLOW);
});
