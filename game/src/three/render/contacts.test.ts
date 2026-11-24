import { afterEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Group, Mesh, MeshBasicMaterial } from 'three';
import { PHYSICS } from '../../data/physics';
import { heightAt } from '../../sim/terrain';
import { PAL } from '../../render/palette';
import { clockOf } from '../../sim/sun';
import { emptyWorld } from '../../sim/testkit';
import type { Contact } from '../../sim/types';
import { ContactsView } from './contacts';
import { TUNING } from './inkTuning';
import { CONTACT_BIT } from './models';

function look(view: ContactsView, name: 'contact-blip' | 'contact-ghost', index = 0): Group {
  const marker = view.root.children[index] as Group;
  return marker.children.find((o) => o.name === name) as Group;
}

function colorsOf(group: Group): number[] {
  return group.children.map((o) => ((o as Mesh).material as MeshBasicMaterial).color.getHex());
}

describe('the contact mark', () => {
  const w = emptyWorld();
  const at = { x: 30, y: 30 };
  const S = PHYSICS.metersPerTile;
  const contact = (sources: Contact['sources'], vehicleId = 'v9', center = { x: 40, y: 40 }, radius = 8): Contact => ({ vehicleId, center, radius, sources, loudness: null });
  const original = TUNING.fxInk.value;
  afterEach(() => {
    TUNING.fxInk.value = original;
  });

  it.each([['far'], ['sound']] as const)('draws no mark for a %s contact alone', (source) => {
    TUNING.fxInk.value = 1;
    const view = new ContactsView();
    view.update(w.terrain, [contact([source])], at, w.turn, 0);
    expect(look(view, 'contact-blip').visible).toBe(false);
    expect(look(view, 'contact-ghost').visible).toBe(false);
  });

  it.each([[['radio', 'far']], [['flare']], [['radio', 'flare']]] as const)('shows %j as a ghost when ink effects are on', (sources) => {
    TUNING.fxInk.value = 1;
    const view = new ContactsView();
    view.update(w.terrain, [contact([...sources])], at, w.turn, 0);
    expect(look(view, 'contact-blip').visible).toBe(false);
    expect(look(view, 'contact-ghost').visible).toBe(true);
  });

  it('brings the old blip back when ink effects are off', () => {
    TUNING.fxInk.value = 0;
    const view = new ContactsView();
    view.update(w.terrain, [contact(['radio', 'far'], 'a'), contact(['flare'], 'b')], at, w.turn, 0);
    expect(look(view, 'contact-ghost', 0).visible).toBe(false);
    expect(look(view, 'contact-ghost', 1).visible).toBe(false);
    expect(colorsOf(look(view, 'contact-blip', 0))).toEqual([PAL.radio, PAL.radio]);
    expect(colorsOf(look(view, 'contact-blip', 1))).toEqual([PAL.flare.marker, PAL.flare.marker]);
  });

  it('gives every contact the same form, size and axis', () => {
    TUNING.fxInk.value = 1;
    const view = new ContactsView();
    view.update(w.terrain, [contact(['radio'], 'a', { x: 40, y: 40 }, 3), contact(['flare'], 'b', { x: 70, y: 52 }, 20)], at, w.turn, 0);
    const [a, b] = [look(view, 'contact-ghost', 0) as unknown as Mesh, look(view, 'contact-ghost', 1) as unknown as Mesh];
    expect(a.geometry).toBe(b.geometry);
    expect(a.material).toBe(b.material);
    expect(a.rotation.toArray()).toEqual(b.rotation.toArray());
    expect(a.scale.toArray()).toEqual(b.scale.toArray());
  });

  it('stands at the contact center on the terrain and holds its axis between turns', () => {
    TUNING.fxInk.value = 1;
    const view = new ContactsView();
    view.update(w.terrain, [contact(['radio'])], at, w.turn, 0);
    const ghost = look(view, 'contact-ghost');
    const axis = ghost.rotation.toArray();
    expect(ghost.position.x).toBeCloseTo(40 * S);
    expect(ghost.position.z).toBeCloseTo(40 * S);
    expect(ghost.position.y).toBeCloseTo(heightAt(w.terrain, 40, 40) * S);
    view.update(w.terrain, [contact(['radio'], 'v9', { x: 44, y: 41 })], at, w.turn + 1, 50000);
    expect(ghost.position.x).toBeCloseTo(44 * S);
    expect(ghost.position.z).toBeCloseTo(41 * S);
    expect(ghost.rotation.toArray()).toEqual(axis);
  });

  it('shares geometry and material and survives a removal', () => {
    TUNING.fxInk.value = 1;
    const view = new ContactsView();
    view.update(w.terrain, [contact(['radio'], 'a')], at, w.turn, 0);
    const first = look(view, 'contact-ghost') as unknown as Mesh;
    const resources = [first.geometry, first.material as THREE.Material];
    let disposed = 0;
    for (const r of resources) r.addEventListener('dispose', () => disposed++);
    view.update(w.terrain, [], at, w.turn, 100);
    view.update(w.terrain, [contact(['radio'], 'c')], at, w.turn, 200);
    const second = look(view, 'contact-ghost') as unknown as Mesh;
    expect([second.geometry, second.material]).toEqual(resources);
    expect(disposed).toBe(0);
  });

  it('draws a flat tint that stencils each pixel once', () => {
    TUNING.fxInk.value = 1;
    const view = new ContactsView();
    view.update(w.terrain, [contact(['radio'])], at, w.turn, 0);
    const material = (look(view, 'contact-ghost') as unknown as Mesh).material as MeshBasicMaterial;
    expect(material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(material.opacity).toBe(PAL.contactGhost.opacity);
    expect(material.transparent).toBe(true);
    expect([material.depthTest, material.depthWrite]).toEqual([false, false]);
    expect(material.stencilWrite).toBe(true);
    expect([material.stencilRef, material.stencilFuncMask, material.stencilWriteMask]).toEqual([CONTACT_BIT, CONTACT_BIT, CONTACT_BIT]);
    expect(material.stencilFunc).toBe(THREE.NotEqualStencilFunc);
    expect(material.stencilZPass).toBe(THREE.ReplaceStencilOp);
  });

  it('stands paler by day and dimmer at night, and holds still within a turn', () => {
    TUNING.fxInk.value = 1;
    const turnAt = (hour: number): number => Array.from({ length: 4000 }, (_, t) => t).find((t) => Math.abs(clockOf(t).hour - hour) < 0.3)!;
    const view = new ContactsView();
    const tint = (turn: number, nowMs: number): number => {
      view.update(w.terrain, [contact(['radio'])], at, turn, nowMs);
      return ((look(view, 'contact-ghost') as unknown as Mesh).material as MeshBasicMaterial).color.getHex();
    };
    const noon = tint(turnAt(12), 0);
    expect(noon).toBe(PAL.contactGhost.color);
    expect(tint(turnAt(12), 5000)).toBe(noon);
    const night = new THREE.Color(tint(turnAt(23), 6000));
    expect(night.r + night.g + night.b).toBeLessThan(new THREE.Color(noon).r + new THREE.Color(noon).g + new THREE.Color(noon).b);
  });
});
