import { describe, expect, it } from 'vitest';
import { GOODS } from './goods';
import { chainGoods, ESSENTIAL_GOODS, PRODUCTION, SITE_ECONOMY, siteRecipes, steadyBalance } from './market';

const RATION_SINKS = ['dustwell', 'green-pit', 'bowl', 'nose', 'pump-station', 'salvage-yard'];

describe('the production chain balance', () => {
  it('counts every essential good and every input behind one as a chain good', () => {
    const chain = chainGoods();
    for (const good of ESSENTIAL_GOODS) expect(chain).toContain(good);
    for (const good of ['water', 'grain', 'salt']) expect(chain).toContain(good);
    expect(chain).not.toContain('meds');
  });

  it('makes every chain good faster than the world uses it, by the chain margin', () => {
    const balance = steadyBalance();
    const short = chainGoods()
      .map((good) => ({ good, ...balance[good] }))
      .filter(({ made, used }) => made < PRODUCTION.chainMargin * used)
      .map(({ good, made, used }) => `${good}: made ${made.toFixed(1)}, used ${used.toFixed(1)} a work day, ratio ${(made / used).toFixed(2)}`);
    expect(short).toEqual([]);
  });

  it('keeps a ration draw at every site that ate rations', () => {
    for (const site of RATION_SINKS) expect(SITE_ECONOMY[site].demand.rations, site).toBeGreaterThan(0);
  });

  it('keeps the Granary recipe and the crate value it sets', () => {
    const recipe = siteRecipes('granary').find((r) => r.id === 'rations');
    expect(recipe).toMatchObject({ inputs: { grain: 2, salt: 1, water: 1 }, outputs: { rations: 3 }, everyCycles: 3 });
    expect(GOODS.rations.value).toBe(11.9);
  });
});
