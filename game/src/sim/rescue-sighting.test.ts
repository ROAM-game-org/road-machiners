import { describe, expect, it } from 'vitest';
import { REGION } from '../data/region';
import { TOPICS } from '../data/dialogue';
import { entryText } from '../text/resolve';
import { lineKey } from '../text/names';
import { callVehicle, canAskTopic, hangUp } from './dialogue';
import { chooseText } from './dialogue-testkit';
import { acceptContract, type Contract } from './market';
import { remember } from './memory';
import { sitePads } from './sites';
import { fuelCap } from './stats';
import { addVehicle, emptyWorld, npcBrain, testDrive } from './testkit';
import type { LineId } from '../data/dialogue';
import type { Vehicle, World } from './types';
import { dist } from './vec';
import { refreshVision } from './vision';
import { endTurn } from './world';

const bowl = REGION.towns.find((t) => t.id === 'bowl')!;
const en = (line: LineId): string => entryText('en', lineKey(line));

function driver(w: World, pos: { x: number; y: number }, name: string): Vehicle {
  const v = addVehicle(w, 'independent', 'scout', ['stockEngine'], pos);
  v.brain = npcBrain('trader', v.pos, ['trader']);
  v.brain.driver = name;
  return v;
}

const rescueOf = (client: Vehicle): Contract => ({
  id: 'ct-r', shop: 'bowl', kind: 'rescue', client: client.id, driver: 'Jed Cobb', need: 'fuel', area: { ...client.pos },
  lead: null, reward: 30, deadline: 900, window: 600, tier: 1, fulfilled: false,
});

function setup() {
  const pad = sitePads(bowl)[0];
  const w = emptyWorld(pad);
  const witness = driver(w, { x: pad.x + 4, y: pad.y }, 'Abe Cobb');
  const client = driver(w, { x: pad.x + 8, y: pad.y }, 'Jed Cobb');
  w.turn = 200;
  client.resources!.fuel = 0;
  witness.resources!.fuel = fuelCap(witness);
  remember(w, client, { kind: 'prices', shop: 'bowl', pressure: {} });
  for (const shop of Object.values(w.shops)) shop.contracts = [];
  w.shops.bowl.contracts = [rescueOf(client)];
  refreshVision(w);
  return { w, pad, witness, client };
}

const asks = (w: World, npcId: string): boolean => canAskTopic(callVehicle(w, npcId), 'lastSeen');

describe('asking about a stranded driver', () => {
  it('offers the question to a witness but not to the stranded driver alone', () => {
    const { w, witness, client } = setup();
    const held = acceptContract(w, 'ct-r');
    expect(asks(held, witness.id)).toBe(true);
    expect(asks(held, client.id)).toBe(false);
  });

  it('tells the witness memory, not the live position, and thanks set the lead', () => {
    const { w, pad, witness, client } = setup();
    let state = acceptContract(w, 'ct-r');
    state.vehicles.find((v) => v.id === witness.id)!.brain!.memories = [];
    for (let i = 0; i < 3; i++) state = endTurn(state, testDrive);
    const remembered = state.vehicles.find((v) => v.id === client.id)!.pos;
    state.vehicles.find((v) => v.id === client.id)!.pos = { x: pad.x + 80, y: pad.y + 80 };
    const told = chooseText(callVehicle(state, witness.id), en(TOPICS.lastSeen.ask!.say));
    const v = told.player.call!.vars.sighting;
    if (v.kind !== 'sightings') throw new Error('sightings expected');
    expect(v.told).toMatchObject([{ contract: 'ct-r', driver: 'Jed Cobb' }]);
    expect(v.told[0].seen).not.toBeNull();
    const xp = told.player.xp;
    const money = told.player.money;
    const noted = hangUp(chooseText(told, 'Thanks. Something else.'));
    const rescue = noted.player.contracts[0];
    if (rescue.kind !== 'rescue') throw new Error('rescue expected');
    expect(rescue.lead!.turn).toBeGreaterThan(200);
    expect(dist(rescue.lead!.at, remembered)).toBeLessThan(10);
    expect(noted.player.xp).toBe(xp);
    expect(noted.player.money).toBe(money);
  });

  it('says a driver who never saw the client missed it, and sets no lead', () => {
    const { w, witness } = setup();
    const state = acceptContract(w, 'ct-r');
    state.vehicles.find((v) => v.id === witness.id)!.brain!.memories = [];
    const told = chooseText(callVehicle(state, witness.id), en(TOPICS.lastSeen.ask!.say));
    const v = told.player.call!.vars.sighting;
    if (v.kind !== 'sightings') throw new Error('sightings expected');
    expect(v.told[0].seen).toBeNull();
    const noted = hangUp(chooseText(told, 'Thanks. Something else.'));
    expect(noted.player.contracts[0]).toMatchObject({ kind: 'rescue', lead: null });
  });
});
