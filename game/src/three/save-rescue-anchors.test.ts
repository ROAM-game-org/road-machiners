import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { START_KITS } from '../data/start';
import { chassisDef } from '../data/chassis';
import { REGION } from '../data/region';
import { CHEATS } from '../data/rules';
import { playerVehicle } from '../sim/damage';
import { hangUp } from '../sim/dialogue';
import { advanceFar } from '../sim/far';
import { isFree } from '../sim/spawn';
import { surveySites } from '../sim/survey';
import type { World } from '../sim/types';
import { dist, type Vec } from '../sim/vec';
import { TEST_MAP } from '../test/map';
import { endTurn } from '../sim/world';
import { loadWorld, savedMisfit, saveOf, stepsFrom } from './save';
import { memoryBackend, SaveSlots } from './save-db';
import { readCarried } from './save-rescue';

const ANCHOR_DIR = join(__dirname, 'save-fixtures/anchors');

const FOLDS_TO_THE_WORLD_OF_61 = '2-62-roaming.json';

const reachable = readdirSync(ANCHOR_DIR).filter((file) => file.endsWith('-roaming.json') && file !== FOLDS_TO_THE_WORLD_OF_61 && stepsFrom(Number(file.split('-')[1])) !== null);

describe('a shipped save on an older bake of the map', () => {
  it('has anchors to load', () => {
    expect(reachable).toContain('2-63-roaming.json');
  });

  it.each(reachable)('loads %s onto the current map with its place and progress kept', (file) => {
    const envelope = JSON.parse(readFileSync(join(ANCHOR_DIR, file), 'utf8')) as { format: { minor: number }; world: World & { vehicles: { id: string; pos: Vec }[] } };
    const slots = new SaveSlots(memoryBackend(), new Map());
    slots.put('auto', envelope);
    const saved = envelope.world;
    const world = loadWorld(slots, 'auto', TEST_MAP)!;

    expect(world.size).toBe(TEST_MAP.terrain.size);
    expect(world.mapHash).toBe(TEST_MAP.hash);
    expect(world.player.explored).toHaveLength(world.size ** 2);
    expect(world.events).toEqual([]);

    const me = playerVehicle(world);
    const radius = chassisDef(me.chassisId).radius;
    const oldPos = saved.vehicles.find((v) => v.id === saved.player.vehicleId)!.pos;
    const ratio = world.size / saved.size;
    const target = { x: oldPos.x * ratio, y: oldPos.y * ratio };
    expect(isFree(world, me.pos, radius, me.id)).toBe(true);
    if (isFree(world, target, radius, me.id)) expect(me.pos).toEqual(target);
    else expect(dist(me.pos, target)).toBeLessThanOrEqual(CHEATS.searchRings * CHEATS.searchStep);
    for (const v of world.vehicles) expect(isFree(world, v.pos, chassisDef(v.chassisId).radius, v.id), v.id).toBe(true);

    const carried = readCarried(envelope);
    expect(world.player.money).toBe(carried.money);
    expect(world.player.xp).toBe(carried.xp);
    const known = new Set([...REGION.towns, ...REGION.locations].map((site) => site.id));
    expect(world.player.discovered).toEqual(expect.arrayContaining(carried.discovered.filter((id) => known.has(id))));
    const held = (parts: { defId: string }[], items: { kind: string; part?: { defId: string } }[]) => [...parts.map((p) => p.defId), ...items.flatMap((it) => (it.part ? [it.part.defId] : []))].sort();
    expect(held(world.player.storage, me.items)).toEqual(held(carried.storage, carried.truck!.items));

    const stocks = new Set(world.salvage.map((s) => s.id));
    const sites = new Set(surveySites(TEST_MAP).map((s) => s.id));
    const contracts = [...world.player.contracts, ...Object.values(world.shops).flatMap((s) => s.contracts)];
    for (const c of contracts) {
      if (c.kind === 'claim') expect(stocks.has(c.stockId), c.id).toBe(true);
      if (c.kind === 'survey') expect(c.points.every((p) => sites.has(p.site)), c.id).toBe(true);
    }
    const kept = new Set(world.player.contracts.map((c) => c.id));
    const droppedByStep103 = new Set(['claim', 'fetch', 'bounty']);
    expect(saved.player.contracts.filter((c) => !kept.has(c.id) && !droppedByStep103.has(c.kind))).toEqual([]);
    for (const id of [...world.player.scavenged, ...world.player.rumored].filter((x) => /^(wreck|old-|story-)/.test(x))) expect(stocks.has(id), id).toBe(true);
  }, 60_000);

  it.each(reachable)('plays 20 turns of %s without a throw or a stall', (file) => {
    const slots = new SaveSlots(memoryBackend(), new Map());
    slots.put('auto', JSON.parse(readFileSync(join(ANCHOR_DIR, file), 'utf8')));
    let w = loadWorld(slots, 'auto', TEST_MAP)!;
    const start = w.turn;
    for (let i = 0; i < 20; i++) {
      w = endTurn(w.player.call ? hangUp(w) : w, (d) => d.vehicles.forEach((v) => v.brain && advanceFar(d, v)));
      expect(w.events.filter((e) => e.t === 'stall')).toEqual([]);
    }
    expect(w.turn).toBe(start + 20);
    expect(savedMisfit(saveOf(w).world)).toBeNull();
  }, 120_000);

  it('loads a shipped save after a rebake and a removed chassis together', () => {
    const envelope = JSON.parse(readFileSync(join(ANCHOR_DIR, '2-63-roaming.json'), 'utf8')) as { world: { player: { vehicleId: string }; vehicles: { id: string; chassisId: string }[] } };
    for (const v of envelope.world.vehicles) v.chassisId = 'ghostChassis';
    const slots = new SaveSlots(memoryBackend(), new Map());
    slots.put('auto', envelope);

    const world = loadWorld(slots, 'auto', TEST_MAP)!;

    const me = playerVehicle(world);
    expect(me.chassisId).toBe(START_KITS.standard.chassis);
    expect(isFree(world, me.pos, chassisDef(me.chassisId).radius, me.id)).toBe(true);
    expect(() => endTurn(world, () => {})).not.toThrow();
  }, 60_000);
});
