import { describe, expect, it } from 'vitest';
import { chassisDef } from '../data/chassis';
import { TRAIT_TALK } from '../data/dialogue';
import { LESSON_LINE_IDS, LESSON_TRADES, LESSONS, WEAKNESSES, type LessonTrade } from '../data/lessons';
import type { TraitId } from '../data/npcs';
import { lineKey } from '../text/names';
import { entryText } from '../text/resolve';
import { PATCH } from '../data/wear';
import { PROSE_TELLS } from '../test/prose-tells';
import { bareSides } from './armor';
import { playerVehicle } from './damage';
import { makePart } from './factory';
import { corePart, gridOf, MOUNT_CELLS, mountedParts, mountSpots, type Spot } from './grid';
import { lessonTrade, pickLesson, truckWeaknesses } from './lessons';
import { vehicleMass } from './mass';
import { addVehicle, emptyWorld, npcBrain } from './testkit';
import type { PartInstance, Vehicle, World } from './types';

function plateEverySide(w: World, v: Vehicle): void {
  for (let tries = 0; tries < 24 && bareSides(v).length > 0; tries++) {
    const plate = makePart(w, 'scrapSheet', 0);
    const spot = mountSpots(gridOf(v), v.items, { id: 'i-plate', x: 0, y: 0, rot: 0, kind: 'part', part: plate }, MOUNT_CELLS.armor).find((at) => bareSides(withPlate(v, plate, at)).length < bareSides(v).length);
    if (!spot) break;
    v.items.push({ id: `i-plate-${tries}`, kind: 'part', part: plate, ...spot });
  }
}

function withPlate(v: Vehicle, part: PartInstance, at: Spot): Vehicle {
  return { ...v, items: [...v.items, { id: 'i-try', kind: 'part', part, ...at }] };
}

function driver(w: World, traits: TraitId[], id?: string): Vehicle {
  const npc = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 36, y: 30 });
  npc.brain = npcBrain('trader', npc.pos, traits);
  if (id) npc.id = id;
  return npc;
}

describe('lesson data', () => {
  it('maps every voiced trait to one trade and no voiceless trait', () => {
    for (const [trait, talk] of Object.entries(TRAIT_TALK)) {
      expect(Object.hasOwn(LESSON_TRADES, trait)).toBe(talk.voice !== null && !talk.only);
    }
  });

  it('fills every slot of every trade once, with every lesson line used once', () => {
    const used = Object.values(LESSONS).flatMap((t) => [...WEAKNESSES.map((weak) => t.weak[weak]), ...t.general]);
    expect(used).toHaveLength(70);
    expect([...used].sort()).toEqual([...LESSON_LINE_IDS].sort());
  });

  it('gives every trade four weakness stories and ten general ones', () => {
    for (const trade of Object.values(LESSONS)) {
      expect(Object.keys(trade.weak)).toHaveLength(4);
      expect(trade.general).toHaveLength(10);
    }
  });

  it('offers the topic to every voiced trait', () => {
    for (const trait of Object.keys(LESSON_TRADES)) expect(TRAIT_TALK[trait as TraitId].topics).toContain('roadLesson');
  });
});

describe('lesson text', () => {
  it('holds no digit and stays under forty words in English', () => {
    for (const id of LESSON_LINE_IDS) {
      const text = entryText('en', lineKey(id));
      expect(text, id).not.toMatch(/\d/);
      expect(text.split(/\s+/).length, id).toBeLessThan(40);
    }
  });

  it('holds no digit in Russian', () => {
    for (const id of LESSON_LINE_IDS) expect(entryText('ru', lineKey(id)), id).not.toMatch(/\d/);
  });

  it('holds no semicolon, dash or stock phrase in either language', () => {
    for (const id of LESSON_LINE_IDS) {
      expect(entryText('en', lineKey(id)), id).not.toMatch(PROSE_TELLS.en);
      expect(entryText('ru', lineKey(id)), id).not.toMatch(PROSE_TELLS.ru);
    }
  });

  const tradeLines = (trade: LessonTrade): string[] => [...Object.values(LESSONS[trade].weak), ...LESSONS[trade].general].map((id) => entryText('en', lineKey(id)));

  it('keeps the law tic and the raider tic to a few lines', () => {
    expect(tradeLines('law').filter((text) => /for the record/i.test(text)).length).toBeLessThanOrEqual(3);
    expect(tradeLines('raider').filter((text) => /\bfriend\b/i.test(text)).length).toBeLessThanOrEqual(4);
  });

  it('opens no more than two lines of one trade with the same words', () => {
    for (const trade of Object.keys(LESSONS) as LessonTrade[]) {
      const openings = new Map<string, number>();
      for (const text of tradeLines(trade)) {
        const opening = text.toLowerCase().replace(/^for the record, /, '').split(/\s+/).slice(0, 3).join(' ');
        openings.set(opening, (openings.get(opening) ?? 0) + 1);
      }
      expect(Math.max(...openings.values()), trade).toBeLessThanOrEqual(2);
    }
  });
});

describe('truck weaknesses', () => {
  it('finds a truck with no working gun', () => {
    const w = emptyWorld();
    const v = playerVehicle(w);
    expect(truckWeaknesses(w, v)).not.toContain('noGuns');
    for (const gun of mountedParts(v, 'weapon')) gun.hp = 0;
    expect(truckWeaknesses(w, v)).toContain('noGuns');
  });

  it('finds a side with an armor mount and no working plate', () => {
    const w = emptyWorld();
    const v = playerVehicle(w);
    expect(bareSides(v).length).toBeGreaterThan(0);
    expect(truckWeaknesses(w, v)).toContain('bareSide');
  });

  it('finds no bare side on a truck whose every side is plated', () => {
    const w = emptyWorld();
    const v = playerVehicle(w);
    plateEverySide(w, v);
    expect(bareSides(v)).toEqual([]);
    expect(truckWeaknesses(w, v)).toEqual([]);
  });

  it('counts a plate at 0 HP as no cover', () => {
    const w = emptyWorld();
    const v = playerVehicle(w);
    plateEverySide(w, v);
    for (const plate of mountedParts(v, 'armor')) plate.hp = 0;
    expect(bareSides(v).length).toBeGreaterThan(0);
  });

  it('counts a spike on a side as cover, like a plate', () => {
    const w = emptyWorld();
    const v = playerVehicle(w);
    const spike = makePart(w, 'spikeCluster', 0);
    const before = bareSides(v);
    const spot = mountSpots(gridOf(v), v.items, { id: 'i-spike', x: 0, y: 0, rot: 0, kind: 'part', part: spike }, MOUNT_CELLS.accessory).find((at) => bareSides(withPlate(v, spike, at)).length < before.length)!;
    v.items.push({ id: 'i-spike', kind: 'part', part: spike, ...spot });
    expect(bareSides(v)).toHaveLength(before.length - 1);
  });

  it('finds a badly worn engine, gearbox or tank on a truck that still drives', () => {
    for (const pick of [(v: Vehicle) => mountedParts(v, 'engine')[0], (v: Vehicle) => corePart(v, 'transmission'), (v: Vehicle) => corePart(v, 'tank')]) {
      const w = emptyWorld();
      const v = playerVehicle(w);
      expect(truckWeaknesses(w, v)).not.toContain('wornCore');
      const part = pick(v);
      part.hp = Math.max(1, Math.floor(part.hp * PATCH.share) - 1);
      expect(truckWeaknesses(w, v)).toContain('wornCore');
    }
  });

  it('finds a truck loaded past its rated mass', () => {
    const w = emptyWorld();
    const v = playerVehicle(w);
    expect(truckWeaknesses(w, v)).not.toContain('overloaded');
    let n = 0;
    while (vehicleMass(v) <= chassisDef(v.chassisId).ratedMass) v.items.push({ id: `heavy${n++}`, x: 0, y: 0, rot: 0, kind: 'good', good: 'scrap' });
    expect(truckWeaknesses(w, v)).toContain('overloaded');
  });

  it('lists the weaknesses in the fixed order', () => {
    const w = emptyWorld();
    const v = playerVehicle(w);
    for (const gun of mountedParts(v, 'weapon')) gun.hp = 0;
    expect(truckWeaknesses(w, v)).toEqual(['noGuns', 'bareSide']);
  });
});

describe('picking a lesson', () => {
  const traders = (w: World, n: number): Vehicle[] => Array.from({ length: n }, (_, i) => driver(w, ['trader'], `driver-${i}`));

  it('tells its trade story for a weakness that holds', () => {
    const w = emptyWorld();
    const v = playerVehicle(w);
    for (const gun of mountedParts(v, 'weapon')) gun.hp = 0;
    const weak = [LESSONS.hauler.weak.noGuns, LESSONS.hauler.weak.bareSide];
    const allowed = [...weak, ...LESSONS.hauler.general];
    for (const npc of traders(w, 12)) expect(allowed).toContain(pickLesson(w, npc, v));
  });

  it('tells a weakness story to about half of the drivers and a general one to the rest', () => {
    const w = emptyWorld();
    const v = playerVehicle(w);
    for (const gun of mountedParts(v, 'weapon')) gun.hp = 0;
    const weak: readonly string[] = [LESSONS.hauler.weak.noGuns, LESSONS.hauler.weak.bareSide];
    const told = traders(w, 200).map((npc) => pickLesson(w, npc, v));
    const share = told.filter((id) => weak.includes(id)).length / told.length;
    expect(share).toBeGreaterThan(0.35);
    expect(share).toBeLessThan(0.65);
    expect(told.some((id) => LESSONS.hauler.general.includes(id as never))).toBe(true);
  });

  it('tells a general story of its trade when no weakness holds', () => {
    const w = emptyWorld();
    const v = playerVehicle(w);
    plateEverySide(w, v);
    for (const npc of traders(w, 12)) expect(LESSONS.hauler.general).toContain(pickLesson(w, npc, v));
  });

  it('gives the same story for the same world and driver and draws no random numbers', () => {
    const w = emptyWorld();
    const npc = driver(w, ['scavenger']);
    const first = pickLesson(w, npc, playerVehicle(w));
    const rng = w.rngState;
    expect(pickLesson(w, npc, playerVehicle(w))).toBe(first);
    expect(pickLesson(structuredClone(w), npc, playerVehicle(w))).toBe(first);
    expect(w.rngState).toBe(rng);
  });

  it('spreads the stories over drivers', () => {
    const w = emptyWorld();
    const v = playerVehicle(w);
    plateEverySide(w, v);
    const told = new Set(traders(w, 40).map((npc) => pickLesson(w, npc, v)));
    expect(told.size).toBeGreaterThan(1);
  });

  it('can change the story with the seed', () => {
    const w = emptyWorld();
    const npc = driver(w, ['trader']);
    const v = playerVehicle(w);
    plateEverySide(w, v);
    const told = new Set(Array.from({ length: 20 }, (_, seed) => pickLesson({ ...w, seed }, npc, v)));
    expect(told.size).toBeGreaterThan(1);
  });

  it('speaks a scumbag in the voice of its main trade', () => {
    const w = emptyWorld();
    expect(lessonTrade(driver(w, ['trader', 'scumbag']))).toBe('hauler');
    expect(lessonTrade(driver(w, ['scumbag', 'raider']))).toBe('raider');
    const trades: Record<string, LessonTrade> = { lawman: 'law', merc: 'gunHand', vulture: 'salvager' };
    for (const [trait, trade] of Object.entries(trades)) expect(lessonTrade(driver(w, [trait as TraitId]))).toBe(trade);
  });

  it('throws for a driver with no voiced trait', () => {
    const w = emptyWorld();
    expect(() => lessonTrade(driver(w, ['scumbag', 'coward']))).toThrow(/no trait/);
  });
});
