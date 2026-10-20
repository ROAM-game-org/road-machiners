import { describe, expect, it } from 'vitest';
import { ALA_HIRED, GAME_OPENED_QUESTS, GAME_WORLD_VARS, ROAD_STORY } from '../data/quests';
import { UNITS } from '../data/units';
import { startKit } from '../data/start';
import { haulerOf, playerVehicle } from '../sim/damage';
import { driveOn } from '../sim/fury-road';
import { payOf } from '../sim/fury-road-director';
import { highwayMap } from '../sim/highway';
import { newGame } from '../sim/new-game';
import { QUEST_QUERIES, QUESTS, setWorldVar, worldVar } from '../sim/quests';
import { defaultSetup } from '../sim/settings';
import { finishQuest, furyRoadWorld, parkInYard } from '../sim/testkit';
import type { World } from '../sim/types';
import { cloneWorld, endTurn, newWorld } from '../sim/world';
import { readQuestSources } from '../test/quest-compile';
import { TEST_MAP } from '../test/map';
import { restartsWithStory } from '../ui/death';
import { loadWorld, saveOf, writeSave } from './save';
import { memoryBackend, SaveSlots } from './save-db';

const still = () => {};
const SEED = 3;

function hiredRun(): World {
  const w = furyRoadWorld(SEED);
  setWorldVar(w, ALA_HIRED, true);
  return w;
}

function arriveAt(w: World, stretch: number): World {
  parkInYard(w, stretch);
  return endTurn(w, still);
}

function throughRoundTrip(w: World): World {
  const slots = new SaveSlots(memoryBackend(), new Map());
  writeSave(slots, 'auto', w, 'run', 1);
  const loaded = loadWorld(slots, 'auto', TEST_MAP);
  if (!loaded) throw new Error('The save did not load');
  return loaded;
}

function questOpen(w: World): string | null {
  return w.player.quests.session?.quest ?? null;
}

function withoutQuests(w: World): unknown {
  const { quests: _quests, ...player } = w.player;
  return { player, furyRoad: w.furyRoad, vehicles: w.vehicles };
}

describe('the opening of a new run', () => {
  const chaos = (intro: boolean) => newGame(SEED, 'furyRoad', intro, highwayMap(SEED, 0), defaultSetup('furyRoad'));

  it('opens the hiring on Chaos Highway with the intro on, and nothing with the intro off', () => {
    expect(questOpen(chaos(true))).toBe(GAME_OPENED_QUESTS.roadHire);
    expect(questOpen(chaos(false))).toBeNull();
  });

  it('opens the arrival in Roaming as before', () => {
    expect(questOpen(newGame(SEED, 'arrival', true, TEST_MAP, defaultSetup('roaming')))).toBe(GAME_OPENED_QUESTS.arrival);
  });

  it('hires the driver only at the end of the hiring', () => {
    const w = chaos(true);
    expect(worldVar(w, ALA_HIRED)).toBe(false);
    expect(worldVar(finishQuest(w), ALA_HIRED)).toBe(true);
  });

  it('restarts with the story only after a hired run', () => {
    expect(restartsWithStory(furyRoadWorld(SEED))).toBe(false);
    expect(restartsWithStory(hiredRun())).toBe(true);
  });
});

describe('the scenes at parked outposts', () => {
  it('opens the first scene once, and neither the next turn nor a load opens it again', () => {
    const arrived = arriveAt(hiredRun(), 1);
    expect(questOpen(arrived)).toBe(GAME_OPENED_QUESTS.roadStretch1);
    const money = arrived.player.money;

    const done = finishQuest(arrived);
    expect(questOpen(endTurn(done, still))).toBeNull();
    const loaded = throughRoundTrip(done);
    expect(questOpen(endTurn(loaded, still))).toBeNull();
    expect(endTurn(loaded, still).player.money).toBe(money);
    expect(loaded.events).toEqual([]);
  });

  it('waits for the gun truck to park', () => {
    const w = hiredRun();
    const me = playerVehicle(w);
    parkInYard(w, 1);
    me.pos = { x: me.pos.x, y: me.pos.y + 60 };
    const paid = endTurn(w, still);
    expect(paid.furyRoad!.outposts[0].paid).toBe(true);
    expect(questOpen(paid)).toBeNull();

    parkInYard(paid, 1);
    expect(questOpen(endTurn(paid, still))).toBe(GAME_OPENED_QUESTS.roadStretch1);
  });

  it('opens a scene only at stretches 1, 4 and 8, keeps the gates through the window move and changes nothing but the quests', () => {
    let w = hiredRun();
    const gates: string[] = [];
    for (let stretch = 1; stretch <= 5; stretch++) {
      w = arriveAt(w, stretch);
      expect(questOpen(w), `stretch ${stretch}`).toBe(ROAD_STORY[stretch]?.quest ?? null);
      if (ROAD_STORY[stretch]) {
        const before = JSON.stringify(withoutQuests(w));
        w = finishQuest(w);
        expect(JSON.stringify(withoutQuests(w))).toBe(before);
        gates.push(ROAD_STORY[stretch].gate);
      }
      w = driveOn(w);
      expect(worldVar(w, ALA_HIRED)).toBe(true);
      for (const gate of gates) expect(worldVar(w, gate)).toBe(true);
    }
  });

  it('opens nothing for a run that was not hired, for a bot world, or in Roaming', () => {
    expect(questOpen(arriveAt(furyRoadWorld(SEED), 1))).toBeNull();
    const bot = newWorld(SEED, startKit('furyRoad'), highwayMap(SEED, 0), defaultSetup('furyRoad'));
    expect(questOpen(arriveAt(bot, 1))).toBeNull();

    const roaming = newWorld(SEED, startKit('standard'), TEST_MAP, defaultSetup('roaming'));
    setWorldVar(roaming, ALA_HIRED, true);
    expect(questOpen(endTurn(cloneWorld(roaming), still))).toBeNull();
  });

  it('opens nothing while another quest is open', () => {
    const w = hiredRun();
    const open = newGame(SEED, 'furyRoad', true, highwayMap(SEED, 0), defaultSetup('furyRoad'));
    w.player.quests = open.player.quests;
    expect(questOpen(w)).toBe(GAME_OPENED_QUESTS.roadHire);
    parkInYard(w, 1);
    const after = endTurn(w, still);
    expect(questOpen(after)).toBe(GAME_OPENED_QUESTS.roadHire);
    expect(haulerOf(after).id).not.toBe(playerVehicle(after).id);
  });
});

describe('the road story data', () => {
  it('quotes the pay from the sim', () => {
    expect(QUEST_QUERIES.stretch_pay(furyRoadWorld(SEED), [1])).toBe(payOf(1) / UNITS.centsPerM);
    expect(QUEST_QUERIES.stretch_pay(furyRoadWorld(SEED), [2])).toBe(payOf(2) / UNITS.centsPerM);
    expect(() => QUEST_QUERIES.stretch_pay(furyRoadWorld(SEED), [0])).toThrow(/stretch/);
    expect(() => QUEST_QUERIES.stretch_pay(furyRoadWorld(SEED), [1.5])).toThrow(/whole/);
  });

  it('gives every scene a start and a gate that opens it', () => {
    for (const { quest, gate } of Object.values(ROAD_STORY)) {
      expect(QUESTS.quests[quest].checkpoints).toContain('start');
      expect(GAME_WORLD_VARS[gate].gates).toBe(quest);
    }
    expect(QUESTS.quests[GAME_OPENED_QUESTS.roadHire].checkpoints).toContain('start');
  });
});

describe('the openings of the road scenes', () => {
  const FIGHT_ACTS = ['your bumper', 'rammed', 'went at it', 'drove at', 'drove straight', 'went at'];

  function opening(source: string): string {
    const lines = source.split('\n');
    const from = lines.findIndex((line) => line.startsWith('=== start ==='));
    const body = lines.slice(from + 1);
    const end = body.findIndex((line) => line.startsWith('->') || line.startsWith('+'));
    return body.slice(0, end).join('\n').toLowerCase();
  }

  it('state no act of the player in a fight', () => {
    const sources = readQuestSources('src/data/quests');
    for (const { quest } of Object.values(ROAD_STORY)) {
      const text = opening(sources[`${quest}.ink`]);
      expect(text.length, quest).toBeGreaterThan(100);
      for (const act of FIGHT_ACTS) expect(text, `${quest}: ${act}`).not.toContain(act);
    }
  });
});
