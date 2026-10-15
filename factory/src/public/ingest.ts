import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { reportFailure } from '../fail';
import type { Ctx } from '../types';
import type { PublicEvent, PublicStore } from './store';

export const publicInboxDir = (home: string): string => join(home, 'public-inbox');

type Fields = Record<string, unknown>;

class BadEvent extends Error {}

function text(fields: Fields, name: string): string {
  const value = fields[name];
  if (typeof value !== 'string') throw new BadEvent(`field "${name}" must be a string`);
  return value;
}

function integer(fields: Fields, name: string): number {
  const value = fields[name];
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new BadEvent(`field "${name}" must be an integer`);
  return value;
}

function integerOrNull(fields: Fields, name: string): number | null {
  return fields[name] === null ? null : integer(fields, name);
}

function optionalText(fields: Fields, name: string): string | null {
  const value = fields[name];
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new BadEvent(`field "${name}" must be a string or null`);
  return value;
}

function flag(fields: Fields, name: string): boolean {
  const value = fields[name];
  if (value !== undefined && typeof value !== 'boolean') throw new BadEvent(`field "${name}" must be a boolean`);
  return value === true;
}

function comment(base: Base, fields: Fields): PublicEvent {
  const reach = { addressed: flag(fields, 'addressed'), standalone: flag(fields, 'standalone') };
  return { ...base, kind: 'comment', threadId: integerOrNull(fields, 'threadId'), author: text(fields, 'author'), sender: text(fields, 'sender'), text: text(fields, 'text'), at: text(fields, 'at'), context: optionalText(fields, 'context'), ...reach };
}

const isWholeNumber = (value: unknown): boolean => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

function plainObject(fields: Fields, name: string): Fields {
  const value = fields[name];
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new BadEvent(`field "${name}" must be an object`);
  return value as Fields;
}

function counts(fields: Fields): Record<string, number> {
  const value = plainObject(fields, 'counts');
  if (!Object.values(value).every(isWholeNumber)) throw new BadEvent('field "counts" must hold whole numbers');
  return value as Record<string, number>;
}

function emoji(fields: Fields): string[] {
  const value = fields.emoji;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) throw new BadEvent('field "emoji" must be a list of strings');
  return value as string[];
}

type Base = { updateId: number; chat: string; messageId: number };

const KINDS: Record<PublicEvent['kind'], (base: Base, fields: Fields) => PublicEvent> = {
  'reaction-count': (base, fields) => ({ ...base, kind: 'reaction-count', counts: counts(fields) }),
  reaction: (base, fields) => ({ ...base, kind: 'reaction', user: text(fields, 'user'), emoji: emoji(fields) }),
  forward: (base, fields) => ({ ...base, kind: 'forward', channelChat: text(fields, 'channelChat'), channelMessageId: integer(fields, 'channelMessageId') }),
  comment,
};

function parseJson(raw: string): Fields {
  try {
    return plainObject({ event: JSON.parse(raw) }, 'event');
  } catch (error) {
    if (error instanceof BadEvent) throw new BadEvent('it is not a JSON object');
    throw new BadEvent('it is not valid JSON');
  }
}

export function parseEvent(raw: string): PublicEvent {
  const fields = parseJson(raw);
  const kind = fields.kind;
  if (typeof kind !== 'string' || !Object.hasOwn(KINDS, kind)) throw new BadEvent('field "kind" is not a known event kind');
  const base = { updateId: integer(fields, 'updateId'), chat: text(fields, 'chat'), messageId: integer(fields, 'messageId') };
  return KINDS[kind as PublicEvent['kind']](base, fields);
}

async function reject(ctx: Ctx, dir: string, name: string, reason: string): Promise<void> {
  const bad = join(dir, 'bad');
  mkdirSync(bad, { recursive: true });
  renameSync(join(dir, name), join(bad, name));
  await reportFailure(ctx, 'public', null, new Error(`Public inbox file ${name} was moved to bad: ${reason}`), null, []);
}

const INBOX_NAME = /^(\d+)\.json$/;

function inboxNames(dir: string): { named: string[]; stray: string[] } {
  const names = readdirSync(dir).filter((file) => file.endsWith('.json'));
  const stray = names.filter((name) => !INBOX_NAME.test(name));
  const id = (name: string): number => Number(INBOX_NAME.exec(name)![1]);
  const named = names.filter((name) => INBOX_NAME.test(name)).sort((x, y) => id(x) - id(y));
  return { named, stray };
}

export async function ingest(ctx: Ctx, store: PublicStore): Promise<void> {
  const dir = publicInboxDir(ctx.cfg.home);
  if (!existsSync(dir)) return;
  const { named, stray } = inboxNames(dir);
  for (const name of stray) await reject(ctx, dir, name, 'its name is not an update id plus .json');
  for (const name of named) {
    const path = join(dir, name);
    let event: PublicEvent;
    try {
      event = parseEvent(readFileSync(path, 'utf8'));
    } catch (error) {
      if (!(error instanceof BadEvent)) throw error;
      await reject(ctx, dir, name, error.message);
      continue;
    }
    store.applyEvent(event);
    rmSync(path);
  }
}
