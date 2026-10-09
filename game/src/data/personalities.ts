import type { TopicId, Voice } from './dialogue';
import type { RumorKind } from './rumors';

export const PERSONALITY_IDS = ['talkative', 'tightLipped', 'gossip', 'braggart', 'suspicious', 'kind', 'grim', 'pious'] as const;
export type PersonalityId = (typeof PERSONALITY_IDS)[number];

export type Gate = 'open' | 'price' | 'help' | 'closed';

export type Personality = {
  greeting: string;
  repeatLine: string;
  refusal: string;
  withholdLine: string | null;
  tollLine: string | null;
  gates: Partial<Record<TopicId, Gate>>;
  extraTopics: TopicId[];
  rumorKinds: RumorKind[];
  lines: Partial<Record<TopicId, Record<string, string>>>;
};

export type NpcTalk =Voice & { topics: TopicId[]; personality: Personality };

export const TALK_PRICE = 1000;

export const PERSONALITIES: Record<PersonalityId, Personality> = {
  talkative: {
    greeting: 'Good to hear a voice out here. Take your time.',
    repeatLine: 'I told you everything on that one. Ask me something new.',
    refusal: 'I would talk, but not to you.',
    withholdLine: null,
    tollLine: null,
    gates: {},
    extraTopics: [],
    rumorKinds: ['ship', 'sky', 'road', 'power'],
    lines: {
      directions: { answer: 'Sure thing. {town} lies {bearing} of you, about {distance} out. Mind the ruts and enjoy the drive.' },
      marketNews: { prices: 'Oh, I was just in {town}. {prices}. Tell me what you find there.' },
      rumor: { tell: 'Oh, yes. I passed something on my way, and I have been wanting to tell someone.' },
      tips: { tell: 'Here is something for the road. {tip}' },
      hearsay: { tell: 'Oh, I have one. {rumor}' },
    },
  },
  tightLipped: {
    greeting: 'Say what you want. I say little.',
    repeatLine: 'Said it once. Not again.',
    refusal: 'Nothing. Not a word.',
    withholdLine: 'Not for a stranger. Do me a favor first.',
    tollLine: 'That one costs {price}.',
    gates: { marketNews: 'help', rumor: 'price', tips: 'closed', hearsay: 'closed' },
    extraTopics: [],
    rumorKinds: [],
    lines: {
      directions: { answer: '{town}. {bearing}, about {distance}.' },
      marketNews: { prices: '{town}. {prices}. That is all.' },
      rumor: { tell: 'Passed something. Will not say what.' },
    },
  },
  gossip: {
    greeting: 'Oh, a new voice. I have heard so much lately.',
    repeatLine: 'I told you that one. Ask what else I know.',
    refusal: 'Fine, I will tell everyone how rude you were.',
    withholdLine: null,
    tollLine: null,
    gates: {},
    extraTopics: ['hearsayMore'],
    rumorKinds: ['ship', 'sky', 'tech', 'power', 'road', 'dire'],
    lines: {
      directions: { answer: '{town}, of course. It lies {bearing} of you, about {distance} out, and there is always talk there.' },
      marketNews: { prices: 'I was in {town} not long ago, and everyone was grumbling. {prices}.' },
      rumor: { tell: 'Oh, I saw something, and I will not be the only one who talks about it.' },
      tips: { tell: 'Keep this between us. {tip}' },
      hearsay: { tell: 'Have you not heard? {rumor}' },
      hearsayMore: { tell: 'And there is more. {rumor}' },
    },
  },
  braggart: {
    greeting: 'You are talking to the best driver in the basin.',
    repeatLine: 'Already told you. A great story gets told once.',
    refusal: 'You are not worth my time, and my time is worth a lot.',
    withholdLine: null,
    tollLine: null,
    gates: { marketNews: 'closed' },
    extraTopics: ['boast'],
    rumorKinds: ['power', 'tech'],
    lines: {
      directions: { answer: 'I have driven to {town} blind. It lies {bearing} of you, about {distance} out.' },
      rumor: { tell: 'I see things others drive past. I passed something, and I was the only one who noticed.' },
      tips: { tell: 'I always know the market. {tip}' },
      hearsay: { tell: 'I know people who know people. {rumor}' },
      boast: { tell: '{rumor}' },
    },
  },
  suspicious: {
    greeting: 'Who are you, and what do you want from me?',
    repeatLine: 'Same answer as before. Do not try me.',
    refusal: 'I do not talk to strangers.',
    withholdLine: 'Why should I tell you that? Help me first, and then we talk.',
    tollLine: 'Not for free. {price} and I talk.',
    gates: { directions: 'price', marketNews: 'closed', rumor: 'help', tips: 'closed', hearsay: 'help' },
    extraTopics: [],
    rumorKinds: ['power', 'dire'],
    lines: {
      directions: { answer: 'If you must know, {town} lies {bearing} of you, about {distance} out. Do not follow me there.' },
      rumor: { tell: 'I passed something. Maybe it was a trap, maybe not.' },
      hearsay: { tell: 'Keep your voice down. {rumor}' },
    },
  },
  kind: {
    greeting: 'Hello there. Are you all right out here?',
    repeatLine: 'I told you what I know. I wish I knew more.',
    refusal: 'I am sorry. I cannot talk now.',
    withholdLine: null,
    tollLine: null,
    gates: {},
    extraTopics: [],
    rumorKinds: ['road', 'sky'],
    lines: {
      directions: { answer: 'You are lost? {town} lies {bearing} of you, about {distance} out. Drive safe.' },
      marketNews: { prices: 'I was in {town} last. {prices}. I hope that helps you.' },
      rumor: { tell: 'I think so. I passed something that might help you.' },
      tips: { tell: 'This might save you some coin. {tip}' },
      hearsay: { tell: 'Something to keep in mind. {rumor}' },
    },
  },
  grim: {
    greeting: 'Another voice in the dust. Speak.',
    repeatLine: 'It was true the first time too.',
    refusal: 'Nothing to say. Nothing helps.',
    withholdLine: 'I do not give that to someone who has done nothing for me.',
    tollLine: 'Truth costs. {price}.',
    gates: { marketNews: 'price', rumor: 'help', tips: 'closed' },
    extraTopics: [],
    rumorKinds: ['dire', 'ship'],
    lines: {
      directions: { answer: '{town} lies {bearing} of you, about {distance} out. If the road lets you.' },
      marketNews: { prices: '{town}, last I saw. {prices}. It will be worse by now.' },
      rumor: { tell: 'I passed something. I wish I had not.' },
      hearsay: { tell: 'Hear this and remember it. {rumor}' },
    },
  },
  pious: {
    greeting: 'Peace on the road, stranger.',
    repeatLine: 'It has been said already, and it stays said.',
    refusal: 'I will pray for you, but I will not talk.',
    withholdLine: null,
    tollLine: null,
    gates: { marketNews: 'closed', tips: 'closed' },
    extraTopics: [],
    rumorKinds: ['ship', 'sky'],
    lines: {
      directions: { answer: '{town} lies {bearing} of you, about {distance} out. Go with open eyes.' },
      rumor: { tell: 'I was shown something on the road. I will tell you where.' },
      hearsay: { tell: 'It is told among the faithful. {rumor}' },
    },
  },
};
