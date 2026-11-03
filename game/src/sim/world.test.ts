import { describe, expect, it } from 'vitest';
import { CHASSIS } from '../data/chassis';
import { START_KITS } from '../data/start';
import { TIME } from '../data/time';
import { TEST_MAP } from '../test/map';
import { playerVehicle } from './damage';
import { maxHp } from './wear';
import { townAt } from './sites';
import { autoRuns, endTurn, isAtRest, newWorld, setDirect, setHeadlights, setMoveOrder, setOverdrive, townStart, update, waitsOnPlayer } from './world';
import { leaveQuest, QUESTS, startQuest } from './quests';
import { GAME_OPENED_QUESTS } from '../data/quests';
import { startPose } from './start-pose';
import { dist } from './vec';
import { partDef } from '../data/parts';
import { RULES } from '../data/rules';
import { ENGINE_HEAT } from '../data/wear';
import { damagePartTo, repairAll } from './cheats';
import { advanceEngineHeat } from './engine-heat';
import { mountedParts } from './grid';
import { canOverdrive, vehicleStats } from './stats';
import { sunAt } from './sun';
import { addVehicle, comparableWorld, emptyWorld, npcBrain, testDrive } from './testkit';
import type { World } from './types';
import { defaultSetup } from './settings';
import { REGION } from '../data/region';
import { addState } from './states';

const BY_RADIUS = Object.keys(CHASSIS).sort((a, b) => CHASSIS[b].radius - CHASSIS[a].radius);
const TOWN_START_CHASSIS = [...BY_RADIUS.slice(0, 5), BY_RADIUS[BY_RADIUS.length - 1]];

describe('townStart', () => {
  it.each(TOWN_START_CHASSIS)('parks a %s on a town pad with no vehicle on top of it', (chassis) => {
    const kit = { ...START_KITS.standard, chassis, parts: [], placed: [], cargo: {}, storage: [], opening: null };
    const world = newWorld(7, kit, TEST_MAP, defaultSetup('roaming'), true, townStart());
    const truck = playerVehicle(world);
    expect(townAt(world), chassis).not.toBeNull();
    for (const v of world.vehicles.filter((o) => o !== truck)) {
      expect(dist(v.pos, truck.pos), `${chassis} and ${v.id}`).toBeGreaterThan(vehicleStats(world, truck).radius);
    }
  });

  it('leaves the default start where the new game puts it', () => {
    const world = newWorld(7, START_KITS.standard, TEST_MAP, defaultSetup('roaming'), false);
    expect(playerVehicle(world).pos).toEqual(startPose().pos);
  });
});

describe('the overdrive cutoff', () => {
  const cutEvents = (w: World) => w.events.filter((e) => e.t === 'info' && e.note.id === 'overdriveCutOut').length;
  const engineOf = (w: World) => mountedParts(playerVehicle(w), 'engine')[0];

  function overdriving(hp: number): World {
    const w = emptyWorld();
    w.player.ranks.driving = 1;
    w.player.overdrive = true;
    engineOf(w).hp = hp;
    return w;
  }

  it('switches overdrive off when other damage takes the engine to 15%', () => {
    const w = overdriving(stockHp());
    const engine = engineOf(w);
    const next = damagePartTo(w, engine.defId, Math.floor(RULES.overdriveMinEngineShare * stockHp()));
    expect(next.player.overdrive).toBe(false);
    expect(cutEvents(next)).toBe(1);
    expect(cutEvents(update(next, () => {}))).toBe(0);
  });

  it('switches overdrive off when heat damage takes the engine to 15%, with no boost or overdrive heat after', () => {
    const limit = RULES.overdriveMinEngineShare * stockHp();
    const w = overdriving(Math.floor(limit) + ENGINE_HEAT.overheatDamage);
    w.player.engineHeat = 1;
    const next = endTurn(w, (d) => {
      const me = playerVehicle(d);
      me.speed = vehicleStats(d, me).maxSpeed;
      me.trail = [{ x: me.pos.x - 1, y: me.pos.y, heading: 0 }, { ...me.pos, heading: 0 }];
    });
    expect(engineOf(next).hp).toBeLessThanOrEqual(limit);
    expect(next.player.overdrive).toBe(false);
    expect(cutEvents(next)).toBe(1);

    const me = playerVehicle(next);
    const plain = { ...next, player: { ...next.player, overdrive: false } };
    expect(vehicleStats(next, me).maxSpeed).toBe(vehicleStats(plain, me).maxSpeed);
    const cooler = structuredClone(next);
    cooler.player.engineHeat = 0.5;
    playerVehicle(cooler).speed = vehicleStats(cooler, playerVehicle(cooler)).maxSpeed;
    const flagged = structuredClone(cooler);
    flagged.player.overdrive = true;
    advanceEngineHeat(cooler);
    advanceEngineHeat(flagged);
    expect(flagged.player.engineHeat).toBe(cooler.player.engineHeat);
  });

  it('refuses to switch overdrive on while the engine is too worn', () => {
    const w = emptyWorld();
    w.player.ranks.driving = 1;
    engineOf(w).hp = Math.floor(RULES.overdriveMinEngineShare * stockHp());
    expect(() => setOverdrive(w, true)).toThrow(/overdrive/i);
    expect(setOverdrive(w, false).player.overdrive).toBe(false);
  });

  it('leaves overdrive off after a repair, and allows it again by hand', () => {
    const cut = damagePartTo(overdriving(stockHp()), engineOf(emptyWorld()).defId, 1);
    const fixed = repairAll(cut);
    expect(canOverdrive(playerVehicle(fixed))).toBe(true);
    expect(fixed.player.overdrive).toBe(false);
    expect(setOverdrive(fixed, true).player.overdrive).toBe(true);
  });

  it('refuses overdrive at Driving 0 with the rank it needs, and opens it at Driving 1', () => {
    const w = emptyWorld();
    expect(() => setOverdrive(w, true)).toThrow(expect.objectContaining({ refusal: { id: 'needsBasic', skill: 'driving' } }));
    expect(setOverdrive(w, false).player.overdrive).toBe(false);
    w.player.ranks.driving = 1;
    expect(setOverdrive(w, true).player.overdrive).toBe(true);
  });

  it('cuts a saved overdrive at Driving 0 on the next step, with the cut-out note', () => {
    const w = emptyWorld();
    w.player.overdrive = true;
    const me = playerVehicle(w);
    const plain = { ...w, player: { ...w.player, overdrive: false } };
    expect(vehicleStats(w, me).maxSpeed).toBe(vehicleStats(plain, me).maxSpeed);
    const next = update(w, () => {});
    expect(next.player.overdrive).toBe(false);
    expect(cutEvents(next)).toBe(1);
  });

  it('logs nothing for a worn engine with overdrive already off', () => {
    const w = emptyWorld();
    engineOf(w).hp = 1;
    expect(cutEvents(update(w, () => {}))).toBe(0);
  });
});

function stockHp(): number {
  return maxHp(mountedParts(playerVehicle(emptyWorld()), 'engine')[0]);
}

describe('the start kit', () => {
  it('gives every part the kit wear at full worn HP, built-in parts and storage included', () => {
    const world = newWorld(7, { ...START_KITS.standard, storage: ['plates'], opening: null }, TEST_MAP, defaultSetup('roaming'), false);
    const parts = [...playerVehicle(world).items.flatMap((it) => (it.kind === 'part' ? [it.part] : [])), ...world.player.storage];
    expect(parts.some((p) => partDef(p.defId).kind === 'core')).toBe(true);
    for (const p of parts) expect(p).toMatchObject({ wear: START_KITS.standard.wear, hp: maxHp(p) });
  });
});

describe('isAtRest', () => {
  const truck = () => playerVehicle(newWorld(7, START_KITS.standard, TEST_MAP, defaultSetup('roaming'), false));
  const slow = RULES.parkedSpeed / 2;
  const fast = RULES.parkedSpeed * 2;

  it('is true when slow with no order or a brake order', () => {
    expect(isAtRest({ ...truck(), speed: slow, order: null })).toBe(true);
    expect(isAtRest({ ...truck(), speed: slow, order: { kind: 'brake' } })).toBe(true);
  });

  it('is false with a move order even at speed 0', () => {
    expect(isAtRest({ ...truck(), speed: 0, order: { kind: 'through', dest: { x: 1, y: 1 } } })).toBe(false);
  });

  it('is false when faster than parked speed even while braking', () => {
    expect(isAtRest({ ...truck(), speed: fast, order: { kind: 'brake' } })).toBe(false);
  });
});

describe('the headlight switch', () => {
  const duskTurn = Math.ceil(((TIME.sunset - TIME.startHour) * TIME.turnsPerDay) / 24) + 1;
  const playAcrossDusk = (world: World): World[] => {
    const seen: World[] = [];
    let w = update(world, (d) => {
      d.turn = duskTurn - 4;
    });
    for (let k = 0; k < 8; k++) {
      w = endTurn(w, testDrive);
      seen.push(w);
    }
    return seen;
  };

  it('starts off in a new game', () => {
    expect(newWorld(7, START_KITS.standard, TEST_MAP, defaultSetup('roaming'), false).player.headlights).toBe(false);
  });

  it('switches through setHeadlights into a new world', () => {
    const world = emptyWorld();
    const next = setHeadlights(world, true);

    expect(next.player.headlights).toBe(true);
    expect(next).not.toBe(world);
    expect(world.player.headlights).toBe(false);
  });

  it('holds its setting through dusk either way', () => {
    const seen = playAcrossDusk(emptyWorld());
    expect(sunAt(seen[0].turn)).not.toBeNull();
    expect(sunAt(seen.at(-1)!.turn)).toBeNull();

    expect(seen.map((w) => w.player.headlights)).toEqual(seen.map(() => false));
    const lit = playAcrossDusk(setHeadlights(emptyWorld(), true));
    expect(lit.map((w) => w.player.headlights)).toEqual(lit.map(() => true));
  });

  it('keeps the events and removed vehicles of the turn being shown', () => {
    const world = emptyWorld();
    const gone = addVehicle(world, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], { x: 60, y: 30 });
    world.vehicles = world.vehicles.filter((v) => v !== gone);
    world.removed = [gone];
    world.events = [{ t: 'destroyed', vehicle: gone.id, by: world.player.vehicleId }];

    const next = setHeadlights(world, true);

    expect(next.events).toEqual(world.events);
    expect(next.removed).toEqual(world.removed);
  });

  it('changes no turn result at night with NPCs about', () => {
    const night = update(emptyWorld({ x: 100, y: 100 }), (w) => {
      w.turn = duskTurn + 2;
      const raider = addVehicle(w, 'scrapjaw', 'buggy', ['mg', 'stockEngine'], { x: 125, y: 100 });
      raider.brain = npcBrain('buggy', raider.pos, ['raider']);
      const trader = addVehicle(w, 'independent', 'hauler', ['stockEngine'], { x: 100, y: 130 });
      trader.brain = npcBrain('trader', trader.pos, ['trader']);
    });
    expect(sunAt(night.turn)).toBeNull();
    const play = (world: World): World[] => {
      const seen = [world];
      for (let k = 0; k < 4; k++) seen.push(endTurn(seen.at(-1)!, testDrive));
      return seen.slice(1);
    };

    const dark = play(night);
    const lit = play(setHeadlights(night, true));

    expect(dark.at(-1)!.player.contacts.length).toBeGreaterThan(0);
    lit.forEach((w, k) => {
      expect(w.terrain).toBe(dark[k].terrain);
      expect(w.obstacles).toBe(dark[k].obstacles);
    });
    const unlit = (w: World) => comparableWorld({ ...w, player: { ...w.player, headlights: false } });
    expect(lit.map(unlit)).toEqual(dark.map(unlit));
  });
});

describe('waitsOnPlayer', () => {
  function freshWorld(): World {
    return newWorld(7, START_KITS.standard, TEST_MAP, defaultSetup('roaming'), false);
  }

  it('waits on nothing in a world with no call and no scene', () => {
    expect(waitsOnPlayer(freshWorld())).toBe(false);
  });

  it('waits on an open radio call', () => {
    const world = freshWorld();
    world.player.call = { kind: 'radio' } as never;
    expect(waitsOnPlayer(world)).toBe(true);
    expect(autoRuns({ ...world, player: { ...world.player, state: 'knockedOut' } })).toBe(false);
  });

  it('waits on a scene whose session is still open', () => {
    const world = startQuest(freshWorld(), QUESTS, GAME_OPENED_QUESTS.introWake, 'start');
    expect(world.player.quests.session).not.toBeNull();
    expect(waitsOnPlayer(world)).toBe(true);
  });

  it('waits on an ended scene still on view until the player leaves it', () => {
    const world = startQuest(freshWorld(), QUESTS, GAME_OPENED_QUESTS.roadStretch1, 'start');
    expect(world.player.quests.session).toBeNull();
    expect(waitsOnPlayer(world)).toBe(true);
    expect(autoRuns({ ...world, player: { ...world.player, state: 'knockedOut' } })).toBe(false);
    expect(waitsOnPlayer(leaveQuest(world))).toBe(false);
  });
});

describe('a player order with a pace', () => {
  const start = () => newWorld(1337, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));

  it('keeps the pace on through and stop orders', () => {
    const w = start();
    const at = playerVehicle(w).pos;
    const dest = { x: at.x + 8, y: at.y };
    expect(playerVehicle(setMoveOrder(w, { kind: 'through', dest, pace: 2 })).order).toEqual({ kind: 'through', dest, pace: 2 });
    expect(playerVehicle(setMoveOrder(w, { kind: 'stopAt', dest, pace: 2 })).order).toEqual({ kind: 'stopAt', dest, pace: 2 });
  });

  it('throws on a pace that is not finite or not above the parked speed', () => {
    const w = start();
    const dest = { x: 30, y: 30 };
    for (const pace of [Number.NaN, Infinity, RULES.parkedSpeed, 0, -1]) {
      expect(() => setMoveOrder(w, { kind: 'through', dest, pace })).toThrow();
    }
  });

  it('drops the pace when the player switches to manual driving', () => {
    const w = start();
    const dest = { x: playerVehicle(w).pos.x + 8, y: playerVehicle(w).pos.y };
    const manual = setDirect(setMoveOrder(w, { kind: 'through', dest, pace: 2 }), true);
    expect(playerVehicle(manual).order).toEqual({ kind: 'through', dest });
    expect(playerVehicle(setDirect(manual, false)).order).toEqual({ kind: 'through', dest });
  });
});

describe('overdrive ends with the drive', () => {
  const noteIds = (w: World) => w.events.flatMap((e) => (e.t === 'info' ? [e.note.id] : []));
  const heatNotes = (w: World) => noteIds(w).filter((id) => id === 'engineHot' || id === 'overdriveHot');
  const cruise = (d: World) => {
    const me = playerVehicle(d);
    me.speed = vehicleStats(d, me).maxSpeed;
    me.trail = [{ x: me.pos.x - 1, y: me.pos.y, heading: 0 }, { ...me.pos, heading: 0 }];
  };

  function overdriving(): World {
    const w = emptyWorld();
    w.player.ranks.driving = 1;
    w.turn = TIME.turnsPerDay * 0.5;
    return setOverdrive(w, true);
  }

  it('switches off, with no event, when the truck ends the turn parked', () => {
    const next = endTurn(overdriving(), () => {});
    expect(next.player.overdrive).toBe(false);
    expect(noteIds(next).filter((id) => id.startsWith('overdrive'))).toEqual([]);
  });

  it('stays on while the truck ends the turn driving on a cool engine', () => {
    const next = endTurn(overdriving(), cruise);
    expect(next.player.overdrive).toBe(true);
  });

  it('survives switching on while parked in planning, then driving that turn', () => {
    const w = emptyWorld();
    w.player.ranks.driving = 1;
    w.turn = TIME.turnsPerDay * 0.5;
    const planned = setOverdrive(w, true);
    expect(planned.player.overdrive).toBe(true);
    expect(endTurn(planned, cruise).player.overdrive).toBe(true);
  });

  it('switches off when the driver is knocked out', () => {
    const w = overdriving();
    w.player.state = 'knockedOut';
    const me = playerVehicle(w);
    const foe = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: me.pos.x + 3, y: me.pos.y });
    me.defeat = { phase: 'out', turns: 0, unseen: 0, foes: [foe.id], gaveUp: false };
    expect(endTurn(w, cruise).player.overdrive).toBe(false);
  });

  it('switches off while another driver tows the truck', () => {
    const w = overdriving();
    const tower = addVehicle(w, 'independent', 'scout', ['stockEngine'], { x: 40, y: 30 });
    tower.trail = [{ x: 39, y: 30, heading: 0 }, { x: 40, y: 30, heading: 0 }];
    addState(w, 'tow', tower.id, w.player.vehicleId, { kind: 'tow', site: REGION.towns[0].id, fee: 10, waived: 0, hitched: true });
    expect(endTurn(w, cruise).player.overdrive).toBe(false);
  });

  it('cuts out on the turn the heat crosses the running-hot mark, with one note in place of the hot warning', () => {
    const w = overdriving();
    w.player.engineHeat = ENGINE_HEAT.warnAt - 0.01;
    const next = endTurn(w, cruise);
    expect(next.player.engineHeat).toBeGreaterThanOrEqual(ENGINE_HEAT.warnAt);
    expect(next.player.overdrive).toBe(false);
    expect(heatNotes(next)).toEqual(['overdriveHot']);
  });

  it('is not cut again when switched back on above the mark', () => {
    const w = overdriving();
    w.player.engineHeat = ENGINE_HEAT.warnAt;
    const next = endTurn(w, cruise);
    expect(next.player.overdrive).toBe(true);
    expect(heatNotes(next)).toEqual([]);
  });

  it('raises only the hot warning when the crossing happens without overdrive', () => {
    const w = overdriving();
    w.player.overdrive = false;
    w.turn = 1 + ((TIME.sunrise + TIME.sunset) / 2 - TIME.startHour) * TIME.turnsPerDay / 24;
    w.player.engineHeat = ENGINE_HEAT.warnAt - 0.001;
    const next = endTurn(w, cruise);
    expect(next.player.engineHeat).toBeGreaterThanOrEqual(ENGINE_HEAT.warnAt);
    expect(heatNotes(next)).toEqual(['engineHot']);
  });
});
