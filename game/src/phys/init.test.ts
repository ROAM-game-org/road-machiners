import { expect, it } from 'vitest';
import { initPhysics } from './drive';

it('starts Rapier once however many callers ask', async () => {
  const first = initPhysics();
  expect(initPhysics()).toBe(first);
  await first;
  expect(initPhysics()).toBe(first);
});
