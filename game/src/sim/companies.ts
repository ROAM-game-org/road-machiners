import { addState } from './states';
import type { NpcState, StateData, StateKindId, Vehicle, World } from './types';

export const FOLLOWING_KINDS = ['escort', 'crew', 'hire'] as const;
export type FollowingKind = (typeof FOLLOWING_KINDS)[number];

type StateIndex = {
  following: Map<string, NpcState>;
  followers: Map<string, NpcState[]>;
  combat: Map<string, NpcState[]>;
};

const INDEXES = new WeakMap<readonly NpcState[], StateIndex>();

export function isFollowingKind(kind: StateKindId): kind is FollowingKind {
  return (FOLLOWING_KINDS as readonly StateKindId[]).includes(kind);
}

function indexOf(w: World): StateIndex {
  const cached = INDEXES.get(w.states);
  if (cached) return cached;
  const index = buildIndex(w.states);
  INDEXES.set(w.states, index);
  return index;
}

function buildIndex(states: readonly NpcState[]): StateIndex {
  const index: StateIndex = { following: new Map(), followers: new Map(), combat: new Map() };
  for (const s of states) {
    if (s.kind === 'combat') {
      listAdd(index.combat, s.holder, s);
      listAdd(index.combat, s.other, s);
    } else if (isFollowingKind(s.kind)) {
      const held = index.following.get(s.holder);
      if (held) throw new Error(`${s.holder} holds two following states, ${held.id} and ${s.id}`);
      index.following.set(s.holder, s);
      listAdd(index.followers, s.other, s);
    }
  }
  for (const list of index.followers.values()) list.sort(byBirthThenHolder);
  return index;
}

function listAdd(map: Map<string, NpcState[]>, id: string, s: NpcState): void {
  const list = map.get(id);
  if (list) list.push(s);
  else map.set(id, [s]);
}

function byBirthThenHolder(a: NpcState, b: NpcState): number {
  return a.born - b.born || (a.holder < b.holder ? -1 : a.holder > b.holder ? 1 : 0);
}

export function joinCompany(w: World, follower: Vehicle, leader: Vehicle, kind: FollowingKind, data: StateData, turnsLeft?: number): NpcState {
  const held = followingOf(w, follower);
  if (held) throw new Error(`${follower.id} already follows ${held.other} as ${held.kind}`);
  if (follower.id === leader.id || rootId(w, leader.id) === follower.id) throw new Error(`${follower.id} cannot follow ${leader.id}: the company would form a loop`);
  const s = addState(w, kind, follower.id, leader.id, data);
  if (turnsLeft !== undefined) s.turnsLeft = turnsLeft;
  return s;
}

export function followingOf(w: World, v: Vehicle): NpcState | null {
  return indexOf(w).following.get(v.id) ?? null;
}

export function followingStatesOf(w: World, leaderId: string): readonly NpcState[] {
  return indexOf(w).followers.get(leaderId) ?? [];
}

export function followersOf(w: World, leaderId: string, kinds: readonly FollowingKind[] = FOLLOWING_KINDS): Vehicle[] {
  return followingStatesOf(w, leaderId).filter((s) => kinds.includes(s.kind as FollowingKind)).flatMap((s) => {
    const v = w.vehicles.find((x) => x.id === s.holder);
    return v ? [v] : [];
  });
}

function chainOf(w: World, id: string): string[] {
  const { following } = indexOf(w);
  const chain = [id];
  for (let s = following.get(id); s; s = following.get(s.other)) {
    if (chain.includes(s.other)) throw new Error(`Following states loop through ${s.other}`);
    chain.push(s.other);
  }
  return chain;
}

function rootId(w: World, id: string): string {
  return chainOf(w, id).at(-1)!;
}

export function leaderOf(w: World, v: Vehicle): Vehicle {
  const chain = chainOf(w, v.id);
  for (let i = chain.length - 1; i > 0; i--) {
    const leader = w.vehicles.find((x) => x.id === chain[i]);
    if (leader) return leader;
  }
  return v;
}

export function companyOf(w: World, v: Vehicle): { leader: Vehicle; members: Vehicle[] } {
  const leader = leaderOf(w, v);
  const members: Vehicle[] = [];
  const queue = [leader.id];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    for (const follower of followersOf(w, id)) {
      members.push(follower);
      queue.push(follower.id);
    }
  }
  return { leader, members };
}

export function sameCompany(w: World, a: Vehicle, b: Vehicle): boolean {
  return a.id !== b.id && rootId(w, a.id) === rootId(w, b.id);
}

export function inCompany(w: World, v: Vehicle): boolean {
  return followingOf(w, v) !== null || followingStatesOf(w, v.id).length > 0;
}

export function combatStatesOf(w: World, id: string): readonly NpcState[] {
  return indexOf(w).combat.get(id) ?? [];
}

export function checkCompanies(w: World): void {
  for (const holder of indexOf(w).following.keys()) chainOf(w, holder);
}
