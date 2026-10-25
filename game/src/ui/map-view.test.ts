import { describe, expect, it } from 'vitest';
import { REGION } from '../data/region';
import { emptyHidden } from '../sim/salvage';
import { sitePads } from '../sim/sites';
import { emptyWorld } from '../sim/testkit';
import { tileOf } from '../sim/vision';
import { resolve } from '../text/resolve';
import { mapSites, strokeRumor, tipText, type RumorPen } from './map-view';
import { token } from './tokens';

const bowl = REGION.towns.find((t) => t.id === 'bowl')!;
const nose = REGION.towns.find((t) => t.id === 'nose')!;

function blankWorld() {
  const world = emptyWorld(sitePads(bowl)[0]);
  world.player.explored.fill(0);
  world.player.discovered = [];
  return world;
}

describe('map site marks', () => {
  it('leaves a told town off the map until its ground is explored', () => {
    const world = blankWorld();
    world.player.discovered = ['nose'];
    expect(mapSites(world).some((s) => s.id === 'nose')).toBe(false);
    world.player.explored[tileOf(world, sitePads(nose)[0])] = 1;
    expect(mapSites(world).find((s) => s.id === 'nose')).toMatchObject({ kind: 'town', known: true });
  });

  it('marks an explored but unfound site as unknown', () => {
    const world = blankWorld();
    world.player.explored[tileOf(world, sitePads(bowl)[0])] = 1;
    expect(mapSites(world).find((s) => s.id === 'bowl')).toMatchObject({ known: false });
  });
});

describe('map tips', () => {
  it('names a rumored wreck, a found town and an unfound place in both languages', () => {
    const world = blankWorld();
    world.salvage = [{ id: 'wreck7', pos: { x: 50, y: 30 }, radius: 0.6, goods: { scrap: 2 }, parts: [], hidden: emptyHidden() }];
    world.player.rumored = ['wreck7'];
    world.player.discovered = ['nose'];
    world.player.explored[tileOf(world, sitePads(nose)[0])] = 1;
    world.player.explored[tileOf(world, sitePads(bowl)[0])] = 1;
    const sites = mapSites(world);
    const wreck = sites.find((s) => s.id === 'wreck7')!;
    const found = sites.find((s) => s.id === 'nose')!;
    const unfound = sites.find((s) => s.id === 'bowl')!;
    expect(resolve(tipText(wreck), 'en')).toBe('Wreck (rumor)');
    expect(resolve(tipText(wreck), 'ru')).toBe('Обломки (слух)');
    expect(resolve(tipText(found), 'en')).toBe('Nose');
    expect(resolve(tipText(found), 'en')).not.toBe('???');
    expect(resolve(tipText(unfound), 'en')).toBe('???');
  });
});

describe('rumor ring', () => {
  it('strokes a solid sunk ring, then a dashed bright ring at the same centre and radius', () => {
    const strokes: { color: unknown; width: number; dash: number[]; arc: number[] }[] = [];
    let dash: number[] = [];
    let arc: number[] = [];
    const pen = {
      strokeStyle: '' as unknown,
      lineWidth: 0,
      save() {},
      restore() {},
      beginPath() {},
      setLineDash(d: number[]) { dash = d; },
      arc(...a: number[]) { arc = a.slice(0, 3); },
      stroke() { strokes.push({ color: pen.strokeStyle, width: pen.lineWidth, dash, arc }); },
    };
    strokeRumor(pen as unknown as RumorPen, { x: 10, y: 20 }, 5);
    expect(strokes).toHaveLength(2);
    expect(strokes[0]).toMatchObject({ color: token('--surface-sunk'), dash: [], arc: [10, 20, 5] });
    expect(strokes[1]).toMatchObject({ color: token('--ink-bright'), arc: [10, 20, 5] });
    expect(strokes[1].dash.length).toBeGreaterThan(0);
    expect(strokes[0].width).toBeGreaterThan(strokes[1].width);
  });
});
