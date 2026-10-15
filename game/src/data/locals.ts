
export const NOTE_IDS = [
  'wagonBowl', 'wagonNose', 'wagonRoad', 'wagonDag', 'wagonPin', 'wagonFound', 'greenPit', 'glassTank', 'burntConvoy',
  'talkGranaryGate',
  'talkSeepPipe',
  'talkConvoyNotClean',
  'talkCraneBook',
  'talkPierceGuns',
  'talkGlassLean',
  'talkSunwardTake',
  'talkKilnFight',
  'talkOnePin',
  'talkArmyStarved',
  'talkCommitteeRent',
  'pipeBook', 'pipeDraw', 'pipeOffer', 'pipeCanal',
] as const;

export type NoteId = (typeof NOTE_IDS)[number];

export const GAME_NOTES = { wagonRoad: 'wagonRoad' } as const satisfies Record<string, NoteId>;

export type LocalId = 'ruben' | 'hattie' | 'dag' | 'kovac' | 'lena' | 'ibo' | 'edda' | 'jory' | 'sefa' | 'agnes';

export type LocalDef = { id: LocalId; town: string; quest: string };

export const LOCALS: Record<LocalId, LocalDef> = {
  ruben: { id: 'ruben', town: 'bowl', quest: 'bowl_ruben' },
  hattie: { id: 'hattie', town: 'bowl', quest: 'bowl_hattie' },
  dag: { id: 'dag', town: 'bowl', quest: 'bowl_dag' },
  kovac: { id: 'kovac', town: 'nose', quest: 'nose_kovac' },
  lena: { id: 'lena', town: 'nose', quest: 'nose_lena' },
  ibo: { id: 'ibo', town: 'nose', quest: 'nose_ibo' },
  edda: { id: 'edda', town: 'nose', quest: 'nose_edda' },
  jory: { id: 'jory', town: 'bowl', quest: 'bowl_jory' },
  sefa: { id: 'sefa', town: 'salvage-yard', quest: 'yard_sefa' },
  agnes: { id: 'agnes', town: 'dustwell', quest: 'pump_agnes' },
};

export const TERM_IDS = [
  'bowl', 'nose', 'pierce', 'granary', 'glass_flats', 'fallen_sun', 'sunward', 'senate', 'farmers',
  'pump_station', 'dustwell', 'committee', 'salvage_yard', 'kiln', 'scrapjaw', 'old_army', 'guild', 'old_world', 'chaos',
] as const;

export type TermId = (typeof TERM_IDS)[number];
