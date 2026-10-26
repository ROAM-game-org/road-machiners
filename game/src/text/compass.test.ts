import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compassOctant, OCTANT_ORDER } from './compass';
import { octantOf } from '../sim/direction-cues';

const angleOf = (x: number, y: number) => Math.atan2(y, x);

describe('compass', () => {
  it('names the map directions by the map, north toward the top edge', () => {
    expect(compassOctant(angleOf(0, -1))).toBe('north');
    expect(compassOctant(angleOf(1, 0))).toBe('east');
    expect(compassOctant(angleOf(0, 1))).toBe('south');
    expect(compassOctant(angleOf(-1, 0))).toBe('west');
    expect(compassOctant(angleOf(1, -1))).toBe('northEast');
    expect(compassOctant(angleOf(-1, 1))).toBe('southWest');
  });

  it('agrees with the sim bins at every octant centre and edge', () => {
    OCTANT_ORDER.forEach((octant, i) => {
      const angle = (i * Math.PI) / 4;
      expect(compassOctant(angle)).toBe(octant);
      const v = { x: Math.cos(angle + 0.3), y: Math.sin(angle + 0.3) };
      expect(compassOctant(Math.atan2(v.y, v.x))).toBe(octantOf(v));
      const edge = { x: Math.cos(angle + 0.4), y: Math.sin(angle + 0.4) };
      expect(compassOctant(Math.atan2(edge.y, edge.x))).toBe(octantOf(edge));
    });
  });

  it('keeps the ordered octant list in one place', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const file = path.join(dir, name);
        if (statSync(file).isDirectory()) walk(file);
        else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name) && !file.endsWith(path.join('text', 'compass.ts'))) {
          if (/'east',\s*'southEast'/.test(readFileSync(file, 'utf8'))) offenders.push(file);
        }
      }
    };
    for (const dir of ['src/ui', 'src/text', 'src/three']) walk(dir);
    expect(offenders).toEqual([]);
  });
});
