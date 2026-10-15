import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { liftEndedPause, pauseFile, pauseForUsageLimit, pidAlive, readPause, writePause, type PauseRecord } from './pause';

let home = '';
beforeEach(() => {
  mkdirSync('tmp', { recursive: true });
  home = mkdtempSync('tmp/factory-pause-');
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

const record = (extra: Partial<PauseRecord> = {}): PauseRecord => ({ kind: 'member', note: 'Hermes runs checks for #4', by: 'Hermes', at: '2026-01-01T00:00:00.000Z', ...extra });

describe('readPause', () => {
  it('is null without the pause file', () => {
    expect(readPause(home)).toBeNull();
  });

  it('gives back the record that writePause wrote', () => {
    writePause(home, record({ pid: 1234 }));
    expect(readPause(home)).toEqual(record({ pid: 1234 }));
    expect(JSON.parse(readFileSync(pauseFile(home), 'utf8'))).toEqual(record({ pid: 1234 }));
  });

  it('fails loud on text, an empty file and a record of the wrong shape', () => {
    writeFileSync(pauseFile(home), 'Hermes repairs #4\n');
    expect(() => readPause(home)).toThrow();
    writeFileSync(pauseFile(home), '');
    expect(() => readPause(home)).toThrow();
    writeFileSync(pauseFile(home), '[]');
    expect(() => readPause(home)).toThrow('not a record');
    writeFileSync(pauseFile(home), JSON.stringify({ ...record(), kind: 'hand' }));
    expect(() => readPause(home)).toThrow('no valid kind');
    writeFileSync(pauseFile(home), JSON.stringify({ ...record(), note: undefined }));
    expect(() => readPause(home)).toThrow('no valid note');
    writeFileSync(pauseFile(home), JSON.stringify({ ...record(), pid: 'soon' }));
    expect(() => readPause(home)).toThrow('no valid pid');
    writeFileSync(pauseFile(home), JSON.stringify({ ...record(), pid: 0 }));
    expect(() => readPause(home)).toThrow('no valid pid');
    writeFileSync(pauseFile(home), JSON.stringify({ ...record(), resetsAt: 'tomorrow' }));
    expect(() => readPause(home)).toThrow('no valid resetsAt');
  });
});

describe('pauseForUsageLimit', () => {
  it('writes a usage-limit record with the message as its note', () => {
    pauseForUsageLimit(home, "You've hit your weekly limit", new Date('2026-02-03T04:05:06.000Z'));
    expect(readPause(home)).toEqual({ kind: 'usage-limit', note: "You've hit your weekly limit", by: 'factory', at: '2026-02-03T04:05:06.000Z' });
  });

  it('keeps a pause that is already there', () => {
    writePause(home, record());
    pauseForUsageLimit(home, 'limit', new Date());
    expect(readPause(home)).toEqual(record());
  });
});

describe('pidAlive', () => {
  it('sees this process alive and a pid past the system limit as ended', () => {
    expect(pidAlive(process.pid)).toBe(true);
    expect(pidAlive(2 ** 22 + 1)).toBe(false);
  });
});

describe('liftEndedPause', () => {
  it('removes a pause whose process ended and gives its record', () => {
    writePause(home, record({ pid: 1234 }));
    expect(liftEndedPause(home, (pid) => pid !== 1234)).toEqual(record({ pid: 1234 }));
    expect(existsSync(pauseFile(home))).toBe(false);
  });

  it('keeps a pause whose process still runs', () => {
    writePause(home, record({ pid: 1234 }));
    expect(liftEndedPause(home, () => true)).toBeNull();
    expect(existsSync(pauseFile(home))).toBe(true);
  });

  it('keeps a pause that names no process', () => {
    writePause(home, record());
    expect(liftEndedPause(home, () => false)).toBeNull();
    expect(existsSync(pauseFile(home))).toBe(true);
  });

  it('is null without a pause, and fails loud on a pause in text', () => {
    expect(liftEndedPause(home, () => false)).toBeNull();
    writeFileSync(pauseFile(home), 'Hermes runs checks\npid: 1234\n');
    expect(() => liftEndedPause(home, () => false)).toThrow();
    expect(existsSync(pauseFile(home))).toBe(true);
  });
});
