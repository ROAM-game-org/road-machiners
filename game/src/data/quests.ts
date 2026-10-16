
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
  wagonSeven: 'wagon_seven',
  roadHire: 'road_hire',
  roadStretch1: 'road_stretch_1',
  roadStretch4: 'road_stretch_4',
  roadStretch8: 'road_stretch_8',
  roadStretch12: 'road_stretch_12',
} as const;
export const ALA_HIRED = 'ala_hired';
export const ROAD_STORY: Record<number, { quest: string; gate: string }> = {
  1: { quest: GAME_OPENED_QUESTS.roadStretch1, gate: 'road_seen_1' },
  4: { quest: GAME_OPENED_QUESTS.roadStretch4, gate: 'road_seen_4' },
  8: { quest: GAME_OPENED_QUESTS.roadStretch8, gate: 'road_seen_8' },
  12: { quest: GAME_OPENED_QUESTS.roadStretch12, gate: 'road_seen_12' },
};
export const FIRST_FALL_SEEN = 'first_knockout_seen';
export const WAGON_SEEN = 'wagon_seen';
export const TOWED_TO_BOWL = 'towed_to_bowl';
export const AMBUSH_RAIDER = 'ambush_raider';

export const INTRO_STEP = 'intro_step';

export type GameWorldVar = { gates: string | null };
export const GAME_WORLD_VARS: Record<string, GameWorldVar> = {
  [INTRO_STEP]: { gates: null },
  [TOWED_TO_BOWL]: { gates: null },
  [AMBUSH_RAIDER]: { gates: null },
  [FIRST_FALL_SEEN]: { gates: GAME_OPENED_QUESTS.firstFall },
  [WAGON_SEEN]: { gates: GAME_OPENED_QUESTS.wagonSeven },
  [ALA_HIRED]: { gates: null },
  ...Object.fromEntries(Object.values(ROAD_STORY).map((scene) => [scene.gate, { gates: scene.quest }])),
};
export const INTRO_STEPS = ['off', 'drive', 'patched', 'ambush', 'done'] as const;
export type IntroStep = (typeof INTRO_STEPS)[number];
