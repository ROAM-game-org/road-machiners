import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { FilterRefusalError, TransientFilterError, type Classify, type Decision, type DecisionKind, type FilterConfig, type FilterInput, type PublicFilter, type Relevance } from './decision';
import type { PublicRoute } from './store';

const ENDPOINT = 'https://api.openai.com/v1/decisions';
const GAME = readFileSync(fileURLToPath(new URL('../../prompts/filter-game.md', import.meta.url)), 'utf8').trim();

const CHAT_JUNK = {
  type: 'choice',
  name: 'junk',
  instructions: 'A person wrote this in the game\'s Telegram chat, under a proposal or a test build of the game. Read it together with the thread and the message it replies to. People write casually: short, rude, in capitals, or angry at the devs. Is it about the game, its builds or the people in the chat, or is it junk?',
  choices: [
    { value: 'feedback', description: 'Anything about the game, its builds or the people in the chat, however short, rude or casual: a bug, a wish, a question, an opinion, thanks, a greeting or talk between players. An insult at the devs that comes with a request is still feedback. "the winch snaps on hills" "both ideas are bad, redo them" "nice build" "who else is testing?"' },
    { value: 'junk', description: 'Not about the game or the people in the chat: ads, job offers, scams, lists of bot mentions or gibberish. Ads come in any language, often Chinese, and often end with a contact handle. "earn 500 a day, write @x" "空闲时间兼职 @abc12" "@abcbot @defbot @ghibot" "asdf asdf"' },
  ],
};

const GAME_JUNK = {
  type: 'choice',
  name: 'junk',
  instructions: 'A player sent this text with the report form inside the game, where they chose bug or idea and typed it. Players write these fast, mid-game: short, misspelled, rude, in capitals, or quoting a line of game text they find wrong. Is it about the game, or is it junk?',
  choices: [
    { value: 'feedback', description: 'Anything about playing this game, however short, rude or vague: a bug, a wish, a complaint, an opinion, or a quoted game line called wrong. "cant find my truck on the map" "raider let me go without taking anything" "stupid turret clips through the cab, fix" "the radio tip makes no sense" "Turn 12 the game froze" "more cars on the roads" "ЗАРАВКА НЕ РАБОТАЕТ"' },
    { value: 'junk', description: 'Not feedback on the game: ads, links to unrelated things, gibberish, an empty insult, or a joke demand that mocks the game. "cheap followers t.me/x" "asdf asdf" "garbage game uninstall" "add a dancing banana as the boss" "hahaha"' },
  ],
};

const REPORT_KIND = {
  type: 'choice',
  name: 'kind',
  instructions: 'What is it?',
  choices: [
    { value: 'bug', description: 'Something is broken.' },
    { value: 'feature', description: 'A wish for something new.' },
    { value: 'feedback', description: 'Praise, a complaint or a question.' },
  ],
};

const COMMENT_KIND = {
  type: 'choice',
  name: 'kind',
  instructions: 'What is it? Read it with the thread or the message it replies to.',
  choices: [
    { value: 'bug', description: 'Something is broken. "The truck falls through the bridge."' },
    { value: 'feature', description: 'An explicit ask for something new or changed that the thread or the replied message is not already about. "Add a minimap and maps to buy." A report of what someone already asked for, did or said is not a feature.' },
    { value: 'question', description: 'A question about the game or how to take part. "How do I repair the engine?" "How do I vote?"' },
    { value: 'feedback', description: 'Praise, a complaint, or an explanation or opinion of how something already proposed or built should work. "Fights feel great now." "The new music is too loud." Replying to a landmark directions build: "I meant the directions should name places, like turn left at the old water tower." "I asked them to turn the tutorial tips into a quest."' },
    { value: 'chatter', description: 'Asks, reports and wishes nothing: greetings, thanks, talk between players. "Hi all." "Thanks!" "Anyone online?"' },
  ],
};

const LANGUAGE = {
  type: 'choice',
  name: 'language',
  instructions: 'Which language is the player text written in?',
  choices: [
    { value: 'en', description: 'English.' },
    { value: 'ru', description: 'Russian.' },
    { value: 'other', description: 'Any other language.' },
  ],
};

const RELEVANCE = {
  type: 'choice',
  name: 'relevance',
  instructions: 'The player text replies in the chat thread of the proposal or test build named under Thread, or was sent from that test build. Is it about that proposal or the change that build makes? A test build is the whole game, so a report about another part of the game, even a near one, is not about the change.',
  choices: [
    { value: 'parent', description: 'About it: it reacts to it, asks about it, or asks to change or fix it. Under a winch proposal: "Yes, build this." "The winch snaps on hills." "Make the winch cheaper." From a build of different sounds for armor hits and part hits: "Armor and part hits still sound the same." "The new hit sound is too loud."' },
    { value: 'other', description: 'A separate bug, wish or question the thread does not cover. Under a winch proposal: "Add a minimap and maps to buy." "My truck falls through the bridge." From a build of different sounds for armor hits and part hits: "Misses are still too random, shots fly in weird cones." "The raiders aim too well."' },
  ],
};

const ROUTE = {
  type: 'choice',
  name: 'route',
  instructions: 'It comments on a test build of a change. What does the change need?',
  choices: [
    { value: 'none', description: 'Nothing.' },
    { value: 'patch', description: 'A fix: something is broken.' },
    { value: 'redesign', description: 'A rethink: it works but misses its point.' },
  ],
};

const JUNK_VALUES = GAME_JUNK.choices.map((choice) => choice.value) as ('feedback' | 'junk')[];
const COMMENT_KINDS = COMMENT_KIND.choices.map((choice) => choice.value) as DecisionKind[];
const REPORT_KINDS = REPORT_KIND.choices.map((choice) => choice.value) as DecisionKind[];
const RELEVANCES = RELEVANCE.choices.map((choice) => choice.value) as Relevance[];
const LANGUAGES = LANGUAGE.choices.map((choice) => choice.value);
const ROUTES = ROUTE.choices.map((choice) => choice.value) as PublicRoute[];

type Answer = { type?: unknown; name?: unknown; choice?: unknown; probabilities?: unknown };

type Question = { type: string; name: string; instructions: string; choices: { value: string; description: string }[] };

const isTransientStatus = (status: number): boolean => status === 408 || status === 429 || status >= 500;

async function post(cfg: FilterConfig, fetch: typeof globalThis.fetch, input: string, questions: Question[]): Promise<Response> {
  try {
    return await fetch(ENDPOINT, {
      method: 'POST',
      signal: AbortSignal.timeout(cfg.filterTimeoutSeconds * 1000),
      headers: { authorization: `Bearer ${cfg.openaiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: cfg.filterModel, input, questions }),
    });
  } catch (error) {
    throw new TransientFilterError(`The filter call did not complete: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function ask(cfg: FilterConfig, fetch: typeof globalThis.fetch, input: string, questions: Question[]): Promise<Answer[]> {
  const response = await post(cfg, fetch, input, questions);
  const failed = `The filter call failed with status ${response.status}.`;
  if (isTransientStatus(response.status)) throw new TransientFilterError(failed);
  if (response.status !== 200) throw new Error(failed);
  return answersOf(await response.json(), cfg.filterJunkMin);
}

export function filterWith(cfg: FilterConfig, fetch: typeof globalThis.fetch): Classify {
  return async (input) => decide(cfg, input, await ask(cfg, fetch, inputText(input), questionsFor(input)));
}

export function publicFilterWith(cfg: FilterConfig, fetch: typeof globalThis.fetch): PublicFilter {
  return { classify: filterWith(cfg, fetch) };
}

const hasParent = (input: FilterInput): input is FilterInput & { parent: string } => typeof input.parent === 'string' && input.parent.trim() !== '';

function inputText(input: FilterInput): string {
  const thread = hasParent(input) ? `Thread: ${input.parent.trim()}\n\n` : '';
  const replying = input.context ? `Replying to: ${input.context.replace(/\s+/g, ' ').trim()}\n\n` : '';
  return `Game: ${GAME}\n\n${thread}${replying}Player text: ${input.text}`;
}

function commentQuestions(input: FilterInput): Question[] {
  const relevance = hasParent(input) ? [RELEVANCE] : [];
  return [input.origin === 'chat' ? CHAT_JUNK : GAME_JUNK, COMMENT_KIND, ROUTE, ...relevance, LANGUAGE];
}

function questionsFor(input: FilterInput): Question[] {
  return input.source === 'report' ? [GAME_JUNK, REPORT_KIND] : commentQuestions(input);
}

function relevanceOf(input: FilterInput, answers: Answer[]): Relevance {
  if (hasParent(input)) return choice(answers, 'relevance', RELEVANCES);
  return input.source === 'comment' ? 'parent' : 'other';
}

function languageOf(input: FilterInput, answers: Answer[]): Pick<Decision, 'language'> {
  if (input.source === 'report') return {};
  return { language: choice(answers, 'language', LANGUAGES) === 'ru' ? 'ru' : 'en' };
}

function answersOf(body: unknown, junkMin: number): Answer[] {
  const answers = (body as { answers?: unknown } | null)?.answers;
  if (!Array.isArray(answers)) throw new Error('The filter response has no answers.');
  const refused = (answers as Answer[]).filter((answer) => answer.type === 'refusal').map((answer) => String(answer.name));
  if (refused.length > 0) throw new FilterRefusalError(refused, scoredAsJunk(answers as Answer[], refused, junkMin));
  return answers as Answer[];
}

function scoredAsJunk(answers: Answer[], refused: string[], junkMin: number): boolean {
  if (refused.includes('junk')) return false;
  return probabilities(answers, 'junk', JUNK_VALUES).junk >= junkMin;
}

type Verdict = Pick<Decision, 'verdict' | 'sincere' | 'intent'>;

function junkVerdict(cfg: FilterConfig, answers: Answer[]): Verdict {
  const odds = probabilities(answers, 'junk', JUNK_VALUES);
  const junk = odds.junk >= cfg.filterJunkMin;
  return { verdict: junk ? 'reject' : 'accept', sincere: odds.feedback, intent: junk ? 'junk' : 'sincere' };
}

function decide(cfg: FilterConfig, input: FilterInput, answers: Answer[]): Decision {
  return {
    ...junkVerdict(cfg, answers),
    kind: choice(answers, 'kind', input.source === 'report' ? REPORT_KINDS : COMMENT_KINDS),
    route: input.source === 'comment' ? choice(answers, 'route', ROUTES) : 'none',
    relevance: relevanceOf(input, answers),
    ...languageOf(input, answers),
  };
}

function probabilities<T extends string>(answers: Answer[], name: string, allowed: readonly T[]): Record<T, number> {
  const found = answers.find((answer) => answer.name === name);
  if (found?.type !== 'choice' || !Array.isArray(found.probabilities)) throw new Error(`The filter response has no choice answer for ${name}.`);
  const entries = (found.probabilities as { value?: unknown; probability?: unknown }[]).map((entry) => [entry.value, entry.probability]);
  const valid = entries.every(([value, probability]) => allowed.includes(value as T) && typeof probability === 'number' && probability >= 0 && probability <= 1);
  if (!valid || entries.length !== allowed.length) throw new Error(`The filter answer has bad ${name} probabilities.`);
  return Object.fromEntries(entries) as Record<T, number>;
}

function choice<T extends string>(answers: Answer[], name: string, allowed: readonly T[]): T {
  const found = answers.find((answer) => answer.name === name);
  if (found?.type !== 'choice') throw new Error(`The filter response has no choice answer for ${name}.`);
  if (typeof found.choice !== 'string' || !allowed.includes(found.choice as T)) throw new Error(`The filter answer has a bad ${name}.`);
  return found.choice as T;
}
