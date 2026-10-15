import { BUG_LABEL, PLAYER_REPORT_LABEL } from '../types';
import { defang } from './defang';

const TITLE_CHARS = 100;

export const plainText = (text: string, max: number): string => text.replace(/\s+/g, ' ').replace(/`/g, "'").trim().slice(0, max);

export const issueTitle = (text: string): string => defang(plainText(text, TITLE_CHARS));

export const playerLabels = (kind: string): string[] => [kind === 'bug' ? BUG_LABEL : 'feature-request', PLAYER_REPORT_LABEL];
