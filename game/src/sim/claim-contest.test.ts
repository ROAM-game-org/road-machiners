import { beforeAll, describe, expect, it } from 'vitest';
import { START_KITS } from '../data/start';
import { relicClaimWorld, type RelicClaimWorld } from '../test/relic-claim';
import { TEST_MAP } from '../test/map';
import { playerBid } from './claim-bid';
import { onRelicSeen } from './claim-contest';
import { carriesPart } from './claims';
import { robbing } from './states';
import { topGoal } from './npc-activities';
import { defaultSetup } from './settings';
import { forceOption, rngStateForForcedRolls } from './testkit';
import type { World } from './types';
import { newWorld } from './world';

let real: World;

beforeAll(() => {
  real = newWorld(1, START_KITS.standard, TEST_MAP, defaultSetup('roaming'), false);
});

function contest(): RelicClaimWorld {
  const scene = relicClaimWorld(real);
  scene.w.rngState = rngStateForForcedRolls(1);
  return scene;
}

describe('a claim rival that sees the relic on the player', () => {
  it('offers to buy it when it picks buying', () => {
    forceOption('claimContest', 'buy');
    const { w, rival, me } = contest();
    onRelicSeen(w, rival);
    expect(playerBid(w)?.holder).toBe(rival.id);
    expect(carriesPart(me, w.player.contracts[0].kind === 'claim' ? w.player.contracts[0].partId : '')).toBe(true);
  });

  it('gives up out loud when it picks giving up', () => {
    forceOption('claimContest', 'giveUp');
    const { w, rival, claim } = contest();
    onRelicSeen(w, rival);
    expect(rival.brain!.goals.some((g) => g.kind === 'claim')).toBe(false);
    expect(w.events).toContainEqual({ t: 'claimRivalQuit', contract: claim.id, vehicle: rival.id });
    expect(playerBid(w)).toBeNull();
  });

  it('decides once per sighting', () => {
    forceOption('claimContest', 'buy');
    const { w, rival, me } = contest();
    onRelicSeen(w, rival);
    expect(Object.keys(rival.brain!.noticed)).toContain(`claimContest:${me.id}`);
    const bid = playerBid(w)!;
    onRelicSeen(w, rival);
    expect(playerBid(w)).toBe(bid);
  });

  it('decides nothing while it is still on the search leg', () => {
    forceOption('claimContest', 'giveUp');
    const { w, rival, claim } = contest();
    const goal = topGoal(rival)!;
    goal.targetId = claim.stockId;
    onRelicSeen(w, rival);
    expect(rival.brain!.goals.some((g) => g.kind === 'claim')).toBe(true);
    expect(rival.brain!.noticed).toEqual({});
  });

  it('decides nothing when the player does not carry the relic', () => {
    forceOption('claimContest', 'giveUp');
    const { w, rival, me } = contest();
    me.items = me.items.filter((it) => it.kind !== 'part');
    onRelicSeen(w, rival);
    expect(rival.brain!.goals.some((g) => g.kind === 'claim')).toBe(true);
  });

  it('decides nothing for a rival that cannot see the player', () => {
    forceOption('claimContest', 'giveUp');
    const { w, rival, me } = contest();
    rival.pos = { x: me.pos.x + 400, y: me.pos.y };
    onRelicSeen(w, rival);
    expect(rival.brain!.noticed).toEqual({});
  });

  it('takes the relic by force when it picks that and its nature allows robbing', () => {
    forceOption('claimContest', 'takeIt');
    const scene = contest();
    onRelicSeen(scene.w, scene.rival);
    expect(robbing(scene.w, scene.rival.id, scene.me.id)).toBe(true);
  });

  it('never robs for a rival whose nature forbids it, even when taking is the only wish', () => {
    forceOption('claimContest', 'takeIt');
    const scene = contest();
    scene.rival.brain!.traits = ['lawman'];
    onRelicSeen(scene.w, scene.rival);
    expect(robbing(scene.w, scene.rival.id, scene.me.id)).toBe(false);
  });
});
