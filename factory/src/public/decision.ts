import type { FactoryConfig } from '../types';
import type { PublicRoute } from './store';

export type DecisionKind = 'bug' | 'feature' | 'question' | 'feedback' | 'chatter';
export type DecisionIntent = 'sincere' | 'troll' | 'spam';
export type Relevance = 'parent' | 'other';
export type ReplyLanguage = 'en' | 'ru';
export type Decision = { verdict: 'accept' | 'reject'; intent: DecisionIntent; sincere: number; kind: DecisionKind; route: PublicRoute; relevance: Relevance; work?: number; language?: ReplyLanguage; filing?: boolean };
export type FilterInput = { source: 'comment' | 'message' | 'report'; text: string; parent?: string | null; context?: string | null; work?: string[]; addressed?: boolean };
export type FilterConfig = Pick<FactoryConfig, 'openaiKey' | 'filterModel' | 'filterTimeoutSeconds' | 'filterSincereMin'>;
export type Classify = (input: FilterInput) => Promise<Decision>;
export type PublicFilter = { classify: Classify };

export class TransientFilterError extends Error {}
