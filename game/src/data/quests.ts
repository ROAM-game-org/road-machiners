
export type QuestValue = string | number | boolean;
export type QuestValueType = 'string' | 'number' | 'boolean';
export type QuestVarDecl = { type: QuestValueType; init: QuestValue };
export type QuestViewKind = 'talk' | 'page';
export type QuestStat = { name: string; label: string; words: string[] | null };
export type QuestFact = { name: string; text: string };
export type CompiledQuest = { story: string; vars: Record<string, QuestVarDecl>; checkpoints: string[]; view: QuestViewKind; stats: QuestStat[]; facts: QuestFact[] };
export type QuestBundle = { world: Record<string, QuestVarDecl>; externals: string[]; quests: Record<string, CompiledQuest> };

export const CHECKPOINT_TAG = 'checkpoint:';
export const COST_TAG = 'cost:';
export const CHECK_TAG = 'check:';
export const QUEST_VIEWS: readonly QuestViewKind[] = ['talk', 'page'];
export const MONEY_STAT = 'money';

export const GAME_OPENED_QUESTS = { firstFall: 'first_fall', arrival: 'intro_arrival', introWake: 'intro_bowl' } as const;
export const FIRST_FALL_SEEN = 'first_knockout_seen';
export const TOWED_TO_BOWL = 'towed_to_bowl';

export const INTRO_STEP = 'intro_step';
export const INTRO_STEPS = ['off', 'drive', 'patched', 'ambush', 'done'] as const;
export type IntroStep = (typeof INTRO_STEPS)[number];
