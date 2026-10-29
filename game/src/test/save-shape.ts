
import { CHASSIS } from '../data/chassis';
import { PARTS } from '../data/parts';
import { startKit } from '../data/start';
import { makePart } from '../sim/factory';
import type { Contract } from '../sim/market';
import type { SalvageStock } from '../sim/types';
import { isRig } from '../sim/body';
import { addVehicle, npcBrain } from './sample-vehicles';
import { newWorld } from '../sim/world';
import { saveOf } from '../three/save';
import { shapeOf, type Shape } from '../three/save-shape';
import { TEST_MAP } from './map';
import { defaultSetup } from '../sim/settings';
import type { QuestBundle, QuestLinks, QuestValueType, QuestVarDecl } from '../data/quests';

const CONTRACT_KINDS: Contract[] = [
  { id: 'c', shop: 's', kind: 'haul', good: 'g', units: 1, to: 't', reward: 1, deadline: 1, window: 1, rush: false, tier: 1 },
  { id: 'c', shop: 's', kind: 'procure', good: 'g', units: 1, cratePay: 1, reward: 1, deadline: 1, window: 1, tier: 1 },
  { id: 'c', shop: 's', kind: 'search', target: 'v', driver: 'd', template: 't', lead: { at: { x: 1, y: 1 }, turn: 1 }, reward: 1, deadline: 1, window: 1, tier: 1, delivered: false },
  { id: 'c', shop: 's', kind: 'rescue', client: 'v', driver: 'd', need: 'fuel', area: { x: 1, y: 1 }, reward: 1, deadline: 1, window: 1, tier: 1, fulfilled: false },
];

const WEAPON_ID = Object.keys(PARTS).find((id) => PARTS[id].kind === 'weapon');
const PLAIN_ID = Object.keys(PARTS).find((id) => PARTS[id].kind !== 'weapon');

export function newGameShape(): Shape {
  const world = newWorld(1337, startKit('standard'), TEST_MAP, defaultSetup('roaming'));
  if (!WEAPON_ID || !PLAIN_ID) throw new Error('The part data has no weapon or no other part');
  for (const shop of Object.values(world.shops)) {
    shop.contracts = CONTRACT_KINDS;
    shop.stock = [makePart(world, WEAPON_ID, 0), makePart(world, PLAIN_ID, 0)];
  }
  const mixes = new Map<string, SalvageStock>(world.salvage.map((stock) => [Object.keys(lootGoods(stock)).sort().join(), stock]));
  world.salvage = [...mixes.values()].flatMap((stock) =>
    [[], [makePart(world, WEAPON_ID, 0)], [makePart(world, PLAIN_ID, 0)]].map((parts) => {
      const goods = lootGoods(stock);
      return { ...stock, goods, parts, hidden: { ...stock.hidden, goods: { ...goods }, parts } };
    }),
  );
  if (!world.vehicles.some((truck) => truck.brain && isRig(truck.chassisId))) {
    const rig = Object.keys(CHASSIS).find(isRig);
    if (!rig) throw new Error('The chassis data has no rig');
    const home = world.vehicles[0].pos;
    addVehicle(world, 'independent', rig, ['stockEngine'], home).brain = npcBrain('trader', home, ['trader']);
  }
  for (const v of world.vehicles.filter((truck) => truck.brain)) {
    v.items = [
      { id: 'i-goods', x: 0, y: 0, rot: 0, kind: 'good', good: 'g' },
      { id: 'i-gun', x: 0, y: 0, rot: 0, kind: 'part', part: makePart(world, WEAPON_ID, 0) },
      { id: 'i-plain', x: 0, y: 0, rot: 0, kind: 'part', part: makePart(world, PLAIN_ID, 0) },
    ];
  }
  for (const moment of Object.values(world.moments ?? {})) moment.driver = world.vehicles.find((v) => v.brain)!.id;
  world.player.quests.session = { quest: 'q', checkpoint: 'c', seed: 1 };
  world.vehicles.find((v) => v.id === world.player.vehicleId)!.items.push({ id: 'i-parcel', x: 0, y: 0, rot: 0, kind: 'parcel', contract: 'c' });
  return shapeOf(JSON.parse(JSON.stringify(saveOf(world).world)));
}

export type QuestNames = { world: Record<string, QuestValueType>; local: Record<string, Record<string, QuestValueType>>; checkpoints: Record<string, string[]> };

export function questNames(bundle: QuestBundle): QuestNames {
  const types = (vars: Record<string, QuestVarDecl>) => Object.fromEntries(Object.entries(vars).map(([name, decl]) => [name, decl.type]));
  const quests = Object.entries(bundle.quests);
  return {
    world: types(bundle.world),
    local: Object.fromEntries(quests.map(([id, quest]) => [id, types(quest.vars)])),
    checkpoints: Object.fromEntries(quests.map(([id, quest]) => [id, quest.checkpoints])),
  };
}

export function lostQuestNames(recorded: QuestNames, current: QuestNames, raised: readonly string[] = []): string[] {
  const lostVars = (owner: string, was: Record<string, QuestValueType>, now: Record<string, QuestValueType> | undefined) =>
    Object.entries(was).filter(([name, type]) => now?.[name] !== type).map(([name, type]) => `${owner} variable ${name} (${type})`);
  return [
    ...lostVars('World', recorded.world, current.world),
    ...Object.entries(recorded.local).filter(([id]) => !raised.includes(id)).flatMap(([id, vars]) => lostVars(`Quest ${id}`, vars, current.local[id])),
    ...Object.entries(recorded.checkpoints).filter(([id]) => !raised.includes(id)).flatMap(([id, names]) => names.filter((n) => !current.checkpoints[id]?.includes(n)).map((n) => `Quest ${id} checkpoint ${n}`)),
  ];
}

export type QuestLinkRecord = Record<string, { revision: number; links: QuestLinks }>;

export function questLinks(bundle: QuestBundle): QuestLinkRecord {
  return Object.fromEntries(Object.entries(bundle.quests).map(([id, quest]) => [id, { revision: quest.revision, links: quest.links }]));
}

export function raisedQuests(recorded: QuestLinkRecord, current: QuestLinkRecord): string[] {
  return Object.keys(current).filter((id) => recorded[id] !== undefined && current[id].revision > recorded[id].revision);
}

export function brokenLinks(recorded: QuestLinkRecord, current: QuestLinkRecord, compatible: readonly string[]): string[] {
  const raised = raisedQuests(recorded, current);
  return Object.keys(current)
    .filter((id) => recorded[id] !== undefined && !raised.includes(id) && !compatible.includes(id))
    .flatMap((id) => linkChanges(id, recorded[id], current[id]));
}

function linkChanges(id: string, was: QuestLinkRecord[string], now: QuestLinkRecord[string]): string[] {
  const gone = (before: readonly string[], after: readonly string[]) => before.filter((item) => !after.includes(item));
  const writes = Object.entries(was.links.writes).flatMap(([name, values]) =>
    values.filter((value) => !(now.links.writes[name] ?? []).includes(value)).map((value) => `quest ${id} no longer writes ${JSON.stringify(value)} to ${name}`));
  return [
    ...(now.revision < was.revision ? [`quest ${id} went down from revision ${was.revision} to ${now.revision}`] : []),
    ...writes,
    ...gone(was.links.notes, now.links.notes).map((note) => `quest ${id} no longer gives note ${note}`),
    ...gone(now.links.reads, was.links.reads).map((name) => `quest ${id} now reads ${name}`),
    ...gone(now.links.readsNotes, was.links.readsNotes).map((note) => `quest ${id} now reads note ${note}`),
    ...gone(now.links.begins, was.links.begins).map((quest) => `quest ${id} now begins ${quest}`),
    ...gone(was.links.begins, now.links.begins).map((quest) => `quest ${id} no longer begins ${quest}`),
  ];
}

export function revisionReach(bundle: QuestBundle, root: string): string[] {
  const reach = new Set([root, ...bundle.quests[root].links.begins]);
  let size: number;
  do {
    size = reach.size;
    const links = [...reach].map((id) => bundle.quests[id].links);
    const vars = new Set(links.flatMap((l) => Object.keys(l.writes)));
    const notes = new Set(links.flatMap((l) => l.notes));
    for (const [id, quest] of Object.entries(bundle.quests)) {
      if (quest.links.reads.some((name) => vars.has(name)) || quest.links.readsNotes.some((note) => notes.has(note))) reach.add(id);
    }
  } while (size !== reach.size);
  return Object.keys(bundle.quests).filter((id) => reach.has(id));
}

function lootGoods(stock: SalvageStock): Record<string, number> {
  return { ...stock.hidden.goods, ...stock.goods };
}
