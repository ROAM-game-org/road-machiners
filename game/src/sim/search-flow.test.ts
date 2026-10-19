import { describe, expect, it } from 'vitest';
import { REGION } from '../data/region';
import { TOPICS } from '../data/dialogue';
import { entryText } from '../text/resolve';
import { lineKey } from '../text/names';
import { callVehicle, chooseOption, currentOptions, hangUp } from './dialogue';
import { acceptContract, deliverContract, searchReward, siteOf } from './market';
import { remember } from './memory';
import { sitePads } from './sites';
import { addVehicle, emptyWorld, npcBrain, practiceOf, testDrive } from './testkit';
import type { LineId } from '../data/dialogue';
import type { Vehicle, World } from './types';
import { dist } from './vec';
import { refreshVision } from './vision';
import { playerVehicle } from './damage';
import { handOverParcel, readyHandover } from './parcel';
import { endTurn } from './world';

const bowl = REGION.towns.find((t) => t.id === 'bowl')!;
const en = (line: LineId): string => entryText('en', lineKey(line));

function driver(w: World, pos: { x: number; y: number }, name: string): Vehicle {
  const v = addVehicle(w, 'independent', 'scout', ['stockEngine'], pos);
  v.brain = npcBrain('trader', v.pos, ['trader']);
  v.brain.driver = name;
  return v;
}

function option(w: World, text: string): number {
  const i = currentOptions(w).findIndex((o) => en(o.line) === text);
  if (i < 0) throw new Error(`No option "${text}"`);
  return i;
}

function ask(w: World, npcId: string, line: LineId): World {
  const open = callVehicle(w, npcId);
  return chooseOption(open, option(open, en(line)));
}

describe('a search contract from the board to the pay', () => {
  it('is taken, led by a witness, handed to the target after it pulls over, and claimed', () => {
    const w = emptyWorld(sitePads(bowl)[0]);
    const pad = sitePads(bowl)[0];
    const witness = driver(w, { x: pad.x + 4, y: pad.y }, 'Abe Cobb');
    const target = driver(w, { x: pad.x + 8, y: pad.y }, 'Mack Holt');
    w.turn = 200;
    remember(w, target, { kind: 'prices', shop: 'bowl', pressure: {} });
    for (const shop of Object.values(w.shops)) shop.contracts = [];
    w.shops.bowl.contracts = [{
      id: 'ct-s', shop: 'bowl', kind: 'search', target: target.id, driver: 'Mack Holt', template: 'trader',
      lead: { at: { ...siteOf('bowl').pos }, turn: 200 }, reward: searchReward(), deadline: 900, window: 600, tier: 1, delivered: false,
    }];
    refreshVision(w);

    let state = acceptContract(w, 'ct-s');
    state.vehicles.find((v) => v.id === witness.id)!.brain!.memories = [];
    for (let i = 0; i < 3; i++) state = endTurn(state, testDrive);
    const witnessNow = state.vehicles.find((v) => v.id === witness.id)!;
    expect(witnessNow.brain!.memories.some((m) => m.fact.kind === 'sighting' && m.fact.vehicle === target.id)).toBe(true);

    state.vehicles.find((v) => v.id === target.id)!.pos = { x: pad.x + 60, y: pad.y + 60 };
    const told = ask(state, witness.id, TOPICS.lastSeen.ask!.say);
    const sighting = told.player.call!.vars.sighting;
    expect(sighting).toMatchObject({ kind: 'sighting', driver: 'Mack Holt' });
    if (sighting.kind !== 'sighting' || !sighting.seen) throw new Error('The witness saw nothing');
    expect(sighting.seen.tiles).toBeLessThan(dist(pad, { x: pad.x + 60, y: pad.y + 60 }));
    const noted = hangUp(chooseOption(told, option(told, 'Thanks. Something else.')));
    const lead = noted.player.contracts[0];
    if (lead.kind !== 'search') throw new Error('search expected');
    expect(lead.lead.turn).toBeGreaterThan(200);

    noted.vehicles.find((v) => v.id === target.id)!.pos = { x: pad.x + 8, y: pad.y };
    refreshVision(noted);
    const parcel = playerVehicle(noted).items.find((it) => it.kind === 'parcel');
    expect(parcel).toMatchObject({ kind: 'parcel', contract: 'ct-s' });
    const asked = ask(noted, target.id, TOPICS.parcel.ask!.say);
    let met = chooseOption(asked, option(asked, en('pullingOver')));
    expect(met.player.contracts[0]).toMatchObject({ kind: 'search', delivered: false });
    for (let i = 0; i < 40 && !readyHandover(met); i++) met = endTurn(met, testDrive);
    expect(readyHandover(met)).toMatchObject({ kind: 'handover', holder: target.id });
    expect(() => handOverParcel(met, witness.id)).toThrow();
    met.events = [];
    const done = handOverParcel(met, target.id);
    expect(done.player.contracts[0]).toMatchObject({ kind: 'search', delivered: true });
    expect(playerVehicle(done).items.some((it) => it.kind === 'parcel')).toBe(false);
    expect(done.events.filter((e) => e.t === 'contract')).toEqual([expect.objectContaining({ outcome: 'fulfilled' })]);
    expect(done.events.filter((e) => e.t === 'stateEnded')).toEqual([expect.objectContaining({ ending: 'fulfilled' })]);
    expect(done.states.some((x) => x.kind === 'handover')).toBe(false);

    const money = done.player.money;
    const xp = done.player.xp;
    const paid = deliverContract(done, 'ct-s');
    expect(paid.player.money).toBe(money + searchReward());
    expect(paid.player.xp).toBeGreaterThan(xp);
    expect(practiceOf(paid, 'contract')).toHaveLength(1);
    expect(paid.player.contracts).toEqual([]);
    expect(paid.events.filter((e) => e.t === 'money')).toEqual([{ t: 'money', amount: searchReward(), reason: { kind: 'contract' } }]);
  });
});
