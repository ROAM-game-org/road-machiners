export const GAME_SYSTEMS = [
  'chaos-highway', 'character', 'content', 'crime', 'defeat', 'detection', 'economy', 'factions', 'npcs', 'social', 'truck', 'turns', 'world', 'world-settings',
  'ui', 'art', 'sound', 'writing', 'none',
] as const;
export type GameSystem = typeof GAME_SYSTEMS[number];

export const ALONE_SYSTEM: GameSystem = 'none';
const SYSTEM_LABEL_PREFIX = 'system:';

export const systemLabel = (system: GameSystem): string => `${SYSTEM_LABEL_PREFIX}${system}`;

export function systemOf(labels: string[]): GameSystem | null {
  const tagged = labels.filter((label) => label.startsWith(SYSTEM_LABEL_PREFIX)).map((label) => label.slice(SYSTEM_LABEL_PREFIX.length));
  if (tagged.length > 1) throw new Error(`An issue carries more than one system label: ${tagged.join(', ')}`);
  if (tagged.length === 0) return null;
  return readSystem(tagged[0], 'The system label');
}

export function readSystem(value: unknown, source: string): GameSystem {
  if (typeof value === 'string' && (GAME_SYSTEMS as readonly string[]).includes(value)) return value as GameSystem;
  throw new Error(`${source} needs system as one of ${GAME_SYSTEMS.join(', ')}, not ${String(value)}`);
}
