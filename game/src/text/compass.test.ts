import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { VIEW } from '../data/view';
import { compassOctant, compassOfMap, OCTANT_ORDER } from './compass';
import { octantOf } from '../sim/direction-cues';

const angleOf = (x: number, y: number) => Math.atan2(y, x);

describe('compass', () => {
  it('names the map direction drawn at the top of the screen north', () => {
    expect(compassOctant(angleOf(VIEW.screenUp.x, VIEW.screenUp.y))).toBe('north');
  });

  it('names the other map directions by where the view draws them', () => {
    expect(compassOctant(angleOf(1, -1))).toBe('east');
    expect(compassOctant(angleOf(1, 1))).toBe('south');
    expect(compassOctant(angleOf(-1, 1))).toBe('west');
    expect(compassOctant(angleOf(0, -1))).toBe('northEast');
    expect(compassOctant(angleOf(1, 0))).toBe('southEast');
  });

  it('turns every map octant id one step clockwise', () => {
    expect(compassOfMap('north')).toBe('northEast');
    expect(compassOfMap('northWest')).toBe('north');
    expect(compassOfMap('east')).toBe('southEast');
    expect(compassOfMap('northEast')).toBe('east');
  });

  it('agrees with the sim bins at every octant centre and edge', () => {
    OCTANT_ORDER.forEach((octant, i) => {
      const angle = (i * Math.PI) / 4;
      expect(compassOctant(angle)).toBe(compassOfMap(octant));
      const v = { x: Math.cos(angle + 0.3), y: Math.sin(angle + 0.3) };
      expect(compassOctant(Math.atan2(v.y, v.x))).toBe(compassOfMap(octantOf(v)));
      const edge = { x: Math.cos(angle + 0.4), y: Math.sin(angle + 0.4) };
      expect(compassOctant(Math.atan2(edge.y, edge.x))).toBe(compassOfMap(octantOf(edge)));
    });
  });

  it('throws on an unknown octant id', () => {
    expect(() => compassOfMap('up' as never)).toThrow();
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
