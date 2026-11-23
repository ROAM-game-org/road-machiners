import { afterEach, describe, expect, it } from 'vitest';
import type { Group, Mesh, MeshBasicMaterial } from 'three';
import { PHYSICS } from '../../data/physics';
import { heightAt } from '../../sim/terrain';
import { PAL } from '../../render/palette';
import { emptyWorld } from '../../sim/testkit';
import type { Contact } from '../../sim/types';
import { ContactsView } from './contacts';
import { TUNING } from './inkTuning';

function look(view: ContactsView, name: 'contact-blip' | 'contact-ink', index = 0): Group {
  const marker = view.root.children[index] as Group;
  return marker.children.find((o) => o.name === name) as Group;
}

function colorsOf(group: Group): number[] {
  return group.children.map((o) => ((o as Mesh).material as MeshBasicMaterial).color.getHex());
}

describe('the contact mark', () => {
  const w = emptyWorld();
  const at = { x: 30, y: 30 };
  const contact = (sources: Contact['sources'], vehicleId = 'v9', center = { x: 40, y: 40 }): Contact => ({ vehicleId, center, radius: 8, sources, loudness: null });
  const original = TUNING.fxInk.value;
  afterEach(() => {
    TUNING.fxInk.value = original;
  });

  it('draws no mark for a far contact alone', () => {
    const view = new ContactsView();
    view.update(w.terrain, [contact(['far'])], at, w.turn, 0);
    expect(look(view, 'contact-blip').visible).toBe(false);
    expect(look(view, 'contact-ink').visible).toBe(false);
  });

  it('draws no mark for a sound contact alone', () => {
    const view = new ContactsView();
    view.update(w.terrain, [contact(['sound'])], at, w.turn, 0);
    expect(look(view, 'contact-blip').visible).toBe(false);
    expect(look(view, 'contact-ink').visible).toBe(false);
  });

  it('prints a radio contact as the ink mark when ink effects are on', () => {
    TUNING.fxInk.value = 1;
    const view = new ContactsView();
    view.update(w.terrain, [contact(['radio', 'far'])], at, w.turn, 0);
    expect(look(view, 'contact-blip').visible).toBe(false);
    const ink = look(view, 'contact-ink');
    expect(ink.visible).toBe(true);
    const colors = new Set(colorsOf(ink));
    expect(colors).toEqual(new Set([PAL.contactMark.radio.deep, PAL.contactMark.radio.pale]));
  });

  it('brings the old blip back when ink effects are off', () => {
    TUNING.fxInk.value = 0;
    const view = new ContactsView();
    view.update(w.terrain, [contact(['radio', 'far'])], at, w.turn, 0);
    expect(look(view, 'contact-ink').visible).toBe(false);
    expect(colorsOf(look(view, 'contact-blip'))).toEqual([PAL.radio, PAL.radio]);
  });

  it('inks a flare contact in flare inks, and radio wins over flare', () => {
    TUNING.fxInk.value = 1;
    const view = new ContactsView();
    view.update(w.terrain, [contact(['flare'], 'a'), contact(['radio', 'flare'], 'b')], at, w.turn, 0);
    expect(new Set(colorsOf(look(view, 'contact-ink', 0)))).toEqual(new Set([PAL.contactMark.flare.deep, PAL.contactMark.flare.pale]));
    expect(new Set(colorsOf(look(view, 'contact-ink', 1)))).toEqual(new Set([PAL.contactMark.radio.deep, PAL.contactMark.radio.pale]));
  });

  it('sits at the contact center on the terrain', () => {
    TUNING.fxInk.value = 1;
    const view = new ContactsView();
    view.update(w.terrain, [contact(['radio'])], at, w.turn, 0);
    const p = look(view, 'contact-ink').position;
    const S = PHYSICS.metersPerTile;
    expect(p.x).toBeCloseTo(40 * S);
    expect(p.z).toBeCloseTo(40 * S);
    expect(p.y).toBeCloseTo(heightAt(w.terrain, 40, 40) * S + 0.08);
  });

  it('keeps the stroke turn of a mark steady and different per id', () => {
    TUNING.fxInk.value = 1;
    const view = new ContactsView();
    view.update(w.terrain, [contact(['radio'], 'a'), contact(['radio'], 'b')], at, w.turn, 0);
    const first = [look(view, 'contact-ink', 0).rotation.y, look(view, 'contact-ink', 1).rotation.y];
    view.update(w.terrain, [contact(['radio'], 'a', { x: 44, y: 41 }), contact(['radio'], 'b', { x: 50, y: 52 })], at, w.turn + 3, 50000);
    expect([look(view, 'contact-ink', 0).rotation.y, look(view, 'contact-ink', 1).rotation.y]).toEqual(first);
    expect(first[0]).not.toBe(first[1]);
  });

  it('shares geometry and materials between marks and survives a removal', () => {
    TUNING.fxInk.value = 1;
    const view = new ContactsView();
    view.update(w.terrain, [contact(['radio'], 'a')], at, w.turn, 0);
    const before = look(view, 'contact-ink').children.map((o) => [(o as Mesh).geometry, (o as Mesh).material]);
    let disposed = 0;
    for (const [g, m] of before) {
      (g as { addEventListener: (t: string, f: () => void) => void }).addEventListener('dispose', () => disposed++);
      (m as { addEventListener: (t: string, f: () => void) => void }).addEventListener('dispose', () => disposed++);
    }
    view.update(w.terrain, [], at, w.turn, 100);
    view.update(w.terrain, [contact(['radio'], 'c')], at, w.turn, 200);
    const after = look(view, 'contact-ink').children.map((o) => [(o as Mesh).geometry, (o as Mesh).material]);
    expect(after).toEqual(before);
    expect(disposed).toBe(0);
  });
});
