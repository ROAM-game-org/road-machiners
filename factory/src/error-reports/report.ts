import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping';

import type { ReportBuild } from '../sourcemaps';

export type ReportContext = {
  build: ReportBuild | '';
  version: string;
  userAgent: string;
  language: string;
  screen: { width: number; height: number; pixelRatio: number };
  turn: number | null;
  log: string[];
  world: object | null;
  autosave: string | null;
  autosaveIsWorld: boolean;
};

export type ErrorReport = Omit<ReportContext, 'language' | 'screen'> & Partial<Pick<ReportContext, 'language' | 'screen'>> & {
  build: ReportBuild;
  error: { name: string; message: string; stack: string };
  drive: object | null;
};

export type RejectReason = 'origin' | 'address' | 'rate' | 'size' | 'shape' | 'commit' | 'stack' | 'disk' | 'feedback-rate' | 'filter';

export class Rejected extends Error {
  constructor(readonly reason: RejectReason, readonly status: number, message: string) {
    super(message);
  }
}

export class RateLimited extends Rejected {
  constructor(readonly resetAt: Date) {
    super('feedback-rate', 429, 'Too many reports from this address this hour.');
  }
}

const BUILDS: readonly string[] = ['release', 'dev', 'candidate'];
const VERSION = /^\d+\.\d+\.\d+\+([0-9a-f]{7,40})$/;
const LANGUAGE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3}$/;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === 'string';
const orNull = (check: (value: unknown) => boolean) => (value: unknown) => value === null || check(value);

const orMissing = (check: (value: unknown) => boolean) => (value: unknown) => value === undefined || check(value);
const isSize =(value: unknown): boolean => typeof value === 'number' && Number.isFinite(value) && value >= 0;

const CONTEXT_FIELDS: Record<keyof ReportContext, (value: unknown) => boolean> = {
  build: (value) => isString(value) && (value === '' || BUILDS.includes(value)),
  version: (value) => isString(value) && VERSION.test(value),
  userAgent: isString,
  language: (value) => isString(value) && LANGUAGE.test(value),
  screen: (value) => isObject(value) && isSize(value.width) && isSize(value.height) && isSize(value.pixelRatio),
  turn: orNull((value) => Number.isInteger(value)),
  log: (value) => Array.isArray(value) && value.every(isString),
  world: orNull(isObject),
  autosave: orNull(isString),
  autosaveIsWorld: (value) => typeof value === 'boolean',
};

const ERROR_FIELDS: Record<keyof ErrorReport, (value: unknown) => boolean> = {
  ...CONTEXT_FIELDS,
  build: (value) => isString(value) && BUILDS.includes(value),
  language: orMissing(CONTEXT_FIELDS.language),
  screen: orMissing(CONTEXT_FIELDS.screen),
  error: (value) => isObject(value) && isString(value.name) && isString(value.message) && isString(value.stack),
  drive: orNull(isObject),
};

function checked<T>(value: unknown, fields: Record<string, (value: unknown) => boolean>, what: string): T {
  if (!isObject(value)) throw new Rejected('shape', 400, `The ${what} is not a JSON object.`);
  const bad = Object.entries(fields).filter(([field, check]) => !check(value[field])).map(([field]) => field);
  if (bad.length > 0) throw new Rejected('shape', 400, `The ${what} has bad fields: ${bad.join(', ')}.`);
  return value as T;
}

export const parseReport = (value: unknown): ErrorReport => checked(value, ERROR_FIELDS, 'report');
export const parseContext = (value: unknown): ReportContext => checked(value, CONTEXT_FIELDS, 'report context');

export function commitOf(report: Pick<ReportContext, 'version'>): string {
  return (VERSION.exec(report.version) as RegExpExecArray)[1];
}

export type Frame = { source: string; line: number; column: number; name: string | null };
type RawFrame = { url: string; line: number; column: number };

const FRAME = /(?:\(|@|at )(\S+?):(\d+):(\d+)\)?$/;

function rawFrames(stack: string): RawFrame[] {
  return stack.split('\n').flatMap((line) => {
    const match = FRAME.exec(line.trim());
    return match ? [{ url: match[1], line: Number(match[2]), column: Number(match[3]) }] : [];
  });
}

export function mapFrames(stack: string, mapDir: string): Frame[] {
  const maps = existsSync(mapDir) ? mapFiles(mapDir) : new Map<string, string>();
  const loaded = new Map<string, TraceMap>();
  return rawFrames(stack).flatMap((frame) => {
    const path = maps.get(`${basename(frame.url.split(/[?#]/)[0])}.map`);
    if (!path) return [];
    if (!loaded.has(path)) loaded.set(path, new TraceMap(readFileSync(path, 'utf8')));
    const found = originalPositionFor(loaded.get(path) as TraceMap, { line: frame.line, column: frame.column - 1 });
    if (found.source === null || found.line === null) return [];
    return [{ source: sourcePath(found.source), line: found.line, column: found.column + 1, name: found.name }];
  });
}

function mapFiles(dir: string): Map<string, string> {
  const files = readdirSync(dir, { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.map'));
  return new Map(files.map((file) => [basename(file), join(dir, file)]));
}

function sourcePath(source: string): string {
  return source.replace(/^(\.\.\/)+/, '');
}

const FINGERPRINT_FRAMES = 3;

export function fingerprintOf(error: ErrorReport['error'], frames: readonly Frame[]): string {
  const game = frames.filter((frame) => !frame.source.includes('node_modules'));
  const top = (game.length > 0 ? game : frames).slice(0, FINGERPRINT_FRAMES).map((frame) => `${frame.source}:${frame.name ?? ''}`);
  const message = error.message
    .replace(/[a-z][a-z0-9+.-]*:\/\/\S+/gi, 'URL')
    .replace(/\S*[A-Za-z]\S*?[_./-]\S*[A-Za-z0-9]/g, 'NAME')
    .replace(/-?\d+(\.\d+)?/g, 'N');
  return createHash('sha256').update([error.name, message, ...top].join('\n')).digest('hex').slice(0, 16);
}
