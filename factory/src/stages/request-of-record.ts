import type { MemberWord } from '../types';

const WORDS_HEADING = 'The member\'s own words, as the factory recorded their messages in the committee chat, oldest first. They rule.';
const NOTES_HEADING = 'Hermes\'s notes. They are Hermes\'s reading of the words above, and rank below them.';

function quoted(word: MemberWord): string {
  return word.text.split('\n').map((line) => `> ${line}`.trimEnd()).join('\n');
}

export function requestOfRecord(words: MemberWord[] | undefined, notes: string): string {
  if (!words?.length) return notes;
  return [WORDS_HEADING, words.map(quoted).join('\n\n'), NOTES_HEADING, notes].join('\n\n');
}
