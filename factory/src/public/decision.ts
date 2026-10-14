import type { FactoryConfig } from '../types';
import type { PublicRoute } from './store';

export type DecisionKind = 'bug' | 'feature' | 'feedback';
export type Decision = { verdict: 'accept' | 'reject'; kind: DecisionKind; route: PublicRoute; title: string; reason: string };
export type FilterInput = { source: 'comment' | 'report'; text: string; kind: string | null };
export type FilterConfig = Pick<FactoryConfig, 'openaiKey' | 'filterModel' | 'filterTimeoutSeconds'>;
export type Classify = (input: FilterInput) => Promise<Decision>;
