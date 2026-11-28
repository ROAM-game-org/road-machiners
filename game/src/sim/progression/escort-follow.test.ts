import { describe, expect, it } from 'vitest';
import { ESCORT_JOB } from '../../data/market';
import { playerVehicle } from '../damage';
import { followedId } from '../follow';
import { heldEscort, postEscortOffer, type EscortContract } from '../escort-job';
import { acceptContract, siteOf } from '../market';
import { sitePads } from '../sites';
import { addVehicle, emptyWorld, npcBrain } from '../testkit';
import type { World } from '../types';
import { refreshVision } from '../vision';
import { botOrders } from './bot';

function heldWithClient(): { w: World; client: string } {
  const pad = sitePads(siteOf('bowl'))[0];
  const w = emptyWorld(pad);
  const pos = { x: pad.x + 20, y: pad.y };
  const trader = addVehicle(w, 'independent', 'hauler', ['stockEngine'], pos);
  trader.brain = npcBrain('trader', pos, ['trader']);
  trader.brain.goals = [{ kind: 'wait', targetId: null, destination: null, phase: 'act', reason: 'awaitEscort', until: ESCORT_JOB.postTurns }];
  postEscortOffer(w, trader, 'bowl', 'nose');
  const offer = w.shops.bowl.contracts.find((c): c is EscortContract => c.kind === 'escort')!;
  const taken = acceptContract(w, offer.id);
  refreshVision(taken);
  return { w: taken, client: heldEscort(taken)!.client };
}

describe('the hauler bot on an escort job', () => {
  it('follows its client with the Follow command and keeps following', () => {
    const { w, client } = heldWithClient();
    const first = botOrders(w, 'hauler');
    expect(followedId(first.world)).toBe(client);
    const again = botOrders(first.world, 'hauler');
    expect(followedId(again.world)).toBe(client);
    expect(playerVehicle(again.world).direct).toBe(false);
  });

  it('drives beside the client when it cannot follow it', () => {
    const { w, client } = heldWithClient();
    const trader = w.vehicles.find((v) => v.id === client)!;
    trader.pos = { x: trader.pos.x + 900, y: trader.pos.y };
    refreshVision(w);
    const turn = botOrders(w, 'hauler');
    expect(followedId(turn.world)).toBeNull();
    expect(playerVehicle(turn.world).order).toMatchObject({ kind: 'stopAt' });
  });
});
