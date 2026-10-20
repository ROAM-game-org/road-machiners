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
