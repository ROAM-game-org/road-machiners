import { describe, expect, it } from 'vitest';
import type { Group, Mesh, MeshBasicMaterial } from 'three';
import { PAL } from '../../render/palette';
import { emptyWorld } from '../../sim/testkit';
import type { Contact } from '../../sim/types';
import { ContactsView } from './contacts';

function blipOf(view: ContactsView): Group {
  const marker = view.root.children[0] as Group;
  return marker.children.at(-1) as Group;
}

function colorsOf(blip: Group): number[] {
  return blip.children.map((o) => ((o as Mesh).material as MeshBasicMaterial).color.getHex());
}

describe('the contact blip', () => {
  const w = emptyWorld();
  const contact = (sources: Contact['sources']): Contact => ({ vehicleId: 'v9', center: { x: 40, y: 40 }, radius: 8, sources, loudness: null });

  it('draws no blip for a far contact alone', () => {
    const view = new ContactsView();
    view.update(w.terrain, [contact(['far'])], { x: 30, y: 30 }, w.turn, 0);
    expect(blipOf(view).visible).toBe(false);
  });

  it('keeps a radio contact in the radio colour when it is also far', () => {
    const view = new ContactsView();
    view.update(w.terrain, [contact(['radio', 'far'])], { x: 30, y: 30 }, w.turn, 0);
    expect(colorsOf(blipOf(view))).toEqual([PAL.radio, PAL.radio]);
  });

  it('draws no blip for a sound contact alone', () => {
    const view = new ContactsView();
    view.update(w.terrain, [contact(['sound'])], { x: 30, y: 30 }, w.turn, 0);
    expect(blipOf(view).visible).toBe(false);
  });
});
