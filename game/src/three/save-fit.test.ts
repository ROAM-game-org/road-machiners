import { describe, expect, it } from 'vitest';
import { startKit, START_KITS } from '../data/start';
import { highwayMap } from '../sim/highway';
import { defaultSetup } from '../sim/settings';
import { newWorld } from '../sim/world';
import { savedWorldSchema } from '../test/save-schema';
import { TEST_MAP } from '../test/map';
import { checkAgainstSchema, checkSavedWorld, dropUnknownKeysAgainst, dropUnknownKeys, type Schema, type SchemaNode } from './save-fit';
import SAVED_SCHEMA from './save-schema.json';
import { saveOf } from './save';

const HAND: Schema = {
  root: 'string',
  defs: {
    Point: { object: { x: 'number', y: 'number' }, optional: { label: 'string' } },
    Hit: { object: { kind: { lit: 'hit' }, damage: 'number' } },
    Miss: { object: { kind: { lit: 'miss' } } },
    Tree: { object: { children: { array: { ref: 'Tree' } } } },
  },
};

function fits(node: SchemaNode, value: unknown): string | null {
  try {
    checkAgainstSchema(value, { root: node, defs: HAND.defs });
    return null;
  } catch (error) {
    return (error as Error).message;
  }
}

describe('checkAgainstSchema', () => {
  it('accepts a matching primitive and refuses a wrong type', () => {
    expect(fits('string', 'a')).toBeNull();
    expect(fits('string', 1)).toBe('world: expected string');
  });

  it('refuses a number that is not finite', () => {
    expect(fits('number', NaN)).toBe('world: not a finite number');
    expect(fits('number', Infinity)).toBe('world: not a finite number');
  });

  it('names a missing required property', () => {
    expect(fits({ ref: 'Point' }, { x: 1 })).toBe('world.y: missing');
  });

  it('treats an undefined required property as missing', () => {
    expect(fits({ ref: 'Point' }, { x: 1, y: undefined })).toBe('world.y: missing');
  });

  it('lets an optional property be absent or undefined', () => {
    expect(fits({ ref: 'Point' }, { x: 1, y: 2 })).toBeNull();
    expect(fits({ ref: 'Point' }, { x: 1, y: 2, label: undefined })).toBeNull();
  });

  it('checks a present optional property', () => {
    expect(fits({ ref: 'Point' }, { x: 1, y: 2, label: 3 })).toBe('world.label: expected string');
  });

  it('refuses an unknown key', () => {
    expect(fits({ ref: 'Point' }, { x: 1, y: 2, z: 3 })).toBe('world.z: unknown key');
  });

  it('names the index of a bad array element', () => {
    expect(fits({ array: 'number' }, [1, 'a'])).toBe('world[1]: expected number');
  });

  it('checks every value of a record', () => {
    expect(fits({ record: 'number' }, { a: 1, b: 2 })).toBeNull();
    expect(fits({ record: 'number' }, { a: 1, b: null })).toBe('world.b: expected number');
  });

  it('checks a tuple by length and position', () => {
    expect(fits({ tuple: ['number', 'string'] }, [1, 'a'])).toBeNull();
    expect(fits({ tuple: ['number', 'string'] }, [1])).toBe('world: expected 2 items');
    expect(fits({ tuple: ['number', 'string'] }, [1, 2])).toBe('world[1]: expected string');
  });

  it('checks a literal', () => {
    expect(fits({ lit: 'hit' }, 'hit')).toBeNull();
    expect(fits({ lit: 'hit' }, 'miss')).toBe('world: expected "hit"');
  });

  it('picks a union member by tag and names the error inside it', () => {
    const union: SchemaNode = { union: [{ ref: 'Hit' }, { ref: 'Miss' }], tag: 'kind' };
    expect(fits(union, { kind: 'miss' })).toBeNull();
    expect(fits(union, { kind: 'hit', damage: 'a' })).toBe('world.damage: expected number');
    expect(fits(union, { kind: 'bite' })).toBe('world.kind: no union member has this tag');
  });

  it('picks a member whose tag is one of several literals', () => {
    const union: SchemaNode = { union: [{ object: { kind: { union: [{ lit: 'rock' }, { lit: 'tree' }] } } }, { object: { kind: { lit: 'landmark' }, yaw: 'number' } }], tag: 'kind' };
    expect(fits(union, { kind: 'tree' })).toBeNull();
    expect(fits(union, { kind: 'landmark', yaw: 1 })).toBeNull();
    expect(fits(union, { kind: 'rock', yaw: 1 })).toBe('world.yaw: unknown key');
  });

  it('takes the first fitting member of an untagged union', () => {
    expect(fits({ union: ['number', 'string'] }, 'a')).toBeNull();
    expect(fits({ union: ['number', 'string'] }, true)).toBe('world: fits no union member');
  });

  it('names the inner misfit of a nullable object', () => {
    const nullable: SchemaNode = { union: [{ ref: 'Point' }, 'null'] };
    expect(fits(nullable, null)).toBeNull();
    expect(fits(nullable, { x: 1 })).toBe('world.y: missing');
  });

  it('follows a recursive definition', () => {
    expect(fits({ ref: 'Tree' }, { children: [{ children: [] }] })).toBeNull();
    expect(fits({ ref: 'Tree' }, { children: [{ children: [{}] }] })).toBe('world.children[0].children[0].children: missing');
  });

  it('refuses a node kind it does not know', () => {
    expect(fits({ weird: 1 } as never, 1)).toBe('world: unknown schema node');
    expect(fits({ ref: 'Nope' }, {})).toBe('world: unknown definition Nope');
  });
});

describe('dropUnknownKeysAgainst', () => {
  it('removes unknown keys at every depth and keeps the rest', () => {
    const world = { list: [{ x: 1, y: 2, z: 3 }], more: { x: 1, y: 2, w: 4 } };
    const schema: Schema = { root: { object: { list: { array: { ref: 'Point' } }, more: { ref: 'Point' } } }, defs: HAND.defs };
    dropUnknownKeysAgainst(world, schema);
    expect(world).toEqual({ list: [{ x: 1, y: 2 }], more: { x: 1, y: 2 } });
  });

  it('never throws on a misfit', () => {
    const schema: Schema = { root: { object: { list: { array: 'number' } } }, defs: {} };
    const world: unknown = { list: 'nope', extra: 1 };
    expect(() => dropUnknownKeysAgainst(world, schema)).not.toThrow();
    expect(world).toEqual({ list: 'nope' });
  });

  it('follows a tag to pick the member whose keys stay', () => {
    const union: SchemaNode = { union: [{ ref: 'Hit' }, { ref: 'Miss' }], tag: 'kind' };
    const world = { a: { kind: 'miss', damage: 3 } };
    dropUnknownKeysAgainst(world, { root: { object: { a: union } }, defs: HAND.defs });
    expect(world).toEqual({ a: { kind: 'miss' } });
  });

  it('drops keys inside the one member of an untagged union that fits once cleaned', () => {
    const union: SchemaNode = { union: [{ object: { n: 'number' } }, { object: { s: 'string' } }] };
    const world = { a: { s: 'x', junk: 1 } };
    dropUnknownKeysAgainst(world, { root: { object: { a: union } }, defs: {} });
    expect(world).toEqual({ a: { s: 'x' } });
  });

  it('leaves an untagged union value alone when no member fits it, cleaned or not', () => {
    const union: SchemaNode = { union: [{ object: { id: 'string', pos: 'number', born: 'number' } }, { object: { id: 'string' } }] };
    const world = { a: { id: 's', pos: 3 } };
    dropUnknownKeysAgainst(world, { root: { object: { a: union } }, defs: {} });
    expect(world).toEqual({ a: { id: 's', pos: 3 } });
  });

  it('leaves an untagged union value alone when it already fits a member', () => {
    const union: SchemaNode = { union: [{ object: { id: 'string' } }, { object: { id: 'string', pos: 'number' } }] };
    const world = { a: { id: 's', pos: 3 } };
    dropUnknownKeysAgainst(world, { root: { object: { a: union } }, defs: {} });
    expect(world).toEqual({ a: { id: 's', pos: 3 } });
  });
});

describe('the saved world schema', () => {
  it('equals the generator output', () => {
    expect(SAVED_SCHEMA, 'Run npm run save:shape').toEqual(JSON.parse(JSON.stringify(savedWorldSchema())));
  });

  it('keeps ids of content as plain strings and tags as literals', () => {
    const json = JSON.stringify(SAVED_SCHEMA);
    expect(json).toContain('"tag":"kind"');
    expect(json).toContain('{"lit":"haul"}');
  });
});

type Saved = {
  crimes?: unknown;
  vehicles: { brain?: { traits: unknown }; oddFront?: number }[];
  player: { money: unknown; perks: unknown; standing: Record<string, unknown> };
};

describe('checkSavedWorld on game worlds', () => {
  function roaming() {
    return newWorld(1337, startKit('standard'), TEST_MAP, defaultSetup('roaming'));
  }

  function savedJson(world = roaming()): Saved {
    return JSON.parse(JSON.stringify(saveOf(world).world));
  }

  it('passes a new Roaming game', () => {
    expect(() => checkSavedWorld(saveOf(roaming()).world)).not.toThrow();
  });

  it('passes a new Roaming game after a JSON round trip', () => {
    expect(() => checkSavedWorld(savedJson())).not.toThrow();
  });

  it('passes a new Chaos Highway game', () => {
    const world = newWorld(1337, START_KITS.arrival, highwayMap(1337, 0), defaultSetup('chaosHighway'));
    expect(() => checkSavedWorld(saveOf(world).world)).not.toThrow();
  });

  it('names a missing crimes list', () => {
    const saved = savedJson();
    delete saved.crimes;
    expect(() => checkSavedWorld(saved)).toThrow('world.crimes: missing');
  });

  it('passes a content id the build no longer has', () => {
    const saved = savedJson();
    const brain = saved.vehicles.find((vehicle) => vehicle.brain)?.brain;
    if (!brain) throw new Error('The new game has no truck with a brain');
    brain.traits = ['a-trait-no-build-has'];
    saved.player.perks = ['a-perk-no-build-has'];
    expect(() => checkSavedWorld(saved)).not.toThrow();
  });

  it('refuses an unknown key, and dropUnknownKeys removes it', () => {
    const saved = savedJson();
    saved.vehicles[0].oddFront = 1;
    expect(() => checkSavedWorld(saved)).toThrow('world.vehicles[0].oddFront: unknown key');
    dropUnknownKeys(saved);
    expect(saved.vehicles[0].oddFront).toBeUndefined();
    expect(() => checkSavedWorld(saved)).not.toThrow();
  });

  it('keeps a storm with a missing field whole and names the field, instead of trimming it to a heatwave', () => {
    const saved = { ...savedJson(), weather: [{ id: 'w1', kind: 'storm', pos: { x: 1, y: 2 }, radius: 3, vel: { x: 0, y: 0 }, turnsLeft: 4 }] };
    dropUnknownKeys(saved);
    expect(saved.weather[0].pos).toEqual({ x: 1, y: 2 });
    expect(() => checkSavedWorld(saved)).toThrow('world.weather[0].born: missing');
  });

  it('refuses a heatwave that carries storm fields', () => {
    const saved = { ...savedJson(), weather: [{ id: 'w1', kind: 'heatwave', pos: { x: 1, y: 2 }, turnsLeft: 4 }] };
    expect(() => checkSavedWorld(saved)).toThrow('world.weather[0].pos: unknown key');
  });

  it('refuses NaN', () => {
    const saved = savedJson();
    saved.player.money = NaN;
    expect(() => checkSavedWorld(saved)).toThrow('world.player.money: not a finite number');
  });

  it('refuses a mistyped nested field', () => {
    const saved = savedJson();
    saved.player.standing.marshals = 'high';
    expect(() => checkSavedWorld(saved)).toThrow('world.player.standing.marshals: expected number');
  });
});
