import type { EN } from '../en';
import type { Translation } from '../msg';
import { DRIVERS } from './drivers';
import { LOG } from './log';
import { LORE } from './lore';
import { NAMES } from './names';
import { SCREENS } from './screens';
import { STORY } from './story';
import { TALK } from './talk';
import { UI } from './ui';

export const RU: Translation<typeof EN> = { ...DRIVERS, ...LOG, ...LORE, ...NAMES, ...SCREENS, ...STORY, ...TALK, ...UI };
