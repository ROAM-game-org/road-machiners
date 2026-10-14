import { BUG_LABEL, PLAYER_REPORT_LABEL } from '../types';

const TITLE_CHARS = 100;

export const plainText = (text: string, max: number): string => text.replace(/\s+/g, ' ').replace(/`/g, "'").trim().slice(0, max);

export const issueTitle = (text: string): string => plainText(text, TITLE_CHARS);

export const quoted = (text: string): string => text.split('\n').map((line) => `> ${line}`).join('\n');

export const playerLabels = (kind: string): string[] => [kind === 'bug' ? BUG_LABEL : 'feature-request', PLAYER_REPORT_LABEL];
