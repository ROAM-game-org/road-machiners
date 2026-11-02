const OLD_MODE_NAMES: Record<string, string> = { chaosHighway: 'furyRoad' };

export function beforeChaosHighwayName(world: object): void {
  const saved = world as { chaosHighway?: unknown; furyRoad?: unknown; setup: { mode: string } };
  saved.furyRoad = saved.chaosHighway;
  delete saved.chaosHighway;
  saved.setup.mode = OLD_MODE_NAMES[saved.setup.mode] ?? saved.setup.mode;
}
