import type { SavedJson } from './save-migrations';

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
