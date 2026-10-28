import { describe, expect, it } from 'vitest';
import type { CallVars } from '../sim/types';
import type { LineId } from '../data/dialogue';
import { resolve } from '../text/resolve';
import { lineText } from '../ui/dialogue';
import { ECONOMY } from '../data/goods';
import { pressureOf, priceAtPressure } from '../sim/market';
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
import FORMAT_2_80 from './save-fixtures/format-2-80.json';
import FORMAT_2_86 from './save-fixtures/format-2-86.json';
import FORMAT_2_87 from './save-fixtures/format-2-87.json';
import FORMAT_2_90 from './save-fixtures/format-2-90.json';
import FORMAT_2_94 from './save-fixtures/format-2-94.json';
import FORMAT_2_95 from './save-fixtures/format-2-95.json';
import FORMAT_2_96 from './save-fixtures/format-2-96.json';
import FORMAT_2_97 from './save-fixtures/format-2-97.json';
import FORMAT_2_98 from './save-fixtures/format-2-98.json';
import FORMAT_2_99 from './save-fixtures/format-2-99.json';
import FORMAT_2_101 from './save-fixtures/format-2-101.json';
import FORMAT_2_85 from './save-fixtures/format-2-85.json';
import FORMAT_2_74 from './save-fixtures/format-2-74.json';
import FORMAT_2_82 from './save-fixtures/format-2-82.json';
import FORMAT_2_84 from './save-fixtures/format-2-84.json';
import { RELEASE_STEPS, TINY_FROM, TINY_STEPS as STEPS, type SavedJson } from './save-migrations';

const TINY_STEPS: Record<number, (world: SavedJson) => SavedJson> = Object.fromEntries(STEPS.map((named, i) => [TINY_FROM + i, named.step]));

describe('save migration 63 to 64', () => {
  it('keeps every contract as it is, since old saves hold no rescue and the new kind adds no field to the others', () => {
    const next = TINY_STEPS[63](structuredClone(FORMAT_2_62));

    expect(next).toEqual(FORMAT_2_62);
  });
});

describe('save migration 64 to 65', () => {
  it('gives an old save an idle encounter log and changes nothing else', () => {
    const next = TINY_STEPS[64](structuredClone(FORMAT_2_64)) as { player: { encounters: unknown; money: number } };

    expect(next.player.encounters).toEqual({ next: 0, pending: null, story: null });
    expect(next.player.money).toBe(1200);
    expect({ ...next, player: { ...next.player, encounters: undefined } }).toEqual({ ...FORMAT_2_64, player: { ...FORMAT_2_64.player, encounters: undefined } });
  });

  it('keeps an encounter log that is already there', () => {
    const log = { next: 40, pending: null, story: null };
    const world = { ...structuredClone(FORMAT_2_64), player: { ...FORMAT_2_64.player, encounters: log } };

    expect(TINY_STEPS[64](structuredClone(world))).toEqual(world);
  });
});

describe('TINY_STEPS[65]', () => {
  it('anchors each saved progress at the truck position and leaves other trucks alone', () => {
    const next = TINY_STEPS[65](structuredClone(FORMAT_2_64)) as { vehicles: { brain: { progress?: { key: string; since: number; at: { x: number; y: number } } } | null }[] };

    expect(next.vehicles[0].brain!.progress).toEqual({ key: '41,77 explore:null:explore -', since: 231, at: { x: 41.5, y: 77.25 } });
    expect(next.vehicles[1]).toEqual(FORMAT_2_64.vehicles[1]);
    expect(next.vehicles[2]).toEqual(FORMAT_2_64.vehicles[2]);
  });
});

describe('TINY_STEPS[66]', () => {
  it('keeps a save with an armed ram and its order as it is', () => {
    const before = structuredClone(FORMAT_2_64);

    const next = TINY_STEPS[66](before);

    expect(next).toEqual(FORMAT_2_64);
    expect(before).toEqual(FORMAT_2_64);
  });
});

describe('TINY_STEPS[67]', () => {
  const callOf = (world: unknown) => (world as { player: { call: unknown } }).player.call;
  const saying = (line: string) => {
    const world = structuredClone(FORMAT_2_67) as { player: { call: { line: { line: string } } } };
    world.player.call.line.line = line;
    return world;
  };

  it('hangs up a call on the old town bearing line and keeps every other field', () => {
    const next = TINY_STEPS[67](structuredClone(FORMAT_2_67));
    expect(callOf(next)).toBeNull();
    expect({ ...next, player: { ...(next.player as object), call: null } }).toEqual({ ...FORMAT_2_67, player: { ...FORMAT_2_67.player, call: null } });
  });

  it('hangs up a call on the old site and wreck bearing lines', () => {
    expect(callOf(TINY_STEPS[67](saying('siteBearing')))).toBeNull();
    expect(callOf(TINY_STEPS[67](saying('aWreckNobodyPicked')))).toBeNull();
  });

  it('keeps a call on another line and a save with no call as they are', () => {
    const other = saying('heardYou');
    expect(TINY_STEPS[67](structuredClone(other))).toEqual(other);
    const none = { turn: 3, player: { call: null } };
    expect(TINY_STEPS[67](structuredClone(none))).toEqual(none);
  });
});

describe('save migration 68 to 69', () => {
  it('keeps a held search and a driver sighting as they are, since both only add union members', () => {
    expect(TINY_STEPS[68](structuredClone(FORMAT_2_68))).toEqual(FORMAT_2_68);
  });
});

describe('save migration 69 to 70', () => {
  const migrated = () => TINY_STEPS[69](structuredClone(FORMAT_2_69)) as typeof FORMAT_2_69;

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
    expect((TINY_STEPS[69](save) as typeof FORMAT_2_69).player.call).toEqual(save.player.call);
  });
});

describe('TINY_STEPS[70]', () => {
  const next = TINY_STEPS[70](structuredClone(FORMAT_2_70)) as { player: Record<string, unknown>; vehicles: { id: string; faction: string }[]; states: unknown[] };
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

describe('TINY_STEPS[71]', () => {
  type Saved = { player: { money: number; call: { vars: { way: { steps: { do: string; at?: unknown }[] } }; line: { vars: { way: { steps: { do: string; at?: unknown }[] } } } } } };
  const next = () => TINY_STEPS[71](structuredClone(FORMAT_2_71)) as unknown as Saved;

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
    const { call } = (TINY_STEPS[71](only as never) as unknown as Saved).player;
    expect(call.vars.way.steps).toEqual([{ do: 'askAgain' }]);
    expect(call.line.vars.way.steps).toEqual([{ do: 'askAgain' }]);
  });

  it('keeps the rest of the world and a save with no call as they are', () => {
    const { player, ...rest } = next() as unknown as { player: { money: number; call: object }; turn: number };
    expect(rest).toEqual({ turn: 3 });
    expect(player.money).toBe(1200);
    const none = { turn: 3, player: { call: null } };
    expect(TINY_STEPS[71](structuredClone(none))).toEqual(none);
  });

  it('keeps the steps of a call whose forks are all countable', () => {
    const fine = structuredClone(FORMAT_2_71) as unknown as Saved;
    fine.player.call.vars.way.steps = [{ do: 'turn', at: { kind: 'fork', nth: 3 } }];
    fine.player.call.line.vars.way.steps = [{ do: 'turn', at: { kind: 'fork', nth: 3 } }];
    expect(TINY_STEPS[71](structuredClone(fine) as never)).toEqual(fine);
  });
});

describe('save migration 72 to 73', () => {
  it('has a run parked at its paid next outpost wait there for the road', () => {
    expect(TINY_STEPS[72](structuredClone(FORMAT_2_72))).toEqual({ ...FORMAT_2_72, furyRoad: { ...FORMAT_2_72.furyRoad, waitingAt: 2 } });
  });

  it('has a run on the road wait nowhere', () => {
    const run = { ...structuredClone(FORMAT_2_72.furyRoad), outposts: [FORMAT_2_72.furyRoad.outposts[0], { ...FORMAT_2_72.furyRoad.outposts[1], paid: false }] };
    const world = { ...structuredClone(FORMAT_2_72), furyRoad: run };

    expect(TINY_STEPS[72](structuredClone(world))).toEqual({ ...world, furyRoad: { ...run, waitingAt: null } });
  });

  it('keeps a world with no run as it is', () => {
    const roaming = { ...structuredClone(FORMAT_2_72), furyRoad: null };

    expect(TINY_STEPS[72](structuredClone(roaming))).toEqual(roaming);
  });
});

describe('save migration 73 to 74', () => {
  it('drops the quiet gap and lets every saved group come at once with plain gear', () => {
    const { quietFrom: _quietFrom, ...run } = FORMAT_2_73.furyRoad;
    const groups = FORMAT_2_73.furyRoad.groups.map((group) => ({ ...group, at: 0, money: 20000, elite: false }));

    expect(TINY_STEPS[73](structuredClone(FORMAT_2_73))).toEqual({ ...FORMAT_2_73, furyRoad: { ...run, groups } });
  });

  it('keeps a world with no run as it is', () => {
    const roaming = { ...structuredClone(FORMAT_2_73), furyRoad: null };

    expect(TINY_STEPS[73](structuredClone(roaming))).toEqual(roaming);
  });
});

describe('save migration 74 to 75', () => {
  it('keeps a save as it is, since survey contracts are a new variant no old save holds', () => {
    expect(TINY_STEPS[74](structuredClone(FORMAT_2_73))).toEqual(FORMAT_2_73);
  });
});

describe('save migration 75 to 76', () => {
  it('gives every posted and held claim no rival, no leads and a rival turn at its deadline, and leaves other contracts be', () => {
    const next = TINY_STEPS[75](structuredClone(FORMAT_2_75)) as typeof FORMAT_2_75;
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

    const next = TINY_STEPS[76](before);

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

    expect(TINY_STEPS[76](structuredClone(world))).toEqual(world);
  });
});

describe('save migration 77 to 78', () => {
  type Quests = { world: Record<string, unknown>; local: Record<string, unknown>; session: unknown };
  const withQuests = (quests: Partial<Quests>) => {
    const world = structuredClone(FORMAT_2_61) as unknown as { player: { quests: Quests } };
    world.player.quests = { world: {}, local: {}, session: null, ...quests };
    return world;
  };
  const stepped = (world: object) => TINY_STEPS[77](structuredClone(world) as SavedJson) as unknown as { player: { quests: Quests } };

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
  const stepped = (world: Saved) => TINY_STEPS[78](structuredClone(world) as unknown as SavedJson) as unknown as Saved;

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
  const stepped = (world: Saved) => TINY_STEPS[79](structuredClone(world) as unknown as SavedJson) as unknown as Saved;

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

    const next = TINY_STEPS[80](before);

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
  const goalsAfter = (world: Saved) => (TINY_STEPS[81](structuredClone(world) as unknown as SavedJson) as unknown as Saved).vehicles.find((v) => v.brain)!.brain!.goals;

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

describe('TINY_STEPS[82]', () => {
  type Shop = { goods: Record<string, number>; contracts: { id: string }[]; event: unknown; shortSince: unknown; opened: unknown; pressure?: unknown };
  const migrated = () => TINY_STEPS[82](structuredClone(FORMAT_2_82)) as unknown as { shops: Record<string, Shop>; vehicles: { id: string; job: unknown; brain: { goals: { kind: string; load?: unknown }[] } | null }[]; roadNews: unknown[]; player: unknown };

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

describe('TINY_STEPS[83]', () => {
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
    const next = TINY_STEPS[83](structuredClone(before) as never);

    expect(shopsOf(next).bowl.restockAt).toBe(FORMAT_2_82.turn);
    expect(shopsOf(next).nose.restockAt).toBe(before.shops.nose.restockAt);
    expect(shopsOf(next)['salvage-yard']).toEqual(before.shops['salvage-yard']);
    expect({ ...next, shops: { ...shopsOf(next), bowl: before.shops.bowl } }).toEqual(before);
  });
});

describe('save migration 84 to 85', () => {
  it('gives a Roaming world a standing Sunward order and the player the Sunward start standing', () => {
    const before = structuredClone(FORMAT_2_84);

    const next = TINY_STEPS[84](before) as typeof FORMAT_2_84 & { sunward: unknown; player: { standing: Record<string, number> } };

    expect(next.sunward).toEqual({ collapsed: null, night: null, lastHunt: null });
    expect(next.player.standing).toEqual({ ...FORMAT_2_84.player.standing, sunward: -20 });
    expect(next.vehicles).toEqual(FORMAT_2_84.vehicles);
    expect(next.player.money).toBe(4200);
    expect(before).toEqual(FORMAT_2_84);
  });

  it('gives a Chaos Highway world no order', () => {
    const highway = { ...structuredClone(FORMAT_2_84), setup: { ...FORMAT_2_84.setup, mode: 'furyRoad' }, furyRoad: { window: 0 } };

    const next = TINY_STEPS[84](highway) as typeof highway & { sunward: unknown };

    expect(next.sunward).toBeNull();
    expect(next.furyRoad).toEqual({ window: 0 });
  });
});

describe('save migration 85 to 86', () => {
  type Saved = { vehicles: { id: string; pos: { x: number; y: number }; brain: { home: { x: number; y: number } } | null }[] };

  it('moves each Sunward car home to the fort bay of the same index and moves no car', () => {
    const before = structuredClone(FORMAT_2_85);

    const next = TINY_STEPS[85](before) as unknown as Saved;

    const home = (id: string) => next.vehicles.find((v) => v.id === id)!.brain!.home;
    expect(home('v31')).toEqual({ x: 284.053, y: 243.604 });
    expect(home('v32')).toEqual({ x: 269.787, y: 236.358 });
    expect(home('v40')).toEqual({ x: 351.2, y: 334 });
    expect(next.vehicles.map((v) => v.pos)).toEqual(FORMAT_2_85.vehicles.map((v) => v.pos));
    expect(before).toEqual(FORMAT_2_85);
  });

  it('passes a world with no Sunward car unchanged', () => {
    const quiet = { ...structuredClone(FORMAT_2_85), vehicles: FORMAT_2_85.vehicles.filter((v) => v.faction !== 'sunward') };

    expect(TINY_STEPS[85](quiet)).toEqual(quiet);
  });

  it('throws on a Sunward car whose home is no bay of the old Hollow', () => {
    const lost = structuredClone(FORMAT_2_85);
    lost.vehicles[1].brain!.home = { x: 10, y: 10 };

    expect(() => TINY_STEPS[85](lost)).toThrow(/no bay of the old Hollow/);
  });
});

describe('save migration 86 to 87', () => {
  it('gives the night of the vigil an empty list of words given and keeps the rest', () => {
    const before = structuredClone(FORMAT_2_86);

    const next = TINY_STEPS[86](before) as typeof FORMAT_2_86 & { sunward: { night: { offered: string[] } } };

    expect(next.sunward.night).toEqual({ ...FORMAT_2_86.sunward.night, offered: [] });
    expect(next.vehicles).toEqual(FORMAT_2_86.vehicles);
    expect(before).toEqual(FORMAT_2_86);
  });

  it('passes a world with no night open, or no order, unchanged', () => {
    const day = { ...structuredClone(FORMAT_2_86), sunward: { ...FORMAT_2_86.sunward, night: null } };
    const highway = { ...structuredClone(FORMAT_2_86), sunward: null };

    expect(TINY_STEPS[86](day)).toEqual(day);
    expect(TINY_STEPS[86](highway)).toEqual(highway);
  });
});

describe('save migration 87 to 88', () => {
  type Step = { do: string; heading?: unknown };
  type Saved = { turn: number; player: { money: number; call: { vars: Record<string, { kind: string; steps?: Step[] }>; line: { line: string; vars: Record<string, { kind: string; steps?: Step[] }> } } | null } };
  const migrate = (world: unknown) => TINY_STEPS[87](structuredClone(world) as never) as unknown as Saved;

  it('marks every follow step of an open directions answer as planned before headings', () => {
    const next = migrate(FORMAT_2_87);
    for (const vars of [next.player.call!.vars, next.player.call!.line.vars]) {
      const steps = vars.way.steps!;
      expect(steps.filter((s) => s.do === 'follow').map((s) => s.heading)).toEqual([null]);
      expect(steps.filter((s) => s.do !== 'follow').every((s) => !('heading' in s))).toBe(true);
    }
  });

  it('changes nothing else in the save', () => {
    const next = migrate(FORMAT_2_87);
    const strip = (vars: Record<string, { kind: string; steps?: Step[] }>) => ({ ...vars, way: { ...vars.way, steps: vars.way.steps!.map(({ heading: _heading, ...rest }) => rest) } });
    expect({ ...next, player: { ...next.player, call: { ...next.player.call!, vars: strip(next.player.call!.vars), line: { ...next.player.call!.line, vars: strip(next.player.call!.line.vars) } } } }).toEqual(FORMAT_2_87);
  });

  it('reads a migrated answer with the words it had before headings, in both languages', () => {
    const call = migrate(FORMAT_2_87).player.call!;
    const said = (locale: 'en' | 'ru') => resolve(lineText(call.line.line as LineId, call.line.vars as CallVars), locale);
    expect(said('en')).toContain('Take the road to Bowl.');
    expect(said('ru').length).toBeGreaterThan(0);
  });

  it('passes a save with no call or no directions answer unchanged', () => {
    const noCall = { ...FORMAT_2_87, player: { ...FORMAT_2_87.player, call: null } };
    expect(migrate(noCall)).toEqual(noCall);
    const town = { town: FORMAT_2_87.player.call.vars.town };
    const noWay = { ...FORMAT_2_87, player: { ...FORMAT_2_87.player, call: { ...FORMAT_2_87.player.call, vars: town, line: { ...FORMAT_2_87.player.call.line, vars: town } } } };
    expect(migrate(noWay)).toEqual(noWay);
  });
});

describe('save migration 88 to 89', () => {
  type Quests = { world: Record<string, unknown>; local: Record<string, Record<string, unknown>>; session: unknown };
  type Saved = { player: { quests: Quests } };
  const saved = (quests: Partial<Quests>): Saved => {
    const world = structuredClone(FORMAT_2_61) as unknown as Saved;
    world.player.quests = { world: {}, local: {}, session: null, ...quests };
    return world;
  };
  const stepped = (world: Saved) => TINY_STEPS[88](structuredClone(world) as unknown as SavedJson) as unknown as Saved;

  it('renames Kovac\'s gate law marks to the mount marks, keeping their values', () => {
    const before = saved({ world: { intro_step: 'done' }, local: { nose_kovac: { heard_workshop: true, heard_gate_law: true, asked_gate_law: false, heard_paper: true } } });

    const next = stepped(before);

    expect(next.player.quests).toEqual({
      world: { intro_step: 'done' },
      local: { nose_kovac: { heard_workshop: true, heard_mounts: true, asked_mounts: false, heard_paper: true } },
      session: null,
    });
  });

  it('leaves a save that never met Kovac as it was', () => {
    const before = saved({ world: { intro_step: 'done' } });

    expect(stepped(before)).toEqual(before);
  });
});

describe('save migration 89 to 90', () => {
  it('keeps a save as it is, since look-overs, sized-up trucks and rank 1 basics are new state kinds or derived from ranks', () => {
    const before = structuredClone(FORMAT_2_87);

    const next = TINY_STEPS[89](before as unknown as SavedJson);

    expect(next).toEqual(FORMAT_2_87);
    expect(before).toEqual(FORMAT_2_87);
  });
});

describe('save migration 90 to 91', () => {
  type Quests = { world: Record<string, unknown>; local: Record<string, Record<string, unknown>>; session: { quest: string; checkpoint: string; seed: number } | null };
  type Saved = { player: { quests: Quests } };
  const saved = (quests: Partial<Quests>): Saved => {
    const world = structuredClone(FORMAT_2_61) as unknown as Saved;
    world.player.quests = { world: {}, local: {}, session: null, ...quests };
    return world;
  };
  const stepped = (world: Saved) => TINY_STEPS[90](structuredClone(world) as unknown as SavedJson) as unknown as Saved;

  it('drops the twelfth scene, its gate and the answers the short scenes no longer read, keeping the other gates', () => {
    const before = saved({
      world: { ala_hired: true, road_seen_1: true, road_seen_4: true, road_seen_12: true, geezer_pitch: 'link', ring_told: 'told', death_answer: 'road', why_answer: 'pay', ala_knows: 'ring', father_told: true, promised: true, hand_shook: true },
      local: { road_stretch_12: { pass_said: true }, road_stretch_4: { asked_trailer: true, asked_north: true, asked_hunters: true }, road_stretch_8: { asked_run: true, grief_said: 'sorry' } },
    });

    expect(stepped(before).player.quests).toEqual({ world: { ala_hired: true, road_seen_1: true, road_seen_4: true, geezer_pitch: 'link' }, local: {}, session: null });
  });

  it('drops the hiring questions that are gone and keeps the pay question', () => {
    const before = saved({ local: { road_hire: { asked_pay: true, asked_north: true, asked_who: true, asked_trailer: true, walked_out: true } } });
    expect(stepped(before).player.quests.local).toEqual({ road_hire: { asked_pay: true } });
  });

  it('moves an open scene to its start, whichever page it stood on', () => {
    for (const [quest, checkpoint] of [['road_stretch_1', 'start.tougher'], ['road_stretch_4', 'start.hub'], ['road_stretch_8', 'start.close']]) {
      const before = saved({ session: { quest, checkpoint, seed: 3 } });
      expect(stepped(before).player.quests.session).toEqual({ quest, checkpoint: 'start', seed: 3 });
    }
  });

  it('closes an open twelfth scene and leaves the hiring scene open on its own page', () => {
    expect(stepped(saved({ session: { quest: 'road_stretch_12', checkpoint: 'start.hub', seed: 3 } })).player.quests.session).toBeNull();
    const hiring = { quest: 'road_hire', checkpoint: 'start.hub', seed: 3 };
    expect(stepped(saved({ session: hiring })).player.quests.session).toEqual(hiring);
  });

  it('changes nothing else', () => {
    const before = saved({ world: { road_seen_12: true } });
    const next = stepped(before);
    expect({ ...next, player: { ...next.player, quests: before.player.quests } }).toEqual(before);
  });
});

describe('save migration 91 to 92', () => {
  type Quests = { world: Record<string, unknown>; local: Record<string, Record<string, unknown>>; session: { quest: string; checkpoint: string; seed: number } | null };
  type Saved = { player: { quests: Quests } };
  const saved = (quests: Partial<Quests>): Saved => {
    const world = structuredClone(FORMAT_2_61) as unknown as Saved;
    world.player.quests = { world: {}, local: {}, session: null, ...quests };
    return world;
  };
  const stepped = (world: Saved) => TINY_STEPS[91](structuredClone(world) as unknown as SavedJson) as unknown as Saved;

  it('drops the scar pick and the old hiring scene questions, keeping the hire', () => {
    const before = saved({ world: { ala_hired: true, road_seen_1: true, geezer_pitch: 'link' }, local: { road_hire: { asked_pay: true }, bowl_scale: { asked_pay: true } } });
    expect(stepped(before).player.quests).toEqual({ world: { ala_hired: true, road_seen_1: true }, local: { bowl_scale: { asked_pay: true } }, session: null });
  });

  it('moves an open hiring scene to the start of the renamed intro', () => {
    const before = saved({ session: { quest: 'road_hire', checkpoint: 'start.hub', seed: 3 } });
    expect(stepped(before).player.quests.session).toEqual({ quest: 'chaos_highway_intro', checkpoint: 'start', seed: 3 });
  });

  it('drops the fourth and eighth scenes and their gates, keeping the first', () => {
    const before = saved({ world: { ala_hired: true, road_seen_1: true, road_seen_4: true, road_seen_8: true }, session: { quest: 'road_stretch_8', checkpoint: 'start', seed: 3 } });
    expect(stepped(before).player.quests).toEqual({ world: { ala_hired: true, road_seen_1: true }, local: {}, session: null });
  });

  it('leaves other open scenes alone', () => {
    const session = { quest: 'road_stretch_1', checkpoint: 'start', seed: 3 };
    expect(stepped(saved({ session })).player.quests.session).toEqual(session);
  });

  it('changes nothing else', () => {
    const before = saved({ world: { geezer_pitch: 'bullets' } });
    const next = stepped(before);
    expect({ ...next, player: { ...next.player, quests: before.player.quests } }).toEqual(before);
  });
});

describe('save migration 92 to 93', () => {
  const stepped = (world: unknown) => TINY_STEPS[92](structuredClone(world) as SavedJson) as unknown as typeof FORMAT_2_90 & { player: { pastContracts: unknown[] } };

  it('gives the player an empty list of past contracts', () => {
    expect(stepped(FORMAT_2_90).player.pastContracts).toEqual([]);
  });

  it('keeps the held contracts and the rest of the save as they were', () => {
    const next = stepped(FORMAT_2_90);

    expect({ ...next, player: { ...next.player, pastContracts: undefined } }).toEqual(FORMAT_2_90);
  });
});

describe('save migration 93 to 94', () => {
  type Saved = typeof FORMAT_2_80;
  const stepped = () => TINY_STEPS[93](TINY_STEPS[81](TINY_STEPS[80](structuredClone(FORMAT_2_80) as unknown as SavedJson))) as unknown as Saved & { vehicles: (Saved['vehicles'][number] & { bend?: number })[]; obstacles: { hulk?: { bend?: number } }[] };
  const AHEAD = 5.73875 / 4;

  it('moves a semi from the middle of the rig to its tractor along its heading and sets it straight', () => {
    const before = FORMAT_2_80.vehicles[1];
    const semi = stepped().vehicles[1];
    expect(semi.pos.x).toBeCloseTo(before.pos.x + Math.cos(before.heading) * AHEAD, 9);
    expect(semi.pos.y).toBeCloseTo(before.pos.y + Math.sin(before.heading) * AHEAD, 9);
    expect(semi.bend).toBe(0);
    expect({ ...semi, pos: before.pos, bend: undefined }).toEqual({ ...before, bend: undefined });
  });

  it('folds nothing and moves nothing else: other trucks, other hulks and props stay as they were', () => {
    const next = stepped();
    expect(next.vehicles[0]).toEqual(FORMAT_2_80.vehicles[0]);
    expect(next.vehicles[2]).toEqual(FORMAT_2_80.vehicles[2]);
    expect(next.obstacles.slice(1)).toEqual(FORMAT_2_80.obstacles.slice(1));
  });

  it('gives a semi hulk a straight bend at its tractor', () => {
    const before = FORMAT_2_80.obstacles[0];
    const hulk = stepped().obstacles[0] as typeof before & { hulk: { bend: number } };
    expect(hulk.hulk).toEqual({ ...before.hulk, bend: 0 });
    expect(hulk.pos.x).toBeCloseTo(before.pos.x + Math.cos(before.hulk!.yaw) * AHEAD, 9);
  });
});

describe('TINY_STEPS[94]', () => {
  it('gives the player the standard paint and changes nothing else', () => {
    const next = TINY_STEPS[94](structuredClone(FORMAT_2_94)) as unknown as typeof FORMAT_2_94 & { player: { paint: string } };
    expect(next.player.paint).toBe('standard');
    const { paint: _paint, ...player } = next.player;
    expect({ ...next, player }).toEqual(FORMAT_2_94);
  });
});

describe('TINY_STEPS[95]', () => {
  const migrate = (paint: unknown) => TINY_STEPS[95](structuredClone({ ...FORMAT_2_95, player: { ...FORMAT_2_95.player, paint } })) as unknown as typeof FORMAT_2_95 & { player: { paint: unknown } };

  it('turns an old paint job into its body, cab and gear colors and changes nothing else', () => {
    const next = migrate('plum');
    expect(next.player.paint).toEqual({ body: 'plum', cab: 'olive', gear: 'plum' });
    expect({ ...next, player: { ...next.player, paint: 'plum' } }).toEqual(FORMAT_2_95);
    expect(TINY_STEPS[95](structuredClone(FORMAT_2_95))).toEqual(next);
  });

  it.each([
    ['standard', { body: 'tan', cab: 'olive', gear: 'tan' }],
    ['lavender', { body: 'lavender', cab: 'navy', gear: 'lavender' }],
    ['mint', { body: 'mint', cab: 'wine', gear: 'mint' }],
    ['rose', { body: 'rose', cab: 'plum', gear: 'rose' }],
  ])('turns %s into its three colors', (preset, paint) => {
    expect(migrate(preset).player.paint).toEqual(paint);
  });

  it.each(['bone', 'gold', 'constructor', undefined])('gives the standard paint for %s', (preset) => {
    expect(migrate(preset).player.paint).toEqual({ body: 'tan', cab: 'olive', gear: 'tan' });
  });
});

describe('TINY_STEPS[96]', () => {
  const migrate = (paint: unknown) => TINY_STEPS[96](structuredClone({ ...FORMAT_2_96, player: { ...FORMAT_2_96.player, paint } })) as unknown as typeof FORMAT_2_96 & { player: { paint: unknown } };

  it('moves each retired color to its new color, keeps a current one and changes nothing else', () => {
    const next = TINY_STEPS[96](structuredClone(FORMAT_2_96)) as unknown as typeof FORMAT_2_96;
    expect(next.player.paint).toEqual({ body: 'chalk', cab: 'slate', gear: 'sand' });
    expect({ ...next, player: { ...next.player, paint: FORMAT_2_96.player.paint } }).toEqual(FORMAT_2_96);
  });

  it.each([
    ['plum', 'oxblood'],
    ['wine', 'oxblood'],
    ['rose', 'sand'],
    ['pink', 'chalk'],
    ['lavender', 'chalk'],
    ['mint', 'chalk'],
    ['navy', 'slate'],
  ])('moves %s to %s in every slot', (old, color) => {
    expect(migrate({ body: old, cab: old, gear: old }).player.paint).toEqual({ body: color, cab: color, gear: color });
  });

  it('keeps a paint of current colors as it is', () => {
    const paint = { body: 'petrol', cab: 'chalk', gear: 'umber' };
    expect(migrate(paint).player.paint).toEqual(paint);
  });

  it('gives a slot it knows neither way its standard color', () => {
    expect(migrate({ body: 'gold', cab: 7, gear: 'bottle' }).player.paint).toEqual({ body: 'tan', cab: 'olive', gear: 'bottle' });
    expect(migrate('plum').player.paint).toEqual({ body: 'tan', cab: 'olive', gear: 'tan' });
  });
});

describe('save migration 97 to 98', () => {
  type Saved = typeof FORMAT_2_97;
  const stepped = () => TINY_STEPS[97](structuredClone(FORMAT_2_97) as unknown as SavedJson) as unknown as { vehicles: (Saved['vehicles'][number] & { strandedAt?: { x: number; y: number } })[] };

  it('anchors a held truck at its saved position, with a copy of the position', () => {
    const held = stepped().vehicles[1];
    expect(held.strandedAt).toEqual(FORMAT_2_97.vehicles[1].pos);
    expect(held.strandedAt).not.toBe(held.pos);
  });

  it('gives a truck with no held turns no anchor and changes nothing else', () => {
    const next = stepped();
    expect(next.vehicles[0]).toEqual(FORMAT_2_97.vehicles[0]);
    expect(next.vehicles[2]).toEqual(FORMAT_2_97.vehicles[2]);
    expect({ ...next.vehicles[1], strandedAt: undefined }).toEqual({ ...FORMAT_2_97.vehicles[1], strandedAt: undefined });
  });
});

describe('TINY_STEPS[98]', () => {
  it('leaves a world with a refused call for help and an answered call as it is', () => {
    expect(TINY_STEPS[98](structuredClone(FORMAT_2_98))).toEqual(FORMAT_2_98);
  });
});

describe('TINY_STEPS[99]', () => {
  it('leaves a world with a running first aid job as it is', () => {
    expect(TINY_STEPS[99](structuredClone(FORMAT_2_99))).toEqual(FORMAT_2_99);
  });
});

describe('TINY_STEPS[100]', () => {
  type Saved = { player: { call: unknown } };
  const base = () => structuredClone(FORMAT_2_99) as unknown as Saved;
  const haul = { kind: 'haul', goods: { scrap: 2 }, parts: [] };
  const withCall = (topic: string, vars: Record<string, unknown>): Saved => {
    const world = base();
    world.player.call = { with: 'npc-1', topic, node: 'start', vars, line: { line: 'demand', vars } };
    return world;
  };
  const step = (world: Saved) => TINY_STEPS[100](world as never) as unknown as Saved;

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

describe('TINY_STEPS[101]', () => {
  it('gives the world an empty crime ledger and the player a neutral standing with the Marshalls, keeping every other standing', () => {
    const next = TINY_STEPS[101](structuredClone(FORMAT_2_101));

    expect(next.crimes).toEqual([]);
    expect((next.player as SavedJson).standing).toEqual({ ...FORMAT_2_101.player.standing, marshals: 0 });
    expect({ ...next, crimes: undefined, player: { ...(next.player as SavedJson), standing: FORMAT_2_101.player.standing } }).toEqual({ ...FORMAT_2_101, crimes: undefined });
  });
});

describe('TINY_STEPS[117]', () => {
  type Quests = { world: Record<string, unknown>; local: Record<string, Record<string, unknown>>; session: { quest: string; checkpoint: string; seed: number } | null; live: { quest: string } | null };
  type Saved = { player: { quests: Quests } };
  const saved = (quests: Partial<Quests>): Saved => {
    const world = structuredClone(FORMAT_2_101) as unknown as Saved;
    world.player.quests = { world: {}, local: {}, session: null, live: null, ...quests };
    return world;
  };
  const stepped = (world: Saved) => TINY_STEPS[117](structuredClone(world) as unknown as SavedJson) as unknown as Saved;

  it('closes the scene whether it is open or only on view, and keeps another scene on view', () => {
    const open = saved({ session: { quest: 'intro_road', checkpoint: 'start', seed: 3 }, live: { quest: 'intro_road' } });
    expect(stepped(open).player.quests).toMatchObject({ session: null, live: null });
    const onView = saved({ live: { quest: 'intro_road' } });
    expect(stepped(onView).player.quests.live).toBeNull();
    const other = saved({ live: { quest: 'intro_bowl' } });
    expect(stepped(other).player.quests.live).toEqual({ quest: 'intro_bowl' });
  });
});

describe('step names', () => {
  it('are unique camelCase words without digits across tiny steps and release steps', () => {
    const names = [...STEPS.map((named) => named.name), ...RELEASE_STEPS.flatMap((release) => release.names ?? [])];
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name, name).toMatch(/^[a-z][A-Za-z]*$/);
  });
});
