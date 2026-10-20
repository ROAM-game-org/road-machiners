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

const STANDARD_PAINT_84_85 = 'standard';

export function withStandardPaint_84_85(world: SavedJson): SavedJson {
  return { ...world, player: { ...(world.player as SavedJson), paint: STANDARD_PAINT_84_85 } };
}
