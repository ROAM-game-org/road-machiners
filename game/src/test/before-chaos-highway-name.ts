export function beforeChaosHighwayName(world: object): void {
  const saved = world as { chaosHighway?: unknown; furyRoad?: unknown; setup: { mode: string } };
  saved.furyRoad = saved.chaosHighway;
  delete saved.chaosHighway;
  if (saved.setup.mode === 'chaosHighway') saved.setup.mode = 'furyRoad';
}
