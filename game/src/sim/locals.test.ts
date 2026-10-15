import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EN } from '../text/en';
import { LOCALS, type NoteId } from '../data/locals';
import { CONTRACTS, SHOPS, SITE_ECONOMY, SITE_EVENTS, siteRecipes } from '../data/market';
import { REGION } from '../data/region';
import { WAGON_SEVEN } from '../data/salvage';
import { holdsNote, learnNote, localsAt, townWork } from './dialogue-rules';
import { acceptContract, type Contract } from './market';
import { chooseQuestOption, QUEST_QUERIES, QUESTS, restoreQuest, questView, startQuest } from './quests';
import { sitePads } from './sites';
import { compileBundle, readQuestSources, withEnglishTwins } from '../test/quest-compile';
import { emptyWorld } from './testkit';
import type { World } from './types';
import { UNITS } from '../data/units';
import { cloneWorld } from './world';

const site = (id: string) => [...REGION.towns, ...REGION.locations].find((s) => s.id === id)!;

function parkedAt(town: string): World {
  return emptyWorld(sitePads(site(town))[0]);
}

function talk(w: World, quest: string, picks: readonly string[]): World {
  return picks.reduce((at, pick) => chooseQuestOption(at, QUESTS, pickIndex(at, pick)), startQuest(w, QUESTS, quest, 'start'));
}

function pickIndex(w: World, text: string): number {
  const index = questView(w, QUESTS).choices.indexOf(text);
  if (index < 0) throw new Error(`No choice ${text} in ${questView(w, QUESTS).choices.join(', ')}`);
  return index;
}

const choices = (w: World, quest: string) => questView(startQuest(w, QUESTS, quest, 'start'), QUESTS).choices;
const lastLine = (w: World) => questView(w, QUESTS).lines.at(-1)?.text;

function untouched(w: World): unknown {
  return { ...w, player: { ...w.player, notes: null, quests: null }, events: null };
}

const haul = (id: string, reward: number): Extract<Contract, { kind: 'haul' }> => ({ id, shop: 'bowl', kind: 'haul', good: 'salt', units: 1, to: 'nose', reward, deadline: 500, window: 500, rush: false, tier: 1 });

const WAGON = 'About that scavenger with the Army radio.';
const WAGON_FOUND = 'We found wagon Seven.';
const WORK = 'Any work?';
const PIERCE = 'What came of the Pierce loan?';

describe('settlement locals', () => {
  it('lists the town locals first and keeps every local at a place with a shop', () => {
    expect(localsAt('bowl').map((l) => l.id).slice(0, 3)).toEqual(['ruben', 'hattie', 'dag']);
    expect(localsAt('nose').map((l) => l.id).slice(0, 3)).toEqual(['kovac', 'lena', 'ibo']);
    for (const local of Object.values(LOCALS)) expect(Object.keys(SHOPS)).toContain(local.town);
  });

  it('places the recent-years locals and records a biased rumor as said', () => {
    expect(localsAt('salvage-yard').map((l) => l.id)).toContain('sefa');
    expect(localsAt('bowl').map((l) => l.id)).toContain('jory');

    const next = talk(parkedAt('salvage-yard'), 'yard_sefa', ['Who are the families of the Burnt Convoy?', 'Is the Burnt Convoy picked clean?']);

    expect(next.player.notes.map((n) => n.id)).toEqual(['talkConvoyNotClean']);
    expect(untouched(next)).toEqual(untouched(parkedAt('salvage-yard')));
  });

  it('opens a question only once its fact holds', () => {
    const w = parkedAt('nose');
    expect(choices(w, 'nose_kovac')).not.toContain(WAGON);
    expect(choices(w, 'nose_kovac')).not.toContain(WAGON_FOUND);

    w.player.notes.push({ id: 'burntConvoy', turn: 0 });
    w.player.notes.push({ id: 'wagonBowl', turn: 0 });
    w.player.quests.world.wagon_seen = true;

    expect(choices(w, 'nose_ibo')).toContain('What happened at Burnt Convoy?');
    expect(choices(w, 'nose_kovac')).toEqual(['What is this place?', 'Who runs Nose?', 'What is the road like?', 'What does Nose turn out?', WORK, 'Anything off the books?', WAGON, WAGON_FOUND, 'Goodbye.']);
  });

  it('opens the Fallen Sun question once the crater is found', () => {
    const w = parkedAt('bowl');
    expect(choices(w, 'bowl_ruben')).not.toContain('What is the Fallen Sun really?');
    w.player.discovered.push('fallen-sun');
    expect(choices(w, 'bowl_ruben')).toContain('What is the Fallen Sun really?');
  });

  it('names the hull behind Ibo\'s tone and answers what he hears', () => {
    const shack = talk(parkedAt('nose'), 'nose_ibo', ['What do you do in this shack?']);
    expect(questView(shack, QUESTS).lines.map((line) => line.text).join(' ')).toContain('<term=fallen_sun>Fallen Sun</term>, the big crashed hull in the crater');
    expect(questView(shack, QUESTS).choices).toContain('What does the tone from the Fallen Sun say?');

    const answered = chooseQuestOption(shack, QUESTS, pickIndex(shack, 'What does the tone from the Fallen Sun say?'));
    expect(lastLine(answered)).toContain('no key to decode it');
    expect(lastLine(answered)).not.toContain("A tone's a tone");
  });

  it('offers a stranger only questions that name nothing unheard', () => {
    const w = parkedAt('bowl');
    expect(choices(w, 'bowl_ruben')).toEqual(['What is this place?', 'Who runs Bowl?', 'Where can I get water, or find work?', 'What does Bowl make?', 'Goodbye.']);
    expect(choices(w, 'bowl_dag')).toEqual(['What is the road like?', 'Any work?', 'Who pays the Farmers?', 'Goodbye.']);
  });

  it('opens a question after the answer that mentions it', () => {
    const w = parkedAt('bowl');
    expect(choices(w, 'bowl_ruben')).not.toContain(PIERCE);
    const asked = talk(w, 'bowl_ruben', ['Who runs Bowl?', 'Goodbye.']);
    expect(choices(asked, 'bowl_ruben')).toContain(PIERCE);
    expect(choices(asked, 'bowl_ruben').some((c) => /refuse/i.test(c))).toBe(false);
    const answer = talk(w, 'bowl_ruben', ['Who runs Bowl?', PIERCE]);
    expect(questView(answer, QUESTS).lines.map((l) => l.text).join(' ')).toContain('The Senate turned it down.');
  });

  it('keeps the Pierce question after a save and load', () => {
    const open = talk(parkedAt('bowl'), 'bowl_ruben', ['Who runs Bowl?']);
    const loaded = structuredClone(open);
    loaded.player.quests.live = null;
    restoreQuest(loaded, QUESTS);
    expect(questView(loaded, QUESTS).choices).toContain(PIERCE);
  });

  it('asks Jory about votes, patrol and Nose only after the answers that bring them up', () => {
    const w = parkedAt('bowl');
    expect(choices(w, 'bowl_jory')).toEqual(['Who are the tenants?', 'Goodbye.']);
    const asked = talk(w, 'bowl_jory', ['Who are the tenants?', 'Goodbye.']);
    expect(choices(asked, 'bowl_jory')).toContain('How does a tenant get a vote?');
    expect(choices(asked, 'bowl_jory')).not.toContain('What do you make of Nose?');
    asked.player.discovered.push('nose');
    expect(choices(asked, 'bowl_jory')).toContain('What do you make of Nose?');
    const voted = talk(asked, 'bowl_jory', ['How does a tenant get a vote?', 'Goodbye.']);
    expect(choices(voted, 'bowl_jory')).toContain('Do tenants take up the patrol?');
  });

  it('greets with the copy line only when Agnes has told of a copy', () => {
    const lines = (w: World) => questView(startQuest(w, QUESTS, 'pump_agnes', 'start'), QUESTS).lines.map((l) => l.text).join(' ');
    const w = parkedAt('dustwell');
    w.player.quests.local.pump_agnes = { trusted: true };
    expect(lines(w)).not.toContain('Changed your mind about the copy?');
    w.player.quests.local.pump_agnes = { trusted: true, knows_copy: true };
    expect(lines(w)).toContain('Changed your mind about the copy?');
  });

  it('writes a rumor into the journal and changes nothing else', () => {
    const w = parkedAt('bowl');
    w.turn = 77;

    const next = talk(w, 'bowl_hattie', ['Heard any rumors?']);

    expect(next.player.notes).toEqual([{ id: 'wagonBowl', turn: 77 }]);
    expect(next.events).toEqual([{ t: 'note', id: 'wagonBowl' }]);
    expect(untouched(next)).toEqual(untouched(w));
  });

  it('answers a lore question with no note and no change', () => {
    const w = parkedAt('bowl');

    const next = talk(w, 'bowl_ruben', ['What is this place?', 'What did your grandmother tell you about the old days?']);

    expect(next.player.notes).toEqual([]);
    expect(next.events).toEqual([]);
    expect(untouched(next)).toEqual(untouched(w));
  });
});

describe('the lost wagon chain', () => {
  it('leads from Hattie at Bowl to Kovac at Nose, and opens the found question once the wreck scene was seen', () => {
    let w = talk(parkedAt('bowl'), 'bowl_hattie', ['Heard any rumors?', 'Goodbye.']);
    w.vehicles[0].pos = { ...sitePads(site('nose'))[0] };

    w = talk(w, 'nose_kovac', [WAGON, 'Goodbye.']);
    w.player.scavenged.push(WAGON_SEVEN);
    expect(choices(w, 'nose_kovac')).not.toContain(WAGON_FOUND);
    w.player.quests.world.wagon_seen = true;
    w = talk(w, 'nose_kovac', [WAGON_FOUND, 'Goodbye.']);

    expect(w.player.notes.map((n) => n.id)).toEqual(['wagonBowl', 'wagonNose', 'wagonFound']);
  });

  it('lets Hattie talk about the tow man and the stripped truck only to a driver who was towed in', () => {
    const towed = parkedAt('bowl');
    towed.player.quests.world.towed_to_bowl = true;

    expect(choices(parkedAt('bowl'), 'bowl_hattie')).not.toContain('Tell me about the tow man.');
    expect(choices(parkedAt('bowl'), 'bowl_hattie')).not.toContain('Who stripped my truck?');
    expect(choices(towed, 'bowl_hattie')).toEqual(expect.arrayContaining(['Tell me about the tow man.', 'Who stripped my truck?']));
    expect(questView(talk(towed, 'bowl_hattie', ['Tell me about the tow man.']), QUESTS).choices).toContain('Why would he want a Varga?');
  });

  it('lets a towed driver tell Hattie where the truck came from, and the Bowl knows it from then on', () => {
    const towed = parkedAt('bowl');
    towed.player.quests.world.towed_to_bowl = true;
    const asked = talk(towed, 'bowl_hattie', ['Tell me about the tow man.', 'Why would he want a Varga?']);

    expect(asked.player.quests.world.varga_truck_known).toBeUndefined();
    const told = chooseQuestOption(asked, QUESTS, pickIndex(asked, 'I found my truck at that farm.'));
    expect(told.player.quests.world.varga_truck_known).toBe(true);
  });

  it('takes the rumor question off the list once asked, with the note kept', () => {
    const once = talk(parkedAt('bowl'), 'bowl_hattie', ['Heard any rumors?']);

    expect(questView(once, QUESTS).choices).not.toContain('Heard any rumors?');
    expect(once.player.notes.map((n) => n.id)).toEqual(['wagonBowl']);
  });
});

describe('wagon Seven', () => {
  const picked = (w: World, picks: readonly string[]) => picks.reduce((at, pick) => chooseQuestOption(at, QUESTS, pickIndex(at, pick)), w);
  const worldVars = (w: World) => w.player.quests.world;
  const BENCH = 'I brought something from wagon Seven.';
  const SIGN = 'Send for Kovac and give him the stub.';
  const ASK_TELLER = 'Ask Teller in front of Lena what happened on the bend.';
  const PUT = 'Put the stub on the bench and say where it came from.';
  const TAP = 'Spend an hour tapping the stub out.';

  it('shows the painted number in the wreck scene, so the later questions can say Seven', () => {
    const wreck = questView(startQuest(parkedAt('bowl'), QUESTS, 'wagon_seven', 'start'), QUESTS);
    expect(wreck.lines.map((l) => l.text).join(' ')).toContain('a white 7');
  });

  function skilled(w: World, level: number): World {
    for (const skill of ['perception', 'machining', 'social'] as const) w.player.ranks[skill] = level;
    return w;
  }

  function holding(town: string, pin: 'held' | 'bent', level = 0): World {
    const w = skilled(parkedAt(town), level);
    w.player.quests.world.wagon_seen = true;
    w.player.quests.world.wagon_pin = pin;
    return w;
  }

  it('lets a skilled driver read the hollow and the mount and take the stub out whole', () => {
    const w = skilled(parkedAt('bowl'), 3);

    const next = talk(w, 'wagon_seven', ['Walk the hollow.', 'Look at the gun mount.', TAP, 'Leave the hollow.']);

    expect(worldVars(next)).toEqual({ wagon_saw: true, wagon_read: true, wagon_pin: 'held' });
    expect(next.player.money).toBe(w.player.money);
    expect(next.player.notes.map((n) => n.id)).toEqual(['wagonPin']);
  });

  it('gets a driver who misses the signs watched from the ridge, and an unskilled punch bends the stub', () => {
    const next = talk(skilled(parkedAt('bowl'), 0), 'wagon_seven', ['Walk the hollow.', 'Look at the gun mount.', TAP, 'Leave the hollow.']);

    expect(worldVars(next)).toEqual({ wagon_watched: true, wagon_pin: 'bent' });
  });

  it('logs a whole stub at Lena\'s bench and pays the finder\'s rate', () => {
    const w = holding('nose', 'held');

    const next = picked(talk(w, 'nose_lena', [BENCH]), [PUT,SIGN]);

    expect(worldVars(next).wagon_fate).toBe('logged');
    expect(next.player.money - w.player.money).toBe(20 * UNITS.centsPerM);
    expect(choices(next, 'nose_lena')).not.toContain(BENCH);
  });

  it('gets Teller to sign his own admission with enough social, and pays the finder\'s rate', () => {
    const w = holding('nose', 'held', 2);

    const next = picked(talk(w, 'nose_lena', [BENCH]), [PUT,ASK_TELLER]);

    expect(worldVars(next).wagon_fate).toBe('admitted');
    expect(next.player.money - w.player.money).toBe(20 * UNITS.centsPerM);
  });

  it('logs the stub without a fee when Teller will not sign and calls the driver a looter', () => {
    const w = holding('nose', 'held', 0);

    const next = picked(talk(w, 'nose_lena', [BENCH]), [PUT,ASK_TELLER]);

    expect(worldVars(next).wagon_fate).toBe('logged');
    expect(next.player.money).toBe(w.player.money);
  });

  it('sells the stub to Teller for the sump, and Lena remembers it', () => {
    const w = holding('nose', 'bent');

    const next = picked(talk(w, 'nose_lena', [BENCH]), [PUT,'Step outside with Teller.', "Take Teller's M's."]);

    expect(worldVars(next).wagon_fate).toBe('buried');
    expect(next.player.money - w.player.money).toBe(60 * UNITS.centsPerM);
    expect(questView(startQuest(next, QUESTS, 'nose_lena', 'start'), QUESTS).lines[0].text).toContain('Teller drinks better');
  });

  it('offers no log for a bent stub the driver never read', () => {
    const w = holding('nose', 'bent');

    const view = questView(picked(talk(w, 'nose_lena', [BENCH]), [PUT]), QUESTS);

    expect(view.choices).not.toContain(SIGN);
    expect(view.choices).not.toContain(ASK_TELLER);
  });

  it('sells the stub and the place to Sefa at her price', () => {
    for (const [pin, price] of [['held', 30], ['bent', 15]] as const) {
      const w = holding('salvage-yard', pin);
      const next = talk(w, 'yard_sefa', ['I\'ve got the pin from wagon Seven\'s ring.', 'Sell her the stub and the place.']);
      expect(worldVars(next).wagon_fate).toBe('sold');
      expect(next.player.money - w.player.money).toBe(price * UNITS.centsPerM);
    }
  });

  it('lets a driver who saw the hollow tell it at the well house beside Dag', () => {
    const w = parkedAt('bowl');
    w.player.quests.world.wagon_saw = true;

    const next = talk(w, 'bowl_dag', ['Nobody raided that wagon.', 'Say it at the well house.', 'Goodbye.']);

    expect(worldVars(next).wagon_fate).toBe('told');
    expect(next.player.money).toBe(w.player.money);
    expect(choices(next, 'bowl_dag')).toContain('What did the well house make of it?');
  });
});

describe('work by talk', () => {
  it('offers the best-paying open offer on the town board', () => {
    const w = parkedAt('bowl');
    w.shops.bowl.contracts = [haul('ct-low', 100), haul('ct-high', 300), { ...haul('ct-gone', 900), deadline: -1 }];

    expect(townWork(w)?.id).toBe('ct-high');
    const offer = talk(w, 'bowl_dag', [WORK]);
    expect(questView(offer, QUESTS).lines.at(-1)).toEqual({ text: 'I might have a haul for you, if you want it.', tags: ['work_offer'] });
  });

  it('passes over a haul the truck has no room for', () => {
    const w = parkedAt('bowl');
    w.shops.bowl.contracts = [haul('ct-small', 100), { ...haul('ct-huge', 300), units: 999 }];

    expect(townWork(w)?.id).toBe('ct-small');
  });

  it('says the board holds nothing the truck can take, rather than nothing at all', () => {
    const w = parkedAt('nose');
    w.shops.nose.contracts = [{ ...haul('ct-huge', 300), shop: 'nose', to: 'bowl', units: 999 }];

    expect(lastLine(talk(w, 'nose_kovac', [WORK]))).toBe('Nothing on the board fits you right now.');
  });

  it('says so when the board is empty or the player holds the most contracts', () => {
    const empty = parkedAt('bowl');
    empty.shops.bowl.contracts = [];
    const full = parkedAt('bowl');
    full.shops.bowl.contracts = [haul('ct-high', 300)];
    full.player.contracts = Array.from({ length: CONTRACTS.maxActive }, (_, k) => haul(`held${k}`, 10));

    expect(lastLine(talk(empty, 'bowl_dag', [WORK]))).toBe("The board's empty today. Come back in a couple of days, it fills slowly.");
    expect(lastLine(talk(full, 'bowl_dag', [WORK]))).toBe("You're carrying enough promises already. Finish a few and then ask me again.");
  });

  it('takes the offer exactly as the board does', () => {
    const w = parkedAt('bowl');
    w.shops.bowl.contracts = [haul('ct-low', 100), haul('ct-high', 300)];

    const taken = talk(w, 'bowl_dag', [WORK, 'I will take it.']);
    const board = acceptContract(w, 'ct-high');

    expect(taken.player.contracts).toEqual(board.player.contracts);
    expect(taken.shops).toEqual(board.shops);
    expect(taken.vehicles).toEqual(board.vehicles);
    expect(taken.events).toEqual(board.events);
  });
});

describe('the depot leak at Nose', () => {
  const OPEN = ['Anything off the books?', 'I will look into it.'];
  const LEDGER = 'Read the depot ledgers.';
  const GATE = 'Check the gate log for the same nights.';
  const SABINE = 'Talk to the trader by the gate.';
  const PAY = 'Pay her 20 M to talk.';
  const SOLID_CASE = [...OPEN, LEDGER, GATE, 'Talk to the fuel clerk.', 'Watch the depot all night.'];
  const vars = (w: World) => w.player.quests.local.nose_depot_leak ?? {};

  it('shows the depot quest as pages with its numbers and the facts found so far', () => {
    const w = parkedAt('nose');
    const view = questView(talk(w, 'nose_kovac', [...OPEN, LEDGER]), QUESTS);

    expect(view.view).toBe('page');
    expect(view.stats).toEqual([
      { name: 'watches', label: 'Watches', value: '4' },
      { name: 'money', label: "M's", value: `${w.player.money / UNITS.centsPerM} M` },
      { name: 'alarm', label: 'Talk', value: 'quiet' },
    ]);
    expect(view.facts).toEqual([expect.stringContaining('Ledger: cans went missing')]);
    expect(view.lines.filter((l) => l.tags.includes('row')).map((l) => l.text)).toEqual(['3rd; 2 cans; Pell', '7th; 3 cans; Pell', '11th; 2 cans; Pell']);
  });

  it('opens from Kovac and pays for naming the thief with proof, which changes what Nose says after', () => {
    const w = parkedAt('nose');
    const proof = talk(w, 'nose_kovac', SOLID_CASE);
    expect(vars(proof)).toMatchObject({ gate_checked: true, saw_swap: true, saw_handoff: true, watches: 1 });

    const done = talk(w, 'nose_kovac', [...SOLID_CASE, 'Go to Kovac with a name.', 'Corporal Vance.']);

    expect(done.player.money - w.player.money).toBe(150 * UNITS.centsPerM);
    expect(done.player.quests.world).toEqual({ depot_thief: 'vance' });
    expect(done.player.quests.session).toBeNull();
    expect(questView(startQuest(done, QUESTS, 'nose_kovac', 'start'), QUESTS).lines[0].text).toContain('The depot is quiet these days.');
    expect(choices(done, 'nose_kovac')).not.toContain('Anything off the books?');
    expect(lastLine(talk(done, 'nose_ibo', ['Heard about the depot business?']))).toContain('He sat at my table');
  });

  it('turns Kovac away from a name with no proof, and locks up the wrong man on the ledger alone', () => {
    const w = parkedAt('nose');
    const early = talk(w, 'nose_kovac', [...OPEN, SABINE, PAY, 'Go to Kovac with a name.', 'The corporal with the scar.']);
    expect(vars(early)).toMatchObject({ alarm: 1 });
    expect(early.player.quests.world).toEqual({ depot_thief: 'open' });

    const weak = talk(w, 'nose_kovac', [...OPEN, LEDGER, GATE, 'Go to Kovac with a name.', 'Corporal Vance.']);
    expect(weak.player.quests.world).toEqual({ depot_thief: 'open' });

    const wrong = talk(w, 'nose_kovac', [...OPEN, LEDGER, 'Go to Kovac with a name.', 'Pell, the clerk.']);
    expect(wrong.player.money).toBe(w.player.money);
    expect(wrong.player.quests.world).toEqual({ depot_thief: 'pell' });
  });

  it('sells out for the envelope, or loses the trail to too much noise', () => {
    const w = parkedAt('nose');
    const sold = talk(w, 'nose_kovac', [...OPEN, LEDGER, GATE, SABINE, 'Let her see what you know.', 'Take the envelope.']);
    expect(sold.player.money - w.player.money).toBe(60 * UNITS.centsPerM);
    expect(sold.player.quests.world).toEqual({ depot_thief: 'bought' });

    const loud = talk(w, 'nose_kovac', [...OPEN, LEDGER, GATE, "Search Vance's bunk.", SABINE, 'Lean on her.']);
    expect(loud.player.quests.world).toEqual({ depot_thief: 'lost' });
    expect(questView(loud, QUESTS).ended).toBe(true);
  });

  it('charges the cost of a paid lead, and locks it with less money in hand', () => {
    const w = parkedAt('nose');
    const at = talk(w, 'nose_kovac', [...OPEN, SABINE]);
    const index = pickIndex(at, PAY);
    expect(questView(at, QUESTS)).toMatchObject({ costs: expect.arrayContaining([20]), locked: [false, false, false] });
    const paid = chooseQuestOption(at, QUESTS, index);
    expect(w.player.money - paid.player.money).toBe(20 * UNITS.centsPerM);
    expect(vars(paid)).toMatchObject({ knows_scar: true });

    const broke = cloneWorld(w);
    broke.player.money = 19 * UNITS.centsPerM;
    const short = talk(broke, 'nose_kovac', [...OPEN, SABINE]);
    expect(questView(short, QUESTS).locked[pickIndex(short, PAY)]).toBe(true);
    expect(() => chooseQuestOption(short, QUESTS, pickIndex(short, PAY))).toThrow('costs 20 M, more than the player holds');
  });

  it('names no one before a lead has named them', () => {
    const w = parkedAt('nose');
    const desk = talk(w, 'nose_kovac', OPEN);
    expect(questView(desk, QUESTS).choices.filter((c) => /Vance|Pell/.test(c))).toEqual([]);
    expect(questView(desk, QUESTS).choices).not.toContain('Go to Kovac with a name.');

    const scar = talk(w, 'nose_kovac', [...OPEN, SABINE, PAY, 'Go to Kovac with a name.']);
    expect(questView(scar, QUESTS).choices).toEqual(['The corporal with the scar.', 'Not yet.']);

    const logged = talk(w, 'nose_kovac', [...OPEN, LEDGER, GATE, 'Go to Kovac with a name.']);
    expect(questView(logged, QUESTS).choices).toEqual(['Corporal Vance.', 'Pell, the clerk.', 'Not yet.']);
  });

  it('runs out of watches into a last call', () => {
    const w = parkedAt('nose');
    const slow = talk(w, 'nose_kovac', [...OPEN, 'Talk to the fuel clerk.', LEDGER, 'Watch the depot all night.', GATE, SABINE, 'Leave her be.']);
    expect(vars(slow)).toMatchObject({ watches: 0, alarm: 1 });
    expect(questView(slow, QUESTS).choices).toEqual(['Name Corporal Vance.', 'Name Pell, the clerk.', 'Let it go.']);
  });
});

describe('locals at stalls', () => {
  const OPEN = ['Read her the big dial.', 'Ask why the tanker\'s meter came off.'];
  const COVER = 'Tell him she was talking about pump pressures.';
  const CARRY = 'Say you\'ll carry the copy.';
  const TAKE = 'Take the copy and the meter out to your truck.';
  const ROAD = [...OPEN, COVER, CARRY, TAKE, 'Keep the copy.'];
  const LIE = 'Tell him it\'s pump records for the lock house.';
  const LOCK = 'Drive down to the lock house.';
  const SIGN = 'Sign and write what you read on the dial.';
  const TERRACE = 'Follow the tanker\'s tracks up to the top terrace.';
  const BOLT = 'Bolt Agnes\'s meter onto the inlet.';

  it('lists Agnes at Dustwell', () => {
    expect(localsAt('dustwell').map((l) => l.id)).toContain('agnes');
    expect(localsAt('pump-station').map((l) => l.id)).toEqual(['hollis']);
  });

  it('keeps the copy from a driver who tells the watchman, and pays only the driver who takes his purse', () => {
    const w = parkedAt('dustwell');

    const paid = talk(w, 'pump_agnes', [...OPEN, 'Tell him what she said.', 'Take the purse.']);
    expect(paid.player.quests.world).toEqual({ pipe_fate: 'searched', marr_regard: 'bought' });
    expect(paid.player.money - w.player.money).toBe(20 * UNITS.centsPerM);
    expect(choices(paid, 'pump_agnes')).toEqual(['Goodbye.']);

    const unpaid = talk(w, 'pump_agnes', [...OPEN, 'Tell him what she said.', 'Leave it in his hand.']);
    expect(unpaid.player.quests.world).toEqual({ pipe_fate: 'searched' });
    expect(unpaid.player.money).toBe(w.player.money);
  });

  it('holds the copy back from a silent driver until the watchman is named', () => {
    const w = parkedAt('dustwell');

    const silent = talk(w, 'pump_agnes', [...OPEN, 'Say nothing.']);
    expect(questView(silent, QUESTS).choices).not.toContain(CARRY);

    const warned = talk(w, 'pump_agnes', [...OPEN, 'Say nothing.', 'Tell her the man on the drum is listening.']);
    expect(questView(warned, QUESTS).choices).toContain(CARRY);
  });

  it('opens the pipe quest from Agnes and ends it with the copy dropped', () => {
    const w = parkedAt('dustwell');

    const dropped = talk(w, 'pump_agnes', [...ROAD, 'Throw the copy in a ditch.']);

    expect(dropped.player.quests.world).toEqual({});
    expect(dropped.player.money).toBe(w.player.money);
    expect(dropped.player.notes.map((n) => n.id)).toEqual(['pipeBook', 'pipeOffer']);
    expect(choices(dropped, 'pump_agnes')).toContain(CARRY);
  });

  it('reaches the Bowl lock house once the gate is bought', () => {
    const w = parkedAt('dustwell');
    const lost = talk(w, 'pump_agnes', [...ROAD, 'Drive on to the Bowl gate.', "Slip the older one a few M's.", LOCK]);

    expect(questView(lost, QUESTS).choices).toContain(SIGN);
    expect(lost.player.quests.world).toEqual({ marr_regard: 'enemy' });
    expect(w.player.money - lost.player.money).toBe(50 * UNITS.centsPerM);
  });

  it('pays the gate patrol with a bribe, signs Mirela\'s book and pays on delivery', () => {
    const w = parkedAt('dustwell');
    const gate = [...ROAD, 'Drive on to the Bowl gate.', "Slip the older one a few M's.", LOCK];

    const signed = talk(w, 'pump_agnes', [...gate, SIGN]);
    expect(signed.player.quests.world).toEqual({ marr_regard: 'enemy', pipe_fate: 'delivered' });
    expect(signed.player.money - w.player.money).toBe(10 * UNITS.centsPerM);

    const filed = talk(w, 'pump_agnes', [...gate, 'Leave your name off.']);
    expect(filed.player.quests.world).toEqual({ marr_regard: 'enemy', pipe_fate: 'filed' });
  });

  it('fines a driver whose gate talk fails and who hands the copy over, and fines nobody who hands it over at once', () => {
    const w = parkedAt('dustwell');
    const gate = [...ROAD, 'Drive on to the Bowl gate.'];

    const seized = talk(w, 'pump_agnes', [...gate, LIE, 'Hand it over.']);
    expect(seized.player.quests.world).toEqual({ marr_regard: 'enemy', pipe_fate: 'seized' });
    expect(w.player.money - seized.player.money).toBe(40 * UNITS.centsPerM);

    const handed = talk(w, 'pump_agnes', [...gate, 'Hand him the copy.']);
    expect(handed.player.quests.world).toEqual({ marr_regard: 'enemy', pipe_fate: 'seized' });
    expect(handed.player.money).toBe(w.player.money);
  });

  it('charges double to buy off a patrolman who caught the lie', () => {
    const w = parkedAt('dustwell');

    const bought = talk(w, 'pump_agnes', [...ROAD, 'Drive on to the Bowl gate.', LIE, 'Pay him to forget it.', LOCK]);
    expect(questView(bought, QUESTS).choices).toContain(SIGN);
    expect(w.player.money - bought.player.money).toBe(100 * UNITS.centsPerM);
  });

  it('bills a failed meter fit on the top terrace, shuts the terrace and still reaches the lock house', () => {
    const w = parkedAt('dustwell');

    const sheared = talk(w, 'pump_agnes', [...ROAD, 'Drive on to the Bowl gate.', "Slip the older one a few M's.", TERRACE, BOLT]);
    expect(questView(sheared, QUESTS).choices).toEqual([LOCK]);
    expect(w.player.money - sheared.player.money).toBe(90 * UNITS.centsPerM);

    const signed = talk(w, 'pump_agnes', [...ROAD, 'Drive on to the Bowl gate.', "Slip the older one a few M's.", TERRACE, BOLT, LOCK, SIGN]);
    expect(signed.player.quests.world).toEqual({ marr_regard: 'enemy', pipe_fate: 'delivered' });
  });

  it('offers the meter bolt only to a driver who took the meter', () => {
    const w = parkedAt('dustwell');
    const left = [...OPEN, COVER, CARRY, 'Take the copy and leave the meter.', 'Keep the copy.', 'Drive on to the Bowl gate.', "Slip the older one a few M's.", TERRACE];

    expect(questView(talk(w, 'pump_agnes', left), QUESTS).choices).not.toContain(BOLT);
    expect(questView(talk(w, 'pump_agnes', [...ROAD, 'Drive on to the Bowl gate.', "Slip the older one a few M's.", TERRACE]), QUESTS).choices).toContain(BOLT);
  });

  it('takes a fine in the Bowl market and keeps the tenants talking about it', () => {
    const w = parkedAt('dustwell');

    const read = talk(w, 'pump_agnes', [...ROAD, 'Cut the seal and read the copy.', 'Drive on to the Bowl gate.', "Slip the older one a few M's.", 'Read the copy aloud in the market.']);

    expect(read.player.quests.world).toEqual({ marr_regard: 'enemy', pipe_fate: 'read' });
    expect(w.player.money - read.player.money).toBe(90 * UNITS.centsPerM);
  });
});

describe('journal notes', () => {
  it('starts a new player with no notes', () => {
    expect(emptyWorld().player.notes).toEqual([]);
  });

  it('keeps a learned note with the turn it was learned and tells the log once', () => {
    const w = emptyWorld();
    w.turn = 42;

    learnNote(w, 'greenPit');

    expect(w.player.notes).toEqual([{ id: 'greenPit', turn: 42 }]);
    expect(w.events).toEqual([{ t: 'note', id: 'greenPit' }]);
    expect(holdsNote(w, 'greenPit')).toBe(true);
    expect(holdsNote(w, 'glassTank')).toBe(false);
  });

  it('learns a held note again without a change or an event', () => {
    const w = emptyWorld();
    w.turn = 5;
    learnNote(w, 'greenPit');
    w.events = [];
    w.turn += 10;

    learnNote(w, 'greenPit');

    expect(w.player.notes).toEqual([{ id: 'greenPit', turn: 5 }]);
    expect(w.events).toEqual([]);
  });

  it('refuses a note id it does not know', () => {
    const w = emptyWorld();

    expect(() => learnNote(w, 'nonsense' as NoteId)).toThrow(/nonsense/);
    expect(w.player.notes).toEqual([]);
  });

  it('refuses a quest that names a note, site or wreck that does not exist', () => {
    const w = parkedAt('bowl');
    const bad = (text: string) => `INCLUDE world.ink\n=== start ===\n# checkpoint: start\n{${text}: yes}\n+ [Bye.] -> END\n`;
    for (const [text, error] of [['has_note("nonsense")', /names no note nonsense/], ['found("atlantis")', /names no town or location atlantis/], ['searched("story-none")', /No story wreck stock story-none/]] as const) {
      const bundle = compileBundle(withEnglishTwins({ 'world.ink': readQuestSources('src/data/quests')['world.ink'], 'q.ink': bad(text) }));
      expect(() => startQuest(w, bundle, 'q', 'start')).toThrow(error);
    }
  });
});

describe('the Pump Station fuel role', () => {
  const QUEST_DIR = 'src/data/quests';
  const sentencesOf = (text: string) => text.split(/(?<=[.!?])\s+|\n/);
  const waterClaims = (text: string) => sentencesOf(text).filter((s) => /pump[ _-]?station/i.test(s) && /water/i.test(s) && !/track/i.test(s));

  it('says no catalog entry sends water from the Pump Station', () => {
    const claims = Object.entries(EN).flatMap(([key, text]) => waterClaims(String(text)).map((s) => `${key}: ${s}`));
    expect(claims).toEqual([]);
  });

  it('says no English quest line loads water at the Pump Station', () => {
    const files = readdirSync(QUEST_DIR).filter((f) => f.endsWith('.ink'));
    const claims = files.flatMap((f) => waterClaims(readFileSync(`${QUEST_DIR}/${f}`, 'utf8')).map((s) => `${f}: ${s}`));
    expect(claims).toEqual([]);
  });

  it('keeps only the still boss living at the Pump Station and no water made there', () => {
    expect(Object.values(LOCALS).filter((l) => l.town === 'pump-station').map((l) => l.id)).toEqual(['hollis']);
    expect(localsAt('dustwell').map((l) => l.id)).toEqual(['agnes']);
  });
});

describe('site state queries', () => {
  it('tells whether the parked shop runs short of a good', () => {
    const w = parkedAt('granary');
    expect(QUEST_QUERIES.short_of(w, ['grain'])).toBe(false);
    w.shops.granary.goods.grain = 0;
    expect(QUEST_QUERIES.short_of(w, ['grain'])).toBe(true);
  });

  it('tells whether the parked site has its works broken down', () => {
    const w = parkedAt('pump-station');
    expect(QUEST_QUERIES.works_down(w, [])).toBe(false);
    w.shops['pump-station'].event = { kind: 'breakdown', recipe: 'pump', until: w.turn + 100 };
    expect(QUEST_QUERIES.works_down(w, [])).toBe(true);
    w.shops['pump-station'].event = { kind: 'surge', recipe: 'pump', until: w.turn + 100 };
    expect(QUEST_QUERIES.works_down(w, [])).toBe(false);
  });

  it('throws away from a shop, for a good the shop does not trade and at a site whose works never break down', () => {
    expect(() => QUEST_QUERIES.short_of(emptyWorld(), ['grain'])).toThrow(/parked at a shop/);
    expect(() => QUEST_QUERIES.works_down(emptyWorld(), [])).toThrow(/parked at a shop/);
    expect(() => QUEST_QUERIES.short_of(parkedAt('granary'), ['electronics'])).toThrow(/no stock of electronics/);
    expect(() => QUEST_QUERIES.short_of(parkedAt('granary'), ['sand'])).toThrow(/names no good sand/);
    expect(() => QUEST_QUERIES.works_down(parkedAt('granary'), [])).toThrow(/never break down/);
  });
});

describe('site talk', () => {
  const source = (quest: string) => readFileSync(`src/data/quests/${quest}.ink`, 'utf8');
  const questsAt = (shopId: string) => Object.values(LOCALS).filter((l) => l.town === shopId).map((l) => source(l.quest));

  it('gives every site of the production graph a local who asks after each good its works need', () => {
    for (const shopId of Object.keys(SITE_ECONOMY)) {
      const needed = [...new Set(siteRecipes(shopId).flatMap((r) => [...Object.keys(r.inputs), ...r.upkeep]))];
      const canBreak = SITE_EVENTS.some((e) => e.site === shopId && e.kind === 'breakdown');
      const sources = questsAt(shopId);
      expect(sources.length, shopId).toBeGreaterThan(0);
      const asks = sources.some((ink) => needed.every((good) => ink.includes(`short_of("${good}")`)) && (!canBreak || ink.includes('works_down()')));
      expect(asks, `${shopId} needs ${needed.join(', ')}${canBreak ? ' and a breakdown line' : ''}`).toBe(true);
    }
  });

  it('has Odile tell a driver at an empty Granary that the sorgut is low, and say nothing of it at a full one', () => {
    const empty = parkedAt('granary');
    empty.shops.granary.goods.grain = 0;
    const said = (w: World) => questView(talk(w, 'granary_odile', ['What does the Granary make?']), QUESTS).lines.map((l) => l.text).join(' ');
    expect(said(empty)).toContain('Sorgut\'s low');
    expect(said(parkedAt('granary'))).not.toContain('low');
  });
});
