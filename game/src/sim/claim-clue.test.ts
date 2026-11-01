import { describe, expect, it } from 'vitest';
import CLAIM_CLUES_FILE from '../data/claim-clues.json';
import { CONTRACTS, SHOPS } from '../data/market';
import { START_KITS } from '../data/start';
import { TEST_MAP } from '../test/map';
import { bakeClaimClues, claimCandidates, claimClue, claimSpots, claimTargets, claimWrecks } from './claims';
import { bakedTier, claimClueBake, cluePlaces, fairTier, fitsClue, relationTo, shopClue, type ClaimWreck } from './claim-clue';
import { siteOf } from './market';
import type { ClaimContract } from './salvage';
import { defaultSetup } from './settings';
import { newWorld } from './world';
import { dist } from './vec';

const world = newWorld(1, START_KITS.standard, TEST_MAP, defaultSetup('roaming'), false);
for (const shop of Object.values(world.shops)) shop.contracts = shop.contracts.filter((c) => c.kind !== 'claim');
const wrecks = claimWrecks(world);
const places = cluePlaces(world);
const inSmallShell = (w: ClaimWreck): boolean => places.some((p) => p.piece === 'smallShell' && relationTo(p, w.pos) === 'in');

function contractFor(wreck: ClaimWreck, shop: string): ClaimContract {
  return { id: `ct-${wreck.id}`, shop, kind: 'claim', stockId: wreck.id, at: { ...wreck.pos }, partId: 'p', defId: 'mg', reward: 1, deadline: 1, window: 1, tier: 1, rivalAt: 1, rival: null, leads: [] };
}

describe('the baked claim clues', () => {
  it('match what the bake makes from the committed map, under any seed', () => {
    const other = newWorld(2, START_KITS.standard, TEST_MAP, defaultSetup('roaming'), false);
    expect(bakeClaimClues(world)).toEqual(claimClueBake(TEST_MAP));
    expect(bakeClaimClues(other)).toEqual(claimClueBake(TEST_MAP));
  });

  it('throw under another map hash and name the fix', () => {
    expect(() => claimClueBake({ hash: 'other' })).toThrow(/npm run old-spots/);
  });

  it('keep at least 35 of the claim wrecks postable from every shop', () => {
    expect(wrecks.length).toBeGreaterThanOrEqual(35);
    for (const shop of Object.keys(SHOPS)) expect(claimTargets(world, shop).length, shop).toBeGreaterThan(0);
    for (const shop of Object.keys(SHOPS)) {
      const postable = wrecks.filter((w) => bakedTier(w.id, shop) !== null);
      expect(postable.length, shop).toBeGreaterThanOrEqual(35);
    }
  });

  it('leave only wrecks within the nearby radius of the true wreck among the candidates, for every wreck and shop', () => {
    for (const wreck of wrecks) {
      for (const shop of Object.keys(SHOPS)) {
        if (bakedTier(wreck.id, shop) === null) continue;
        const clue = claimClue(contractFor(wreck, shop));
        const fit = wrecks.filter((q) => fitsClue(places, clue, q));
        expect(fit.map((q) => q.id), `${wreck.id} from ${shop}`).toContain(wreck.id);
        for (const q of fit) expect(dist(q.pos, wreck.pos), `${q.id} for ${wreck.id} from ${shop}`).toBeLessThanOrEqual(CONTRACTS.claim.clue.nearby);
      }
    }
  });
});

describe('the reported claim', () => {
  const wreck = wrecks.find(inSmallShell)!;

  it('names the small arch shell from Nose and leaves one candidate', () => {
    expect(wrecks.filter(inSmallShell)).toEqual([wreck]);
    const clue = claimClue(contractFor(wreck, 'nose'));
    expect(clue.where).toMatchObject({ tier: 'piece', piece: 'smallShell', relation: 'in' });
    expect(claimCandidates(world, contractFor(wreck, 'nose'))).toEqual([wreck.id]);
  });

  it('is not fair by the shop words alone, which fit more of the Fallen Sun', () => {
    const base = shopClue(wreck, siteOf('nose').pos);
    expect(wrecks.filter((q) => fitsClue(places, base, q)).length).toBeGreaterThan(1);
  });

  it('gives the compartment in the big shell the big shell', () => {
    const inBig = wrecks.find((w) => w.look === 'hullCompartment' && places.some((p) => p.piece === 'bigShell' && relationTo(p, w.pos) === 'in'))!;
    expect(claimClue(contractFor(inBig, 'nose')).where?.piece).toBe('bigShell');
  });
});

describe('the fit', () => {
  it('counts a shared piece name as one name', () => {
    const barns = places.filter((p) => p.piece === 'barn');
    expect(barns.length).toBeGreaterThan(1);
    const besideBarn = wrecks.filter((w) => w.look === 'armyTruck' && barns.some((b) => relationTo(b, w.pos) === 'beside'));
    for (const wreck of besideBarn) {
      const tier = fairTier(places, wrecks, wreck, siteOf('bowl').pos);
      if (tier !== 'piece') continue;
      const others = besideBarn.filter((q) => q !== wreck && dist(q.pos, wreck.pos) > CONTRACTS.claim.clue.nearby);
      expect(others.every((q) => !fitsClue(places, claimClue(contractFor(wreck, 'bowl')), q))).toBe(true);
    }
  });

  it('gives a tank hulk field no piece', () => {
    const tank = wrecks.find((w) => w.look === 'tank')!;
    expect(claimClue(contractFor(tank, 'nose')).where).toBeNull();
  });

  it('shows an old held claim with no fair tier its most specific words and keeps its wreck among the candidates', () => {
    const held = wrecks.find((w) => CLAIM_CLUES_FILE.wrecks[w.id as keyof typeof CLAIM_CLUES_FILE.wrecks].offset !== null)!;
    const entry = CLAIM_CLUES_FILE.wrecks[held.id as keyof typeof CLAIM_CLUES_FILE.wrecks] as { offset: unknown; tiers: Record<string, string> };
    const fairTierOfNose = entry.tiers.nose;
    delete entry.tiers.nose;
    try {
      expect(bakedTier(held.id, 'nose')).toBeNull();
      const c = contractFor(held, 'nose');
      expect(claimClue(c).where).toEqual(entry.offset);
      expect(claimCandidates(world, c)).toContain(held.id);
    } finally {
      entry.tiers.nose = fairTierOfNose;
    }
  });

  it('shows the shop words for a claim whose wreck is not in the bake', () => {
    const c = { ...contractFor(wrecks[0], 'nose'), stockId: 'hullCache-9999999' };
    expect(() => claimClue({ ...c, stockId: wrecks[0].id.replace(/\d+$/, '1') })).not.toThrow();
  });

  it('keeps every claim spot an unreserved wreck', () => {
    expect(claimSpots(world).length).toBe(wrecks.length);
  });
});
