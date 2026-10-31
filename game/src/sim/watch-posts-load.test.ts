import { expect, it } from 'vitest';

it('finds raider posts when loaded in the turn worker order', async () => {
  await import('./path');
  const { raiderGrounds, homeCamp } = await import('./npc-decisions');
  const { newWorld } = await import('./world');
  const { defaultSetup } = await import('./settings');
  const { START_KITS } = await import('../data/start');
  const { TEST_MAP } = await import('../test/map');
  const { spawnQueueNow } = await import('./spawn');
  const w = newWorld(1, START_KITS.standard, TEST_MAP, defaultSetup('roaming'));
  spawnQueueNow(w);
  const raider = w.vehicles.find((v) => v.faction === 'scrapjaw');
  if (!raider) throw new Error('the real map spawns no raider');
  const posts = raiderGrounds(w, homeCamp(raider));
  expect(posts.length).toBeGreaterThan(0);
  expect(posts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
});
