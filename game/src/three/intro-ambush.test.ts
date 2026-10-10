import { describe, expect, it } from 'vitest';
import { AMBUSH, GREEN_PIT, WAKE_TOWN } from '../data/intro';
import { TOWED_TO_BOWL } from '../data/quests';
import { NPCS } from '../data/npcs';
import { REGION } from '../data/region';
import { startKit } from '../data/start';
import { playerVehicle } from '../sim/damage';
import { hangUp } from '../sim/dialogue';
import { checkKnockout, knockOutNpc } from '../sim/defeat';
import { fightOdds } from '../sim/fight-odds';
import { corePart } from '../sim/grid';
import { addGoods } from '../sim/inventory';
import { introStep, leaveQuest, setIntroStep } from '../sim/quests';
import { generateNpcLoadout } from '../sim/npc-loadout';
import { topGoal } from '../sim/npc-activities';
import { hasCargo } from '../sim/salvage';
import { defaultSetup } from '../sim/settings';
import { canUseSite } from '../sim/sites';
import { spawnAt } from '../sim/spawn';
import { editableTerrain, emptyWorld, testDrive } from '../sim/testkit';
import { tileAt } from '../sim/terrain';
import type { Vehicle, World } from '../sim/types';
import { dist, type Vec } from '../sim/vec';
import { playerSees } from '../sim/vision';
import { endTurn, newWorld } from '../sim/world';
import { TEST_MAP } from '../test/map';
import { loadWorld, writeSave } from './save';
import { memoryBackend, SaveSlots } from './save-db';

function roadSpot(): Vec {
  const green = REGION.locations.find((l) => l.id === GREEN_PIT)!.pos;
  const spot = REGION.roads.flat().find((p) => dist(p, green) > 60 && dist(p, green) < 70);
  if (!spot) throw new Error('No road point 60 to 70 tiles from Green Pit');
  return spot;
}

function patchedWorld(): World {
  const w = emptyWorld(roadSpot());
  for (const id of Object.keys(NPCS)) w.spawnTimer[id] = Number.MAX_SAFE_INTEGER;
  addGoods(w, playerVehicle(w), 'scrap', 2);
  setIntroStep(w, 'patched');
  w.events = [];
  return w;
}

const raidersIn = (w: World): Vehicle[] => w.vehicles.filter((v) => v.faction === 'raiders');

function ambushed(): World {
  return endTurn(patchedWorld(), testDrive);
}

function knockedOutBy(w: World): Vehicle {
  const me = playerVehicle(w);
  const raider = raidersIn(w)[0];
  raider.pos = { x: me.pos.x + 6, y: me.pos.y };
  me.lastHitBy = raider.id;
  corePart(me, 'cab').hp = 0;
  checkKnockout(w);
  return raider;
}

function closeScene(w: World): World {
  return leaveQuest(w);
}

function runUntilAwake(start: World): World {
  let w = start;
  for (let i = 0; i < 40 && w.player.state === 'knockedOut'; i++) w = endTurn(w, testDrive);
  return w;
}

function savedAndLoaded(w: World): World {
  const slots = new SaveSlots(memoryBackend(), new Map());
  writeSave(slots, 'auto', w, 'run', 1);
  const loaded = loadWorld(slots, 'auto', TEST_MAP);
  if (!loaded) throw new Error('The save did not load');
  return loaded;
}

function expectNothingAwarded(loaded: World, saved: World): void {
  expect(loaded.player.money).toBe(saved.player.money);
  expect(loaded.player.knockouts).toBe(saved.player.knockouts);
  expect(loaded.player.quests.world).toEqual(saved.player.quests.world);
  expect(loaded.player.quests.session).toEqual(saved.player.quests.session);
  expect(loaded.events).toEqual([]);
}

describe('the ambush', () => {
  it('spawns one raider out of sight on the road once the engine is patched, and sets ambush', () => {
    const w = ambushed();
    const [raider] = raidersIn(w);
    expect(raidersIn(w)).toHaveLength(1);
    expect(introStep(w)).toBe('ambush');
    expect(playerSees(w, raider.pos)).toBe(false);
    expect(topGoal(raider)).toMatchObject({ kind: 'fight', targetId: w.player.vehicleId });
    expect(w.events.filter((e) => e.t === 'spawn')).toHaveLength(1);
    expect(raider.brain!.traits).toEqual(expect.arrayContaining(['raider', 'brave']));
  });

  it('waits off the road and spawns nothing', () => {
    const w = patchedWorld();
    const terrain = editableTerrain(w);
    terrain.types[tileAt(terrain, playerVehicle(w).pos)] = 'sand';
    const next = endTurn(w, testDrive);
    expect(raidersIn(next)).toHaveLength(0);
    expect(introStep(next)).toBe('patched');
  });

  it('does nothing before the engine is patched', () => {
    const w = patchedWorld();
    setIntroStep(w, 'drive');
    expect(raidersIn(endTurn(w, testDrive))).toHaveLength(0);
  });

  it('spawns no second raider on a later turn or after a load', () => {
    let w = ambushed();
    for (let i = 0; i < 3; i++) w = endTurn(w, testDrive);
    expect(raidersIn(w)).toHaveLength(1);
    const loaded = savedAndLoaded(w);
    expect(introStep(loaded)).toBe('ambush');
    expect(raidersIn(endTurn(loaded, testDrive))).toHaveLength(1);
  });

  it('drives to the player and shoots by the normal combat rules', () => {
    let w = ambushed();
    const shots = () => w.events.some((e) => e.t === 'shot' && e.target === w.player.vehicleId);
    let fired = false;
    for (let i = 0; i < 60 && !fired && w.player.state === 'active'; i++) {
      if (w.player.call) w = hangUp(w);
      w = endTurn(w, testDrive);
      fired = shots();
    }
    expect(fired).toBe(true);
  });

  it('is a fight a worn truck loses more often than it wins, and not always', () => {
    const w = newWorld(1337, startKit('standard'), TEST_MAP, defaultSetup('roaming'));
    const me = playerVehicle(w);
    const wins = Array.from({ length: 12 }, () => {
      const raider = spawnAt(w, NPCS[AMBUSH.template], generateNpcLoadout(w, NPCS[AMBUSH.template], AMBUSH.chassis, AMBUSH.gear), { x: me.pos.x + 25, y: me.pos.y });
      return fightOdds(w, [me], [raider]).win;
    });
    expect(wins.reduce((a, b) => a + b, 0) / wins.length).toBeLessThan(0.4);
    expect(Math.max(...wins)).toBeGreaterThan(0.05);
  });
});

describe('the fall and the wake in Bowl', () => {
  it('plays the first fall, robs the cargo, spares the driver and parks the truck in Bowl', () => {
    const w = ambushed();
    knockedOutBy(w);
    expect(w.player.quests.live?.quest).toBe('first_fall');
    expect(introStep(w)).toBe('ambush');
    let next = closeScene(w);
    next = runUntilAwake(next);
    const me = playerVehicle(next);
    expect(next.player.state).toBe('active');
    expect(next.player.health).toBeGreaterThan(0);
    expect(hasCargo(me)).toBe(false);
    expect(canUseSite(me.pos, REGION.towns.find((t) => t.id === WAKE_TOWN)!)).toBe(true);
    expect(next.player.quests.live?.quest).toBe('intro_bowl');
    expect(introStep(next)).toBe('done');
    expect(next.player.quests.world[TOWED_TO_BOWL]).toBe(true);
  });

  it('sets done when the Bowl scene opens and plays it once', () => {
    const w = ambushed();
    knockedOutBy(w);
    let next = runUntilAwake(closeScene(w));
    expect(introStep(next)).toBe('done');
    next = closeScene(next);
    next = endTurn(next, testDrive);
    expect(next.player.quests.live).toBeNull();
    expect(introStep(next)).toBe('done');
  });

  it('ends quietly with no Bowl scene when the player wins', () => {
    const w = ambushed();
    knockOutNpc(w, raidersIn(w)[0]);
    const next = endTurn(w, testDrive);
    expect(introStep(next)).toBe('done');
    expect(next.player.quests.session).toBeNull();
    expect(next.player.quests.world[TOWED_TO_BOWL]).toBeUndefined();
  });

  it('ends quietly when the raider loses the player', () => {
    const w = ambushed();
    raidersIn(w)[0].brain!.goals = [];
    const next = endTurn(w, testDrive);
    expect(introStep(next)).toBe('done');
    expect(next.player.quests.session).toBeNull();
  });

  it('leaves a later knockout to the ordinary rules once done', () => {
    const w = ambushed();
    setIntroStep(w, 'done');
    knockedOutBy(w);
    const next = runUntilAwake(closeScene(w));
    expect(next.player.quests.live).toBeNull();
    expect(next.player.quests.world[TOWED_TO_BOWL]).toBeUndefined();
    expect(canUseSite(playerVehicle(next).pos, REGION.towns.find((t) => t.id === WAKE_TOWN)!)).toBe(false);
  });
});

describe('saves around the ambush', () => {
  it('loads at patched, at ambush, while knocked out and in the Bowl scene without an award', () => {
    const patched = patchedWorld();
    expectNothingAwarded(savedAndLoaded(patched), patched);
    const fighting = ambushed();
    expectNothingAwarded(savedAndLoaded(fighting), fighting);
    knockedOutBy(fighting);
    expectNothingAwarded(savedAndLoaded(fighting), fighting);
    const closed = closeScene(fighting);
    const scene = runUntilAwake(closed);
    expectNothingAwarded(savedAndLoaded(scene), scene);
    const done = closeScene(scene);
    expectNothingAwarded(savedAndLoaded(done), done);
  });
});
