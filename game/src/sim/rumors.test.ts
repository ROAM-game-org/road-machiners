import { describe, expect, it } from 'vitest';
import { emptyHidden } from './salvage';
import { toldWrecks } from './rumors';
import { emptyWorld } from './testkit';
import type { SalvageStock } from './types';

function wreck(id: string): SalvageStock {
  return { id, pos: { x: 50, y: 30 }, radius: 0.6, goods: { scrap: 2 }, parts: [], hidden: emptyHidden() };
}

describe('told wrecks', () => {
  it('lists the wrecks the player was told of, newest told first', () => {
    const w = emptyWorld();
    w.salvage = [wreck('wreck1'), wreck('wreck2'), wreck('wreck3'), wreck('wreck4')];
    w.player.rumored = ['wreck3', 'wreck1', 'wreck2'];

    expect(toldWrecks(w).map((s) => s.id)).toEqual(['wreck2', 'wreck1', 'wreck3']);
  });

  it('leaves out a wreck the player searched and one gone from the world', () => {
    const w = emptyWorld();
    w.salvage = [wreck('wreck1'), wreck('wreck2')];
    w.player.rumored = ['wreck1', 'wreck2', 'wreck9'];
    w.player.scavenged = ['wreck2'];

    expect(toldWrecks(w).map((s) => s.id)).toEqual(['wreck1']);
  });

  it('lists a wreck told twice once', () => {
    const w = emptyWorld();
    w.salvage = [wreck('wreck1'), wreck('wreck2')];
    w.player.rumored = ['wreck1', 'wreck2', 'wreck1'];

    expect(toldWrecks(w).map((s) => s.id)).toEqual(['wreck1', 'wreck2']);
  });
});
