
import { chaosHighwayMode_112_113 } from './save-steps-late';
import type { SaveSlots } from './save-db';

import { QUESTS, startQuest } from '../sim/quests';
import { isMode, parseSetup } from '../sim/settings';
import type { GameModeId, World, WorldSetup } from '../sim/types';

import { t, type Msg } from '../text/msg';

export type SlotId = 'auto' | 'day' | `slot${number}`;

export function manualSlots(count: number): SlotId[] {
  return Array.from({ length: count }, (_, i) => `slot${i + 1}` as const);
}

export function allSlots(count: number): SlotId[] {
  return ['auto', 'day', ...manualSlots(count)];
}

export function slotKey(base: string, slot: SlotId): string {
  return slot === 'auto' ? base : `${base}:${slot}`;
}

export function slotLabel(slot: SlotId): Msg {
  if (slot === 'auto') return t('save.slot.auto');
  if (slot === 'day') return t('save.slot.day');
  return t('save.slot.manual', { n: Number(slot.slice('slot'.length)) });
}

export type SlotInfo = { slot: SlotId; savedAt: number; turn: number | null; mode: GameModeId | null };

function numberOr(value: unknown, fallback: number | null): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : fallback;
}

function infoOf(slot: SlotId, envelope: unknown): SlotInfo {
  const { savedAt, world } = (typeof envelope === 'object' && envelope !== null ? envelope : {}) as { savedAt?: unknown; world?: SavedWorld };
  return { slot, savedAt: numberOr(savedAt, 0) ?? 0, turn: numberOr(world?.turn, null), mode: savedMode(world) };
}

type SavedWorld = { turn?: unknown; setup?: { mode?: unknown } };

function savedMode(world: SavedWorld | undefined): GameModeId | null {
  const mode = chaosHighwayMode_112_113(world?.setup?.mode);
  return isMode(mode) ? mode : null;
}

export function listSaves(slots: SaveSlots, count: number): SlotInfo[] {
  const infos = allSlots(count).flatMap((slot) => slots.has(slot) ? [infoOf(slot, slots.get(slot))] : []);
  return infos.sort((a, b) => b.savedAt - a.savedAt);
}

export type RoadBoot = { slot: SlotId; reason: 'road' };
export type BootRequest = SlotId | { new: WorldSetup; intro: boolean } | RoadBoot;

function requestKey(base: string): string {
  return `${base}.boot`;
}

export function requestBoot(session: Storage, base: string, request: BootRequest): void {
  session.setItem(requestKey(base), typeof request === 'string' ? request : JSON.stringify(request));
}

function isSlotId(value: string): value is SlotId {
  return value === 'auto' || value === 'day' || /^slot[1-9]\d*$/.test(value);
}

export function takeBootRequest(session: Storage, base: string): BootRequest | null {
  const value = session.getItem(requestKey(base));
  if (value === null) return null;
  session.removeItem(requestKey(base));
  if (isSlotId(value)) return value;
  const request = parsedRequest(value);
  if ('new' in request) return { new: parseSetup(request.new), intro: introOf(request.intro, value) };
  if (isRoadBoot(request)) return { slot: request.slot, reason: 'road' };
  throw new Error(`Unknown boot request ${value}`);
}

function introOf(intro: unknown, value: string): boolean {
  if (typeof intro !== 'boolean') throw new Error(`Boot request has no intro choice: ${value}`);
  return intro;
}

function isRoadBoot(request: { slot?: unknown; reason?: unknown }): request is { slot: SlotId; reason: 'road' } {
  return request.reason === 'road' && typeof request.slot === 'string' && isSlotId(request.slot);
}

function parsedRequest(value: string): { new?: unknown; intro?: unknown; slot?: unknown; reason?: unknown } {
  let request: unknown;
  try {
    request = JSON.parse(value);
  } catch {
    throw new Error(`Unknown boot request ${value}`);
  }
  if (typeof request !== 'object' || request === null) throw new Error(`Unknown boot request ${value}`);
  return request;
}

export interface QuestJump {
  quest: string;
  checkpoint: string | null;
  picks: number[];
  page: number;
}

export function questJumpOf(search: string): QuestJump | null {
  const params = new URLSearchParams(search);
  const quest = params.get('quest');
  if (quest === null) return null;
  const picks = params.get('picks');
  const page = params.get('page');
  return { quest, checkpoint: params.get('checkpoint'), picks: picks ? picks.split(',').map((p) => countFromOne('picks', p) - 1) : [], page: page ? countFromOne('page', page) - 1 : 0 };
}

function countFromOne(param: string, text: string): number {
  if (!/^[1-9]\d*$/.test(text)) throw new Error(`?${param} holds ${text}, which is no number from 1`);
  return Number(text);
}

export function jumpToQuest(world: World, jump: QuestJump): World {
  const known = QUESTS.quests[jump.quest];
  if (!known) throw new Error(`?quest=${jump.quest} names no quest. Known: ${Object.keys(QUESTS.quests).join(', ')}`);
  return startQuest(world, QUESTS, jump.quest, jump.checkpoint ?? known.checkpoints[0]);
}
