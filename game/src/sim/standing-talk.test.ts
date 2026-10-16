import { describe, expect, it } from 'vitest';
import { HANG_UP_LINE, TOPICS, type LineId, type TopicId } from '../data/dialogue';
import type { TraitId } from '../data/npcs';
import type { PersonalityId } from '../data/personalities';
import { callVehicle, chooseOption, currentLine, currentOptions } from './dialogue';
import { playerVehicle } from './damage';
import { remember } from './memory';
import { thinkNpc } from './npc-activities';
import { STANDING_FACTION_IDS } from '../data/npc-behavior';
import { strandedAt } from './tow';
import { addVehicle, emptyWorld, forceOption, npcBrain } from './testkit';
import type { Faction, Vehicle, World } from './types';
import { refreshVision } from './vision';

function driver(faction: Faction, traits: TraitId[], personality: PersonalityId = 'talkative'): { w: World; npc: Vehicle } {
  const w = emptyWorld({ x: 30, y: 30 });
  const npc = addVehicle(w, faction, 'scout', ['stockEngine'], { x: 36, y: 30 });
  npc.brain = npcBrain('trader', npc.pos, traits, personality);
  npc.resources = { fuel: 100, supplies: 10, money: 0, health: 100 };
  refreshVision(w);
  return { w, npc };
}

const offered = (w: World): LineId[] => currentOptions(w).map((o) => o.line);
const ask = (topic: TopicId): LineId => TOPICS[topic].ask!.say;

describe('talk by attitude band', () => {
  it('lets a neutral driver talk trade as before', () => {
    const { w, npc } = driver('bowl', ['trader']);
    const call = callVehicle(w, npc.id);
    expect(currentLine(call)).toBe('goAhead');
    expect(offered(call)).toContain(ask('trade'));
  });

  it('turns a wary Bowl driver away with the faction line and no trade or news', () => {
    const { w, npc } = driver('bowl', ['trader']);
    w.player.standing.bowl = -30;
    const call = callVehicle(w, npc.id);
    expect(currentLine(call)).toBe('notYourKind');
    expect(offered(call)).not.toContain(ask('trade'));
    expect(offered(call)).not.toContain(ask('directions'));
    expect(offered(call)).toContain(HANG_UP_LINE);
  });

  it('turns away a trader the player robbed with the line that it knows', () => {
    const { w, npc } = driver('bowl', ['trader']);
    remember(w, npc, { kind: 'wronged', by: w.player.vehicleId, deed: 'robbed' });
    const call = callVehicle(w, npc.id);
    expect(currentLine(call)).toBe('iKnowWhatYouDid');
    expect(offered(call)).not.toContain(ask('trade'));
  });

  it('opens help topics to a friendly driver the player never helped', () => {
    const { w, npc } = driver('guidestar', ['trader'], 'tightLipped');
    w.player.standing.guidestar = 20;
    remember(w, npc, { kind: 'prices', shop: 'nose', pressure: { ...w.shops.nose.pressure } });
    w.player.perks = ['marketEars'];
    const told = chooseOption(callVehicle(w, npc.id), offered(callVehicle(w, npc.id)).indexOf(ask('marketNews')));
    expect(told.player.call?.node).toBe(TOPICS.marketNews.start);
  });

  it('still rescues a broke, stranded player hated by every faction through a neutral independent', () => {
    const { w, npc } = driver('independent', ['trader']);
    for (const id of STANDING_FACTION_IDS) w.player.standing[id] = -100;
    w.player.money = 0;
    w.player.fuel = 0;
    const bowl = addVehicle(w, 'bowl', 'scout', ['stockEngine'], { x: 30, y: 36 });
    bowl.brain = npcBrain('bowlFarmer', bowl.pos, ['lawman']);
    expect(strandedAt(w, bowl, playerVehicle(w))).toBeNull();
    expect(strandedAt(w, npc, playerVehicle(w))).not.toBeNull();
    forceOption('strandedSeen', 'tow');
    thinkNpc(w, npc);
    expect(w.states.some((s) => (s.kind === 'answering' || s.kind === 'tow') && s.holder === npc.id && s.other === w.player.vehicleId)).toBe(true);
    const call = callVehicle(w, npc.id);
    expect(currentLine(call)).toBe('goAhead');
  });
});
