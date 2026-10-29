import { describe, expect, it } from 'vitest';
import { bedRows } from '../sim/chassis-features';
import { AMBUSH, GREEN_PIT, WAKE_TOWN } from '../data/intro';
import { HATTIE_MET, TOWED_TO_BOWL } from '../data/quests';
import { NPCS } from '../data/npcs';
import { REGION } from '../data/region';
import { kitPartIds, START_KITS, startKit } from '../data/start';
import { buyStockPart } from '../sim/economy';
import { makePart } from '../sim/factory';
import { addStockPart } from '../sim/market';
import { playerVehicle } from '../sim/damage';
import { hangUp } from '../sim/dialogue';
import { checkKnockout, knockOutNpc } from '../sim/defeat';
import { fightOdds } from '../sim/fight-odds';
import { corePart, gridOf, mountedParts } from '../sim/grid';
import { answersPlea, offersGiveUp } from '../sim/parley';
import { addGoods, removeAllGoods, stowPart } from '../sim/inventory';
import { chooseQuestOption, introStep, openWellScene, QUESTS, questView, setIntroStep } from '../sim/quests';
import { OPENING_WRECK_ID, openingStep } from '../sim/opening';
import { emptyHidden } from '../sim/salvage';
import { generateNpcLoadout } from '../sim/npc-loadout';
import { fightCornered, topGoal } from '../sim/npc-activities';
import { NPC_BEHAVIOR } from '../data/npc-behavior';
import { hasCargo } from '../sim/salvage';
import { defaultSetup } from '../sim/settings';
import { canUseSite } from '../sim/sites';
import { allegianceFor, isFree, spawnAt } from '../sim/spawn';
import { flatChoices, pickText } from '../test/quest-testkit';
import { editableTerrain, emptyWorld, finishQuest, testDrive } from '../sim/testkit';
import { trackOf } from '../sim/tracks';
import type { Vehicle, World } from '../sim/types';
import { dist, type Vec } from '../sim/vec';
import { playerSees, sightRadius } from '../sim/vision';
import { endTurn, newWorld } from '../sim/world';
import { newGame } from '../sim/new-game';
import { drivable, route } from '../sim/path';
import { chassisDef } from '../data/chassis';
import { FARM_TOWER_ID } from '../data/arrival';
import { AMBUSH_RAIDER } from '../data/quests';
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
  const me = playerVehicle(w);
  removeAllGoods(me);
  addGoods(w, me, 'scrap', 2);
  me.speed = 2;
  me.order = { kind: 'through', dest: { x: me.pos.x + Math.cos(me.heading) * 200, y: me.pos.y + Math.sin(me.heading) * 200 } };
  setIntroStep(w, 'patched');
  w.events = [];
  return w;
}

const raidersIn = (w: World): Vehicle[] => w.vehicles.filter((v) => v.faction === 'scrapjaw');

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

function openGroundToward(w: World, from: Vec, angle: number, near: number): Vec {
  const radius = chassisDef(playerVehicle(w).chassisId).radius;
  const exit = { x: from.x + Math.cos(angle) * 40, y: from.y + Math.sin(angle) * 40 };
  const offsets = Array.from({ length: 41 }, (_, k) => (k % 2 === 0 ? k / 2 : -(k + 1) / 2));
  const spot = offsets
    .map((d) => ({ x: from.x + Math.cos(angle) * (near + d), y: from.y + Math.sin(angle) * (near + d) }))
    .find((p) => isFree(w, p, radius, w.player.vehicleId) && drivable(w, exit, p, radius));
  if (!spot) throw new Error(`No open ground ${near} tiles out from ${from.x}, ${from.y}`);
  return spot;
}

const fightOn = (v: Vehicle, id: string) => v.brain!.goals.find((g) => g.kind === 'fight' && g.targetId === id);

function huntRange(w: World): number {
  return sightRadius(w, playerVehicle(w)) * AMBUSH.huntSight;
}

function placePlayerAt(w: World, factor: number): void {
  const me = playerVehicle(w);
  const raider = raidersIn(w)[0];
  const range = huntRange(w) * factor;
  me.pos = { x: raider.pos.x + range, y: raider.pos.y };
  me.speed = 0;
  me.order = null;
}

function turnsToDone(start: World, saveAt: number | null): { turns: number; w: World } {
  let w = start;
  for (let turns = 1; turns <= 60; turns++) {
    placePlayerAt(w, 1.5);
    w = endTurn(w, testDrive);
    if (turns === saveAt) w = savedAndLoaded(w);
    if (introStep(w) === 'done') return { turns, w };
  }
  throw new Error('The raider never gave up');
}

function closeScene(w: World): World {
  return finishQuest(w);
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
  it('spawns one raider out of sight once the engine is patched and the player drives, and sets ambush', () => {
    const w = ambushed();
    const [raider] = raidersIn(w);
    expect(raidersIn(w)).toHaveLength(1);
    expect(introStep(w)).toBe('ambush');
    expect(playerSees(w, raider.pos)).toBe(false);
    expect(topGoal(raider)).toMatchObject({ kind: 'fight', targetId: w.player.vehicleId });
    expect(w.events.filter((e) => e.t === 'spawn')).toHaveLength(1);
    expect(raider.brain!.traits).toEqual(expect.arrayContaining(['raider', 'brave']));
  });

  it('spawns the raider ahead of the player, so a driver heading on meets it', () => {
    const w = ambushed();
    const me = playerVehicle(w);
    const [raider] = raidersIn(w);
    const along = (raider.pos.x - me.pos.x) * Math.cos(me.heading) + (raider.pos.y - me.pos.y) * Math.sin(me.heading);
    expect(along).toBeGreaterThan(dist(raider.pos, me.pos) * AMBUSH.aheadCos - 1e-9);
  });

  it('keeps the raider on the player\'s real position within the hunt range, so it never stops at an old sighting', () => {
    let w = ambushed();
    for (let i = 0; i < 3; i++) w = endTurn(w, testDrive);
    const me = playerVehicle(w);
    me.pos = { x: me.pos.x + 30, y: me.pos.y };
    w = endTurn(w, testDrive);
    const track = trackOf(raidersIn(w)[0], w.player.vehicleId);
    expect(dist(track!.at, playerVehicle(w).pos)).toBeLessThan(1);
  });

  it('waits while the player stays parked and spawns nothing', () => {
    const w = patchedWorld();
    const me = playerVehicle(w);
    me.speed = 0;
    me.order = null;
    const next = endTurn(w, testDrive);
    expect(raidersIn(next)).toHaveLength(0);
    expect(introStep(next)).toBe('patched');
  });

  it('spawns the raider on open ground off any road, since the way from the farm to the town has none', () => {
    const w = patchedWorld();
    const terrain = editableTerrain(w);
    terrain.types.fill('sand');
    const next = endTurn(w, testDrive);
    expect(raidersIn(next)).toHaveLength(1);
    expect(introStep(next)).toBe('ambush');
  });

  it('spawns the raider where it can drive to the player, not in a pocket walled off by slopes', () => {
    const w = finishQuest(newGame(1337, 'arrival', true, TEST_MAP, defaultSetup('roaming')));
    const farm = w.obstacles.find((o) => o.id === FARM_TOWER_ID)!.pos;
    const bowl = REGION.towns.find((t) => t.id === WAKE_TOWN)!.pos;
    const toBowl = Math.atan2(bowl.y - farm.y, bowl.x - farm.x);
    const me = playerVehicle(w);
    me.pos = openGroundToward(w, farm, toBowl, 160);
    me.heading = toBowl + 0.5;
    me.speed = 2;
    me.order = { kind: 'through', dest: { x: me.pos.x + Math.cos(me.heading) * 200, y: me.pos.y + Math.sin(me.heading) * 200 } };
    setIntroStep(w, 'patched');
    const next = endTurn(w, testDrive);
    const raider = next.vehicles.find((v) => v.id === next.player.quests.world[AMBUSH_RAIDER])!;
    const there = playerVehicle(next).pos;
    const way = route(next, raider.pos, there, chassisDef(raider.chassisId).radius, [], raider);
    expect(dist(way[way.length - 1], there)).toBeLessThan(1);
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
      const raider = spawnAt(w, NPCS[AMBUSH.template], generateNpcLoadout(w, NPCS[AMBUSH.template], AMBUSH.chassis, AMBUSH.gear), { x: me.pos.x + 25, y: me.pos.y }, allegianceFor(w, NPCS[AMBUSH.template], null, null));
      return fightOdds(w, [me], [raider]).win;
    });
    expect(wins.reduce((a, b) => a + b, 0) / wins.length).toBeLessThan(0.4);
    expect(Math.max(...wins)).toBeGreaterThan(0.05);
  });
});

function withOpeningWreckAt(w: World, away: number): void {
  const me = playerVehicle(w);
  w.salvage.push({ id: OPENING_WRECK_ID, pos: { x: me.pos.x - away, y: me.pos.y }, radius: 1, goods: { scrap: 1 }, parts: [], fuel: 0, supplies: 0, hidden: emptyHidden() });
}

function withLooseCageAndWreckAt(w: World, away: number): void {
  withOpeningWreckAt(w, away);
  w.salvage.find((s) => s.id === OPENING_WRECK_ID)!.goods = {};
  w.player.scavenged.push(OPENING_WRECK_ID);
  const me = playerVehicle(w);
  me.items = me.items.filter((item) => item.kind !== 'part' || item.part.defId !== 'cage');
  if (!stowPart(w, me, makePart(w, 'cage', 0))) throw new Error('No room for the loose cage');
}

describe('the ambush gate during the opening', () => {
  it('sees a looted but unmounted cage as the install step', () => {
    const w = patchedWorld();
    withLooseCageAndWreckAt(w, AMBUSH.farmLeave + 10);
    expect(openingStep(w)).toBe('install');
  });

  it('comes once a truck with a loose cage has left the farm', () => {
    const w = patchedWorld();
    withLooseCageAndWreckAt(w, AMBUSH.farmLeave + 10);
    const next = endTurn(w, testDrive);
    expect(raidersIn(next)).toHaveLength(1);
    expect(introStep(next)).toBe('ambush');
  });

  it('waits while a truck with a loose cage is still on the farm', () => {
    const w = patchedWorld();
    withLooseCageAndWreckAt(w, 20);
    const next = endTurn(w, testDrive);
    expect(raidersIn(next)).toHaveLength(0);
    expect(introStep(next)).toBe('patched');
  });

  it('waits while the opening wreck is unfinished and the truck is near it', () => {
    const w = patchedWorld();
    withOpeningWreckAt(w, 20);
    const next = endTurn(w, testDrive);
    expect(raidersIn(next)).toHaveLength(0);
    expect(introStep(next)).toBe('patched');
  });

  it('comes once the truck has left the farm around the wreck', () => {
    const w = patchedWorld();
    withOpeningWreckAt(w, AMBUSH.farmLeave + 10);
    const next = endTurn(w, testDrive);
    expect(raidersIn(next)).toHaveLength(1);
    expect(introStep(next)).toBe('ambush');
  });

  it('comes once the opening wreck is done with', () => {
    const w = patchedWorld();
    withOpeningWreckAt(w, 20);
    w.salvage.find((s) => s.id === OPENING_WRECK_ID)!.goods = {};
    const next = endTurn(w, testDrive);
    expect(raidersIn(next)).toHaveLength(1);
  });
});

const spokenIn = (w: World): string => questView(w, QUESTS).lines.map((l) => l.text).join(' ');

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

  it('stocks Bowl with every kit part the raider took, at a price the player can pay', () => {
    const w = ambushed();
    w.player.money = START_KITS.arrival.money;
    const me = playerVehicle(w);
    me.items = me.items.filter((item) => item.kind !== 'part' || !kitPartIds(START_KITS.arrival).includes(item.part.defId));
    const bowl = w.shops[WAKE_TOWN];
    bowl.stock = bowl.stock.filter((part) => !kitPartIds(START_KITS.arrival).includes(part.defId));
    knockedOutBy(w);
    let next = closeScene(runUntilAwake(closeScene(w)));
    const stocked = next.shops[WAKE_TOWN].stock.filter((part) => kitPartIds(START_KITS.arrival).includes(part.defId));
    expect(stocked.map((part) => part.defId).sort()).toEqual([...kitPartIds(START_KITS.arrival)].sort());
    for (const part of stocked) next = buyStockPart(next, part.id);
    expect(next.player.money).toBeGreaterThanOrEqual(0);
    expect(savedAndLoaded(next).shops[WAKE_TOWN].stock).toEqual(next.shops[WAKE_TOWN].stock);
  });

  it('adds no kit part to Bowl that the shop already sells', () => {
    const w = ambushed();
    const bowl = w.shops[WAKE_TOWN];
    for (const defId of kitPartIds(START_KITS.arrival)) addStockPart(bowl, makePart(w, defId, 0));
    const before = [...bowl.stock];
    knockedOutBy(w);
    const next = runUntilAwake(closeScene(w));
    expect(next.shops[WAKE_TOWN].stock).toEqual(before);
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

  it('wakes a driver who never met Hattie on the start checkpoint and marks her met', () => {
    const w = ambushed();
    knockedOutBy(w);
    const next = runUntilAwake(closeScene(w));
    expect(spokenIn(next)).toContain('left you on my bench at first light');
    expect(next.player.quests.world[HATTIE_MET]).toBe(true);
  });

  it('wakes a driver who met Hattie before on a greeting that knows them, without the questions already asked', () => {
    const w = ambushed();
    openWellScene(w, 'meet');
    let met = pickText(w, 'Where am I?');
    met = pickText(met, "I'll go.");
    expect(met.player.quests.session).toBeNull();
    knockedOutBy(met);
    const next = runUntilAwake(closeScene(met));
    expect(next.player.quests.live?.quest).toBe('intro_bowl');
    expect(spokenIn(next)).toContain('Back on my bench again');
    expect(next.player.quests.world[HATTIE_MET]).toBe(true);
    const choices = flatChoices(next);
    expect(choices).toContain('What happened to me?');
    expect(choices).not.toContain('Where am I?');
  });

  it('opens the closing scene, not the Bowl scene, when the player wins', () => {
    const w = ambushed();
    knockOutNpc(w, raidersIn(w)[0]);
    const next = endTurn(w, testDrive);
    expect(introStep(next)).toBe('done');
    expect(next.player.quests.live?.quest).toBe('intro_road');
    expect(next.player.quests.world[TOWED_TO_BOWL]).toBeUndefined();
  });

  it('plays the closing scene once, and a load before or after it opens nothing more', () => {
    const w = ambushed();
    knockOutNpc(w, raidersIn(w)[0]);
    const scene = endTurn(w, testDrive);
    expectNothingAwarded(savedAndLoaded(scene), scene);
    let next = closeScene(scene);
    expect(next.player.quests.live).toBeNull();
    for (let i = 0; i < 3; i++) next = endTurn(next, testDrive);
    expect(next.player.quests.live).toBeNull();
    const loaded = savedAndLoaded(next);
    expectNothingAwarded(loaded, next);
    expect(endTurn(loaded, testDrive).player.quests.live).toBeNull();
  });

  it('keeps the closing scene out of the knockout road, which has its own scenes', () => {
    const w = ambushed();
    knockedOutBy(w);
    let next = runUntilAwake(closeScene(w));
    expect(next.player.quests.live?.quest).toBe('intro_bowl');
    next = closeScene(next);
    for (let i = 0; i < 3; i++) next = endTurn(next, testDrive);
    expect(next.player.quests.session).toBeNull();
    expect(next.player.quests.live).toBeNull();
  });

  it('sends the raider back after the player when its fight ends any other way', () => {
    const w = ambushed();
    raidersIn(w)[0].brain!.goals = [];
    const next = endTurn(w, testDrive);
    expect(introStep(next)).toBe('ambush');
    expect(topGoal(raidersIn(next)[0])).toMatchObject({ kind: 'fight', targetId: next.player.vehicleId });
  });

  it('never demands cargo and turns down every truce and plea for mercy', () => {
    const w = ambushed();
    const [raider] = raidersIn(w);
    const me = playerVehicle(w);
    expect(topGoal(raider)!.demands).toBe(false);
    expect(answersPlea(w, raider, me, 'truce')).toBe('no');
    expect(answersPlea(w, raider, me, 'mercy')).toBe('no');
    expect(offersGiveUp(w, raider)).toBe(false);
  });

  it('takes the cargo the player spilled in the fight, then still has the driver towed to Bowl', () => {
    let w = ambushed();
    w.rngState += 1;
    playerVehicle(w).order = { kind: 'brake' };
    let broken = false;
    let spills = 0;
    for (let i = 0; i < 80 && !(introStep(w) === 'done' && w.player.state === 'active'); i++) {
      if (w.player.call) w = hangUp(w);
      if (w.player.quests.session) w = closeScene(w);
      const raider = raidersIn(w)[0];
      if (!broken && dist(raider.pos, playerVehicle(w).pos) < 12) {
        const me = playerVehicle(w);
        const row = gridOf(me).chassisH + bedRows(me.chassisId);
        me.items = me.items.filter((it) => !(it.kind === 'good' && it.y >= row));
        me.items.push({ id: 'i-spill', kind: 'good', good: 'scrap', x: 0, y: row, rot: 0 });
        for (const part of mountedParts(me, 'cargo')) part.hp = 0;
        broken = true;
      }
      w = endTurn(w, testDrive);
      spills += w.events.filter((e) => e.t === 'cargoSpilled').length;
    }
    expect(spills).toBeGreaterThan(0);
    const full = w.salvage.filter((s) => s.id.startsWith(`spill-${w.player.vehicleId}-`) && (Object.values(s.goods).some((n) => n > 0) || s.parts.length > 0));
    expect(full).toEqual([]);
    expect(w.player.quests.live?.quest).toBe('intro_bowl');
    expect(w.player.quests.world[TOWED_TO_BOWL]).toBe(true);
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

describe('the hunt range', () => {
  it('gives up a player who escapes beyond the range, with the raider left where it drove', () => {
    const { turns, w } = turnsToDone(ambushed(), null);
    expect(turns).toBeLessThanOrEqual(NPC_BEHAVIOR.fightStallTurns + 1);
    const raider = raidersIn(w)[0];
    expect(raider).toBeDefined();
    expect(fightOn(raider, w.player.vehicleId)).toBeUndefined();
    expect(w.player.quests.world[TOWED_TO_BOWL]).toBeUndefined();
    expect(w.player.quests.live?.quest).toBe('intro_road');
  });

  it('keeps the forced fight while the player stays in range', () => {
    let w = ambushed();
    for (let i = 0; i < 30; i++) {
      placePlayerAt(w, 0.9);
      w = endTurn(w, testDrive);
    }
    expect(introStep(w)).toBe('ambush');
    const raider = raidersIn(w)[0];
    expect(fightOn(raider, w.player.vehicleId)).toBeDefined();
    expect(dist(trackOf(raider, w.player.vehicleId)!.at, playerVehicle(w).pos)).toBeLessThan(1);
  });

  it('takes the hunt up again when the player comes back before it gives up', () => {
    let w = ambushed();
    for (let i = 0; i < 3; i++) {
      placePlayerAt(w, 1.5);
      w = endTurn(w, testDrive);
    }
    expect(introStep(w)).toBe('ambush');
    placePlayerAt(w, 0.5);
    w = endTurn(w, testDrive);
    const raider = raidersIn(w)[0];
    expect(introStep(w)).toBe('ambush');
    expect(fightOn(raider, w.player.vehicleId)).toBeDefined();
    expect(dist(trackOf(raider, w.player.vehicleId)!.at, playerVehicle(w).pos)).toBeLessThan(1);
  });

  it('leaves other raiders\' fights to the ordinary rules', () => {
    let w = ambushed();
    const me = playerVehicle(w);
    const other = spawnAt(w, NPCS[AMBUSH.template], generateNpcLoadout(w, NPCS[AMBUSH.template], AMBUSH.chassis, AMBUSH.gear), { x: me.pos.x - 60, y: me.pos.y }, allegianceFor(w, NPCS[AMBUSH.template], null, null));
    fightCornered(w, other, me, 'robCargo');
    for (let i = 0; i < NPC_BEHAVIOR.fightSearchTurns + 2; i++) {
      placePlayerAt(w, 0.5);
      w = endTurn(w, testDrive);
    }
    const second = w.vehicles.find((v) => v.id === other.id)!;
    expect(introStep(w)).toBe('ambush');
    expect(fightOn(second, w.player.vehicleId)).toBeUndefined();
  });

  it('gives up on the same turn whether or not the game was saved mid-escape or at done', () => {
    const plain = turnsToDone(ambushed(), null);
    const mid = turnsToDone(ambushed(), 3);
    expect(mid.turns).toBe(plain.turns);
    const done = plain.w;
    const loaded = savedAndLoaded(done);
    expectNothingAwarded(loaded, done);
    expect(introStep(loaded)).toBe('done');
    expect(fightOn(raidersIn(loaded)[0], loaded.player.vehicleId)).toBeUndefined();
  });

  it('covers the farthest spawn', () => {
    expect(AMBUSH.huntSight).toBeGreaterThanOrEqual(AMBUSH.sightMax);
  });
});
