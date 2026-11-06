
export const NOTE_IDS = [
  'wagonBowl', 'wagonNose', 'wagonRoad', 'wagonDag', 'wagonRod', 'wagonFound', 'greenPit', 'glassTank', 'burntConvoy',
  'talkGranaryGate',
  'talkSeepPipe',
  'talkConvoyNotClean',
  'talkCraneBook',
  'talkPierceGuns',
  'talkGlassLean',
  'talkSunwardTake',
  'sunwardLamps',
  'sunwardDragged',
  'talkKilnFight',
  'talkBrakeRod',
  'talkArmyStarved',
  'talkCommitteeRent',
  'pipeBook', 'pipeDraw', 'pipeOffer', 'pipeCanal',
  'orchardIron',
  'roadhouseBook', 'roadhouseBuyOff', 'roadhouseRaiders',
] as const;

export type NoteId = (typeof NOTE_IDS)[number];

export function isNoteId(id: string): id is NoteId {
  return (NOTE_IDS as readonly string[]).includes(id);
}

export const GAME_NOTES = { wagonRoad: 'wagonRoad' } as const satisfies Record<string, NoteId>;

export type LocalId = 'ruben' | 'hattie' | 'dag' | 'kovac' | 'lena' | 'ibo' | 'edda' | 'jory' | 'sefa' | 'agnes' | 'odile' | 'hadiza' | 'hollis' | 'petra' | 'renata' | 'emil';

export type LocalDef = { id: LocalId; town: string; section: 'people' | 'maps'; quest: string };

export const LOCALS: Record<LocalId, LocalDef> = {
  ruben: { id: 'ruben', town: 'bowl', section: 'people', quest: 'bowl_ruben' },
  hattie: { id: 'hattie', town: 'bowl', section: 'people', quest: 'bowl_hattie' },
  dag: { id: 'dag', town: 'bowl', section: 'people', quest: 'bowl_dag' },
  kovac: { id: 'kovac', town: 'nose', section: 'people', quest: 'nose_kovac' },
  lena: { id: 'lena', town: 'nose', section: 'people', quest: 'nose_lena' },
  ibo: { id: 'ibo', town: 'nose', section: 'people', quest: 'nose_ibo' },
  edda: { id: 'edda', town: 'nose', section: 'people', quest: 'nose_edda' },
  jory: { id: 'jory', town: 'bowl', section: 'people', quest: 'bowl_jory' },
  sefa: { id: 'sefa', town: 'salvage-yard', section: 'people', quest: 'yard_sefa' },
  agnes: { id: 'agnes', town: 'dustwell', section: 'people', quest: 'pump_agnes' },
  odile: { id: 'odile', town: 'granary', section: 'people', quest: 'granary_odile' },
  hadiza: { id: 'hadiza', town: 'green-pit', section: 'people', quest: 'pit_hadiza' },
  hollis: { id: 'hollis', town: 'pump-station', section: 'people', quest: 'station_still' },
  petra: { id: 'petra', town: 'marshal-post', section: 'people', quest: 'roadhouse_petra' },
  renata: { id: 'renata', town: 'bowl', section: 'maps', quest: 'bowl_guild' },
  emil: { id: 'emil', town: 'nose', section: 'maps', quest: 'nose_guild' },
};

export const TERM_IDS = [
  'bowl', 'nose', 'pierce', 'granary', 'glass_flats', 'fallen_sun', 'sunward', 'senate', 'farmers',
  'pump_station', 'dustwell', 'committee', 'salvage_yard', 'kiln', 'scrapjaw', 'old_army', 'guild', 'old_world', 'chaos',
  'keepers', 'machiner', 'link', 'road_book', 'marshals',
] as const;

export type TermId = (typeof TERM_IDS)[number];
