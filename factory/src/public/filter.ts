import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Classify, Decision, DecisionIntent, DecisionKind, FilterConfig, FilterInput, Relevance } from './decision';
import type { PublicRoute } from './store';
import { NO_TOPIC, TOPIC_VALUES, TOPICS } from './topics';

const ENDPOINT = 'https://api.openai.com/v1/decisions';
const GAME = readFileSync(fileURLToPath(new URL('../../prompts/filter-game.md', import.meta.url)), 'utf8').trim();

const INTENT = {
  type: 'choice',
  name: 'intent',
  instructions: 'Is the player text sincere about this game?',
  choices: [
    { value: 'sincere', description: 'A real bug, wish or opinion. "Truck falls through the bridge." "Add a radio to the cab." "Fights feel worse since the update."' },
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
  instructions: 'What is it?',
  choices: [
    { value: 'bug', description: 'Something is broken. "The truck falls through the bridge."' },
    { value: 'feature', description: 'A wish for something new or changed. "Add a minimap and maps to buy."' },
    { value: 'question', description: 'A question about the game or how to take part. "How do I repair the engine?" "How do I vote?"' },
    { value: 'feedback', description: 'Praise or a complaint. "Fights feel great now." "The new music is too loud."' },
    { value: 'chatter', description: 'Asks, reports and wishes nothing: greetings, thanks, talk between players. "Hi all." "Thanks!" "Anyone online?"' },
  ],
};

const RELEVANCE = {
  type: 'choice',
  name: 'relevance',
  instructions: 'The player text replies in the chat thread of the proposal or test build named under Thread. Is it about that proposal or build?',
  choices: [
    { value: 'parent', description: 'About it: it reacts to it, asks about it, or asks to change or fix it. Under a winch proposal: "Yes, build this." "The winch snaps on hills." "Make the winch cheaper."' },
    { value: 'other', description: 'A separate bug, wish or question the thread does not cover. Under a winch proposal: "Add a minimap and maps to buy." "My truck falls through the bridge."' },
  ],
};

const TOPIC = {
  type: 'choice',
  name: 'topic',
  instructions: 'If it asks a question about the game, which topic answers it?',
  choices: [
    ...TOPICS.map((topic) => ({ value: topic.value, description: topic.description })),
    { value: NO_TOPIC, description: 'It asks no question, or no topic above answers it.' },
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
const ROUTES = ROUTE.choices.map((choice) => choice.value) as PublicRoute[];

type Answer = { type?: unknown; name?: unknown; choice?: unknown; probabilities?: unknown };

export function filterWith(cfg: FilterConfig, fetch: typeof globalThis.fetch): Classify {
  return async (input) => {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      signal: AbortSignal.timeout(cfg.filterTimeoutSeconds * 1000),
      headers: { authorization: `Bearer ${cfg.openaiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: cfg.filterModel, input: inputText(input), questions: questionsFor(input) }),
    });
    if (response.status !== 200) throw new Error(`The filter call failed with status ${response.status}.`);
    return decide(cfg, input, answersOf(await response.json()));
  };
}

const hasParent = (input: FilterInput): input is FilterInput & { parent: string } => typeof input.parent === 'string' && input.parent.trim() !== '';

function inputText(input: FilterInput): string {
  const thread = hasParent(input) ? `Thread: ${input.parent.trim()}\n\n` : '';
  return `Game: ${GAME}\n\n${thread}Player text: ${input.text}`;
}

function questionsFor(input: FilterInput) {
  if (input.source === 'report') return [INTENT, REPORT_KIND];
  const relevance = hasParent(input) ? [RELEVANCE] : [];
  return input.source === 'comment' ? [INTENT, CHAT_KIND, ROUTE, TOPIC, ...relevance] : [INTENT, CHAT_KIND, TOPIC, ...relevance];
}

function relevanceOf(input: FilterInput, answers: Answer[]): Relevance {
  if (hasParent(input)) return choice(answers, 'relevance', RELEVANCES);
  return input.source === 'comment' ? 'parent' : 'other';
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
    topic: input.source === 'report' ? NO_TOPIC : choice(answers, 'topic', TOPIC_VALUES),
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
