import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { perfSnapshot, resetPerf } from '../../../perf';
import { CARD_SHAPES, CLUMP_FIRST, CLUMP_SHAPES, ROUND_SHAPE, type Card, type CardBatch } from './cards';
import { TUNING } from '../inkTuning';
import { alphaAt, colorAt, FAR_COUNTER, OVERWRITE_COUNTER, Particles, sizeAt, type ParticleLook } from './particles';

const LOOK: ParticleLook = { life: 1, size: { from: 1, to: 3 }, colors: [0xff0000, 0x0000ff], alpha: { peak: 0.6, fadeIn: 0.2 }, drag: 0, gravity: 0, streak: 0, form: 'cloud' };
const AT = { x: 0, y: 0, z: 0 };
const STILL = { x: 0, y: 0, z: 0 };
const NEAR = () => true;

class RecordingBatch {
  cards: Card[] = [];
  slot(): Card {
    const card: Card = { x: 0, y: 0, z: 0, size: 0, spin: 0, shape: 0, r: 0, g: 0, b: 0, alpha: 0, sx: 0, sy: 0, sz: 0 };
    this.cards.push(card);
    return card;
  }
}

function drawn(p: Particles): Card[] {
  const batch = new RecordingBatch() as unknown as CardBatch;
  p.draw({ main: batch, plumes: batch, fire: batch }, 0);
  return (batch as unknown as RecordingBatch).cards;
}

describe('particle curves', () => {
  it('grows size from its start to its end', () => {
    expect(sizeAt(LOOK, 0)).toBe(1);
    expect(sizeAt(LOOK, 1)).toBe(3);
    expect(sizeAt(LOOK, 0.5)).toBeGreaterThan(2);
  });

  it('fades alpha in to its peak, then out to zero', () => {
    expect(alphaAt(LOOK, 0)).toBe(0);
    expect(alphaAt(LOOK, 0.2)).toBeCloseTo(0.6);
    expect(alphaAt(LOOK, 1)).toBeCloseTo(0);
    expect(alphaAt(LOOK, 0.6)).toBeLessThan(0.6);
  });

  it('blends color keys spread evenly over life', () => {
    const keys = [new THREE.Color(1, 0, 0), new THREE.Color(0, 1, 0), new THREE.Color(0, 0, 1)];
    const out = new THREE.Color();
    expect(colorAt(keys, 0, out).r).toBe(1);
    expect(colorAt(keys, 0.5, out).g).toBe(1);
    expect(colorAt(keys, 0.75, out).b).toBeCloseTo(0.5);
    expect(colorAt(keys, 1, out).b).toBe(1);
  });
});

describe('Particles', () => {
  beforeEach(() => resetPerf());

  it('spawns nothing out of the live range and counts the skip', () => {
    const p = new Particles(4, (at) => at.x < 10);
    p.spawn({ x: 5, y: 0, z: 0 }, STILL, LOOK, 1);
    p.spawn({ x: 50, y: 0, z: 0 }, STILL, LOOK, 1);
    expect(p.alive()).toBe(1);
    expect(perfSnapshot()[FAR_COUNTER].calls).toBe(1);
  });

  it('reuses the oldest slot when full and counts the overwrite', () => {
    const p = new Particles(2, NEAR);
    p.spawn({ x: 1, y: 0, z: 0 }, STILL, LOOK, 1);
    p.spawn({ x: 2, y: 0, z: 0 }, STILL, LOOK, 1);
    p.spawn({ x: 3, y: 0, z: 0 }, STILL, LOOK, 1);
    expect(p.alive()).toBe(2);
    expect(drawn(p).map((c) => c.x).sort()).toEqual([2, 3]);
    expect(perfSnapshot()[OVERWRITE_COUNTER].calls).toBe(1);
  });

  it('frees a particle at the end of its life', () => {
    const p = new Particles(4, NEAR);
    p.spawn(AT, STILL, LOOK, 1);
    p.tick(LOOK.life * 1.21);
    expect(p.alive()).toBe(0);
    expect(drawn(p)).toEqual([]);
  });

  it.each([
    ['cloud', 0, CARD_SHAPES],
    ['round', ROUND_SHAPE, ROUND_SHAPE + 1],
    ['clump', CLUMP_FIRST, CLUMP_FIRST + CLUMP_SHAPES],
  ] as const)('gives a %s particle only its own shapes', (form, first, end) => {
    const p = new Particles(64, NEAR);
    for (let i = 0; i < 64; i++) p.spawn(AT, STILL, { ...LOOK, form }, 1);
    for (const card of drawn(p)) {
      expect(card.shape).toBeGreaterThanOrEqual(first);
      expect(card.shape).toBeLessThan(end);
    }
  });

  it('moves a particle by its velocity and gravity', () => {
    const p = new Particles(1, NEAR);
    p.spawn(AT, { x: 1, y: 0, z: 0 }, { ...LOOK, gravity: -1 }, 1);
    p.tick(0.5);
    const [card] = drawn(p);
    expect(card.x).toBeGreaterThan(0.4);
    expect(card.y).toBeGreaterThan(0);
  });
});

describe('fire turning into smoke', () => {
  const SMOKE: ParticleLook = { ...LOOK, life: 3 };
  const FIRE: ParticleLook = { ...LOOK, form: 'round', becomes: { look: SMOKE, share: 1, scale: 2, spread: 0, keepSpeed: 0.5 } };

  it('hands a dying fire particle to the smoke pool where it died', () => {
    const fire = new Particles(4, NEAR);
    const smoke = new Particles(4, NEAR);
    fire.handOff(smoke);
    fire.spawn(AT, { x: 1, y: 0, z: 0 }, FIRE, 1);
    fire.tick(0.5);
    fire.tick(1);
    expect(fire.alive()).toBe(0);
    expect(smoke.alive()).toBe(1);
    const [card] = drawn(smoke);
    expect(card.x).toBeCloseTo(0.5);
    expect(card.size).toBeCloseTo(2 * sizeAt(SMOKE, 0));
  });

  it('lets fire die without smoke when nothing takes the hand-off', () => {
    const fire = new Particles(4, NEAR);
    fire.spawn(AT, STILL, FIRE, 1);
    fire.tick(2);
    expect(fire.alive()).toBe(0);
  });
});

describe('smoke breeze', () => {
  function driftOf(form: ParticleLook['form']): number {
    const p = new Particles(1, NEAR);
    p.spawn(AT, STILL, { ...LOOK, life: 10, form }, 1);
    for (let i = 0; i < 30; i++) p.tick(0.1);
    return drawn(p)[0].x;
  }

  it('carries smoke billows downwind as they rise', () => {
    expect(driftOf('cloud')).toBeGreaterThan(1);
  });

  it('leaves dust haze where the wheels threw it', () => {
    expect(driftOf('haze')).toBe(0);
  });
});

describe('ink billow tone', () => {
  function toneAt(t: number, ink: number): number {
    const p = new Particles(1, NEAR);
    p.spawn(AT, STILL, { ...LOOK, life: 10, colors: [0x808080, 0x808080] }, 1);
    p.tick(t * 7);
    const batch = new RecordingBatch();
    const to = batch as unknown as CardBatch;
    p.draw({ main: to, plumes: to, fire: to }, ink);
    return batch.cards[0].r;
  }

  it('starts darker and pales as a billow rises and ages', () => {
    expect(toneAt(0.05, 1)).toBeLessThan(toneAt(0.05, 0));
    expect(toneAt(0.9, 1)).toBeGreaterThan(toneAt(0.05, 1));
  });

  it('leaves the soft look untouched', () => {
    expect(toneAt(0.9, 0)).toBeCloseTo(new THREE.Color(0x808080).r);
  });
});

describe('ink smoke size and fading looks', () => {
  function cardAt(look: ParticleLook, ink: number): Card {
    const p = new Particles(1, NEAR);
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const was = TUNING.fxInk.value;
    TUNING.fxInk.value = ink;
    p.spawn(AT, STILL, look, 1);
    TUNING.fxInk.value = was;
    random.mockRestore();
    p.tick(0.5);
    const batch = new RecordingBatch();
    const to = batch as unknown as CardBatch;
    p.draw({ main: to, plumes: to, fire: to }, ink);
    return batch.cards[0];
  }

  it('draws smoke at the smoke size knob share at full ink and at full size with ink off', () => {
    const smoke: ParticleLook = { ...LOOK, smoke: true };
    expect(cardAt(smoke, 1).size).toBeCloseTo(cardAt(LOOK, 1).size * TUNING.smokeSize.value);
    expect(cardAt(smoke, 0).size).toBeCloseTo(cardAt(LOOK, 0).size);
  });

  it('keeps cards that are not smoke at full size at full ink', () => {
    expect(cardAt(LOOK, 1).size).toBeCloseTo(cardAt(LOOK, 0).size);
  });

  it('draws an ink off look only with ink off and an ink on look only with ink on', () => {
    const off: ParticleLook = { ...LOOK, onlyIn: 'inkOff' };
    const on: ParticleLook = { ...LOOK, onlyIn: 'inkOn' };
    expect(cardAt(off, 0).alpha).toBeCloseTo(cardAt(LOOK, 0).alpha);
    expect(cardAt(on, 1).alpha).toBeCloseTo(cardAt(LOOK, 1).alpha);
  });

  it('does not spend a slot on a look its ink setting hides', () => {
    const p = new Particles(1, NEAR);
    const was = TUNING.fxInk.value;
    TUNING.fxInk.value = 1;
    p.spawn(AT, STILL, { ...LOOK, onlyIn: 'inkOff' }, 1);
    TUNING.fxInk.value = 0;
    p.spawn(AT, STILL, { ...LOOK, onlyIn: 'inkOn' }, 1);
    TUNING.fxInk.value = was;
    expect(drawn(p)).toHaveLength(0);
  });

  it('sends burning looks to the fire batch and the rest to the main batch', () => {
    const p = new Particles(2, NEAR);
    p.spawn(AT, STILL, { ...LOOK, burns: true }, 1);
    p.spawn(AT, STILL, LOOK, 1);
    const main = new RecordingBatch();
    const fire = new RecordingBatch();
    p.draw({ main: main as unknown as CardBatch, plumes: main as unknown as CardBatch, fire: fire as unknown as CardBatch }, 1);
    expect(fire.cards).toHaveLength(1);
    expect(main.cards).toHaveLength(1);
  });
});
