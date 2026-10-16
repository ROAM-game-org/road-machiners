import { describe, expect, it } from 'vitest';
import { playerVehicle } from '../damage';
import { makePart } from '../factory';
import { RunStream, type StreamLine } from '../run-stream';
import { addVehicle, emptyWorld } from '../testkit';
import type { GameEvent, World } from '../types';
import { refreshVision } from '../vision';
import { cloneWorld } from '../world';
import { linearize, skippedBeforeSession, STALL_TURNS, timeline } from './run-timeline';

const CTX = { runId: 'test', version: 'test', sessionId: 's1' };

function line(kind: string, turn: number, rest: Record<string, unknown> = {}): StreamLine {
  return { kind, turn, ...rest };
}

function advance(world: World, change: (w: World) => void = () => {}): World {
  const out = cloneWorld(world);
  out.turn += 1;
  out.events = [];
  change(out);
  return out;
}

function shot(shooter: string, target: string): GameEvent {
  const hits = [{ part: 'p1', damage: 7 }];
  return { t: 'shot', shooter, weapon: 'mg', target, aim: 'body', chance: 1, damageChance: 1, side: 'front', rounds: [{ hit: true, crit: false, offset: 0, struck: 'p1', hits, blast: [], burst: null }] };
}

function story(): StreamLine[] {
  let world = emptyWorld();
  world.turn = 3;
  const foe = addVehicle(world, 'scrapjaw', 'buggy', ['mg'], { x: 38, y: 30 });
  refreshVision(world);
  const stream = new RunStream(CTX);
  const lines = stream.begin(world, 'new');
  const me = playerVehicle(world).id;
  const fire = (events: GameEvent[], change?: (w: World) => void) => {
    world = advance(world, change);
    lines.push(...stream.step(world, events));
  };
  fire([shot(foe.id, me), shot(me, foe.id)], (w) => { playerVehicle(w).order = { kind: 'brake' }; });
  fire([shot(foe.id, me)]);
  for (let i = 0; i < STALL_TURNS + 2; i++) fire([]);
  fire([], (w) => {
    w.player.money -= 150;
    playerVehicle(w).items.push({ ...playerVehicle(w).items[0], id: 'bought', kind: 'part', part: makePart(w, 'mg', 0) });
  });
  return lines;
}

describe('linearize', () => {
  it('drops the records a load rewinds past and keeps the ones at the load turn', () => {
    const lines = [line('session', 1), line('moves', 5), line('moves', 9), line('session', 5), line('moves', 6)];
    expect(linearize(lines).map((l) => `${l.kind}${l.turn}`)).toEqual(['session1', 'moves5', 'session5', 'moves6']);
  });

  it('drops the records of an older build that come before the first session', () => {
    const old = [line('start', 1), line('change', 2, { money: 5 }), line('event', 3, { event: 'money' })];
    const lines = [line('header', 0), ...old, line('session', 4), line('player', 4)];
    expect(linearize(lines).map((l) => l.kind)).toEqual(['session', 'player']);
    expect(skippedBeforeSession(lines)).toBe(3);
  });

  it('keeps the records of a tab that goes on after another tab started a session', () => {
    const lines = [line('session', 1, { sid: 'a' }), line('moves', 9, { sid: 'a' }), line('session', 5, { sid: 'b' }), line('moves', 10, { sid: 'a' }), line('moves', 6, { sid: 'b' })];
    expect(linearize(lines).map((l) => `${l.sid}${l.kind}${l.turn}`)).toEqual(['asession1', 'amoves9', 'bsession5', 'amoves10', 'bmoves6']);
  });

  it('drops a finished boot that a later boot rewound past', () => {
    const lines = [line('session', 1, { sid: 'a' }), line('moves', 9, { sid: 'a' }), line('session', 5, { sid: 'b' }), line('moves', 6, { sid: 'b' })];
    expect(linearize(lines).map((l) => `${l.sid}${l.kind}${l.turn}`)).toEqual(['asession1', 'bsession5', 'bmoves6']);
  });

  it('skips the export header', () => {
    expect(linearize([line('header', 0), line('session', 1)]).map((l) => l.kind)).toEqual(['session']);
  });
});

describe('timeline', () => {
  it('prints the arrival, the merged fight, the order, the stall and the purchase', () => {
    const text = timeline(story(), 'day').join('\n');
    expect(text).toContain('in view at start');
    expect(text).toMatch(/fight T4-T5.*fired 2 rounds, 2 hits, 14 damage/);
    expect(text).toMatch(/order brake/);
    expect(text).toMatch(/made no progress.*hits taken/);
    expect(text).toMatch(/holdings changed: money -150.*gained mg/);
  });

  it('does not report the trucks of a reload keyframe as arrivals', () => {
    const lines = story();
    const again = new RunStream(CTX);
    const world = emptyWorld();
    world.turn = 3;
    addVehicle(world, 'scrapjaw', 'buggy', ['mg'], { x: 38, y: 30 });
    refreshVision(world);
    const reload = [...lines, ...again.begin({ ...world, turn: 3 }, 'auto')];
    const came = timeline(reload, 'day').filter((l) => l.includes('came into view'));
    expect(came).toEqual([]);
  });

  it('splits the story at each road opening when grouped by stretch', () => {
    const lines = [line('session', 1, { from: 'new', mode: 'x', seed: 1, version: 'v' }), line('event', 4, { t: 'roadOpened', stretch: 2 })];
    expect(timeline(lines, 'stretch').filter((l) => l.startsWith('=='))).toEqual(['== Before the first road opening ==', '== Stretch 2 ==']);
  });
});
