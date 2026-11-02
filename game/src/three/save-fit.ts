import type { BrokenProp, Player, QuestState, ShelteredTruck, Vehicle, World } from '../sim/types';
import SAVED_SCHEMA from './save-schema.json';

type SavedPlayer = Omit<Player, 'visible' | 'contacts' | 'clouds' | 'quests' | 'explored'> & {
  quests: Omit<QuestState, 'live'>;
  explored: string;
};

export type SavedWorld = Omit<World, 'terrain' | 'events' | 'removed' | 'vehicles' | 'sheltered' | 'broken' | 'player'> & {
  vehicles: Omit<Vehicle, 'trail'>[];
  sheltered: { vehicle: Omit<Vehicle, 'trail'>; site: ShelteredTruck['site'] }[];
  broken: { id: BrokenProp['obstacle']['id']; turn: number }[];
  player: SavedPlayer;
};

export type SchemaNode =
  | 'string'
  | 'number'
  | 'boolean'
  | 'null'
  | { lit: string }
  | { array: SchemaNode }
  | { tuple: SchemaNode[] }
  | { object: Record<string, SchemaNode>; optional?: Record<string, SchemaNode> }
  | { record: SchemaNode }
  | { union: SchemaNode[]; tag?: string }
  | { ref: string };

export type Schema = { root: SchemaNode; defs: Record<string, SchemaNode> };

type Defs = Record<string, SchemaNode>;
type Check = (value: unknown, node: never, path: string, defs: Defs) => void;
type Bag = Record<string, unknown>;

class Misfit extends Error {}

function throwMisfitError(path: string, problem: string): never {
  throw new Misfit(`${path}: ${problem}`);
}

function isBag(value: unknown): value is Bag {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function lookup(defs: Defs, name: string): SchemaNode | undefined {
  return Object.hasOwn(defs, name) ? defs[name] : undefined;
}

function definition(defs: Defs, name: string, path: string): SchemaNode {
  return lookup(defs, name) ?? throwMisfitError(path, `unknown definition ${name}`);
}

function checkPrimitive(value: unknown, node: string, path: string): void {
  if (node === 'null') {
    if (value !== null) throwMisfitError(path, 'expected null');
    return;
  }
  if (typeof value !== node) throwMisfitError(path, `expected ${node}`);
  if (node === 'number' && !Number.isFinite(value)) throwMisfitError(path, 'not a finite number');
}

function checkLiteral(value: unknown, node: { lit: string }, path: string): void {
  if (value !== node.lit) throwMisfitError(path, `expected ${JSON.stringify(node.lit)}`);
}

function checkArray(value: unknown, node: { array: SchemaNode }, path: string, defs: Defs): void {
  if (!Array.isArray(value)) throwMisfitError(path, 'expected array');
  value.forEach((item, i) => checkNode(item, node.array, `${path}[${i}]`, defs));
}

function checkTuple(value: unknown, node: { tuple: SchemaNode[] }, path: string, defs: Defs): void {
  if (!Array.isArray(value)) throwMisfitError(path, 'expected array');
  if (value.length !== node.tuple.length) throwMisfitError(path, `expected ${node.tuple.length} items`);
  node.tuple.forEach((item, i) => checkNode(value[i], item, `${path}[${i}]`, defs));
}

function checkRecord(value: unknown, node: { record: SchemaNode }, path: string, defs: Defs): void {
  if (!isBag(value)) throwMisfitError(path, 'expected object');
  for (const [key, item] of Object.entries(value)) checkNode(item, node.record, `${path}.${key}`, defs);
}

function checkRequired(value: Bag, required: Defs, path: string, defs: Defs): void {
  for (const [key, child] of Object.entries(required)) {
    if (value[key] === undefined) throwMisfitError(`${path}.${key}`, 'missing');
    checkNode(value[key], child, `${path}.${key}`, defs);
  }
}

function checkOptional(value: Bag, optional: Defs, path: string, defs: Defs): void {
  for (const [key, child] of Object.entries(optional)) {
    if (value[key] !== undefined) checkNode(value[key], child, `${path}.${key}`, defs);
  }
}

function checkObject(value: unknown, node: { object: Defs; optional?: Defs }, path: string, defs: Defs): void {
  if (!isBag(value)) throwMisfitError(path, 'expected object');
  const optional = node.optional ?? {};
  checkRequired(value, node.object, path, defs);
  checkOptional(value, optional, path, defs);
  const unknown = Object.keys(value).find((key) => !Object.hasOwn(node.object, key) && !Object.hasOwn(optional, key));
  if (unknown !== undefined) throwMisfitError(`${path}.${unknown}`, 'unknown key');
}

function objectOf(node: SchemaNode, defs: Defs): SchemaNode {
  if (typeof node === 'object' && 'ref' in node) {
    const target = lookup(defs, node.ref);
    return target === undefined ? node : objectOf(target, defs);
  }
  return node;
}

function literalsIn(node: SchemaNode | undefined): unknown[] {
  if (typeof node !== 'object') return [];
  if ('lit' in node) return [node.lit];
  return 'union' in node ? node.union.flatMap(literalsIn) : [];
}

function tagsOf(member: SchemaNode, tag: string, defs: Defs): unknown[] {
  const shape = objectOf(member, defs);
  if (typeof shape !== 'object' || !('object' in shape)) return [];
  return literalsIn(shape.object[tag]);
}

function memberByTag(value: unknown, node: { union: SchemaNode[]; tag: string }, defs: Defs): SchemaNode | undefined {
  if (!isBag(value)) return undefined;
  return node.union.find((member) => tagsOf(member, node.tag, defs).includes(value[node.tag]));
}

function checkTagged(value: unknown, node: { union: SchemaNode[]; tag: string }, path: string, defs: Defs): void {
  if (!isBag(value)) throwMisfitError(path, 'expected object');
  const member = memberByTag(value, node, defs);
  if (member === undefined) throwMisfitError(`${path}.${node.tag}`, 'no union member has this tag');
  checkNode(value, member, path, defs);
}

function fitsNode(value: unknown, node: SchemaNode, path: string, defs: Defs): boolean {
  try {
    checkNode(value, node, path, defs);
    return true;
  } catch (error) {
    if (error instanceof Misfit) return false;
    throw error;
  }
}

function checkUnion(value: unknown, node: { union: SchemaNode[]; tag?: string }, path: string, defs: Defs): void {
  if (value === null && node.union.includes('null')) return;
  if (node.tag !== undefined) return checkTagged(value, { union: node.union, tag: node.tag }, path, defs);
  const candidates = node.union.filter((member) => member !== 'null');
  if (candidates.length === 1) return checkNode(value, candidates[0], path, defs);
  if (!candidates.some((member) => fitsNode(value, member, path, defs))) throwMisfitError(path, 'fits no union member');
}

function checkRef(value: unknown, node: { ref: string }, path: string, defs: Defs): void {
  checkNode(value, definition(defs, node.ref, path), path, defs);
}

const CHECKS: Record<string, Check> = {
  lit: checkLiteral,
  array: checkArray,
  tuple: checkTuple,
  object: checkObject,
  record: checkRecord,
  union: checkUnion,
  ref: checkRef,
};

const CHECK_KINDS = Object.keys(CHECKS);

function checkNode(value: unknown, node: SchemaNode, path: string, defs: Defs): void {
  if (typeof node === 'string') return checkPrimitive(value, node, path);
  const kind = CHECK_KINDS.find((name) => typeof node === 'object' && node !== null && name in node);
  if (kind === undefined) throwMisfitError(path, 'unknown schema node');
  CHECKS[kind](value, node as never, path, defs);
}

export function checkAgainstSchema(world: unknown, schema: Schema): void {
  checkNode(world, schema.root, 'world', schema.defs);
}

function dropObject(value: Bag, node: { object: Defs; optional?: Defs }, defs: Defs): void {
  const optional = node.optional ?? {};
  for (const key of Object.keys(value)) {
    if (Object.hasOwn(node.object, key)) dropNode(value[key], node.object[key], defs);
    else if (Object.hasOwn(optional, key)) dropNode(value[key], optional[key], defs);
    else delete value[key];
  }
}

function fitsAfterDrop(value: Bag, member: SchemaNode, defs: Defs): boolean {
  const trial = structuredClone(value);
  dropNode(trial, member, defs);
  return fitsNode(trial, member, 'world', defs);
}

function keysOf(member: SchemaNode, defs: Defs): string[] {
  const shape = objectOf(member, defs);
  if (typeof shape !== 'object' || !('object' in shape)) return [];
  return [...Object.keys(shape.object), ...Object.keys(shape.optional ?? {})];
}

function holdsEveryKey(value: Bag, member: SchemaNode, defs: Defs): boolean {
  const keys = new Set(keysOf(member, defs));
  return Object.keys(value).every((key) => keys.has(key));
}

function dropUntagged(value: Bag, members: SchemaNode[], defs: Defs): void {
  if (members.some((member) => fitsNode(value, member, 'world', defs))) return;
  const known = new Set(members.flatMap((member) => keysOf(member, defs)));
  for (const key of Object.keys(value)) if (!known.has(key)) delete value[key];
  const fitting = members.filter((member) => holdsEveryKey(value, member, defs) && fitsAfterDrop(value, member, defs));
  if (fitting.length === 1) dropNode(value, fitting[0], defs);
}

function dropUnion(value: unknown, node: { union: SchemaNode[]; tag?: string }, defs: Defs): void {
  if (!isBag(value)) return;
  if (node.tag === undefined) return dropUntagged(value, node.union, defs);
  const member = memberByTag(value, { union: node.union, tag: node.tag }, defs);
  if (member !== undefined) dropNode(value, member, defs);
}

function dropEach(values: unknown[], nodeAt: (i: number) => SchemaNode, defs: Defs): void {
  values.forEach((item, i) => dropNode(item, nodeAt(i), defs));
}

function dropArray(value: unknown, node: { array: SchemaNode }, defs: Defs): void {
  if (Array.isArray(value)) dropEach(value, () => node.array, defs);
}

function dropTuple(value: unknown, node: { tuple: SchemaNode[] }, defs: Defs): void {
  if (Array.isArray(value)) dropEach(value, (i) => node.tuple[i], defs);
}

function dropRecord(value: unknown, node: { record: SchemaNode }, defs: Defs): void {
  if (isBag(value)) dropEach(Object.values(value), () => node.record, defs);
}

function dropObjectNode(value: unknown, node: { object: Defs; optional?: Defs }, defs: Defs): void {
  if (isBag(value)) dropObject(value, node, defs);
}

function dropRef(value: unknown, node: { ref: string }, defs: Defs): void {
  dropNode(value, lookup(defs, node.ref), defs);
}

const DROPS: Record<string, (value: unknown, node: never, defs: Defs) => void> = {
  object: dropObjectNode,
  array: dropArray,
  tuple: dropTuple,
  record: dropRecord,
  union: dropUnion,
  ref: dropRef,
};

function dropNode(value: unknown, node: SchemaNode | undefined, defs: Defs): void {
  if (node === undefined || typeof node === 'string' || typeof value !== 'object' || value === null) return;
  const kind = Object.keys(DROPS).find((name) => name in node);
  if (kind !== undefined) DROPS[kind](value, node as never, defs);
}

export function dropUnknownKeysAgainst(world: unknown, schema: Schema): void {
  dropNode(world, schema.root, schema.defs);
}

function schemaOf(json: unknown): Schema {
  if (!isBag(json) || json.root === undefined || !isBag(json.defs)) throw new Error('The save schema file has no root and defs');
  return json as Schema;
}

const SCHEMA = schemaOf(SAVED_SCHEMA);

export function checkSavedWorld(world: unknown): void {
  checkAgainstSchema(world, SCHEMA);
}

export function dropUnknownKeys(world: unknown): void {
  dropUnknownKeysAgainst(world, SCHEMA);
}
