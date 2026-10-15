import type { ReplyLanguage } from './decision';

export type ReplyText = {
  fileFailed: string;
  filedBug: (link: string) => string;
  filedIdea: (link: string) => string;
  alreadyFiled: (link: string) => string;
  closed: string;
  releaseCandidate: string;
  voting: string;
  approved: string;
  inWork: string;
  notBuilt: string;
  added: (link: string) => string;
  aboutWork: (link: string, status: string) => string;
};

const ENGLISH: ReplyText = {
  fileFailed: 'Thanks. I could not file this just now, and the factory team has been told.',
  filedBug: (link) => `Thanks. I filed this bug as ${link}\nTriage reads it next. Nothing is fixed yet.`,
  filedIdea: (link) => `Thanks. I filed this idea as ${link}\nTriage reads it next. If it needs a vote, it comes back to this chat as a proposal. Nothing is built yet.`,
  alreadyFiled: (link) => `This is already filed as ${link}`,
  closed: 'It is closed, and the issue says why.',
  releaseCandidate: 'It is built and waits for the next release.',
  voting: 'It waits for player votes as a proposal in this chat.',
  approved: 'It is approved and being finished.',
  inWork: 'It is being worked on.',
  notBuilt: 'It is open and not built yet.',
  added: (link) => `Thanks. I added this to the player comments of ${link}`,
  aboutWork: (link, status) => `Thanks. This is about ${link}, which the factory already has.\n${status}\nI added your message to its player comments. It opens no new issue or vote.`,
};

const RUSSIAN: ReplyText = {
  fileFailed: 'Спасибо. Сейчас не получилось это записать, команде фабрики уже сообщили.',
  filedBug: (link) => `Спасибо. Эта ошибка записана как ${link}\nДальше её прочитает триаж. Пока ничего не исправлено.`,
  filedIdea: (link) => `Спасибо. Эта идея записана как ${link}\nДальше её прочитает триаж. Если нужно голосование, она вернётся в этот чат как предложение. Пока ничего не сделано.`,
  alreadyFiled: (link) => `Это уже записано как ${link}`,
  closed: 'Задача закрыта, причина указана в ней.',
  releaseCandidate: 'Она сделана и ждёт следующего релиза.',
  voting: 'Она ждёт голосов игроков как предложение в этом чате.',
  approved: 'Её уже одобрили, и она доделывается.',
  inWork: 'Над ней уже работают.',
  notBuilt: 'Она открыта и ещё не сделана.',
  added: (link) => `Спасибо. Это добавлено в комментарии игроков к ${link}`,
  aboutWork: (link, status) => `Спасибо. Это про ${link}, она у фабрики уже есть.\n${status}\nВаше сообщение добавлено в комментарии игроков к ней. Новой задачи и голосования не будет.`,
};

export const textsFor = (language: ReplyLanguage | null): ReplyText => (language === 'ru' ? RUSSIAN : ENGLISH);
