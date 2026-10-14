export type Topic = { value: string; description: string; covers: string; page: string | null };

export const NO_TOPIC = 'none';

export const WIKI_ROOT = 'game/docs/wiki';

export const TOPICS: readonly Topic[] = [
  { value: 'truck', description: 'Building and changing the truck: parts, the grid, mass, power, wear, breakdowns and repair.', covers: 'The truck page covers the inventory grid, refits, mass, gun power draw, utilities, the claymore ram, wear, breakdowns and field repair', page: 'mechanics/truck.md' },
  { value: 'items', description: 'What a chassis, a part or a good is and costs.', covers: 'The items page lists every chassis, part and good with its value, mass and footprint', page: 'items.md' },
  { value: 'turns', description: 'How turns, orders, driving, guns, armor and crashes work.', covers: 'The turns page covers the turn, orders, routes, crashes, guns, armor, utilities and the log', page: 'mechanics/turns.md' },
  { value: 'defeat', description: 'Losing a fight, being stranded, tows, healing, death and saves.', covers: 'The defeat page covers knockouts, looting, stranding, tows, the beacon, healing, death and saves', page: 'mechanics/defeat.md' },
  { value: 'detection', description: 'Seeing and being seen: sight, sound, dust, scanners and flares.', covers: 'The detection page covers sight, engine sound, dust, the radio scanner, flares and how NPCs react to contacts', page: 'mechanics/detection.md' },
  { value: 'world', description: 'The map, places, travel, time of day and weather.', covers: 'The world page covers the map, sites, town and camp patrols, time of day, weather and engine heat', page: 'mechanics/world.md' },
  { value: 'modes', description: 'Game modes and the settings picked at New game.', covers: 'The world settings page covers the game mode and the world settings a player picks at New game', page: 'mechanics/world-settings.md' },
  { value: 'economy', description: 'Money, prices, trade, shops, contracts, fuel and supplies.', covers: 'The economy page covers values, prices, shops, contracts, hidden salvage, fuel and supplies', page: 'mechanics/economy.md' },
  { value: 'character', description: 'Skills, XP and perks.', covers: 'The character page covers skills, XP and perks', page: 'mechanics/character.md' },
  { value: 'npcs', description: 'Other trucks and people: what they do, their traits and escorts.', covers: 'The NPC page covers NPC activities, traits, decisions, states and escorts', page: 'mechanics/npcs.md' },
  { value: 'radio', description: 'Radio calls, topics and the horn.', covers: 'The social page covers radio calls, topics, the horn and Waste Of Time Radio', page: 'mechanics/social.md' },
  { value: 'content', description: 'What the current build contains.', covers: 'The content page lists what the current build contains', page: 'mechanics/content.md' },
  { value: 'taking-part', description: 'How to report a bug, suggest an idea or vote on what gets built.', covers: 'Tell me a bug or an idea here, or send it with the report form in the game. Ideas the factory takes up come back to this chat as proposals, and players vote on them with reactions', page: null },
];

export const TOPIC_VALUES: readonly string[] = [...TOPICS.map((topic) => topic.value), NO_TOPIC];

const wikiLink = (repo: string, page: string): string => `https://github.com/${repo}/blob/main/${WIKI_ROOT}/${page}`;

export function topicAnswer(repo: string, value: string): string | null {
  const topic = TOPICS.find((candidate) => candidate.value === value);
  if (topic === undefined) return null;
  return topic.page === null ? `${topic.covers}.` : `${topic.covers}: ${wikiLink(repo, topic.page)}`;
}

export const wikiHome = (repo: string): string => wikiLink(repo, 'README.md');
