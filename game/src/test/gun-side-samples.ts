import { describe, expect, it } from 'vitest';
import { NPCS } from '../data/npcs';
import { generateNpcLoadout } from '../sim/npc-loadout';
import { makeVehicle } from '../sim/factory';
import { npcBrain, emptyWorld } from '../sim/testkit';
import { fallbackFaction } from '../sim/spawn';
import type { Vehicle } from '../sim/types';
import { PAINT } from '../data/chassis';
import { gunContacts, gunOverlaps, headCount, loneHeadY, headY, mountedGuns } from './gun-clearance-kit';
import { VehicleView } from '../three/render/vehicle';

function rolled(templateId: string, seed: number): Vehicle {
  const t = NPCS[templateId];
  const world = { ...emptyWorld(), rngState: seed * 7 + 3 };
  const l = generateNpcLoadout(world, t, null, 'loaded');
  return makeVehicle(world, { ...l, faction: fallbackFaction(t), brain: npcBrain(t.id, { x: 50, y: 50 }, t.traits), pos: { x: 50, y: 50 }, heading: 0 });
}


type Sampled = { label: string; v: Vehicle };

const sampled = new Map<string, Sampled[]>();

function sampleOf(id: string): Sampled[] {
  const known = sampled.get(id);
  if (known) return known;
  const out: Sampled[] = [];
  for (let seed = 1; seed <= 6; seed++) {
    try {
      out.push({ label: `${id}#${seed}`, v: rolled(id, seed) });
    } catch {
      continue;
    }
  }
  sampled.set(id, out);
  return out;
}

export const FIRST_HALF = ['bowlFarmer', 'buggy', 'gunwagon', 'trader', 'scavenger'];
export const SECOND_HALF = Object.keys(NPCS).filter((id) => !FIRST_HALF.includes(id));

export function checkGunsOnTemplates(templateIds: string[]): void {
  describe.each(templateIds)('guns on one %s truck at rest', (templateId) => {
    it.each(['world', 'portrait'] as const)('never meet on its loadouts in the %s view', (mode) => {
      const problems: string[] = [];
      for (const { label, v } of sampleOf(templateId)) {
        problems.push(...gunContacts(v, mode).map((p) => `${label} ${mode} ${p}`));
        problems.push(...gunOverlaps(v, mode).map((p) => `${label} ${mode} ${p}`));
      }
      expect(problems).toEqual([]);
    });

    it('keep every mounted gun drawn', () => {
      const problems: string[] = [];
      for (const { label, v } of sampleOf(templateId)) {
        const view = new VehicleView(v, true, PAINT.standard, 'world');
        const heads = headCount(view);
        if (heads !== mountedGuns(v).length) problems.push(`${label}: ${heads} heads for ${mountedGuns(v).length} guns`);
      }
      expect(problems).toEqual([]);
    });

    it('stand at the height each has alone', () => {
      const problems: string[] = [];
      for (const { label, v } of sampleOf(templateId)) {
        for (const g of mountedGuns(v)) {
          const full = headY(v, g.id, 'world');
          const alone = loneHeadY(v, g.id, 'world');
          if (Math.abs(full - alone) > 0.001) problems.push(`${label} ${g.part.defId}@${g.x},${g.y}: ${full.toFixed(3)} vs ${alone.toFixed(3)}`);
        }
      }
      expect(problems).toEqual([]);
    });
  });
}
