import { dropQuestVar, renameQuestVar, type SavedJson } from './save-migrations';

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

export function withCrewsAndHires_76_77(world: SavedJson): SavedJson {
  return world;
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

export function withProgressAnchor_65_66(world: SavedJson): SavedJson {
  const anchored = (v: SavedJson): SavedJson => {
    const brain = v.brain as SavedJson | null;
    if (!brain?.progress) return v;
    return { ...v, brain: { ...brain, progress: { ...(brain.progress as SavedJson), at: { ...(v.pos as SavedJson) } } } };
  };
  return { ...world, vehicles: (world.vehicles as SavedJson[]).map(anchored) };
}

export function withOfferedNight_86_87(world: SavedJson): SavedJson {
  const sunward = world.sunward as SavedJson | null;
  const night = sunward?.night as SavedJson | null | undefined;
  if (!sunward || !night) return world;
  return { ...world, sunward: { ...sunward, night: { ...night, offered: [] } } };
}

export function withEncounters_64_65(world: SavedJson): SavedJson {
  const player = world.player as SavedJson;
  if (player.encounters !== undefined) return world;
  return { ...world, player: { ...player, encounters: { next: 0, pending: null, story: null } } };
}
