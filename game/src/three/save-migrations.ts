import { withBrakeRod_78_79, withCrewsAndHires_76_77, withFactions_70_71, withHattieMet_77_78, withPlannedGroups_73_74, withRunWait_72_73, withHeardCentres_81_82, withoutVarga_79_80, withSunward_84_85, withHollowFort_85_86, withOfferedNight_86_87, withFollowHeadings_87_88, withKovacMounts_88_89, withProgressAnchor_65_66, withEncounters_64_65 } from './save-steps-late';

export type SavedJson = Record<string, unknown>;

export const SAVE_MAJOR = 2;

type Step = (world: SavedJson) => SavedJson;

export type ReleaseStep = { from: number; to: number; step: Step };

export const RELEASE_STEPS: readonly ReleaseStep[] = [];

export const TINY_FROM = 63;

export const TINY_STEPS: readonly Step[] = [
  withRescueContracts_63_64,
  withEncounters_64_65,
  withProgressAnchor_65_66,
  (world) => world,
  withoutBearingCall_67_68,
  withSearches_68_69,
  withParcelSearches_69_70,
  withFactions_70_71,
  withCountableDirections_71_72,
  withRunWait_72_73,
  withPlannedGroups_73_74,
  (world) => world,
  withClaimRivals_75_76,
  withCrewsAndHires_76_77,
  withHattieMet_77_78,
  withBrakeRod_78_79,
  withoutVarga_79_80,
  (world) => world,
  withHeardCentres_81_82,
  withShopGoods_82_83,
  withStapleRestock_83_84,
  withSunward_84_85,
  withHollowFort_85_86,
  withOfferedNight_86_87,
  withFollowHeadings_87_88,
  withKovacMounts_88_89,
];


function withSearches_68_69(world: SavedJson): SavedJson {
  return world;
}
const withoutSearches_69_70 = (contracts: SavedJson[]): SavedJson[] => contracts.filter((c) => c.kind !== 'search');
function withoutFoundTalk_69_70(talked: Record<string, SavedJson>): Record<string, SavedJson> {
  return Object.fromEntries(Object.entries(talked).map(([npc, topics]) => [npc, Object.fromEntries(Object.entries(topics).filter(([topic]) => topic !== 'found'))]));
}
function withParcelSearches_69_70(world: SavedJson): SavedJson {
  const player = world.player as SavedJson;
  const call = player.call as SavedJson | null;
  const shops = Object.fromEntries(Object.entries(world.shops as Record<string, SavedJson>).map(([id, shop]) => [id, { ...shop, contracts: withoutSearches_69_70(shop.contracts as SavedJson[]) }]));
  return {
    ...world,
    shops,
    player: {
      ...player,
      contracts: withoutSearches_69_70(player.contracts as SavedJson[]),
      talked: withoutFoundTalk_69_70(player.talked as Record<string, SavedJson>),
      call: call?.topic === 'found' ? null : call,
    },
  };
}

function withRescueContracts_63_64(world: SavedJson): SavedJson {
  return world;
}

const CLAIM_KIND_67_68 = 'claim';

function withRival_75_76(contract: SavedJson): SavedJson {
  return contract.kind === CLAIM_KIND_67_68 ? { ...contract, rivalAt: contract.deadline, rival: null, leads: [] } : contract;
}

function withClaimRivals_75_76(world: SavedJson): SavedJson {
  const shops = Object.fromEntries(Object.entries(world.shops as Record<string, SavedJson>).map(([id, shop]) => [id, { ...shop, contracts: (shop.contracts as SavedJson[]).map(withRival_75_76) }]));
  const player = world.player as SavedJson;
  return { ...world, shops, player: { ...player, contracts: (player.contracts as SavedJson[]).map(withRival_75_76) } };
}

const MAX_COUNT_71_72 = 3;

function countedPast_71_72(step: SavedJson): boolean {
  const at = step.at as SavedJson | undefined;
  return (step.do === 'turn' || step.do === 'leave') && at?.kind === 'fork' && (at.nth as number) > MAX_COUNT_71_72;
}

function countableSteps_71_72(steps: SavedJson[]): SavedJson[] {
  const cut = steps.findIndex(countedPast_71_72);
  const kept = cut < 0 ? steps : [...steps.slice(0, cut), { do: 'askAgain' }];
  return kept.map((step) => {
    if (step.do !== 'askAgain') return step;
    const { at: _at, ...plain } = step;
    return plain;
  });
}

function countableVars_71_72(vars: SavedJson): SavedJson {
  return Object.fromEntries(Object.entries(vars).map(([name, v]) => {
    const value = v as SavedJson;
    return [name, value.kind === 'directions' ? { ...value, steps: countableSteps_71_72(value.steps as SavedJson[]) } : value];
  }));
}

function withCountableDirections_71_72(world: SavedJson): SavedJson {
  const player = world.player as SavedJson;
  const call = player.call as SavedJson | null;
  if (!call) return world;
  const line = call.line as SavedJson;
  const next = { ...call, vars: countableVars_71_72(call.vars as SavedJson), line: { ...line, vars: countableVars_71_72(line.vars as SavedJson) } };
  return { ...world, player: { ...player, call: next } };
}

const BEARING_LINES_67_68: readonly string[] = ['townBearing', 'siteBearing', 'aWreckNobodyPicked', 'rolledPastSite'];

function withoutBearingCall_67_68(world: SavedJson): SavedJson {
  const player = world.player as SavedJson;
  const call = player.call as SavedJson | null;
  const said = (call?.line as SavedJson | undefined)?.line;
  return typeof said === 'string' && BEARING_LINES_67_68.includes(said) ? { ...world, player: { ...player, call: null } } : world;
}

const TOWN_GOODS_82_83: readonly string[] = ['grain', 'textiles', 'meds', 'parts', 'electronics', 'water', 'scrap', 'batteries', 'salt', 'tools', 'rations', 'fuelDrums'];

const STOCK_TARGETS_82_83: Record<string, Record<string, number>> = {
  bowl: Object.fromEntries(TOWN_GOODS_82_83.map((good) => [good, 120])),
  nose: { ...Object.fromEntries(TOWN_GOODS_82_83.filter((good) => good !== 'grain').map((good) => [good, 120])), relics: 0 },
  'salvage-yard': { scrap: 30, parts: 30, tools: 30, rations: 30, fuelDrums: 30, relics: 0 },
  granary: { rations: 38, grain: 30, salt: 30, water: 30, tools: 30, fuelDrums: 30 },
  'pump-station': { fuelDrums: 229, tools: 30, batteries: 30, rations: 30 },
  dustwell: { water: 30, tools: 30, meds: 30, rations: 30, fuelDrums: 30 },
  'green-pit': { water: 30, salt: 30, textiles: 30, rations: 30, fuelDrums: 30 },
};

const ELASTICITY_82_83 = 0.6;

function stockFromPressure_82_83(target: number, pressure: number | undefined): number {
  return Math.max(0, Math.round(target * (1 - (pressure ?? 0) / ELASTICITY_82_83)));
}

function tradesAt_82_83(shopId: string, good: string): boolean {
  return good in (STOCK_TARGETS_82_83[shopId] ?? {});
}

function haulStillRuns_82_83(contract: SavedJson): boolean {
  return contract.kind !== 'haul' || (tradesAt_82_83(contract.shop as string, contract.good as string) && tradesAt_82_83(contract.to as string, contract.good as string));
}

function shopWithGoods_82_83(shopId: string, shop: SavedJson): SavedJson {
  const { pressure = {}, ...rest } = shop as SavedJson & { pressure?: Record<string, number> };
  const targets = STOCK_TARGETS_82_83[shopId];
  if (!targets) throw new Error(`Save holds an unknown shop ${shopId}`);
  const goods = Object.fromEntries(Object.entries(targets).map(([good, target]) => [good, stockFromPressure_82_83(target, pressure[good])]));
  const contracts = (rest.contracts as SavedJson[]).filter(haulStillRuns_82_83);
  return { ...rest, contracts, goods, event: null, shortSince: {}, opened: {} };
}

function withoutHaulGoal_82_83(vehicle: SavedJson): SavedJson {
  const brain = vehicle.brain as SavedJson | null;
  if (!brain) return vehicle;
  const goals = (brain.goals as SavedJson[]).filter((goal) => goal.kind !== 'haul').map(({ load: _load, ...goal }) => goal);
  const job = vehicle.job as SavedJson | null | undefined;
  const hauling = job?.kind === 'business' && job.deal === 'haul';
  return { ...vehicle, job: hauling ? null : job, brain: { ...brain, goals } };
}

function withShopGoods_82_83(world: SavedJson): SavedJson {
  const shops = Object.fromEntries(Object.entries(world.shops as Record<string, SavedJson>).map(([id, shop]) => [id, shopWithGoods_82_83(id, shop)]));
  const vehicles = (world.vehicles as SavedJson[]).map(withoutHaulGoal_82_83);
  return { ...world, shops, vehicles, roadNews: [] };
}

const STAPLE_SHOPS_83_84 = ['bowl', 'nose'];
const STAPLE_PART_83_84 = 'stockEngine';
type SavedShop = { stock: { defId: string }[]; restockAt: number };

function withStapleRestock_83_84(world: SavedJson): SavedJson {
  const shops = { ...(world.shops as Record<string, SavedShop>) };
  for (const id of STAPLE_SHOPS_83_84) {
    const shop = shops[id];
    if (shop && !shop.stock.some((part) => part.defId === STAPLE_PART_83_84)) shops[id] = { ...shop, restockAt: world.turn as number };
  }
  return { ...world, shops };
}

type SavedQuests = { world: SavedJson; local: Record<string, SavedJson>; session: { quest: string; checkpoint: string; seed: number } | null };

function questsOf(world: SavedJson): SavedQuests {
  return (world.player as { quests: SavedQuests }).quests;
}

function withQuests(world: SavedJson, quests: SavedQuests): SavedJson {
  return { ...world, player: { ...(world.player as SavedJson), quests } };
}

function questVars(quests: SavedQuests, quest: string | null): SavedJson {
  return quest === null ? quests.world : (quests.local[quest] ?? {});
}

function withQuestVars(quests: SavedQuests, quest: string | null, vars: SavedJson): SavedQuests {
  if (quest === null) return { ...quests, world: vars };
  const { [quest]: _old, ...others } = quests.local;
  return { ...quests, local: Object.keys(vars).length > 0 ? { ...others, [quest]: vars } : others };
}

export function renameQuestVar(world: SavedJson, quest: string | null, from: string, to: string): SavedJson {
  const quests = questsOf(world);
  const { [from]: value, ...rest } = questVars(quests, quest);
  if (value === undefined) return world;
  if (to in rest) throw new Error(`Quest variable ${to} already holds a value, so ${from} cannot move there`);
  return withQuests(world, withQuestVars(quests, quest, { ...rest, [to]: value }));
}

export function dropQuestVar(world: SavedJson, quest: string | null, name: string): SavedJson {
  const quests = questsOf(world);
  const { [name]: _dropped, ...rest } = questVars(quests, quest);
  return withQuests(world, withQuestVars(quests, quest, rest));
}

export function moveQuestCheckpoint(world: SavedJson, quest: string, from: string, to: string): SavedJson {
  const quests = questsOf(world);
  const session = quests.session;
  if (session?.quest !== quest || session.checkpoint !== from) return world;
  return withQuests(world, { ...quests, session: { ...session, checkpoint: to } });
}

export function endQuestSession(world: SavedJson, quest: string): SavedJson {
  const quests = questsOf(world);
  return quests.session?.quest === quest ? withQuests(world, { ...quests, session: null }) : world;
}

export function dropQuest(world: SavedJson, quest: string): SavedJson {
  const quests = endQuestSession(world, quest);
  const { [quest]: _dropped, ...local } = questsOf(quests).local;
  return withQuests(quests, { ...questsOf(quests), local });
}
