
export type QuestValue = string | number | boolean;
export type QuestValueType = 'string' | 'number' | 'boolean';
export type QuestVarDecl = { type: QuestValueType; init: QuestValue };
export type QuestViewKind = 'transcript' | 'page';
export type QuestStat = { name: string; label: string; words: string[] | null };
export type QuestFact = { name: string; text: string };
export type CompiledQuest = { story: string; vars: Record<string, QuestVarDecl>; checkpoints: string[]; view: QuestViewKind; stats: QuestStat[]; facts: QuestFact[] };
export type QuestBundle = { world: Record<string, QuestVarDecl>; externals: string[]; quests: Record<string, CompiledQuest> };

export const CHECKPOINT_TAG = 'checkpoint:';
export const COST_TAG = 'cost:';
export const QUEST_VIEWS: readonly QuestViewKind[] = ['transcript', 'page'];
export const MONEY_STAT = 'money';

export const GAME_OPENED_QUESTS = { firstFall: 'first_fall', introGreenPit: 'intro_green_pit' } as const;
export const FIRST_FALL_SEEN = 'first_knockout_seen';

export const INTRO_STEP = 'intro_step';
export const INTRO_STEPS = ['off', 'walk', 'drive', 'patched', 'ambush', 'done'] as const;
export type IntroStep = (typeof INTRO_STEPS)[number];
