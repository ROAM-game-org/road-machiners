import { describeQuestWalks, inFirstNoseFile } from './quest-walk';

describeQuestWalks('the nose quests, second half', (id) => id.startsWith('nose_') && !inFirstNoseFile(id));
