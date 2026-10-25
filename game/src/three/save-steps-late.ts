import { dropQuest, dropQuestVar, moveQuestCheckpoint, renameQuestVar, type SavedJson } from './save-migrations';

type Point_70_71 = { x: number; y: number };

const CAMPS_70_71: readonly (readonly [string, Point_70_71])[] = [['scrapjaw', { x: 110, y: 70 }], ['kiln', { x: 330, y: 380 }]];
const TOWNS_70_71: readonly (readonly [string, Point_70_71])[] = [['bowl', { x: 80, y: 470 }], ['nose', { x: 510, y: 175 }]];
const RENAMED_70_71: Record<string, string> = { couriers: 'guidestar', traders: 'independent', scavengers: 'independent', roamers: 'independent', vultures: 'independent', mercs: 'independent' };
const START_STANDING_70_71 = { bowl: 5, nose: 5, guidestar: 10, administrators: 10, scrapjaw: -30, kiln: -30 };

function nearest_70_71(places: readonly (readonly [string, Point_70_71])[], at: Point_70_71): string {
  const gap = (p: Point_70_71) => Math.hypot(p.x - at.x, p.y - at.y);
  return [...places].sort((a, b) => gap(a[1]) - gap(b[1]))[0][0];
}

function homeOf_70_71(v: SavedJson): Point_70_71 {
  const brain = v.brain as SavedJson | null;
  return (brain ? brain.home : v.pos) as Point_70_71;
}

function leaderOf_70_71(world: SavedJson, v: SavedJson): SavedJson | null {
  const escort = (world.states as SavedJson[]).find((s) => s.kind === 'escort' && s.holder === v.id);
  return escort ? (world.vehicles as SavedJson[]).find((x) => x.id === escort.other) ?? null : null;
}

function factionOf_70_71(world: SavedJson, v: SavedJson): string {
  const old = v.faction as string;
  if (old === 'raiders') return nearest_70_71(CAMPS_70_71, homeOf_70_71(v));
  if (old !== 'convoys') return RENAMED_70_71[old] ?? old;
  const leader = leaderOf_70_71(world, v);
  return nearest_70_71(TOWNS_70_71, homeOf_70_71(leader?.faction === 'convoys' ? leader : v));
}

function withDeedMemories_70_71(v: SavedJson): SavedJson {
  const brain = v.brain as SavedJson | null;
  if (!brain?.memories) return v;
  const memories = (brain.memories as SavedJson[]).map((m) => {
    const fact = m.fact as SavedJson;
    return fact.kind === 'wronged' && fact.deed === undefined ? { ...m, fact: { ...fact, deed: 'attacked' } } : m;
  });
  return { ...v, brain: { ...brain, memories } };
}

export function withFactions_70_71(world: SavedJson): SavedJson {
  const relabel = (v: SavedJson): SavedJson => ({ ...v, faction: factionOf_70_71(world, v) });
  const player = { ...(world.player as SavedJson), standing: { ...START_STANDING_70_71 }, deeds: [] };
  return { ...world, player, vehicles: (world.vehicles as SavedJson[]).map((v) => withDeedMemories_70_71(relabel(v))) };
}

const GROUP_MONEY_72_73 = 20000;

export function withPlannedGroups_73_74(world: SavedJson): SavedJson {
  const run = world.furyRoad as SavedJson | null;
  if (run === null) return world;
  const { quietFrom: _quietFrom, ...rest } = run;
  const groups = (run.groups as SavedJson[]).map((group) => ({ ...group, at: 0, money: GROUP_MONEY_72_73, elite: false }));
  return { ...world, furyRoad: { ...rest, groups } };
}

export function withRunWait_72_73(world: SavedJson): SavedJson {
  const run = world.furyRoad as SavedJson | null;
  if (run === null) return world;
  const next = (run.window as number) + 1;
  const arrived = (run.outposts as SavedJson[]).some((post) => post.milestone === next && post.paid === true);
  return { ...world, furyRoad: { ...run, waitingAt: arrived ? next : null } };
}

type SavedQuests_77_78 = { world: SavedJson; local: Record<string, SavedJson> };

export function withHattieMet_77_78(world: SavedJson): SavedJson {
  const player = world.player as SavedJson;
  const quests = player.quests as SavedQuests_77_78;
  const knowsHer = quests.world.towed_to_bowl === true || Object.keys(quests.local.bowl_hattie ?? {}).length > 0;
  return knowsHer ? { ...world, player: { ...player, quests: { ...quests, world: { ...quests.world, hattie_met: true } } } } : world;
}

export function withoutVarga_79_80(world: SavedJson): SavedJson {
  const noWorldVar = dropQuestVar(world, null, 'varga_truck_known');
  return ['hattie_varga', 'hattie_farm'].reduce((w, name) => dropQuestVar(w, 'bowl_hattie', name), noWorldVar);
}

const RENAMED_NOTES_78_79: Record<string, string> = { wagonPin: 'wagonRod', talkOnePin: 'talkBrakeRod' };

export function withBrakeRod_78_79(world: SavedJson): SavedJson {
  const renamed = renameQuestVar(renameQuestVar(world, null, 'wagon_pin', 'wagon_rod'), 'nose_lena', 'asked_pins', 'asked_rods');
  const player = renamed.player as SavedJson;
  const notes = (player.notes as { id: string }[]).map((n) => ({ ...n, id: RENAMED_NOTES_78_79[n.id] ?? n.id }));
  return { ...renamed, player: { ...player, notes } };
}

export function withKovacMounts_88_89(world: SavedJson): SavedJson {
  const heard = renameQuestVar(world, 'nose_kovac', 'heard_gate_law', 'heard_mounts');
  return renameQuestVar(heard, 'nose_kovac', 'asked_gate_law', 'asked_mounts');
}

export function withPastContracts_92_93(world: SavedJson): SavedJson {
  return { ...world, player: { ...(world.player as SavedJson), pastContracts: [] } };
}

export function withCrewsAndHires_76_77(world: SavedJson): SavedJson {
  return world;
}

const SEMI_93_94 = 'semi';
const TRACTOR_AHEAD_TILES_93_94 = 5.73875 / 4;

export function withTractorPivot_93_94(world: SavedJson): SavedJson {
  const vehicles = (world.vehicles as SavedJson[]).map((v) => (v.chassisId === SEMI_93_94 ? { ...v, pos: tractorAt_93_94(v.pos as Point_93_94, v.heading as number), bend: 0 } : v));
  const obstacles = (world.obstacles as SavedJson[]).map((o) => {
    const hulk = o.hulk as SavedJson | undefined;
    return hulk?.chassisId === SEMI_93_94 ? { ...o, pos: tractorAt_93_94(o.pos as Point_93_94, hulk.yaw as number), hulk: { ...hulk, bend: 0 } } : o;
  });
  return { ...world, vehicles, obstacles };
}

type Point_93_94 = { x: number; y: number };

function tractorAt_93_94(pos: Point_93_94, heading: number): Point_93_94 {
  return { x: pos.x + Math.cos(heading) * TRACTOR_AHEAD_TILES_93_94, y: pos.y + Math.sin(heading) * TRACTOR_AHEAD_TILES_93_94 };
}

export function withProgressAnchor_65_66(world: SavedJson): SavedJson {
  const anchored = (v: SavedJson): SavedJson => {
    const brain = v.brain as SavedJson | null;
    if (!brain?.progress) return v;
    return { ...v, brain: { ...brain, progress: { ...(brain.progress as SavedJson), at: { ...(v.pos as SavedJson) } } } };
  };
  return { ...world, vehicles: (world.vehicles as SavedJson[]).map(anchored) };
}

export function withHeardCentres_81_82(world: SavedJson): SavedJson {
  const heardOf = (goal: SavedJson): SavedJson => (goal.kind === 'investigate' && goal.destination && !goal.heard ? { ...goal, heard: { ...(goal.destination as SavedJson) } } : goal);
  const withBrain = (v: SavedJson): SavedJson => {
    const brain = v.brain as SavedJson | null;
    return brain ? { ...v, brain: { ...brain, goals: (brain.goals as SavedJson[]).map(heardOf) } } : v;
  };
  return { ...world, vehicles: (world.vehicles as SavedJson[]).map(withBrain) };
}

function withFollowHeading_87_88(step: SavedJson): SavedJson {
  return step.do === 'follow' ? { ...step, heading: null } : step;
}

function followHeadingVars_87_88(vars: SavedJson): SavedJson {
  return Object.fromEntries(Object.entries(vars).map(([name, v]) => {
    const value = v as SavedJson;
    return [name, value.kind === 'directions' ? { ...value, steps: (value.steps as SavedJson[]).map(withFollowHeading_87_88) } : value];
  }));
}

export function withFollowHeadings_87_88(world: SavedJson): SavedJson {
  const player = world.player as SavedJson;
  const call = player.call as SavedJson | null;
  if (!call) return world;
  const line = call.line as SavedJson;
  const next = { ...call, vars: followHeadingVars_87_88(call.vars as SavedJson), line: { ...line, vars: followHeadingVars_87_88(line.vars as SavedJson) } };
  return { ...world, player: { ...player, call: next } };
}

const SUNWARD_STANDING_84_85 = -20;

export function withSunward_84_85(world: SavedJson): SavedJson {
  const player = world.player as SavedJson;
  const sunward = world.furyRoad === null ? { collapsed: null, night: null, lastHunt: null } : null;
  return { ...world, sunward, player: { ...player, standing: { ...(player.standing as SavedJson), sunward: SUNWARD_STANDING_84_85 } } };
}

const OLD_HOLLOW_BAYS_85 = [
  { x: 348, y: 334 }, { x: 351.2, y: 334 }, { x: 354.4, y: 334 }, { x: 357.6, y: 334 }, { x: 360.8, y: 334 }, { x: 364, y: 334 },
  { x: 349.6, y: 338.5 }, { x: 352.8, y: 338.5 }, { x: 356, y: 338.5 }, { x: 359.2, y: 338.5 }, { x: 362.4, y: 338.5 },
];
const FORT_BAYS_86 = [
  { x: 284.053, y: 243.604 }, { x: 280.429, y: 250.736 }, { x: 281.2, y: 242.155 }, { x: 277.576, y: 249.287 }, { x: 278.346, y: 240.705 }, { x: 274.723, y: 247.838 },
  { x: 275.493, y: 239.256 }, { x: 271.87, y: 246.389 }, { x: 272.64, y: 237.807 }, { x: 269.017, y: 244.94 }, { x: 269.787, y: 236.358 },
];
const BAY_MATCH_86 = 0.01;

export function withHollowFort_85_86(world: SavedJson): SavedJson {
  const rehome = (v: SavedJson): SavedJson => {
    const brain = v.brain as SavedJson | null;
    if (v.faction !== 'sunward' || !brain) return v;
    const home = brain.home as { x: number; y: number };
    const bay = OLD_HOLLOW_BAYS_85.findIndex((b) => Math.hypot(b.x - home.x, b.y - home.y) <= BAY_MATCH_86);
    if (bay < 0) throw new Error(`Sunward car ${String(v.id)} calls ${home.x}, ${home.y} home, which is no bay of the old Hollow`);
    return { ...v, brain: { ...brain, home: { ...FORT_BAYS_86[bay] } } };
  };
  return { ...world, vehicles: (world.vehicles as SavedJson[]).map(rehome) };
}

export function withOfferedNight_86_87(world: SavedJson): SavedJson {
  const sunward = world.sunward as SavedJson | null;
  const night = sunward?.night as SavedJson | null | undefined;
  if (!sunward || !night) return world;
  return { ...world, sunward: { ...sunward, night: { ...night, offered: [] } } };
}

const LAWMEN_59_60: readonly string[] = ['bowlFarmer', 'noseArmy'];
const SHOPS_59_60: readonly string[] = ['bowl', 'nose', 'salvage-yard', 'granary', 'pump-station', 'dustwell', 'green-pit'];
const CONVOY_DUTIES_59_60: readonly string[] = ['haul', 'trade', 'sell'];

function isDutyGoal_59_60(templateId: string, goal: SavedJson): boolean {
  if (LAWMEN_59_60.includes(templateId)) return goal.kind === 'patrol' && goal.reason === 'patrolTown';
  if (templateId === 'courier') return goal.kind === 'travel' && SHOPS_59_60.includes(goal.targetId as string);
  return templateId === 'convoy' && CONVOY_DUTIES_59_60.includes(goal.kind as string);
}

export function withDutyLegs_59_60(world: SavedJson): SavedJson {
  const vehicles = (world.vehicles as SavedJson[]).map((v) => {
    const brain = v.brain as SavedJson | null;
    if (!brain) return v;
    const goals = (brain.goals as SavedJson[]).map((goal) => (isDutyGoal_59_60(brain.templateId as string, goal) ? { ...goal, leg: { from: { ...(v.pos as SavedJson) }, turn: world.turn } } : goal));
    return { ...v, brain: { ...brain, goals } };
  });
  return { ...world, vehicles };
}

const STANDARD_PAINT_94_95 = 'standard';

export function withStandardPaint_94_95(world: SavedJson): SavedJson {
  return { ...world, player: { ...(world.player as SavedJson), paint: STANDARD_PAINT_94_95 } };
}

type Paint_95_96 = { body: string; cab: string; gear: string };

const STANDARD_PAINT_95_96: Paint_95_96 = { body: 'tan', cab: 'olive', gear: 'tan' };

const OLD_PRESETS_95_96: Record<string, Paint_95_96> = {
  standard: STANDARD_PAINT_95_96,
  plum: { body: 'plum', cab: 'olive', gear: 'plum' },
  lavender: { body: 'lavender', cab: 'navy', gear: 'lavender' },
  mint: { body: 'mint', cab: 'wine', gear: 'mint' },
  rose: { body: 'rose', cab: 'plum', gear: 'rose' },
};

export function paintOfPreset_95_96(preset: string): Paint_95_96 {
  return { ...(Object.hasOwn(OLD_PRESETS_95_96, preset) ? OLD_PRESETS_95_96[preset] : STANDARD_PAINT_95_96) };
}

export function withThreeColorPaint_95_96(world: SavedJson): SavedJson {
  const player = world.player as SavedJson;
  return { ...world, player: { ...player, paint: paintOfPreset_95_96(String(player.paint)) } };
}

const STANDARD_PAINT_96_97: Paint_95_96 = { body: 'tan', cab: 'olive', gear: 'tan' };

const COLORS_96_97: readonly string[] = ['tan', 'olive', 'sand', 'chalk', 'umber', 'oxblood', 'bottle', 'slate', 'petrol'];

const RETIRED_COLORS_96_97: Record<string, string> = {
  plum: 'oxblood',
  wine: 'oxblood',
  rose: 'sand',
  pink: 'chalk',
  lavender: 'chalk',
  mint: 'chalk',
  navy: 'slate',
};

export function mutedColor_96_97(id: string): string {
  return Object.hasOwn(RETIRED_COLORS_96_97, id) ? RETIRED_COLORS_96_97[id] : id;
}

function colorOf_96_97(slot: keyof Paint_95_96, id: unknown): string {
  const color = typeof id === 'string' ? mutedColor_96_97(id) : null;
  return color !== null && COLORS_96_97.includes(color) ? color : STANDARD_PAINT_96_97[slot];
}

export function withMutedPaint_96_97(world: SavedJson): SavedJson {
  const player = world.player as SavedJson;
  const saved = typeof player.paint === 'object' && player.paint !== null ? (player.paint as SavedJson) : {};
  const paint = { body: colorOf_96_97('body', saved.body), cab: colorOf_96_97('cab', saved.cab), gear: colorOf_96_97('gear', saved.gear) };
  return { ...world, player: { ...player, paint } };
}

export function withEncounters_64_65(world: SavedJson): SavedJson {
  const player = world.player as SavedJson;
  if (player.encounters !== undefined) return world;
  return { ...world, player: { ...player, encounters: { next: 0, pending: null, story: null } } };
}

const STAPLE_SHOPS_83_84 = ['bowl', 'nose'];
const STAPLE_PART_83_84 = 'stockEngine';
type SavedShop = { stock: { defId: string }[]; restockAt: number };

export function withStapleRestock_83_84(world: SavedJson): SavedJson {
  const shops = { ...(world.shops as Record<string, SavedShop>) };
  for (const id of STAPLE_SHOPS_83_84) {
    const shop = shops[id];
    if (shop && !shop.stock.some((part) => part.defId === STAPLE_PART_83_84)) shops[id] = { ...shop, restockAt: world.turn as number };
  }
  return { ...world, shops };
}

const DROPPED_ROAD_WORLD_VARS_90_91: readonly string[] = ['road_seen_12', 'ring_told', 'death_answer', 'why_answer', 'ala_knows', 'father_told', 'promised', 'hand_shook'];

const DROPPED_ROAD_LOCAL_VARS_90_91: Record<string, readonly string[]> = {
  road_hire: ['asked_north', 'asked_who', 'asked_trailer', 'walked_out'],
  road_stretch_4: ['asked_trailer', 'asked_north', 'asked_hunters'],
  road_stretch_8: ['asked_hunters', 'asked_run', 'grief_said'],
};

const DROPPED_ROAD_CHECKPOINTS_90_91: Record<string, readonly string[]> = {
  road_stretch_1: ['start.tougher', 'start.close'],
  road_stretch_4: ['start.death_machine', 'start.hub', 'start.maya'],
  road_stretch_8: ['start.news', 'start.loss', 'start.hub', 'start.close'],
};

export function withShortRoadScenes_90_91(world: SavedJson): SavedJson {
  const withoutScene = dropQuest(world, 'road_stretch_12');
  const withoutWorldVars = DROPPED_ROAD_WORLD_VARS_90_91.reduce((w, name) => dropQuestVar(w, null, name), withoutScene);
  const withoutLocalVars = Object.entries(DROPPED_ROAD_LOCAL_VARS_90_91).reduce((w, [quest, names]) => names.reduce((v, name) => dropQuestVar(v, quest, name), w), withoutWorldVars);
  return Object.entries(DROPPED_ROAD_CHECKPOINTS_90_91).reduce((w, [quest, names]) => names.reduce((v, from) => moveQuestCheckpoint(v, quest, from, 'start'), w), withoutLocalVars);
}

export function withChaosHighwayIntro_91_92(world: SavedJson): SavedJson {
  const withoutScenes = ['road_hire', 'road_stretch_4', 'road_stretch_8'].reduce((w, quest) => dropQuest(w, quest), world);
  const withoutVars = ['geezer_pitch', 'road_seen_4', 'road_seen_8'].reduce((w, name) => dropQuestVar(w, null, name), withoutScenes);
  const quests = (world.player as { quests: { session: { quest: string; checkpoint: string; seed: number } | null } }).quests;
  if (quests.session?.quest !== 'road_hire') return withoutVars;
  const player = withoutVars.player as { quests: SavedJson };
  return { ...withoutVars, player: { ...player, quests: { ...player.quests, session: { ...quests.session, quest: 'chaos_highway_intro', checkpoint: 'start' } } } };
}

type Item_102_103 = SavedJson & { x: number; y: number; rot: number; kind: string };
type Spot_102_103 = { x: number; y: number; rot: number };

const INSERTED_COLUMN_102_103: Record<string, number> = { buggy: 4, courier: 4, jeep: 2, niva: 2, bus: 6, carrier: 6 };

const MOVED_CORE_102_103: Record<string, { defId: string; spot: Spot_102_103 }> = {
  buggy: { defId: 'tank', spot: { x: 4, y: 3, rot: 0 } },
  courier: { defId: 'transmission', spot: { x: 3, y: 1, rot: 0 } },
  niva: { defId: 'tank', spot: { x: 2, y: 5, rot: 0 } },
  bus: { defId: 'tankMid', spot: { x: 5, y: 6, rot: 1 } },
};

const RESIZED_HP_102_103: Record<string, number> = { plates: 53 / 80, spacedArmor: 55 / 110, reinforcedCage: 86 / 130 };

const OLD_WAGON_102_103 = [' FFFFFF ', 'LXXXDDXR', 'LXEEDDXR', 'LDEEDDDR', 'LXXXXDXR', 'LXXXXDXR', ' BBBBBB '];
const NEW_WAGON_102_103 = [' FFFFFFF ', 'LXDXXXDXR', 'LXDXXXDXR', 'LDEEDDXDR', 'LDEEDDXDR', 'LDDDXXDDR', 'LXDDXXDXR', 'LXDDDDDXR', ' BBBBBBB '];
const NEW_WAGON_CORES_102_103: Record<string, Spot_102_103[]> = {
  cab: [{ x: 3, y: 1, rot: 0 }],
  transmissionHeavy: [{ x: 4, y: 5, rot: 0 }],
  tankHeavy: [{ x: 6, y: 3, rot: 0 }],
  wheelHeavy: [{ x: 1, y: 1, rot: 0 }, { x: 7, y: 1, rot: 0 }, { x: 1, y: 6, rot: 0 }, { x: 7, y: 6, rot: 0 }],
};
const NEW_CAB_102_103 = 'cabPickup';
const RAMS_102_103 = new Set(['ram', 'plowRam', 'claymoreRam']);
const CARGO_LETTERS_102_103 = ['D', 'E', 'F', 'B', 'C', '.'];

const PART_SIZES_102_103: Record<string, [number, number]> = {
  mg: [1, 2], shotgun: [1, 2], longRifle: [1, 2], flamer: [1, 2], pneumobolter: [2, 2], slugCannon: [1, 2], heavyMg: [1, 2], cannon: [2, 2], amRifle: [1, 3], autocannon: [2, 2],
  recoilless: [1, 3], battleRifle: [1, 3], gatling: [2, 2], rocketRack: [2, 2], sniperCannon: [2, 3], grenadeLauncher: [2, 2], tankGun: [2, 3], flechette: [2, 2], harpoon: [1, 2],
  sprout: [1, 1], caltrops: [1, 1], oilSpiller: [1, 1], patcherCrane: [1, 2], smokeMortar: [1, 2], flareCannon: [1, 1], scrapersKnife: [1, 2], emitter: [2, 2], stockEngine: [2, 2],
  tunedEngine: [2, 2], flatFour: [2, 2], workhorseDiesel: [2, 2], racingV6: [2, 2], heavyDiesel: [2, 2], turbine: [2, 2], plates: [1, 2], cage: [1, 2], ram: [3, 1], scrapPanels: [1, 2],
  ceramicPlates: [1, 2], spacedArmor: [1, 2], reinforcedCage: [1, 2], plowRam: [3, 1], claymoreRam: [3, 1], steelPlate: [1, 1], scrapSheet: [1, 1], ceramicTile: [1, 1],
  rack: [2, 1], trailerBox: [2, 2], panniers: [1, 1], flatbed: [2, 1], lightFrame: [2, 2], enclosedFrame: [2, 2], heavyFrame: [2, 2], jerrycans: [1, 1], supplyLocker: [1, 1], scanner: [1, 1],
};

export function withOddFronts_102_103(world: SavedJson): SavedJson {
  const player = world.player as SavedJson & { vehicleId: string; storage: SavedJson[] };
  const storage = [...player.storage];
  const vehicles = (world.vehicles as SavedJson[]).map((v) => {
    if (v.chassisId === 'wagon') return relaidWagon_102_103(v, v.id === player.vehicleId ? storage : null);
    const column = INSERTED_COLUMN_102_103[v.chassisId as string];
    return column === undefined ? v : { ...v, items: (v.items as Item_102_103[]).map((it) => widenedItem_102_103(v.chassisId as string, column, it)) };
  });
  return resizedHp_102_103({ ...world, vehicles, player: { ...player, storage } }) as SavedJson;
}

function widenedItem_102_103(chassisId: string, column: number, it: Item_102_103): Item_102_103 {
  const core: { defId: string; spot: Spot_102_103 } | undefined = MOVED_CORE_102_103[chassisId];
  if (core !== undefined && defIdOf_102_103(it) === core.defId) return { ...it, ...core.spot };
  return it.x >= column ? { ...it, x: it.x + 1 } : it;
}

function resizedHp_102_103(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(resizedHp_102_103);
  return node !== null && typeof node === 'object' ? resizedRecord_102_103(node as SavedJson) : node;
}

function resizedRecord_102_103(node: SavedJson): SavedJson {
  const out = Object.fromEntries(Object.entries(node).map(([key, value]) => [key, resizedHp_102_103(value)] as const)) as SavedJson;
  const share = typeof out.defId === 'string' ? RESIZED_HP_102_103[out.defId] : undefined;
  return share !== undefined && typeof out.hp === 'number' ? { ...out, hp: Math.round(out.hp * share) } : out;
}

function defIdOf_102_103(it: Item_102_103): string | null {
  return it.kind === 'part' ? ((it.part as SavedJson).defId as string) : null;
}

function relaidWagon_102_103(v: SavedJson, storage: SavedJson[] | null): SavedJson {
  const items = v.items as Item_102_103[];
  const cargoShift = NEW_WAGON_102_103.length - OLD_WAGON_102_103.length;
  const cores = items.filter((it) => coreSpots_102_103(it) !== null);
  const rest = items.filter((it) => coreSpots_102_103(it) === null);
  const placed: Item_102_103[] = seatedCores_102_103(cores);
  for (const it of rest) {
    if (it.y >= OLD_WAGON_102_103.length) placed.push({ ...it, y: it.y + cargoShift });
    else {
      const spot = freeSpot_102_103(it, placed);
      if (spot) placed.push({ ...it, ...spot });
      else if (it.kind !== 'part') placed.push(it);
      else if (storage) storage.push(it.part as SavedJson);
    }
  }
  return { ...v, items: placed };
}

function coreSpots_102_103(it: Item_102_103): Spot_102_103[] | null {
  const defId = defIdOf_102_103(it);
  return defId === null ? null : NEW_WAGON_CORES_102_103[defId] ?? null;
}

function seatedCores_102_103(cores: Item_102_103[]): Item_102_103[] {
  const used: Record<string, number> = {};
  return [...cores].sort((a, b) => a.y - b.y || a.x - b.x).map((it) => {
    const defId = defIdOf_102_103(it)!;
    const spot = NEW_WAGON_CORES_102_103[defId][used[defId] ?? 0];
    used[defId] = (used[defId] ?? 0) + 1;
    const part = defId === 'cab' ? { ...(it.part as SavedJson), defId: NEW_CAB_102_103 } : it.part;
    return { ...it, ...spot, part };
  });
}

function cellsOf_102_103(it: Item_102_103, spot: Spot_102_103): { x: number; y: number }[] {
  const defId = defIdOf_102_103(it);
  const [w, h] = defId === null ? [1, 1] : PART_SIZES_102_103[defId] ?? [1, 1];
  const [cw, ch] = spot.rot % 2 === 1 ? [h, w] : [w, h];
  const cells: { x: number; y: number }[] = [];
  for (let dy = 0; dy < ch; dy++) for (let dx = 0; dx < cw; dx++) cells.push({ x: spot.x + dx, y: spot.y + dy });
  return cells;
}

function layer_102_103(it: Item_102_103, letter: string): string {
  const defId = defIdOf_102_103(it);
  return defId !== null && RAMS_102_103.has(defId) && (letter === 'F' || letter === 'B') ? 'outer' : 'base';
}

function freeSpot_102_103(it: Item_102_103, placed: Item_102_103[]): Spot_102_103 | null {
  const oldLetter = OLD_WAGON_102_103[it.y]?.[it.x] ?? ' ';
  const letters = it.kind === 'part' ? [oldLetter] : CARGO_LETTERS_102_103;
  const layer = layer_102_103(it, oldLetter);
  const taken = new Set(placed.flatMap((p) => cellsOf_102_103(p, p).filter((c) => layer_102_103(p, NEW_WAGON_102_103[c.y]?.[c.x] ?? ' ') === layer).map((c) => `${c.x},${c.y}`)));
  const spots = [it.rot, (it.rot + 1) % 4].flatMap((rot) => NEW_WAGON_102_103.flatMap((row, y) => [...row].map((_, x) => ({ x, y, rot }))));
  return spots.find((spot) => fitsSpot_102_103(it, spot, letters, taken)) ?? null;
}

function fitsSpot_102_103(it: Item_102_103, spot: Spot_102_103, letters: string[], taken: Set<string>): boolean {
  const first = NEW_WAGON_102_103[spot.y][spot.x];
  return letters.includes(first) && cellsOf_102_103(it, spot).every((c) => NEW_WAGON_102_103[c.y]?.[c.x] === first && !taken.has(`${c.x},${c.y}`));
}

const DROPPED_KINDS_103_104: ReadonlySet<string> = new Set(['fetch', 'bounty']);
const BOUNTY_KIND_103_104 = 'bounty';
const RENAMED_PERKS_103_104: Readonly<Record<string, string>> = { bountyTalk: 'bountyHunter' };

export function withoutFetchAndBounty_103_104(world: SavedJson): SavedJson {
  const player = world.player as SavedJson;
  const held = player.contracts as SavedJson[];
  const shops = Object.fromEntries(Object.entries(world.shops as Record<string, SavedJson>).map(([id, shop]) => [id, { ...shop, contracts: keptContracts_103_104(shop.contracts as SavedJson[]) }]));
  return {
    ...world,
    shops,
    player: {
      ...player,
      money: (player.money as number) + metBountyPay_103_104(held),
      contracts: keptContracts_103_104(held),
      pastContracts: (player.pastContracts as SavedJson[]).filter((past) => !DROPPED_KINDS_103_104.has((past.contract as SavedJson).kind as string)),
      perks: (player.perks as string[]).map((perk) => RENAMED_PERKS_103_104[perk] ?? perk),
    },
  };
}

function keptContracts_103_104(contracts: SavedJson[]): SavedJson[] {
  return contracts.filter((c) => !DROPPED_KINDS_103_104.has(c.kind as string));
}

function metBountyPay_103_104(held: SavedJson[]): number {
  return held.filter((c) => c.kind === BOUNTY_KIND_103_104 && c.fulfilled === true).reduce((sum, c) => sum + (c.reward as number), 0);
}

function withLeanSteps_104_105(steps: SavedJson[]): SavedJson[] {
  return steps.map((step) => (step.do === 'leave' ? { ...step, lean: null } : step));
}

function withLeanVars_104_105(vars: SavedJson): SavedJson {
  return Object.fromEntries(Object.entries(vars).map(([name, v]) => {
    const value = v as SavedJson;
    return [name, value.kind === 'directions' ? { ...value, steps: withLeanSteps_104_105(value.steps as SavedJson[]) } : value];
  }));
}

export function withLeanDirections_104_105(world: SavedJson): SavedJson {
  const player = world.player as SavedJson;
  const call = player.call as SavedJson | null;
  if (!call) return world;
  const line = call.line as SavedJson;
  const next = { ...call, vars: withLeanVars_104_105(call.vars as SavedJson), line: { ...line, vars: withLeanVars_104_105(line.vars as SavedJson) } };
  return { ...world, player: { ...player, call: next } };
}

function withMemoryRestitution_105_106(v: SavedJson): SavedJson {
  const brain = v.brain as SavedJson | null;
  if (!brain?.memories) return v;
  const memories = (brain.memories as SavedJson[]).map((m) => {
    const fact = m.fact as SavedJson;
    return fact.kind === 'witnessed' ? { ...m, fact: { ...fact, restitution: 0 } } : m;
  });
  return { ...v, brain: { ...brain, memories } };
}

export function withCaseRestitution_105_106(world: SavedJson): SavedJson {
  const crimes = (world.crimes as SavedJson[]).map((c) => ({ ...c, restitution: 0, known: true }));
  const vehicles = (world.vehicles as SavedJson[]).map(withMemoryRestitution_105_106);
  return { ...world, crimes, vehicles };
}
