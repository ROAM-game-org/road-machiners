
export type RadioTopic =
  | 'ident'
  | 'dawn'
  | 'noon'
  | 'dusk'
  | 'midnight'
  | 'heatwaveStart'
  | 'heatwaveEnd'
  | 'overcastStart'
  | 'stormStart'
  | 'stormEnd'
  | 'haul'
  | 'procure'
  | 'claim'
  | 'search'
  | 'survey'
  | 'rescue'
  | 'raid'
  | 'raidKnockout'
  | 'wisdom';

export const RADIO = {
  minGapTurns: 35,
  gapJitterTurns: 45,
  clockChance: 0.25,
  queueCap: 3,
  staleTurns: 65,
  placeCooldownTurns: 150,
  idleTurns: 240,
  charsPerSecond: 24,
  nearTiles: 60,
  maxChars: 90,
};

export const RADIO_HOURS = { noon: 12, midnight: 0 };

export const RADIO_VARIANTS: Record<RadioTopic, number> = {
  ident: 2,
  dawn: 3,
  noon: 2,
  dusk: 2,
  midnight: 2,
  heatwaveStart: 2,
  heatwaveEnd: 2,
  overcastStart: 2,
  stormStart: 2,
  stormEnd: 2,
  haul: 2,
  procure: 2,
  claim: 2,
  search: 2,
  survey: 2,
  rescue: 2,
  raid: 3,
  raidKnockout: 2,
  wisdom: 20,
};

