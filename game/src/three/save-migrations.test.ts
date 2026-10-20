import { describe, expect, it } from 'vitest';
import { CHASSIS } from '../data/chassis';
import { propPose } from '../sim/mapgen';
import { baseGrid, isMounted, placementError } from '../sim/grid';
import { choosePerk, pendingPerkPairs, skillLevel } from '../sim/progress';
import { emptyWorld } from '../sim/testkit';
import type { Obstacle, Player, Vehicle, WeatherEvent, World } from '../sim/types';
import { stormStrength, weatherAt, weatherOn } from '../sim/weather';
import { ECONOMY } from '../data/goods';
import { pressureOf, priceAtPressure } from '../sim/market';
import FORMAT_2_0 from './save-fixtures/format-2-0.json';
import FORMAT_2_1 from './save-fixtures/format-2-1.json';
import FORMAT_2_2 from './save-fixtures/format-2-2.json';
import FORMAT_2_3 from './save-fixtures/format-2-3.json';
import FORMAT_2_4 from './save-fixtures/format-2-4.json';
import FORMAT_2_5 from './save-fixtures/format-2-5.json';
import FORMAT_2_6 from './save-fixtures/format-2-6.json';
import FORMAT_2_7 from './save-fixtures/format-2-7.json';
import FORMAT_2_8 from './save-fixtures/format-2-8.json';
import FORMAT_2_9 from './save-fixtures/format-2-9.json';
import FORMAT_2_10 from './save-fixtures/format-2-10.json';
import FORMAT_2_11 from './save-fixtures/format-2-11.json';
import FORMAT_2_12 from './save-fixtures/format-2-12.json';
import FORMAT_2_13 from './save-fixtures/format-2-13.json';
import FORMAT_2_14 from './save-fixtures/format-2-14.json';
import FORMAT_2_15 from './save-fixtures/format-2-15.json';
import FORMAT_2_16 from './save-fixtures/format-2-16.json';
import FORMAT_2_17 from './save-fixtures/format-2-17.json';
import FORMAT_2_18 from './save-fixtures/format-2-18.json';
import FORMAT_2_19 from './save-fixtures/format-2-19.json';
import FORMAT_2_20 from './save-fixtures/format-2-20.json';
import FORMAT_2_21 from './save-fixtures/format-2-21.json';
import FORMAT_2_22 from './save-fixtures/format-2-22.json';
import FORMAT_2_23 from './save-fixtures/format-2-23.json';
import FORMAT_2_24 from './save-fixtures/format-2-24.json';
import FORMAT_2_25 from './save-fixtures/format-2-25.json';
import FORMAT_2_26 from './save-fixtures/format-2-26.json';
import FORMAT_2_27 from './save-fixtures/format-2-27.json';
import FORMAT_2_28 from './save-fixtures/format-2-28.json';
import FORMAT_2_29 from './save-fixtures/format-2-29.json';
import FORMAT_2_30 from './save-fixtures/format-2-30.json';
import FORMAT_2_41 from './save-fixtures/format-2-41.json';
import FORMAT_2_42 from './save-fixtures/format-2-42.json';
import { LAYOUTS_2_34 } from './save-layouts-2-34';
import SAVE_SHAPE from './save-shape.json';
import FORMAT_2_31 from './save-fixtures/format-2-31.json';
import FORMAT_2_32 from './save-fixtures/format-2-32.json';
import FORMAT_2_33 from './save-fixtures/format-2-33.json';
import FORMAT_2_35 from './save-fixtures/format-2-35.json';
import FORMAT_2_36 from './save-fixtures/format-2-36.json';
import { STORY_WRECKS } from '../data/salvage';
import FORMAT_2_43 from './save-fixtures/format-2-43.json';
import FORMAT_2_44 from './save-fixtures/format-2-44.json';
import FORMAT_2_47 from './save-fixtures/format-2-47.json';
import FORMAT_2_48 from './save-fixtures/format-2-48.json';
import FORMAT_2_49 from './save-fixtures/format-2-49.json';
import FORMAT_2_50 from './save-fixtures/format-2-50.json';
import FORMAT_2_51 from './save-fixtures/format-2-51.json';
import FORMAT_2_52 from './save-fixtures/format-2-52.json';
import FORMAT_2_53 from './save-fixtures/format-2-53.json';
import FORMAT_2_54 from './save-fixtures/format-2-54.json';
import FORMAT_2_55 from './save-fixtures/format-2-55.json';
import FORMAT_2_56 from './save-fixtures/format-2-56.json';
import FORMAT_2_57 from './save-fixtures/format-2-57.json';
import FORMAT_2_58 from './save-fixtures/format-2-58.json';
import FORMAT_2_59 from './save-fixtures/format-2-59.json';
import FORMAT_2_60 from './save-fixtures/format-2-60.json';
import FORMAT_2_61 from './save-fixtures/format-2-61.json';
import FORMAT_2_62 from './save-fixtures/format-2-62.json';
import FORMAT_2_64 from './save-fixtures/format-2-64.json';
import FORMAT_2_67 from './save-fixtures/format-2-67.json';
import FORMAT_2_68 from './save-fixtures/format-2-68.json';
import FORMAT_2_69 from './save-fixtures/format-2-69.json';
import FORMAT_2_70 from './save-fixtures/format-2-70.json';
import FORMAT_2_71 from './save-fixtures/format-2-71.json';
import FORMAT_2_72 from './save-fixtures/format-2-72.json';
import FORMAT_2_73 from './save-fixtures/format-2-73.json';
import FORMAT_2_75 from './save-fixtures/format-2-75.json';
import FORMAT_2_74 from './save-fixtures/format-2-74.json';
import FORMAT_2_82 from './save-fixtures/format-2-82.json';
import { CORES_2_2, LAYOUTS_2_2 } from './save-layouts-2-2';
import { searchStream } from '../sim/search';
import { packExplored } from './save';
import { dropQuest, dropQuestVar, endQuestSession, MIGRATIONS, moveQuestCheckpoint, pooledSkills_9_10, renameQuestVar, type SavedJson } from './save-migrations';
import FORMAT_2_37 from './save-fixtures/format-2-37.json';
import FORMAT_2_38 from './save-fixtures/format-2-38.json';
import FORMAT_2_39 from './save-fixtures/format-2-39.json';
import FORMAT_2_40 from './save-fixtures/format-2-40.json';

describe('save migrations', () => {
  it('0 to 1 gives the player townPatched false and keeps every other field', () => {
    const next = MIGRATIONS[0](FORMAT_2_0);

    expect(next).toEqual({ ...FORMAT_2_0, player: { ...FORMAT_2_0.player, townPatched: false } });
  });
});

describe('save migration 1 to 2', () => {
  type Saved = { player: { vehicleId: string; money: number; storage: { id: string; defId: string }[] }; vehicles: Vehicle[]; removed: Vehicle[] };
  const next = MIGRATIONS[1](FORMAT_2_1) as Saved;
  const all = [...next.vehicles, ...next.removed];
  const vehicle = (id: string) => all.find((v) => v.id === id)!;
  const spot = (v: Vehicle, id: string) => {
    const item = v.items.find((it) => it.id === id);
    return item && [item.x, item.y, item.rot];
  };

  it('puts every core of every chassis on its new cells with its new part, keeping ids, hp and wear', () => {
    for (const v of all.filter((it) => it.id.startsWith('c-') || it.id === 'gone-carrier')) {
      for (const c of CORES_2_2[v.chassisId].filter((core) => !core.defId.startsWith('wheel'))) {
        const item = v.items.find((it) => it.kind === 'part' && it.x === c.x && it.y === c.y && it.part.defId === c.defId);
        expect(item, `${v.id} ${c.defId}`).toBeDefined();
        expect(item?.rot, `${v.id} ${c.defId}`).toBe(c.rot ?? 0);
        if (item?.kind === 'part') expect([item.part.hp, item.part.wear]).toEqual([10, 0]);
      }
    }
    expect(vehicle('c-carrier').items.find((it) => it.id === 'c0')).toMatchObject({ id: 'c0', part: { id: 'pc0', defId: 'cabPickup' } });
    expect(vehicle('c-bus').items.find((it) => it.id === 'c0')).toMatchObject({ x: 2, y: 1, rot: 0, part: { defId: 'cabPickup' } });
  });

  it('moves a displaced item to the nearest free deck spot, turning it if needed', () => {
    expect(spot(vehicle('c-van'), 'mg')).toEqual([1, 4, 0]);
    expect(spot(next.vehicles[2], 'rack')).toEqual([5, 4, 0]);
  });

  it('keeps the guns, goods and armor that stood clear of the new cores', () => {
    const scout = next.vehicles[0];
    expect(spot(scout, 'mg')).toEqual([4, 1, 0]);
    expect(spot(scout, 'g6')).toEqual([1, 3, 0]);
    expect(spot(scout, 'front')).toEqual([3, 0, 1]);
    expect(spot(scout, 'cab')).toEqual([2, 3, 0]);
  });

  it('sends the player part with no room to the garage, turns the good into cash, and drops what an NPC had with no room', () => {
    const scout = next.vehicles[0];
    expect(spot(scout, 'mg2')).toBeUndefined();
    expect(spot(scout, 'gr')).toBeUndefined();
    expect(next.player.storage.map((p) => p.defId)).toEqual(['mg']);
    expect(next.player.money).toBe(100 + 21);
    expect(spot(next.vehicles[1], 'cannon')).toBeUndefined();
    expect(spot(vehicle('gone-carrier'), 'gd')).toEqual([5, 1, 0]);
  });

  it('cancels the refit job of every migrated truck', () => {
    expect(next.vehicles[0].job).toBeNull();
    expect(next.vehicles[1].job).toBeNull();
  });

  it('leaves other world fields alone', () => {
    expect(next.player.vehicleId).toBe(FORMAT_2_1.player.vehicleId);
    expect(next.vehicles.length).toBe(FORMAT_2_1.vehicles.length);
    expect(next.removed.length).toBe(FORMAT_2_1.removed.length);
  });

  it('holds copies of the layouts and cores that equal the live chassis data', () => {
    for (const c of Object.values(CHASSIS).filter((it) => LAYOUTS_2_2[it.id])) {
      expect(LAYOUTS_2_2[c.id], c.id).toEqual(c.layout);
      expect(CORES_2_2[c.id], c.id).toEqual(c.core.filter((k) => !k.defId.startsWith('wheel')).map((k) => ({ defId: k.defId, x: k.x, y: k.y, rot: k.rot ?? 0 })));
    }
  });

  it('puts every item of every truck on a free cell, and every non-core part still mounted', () => {
    const wide = (item: { kind: string; part?: { defId: string } }) => item.kind === 'part' && item.part?.defId === 'mg';
    for (const v of all) {
      const grid = baseGrid(v.chassisId);
      const others = v.items.filter((it) => !wide(it));
      others.forEach((item, i) => {
        expect(placementError(grid, others.filter((_, j) => j !== i), item, null), `${v.id} ${item.id}`).toBeNull();
        if (item.kind === 'part' && !['rack', 'cannon'].includes(item.part.defId)) expect(isMounted(v.chassisId, item), `${v.id} ${item.id}`).toBe(true);
      });
    }
  });
});

describe('save migration 2 to 3', () => {
  it('gives the player aid XP 0 and keeps every other XP source and field', () => {
    const next = MIGRATIONS[2](FORMAT_2_2);

    expect(next).toEqual({
      ...FORMAT_2_2,
      player: { ...FORMAT_2_2.player, xpBySource: { ...FORMAT_2_2.player.xpBySource, aid: 0 } },
    });
  });
});

describe('save migration 3 to 4', () => {
  it('packs explored into the same bitset a new save writes and keeps other fields', () => {
    const next = MIGRATIONS[3](FORMAT_2_3) as { player: Record<string, unknown>; turn: number };

    expect(next.player.explored).toBe(packExplored(Uint8Array.from(FORMAT_2_3.player.explored)));
    expect(next).toEqual({ ...FORMAT_2_3, player: { ...FORMAT_2_3.player, explored: next.player.explored } });
  });

  it('throws on a value other than 0 or 1', () => {
    expect(() => MIGRATIONS[3]({ player: { explored: [0, 2] } })).toThrow();
  });
});

describe('save migration 4 to 5', () => {
  type Saved = { kind: string; window?: number; rush?: boolean };
  const next = MIGRATIONS[4](FORMAT_2_4) as unknown as {
    turn: number;
    player: { money: number; contracts: Saved[] };
    shops: { nose: { contracts: Saved[] } };
  };

  it('gives every held and posted contract a window equal to the time it has left', () => {
    expect(next.player.contracts.map((c) => c.window)).toEqual([400, 1]);
    expect(next.shops.nose.contracts.map((c) => c.window)).toEqual([300, 700]);
  });

  it('marks every haul as no rush and leaves the other kinds without the flag', () => {
    const all = [...next.player.contracts, ...next.shops.nose.contracts] as Saved[];
    for (const c of all) expect('rush' in c).toBe(c.kind === 'haul');
    for (const c of all.filter((c) => c.kind === 'haul')) expect(c.rush).toBe(false);
  });

  it('changes nothing else', () => {
    const strip = (cs: Saved[]) => cs.map(({ window: _w, rush: _r, ...rest }) => rest);
    expect(strip(next.player.contracts)).toEqual(FORMAT_2_4.player.contracts);
    expect(strip(next.shops.nose.contracts)).toEqual(FORMAT_2_4.shops.nose.contracts);
    expect(next.turn).toBe(FORMAT_2_4.turn);
    expect(next.player.money).toBe(FORMAT_2_4.player.money);
  });
});

describe('save migration 5 to 6', () => {
  it('gives every aid state an unstarted one-turn handover and leaves other states alone', () => {
    const next = MIGRATIONS[5](FORMAT_2_5) as { states: { data: object }[] };

    expect(next.states[0].data).toEqual({ ...FORMAT_2_5.states[0].data, started: false, work: 1, workLeft: 1 });
    expect(next.states[1]).toEqual(FORMAT_2_5.states[1]);
  });
});

describe('save migration 6 to 7', () => {
  it('marks a defeat as gave up only for a driver out with a working cab', () => {
    const next = MIGRATIONS[6](FORMAT_2_6) as { vehicles: { defeat?: { gaveUp: boolean } }[] };
    const [gaveUp, knocked, retreating, free] = next.vehicles;

    expect(gaveUp.defeat).toEqual({ ...FORMAT_2_6.vehicles[0].defeat, gaveUp: true });
    expect(knocked.defeat?.gaveUp).toBe(false);
    expect(retreating.defeat?.gaveUp).toBe(false);
    expect(free).toEqual(FORMAT_2_6.vehicles[3]);
  });
});

describe('save migration 7 to 8', () => {
  const next = MIGRATIONS[7](FORMAT_2_7) as { salvage: { id: string }[]; player: { scavenged: string[] }; vehicles: { job: { stockId: string } | null }[] };

  it('drops the Fallen Sun stock and its searched mark, and keeps every other stock', () => {
    expect(next.salvage.map((stock) => stock.id)).toEqual(['wreck3']);
    expect(next.player.scavenged).toEqual(['wreck3']);
  });

  it('ends a search of the old stock and keeps other searches', () => {
    expect(next.vehicles[0].job).toBeNull();
    expect(next.vehicles[1]).toEqual(FORMAT_2_7.vehicles[1]);
  });
});

describe('save migration 8 to 9', () => {
  const next = MIGRATIONS[8](FORMAT_2_8) as { salvage: { id: string }[]; player: { scavenged: string[] }; vehicles: { job: { stockId: string } | null }[] };

  it('drops the Old Orchard stock and its searched mark, and keeps every other stock', () => {
    expect(next.salvage.map((stock) => stock.id)).toEqual(['wreck3']);
    expect(next.player.scavenged).toEqual(['wreck3']);
  });

  it('ends a search of the old stock and keeps other searches', () => {
    expect(next.vehicles[0].job).toBeNull();
    expect(next.vehicles[1]).toEqual(FORMAT_2_8.vehicles[1]);
  });
});

describe('save migration 9 to 10', () => {
  const reach = [0, 200, 600, 1200, 2000, 3000];
  const migrated = () => MIGRATIONS[9](FORMAT_2_9) as { player: Pick<Player, 'xp' | 'ranks' | 'perks'> & Record<string, unknown> };

  it('turns each old level into the same rank, at 0, mid level, on a threshold and past the top', () => {
    expect(migrated().player.ranks).toEqual({ driving: 0, perception: 1, machining: 2, toughness: 5, social: 3 });
  });

  it('keeps every earned XP: the pool holds what the ranks did not cost', () => {
    const { xp, ranks } = migrated().player;
    const spent = Object.values(ranks).reduce((sum, rank) => sum + reach[rank], 0);
    const earned = Object.values(FORMAT_2_9.player.skills).reduce((sum, n) => sum + n, 0);
    expect(xp).toBe(250 + 500 + 799);
    expect(xp + spent).toBe(earned);
  });

  it('removes skills and leaves perks, daily XP, repeats and XP per source as they were', () => {
    const next = migrated();
    const kept = Object.fromEntries(Object.entries(FORMAT_2_9.player).filter(([key]) => key !== 'skills'));
    expect(next).toEqual({ ...FORMAT_2_9, player: { ...kept, xp: next.player.xp, ranks: next.player.ranks } });
    expect(next.player).not.toHaveProperty('skills');
  });

  it('pools a skill map the same way for the rescue', () => {
    expect(pooledSkills_9_10(FORMAT_2_9.player.skills)).toEqual({ xp: migrated().player.xp, ranks: migrated().player.ranks });
  });

  it('keeps owned perks valid and opens the pairs the old levels reached', () => {
    const w = emptyWorld();
    const { xp, ranks, perks } = migrated().player;
    Object.assign(w.player, { xp, ranks, perks: [...perks] });
    expect(skillLevel(w, 'toughness')).toBe(5);
    expect(pendingPerkPairs(w).map((pair) => `${pair.skill} ${pair.level}`)).toEqual(['toughness 4', 'social 2']);
    expect(() => choosePerk(w, 'cannibal')).toThrow(/already picked/);
    expect(choosePerk(w, 'rumorMill').player.perks).toContain('rumorMill');
  });
});

describe('save migration 10 to 11', () => {
  const next = MIGRATIONS[10](FORMAT_2_10) as { obstacles: Obstacle[] };

  it('keeps the world as it was', () => {
    expect(next).toEqual(FORMAT_2_10);
  });

  it('leaves an old kill wreck without a hulk, so it draws as the generic wreck', () => {
    const kill = next.obstacles.find((o) => o.id === 'wreck-npc7');

    expect(kill).toBeDefined();
    expect(kill && 'hulk' in kill).toBe(false);
    expect(kill && propPose(kill).model).toBe('wreck');
  });
});

describe('save migration 11 to 12', () => {
  type Brain = { lastTown?: string; memories: unknown[] } | null;
  const next = MIGRATIONS[11](FORMAT_2_11) as { vehicles: { brain: Brain }[]; removed: { brain: Brain }[] };
  const noseMemory = { turn: 900, fact: { kind: 'prices', shop: 'nose', pressure: { salt: -0.2, scrap: 0.1 } } };

  it('turns a last town into a memory of its saved prices, on the saved turn', () => {
    expect(next.vehicles[1].brain!.memories).toEqual([noseMemory]);
    expect(next.removed[0].brain!.memories).toEqual([noseMemory]);
  });

  it('copies the saved pressure rather than sharing it', () => {
    const memory = next.vehicles[1].brain!.memories[0] as typeof noseMemory;
    expect(memory.fact.pressure).not.toBe(FORMAT_2_11.shops.nose.pressure);
  });

  it('gives an empty memory to a brain without a last town or with an unknown one', () => {
    expect(next.vehicles[2].brain!.memories).toEqual([]);
    expect(next.vehicles[3].brain!.memories).toEqual([]);
  });

  it('drops lastTown from every brain and leaves a missing brain alone', () => {
    for (const v of [...next.vehicles, ...next.removed]) expect(v.brain && 'lastTown' in v.brain).toBeFalsy();
    expect(next.vehicles[0]).toEqual(FORMAT_2_11.vehicles[0]);
    expect(next.vehicles[2].brain).toEqual({ ...FORMAT_2_11.vehicles[2].brain, memories: [] });
  });
});

describe('save migration 12 to 13', () => {
  it('gives the player the headlight switch off and keeps every other field', () => {
    const next = MIGRATIONS[12](FORMAT_2_12);

    expect(next).toEqual({ ...FORMAT_2_12, player: { ...FORMAT_2_12.player, headlights: false } });
  });
});

describe('save migration 13 to 14', () => {
  const before = structuredClone(FORMAT_2_13);
  const next = MIGRATIONS[13](FORMAT_2_13) as { states: { data: { partIds?: string[] } }[] };

  it('gives a patch the ids of its client parts at 0 HP, in item order', () => {
    expect(next.states[0].data.partIds).toEqual(['p1', 'p2']);
  });

  it('gives a patch whose client is gone an empty list', () => {
    expect(next.states[1].data.partIds).toEqual([]);
  });

  it('leaves other states alone and does not mutate its input', () => {
    expect(next.states[2]).toEqual(FORMAT_2_13.states[2]);
    expect(FORMAT_2_13).toEqual(before);
  });
});

describe('save migration 14 to 15', () => {
  it('keeps a defeated driver on its retreat as it is, so it lies up when it gets home', () => {
    expect(MIGRATIONS[14](structuredClone(FORMAT_2_14))).toEqual(FORMAT_2_14);
  });
});

describe('save migration 15 to 16', () => {
  it('adds no craters and gives every shot and guard round a null burst, changing nothing else', () => {
    const next = MIGRATIONS[15](FORMAT_2_15);
    const [shot, guard, arrived] = FORMAT_2_15.events;
    const burstless = (rounds: object[]) => rounds.map((round) => ({ ...round, burst: null }));

    expect(next).toEqual({
      ...FORMAT_2_15,
      craters: [],
      events: [{ ...shot, rounds: burstless(shot.rounds!) }, { ...guard, rounds: burstless(guard.rounds!) }, arrived],
    });
  });
});

describe('save migration 16 to 17', () => {
  const next = MIGRATIONS[16](FORMAT_2_16) as { turn: number; weather: WeatherEvent[] };

  it('gives a storm a birth turn past its build-up and changes nothing else', () => {
    expect(next).toEqual({ ...FORMAT_2_16, weather: [{ ...FORMAT_2_16.weather[0], born: 470 }, FORMAT_2_16.weather[1]] });
  });

  it('leaves a storm with a long way to go at full strength', () => {
    const storm = next.weather[0];
    if (storm.kind !== 'storm') throw new Error('expected the storm first');
    expect(stormStrength(next as unknown as World, storm)).toBe(1);
  });
});

describe('save migration 17 to 18', () => {
  const next = MIGRATIONS[17](FORMAT_2_17) as unknown as World;
  const shares = (id: string) => next.vehicles.find((v) => v.id === id)!.stormExposure;

  it('gives each truck the share each storm has settled to where it stands, and nothing outside', () => {
    expect(shares('v-centre')).toEqual({ wx1: 1 });
    expect(shares('v-edge').wx1).toBeCloseTo(0.5);
    expect(Object.keys(shares('v-edge'))).toEqual(['wx1']);
    expect(shares('v-building').wx2).toBeCloseTo(11 / 30);
    expect(shares('v-out')).toEqual({});
  });

  it('gives a removed truck no shares and changes nothing else', () => {
    expect(next.removed[0].stormExposure).toEqual({});
    const strip = (vs: Vehicle[]) => vs.map((v) => Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'stormExposure')));
    expect({ ...next, vehicles: strip(next.vehicles), removed: strip(next.removed) }).toEqual(FORMAT_2_17);
  });

  it('loads every truck feeling exactly the settled weather where it stands', () => {
    for (const v of next.vehicles) expect(weatherOn(next, v), v.id).toEqual(weatherAt(next, v.pos));
  });
});

describe('save migration 18 to 19', () => {
  const next = MIGRATIONS[18](FORMAT_2_18);

  it('marks every far route of a truck in play or removed as planned with roads', () => {
    const route = (v: (typeof FORMAT_2_18.vehicles)[number]) => ({ ...v, brain: { ...v.brain, farRoute: { ...v.brain!.farRoute, offRoad: false } } });
    expect(next).toEqual({
      ...FORMAT_2_18,
      vehicles: [FORMAT_2_18.vehicles[0], route(FORMAT_2_18.vehicles[1]), FORMAT_2_18.vehicles[2]],
      removed: [route(FORMAT_2_18.removed[0])],
    });
  });
});

describe('save migration 19 to 20', () => {
  it('drops guard shots, guard kill credit and the gate a driver was shot by, and keeps every other field', () => {
    const next = MIGRATIONS[19](FORMAT_2_19);

    expect(next).toEqual({
      ...FORMAT_2_19,
      events: [FORMAT_2_19.events[0], FORMAT_2_19.events[2]],
      vehicles: [{ id: 'player', lastHitBy: null }, FORMAT_2_19.vehicles[1], { id: 'npc-4', lastHitBy: null, brain: { goals: [] } }],
      removed: [{ id: 'npc-8', lastHitBy: null }, FORMAT_2_19.removed[1]],
    });
  });
});

describe('save migration 20 to 21', () => {
  it('stamps every flee goal with the save turn and keeps every other field', () => {
    const next = MIGRATIONS[20](FORMAT_2_20);
    const [player, runner, fighter] = FORMAT_2_20.vehicles;
    const fled = (g: { kind: string }) => (g.kind === 'flee' ? { ...g, perceived: 620 } : g);

    expect(next).toEqual({
      ...FORMAT_2_20,
      vehicles: [player, { ...runner, brain: { goals: runner.brain!.goals.map(fled) } }, fighter],
      removed: [{ ...FORMAT_2_20.removed[0], brain: { goals: FORMAT_2_20.removed[0].brain.goals.map(fled) } }],
    });
  });
});

describe('save migration 21 to 22', () => {
  it('gives every fight goal a fresh wear window from the save turn and keeps every other field', () => {
    const next = MIGRATIONS[21](FORMAT_2_21);
    const [player, raider, runner] = FORMAT_2_21.vehicles;
    const worn = (g: { kind: string }) => (g.kind === 'fight' ? { ...g, worn: { turn: 700, condition: 1 } } : g);

    expect(next).toEqual({
      ...FORMAT_2_21,
      vehicles: [player, { ...raider, brain: { goals: raider.brain!.goals.map(worn) } }, runner],
      removed: [{ ...FORMAT_2_21.removed[0], brain: { goals: FORMAT_2_21.removed[0].brain.goals.map(worn) } }],
    });
  });
});

describe('save migration 22 to 23', () => {
  it('turns noted hostiles and fight or flee targets into tracks, and keeps every other field', () => {
    const next = MIGRATIONS[22](FORMAT_2_22) as typeof FORMAT_2_22;
    const [player, raider, runner] = FORMAT_2_22.vehicles;
    const [raid, fight] = raider.brain!.goals;
    const { perceived: _, ...untimedFight } = fight;
    const robbery = FORMAT_2_22.removed[0].brain.goals[0];
    const { perceived: __, ...untimedRobbery } = robbery;

    expect(next).toEqual({
      ...FORMAT_2_22,
      vehicles: [
        player,
        {
          ...raider,
          brain: {
            noticed: { 'preySeen:npc-5': 799 },
            goals: [raid, untimedFight],
            tracks: {
              player: { at: { x: 30, y: 30 }, turn: 797, sighted: true, choice: 'fight', chosenInSight: true },
              'npc-5': { at: { x: 10, y: 12 }, turn: 797, sighted: false, choice: 'keep', chosenInSight: false },
            },
          },
        },
        { ...runner, brain: { ...runner.brain, tracks: { 'npc-2': { at: { x: 40, y: 40 }, turn: 799, sighted: true, choice: 'flee', chosenInSight: true } } } },
      ],
      removed: [
        {
          ...FORMAT_2_22.removed[0],
          brain: { noticed: {}, goals: [untimedRobbery], tracks: { 'npc-5': { at: { x: 10, y: 12 }, turn: 790, sighted: true, choice: 'fight', chosenInSight: true } } },
        },
      ],
    });
  });
});

describe('save migration 23 to 24', () => {
  it('marks every track out of sight and keeps every other field', () => {
    const next = MIGRATIONS[23](FORMAT_2_23) as typeof FORMAT_2_23;
    const [player, runner] = FORMAT_2_23.vehicles;
    const tracks = runner.brain!.tracks;

    expect(next).toEqual({
      ...FORMAT_2_23,
      vehicles: [player, { ...runner, brain: { ...runner.brain, tracks: { player: { ...tracks.player, seenSince: null }, 'npc-5': { ...tracks['npc-5'], seenSince: null } } } }],
    });
  });
});

describe('save migration 24 to 25', () => {
  const before = structuredClone(FORMAT_2_24);

  it('does not mutate its input', () => {
    MIGRATIONS[24](FORMAT_2_24);
    expect(FORMAT_2_24).toEqual(before);
  });

  it('drops the circles of the fortress sites and the Bowl and Nose buildings, and keeps every other obstacle', () => {
    const next = MIGRATIONS[24](FORMAT_2_24) as { obstacles: { id: string }[] };

    expect(next.obstacles.map((o) => o.id)).toEqual(['site-old-mill', 'bld-dustwell-1', 'cw-convoy-0', 'wreck4']);
    expect(next.obstacles[0]).toEqual(FORMAT_2_24.obstacles[5]);
  });

  it('drops both obsolete oasis ponds but keeps water elsewhere', () => {
    const world = { ...FORMAT_2_24, obstacles: [
      { id: 'pond-dustwell' }, { id: 'pond-green-pit' }, { id: 'pond-old-mill' }, { id: 'lake-west' },
    ] };
    const next = MIGRATIONS[24](world) as { obstacles: { id: string }[] };
    expect(next.obstacles.map((o) => o.id)).toEqual(['pond-old-mill', 'lake-west']);
  });

  it('drops the old salvage yard wrecks, which a fortress yard no longer has', () => {
    const world = { ...FORMAT_2_24, obstacles: [{ id: 'cw-salvage-yard-0' }, { id: 'cw-convoy-0' }] };
    const next = MIGRATIONS[24](world) as { obstacles: { id: string }[] };

    expect(next.obstacles.map((o) => o.id)).toEqual(['cw-convoy-0']);
  });
});

describe('save migration 25 to 26', () => {
  type Loot = { goods: Partial<Record<string, number>>; parts: unknown[]; fuel?: number; supplies?: number };
  type Stock = Loot & { id: string; hidden: Loot };
  type Saved = {
    vehicles: { id: string; utilityOrders: object }[];
    removed: { id: string; utilityOrders: object }[];
    smoke: unknown[];
    fields: unknown[];
    flares: unknown[];
    lines: unknown[];
    searchRng: { rngState: number };
    salvage: Stock[];
  };
  const next = MIGRATIONS[25](FORMAT_2_25) as Saved;
  const stock = (id: string) => next.salvage.find((s) => s.id === id)!;
  const before = (id: string) => FORMAT_2_25.salvage.find((s) => s.id === id)!;
  const NO_HIDDEN = { goods: {}, parts: [], fuel: 0, supplies: 0 };

  it('gives the player the freeze switch, off', () => {
    expect((next as unknown as { player: object }).player).toEqual({ ...FORMAT_2_25.player, frozen: false });
  });

  it('gives every vehicle and removed vehicle empty utility orders, keeping its other fields', () => {
    expect(next.vehicles).toEqual(FORMAT_2_25.vehicles.map((v) => ({ ...v, utilityOrders: {} })));
    expect(next.removed).toEqual(FORMAT_2_25.removed.map((v) => ({ ...v, utilityOrders: {} })));
  });

  it('starts empty smoke, fields, flares and lines, and the search stream a new game of the same seed has', () => {
    expect([next.smoke, next.fields, next.flares, next.lines]).toEqual([[], [], [], []]);
    expect(next.searchRng).toEqual(searchStream(FORMAT_2_25.seed));
  });

  it.each(['burnt-convoy', 'barn-759', 'wreck12'])('hides all the loot of the unsearched rolled stock %s', (id) => {
    const old = before(id);
    expect(stock(id)).toEqual({
      ...old,
      goods: {},
      parts: [],
      fuel: 0,
      supplies: 0,
      hidden: { goods: old.goods, parts: old.parts, fuel: old.fuel, supplies: old.supplies },
    });
  });

  it('counts a rolled stock without fuel or supplies fields as none of them', () => {
    expect(stock('deckBay-1450').hidden).toEqual({ goods: { scrap: 4 }, parts: [], fuel: 0, supplies: 0 });
  });

  it.each(['podfield', 'wreck4', 'wreck-v40', 'cargo-v41-30'])('leaves the searched stock, truck wreck or pile %s in the open', (id) => {
    expect(stock(id)).toEqual({ ...before(id), hidden: NO_HIDDEN });
  });

  it('keeps the loot total of every stock', () => {
    const total = (s: Loot) => Object.values(s.goods).reduce((a: number, b) => a + (b ?? 0), 0) + s.parts.length + (s.fuel ?? 0) + (s.supplies ?? 0);
    for (const s of next.salvage) expect(total(s) + total(s.hidden), s.id).toBe(total(before(s.id)));
  });
});

describe('save migration 26 to 27', () => {
  type Contracts = { contracts: Record<string, unknown>[] };
  const next = MIGRATIONS[26](FORMAT_2_26) as { turn: number; player: Contracts & { money: number }; shops: Record<string, Contracts> };

  it('starts every held and posted bounty unfulfilled', () => {
    expect(next.player.contracts[0]).toEqual({ ...FORMAT_2_26.player.contracts[0], fulfilled: false });
    expect(next.shops.bowl.contracts[0]).toEqual({ ...FORMAT_2_26.shops.bowl.contracts[0], fulfilled: false });
  });

  it('keeps every other contract and field', () => {
    expect(next.player.contracts[1]).toEqual(FORMAT_2_26.player.contracts[1]);
    expect(next.shops.bowl.contracts[1]).toEqual(FORMAT_2_26.shops.bowl.contracts[1]);
    expect(next.shops.nose).toEqual(FORMAT_2_26.shops.nose);
    expect({ ...next, player: { ...next.player, contracts: [] }, shops: {} }).toEqual({ ...FORMAT_2_26, player: { ...FORMAT_2_26.player, contracts: [] }, shops: {} });
  });
});

describe('save migration 27 to 28', () => {
  const before = structuredClone(FORMAT_2_27);
  const next = MIGRATIONS[27](FORMAT_2_27) as { salvage: { id: string }[]; player: { scavenged: string[] }; vehicles: { job: { stockId: string } | null }[] };

  it('drops the Glass Flats stock and its searched mark, and keeps every other stock', () => {
    expect(next.salvage.map((stock) => stock.id)).toEqual(FORMAT_2_27.salvage.map((stock) => stock.id).filter((id) => id !== 'glass-flats'));
    expect(next.player.scavenged).toEqual(['podfield', 'wreck4']);
  });

  it('ends a search of the old stock, keeps other searches and does not mutate its input', () => {
    expect(next.vehicles[0].job).toBeNull();
    expect(next.vehicles[1]).toEqual(FORMAT_2_27.vehicles[1]);
    expect(FORMAT_2_27).toEqual(before);
  });
});

describe('save migration 28 to 29', () => {
  it('gives the world the default Roaming setup and keeps every other field', () => {
    const next = MIGRATIONS[28](FORMAT_2_28);

    expect(next).toEqual({ ...FORMAT_2_28, setup: { mode: 'roaming', settings: { damage: 1, fuelUse: 1, supplyUse: 1 } } });
  });
});

describe('save migration 29 to 30', () => {
  const next = MIGRATIONS[29](structuredClone(FORMAT_2_29)) as typeof FORMAT_2_29;
  const cents = (money: number) => Math.round((money * 100) / 3);

  it('turns player money, debt included, cost basis and contract rewards into cents', () => {
    expect(next.player.money).toBe(-33333);
    expect(next.player.costBasis).toEqual({ scrap: 350, salt: 700 });
    expect(next.player.contracts[0].reward).toBe(4000);
    expect(next.shops.bowl.contracts[0].reward).toBe(10000);
    expect(next.shops.bowl.pressure).toEqual(FORMAT_2_29.shops.bowl.pressure);
  });

  it('turns the open call\'s money, deal and prices into cents and leaves other vars alone', () => {
    const { vars, line } = next.player.call;
    expect(vars.fee).toEqual({ kind: 'money', amount: 1500 });
    expect(vars.deal).toEqual({ ...FORMAT_2_29.player.call.vars.deal, price: 1000 });
    expect(vars.town).toEqual(FORMAT_2_29.player.call.vars.town);
    expect(line.vars.prices.goods).toEqual([{ good: 'salt', buy: cents(31), sell: 700 }]);
    expect(line.vars.far).toEqual(FORMAT_2_29.player.call.line.vars.far);
    expect(line.text).toBe(FORMAT_2_29.player.call.line.text);
  });

  it('turns driver wallets and pile bases into cents and keeps fuel, memories and stock', () => {
    expect(next.vehicles[0]).toEqual(FORMAT_2_29.vehicles[0]);
    expect(next.vehicles[1]).toEqual({ ...FORMAT_2_29.vehicles[1], resources: { ...FORMAT_2_29.vehicles[1].resources, money: cents(1250) } });
    expect(next.removed[0].resources.money).toBe(233);
    expect(next.salvage[0]).toEqual(FORMAT_2_29.salvage[0]);
    expect(next.salvage[1].pile).toEqual({ ...FORMAT_2_29.salvage[1].pile, basis: { salt: 750 } });
  });

  it('turns every fee and price in a deal state into cents and nothing else', () => {
    const data = next.states.map((s) => s.data as Record<string, unknown>);
    expect(data[0]).toEqual({ ...FORMAT_2_29.states[0].data, fee: cents(55), waived: 0 });
    expect(data[1]).toEqual({ ...FORMAT_2_29.states[1].data, fee: 600 });
    expect(data[2]).toEqual({ ...FORMAT_2_29.states[2].data, fee: 2600 });
    expect(data[3]).toEqual({ ...FORMAT_2_29.states[3].data, price: cents(32) });
    expect(data[4]).toEqual({ ...FORMAT_2_29.states[4].data, price: cents(22) });
    expect(next.states[5]).toEqual(FORMAT_2_29.states[5]);
  });

  it('turns money in events into cents, and scales only money practice amounts', () => {
    const e = next.events as Record<string, unknown>[];
    expect(e[0].amount).toBe(-400);
    expect(e[1].amount).toBeCloseTo(450);
    expect(e[2].amount).toBeCloseTo(1000);
    expect(e[3].amount).toBeCloseTo(300);
    expect(e[4]).toEqual(FORMAT_2_29.events[4]);
    expect((e[5].contract as { reward: number }).reward).toBe(5000);
    expect([e[6].fee, e[7].fee, e[8].fee, e[9].fee]).toEqual([cents(55), 600, 2600, 2600]);
    expect(e[10].paid).toBe(cents(22));
    expect(((e[11].state as { data: { price: number } }).data).price).toBe(500);
    expect(e[12].vars).toEqual({ fee: { kind: 'money', amount: 100 } });
    expect(e[13]).toEqual(FORMAT_2_29.events[13]);
    for (const [i, ev] of e.entries()) if (ev.t === 'practice') expect(ev.xp, `event ${i}`).toBe(FORMAT_2_29.events[i].xp);
  });

  it('keeps the turn and touches nothing outside money', () => {
    expect(next.turn).toBe(FORMAT_2_29.turn);
    expect(next.player.fuel).toBe(FORMAT_2_29.player.fuel);
  });

  it('throws on a money field that is not a number', () => {
    const bad = { ...structuredClone(FORMAT_2_29), player: { ...structuredClone(FORMAT_2_29.player), money: 'x' } };
    expect(() => MIGRATIONS[29](bad)).toThrow(/player money/);
  });

  it('converts every money-named field of the saved shape', () => {
    const MONEY_KEYS = new Set(['money', 'reward', 'fee', 'waived', 'price', 'paid', 'amount', 'buy', 'sell', 'basis', 'costBasis']);
    const CONVERTED = new Set([
      '.player.money', '.player.costBasis', '.player.contracts[].reward', '.shops.*.contracts[].reward',
      '.vehicles[].resources.money', '.removed[].resources.money', '.salvage[].pile.basis',
      '.states[].data.fee', '.states[].data.waived', '.states[].data.price',
    ]);
    const found: string[] = [];
    const walk = (node: unknown, path: string): void => {
      if (Array.isArray(node)) return node.forEach((x) => walk(x, `${path}[]`));
      if (!node || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node)) {
        const at = path === '.shops' ? `${path}.*` : `${path}.${key}`;
        if (MONEY_KEYS.has(key)) found.push(at);
        walk(value, at);
      }
    };
    walk(SAVE_SHAPE.shape, '');
    expect(found.length).toBeGreaterThan(0);
    for (const at of found) expect(CONVERTED.has(at), at).toBe(true);
  });
});

describe('save migration 30 to 31', () => {
  const next = MIGRATIONS[30](FORMAT_2_30) as typeof FORMAT_2_30;

  it('keeps the world as it was', () => {
    expect(next).toEqual(FORMAT_2_30);
  });

  it('leaves a raid on its way without a watch end, so it watches once it arrives', () => {
    const raid = next.vehicles[1].brain!.goals[0];

    expect(raid.phase).toBe('travel');
    expect('watchUntil' in raid).toBe(false);
  });
});

describe('save migration 31 to 32', () => {
  const next = MIGRATIONS[31](FORMAT_2_31) as Record<string, unknown> & { vehicles: object[]; player: object; broken: object[] };

  it('drops trails, the visible tiles, the last turn events and removed vehicles', () => {
    expect(next.vehicles).toEqual(FORMAT_2_31.vehicles.map(({ trail: _t, ...rest }) => rest));
    expect('events' in next).toBe(false);
    expect('removed' in next).toBe(false);
    const { visible: _v, ...player } = FORMAT_2_31.player;
    expect(next.player).toEqual(player);
  });

  it('keeps only the id and turn of a broken prop', () => {
    expect(next.broken).toEqual([{ id: 'deadTree-1354', turn: 2559 }]);
  });

  it('keeps dust clouds, contacts and clouds', () => {
    expect(next.dustClouds).toEqual(FORMAT_2_31.dustClouds);
    expect(next.turn).toBe(FORMAT_2_31.turn);
  });
});

describe('save migration 32 to 33', () => {
  it('drops the contacts and seen clouds and keeps the dust clouds', () => {
    const next = MIGRATIONS[32](FORMAT_2_32);
    const { contacts: _c, clouds: _s, ...player } = FORMAT_2_32.player;

    expect(next).toEqual({ ...FORMAT_2_32, player });
  });
});

describe('save migration 33 to 34', () => {
  it('keeps a save with only price memories as it is', () => {
    expect(MIGRATIONS[33](structuredClone(FORMAT_2_33))).toEqual(FORMAT_2_33);
  });
});

describe('save migration 34 to 35', () => {
  it('leaves a save from before old-world loot spots as it is, for the load to stock them', () => {
    const before = MIGRATIONS[33](structuredClone(FORMAT_2_33));

    expect(MIGRATIONS[34](structuredClone(before))).toEqual(before);
  });
});

describe('save migration 35 to 36', () => {
  it('keeps the states and the open call as they are', () => {
    expect(MIGRATIONS[35](FORMAT_2_35)).toEqual(FORMAT_2_35);
  });
});

describe('save migration 36 to 37', () => {
  type Goal = { reason: string };
  type Saved = {
    vehicles: { id: string; name?: string; brain: { goals: Goal[] } | null }[];
    player: { call: { line: unknown; vars: Record<string, unknown> } | null; contracts: Record<string, unknown>[] };
    shops: Record<string, { contracts: Record<string, unknown>[] }>;
  };
  const next = MIGRATIONS[36](FORMAT_2_36) as unknown as Saved;
  const reasons = (v: { brain: { goals: Goal[] } | null }) => v.brain?.goals.map((g) => g.reason);

  it('turns known goal reasons into ids, an old phrase into the id that replaced it, and an unknown one into legacy', () => {
    expect(reasons(next.vehicles[1])).toEqual(['buyCargo', 'lowFuel']);
    expect(reasons(next.vehicles[2])).toEqual(['explore', 'legacy']);
    expect(reasons(next.vehicles[3])).toEqual(['raid']);
  });

  it('removes the names of trucks and bounty targets', () => {
    expect(next.vehicles.some((v) => 'name' in v)).toBe(false);
    expect(next.player.contracts.map((c) => 'targetName' in c)).toEqual([false, false]);
    expect('targetName' in next.shops.nose.contracts[0]).toBe(false);
    expect(next.player.contracts[0]).toEqual({ id: 'c1', shop: 'bowl', kind: 'bounty', template: 'buggy', reward: 400, deadline: 990, window: 300, tier: 2 });
  });

  it('keeps an open call on a known line as its id', () => {
    expect(next.player.call?.line).toEqual({ line: 'dealTerms', vars: FORMAT_2_36.player.call.line.vars });
  });

  it('turns the warning line of an open loot call into its id', () => {
    const call = { ...FORMAT_2_36.player.call, topic: 'lootWarning', line: { text: '{warnLine}', vars: {} }, vars: { warnLine: { kind: 'line', text: "That's my pick. Roll on." } } };
    const saved = { ...FORMAT_2_36, player: { ...FORMAT_2_36.player, call } };
    const migrated = MIGRATIONS[36](saved) as unknown as Saved;
    expect(migrated.player.call?.vars).toEqual({ warnLine: { kind: 'line', line: 'thatsMyPick' } });
    expect(migrated.player.call?.line).toEqual({ line: 'warnTerms', vars: {} });
  });

  it('hangs up a call on a line no table knows', () => {
    const unknown = { ...FORMAT_2_36, player: { ...FORMAT_2_36.player, call: { ...FORMAT_2_36.player.call, line: { text: 'Words from a mod', vars: {} } } } };
    expect((MIGRATIONS[36](unknown) as unknown as Saved).player.call).toBeNull();
  });
});

describe('save migration 37 to 38', () => {
  const wagon = STORY_WRECKS[0];
  const fresh = emptyWorld();
  const WAGON_POS_THEN = { x: 171, y: 381 };

  it('gives the player an empty journal and puts wagon Seven in place as a new game had it at that format', () => {
    const next = MIGRATIONS[37](FORMAT_2_37) as typeof FORMAT_2_37 & { player: { notes: unknown[] } };

    expect(next.player).toEqual({ ...FORMAT_2_37.player, notes: [] });
    expect(next.obstacles).toEqual([...FORMAT_2_37.obstacles, { id: wagon.id, pos: WAGON_POS_THEN, r: wagon.r, kind: 'wreck', hulk: { chassisId: wagon.chassisId, yaw: wagon.yaw } }]);
    const placed = (list: { id: string; parts?: object[] }[]) => list.map((s) => (s.id === wagon.id ? { ...s, pos: WAGON_POS_THEN, parts: [] } : s));
    expect(placed(next.salvage as never)).toEqual(placed([...FORMAT_2_37.salvage, fresh.salvage.find((s) => s.id === wagon.id)!] as never));
    expect(next.turn).toBe(FORMAT_2_37.turn);
  });

  it('adds no second wagon to a save that holds one', () => {
    const once = MIGRATIONS[37](FORMAT_2_37);

    const twice = MIGRATIONS[37](once) as typeof FORMAT_2_37;

    expect(twice.obstacles.filter((o) => o.id === wagon.id)).toHaveLength(1);
    expect(twice.salvage.filter((s) => s.id === wagon.id)).toHaveLength(1);
  });
});

describe('save migration 38 to 39', () => {
  it('gives the player empty quest state with no open quest', () => {
    const next = MIGRATIONS[38](FORMAT_2_38);

    expect(next).toEqual({ ...FORMAT_2_38, player: { ...FORMAT_2_38.player, quests: { world: {}, local: {}, session: null } } });
  });
});

describe('save migration 39 to 40', () => {
  it('drops the sample quests and their world variable and keeps every other quest name', () => {
    const next = MIGRATIONS[39](FORMAT_2_39);

    expect(next).toEqual({
      ...FORMAT_2_39,
      player: { ...FORMAT_2_39.player, quests: { world: { kept_flag: true }, local: { kept_quest: { n: 2 } }, session: null } },
    });
  });
});

describe('save migration 40 to 41', () => {
  it('drops the depot quest counters that facts replaced and keeps the rest of the open quest', () => {
    const next = MIGRATIONS[40](FORMAT_2_40);

    expect(next).toEqual({
      ...FORMAT_2_40,
      player: { ...FORMAT_2_40.player, quests: { ...FORMAT_2_40.player.quests, local: { nose_depot_leak: { watches: 3, ledger_read: true } } } },
    });
  });
});

describe('save migration 41 to 42', () => {
  it('sets every lie-up spot to its driver place and keeps every other field', () => {
    const next = MIGRATIONS[41](FORMAT_2_41);
    const [player, resting, patrol] = FORMAT_2_41.vehicles;

    expect(next).toEqual({
      ...FORMAT_2_41,
      vehicles: [player, { ...resting, brain: { goals: [resting.brain!.goals[0], { ...resting.brain!.goals[1], destination: { x: 198.5, y: 230.2 } }] } }, patrol],
    });
  });
});

describe('save migration 42 to 43', () => {
  const next = MIGRATIONS[42](FORMAT_2_42) as { vehicles: { id: string; items: { id: string; rot: number }[] }[]; player: { storage: { id: string }[] } };
  const itemsOf = (id: string) => next.vehicles.find((v) => v.id === id)!.items;

  it('keeps a machine gun whose second cell is free on the same kind of cell as it was', () => {
    expect(itemsOf('player').filter((it) => ['i1', 'i2'].includes(it.id)).map((it) => it.rot)).toEqual([0, 1]);
  });

  it('turns a machine gun a quarter turn when only that way keeps it on deck cells', () => {
    expect(itemsOf('player').find((it) => it.id === 'i4')!.rot).toBe(0);
  });

  it('stows the player machine gun with no deck room either way and drops an npc one', () => {
    expect(itemsOf('player').some((it) => it.id === 'i5')).toBe(false);
    expect(next.player.storage.map((p) => p.id)).toEqual(['s1', 'p5']);
    expect(itemsOf('npc-3').some((it) => it.id === 'i8')).toBe(false);
  });

  it('leaves every other item alone', () => {
    expect(itemsOf('player').filter((it) => ['i3', 'i6', 'i7'].includes(it.id))).toEqual(FORMAT_2_42.vehicles[0].items.filter((it) => ['i3', 'i6', 'i7'].includes(it.id)));
  });

  it('holds a copy of the chassis layouts that equals the live chassis data', () => {
    for (const c of Object.values(CHASSIS).filter((it) => LAYOUTS_2_34[it.id])) expect(LAYOUTS_2_34[c.id], c.id).toEqual(c.layout);
  });
});

describe('quest migration helpers', () => {
  const saved = (): SavedJson => ({
    turn: 3000,
    player: {
      vehicleId: 'v1',
      quests: {
        world: { wagon_heard: true },
        local: { bowl: { trust: 2, paid: true } },
        session: { quest: 'bowl', checkpoint: 'start.talk', seed: 77 },
      },
    },
  });
  const questsIn = (world: SavedJson) => (world.player as { quests: unknown }).quests;

  it('renames a world variable and keeps its value', () => {
    expect(questsIn(renameQuestVar(saved(), null, 'wagon_heard', 'heard_of_wagon'))).toMatchObject({ world: { heard_of_wagon: true } });
  });

  it('renames a quest variable', () => {
    expect(questsIn(renameQuestVar(saved(), 'bowl', 'trust', 'faith'))).toMatchObject({ local: { bowl: { faith: 2, paid: true } } });
  });

  it('leaves a save without the variable as it was', () => {
    expect(renameQuestVar(saved(), 'bowl', 'missing', 'other')).toEqual(saved());
  });

  it('refuses to rename onto a variable that holds a value', () => {
    expect(() => renameQuestVar(saved(), 'bowl', 'trust', 'paid')).toThrow('Quest variable paid already holds a value');
  });

  it('drops a quest variable and the quest entry once it is empty', () => {
    const once = dropQuestVar(saved(), 'bowl', 'trust');
    expect(questsIn(once)).toMatchObject({ local: { bowl: { paid: true } } });
    expect(questsIn(dropQuestVar(once, 'bowl', 'paid'))).toMatchObject({ local: {} });
  });

  it('moves the open session to a renamed checkpoint', () => {
    expect(questsIn(moveQuestCheckpoint(saved(), 'bowl', 'start.talk', 'start.chat'))).toMatchObject({ session: { quest: 'bowl', checkpoint: 'start.chat', seed: 77 } });
  });

  it('ends the session of a quest and leaves another quest session open', () => {
    expect(questsIn(endQuestSession(saved(), 'bowl'))).toMatchObject({ session: null });
    expect(endQuestSession(saved(), 'nose')).toEqual(saved());
  });

  it('drops a whole quest with its session and variables but keeps world variables', () => {
    expect(questsIn(dropQuest(saved(), 'bowl'))).toEqual({ world: { wagon_heard: true }, local: {}, session: null });
  });
});

describe('save migration 43 to 44', () => {
  const before = structuredClone(FORMAT_2_43);
  const next = MIGRATIONS[43](FORMAT_2_43) as {
    salvage: { id: string }[];
    shops: Record<string, { contracts: unknown[]; pressure: Record<string, number>; stock: unknown[]; restockAt: number }>;
    obstacles: { id: string }[];
    player: { scavenged: string[]; discovered: string[] };
    vehicles: { id: string; job: unknown; brain: { goals: { targetId: string }[]; noticed: Record<string, number>; unfit: string[]; memories: { fact: { kind: string; stock?: string } }[] } | null }[];
  };

  it('drops the six retired stocks and keeps every other stock', () => {
    expect(next.salvage.map((s) => s.id)).toEqual(['wreck4', 'farmhouse-1']);
  });

  it('drops the retired ids from the searched and discovered lists', () => {
    expect(next.player.scavenged).toEqual(['wreck4', 'farmhouse-1']);
    expect(next.player.discovered).toEqual(['bowl', 'dustwell']);
  });

  it('adds both outpost shops empty, to roll their stock on the next turn, and leaves the old shops', () => {
    expect(next.shops.dustwell).toEqual({ contracts: [], pressure: { water: 0, scrap: 0, tools: 0, meds: 0 }, stock: [], restockAt: 1200 });
    expect(next.shops['green-pit']).toEqual({ contracts: [], pressure: { water: 0, grain: 0, salt: 0, textiles: 0 }, stock: [], restockAt: 1200 });
    expect(next.shops.bowl).toEqual(FORMAT_2_43.shops.bowl);
    expect(next.shops.nose).toEqual(FORMAT_2_43.shops.nose);
  });

  it('ends a search or a refit pickup of a retired stock and keeps other jobs', () => {
    expect(next.vehicles[0].job).toBeNull();
    expect(next.vehicles[1].job).toBeNull();
    expect(next.vehicles[2].job).toEqual(FORMAT_2_43.vehicles[2].job);
  });

  it('drops goals, stripped memories, unfit entries and noticed marks of retired stocks', () => {
    const brain = next.vehicles[1].brain!;
    expect(brain.goals.map((g) => g.targetId)).toEqual(['bowl']);
    expect(brain.memories.map((m) => m.fact.kind)).toEqual(['stripped', 'prices']);
    expect(brain.memories[0].fact.stock).toBe('wreck4');
    expect(brain.unfit).toEqual(['wreck4']);
    expect(brain.noticed).toEqual({ 'salvageSeen:wreck4': 5 });
  });

  it('drops the retired site and convoy wreck obstacles and keeps the rest', () => {
    expect(next.obstacles.map((o) => o.id)).toEqual(['pond-dustwell', 'wreck0', 'rock1']);
  });

  it('does not mutate its input', () => {
    expect(FORMAT_2_43).toEqual(before);
  });
});

describe('save migration 44 to 45', () => {
  it('keeps a save holding a call that names a haul as it is', () => {
    expect(MIGRATIONS[44](structuredClone(FORMAT_2_44))).toEqual(FORMAT_2_44);
  });
});

describe('save migration 45 to 46', () => {
  it('returns the world unchanged, since no old save holds a business job', () => {
    expect(MIGRATIONS[45](structuredClone(FORMAT_2_44))).toEqual(FORMAT_2_44);
  });
});

describe('save migration 47 to 48', () => {
  it('drops a Gauntlet run laid on Icarus roads and keeps the mode, for the load to rescue it', () => {
    const next = MIGRATIONS[47](structuredClone(FORMAT_2_47));

    expect(next).toEqual({ ...FORMAT_2_47, gauntlet: null });
    expect((next.setup as { mode: string }).mode).toBe('gauntlet');
  });

  it('keeps a world with no run as it is', () => {
    const roaming = { ...FORMAT_2_47, setup: { ...FORMAT_2_47.setup, mode: 'roaming' }, gauntlet: null };

    expect(MIGRATIONS[47](structuredClone(roaming))).toEqual(roaming);
  });
});

describe('save migration 50 to 51', () => {
  it('starts each outpost with no trucks sold and each group with no trucks counted', () => {
    const run = structuredClone(FORMAT_2_50.furyRoad);
    const outposts = run.outposts.map((post) => ({ ...post, trucksSold: [] }));
    const groups = run.groups.map((group) => ({ ...group, counted: [] }));

    expect(MIGRATIONS[50](structuredClone(FORMAT_2_50))).toEqual({ ...FORMAT_2_50, furyRoad: { ...run, outposts, groups } });
  });

  it('keeps a world with no run as it is', () => {
    const roaming = { ...structuredClone(FORMAT_2_50), setup: { ...FORMAT_2_50.setup, mode: 'roaming' }, furyRoad: null };

    expect(MIGRATIONS[50](structuredClone(roaming))).toEqual(roaming);
  });
});

describe('save migration 49 to 50', () => {
  it('drops each group anchor, starts each engaged list empty and dates the quiet from the saved turn', () => {
    const run = structuredClone(FORMAT_2_49.furyRoad);
    const groups = run.groups.map(({ at: _at, ...group }) => ({ ...group, engaged: [] }));

    expect(MIGRATIONS[49](structuredClone(FORMAT_2_49))).toEqual({ ...FORMAT_2_49, furyRoad: { ...run, groups, quietFrom: 412 } });
  });

  it('keeps a world with no run as it is', () => {
    const roaming = { ...structuredClone(FORMAT_2_49), setup: { ...FORMAT_2_49.setup, mode: 'roaming' }, furyRoad: null };

    expect(MIGRATIONS[49](structuredClone(roaming))).toEqual(roaming);
  });
});

describe('save migration 48 to 49', () => {
  it('renames the Gauntlet mode and its run to Fury Road and keeps the run', () => {
    const { gauntlet, ...rest } = structuredClone(FORMAT_2_48);

    expect(MIGRATIONS[48](structuredClone(FORMAT_2_48))).toEqual({ ...rest, setup: { ...rest.setup, mode: 'furyRoad' }, furyRoad: gauntlet });
  });

  it('keeps a Roaming world as it is but for the run key', () => {
    const { gauntlet: _run, ...rest } = structuredClone(FORMAT_2_48);
    const roaming = { ...rest, setup: { ...rest.setup, mode: 'roaming' }, gauntlet: null };

    expect(MIGRATIONS[48](structuredClone(roaming))).toEqual({ ...rest, setup: roaming.setup, furyRoad: null });
  });
});

describe('save migration 46 to 47', () => {
  it('adds an empty Gauntlet run and keeps the rest of the world', () => {
    expect(MIGRATIONS[46](structuredClone(FORMAT_2_44))).toEqual({ ...FORMAT_2_44, gauntlet: null });
  });
});

describe('save migration 51 to 52', () => {
  const personalityIn = (world: { vehicles: { id: string; brain: object | null }[] }, id: string) => (world.vehicles.find((v) => v.id === id)!.brain as { personality?: string } | null)?.personality;

  it('gives every driver a personality from its vehicle id and leaves the rest of the brain alone', () => {
    const next = MIGRATIONS[51](FORMAT_2_51) as typeof FORMAT_2_51;

    expect(personalityIn(next, 'npc1')).toBe('braggart');
    expect(personalityIn(next, 'npc2')).toBe('grim');
    expect(personalityIn(next, 'npc3')).toBe('tightLipped');
    expect(next.vehicles[1].brain).toEqual({ ...FORMAT_2_51.vehicles[1].brain, personality: 'braggart' });
  });

  it('gives the player no personality', () => {
    const next = MIGRATIONS[51](FORMAT_2_51) as typeof FORMAT_2_51;

    expect(next.vehicles[0]).toEqual(FORMAT_2_51.vehicles[0]);
  });

  it('draws the same personality each time it runs', () => {
    expect(MIGRATIONS[51](FORMAT_2_51)).toEqual(MIGRATIONS[51](FORMAT_2_51));
  });
});

describe('save migration 52 to 53', () => {
  type Quests = { world: Record<string, unknown>; local: Record<string, unknown>; session: { quest: string; checkpoint: string; seed: number } | null };
  const questsIn = (world: object) => (world as { player: { quests: Quests } }).player.quests;
  const withSession = (quest: string, checkpoint: string) => {
    const world = structuredClone(FORMAT_2_52);
    world.player.quests.session = { quest, checkpoint, seed: 17 };
    return world;
  };

  it('sends a save made inside the arrival back to its first page and forgets the walk step', () => {
    const next = questsIn(MIGRATIONS[52](structuredClone(FORMAT_2_52)));

    expect(next.session).toEqual({ quest: 'intro_arrival', checkpoint: 'start', seed: 17 });
    expect(next.world).toEqual({ first_knockout_seen: true });
  });

  it('sends a save made inside the first fall back to its first page', () => {
    expect(questsIn(MIGRATIONS[52](withSession('first_fall', 'look'))).session?.checkpoint).toBe('start');
  });

  it('leaves other quests and later intro steps alone', () => {
    const other = withSession('nose_kovac', 'start.hub');
    other.player.quests.world.intro_step = 'ambush';

    expect(MIGRATIONS[52](structuredClone(other))).toEqual(other);
  });
});

describe('save migration 53 to 54', () => {
  type Quests = { world: Record<string, unknown>; local: Record<string, unknown>; session: { quest: string; checkpoint: string; seed: number } | null };
  const playerOf = (world: object) => (world as { player: { money: number; notes: { id: string }[]; quests: Quests } }).player;

  it('drops the cut quests, their world variables and their notes, and keeps the rest', () => {
    const next = playerOf(MIGRATIONS[53](structuredClone(FORMAT_2_53)));

    expect(next.quests).toEqual({ world: { intro_step: 'done', pipe_fate: 'delivered' }, local: { bowl_hattie: { hattie_flats: true } }, session: null });
    expect(next.notes.map((n) => n.id)).toEqual(['wagonBowl', 'pipeBook']);
    expect(next.money).toBe(1200);
  });

  it('keeps a session inside a kept quest', () => {
    const world = structuredClone(FORMAT_2_53);
    world.player.quests.session = { quest: 'pump_pipe', checkpoint: 'road', seed: 17 };

    expect(playerOf(MIGRATIONS[53](world)).quests.session).toEqual({ quest: 'pump_pipe', checkpoint: 'road', seed: 17 });
  });
});

describe('save migration 54 to 55', () => {
  type Quests = { world: Record<string, unknown>; local: Record<string, unknown>; session: { quest: string; checkpoint: string; seed: number } | null };
  const playerOf = (world: object) => (world as { player: { money: number; notes: { id: string }[]; quests: Quests } }).player;

  it("drops Kovac's Kessel variables and keeps his other talk, the session and the rest", () => {
    const next = playerOf(MIGRATIONS[54](structuredClone(FORMAT_2_54)));

    expect(next.quests).toEqual({
      world: { intro_step: 'done' },
      local: { nose_kovac: { heard_paper: true, asked_paper: true }, bowl_hattie: { hattie_flats: true } },
      session: { quest: 'nose_kovac', checkpoint: 'start.hub', seed: 17 },
    });
    expect(next.notes.map((n) => n.id)).toEqual(['wagonBowl']);
    expect(next.money).toBe(1200);
  });
});

describe('save migration 55 to 56', () => {
  type Quests = { world: Record<string, unknown>; local: Record<string, unknown>; session: { quest: string; checkpoint: string; seed: number } | null };
  const playerOf = (world: object) => (world as { player: { money: number; notes: { id: string }[]; quests: Quests } }).player;

  it("moves Hattie's heard-the-glass mark to hattie_glass, so her Sunward question still waits, and keeps the rest", () => {
    const next = playerOf(MIGRATIONS[55](structuredClone(FORMAT_2_55)));

    expect(next.quests).toEqual({
      world: { intro_step: 'done' },
      local: { bowl_hattie: { hattie_flats: true, hattie_glass: true, hattie_strangers: true } },
      session: { quest: 'bowl_hattie', checkpoint: 'start.hub', seed: 17 },
    });
    expect(next.notes.map((n) => n.id)).toEqual(['talkGlassLean']);
    expect(next.money).toBe(1200);
  });

  it('leaves a save that never heard of the glass as it was', () => {
    const fresh = structuredClone(FORMAT_2_54);
    expect(MIGRATIONS[55](fresh)).toEqual(fresh);
  });
});

describe('save migration 56 to 57', () => {
  type Quests = { world: Record<string, unknown>; local: Record<string, unknown>; session: { quest: string; checkpoint: string; seed: number } | null };
  const playerOf = (world: object) => (world as { player: { money: number; notes: { id: string }[]; quests: Quests } }).player;

  it("drops the Pump Station variables the rewrite cut and keeps Agnes's trust, the road, the session and the rest", () => {
    const next = playerOf(MIGRATIONS[56](structuredClone(FORMAT_2_56)));

    expect(next.quests).toEqual({
      world: { intro_step: 'done' },
      local: { pump_agnes: { knows_book: true, knows_pipe: true, trusted: true }, pump_pipe: { taken: true, sluice: 'watched' } },
      session: { quest: 'pump_pipe', checkpoint: 'road', seed: 17 },
    });
    expect(next.notes.map((n) => n.id)).toEqual(['pipeBook']);
    expect(next.money).toBe(1200);
  });
});

describe('save migration 57 to 58', () => {
  it('gives the setup the default enemy gear growth and keeps the other settings and fields', () => {
    const next = MIGRATIONS[57](structuredClone(FORMAT_2_57));

    expect(next).toEqual({
      turn: 3,
      setup: { mode: 'furyRoad', settings: { damage: 1.5, fuelUse: 0.75, supplyUse: 1, enemyGearGrowth: 1 } },
      player: { money: 1200 },
    });
  });
});

describe('save migration 58 to 59', () => {
  it('drops the engaged list and turns groups from behind into groups from ahead, keeping the rest', () => {
    const next = MIGRATIONS[58](structuredClone(FORMAT_2_58));
    const groups = FORMAT_2_58.furyRoad.groups.map(({ engaged: _engaged, ...g }) => g);

    expect(next).toEqual({ ...FORMAT_2_58, furyRoad: { ...FORMAT_2_58.furyRoad, groups: [{ ...groups[0], from: 'ahead' }, groups[1]] } });
  });

  it('leaves a Roaming save alone', () => {
    const roaming = { ...structuredClone(FORMAT_2_58), furyRoad: null };

    expect(MIGRATIONS[58](structuredClone(roaming))).toEqual(roaming);
  });
});

describe('save migration 59 to 60', () => {
  it('starts each in-flight duty leg where the truck stands on the save turn, and leaves other goals alone', () => {
    const next = MIGRATIONS[59](structuredClone(FORMAT_2_59)) as typeof FORMAT_2_59;
    const leg = (id: string) => ({ from: FORMAT_2_59.vehicles.find((v) => v.id === id)!.pos, turn: 820 });
    const goalsOf = (id: string) => next.vehicles.find((v) => v.id === id)!.brain!.goals;
    const before = (id: string) => FORMAT_2_59.vehicles.find((v) => v.id === id)!.brain!.goals;

    expect(goalsOf('v2')).toEqual([{ ...before('v2')[0], leg: leg('v2') }, before('v2')[1]]);
    expect(goalsOf('v3')).toEqual([{ ...before('v3')[0], leg: leg('v3') }]);
    expect(goalsOf('v4')).toEqual(before('v4'));
    expect(goalsOf('v5')).toEqual([{ ...before('v5')[0], leg: leg('v5') }]);
    expect(goalsOf('v6')).toEqual(before('v6'));
    expect(next.vehicles[0]).toEqual(FORMAT_2_59.vehicles[0]);
    expect(next.turn).toBe(820);
  });
});

describe('save migration 60 to 61', () => {
  it('drops a Fury Road run without a hauler and keeps the mode, for the load to rescue it', () => {
    const next = MIGRATIONS[60](structuredClone(FORMAT_2_60));

    expect(next).toEqual({ ...FORMAT_2_60, furyRoad: null });
    expect((next.setup as { mode: string }).mode).toBe('furyRoad');
  });

  it('keeps a run that has a hauler as it is', () => {
    const run = { ...structuredClone(FORMAT_2_60.furyRoad), hauler: { id: 'v9', alarmUntil: null } };
    const world = { ...structuredClone(FORMAT_2_60), furyRoad: run };

    expect(MIGRATIONS[60](structuredClone(world))).toEqual(world);
  });

  it('keeps a Roaming world as it is', () => {
    const roaming = { ...structuredClone(FORMAT_2_60), setup: { ...FORMAT_2_60.setup, mode: 'roaming' }, furyRoad: null };

    expect(MIGRATIONS[60](structuredClone(roaming))).toEqual(roaming);
  });
});

describe('MIGRATIONS[61]', () => {
  const sessionOf = (world: unknown) => (world as { player: { quests: { session: unknown } } }).player.quests.session;
  const at = (quest: string, checkpoint: string) => {
    const world = structuredClone(FORMAT_2_61) as { player: { quests: { session: unknown } } };
    world.player.quests.session = { quest, checkpoint, seed: 17 };
    return world;
  };

  it('moves the wagon_seven hub session to the start of the scene', () => {
    const next = MIGRATIONS[61](structuredClone(FORMAT_2_61));

    expect(sessionOf(next)).toEqual({ quest: 'wagon_seven', checkpoint: 'start', seed: 17 });
    expect({ ...next, player: { ...(next.player as object), quests: null } }).toEqual({ ...FORMAT_2_61, player: { ...FORMAT_2_61.player, quests: null } });
  });

  it('moves the wagon_bench hub session to the report', () => {
    expect(sessionOf(MIGRATIONS[61](at('wagon_bench', 'bench.hub')))).toEqual({ quest: 'wagon_bench', checkpoint: 'bench.report', seed: 17 });
  });

  it('keeps another quest at start.hub and a save with no session as they are', () => {
    const other = at('nose_kovac', 'start.hub');
    expect(MIGRATIONS[61](structuredClone(other))).toEqual(other);
    const none = at('x', 'y');
    none.player.quests.session = null;
    expect(MIGRATIONS[61](structuredClone(none))).toEqual(none);
  });
});

describe('save migration 62 to 63', () => {
  it('keeps a world as it is, since escort jobs only add optional and new members', () => {
    const escort = {
      id: 'ct9', shop: 'bowl', kind: 'escort', client: 'v4', to: 'nose', reward: 4000, deadline: 9007199254740991, window: 75, tier: 2, threat: 2,
      span: 120, together: 80, seen: { x: 10, y: 20, turn: 5 }, apart: 3, stuck: 0, holdUntil: null,
    };
    const world = { ...structuredClone(FORMAT_2_62), shops: { bowl: { contracts: [escort] } } };

    expect(MIGRATIONS[62](structuredClone(world))).toEqual(world);
    expect(MIGRATIONS[62](structuredClone(FORMAT_2_62))).toEqual(FORMAT_2_62);
  });

  it('keeps every contract as it is in step 63 to 64, since old saves hold no rescue and the new kind adds no field to the others', () => {
    const next = MIGRATIONS[63](structuredClone(FORMAT_2_62));

    expect(next).toEqual(FORMAT_2_62);
  });
});

describe('save migration 64 to 65', () => {
  it('gives an old save an idle encounter log and changes nothing else', () => {
    const next = MIGRATIONS[64](structuredClone(FORMAT_2_64)) as { player: { encounters: unknown; money: number } };

    expect(next.player.encounters).toEqual({ next: 0, pending: null, story: null });
    expect(next.player.money).toBe(1200);
    expect({ ...next, player: { ...next.player, encounters: undefined } }).toEqual({ ...FORMAT_2_64, player: { ...FORMAT_2_64.player, encounters: undefined } });
  });

  it('keeps an encounter log that is already there', () => {
    const log = { next: 40, pending: null, story: null };
    const world = { ...structuredClone(FORMAT_2_64), player: { ...FORMAT_2_64.player, encounters: log } };

    expect(MIGRATIONS[64](structuredClone(world))).toEqual(world);
  });
});

describe('MIGRATIONS[65]', () => {
  it('anchors each saved progress at the truck position and leaves other trucks alone', () => {
    const next = MIGRATIONS[65](structuredClone(FORMAT_2_64)) as { vehicles: { brain: { progress?: { key: string; since: number; at: { x: number; y: number } } } | null }[] };

    expect(next.vehicles[0].brain!.progress).toEqual({ key: '41,77 explore:null:explore -', since: 231, at: { x: 41.5, y: 77.25 } });
    expect(next.vehicles[1]).toEqual(FORMAT_2_64.vehicles[1]);
    expect(next.vehicles[2]).toEqual(FORMAT_2_64.vehicles[2]);
  });
});

describe('MIGRATIONS[66]', () => {
  it('keeps a save with an armed ram and its order as it is', () => {
    const before = structuredClone(FORMAT_2_64);

    const next = MIGRATIONS[66](before);

    expect(next).toEqual(FORMAT_2_64);
    expect(before).toEqual(FORMAT_2_64);
  });
});

describe('MIGRATIONS[67]', () => {
  const callOf = (world: unknown) => (world as { player: { call: unknown } }).player.call;
  const saying = (line: string) => {
    const world = structuredClone(FORMAT_2_67) as { player: { call: { line: { line: string } } } };
    world.player.call.line.line = line;
    return world;
  };

  it('hangs up a call on the old town bearing line and keeps every other field', () => {
    const next = MIGRATIONS[67](structuredClone(FORMAT_2_67));
    expect(callOf(next)).toBeNull();
    expect({ ...next, player: { ...(next.player as object), call: null } }).toEqual({ ...FORMAT_2_67, player: { ...FORMAT_2_67.player, call: null } });
  });

  it('hangs up a call on the old site and wreck bearing lines', () => {
    expect(callOf(MIGRATIONS[67](saying('siteBearing')))).toBeNull();
    expect(callOf(MIGRATIONS[67](saying('aWreckNobodyPicked')))).toBeNull();
  });

  it('keeps a call on another line and a save with no call as they are', () => {
    const other = saying('heardYou');
    expect(MIGRATIONS[67](structuredClone(other))).toEqual(other);
    const none = { turn: 3, player: { call: null } };
    expect(MIGRATIONS[67](structuredClone(none))).toEqual(none);
  });
});

describe('save migration 68 to 69', () => {
  it('keeps a held search and a driver sighting as they are, since both only add union members', () => {
    expect(MIGRATIONS[68](structuredClone(FORMAT_2_68))).toEqual(FORMAT_2_68);
  });
});

describe('save migration 69 to 70', () => {
  const migrated = () => MIGRATIONS[69](structuredClone(FORMAT_2_69)) as typeof FORMAT_2_69;

  it('drops every radio-era search, since none carries a parcel, and keeps the other contracts', () => {
    const w = migrated();
    expect(w.player.contracts.map((c) => c.id)).toEqual(['ct4']);
    expect(w.shops.bowl.contracts.map((c) => c.id)).toEqual(['ct3']);
    expect(w.shops.nose.contracts).toEqual([]);
  });

  it('ends a call on the removed found topic and forgets that topic', () => {
    const w = migrated();
    expect(w.player.call).toBeNull();
    expect(w.player.talked).toEqual({ v7: { directions: 'done' }, v3: { lastSeen: 'done' } });
  });

  it('keeps a call on another topic', () => {
    const save = structuredClone(FORMAT_2_69);
    save.player.call.topic = 'lastSeen';
    expect((MIGRATIONS[69](save) as typeof FORMAT_2_69).player.call).toEqual(save.player.call);
  });
});

describe('MIGRATIONS[70]', () => {
  const next = MIGRATIONS[70](structuredClone(FORMAT_2_70)) as { player: Record<string, unknown>; vehicles: { id: string; faction: string }[]; states: unknown[] };
  const factionOf = (id: string) => next.vehicles.find((v) => v.id === id)?.faction;

  it('puts each raider in the camp nearest its home, whatever its position', () => {
    expect(factionOf('v2')).toBe('scrapjaw');
    expect(factionOf('v3')).toBe('kiln');
  });

  it('makes couriers Guidestar and road drivers independent', () => {
    expect(factionOf('v4')).toBe('guidestar');
    expect(['v5', 'v6', 'v11'].map(factionOf)).toEqual(['independent', 'independent', 'independent']);
  });

  it('gives a convoy its nearest town and its guard the convoy faction, and a lone guard its own nearest town', () => {
    expect(factionOf('v7')).toBe('nose');
    expect(factionOf('v8')).toBe('nose');
    expect(factionOf('v9')).toBe('bowl');
  });

  it('keeps the player and town patrols, drops no truck and keeps every state', () => {
    expect(factionOf('v1')).toBe('player');
    expect(factionOf('v10')).toBe('bowl');
    expect(next.vehicles).toHaveLength(FORMAT_2_70.vehicles.length);
    expect(next.states).toEqual(FORMAT_2_70.states);
  });

  it('starts the player at the outside driver standing with no deeds', () => {
    expect(next.player.standing).toEqual({ bowl: 5, nose: 5, guidestar: 10, administrators: 10, scrapjaw: -30, kiln: -30 });
    expect(next.player.deeds).toEqual([]);
    expect(next.player.money).toBe(1200);
  });

  it('gives a memory of being wronged the attacked deed and keeps other memories', () => {
    const memories = (next.vehicles as unknown as { id: string; brain: { memories: unknown[] } }[]).find((v) => v.id === 'v3')!.brain.memories;
    expect(memories).toEqual([{ turn: 30, fact: { kind: 'wronged', by: 'v1', deed: 'attacked' } }, { turn: 31, fact: { kind: 'prices', shop: 'bowl', pressure: {} } }]);
  });
});

describe('MIGRATIONS[71]', () => {
  type Saved = { player: { money: number; call: { vars: { way: { steps: { do: string; at?: unknown }[] } }; line: { vars: { way: { steps: { do: string; at?: unknown }[] } } } } } };
  const next = () => MIGRATIONS[71](structuredClone(FORMAT_2_71)) as unknown as Saved;

  it('cuts the steps at a fork counted past the third and asks again, in both copies of the call', () => {
    const { call } = next().player;
    for (const way of [call.vars.way, call.line.vars.way]) {
      expect(way.steps.map((s) => s.do)).toEqual(['follow', 'turn', 'askAgain']);
    }
  });

  it('removes the cue from every askAgain', () => {
    const only = structuredClone(FORMAT_2_71) as unknown as Saved;
    only.player.call.vars.way.steps = [{ do: 'askAgain', at: { kind: 'fork', nth: 3 } }];
    only.player.call.line.vars.way.steps = [{ do: 'askAgain', at: { kind: 'none' } }];
    const { call } = (MIGRATIONS[71](only as never) as unknown as Saved).player;
    expect(call.vars.way.steps).toEqual([{ do: 'askAgain' }]);
    expect(call.line.vars.way.steps).toEqual([{ do: 'askAgain' }]);
  });

  it('keeps the rest of the world and a save with no call as they are', () => {
    const { player, ...rest } = next() as unknown as { player: { money: number; call: object }; turn: number };
    expect(rest).toEqual({ turn: 3 });
    expect(player.money).toBe(1200);
    const none = { turn: 3, player: { call: null } };
    expect(MIGRATIONS[71](structuredClone(none))).toEqual(none);
  });

  it('keeps the steps of a call whose forks are all countable', () => {
    const fine = structuredClone(FORMAT_2_71) as unknown as Saved;
    fine.player.call.vars.way.steps = [{ do: 'turn', at: { kind: 'fork', nth: 3 } }];
    fine.player.call.line.vars.way.steps = [{ do: 'turn', at: { kind: 'fork', nth: 3 } }];
    expect(MIGRATIONS[71](structuredClone(fine) as never)).toEqual(fine);
  });
});

describe('save migration 72 to 73', () => {
  it('has a run parked at its paid next outpost wait there for the road', () => {
    expect(MIGRATIONS[72](structuredClone(FORMAT_2_72))).toEqual({ ...FORMAT_2_72, furyRoad: { ...FORMAT_2_72.furyRoad, waitingAt: 2 } });
  });

  it('has a run on the road wait nowhere', () => {
    const run = { ...structuredClone(FORMAT_2_72.furyRoad), outposts: [FORMAT_2_72.furyRoad.outposts[0], { ...FORMAT_2_72.furyRoad.outposts[1], paid: false }] };
    const world = { ...structuredClone(FORMAT_2_72), furyRoad: run };

    expect(MIGRATIONS[72](structuredClone(world))).toEqual({ ...world, furyRoad: { ...run, waitingAt: null } });
  });

  it('keeps a world with no run as it is', () => {
    const roaming = { ...structuredClone(FORMAT_2_72), furyRoad: null };

    expect(MIGRATIONS[72](structuredClone(roaming))).toEqual(roaming);
  });
});

describe('save migration 73 to 74', () => {
  it('drops the quiet gap and lets every saved group come at once with plain gear', () => {
    const { quietFrom: _quietFrom, ...run } = FORMAT_2_73.furyRoad;
    const groups = FORMAT_2_73.furyRoad.groups.map((group) => ({ ...group, at: 0, money: 20000, elite: false }));

    expect(MIGRATIONS[73](structuredClone(FORMAT_2_73))).toEqual({ ...FORMAT_2_73, furyRoad: { ...run, groups } });
  });

  it('keeps a world with no run as it is', () => {
    const roaming = { ...structuredClone(FORMAT_2_73), furyRoad: null };

    expect(MIGRATIONS[73](structuredClone(roaming))).toEqual(roaming);
  });
});

describe('save migration 74 to 75', () => {
  it('keeps a save as it is, since survey contracts are a new variant no old save holds', () => {
    expect(MIGRATIONS[74](structuredClone(FORMAT_2_73))).toEqual(FORMAT_2_73);
  });
});

describe('save migration 75 to 76', () => {
  it('gives every posted and held claim no rival, no leads and a rival turn at its deadline, and leaves other contracts be', () => {
    const next = MIGRATIONS[75](structuredClone(FORMAT_2_75)) as typeof FORMAT_2_75;
    const [fetch, posted] = next.shops.bowl.contracts;
    const [held, haul] = next.player.contracts;
    expect(fetch).toEqual(FORMAT_2_75.shops.bowl.contracts[0]);
    expect(posted).toEqual({ ...FORMAT_2_75.shops.bowl.contracts[1], rivalAt: 1400, rival: null, leads: [] });
    expect(held).toEqual({ ...FORMAT_2_75.player.contracts[0], rivalAt: 1100, rival: null, leads: [] });
    expect(haul).toEqual(FORMAT_2_75.player.contracts[1]);
    expect(next.turn).toBe(530);
  });
});

describe('save migration 76 to 77', () => {
  it('keeps a save as it is, since crews, hires and the muster goal only widen unions', () => {
    const before = structuredClone(FORMAT_2_74);

    const next = MIGRATIONS[76](before);

    expect(next).toEqual(FORMAT_2_74);
    expect(before).toEqual(FORMAT_2_74);
  });

  it('keeps saved escorts, tow promises and feuds with their kinds and data', () => {
    const states = [
      { id: 's1', kind: 'escort', holder: 'v2', other: 'v3', turnsLeft: null, born: 10, data: { kind: 'escort', site: 'nose', fee: 4000 } },
      { id: 's2', kind: 'towPromise', holder: 'v4', other: 'v1', turnsLeft: null, born: 12, data: { kind: 'towPromise', site: 'bowl', fee: 900 } },
      { id: 's3', kind: 'feud', holder: 'v5', other: 'v1', turnsLeft: 7, born: 30, data: { kind: 'feud', robbery: true } },
    ];
    const world = { ...structuredClone(FORMAT_2_74), states };

    expect(MIGRATIONS[76](structuredClone(world))).toEqual(world);
  });
});

describe('save migration 77 to 78', () => {
  type Quests = { world: Record<string, unknown>; local: Record<string, unknown>; session: unknown };
  const withQuests = (quests: Partial<Quests>) => {
    const world = structuredClone(FORMAT_2_61) as unknown as { player: { quests: Quests } };
    world.player.quests = { world: {}, local: {}, session: null, ...quests };
    return world;
  };
  const stepped = (world: object) => MIGRATIONS[77](structuredClone(world) as SavedJson) as unknown as { player: { quests: Quests } };

  it('marks Hattie met for a save that was towed to Bowl', () => {
    const next = stepped(withQuests({ world: { towed_to_bowl: true, intro_step: 'done' } }));
    expect(next.player.quests.world).toEqual({ towed_to_bowl: true, intro_step: 'done', hattie_met: true });
  });

  it('marks Hattie met for a save with a saved talk of hers', () => {
    const next = stepped(withQuests({ world: { intro_step: 'done' }, local: { bowl_hattie: { hattie_rumor: true } } }));
    expect(next.player.quests.world.hattie_met).toBe(true);
  });

  it('leaves a save that never met her as it is', () => {
    const before = withQuests({ world: { intro_step: 'drive' }, local: { bowl_hattie: {} } });
    expect(stepped(before)).toEqual(before);
  });

  it('changes nothing else', () => {
    const before = withQuests({ world: { towed_to_bowl: true } });
    const next = stepped(before);
    expect({ ...next, player: { ...next.player, quests: before.player.quests } }).toEqual(before);
  });
});

describe('save migration 78 to 79', () => {
  type Quests = { world: Record<string, unknown>; local: Record<string, Record<string, unknown>>; session: unknown };
  type Saved = { player: { quests: Quests; notes: { id: string; turn: number }[] } };
  const saved = (quests: Partial<Quests>, notes: { id: string; turn: number }[]): Saved => {
    const world = structuredClone(FORMAT_2_61) as unknown as Saved;
    world.player.quests = { world: {}, local: {}, session: null, ...quests };
    world.player.notes = notes;
    return world;
  };
  const stepped = (world: Saved) => MIGRATIONS[78](structuredClone(world) as unknown as SavedJson) as unknown as Saved;

  it('moves the wagon half from wagon_pin to wagon_rod and Lena\'s asked mark to asked_rods, keeping their values', () => {
    const before = saved(
      { world: { wagon_seen: true, wagon_pin: 'held', wagon_fate: 'none' }, local: { nose_lena: { heard_swivel: true, asked_pins: true, heard_brann: true } }, session: { quest: 'wagon_bench', checkpoint: 'bench.report', seed: 17 } },
      [{ id: 'wagonBowl', turn: 3 }, { id: 'wagonPin', turn: 40 }, { id: 'talkOnePin', turn: 41 }],
    );

    const next = stepped(before);

    expect(next.player.quests).toEqual({
      world: { wagon_seen: true, wagon_rod: 'held', wagon_fate: 'none' },
      local: { nose_lena: { heard_swivel: true, asked_rods: true, heard_brann: true } },
      session: { quest: 'wagon_bench', checkpoint: 'bench.report', seed: 17 },
    });
    expect(next.player.notes).toEqual([{ id: 'wagonBowl', turn: 3 }, { id: 'wagonRod', turn: 40 }, { id: 'talkBrakeRod', turn: 41 }]);
  });

  it('leaves a save that never found the wagon as it was', () => {
    const before = saved({ world: { intro_step: 'done' } }, [{ id: 'greenPit', turn: 5 }]);
    expect(stepped(before)).toEqual(before);
  });

  it('changes nothing else', () => {
    const before = saved({ world: { wagon_pin: 'bent' } }, [{ id: 'wagonPin', turn: 9 }]);
    const next = stepped(before);
    expect({ ...next, player: { ...next.player, quests: before.player.quests, notes: before.player.notes } }).toEqual(before);
  });
});

describe('save migration 79 to 80', () => {
  type Quests = { world: Record<string, unknown>; local: Record<string, Record<string, unknown>>; session: unknown };
  type Saved = { player: { quests: Quests } };
  const saved = (quests: Partial<Quests>): Saved => {
    const world = structuredClone(FORMAT_2_61) as unknown as Saved;
    world.player.quests = { world: {}, local: {}, session: null, ...quests };
    return world;
  };
  const stepped = (world: Saved) => MIGRATIONS[79](structuredClone(world) as unknown as SavedJson) as unknown as Saved;

  it('drops the Varga truck mark and Hattie\'s Varga questions, keeping her other answers and an open talk', () => {
    const before = saved({
      world: { towed_to_bowl: true, varga_truck_known: true, hattie_met: true },
      local: { bowl_hattie: { hattie_tow: true, hattie_varga: true, hattie_farm: true, hattie_rumor: true } },
      session: { quest: 'bowl_hattie', checkpoint: 'start.hub', seed: 4 },
    });

    expect(stepped(before).player.quests).toEqual({
      world: { towed_to_bowl: true, hattie_met: true },
      local: { bowl_hattie: { hattie_tow: true, hattie_rumor: true } },
      session: { quest: 'bowl_hattie', checkpoint: 'start.hub', seed: 4 },
    });
  });

  it('removes a Hattie entry that held only the Varga questions', () => {
    const before = saved({ local: { bowl_hattie: { hattie_varga: true } } });
    expect(stepped(before).player.quests.local).toEqual({});
  });

  it('leaves a save that never asked about the Vargas as it was', () => {
    const before = saved({ world: { intro_step: 'done' }, local: { bowl_hattie: { hattie_rumor: true } } });
    expect(stepped(before)).toEqual(before);
  });

  it('changes nothing else', () => {
    const before = saved({ world: { varga_truck_known: true } });
    const next = stepped(before);
    expect({ ...next, player: { ...next.player, quests: before.player.quests } }).toEqual(before);
  });
});

describe('save migration 80 to 81', () => {
  it('keeps a save as it is, since ship relics are only a new key in loot goods and shop pressure', () => {
    const before = structuredClone(FORMAT_2_75);

    const next = MIGRATIONS[80](before);

    expect(next).toEqual(FORMAT_2_75);
    expect(before).toEqual(FORMAT_2_75);
  });
});

describe('save migration 81 to 82', () => {
  type Goal = { kind: string; destination: { x: number; y: number } | null; heard?: { x: number; y: number } };
  type Saved = { vehicles: { brain: { goals: Goal[] } | null }[] };
  const withGoals = (goals: Goal[]): Saved => {
    const world = structuredClone(FORMAT_2_70) as unknown as Saved;
    for (const v of world.vehicles) if (v.brain) v.brain.goals = structuredClone(goals);
    return world;
  };
  const goalsAfter = (world: Saved) => (MIGRATIONS[81](structuredClone(world) as unknown as SavedJson) as unknown as Saved).vehicles.find((v) => v.brain)!.brain!.goals;

  it('gives an investigation its destination as the heard centre', () => {
    const goals = goalsAfter(withGoals([{ kind: 'investigate', destination: { x: 12, y: 30 } }]));
    expect(goals[0].heard).toEqual({ x: 12, y: 30 });
    expect(goals[0].heard).not.toBe(goals[0].destination);
  });

  it('leaves other goals and a goal that already heard alone', () => {
    const before = [{ kind: 'travel', destination: { x: 1, y: 2 } }, { kind: 'investigate', destination: { x: 5, y: 5 }, heard: { x: 4, y: 4 } }];
    expect(goalsAfter(withGoals(before))).toEqual(before);
  });
});

describe('MIGRATIONS[82]', () => {
  type Shop = { goods: Record<string, number>; contracts: { id: string }[]; event: unknown; shortSince: unknown; opened: unknown; pressure?: unknown };
  const migrated = () => MIGRATIONS[82](structuredClone(FORMAT_2_82)) as unknown as { shops: Record<string, Shop>; vehicles: { id: string; job: unknown; brain: { goals: { kind: string; load?: unknown }[] } | null }[]; roadNews: unknown[]; player: unknown };

  it('gives every shop a goods stock from its old pressure and drops the pressure', () => {
    const next = migrated();
    for (const shop of Object.values(next.shops)) {
      expect(shop.pressure).toBeUndefined();
      expect(shop).toMatchObject({ event: null, shortSince: {}, opened: {} });
    }
    expect(next.shops.nose.goods.salt).toBe(150);
    expect(next.shops.bowl.goods.fuelDrums).toBe(0);
    expect(next.shops.bowl.goods.water).toBe(240);
    expect(next.shops.bowl.goods.rations).toBe(120);
    expect(next.shops.nose.goods.relics).toBe(0);
    expect(next.shops.granary.goods.textiles).toBeUndefined();
    expect(Object.keys(next.shops.granary.goods).sort()).toEqual(['fuelDrums', 'grain', 'rations', 'salt', 'tools', 'water']);
  });

  it('keeps a buy price on load within a cent where the good is made in the same place as before', () => {
    const next = migrated();
    const before = priceAtPressure('nose', 'salt', FORMAT_2_82.shops.nose.pressure.salt, 'buy', ECONOMY.spread);
    const after = priceAtPressure('nose', 'salt', pressureOf('nose', 'salt', next.shops.nose.goods.salt), 'buy', ECONOMY.spread);
    expect(Math.abs(after - before)).toBeLessThanOrEqual(1);
  });

  it('drops board hauls of goods a shop no longer trades, and keeps the held contract and cargo', () => {
    const next = migrated();
    expect(next.shops.granary.contracts.map((c) => c.id)).toEqual(['ct-3']);
    expect(next.player).toEqual(FORMAT_2_82.player);
    expect(next.vehicles[0]).toEqual(FORMAT_2_82.vehicles[0]);
  });

  it('drops the free haul goals and their business, so the driver picks a new goal', () => {
    const next = migrated();
    expect(next.vehicles[1].brain!.goals).toEqual([]);
    expect(next.vehicles[1].job).toBeNull();
  });
});

describe('MIGRATIONS[83]', () => {
  type Shops = Record<string, { stock: { defId: string }[]; restockAt: number }>;
  const shopsOf = (world: unknown) => (world as { shops: Shops }).shops;
  const withShelves = () => {
    const world = structuredClone(FORMAT_2_82) as unknown as { shops: Shops };
    world.shops.bowl.stock = [{ defId: 'mg' }];
    world.shops.nose.stock = [{ defId: 'mg' }, { defId: 'stockEngine' }];
    world.shops['salvage-yard'].stock = [{ defId: 'mg' }];
    return world;
  };

  it('restocks a Bowl or Nose shelf with no stock engine on the saved turn and leaves the rest alone', () => {
    const before = withShelves();
    const next = MIGRATIONS[83](structuredClone(before) as never);

    expect(shopsOf(next).bowl.restockAt).toBe(FORMAT_2_82.turn);
    expect(shopsOf(next).nose.restockAt).toBe(before.shops.nose.restockAt);
    expect(shopsOf(next)['salvage-yard']).toEqual(before.shops['salvage-yard']);
    expect({ ...next, shops: { ...shopsOf(next), bowl: before.shops.bowl } }).toEqual(before);
  });
});

describe('MIGRATIONS[84]', () => {
  type Saved = { player: { call: unknown } };
  const base = () => MIGRATIONS[83](MIGRATIONS[82](structuredClone(FORMAT_2_82))) as unknown as Saved;
  const haul = { kind: 'haul', goods: { scrap: 2 }, parts: [] };
  const withCall = (topic: string, vars: Record<string, unknown>): Saved => {
    const world = base();
    world.player.call = { with: 'npc-1', topic, node: 'start', vars, line: { line: 'demand', vars } };
    return world;
  };
  const step = (world: Saved) => MIGRATIONS[84](world as never) as unknown as Saved;

  it.each(['demand', 'truce', 'mercy'])('drops an open %s call that names cargo and a price', (topic) => {
    expect(step(withCall(topic, { haul, price: { kind: 'money', amount: 1266 } })).player.call).toBeNull();
  });

  it('keeps a cash-only demand call', () => {
    const world = withCall('demand', { price: { kind: 'money', amount: 500 } });
    expect(step(structuredClone(world))).toEqual(world);
  });

  it('keeps a world with no call', () => {
    const world = base();
    world.player.call = null;
    expect(step(structuredClone(world))).toEqual(world);
  });
});
