import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ARMOR_LOOK, ARMOR_SURFACE, armorGrade, armorTone, lookOfArmor, RAM_SURFACE } from './armorLook';

function partOf(materials: string[]): THREE.Group {
  const group = new THREE.Group();
  for (const name of materials) group.add(new THREE.Mesh(new THREE.BoxGeometry(), Object.assign(new THREE.MeshLambertMaterial({ color: 0xff00ff }), { name })));
  return group;
}

function looks(group: THREE.Group): [string, number][] {
  return group.children.map((o) => {
    const material = (o as THREE.Mesh).material as THREE.MeshLambertMaterial;
    return [material.name, material.color.getHex()];
  });
}

describe('armorGrade', () => {
  it('sorts every armor family and puts every accessory with the rams', () => {
    expect(['steelPlate', 'plates', 'spacedTile', 'spacedArmor', 'scrapPanels', 'ceramicPlates', 'cage', 'reinforcedCage'].map(armorGrade)).toEqual(['steel', 'steel', 'spaced', 'spaced', 'scrap', 'ceramic', 'cage', 'cage']);
    expect(['ram', 'plowRam', 'claymoreRam', 'spikeStrip', 'spikeCluster'].map(armorGrade)).toEqual(['ram', 'ram', 'ram', 'ram', 'ram']);
  });

  it('refuses a part that is not armor', () => {
    expect(() => armorGrade('mg')).toThrow(/not armor/);
  });
});

describe('lookOfArmor', () => {
  it('gives spaced armor blue panels on a dark wall', () => {
    const part = partOf(['paint', 'metal']);
    lookOfArmor(part, 'spacedArmor');
    expect(looks(part)).toEqual([[ARMOR_SURFACE, ARMOR_LOOK.spaced.panel], [ARMOR_SURFACE, ARMOR_LOOK.spaced.wall]]);
  });

  it('paints the ram strip orange on the ram surface and keeps its own colors', () => {
    const part = partOf(['paint', 'metal', 'mustard']);
    lookOfArmor(part, 'claymoreRam');
    expect(looks(part)).toEqual([[RAM_SURFACE, ARMOR_LOOK.ram.strip], [RAM_SURFACE, ARMOR_LOOK.steel], ['mustard', 0xff00ff]]);
  });

  it('never leaves the faction paint on armor', () => {
    expect(armorTone('steel', 'paint')).not.toBeNull();
    expect(armorTone('scrap', 'paint')).toBe(ARMOR_LOOK.scrap.steel);
  });
});
