import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { TransientFilterError, type Classify, type Decision, type DecisionIntent, type DecisionKind, type FilterConfig, type FilterInput, type PublicFilter, type Relevance } from './decision';
import type { PublicRoute } from './store';

const ENDPOINT = 'https://api.openai.com/v1/decisions';
const GAME = readFileSync(fileURLToPath(new URL('../../prompts/filter-game.md', import.meta.url)), 'utf8').trim();

const INTENT = {
  type: 'choice',
  name: 'intent',
  instructions: 'Is the player text sincere about this game? Read it together with the message it replies to: a short ask that points at a replied report is as sincere as that report.',
  choices: [
    { value: 'sincere', description: 'A real bug, wish or opinion, or an ask to act on the replied one. "Truck falls through the bridge." "Add a radio to the cab." "Fights feel worse since the update." Replying to "I rammed a raider, the truck bounced back and now it is stuck": "@bot file this bug please."' },
    { value: 'troll', description: 'A joke, mockery, an empty insult, or a demand that clashes with the game. "Add anime girls." "Worst game ever." "Make the truck fly to space." "ADD EVERYTHING NOW, MAKE IT PERFECT."' },
    { value: 'spam', description: 'Ads, scams or gibberish. "Buy crypto t.me/x." "asdfgh."' },
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

const CHAT_KIND = {
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

const FILING = {
  type: 'choice',
  name: 'filing',
  instructions: 'The player wrote to the bot. Should the bot file this as a bug or an idea? A clear report of something broken in the game is a request to file it, even with no word like file or report: the player tells the bot what goes wrong so it gets fixed. An idea is filed only when the player explicitly asks the bot to file, report, record or pass it on.',
  choices: [
    { value: 'yes', description: 'A clear report of something broken, or an explicit ask to file. "@bot the truck gets stuck after it hits a rock or a building and will not drive out in auto or manual mode, please fix." "@bot the fuel gauge shows full when the tank is empty." "@bot please file this bug: the truck falls through the bridge." "Record this idea: add a minimap."' },
    { value: 'no', description: 'Anything else: a greeting, thanks, a question, a remark, a vague complaint with nothing said about what breaks, a wish said in passing, talk about work. "@bot hi." "@bot cool game." "@bot is the bridge bug fixed yet?" "@bot add a minimap?" "@bot I asked them to make it a quest."' },
  ],
};

const FILINGS = FILING.choices.map((choice) => choice.value);

const NO_WORK = 'none';

function workQuestion(work: string[]): Question {
  const listed = work.map((text, index) => ({ value: String(index + 1), description: `Work ${index + 1}: ${text}` }));
  return {
    type: 'choice',
    name: 'work',
    instructions: 'Each listed work is a proposal, a build or an issue the factory already has. Which one is the player text about? Pick it when the text discusses, explains, clarifies, asks about, reports a problem with, or asks for the same thing as that work. Pick none when the text asks for something that none of them covers.',
    choices: [...listed, { value: NO_WORK, description: 'The text is about none of the listed work.' }],
  };
}

const RELEVANCE = {
  type: 'choice',
  name: 'relevance',
  instructions: 'The player text replies in the chat thread of the proposal or test build named under Thread. Is it about that proposal or build? It is about it only when it concerns what that proposal or build adds or changes. A complaint about another part of the game is other, also when it sounds like a general rework, because routing it would send an unrelated build back to design.',
  choices: [
    { value: 'parent', description: 'About it: it reacts to it, asks about it, or asks to change or fix it. Under a winch proposal: "Yes, build this." "The winch snaps on hills." "Make the winch cheaper."' },
    { value: 'other', description: 'A separate bug, wish or question the thread does not cover. Under a winch proposal: "Add a minimap and maps to buy." "My truck falls through the bridge." Under a build of armor hit sounds: "Misses are often still too random, flying not towards the enemy but in uniform cones."' },
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

const INTENTS = INTENT.choices.map((choice) => choice.value) as DecisionIntent[];
const KINDS = CHAT_KIND.choices.map((choice) => choice.value) as DecisionKind[];
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
  return answersOf(await response.json());
}

export function filterWith(cfg: FilterConfig, fetch: typeof globalThis.fetch): Classify {
  return async (input) => decide(cfg, input, await ask(cfg, fetch, inputText(input), questionsFor(input)));
}

export function publicFilterWith(cfg: FilterConfig, fetch: typeof globalThis.fetch): PublicFilter {
  return { classify: filterWith(cfg, fetch) };
}

const hasParent = (input: FilterInput): input is FilterInput & { parent: string } => typeof input.parent === 'string' && input.parent.trim() !== '';

const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim();

function inputText(input: FilterInput): string {
  const thread = hasParent(input) ? `Thread: ${input.parent.trim()}\n\n` : '';
  const replying = input.context ? `Replying to: ${oneLine(input.context)}\n\n` : '';
  return `Game: ${GAME}\n\n${thread}${replying}Player text: ${input.text}`;
}

const knownWork = (input: FilterInput): string[] => input.work ?? [];

function chatQuestions(input: FilterInput): Question[] {
  const route = input.source === 'comment' ? [ROUTE] : [];
  const relevance = hasParent(input) ? [RELEVANCE] : [];
  const work = knownWork(input).length > 0 ? [workQuestion(knownWork(input))] : [];
  const filing = input.addressed ? [FILING] : [];
  return [INTENT, CHAT_KIND, ...route, ...relevance, ...work, ...filing, LANGUAGE];
}

function questionsFor(input: FilterInput): Question[] {
  return input.source === 'report' ? [INTENT, REPORT_KIND] : chatQuestions(input);
}

function relevanceOf(input: FilterInput, answers: Answer[]): Relevance {
  if (hasParent(input)) return choice(answers, 'relevance', RELEVANCES);
  return input.source === 'comment' ? 'parent' : 'other';
}

function workOf(input: FilterInput, answers: Answer[]): { work?: number } {
  const count = knownWork(input).length;
  if (count === 0) return {};
  const picked = choice(answers, 'work', [...Array.from({ length: count }, (_, index) => String(index + 1)), NO_WORK]);
  return picked === NO_WORK ? {} : { work: Number(picked) - 1 };
}

function filingOf(input: FilterInput, answers: Answer[]): boolean {
  return input.addressed === true && choice(answers, 'filing', FILINGS) === 'yes';
}

function chatJudgement(input: FilterInput, answers: Answer[]): Pick<Decision, 'work' | 'language' | 'filing'> {
  if (input.source === 'report') return {};
  return { ...workOf(input, answers), filing: filingOf(input, answers), language: choice(answers, 'language', LANGUAGES) === 'ru' ? 'ru' : 'en' };
}

function answersOf(body: unknown): Answer[] {
  const answers = (body as { answers?: unknown } | null)?.answers;
  if (!Array.isArray(answers)) throw new Error('The filter response has no answers.');
  const refused = (answers as Answer[]).filter((answer) => answer.type === 'refusal').map((answer) => String(answer.name));
  if (refused.length > 0) throw new Error(`The filter model refused to answer: ${refused.join(', ')}.`);
  return answers as Answer[];
}

function decide(cfg: FilterConfig, input: FilterInput, answers: Answer[]): Decision {
  const odds = probabilities(answers, 'intent', INTENTS);
  const sincere = odds.sincere >= cfg.filterSincereMin;
  return {
    verdict: sincere ? 'accept' : 'reject',
    sincere: odds.sincere,
    intent: sincere ? 'sincere' : odds.troll >= odds.spam ? 'troll' : 'spam',
    kind: choice(answers, 'kind', input.source === 'report' ? REPORT_KINDS : KINDS),
    route: input.source === 'comment' ? choice(answers, 'route', ROUTES) : 'none',
    relevance: relevanceOf(input, answers),
    ...chatJudgement(input, answers),
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
