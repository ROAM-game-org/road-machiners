import type { FactoryConfig } from '../types';
import type { PublicRoute } from './store';

export type DecisionKind = 'bug' | 'feature' | 'feedback';
export type Decision = { verdict: 'accept' | 'reject'; spam: number; kind: DecisionKind; route: PublicRoute };
export type FilterInput = { source: 'comment' | 'report'; text: string };
export type FilterConfig = Pick<FactoryConfig, 'openaiKey' | 'filterModel' | 'filterTimeoutSeconds' | 'filterSpamProbability'>;
export type Classify = (input: FilterInput) => Promise<Decision>;
