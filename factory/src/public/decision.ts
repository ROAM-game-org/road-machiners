import type { FactoryConfig } from '../types';
import type { PublicRoute } from './store';

export type DecisionKind = 'bug' | 'feature' | 'question' | 'feedback' | 'chatter';
export type DecisionIntent = 'sincere' | 'junk';
export type Relevance = 'parent' | 'other';
export type ReplyLanguage = 'en' | 'ru';
export type Decision = { verdict: 'accept' | 'reject'; intent: DecisionIntent; sincere: number; kind: DecisionKind; route: PublicRoute; relevance: Relevance; language?: ReplyLanguage };
export type FilterInput = { source: 'comment' | 'report'; text: string; parent?: string | null };
export type FilterConfig = Pick<FactoryConfig, 'openaiKey' | 'filterModel' | 'filterTimeoutSeconds' | 'filterJunkMin'>;
export type Classify = (input: FilterInput) => Promise<Decision>;
export type PublicFilter = { classify: Classify };

export class TransientFilterError extends Error {}

export class FilterRefusalError extends Error {
  constructor(readonly refused: string[], readonly junk: boolean) {
    super(`The filter model refused to answer: ${refused.join(', ')}.`);
  }
}
