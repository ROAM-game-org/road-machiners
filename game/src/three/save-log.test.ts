import { describe, expect, it } from 'vitest';
import { startKit } from '../data/start';
import { addVehicle } from '../sim/testkit';
import { mountedParts } from '../sim/grid';
import type { GameEvent, World } from '../sim/types';
import { defaultSetup } from '../sim/settings';
import { newWorld } from '../sim/world';
import { t, verbatim } from '../text/msg';
import { resolve } from '../text/resolve';
import { TEST_MAP } from '../test/map';
import { reusedWorld } from '../test/world-cache';
import { LOG_HISTORY, LogBook, readSavedLog } from '../ui/log';
import { eventEntry, leveled } from '../ui/log-levels';
import { loadWorld, savedLogOf, storedSave, writeSave } from './save';
import { memoryBackend, SaveSlots } from './save-db';

function startWorld(): World {
  return structuredClone(reusedWorld('standard', () => newWorld(1337, startKit('standard'), TEST_MAP, defaultSetup('roaming'))));
}

function fightLog(w: World, turns: number): LogBook {
  const me = w.vehicles.find((v) => v.id === w.player.vehicleId)!;
  const raider = addVehicle(w, 'scrapjaw', 'buggy', ['mg'], { x: me.pos.x + 4, y: me.pos.y });
  const cab = mountedParts(me).find((p) => p.defId.startsWith('cab'))!;
  const book = new LogBook();
  for (let turn = 1; turn <= turns; turn++) {
    const shot: GameEvent = {
      t: 'shot', shooter: raider.id, weapon: mountedParts(raider, 'weapon')[0].id, target: me.id, aim: 'body', chance: 0.5, damageChance: 0.5, side: 'front',
      rounds: [{ hit: true, crit: false, offset: 0, struck: me.id, hits: [{ part: cab.id, damage: 3 }], blast: [], burst: null }],
    };
    for (const entry of [eventEntry(w, shot)]) if (entry) book.add(turn, entry);
  }
  return book;
}

function saveWith(w: World, book: LogBook): SaveSlots {
  const slots = new SaveSlots(memoryBackend(), new Map());
  writeSave(slots, 'auto', w, 'run', 1, book.saved());
  return slots;
}

const texts = (book: LogBook) => book.lines.map((l) => [resolve(l.text, 'en'), resolve(l.text, 'ru'), l.reach]);

describe('the saved log', () => {
  it('reads back the same lines in both views, and loading awards nothing', () => {
    const w = startWorld();
    const book = fightLog(w, 30);
    const { money, xp } = w.player;
    const slots = saveWith(w, book);

    const loaded = loadWorld(slots, 'auto', TEST_MAP)!;
    const restored = LogBook.restored(readSavedLog(savedLogOf(storedSave(slots, 'auto'))));

    expect(texts(restored)).toEqual(texts(book));
    expect(restored.lines.length).toBe(book.lines.length);
    expect(loaded.player.money).toBe(money);
    expect(loaded.player.xp).toEqual(xp);
    expect(loaded.events).toEqual(w.events);
  });

  it('stays small with a full book of fight lines', () => {
    const w = startWorld();
    const book = fightLog(w, LOG_HISTORY * 2);
    expect(book.lines.length).toBe(LOG_HISTORY);
    expect(JSON.stringify(book.saved()).length).toBeLessThan(300_000);
  });

  it('drops the old Brief damage lines from a saved log and keeps the rest', () => {
    const w = startWorld();
    const saved = fightLog(w, 3).saved();
    const old = { turn: 3, level: 'attention', reach: 'brief', cls: 'bad', text: { key: 'log.hurtYours', params: {} } };
    const read = readSavedLog([old, ...saved]);
    expect(read).toHaveLength(saved.length);
    expect(read.every((p) => p.entry.reach !== ('brief' as string))).toBe(true);
  });

  it('reads a save with no log, or a broken one, as an empty log', () => {
    expect(readSavedLog(undefined)).toEqual([]);
    expect(readSavedLog({ lines: [] })).toEqual([]);
    expect(readSavedLog([{ turn: 'x' }, null, 7])).toEqual([]);
  });

  it('drops a line whose text is gone and keeps the rest', () => {
    const book = new LogBook();
    book.add(1, leveled({ text: t('log.death'), cls: 'bad' }, 'critical'));
    book.add(2, leveled({ text: verbatim('kept'), cls: '' }, 'notable'));
    const saved = book.saved();
    saved[1] = { ...saved[1], text: { key: 'log.noSuchLine' } };
    const restored = LogBook.restored(readSavedLog(JSON.parse(JSON.stringify(saved))));
    expect(restored.lines.map((l) => resolve(l.text, 'en'))).toEqual(['Day 1, 07:00 kept']);
  });
});
