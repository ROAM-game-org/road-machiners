import type { FactoryConfig } from '../types';
import type { PublicRoute } from './store';
import type { Ground } from './wiki';

export type DecisionKind = 'bug' | 'feature' | 'question' | 'feedback' | 'chatter';
export type DecisionIntent = 'sincere' | 'troll' | 'spam';
export type Relevance = 'parent' | 'other';
export type Decision = { verdict: 'accept' | 'reject'; intent: DecisionIntent; sincere: number; kind: DecisionKind; route: PublicRoute; relevance: Relevance };
export type FilterInput = { source: 'comment' | 'message' | 'report'; text: string; parent?: string | null };
export type FilterConfig = Pick<FactoryConfig, 'openaiKey' | 'filterModel' | 'filterTimeoutSeconds' | 'filterSincereMin'>;
export type Classify = (input: FilterInput) => Promise<Decision>;
export type PublicFilter = { classify: Classify; ground: Ground };
