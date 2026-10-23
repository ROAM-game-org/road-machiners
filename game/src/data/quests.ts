
export type QuestValue = string | number | boolean;
export type QuestValueType = 'string' | 'number' | 'boolean';
export type QuestVarDecl = { type: QuestValueType; init: QuestValue };
export type QuestViewKind = 'talk' | 'page';
export type QuestStat = { name: string; label: string; words: string[] | null };
export type QuestFact = { name: string; text: string };
export type QuestLanguage = 'en' | 'ru';
export type QuestScene = { img: string | null; place: string | null };
export type QuestText = { story: string; stats: QuestStat[]; facts: QuestFact[]; scenes: Record<string, QuestScene> };
export type QuestLinks = { reads: string[]; readsNotes: string[]; writes: Record<string, QuestValue[]>; notes: string[]; begins: string[] };
export type CompiledQuest = { vars: Record<string, QuestVarDecl>; checkpoints: string[]; view: QuestViewKind; art: string[]; revision: number; links: QuestLinks; text: Record<QuestLanguage, QuestText> };
export type QuestBundle = { world: Record<string, QuestVarDecl>; externals: string[]; quests: Record<string, CompiledQuest> };

export const CHECKPOINT_TAG = 'checkpoint:';
export const COST_TAG = 'cost:';
export const CHECK_TAG = 'check:';
export const QUEST_LANGUAGES: readonly QuestLanguage[] = ['en', 'ru'];
export const QUEST_VIEWS: readonly QuestViewKind[] = ['talk', 'page'];
export const MONEY_STAT = 'money';

export const GAME_OPENED_QUESTS = {
  firstFall: 'first_fall',
  arrival: 'intro_arrival',
  introWake: 'intro_bowl',
  introRoad: 'intro_road',
  wagonSeven: 'wagon_seven',
  scale: 'bowl_scale',
  counter: 'nose_counter',
  roadHire: 'road_hire',
  coreDeath: 'fallen_light',
  chaosHighwayIntro: 'chaos_highway_intro',
  roadStretch1: 'road_stretch_1',
} as const;
export const ALA_HIRED = 'ala_hired';
export const ROAD_STORY: Record<number, { quest: string; gate: string }> = {
  1: { quest: GAME_OPENED_QUESTS.roadStretch1, gate: 'road_seen_1' },
};
export const FIRST_FALL_SEEN = 'first_knockout_seen';
export const WAGON_SEEN = 'wagon_seen';
export const SCALE_SEEN = 'scale_seen';
export const COUNTER_SEEN = 'counter_seen';
export const TOWED_TO_BOWL = 'towed_to_bowl';
export const HATTIE_MET = 'hattie_met';
export type WellCheckpoint = 'start' | 'meet' | 'again';
export const AMBUSH_RAIDER = 'ambush_raider';

export const INTRO_STEP = 'intro_step';

export type GameWorldVar = { gates: string | null };
export const GAME_WORLD_VARS: Record<string, GameWorldVar> = {
  [INTRO_STEP]: { gates: null },
  [TOWED_TO_BOWL]: { gates: null },
  [AMBUSH_RAIDER]: { gates: null },
  [HATTIE_MET]: { gates: GAME_OPENED_QUESTS.introWake },
  [FIRST_FALL_SEEN]: { gates: GAME_OPENED_QUESTS.firstFall },
  [WAGON_SEEN]: { gates: GAME_OPENED_QUESTS.wagonSeven },
  [SCALE_SEEN]: { gates: GAME_OPENED_QUESTS.scale },
  [COUNTER_SEEN]: { gates: GAME_OPENED_QUESTS.counter },
  [ALA_HIRED]: { gates: null },
  ...Object.fromEntries(Object.values(ROAD_STORY).map((scene) => [scene.gate, { gates: scene.quest }])),
};
export const TOWN_SECTIONS = ['garage', 'market', 'board', 'people', 'bar'] as const;
export type TownSection = (typeof TOWN_SECTIONS)[number];
export type TownMoment = 'enter' | 'leave';
export type TownSceneCondition = 'newSeller';
export type TownScene = { place: string; section: TownSection; moment: TownMoment; quest: string; checkpoint: string; gate: string; when: TownSceneCondition | null };
export const TOWN_SCENES: readonly TownScene[] = [
  { place: 'bowl', section: 'market', moment: 'enter', quest: GAME_OPENED_QUESTS.scale, checkpoint: 'start', gate: SCALE_SEEN, when: 'newSeller' },
  { place: 'nose', section: 'garage', moment: 'leave', quest: GAME_OPENED_QUESTS.counter, checkpoint: 'start', gate: COUNTER_SEEN, when: null },
];
export const INTRO_STEPS = ['off', 'drive', 'patched', 'ambush', 'done'] as const;
export type IntroStep = (typeof INTRO_STEPS)[number];
