import { describe, expect, it } from 'vitest';
import { NPCS, type TraitId } from '../data/npcs';
import { lineKey } from '../text/names';
import { entryText } from '../text/resolve';
import { playerVehicle } from './damage';
import { callVehicle, chooseOption, currentLine, currentOptions, raiseCalls } from './dialogue';
import { addGoods } from './inventory';
import { stateOf } from './states';
import { addVehicle, emptyWorld, npcBrain, sizedUp, startCombat } from './testkit';
import type { Faction, Vehicle, World } from './types';
import { refreshVision } from './vision';

const en = (line: Parameters<typeof lineKey>[0]): string => entryText('en', lineKey(line));
const optionTexts = (w: World): string[] => currentOptions(w).map((o) => en(o.line));
const say = (w: World): string => en(currentLine(w));

function quiet(): World {
  const w = emptyWorld({ x: 30, y: 30 });
  for (const id of Object.keys(NPCS)) w.spawnTimer[id] = Number.MAX_SAFE_INTEGER;
  return w;
}

function driver(w: World, template: string, traits: TraitId[], faction: Faction, x: number, y = 30): Vehicle {
  const npc = addVehicle(w, faction, 'scout', ['stockEngine', 'mg'], { x, y });
  npc.brain = npcBrain(template, npc.pos, traits);
  return npc;
}

function raiderFights(w: World, raider: Vehicle): void {
  raider.brain!.goals = [{ kind: 'fight', targetId: w.player.vehicleId, destination: { ...playerVehicle(w).pos }, phase: 'travel', reason: 'fightHostile', demands: true, worn: { turn: w.turn, condition: 1 } }];
  startCombat(w, raider, playerVehicle(w));
  sizedUp(w, raider, playerVehicle(w));
}

function attacked(cargo: boolean): { w: World; raider: Vehicle } {
  const w = quiet();
  const raider = driver(w, 'buggy', ['raider'], 'scrapjaw', 38);
  if (cargo) addGoods(w, playerVehicle(w), 'electronics', 3);
  raiderFights(w, raider);
  refreshVision(w);
  return { w, raider };
}

describe('a trader the player calls', () => {
  it('on a quiet road greets plainly and shows a first page of at most four', () => {
    const w = quiet();
    const trader = driver(w, 'trader', ['trader'], 'independent', 36);
    refreshVision(w);
    const call = callVehicle(w, trader.id);
    expect(say(call)).toBe('Go ahead.');
    expect(currentOptions(call).filter((o) => o.topic || o.group).length).toBeLessThanOrEqual(4);
  });

  it('right after the shooting stopped asks if the player is alright', () => {
    const w = quiet();
    const trader = driver(w, 'trader', ['trader'], 'independent', 36);
    const raider = driver(w, 'buggy', ['raider'], 'scrapjaw', 50);
    raider.defeat = { phase: 'out', turns: 0, unseen: 0, foes: [], gaveUp: false };
    startCombat(w, raider, playerVehicle(w));
    refreshVision(w);
    expect(say(callVehicle(w, trader.id))).toBe('You alright? Saw the shooting.');
  });

  it('while the shooting goes on asks for the point and offers the call for help first', () => {
    const w = quiet();
    const trader = driver(w, 'trader', ['trader'], 'independent', 36);
    const raider = driver(w, 'buggy', ['raider'], 'scrapjaw', 50);
    startCombat(w, raider, playerVehicle(w));
    refreshVision(w);
    const call = callVehicle(w, trader.id);
    expect(say(call)).toBe('Shots on your side. Make it quick.');
    expect(optionTexts(call)[0]).toBe(en('needAHandHere'));
  });

  it('with a stranded player offers a pull', () => {
    const w = quiet();
    w.player.fuel = 0;
    const trader = driver(w, 'trader', ['trader'], 'independent', 36);
    refreshVision(w);
    expect(say(callVehicle(w, trader.id))).toBe('You look stuck. Need a pull?');
    expect(optionTexts(callVehicle(w, trader.id))).toContain(en('iAmStrandedCan'));
  });
});

describe('a lawman the player calls', () => {
  it('reads the fight that just ended in its own voice', () => {
    const w = quiet();
    const lawman = driver(w, 'trader', ['lawman'], 'independent', 36);
    const raider = driver(w, 'buggy', ['raider'], 'scrapjaw', 50);
    raider.defeat = { phase: 'out', turns: 0, unseen: 0, foes: [], gaveUp: false };
    startCombat(w, raider, playerVehicle(w));
    refreshVision(w);
    expect(say(callVehicle(w, lawman.id))).toBe('Heard the shooting. You hurt?');
  });
});

describe('a raider shooting at the player', () => {
  it('opens with an attack greeting, lifts What do you want? and offers the truce and the plea', () => {
    const { w, raider } = attacked(true);
    const call = callVehicle(w, raider.id);
    expect(say(call)).toBe('Bold, calling me. Talk.');
    expect(optionTexts(call)).toEqual(['What do you want?', 'Enough shooting. Can we call a truce?', 'I give up. Let me go.', 'Hang up.']);
  });

  it('answers What do you want? with the cargo demand a raised call would make, and settles it the same way', () => {
    const raised = attacked(true);
    raiseCalls(raised.w);
    expect(raised.w.player.call).toMatchObject({ topic: 'demand' });

    const asked = attacked(true);
    const call = chooseOption(callVehicle(asked.w, asked.raider.id), 0);
    expect(call.player.call).toMatchObject({ topic: 'demand', node: 'demand' });
    expect(say(call)).toBe(entryText('en', lineKey('demandCargoOrPay')));
    expect(call.player.call!.vars).toEqual(raised.w.player.call!.vars);
    expect(call.player.xp).toEqual(raised.w.player.xp);

    const pay = optionTexts(call).indexOf(en('comeAndGetIt'));
    const refused = chooseOption(call, pay);
    expect(refused.player.talked[asked.raider.id].demand).toBe('refused');
    expect(refused.player.call).toBeNull();
  });

  it('answers with just the fight when it has nothing to demand, and the plea still works from there', () => {
    const { w, raider } = attacked(true);
    w.player.talked[raider.id] = { demand: 'refused' };
    const call = chooseOption(callVehicle(w, raider.id), 0);
    expect(say(call)).toBe('Nothing from you. Just the fight.');
    expect(optionTexts(call)).toEqual(['Enough shooting. Can we call a truce?', 'I give up. Let me go.', 'Then we finish this.']);
    const truce = chooseOption(call, 0);
    expect(truce.player.call?.topic).toBe('truce');
    expect(stateOf(truce, 'combat', raider.id, w.player.vehicleId)).not.toBeNull();
  });

  it('asks twice: once the demand is refused the next answer is the fight', () => {
    const { w, raider } = attacked(true);
    let call = chooseOption(callVehicle(w, raider.id), 0);
    call = chooseOption(call, optionTexts(call).indexOf(en('comeAndGetIt')));
    const again = callVehicle(call, raider.id);
    expect(optionTexts(again)[0]).toBe('What do you want?');
    expect(say(chooseOption(again, 0))).toBe('Nothing from you. Just the fight.');
  });
});

describe('a patrol that distrusts the player', () => {
  it('keeps the cold line and offers no service topic', () => {
    const w = quiet();
    const patrol = driver(w, 'trader', ['lawman'], 'bowl', 36);
    w.player.standing.bowl = -30;
    refreshVision(w);
    const call = callVehicle(w, patrol.id);
    expect(say(call)).toBe(entryText('en', lineKey('notYourKind')));
    expect(optionTexts(call).slice(-1)).toEqual(['Hang up.']);
    expect(optionTexts(call)).not.toContain(en('whereIsTheNearest'));
  });

  it('still lets an attacker lead with its attack greeting, not the cold line', () => {
    const w = quiet();
    const patrol = driver(w, 'trader', ['marshal'], 'bowl', 36);
    w.player.standing.bowl = -30;
    raiderFights(w, patrol);
    refreshVision(w);
    expect(say(callVehicle(w, patrol.id))).toBe('Marshal here. Stop shooting and listen.');
  });
});
