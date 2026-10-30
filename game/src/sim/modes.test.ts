import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GAME_MODES } from '../data/modes';
import { startKit } from '../data/start';
import { TEST_MAP } from '../test/map';
import { standardWorld } from '../test/world-cache';
import { defaultSetup, modeKit, modeMap, modeRules, modeRulesOf } from './settings';
import { highwayMap } from './highway';
import { chaosHighwayWorld } from './testkit';
import { newWorld } from './world';
import type { World } from './types';

function fingerprint(w: World): object {
  return {
    streams: [w.rngState, w.marketRng.rngState, w.nameRng.rngState, w.searchRng.rngState],
    nextId: w.nextId,
    counts: [w.vehicles.length, w.obstacles.length, w.salvage.length, Object.keys(w.shops).length],
    npcs: w.vehicles.slice(1, 4).map((v) => [v.brain?.templateId, Math.round(v.pos.x * 100) / 100, Math.round(v.pos.y * 100) / 100]),
    bowlStock: w.shops.bowl.stock.map((p) => p.defId),
  };
}

describe('game mode rules', () => {
  it('keeps every Roaming rule on and plays no run', () => {
    const world = standardWorld(7);
    const { run, ...open } = modeRules(world);

    expect(run).toBe(false);
    expect(Object.values(open).every((on) => on)).toBe(true);
  });

  it('turns every open-world rule but NPC knockouts off in a Chaos Highway world and plays a run', () => {
    const world = chaosHighwayWorld(7);
    const { run, npcKnockouts, ...open } = modeRules(world);

    expect(run).toBe(true);
    expect(npcKnockouts).toBe(true);
    expect(Object.values(open).some((on) => on)).toBe(false);
  });

  it('names each mode difference in its row', () => {
    expect(GAME_MODES.roaming).toEqual({
      rules: { traffic: true, looting: true, npcKnockouts: true, playerKnockouts: true, yielding: true, radio: true, rescue: true, roadWrecks: true, run: false, standing: true, bounties: true },
      kit: null,
      map: 'icarus',
      opening: null,
    });
    expect(GAME_MODES.chaosHighway).toEqual({
      rules: { traffic: false, looting: false, npcKnockouts: true, playerKnockouts: false, yielding: false, radio: false, rescue: false, roadWrecks: false, run: true, standing: false, bounties: false },
      kit: 'chaosHighway',
      map: 'highway',
      opening: 'chaos_highway_intro',
    });
  });

  it('reads a mode row before a world exists', () => {
    expect(modeMap('roaming')).toBe('icarus');
    expect(modeMap('chaosHighway')).toBe('highway');
    expect(modeRulesOf('chaosHighway')).toBe(GAME_MODES.chaosHighway.rules);
    expect(() => modeMap('chaos' as never)).toThrow(/Unknown game mode chaos/);
  });

  it('throws on a mode that is not a game mode', () => {
    const world = standardWorld(7);
    world.setup = { ...world.setup, mode: 'chaos' as never };

    expect(() => modeRules(world)).toThrow(/Unknown game mode chaos/);
  });

  it('gives Roaming the configured kit and Chaos Highway its own', () => {
    expect(modeKit('roaming', 'standard')).toBe('standard');
    expect(modeKit('chaosHighway', 'standard')).toBe('chaosHighway');
    expect(GAME_MODES.chaosHighway.kit).toBe('chaosHighway');
  });
});

describe('a new world by mode', () => {
  it('builds a Roaming world as before the Chaos Highway mode, with the Hollow filled at the start', () => {
    const world = standardWorld(7);

    expect(world.chaosHighway).toBeNull();
    expect(fingerprint(world)).toEqual({
      streams: [1943570185, 664763179, -1818829172, 1936023925],
      nextId: 2111,
      counts: [23, 6048, 128, 7],
      npcs: [['trader', 123.34, 576.86], ['trader', 118.79, 581.53], ['buggy', 417.59, 502.24]],
      bowlStock: ['spikeStrip', 'flamer', 'lightFrame', 'flamer', 'trailerBox', 'spacedArmor', 'smokeMortar', 'lightFrame', 'autocannon', 'plowRam', 'stockEngine'],
    });
  });

  it('starts a Chaos Highway world with no traffic, salvage, shops or road wrecks', () => {
    const world = chaosHighwayWorld(7);

    expect(world.vehicles.map((v) => v.faction)).toEqual(['player', 'player']);
    expect(world.salvage).toEqual([]);
    expect(world.shops).toEqual({});
    expect(world.obstacles.some((o) => /^wreck\d+$/.test(o.id))).toBe(false);
    expect(world.chaosHighway?.window).toBe(0);
  });

  it('gives the Chaos Highway player the Chaos Highway kit with no opening', () => {
    const world = chaosHighwayWorld(7);

    expect(world.player.money).toBe(80);
    expect(world.player.autoRepair).toBe(true);
    expect(world.vehicles[0].items.filter((it) => it.kind === 'good' && it.good === 'parts')).toHaveLength(1);
  });
});

describe('a world and its map', () => {
  it('refuses a Roaming world on a map with no towns', () => {
    expect(() => newWorld(7, startKit('standard'), highwayMap(7, 0), defaultSetup('roaming'))).toThrow(/needs towns/);
  });

  it('refuses a Chaos Highway world on Icarus', () => {
    expect(() => newWorld(7, startKit('chaosHighway'), TEST_MAP, defaultSetup('chaosHighway'))).toThrow(/starts on a highway/);
  });
});

const SOURCE = new URL('..', import.meta.url).pathname;
const MODE_LISTS = ['data/modes.ts', 'ui/new-game.ts', 'three/save-migrations.ts'];
const MODE_ID_CHECK = /[!=]==?\s*'(chaosHighway|roaming)'|'(chaosHighway|roaming)'\s*[!=]==?/;

function sourceFiles(): string[] {
  return readdirSync(SOURCE, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
    .filter((file) => !MODE_LISTS.includes(file.split('\\').join('/')));
}

describe('mode differences', () => {
  it('reads every mode difference from the mode table, never from a mode id', () => {
    const checks = sourceFiles().filter((file) => MODE_ID_CHECK.test(readFileSync(join(SOURCE, file), 'utf8')));

    expect(checks).toEqual([]);
  });
});
