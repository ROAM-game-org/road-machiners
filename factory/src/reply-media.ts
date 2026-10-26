import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_BYTES, MAX_FILES, detectType, imageSize, validSize, type MediaEntry } from './media';

const SKIPPED = '.skipped';
const TELEGRAM = '.telegram';
const FOLDER = 'committee';
const MANIFEST = 'committee.json';

export type Download = (fileId: string) => Promise<Buffer>;
type TelegramNote = { fileId: string; byName: string | null; by: string; text: string | null };

export function replyMediaDir(home: string, post: number): string {
  return join(home, 'inbox', 'media', `post-${post}`);
}

export async function adoptReplyMedia(home: string, post: number, issueDir: string, by: string, download: Download): Promise<MediaEntry[]> {
  const from = replyMediaDir(home, post);
  const source = replySource(by, null);
  let names: string[];
  try {
    names = existsSync(from) ? readdirSync(from).filter((name) => !name.endsWith('.tmp')).sort(byMessage) : [];
    if (names.length > 0) mkdirSync(join(issueDir, FOLDER), { recursive: true });
  } catch (error) {
    return [{ url: `telegram:post-${post}`, source, status: 'failed', reason: `the factory could not read the files: ${messageOf(error)}` }];
  }
  if (names.length === 0) return [];
  const entries: MediaEntry[] = [];
  for (const name of names) entries.push(await adoptFile(join(from, name), `post-${post}-${name}`, issueDir, by, download));
  writeFileSync(join(issueDir, MANIFEST), JSON.stringify(merged(readCommitteeMedia(issueDir), entries), null, 2));
  rmSync(from, { recursive: true, force: true });
  return entries;
}

function adoptFile(path: string, name: string, issueDir: string, by: string, download: Download): Promise<MediaEntry> | MediaEntry {
  return name.endsWith(TELEGRAM) ? adoptNote(path, name.slice(0, -TELEGRAM.length), issueDir, by, download) : safeAdopt(path, name, issueDir, replySource(by, null));
}

function replySource(by: string, text: string | null): string {
  return text === null || text.trim() === '' ? `committee reply in Telegram by ${by}` : `committee reply in Telegram by ${by}, who wrote with it: ${JSON.stringify(text)}`;
}

function readNote(path: string): TelegramNote {
  const note = JSON.parse(readFileSync(path, 'utf8')) as Partial<TelegramNote>;
  if (typeof note.fileId !== 'string' || note.fileId === '') throw new Error('the note names no Telegram file');
  return { fileId: note.fileId, byName: note.byName ?? null, by: note.by ?? '', text: note.text ?? null };
}

async function downloadTwice(download: Download, fileId: string): Promise<Buffer> {
  try {
    return await download(fileId);
  } catch {
    return download(fileId);
  }
}

async function adoptNote(path: string, name: string, issueDir: string, by: string, download: Download): Promise<MediaEntry> {
  let note: TelegramNote;
  try {
    note = readNote(path);
  } catch (error) {
    return { url: `telegram:${name}`, source: replySource(by, null), status: 'failed', reason: `the chat bot left a note the factory could not read: ${messageOf(error)}` };
  }
  const source = replySource(note.byName ?? (note.by || by), note.text);
  let data: Buffer;
  try {
    data = await downloadTwice(download, note.fileId);
  } catch (error) {
    return { url: `telegram:${name}`, source, status: 'failed', reason: `Telegram did not give it after two tries: ${messageOf(error)}` };
  }
  try {
    return adoptBytes(issueDir, name, source, data);
  } catch (error) {
    return { url: `telegram:${name}`, source, status: 'failed', reason: `the factory could not keep it: ${messageOf(error)}` };
  }
}

export function adoptChatImage(issueDir: string, name: string, source: string, data: Buffer | null): MediaEntry {
  mkdirSync(issueDir, { recursive: true });
  const entry = data === null ? { url: `telegram:${name}`, source, status: 'failed' as const, reason: 'Telegram did not give the image' } : adoptBytes(issueDir, name, source, data);
  writeFileSync(join(issueDir, MANIFEST), JSON.stringify(merged(readCommitteeMedia(issueDir), [entry]), null, 2));
  return entry;
}

function adoptBytes(issueDir: string, name: string, source: string, data: Buffer): MediaEntry {
  mkdirSync(join(issueDir, FOLDER), { recursive: true });
  const path = join(issueDir, FOLDER, `${name}.tmp`);
  writeFileSync(path, data);
  const entry = safeAdopt(path, name, issueDir, source);
  rmSync(path, { force: true });
  return entry;
}

function merged(earlier: MediaEntry[], added: MediaEntry[]): MediaEntry[] {
  const seen = new Set<string>();
  const unique = [...added].reverse().concat([...earlier].reverse()).filter((entry) => {
    if (entry.sha256 === undefined) return true;
    if (seen.has(entry.sha256)) return false;
    seen.add(entry.sha256);
    return true;
  });
  return unique.slice(0, MAX_FILES).reverse();
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function safeAdopt(path: string, name: string, issueDir: string, source: string): MediaEntry {
  try {
    return adopt(path, name, issueDir, source);
  } catch (error) {
    return { url: `telegram:${name}`, source, status: 'failed', reason: `the factory could not read it: ${messageOf(error)}` };
  }
}

function byMessage(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true });
}

function adopt(path: string, name: string, issueDir: string, source: string): MediaEntry {
  const url = `telegram:${name}`;
  if (name.endsWith(SKIPPED)) return { url: url.slice(0, -SKIPPED.length), source, status: 'failed', reason: `the chat bot could not keep it: ${readFileSync(path, 'utf8').trim()}` };
  if (statSync(path).size > MAX_BYTES) return { url, source, status: 'failed', reason: `it is over the ${MAX_BYTES} byte limit` };
  const data = readFileSync(path);
  const type = detectType(data);
  if (type === null) return { url, source, status: 'failed', bytes: data.length, reason: 'it is not a PNG, JPEG, GIF or WebP image' };
  const size = imageSize(data, type);
  if (!validSize(size)) return { url, source, status: 'failed', bytes: data.length, reason: `it does not decode as a ${type} image` };
  const sha256 = createHash('sha256').update(data).digest('hex');
  const file = `${FOLDER}/${sha256.slice(0, 16)}.${type === 'jpeg' ? 'jpg' : type}`;
  renameSync(path, join(issueDir, file));
  return { url, source, status: 'ok', file, type, ...size, bytes: data.length, sha256 };
}

export function readCommitteeMedia(issueDir: string): MediaEntry[] {
  const path = join(issueDir, MANIFEST);
  let entries: MediaEntry[];
  try {
    entries = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as MediaEntry[]) : [];
  } catch {
    return [];
  }
  return entries.map((entry) => entry.status === 'ok' && !existsSync(join(issueDir, entry.file ?? ''))
    ? { url: entry.url, source: entry.source, status: 'failed', reason: 'its file is gone from the media folder' }
    : entry);
}

export function dropReplyMedia(home: string, posts: number[]): void {
  for (const post of posts) rmSync(replyMediaDir(home, post), { recursive: true, force: true });
}

export function replyMediaLines(entries: MediaEntry[]): string {
  if (entries.length === 0) return '';
  const lines = entries.map((entry) => entry.status === 'ok'
    ? `- ${entry.type}, ${entry.width}x${entry.height}, ${entry.bytes} bytes, sha256 ${entry.sha256}`
    : `- not available: ${entry.reason}`);
  return `\n\nThe reply came with ${entries.length} file(s) in Telegram. They stay private: the agent sees them in its media folder, and they are not posted here.\n${lines.join('\n')}`;
}
