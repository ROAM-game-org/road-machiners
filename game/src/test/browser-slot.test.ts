import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { BROWSER_SLOT_STALE_MS, takeBrowserSlot } from '../../scripts/browser-slot.mjs';

const folders: string[] = [];

function slotFolder(): string {
  const folder = mkdtempSync(join(tmpdir(), 'browser-slots-'));
  folders.push(folder);
  return folder;
}

function quiet(): void {}

describe('browser slots', () => {
  afterEach(() => {
    for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
  });

  it('takes no slot when the folder is unset', async () => {
    const release = await takeBrowserSlot({}, quiet);
    expect(release).toBeTypeOf('function');
    release();
  });

  it('makes a second browser wait until the first frees its slot', async () => {
    const folder = slotFolder();
    const env = { ROAM_BROWSER_SLOTS: folder, ROAM_BROWSER_SLOT_COUNT: '1' };
    const waits: string[] = [];
    const first = await takeBrowserSlot(env, quiet);
    let secondHeld = false;
    const second = takeBrowserSlot(env, (line: string) => waits.push(line)).then((release) => {
      secondHeld = true;
      return release;
    });
    await new Promise((done) => setTimeout(done, 50));
    expect(secondHeld).toBe(false);
    expect(waits).toHaveLength(1);
    first();
    const release = await second;
    expect(readdirSync(folder)).toEqual(['slot-0']);
    release();
    expect(readdirSync(folder)).toEqual([]);
  });

  it('takes over a slot whose holder stopped its heartbeat', async () => {
    const folder = slotFolder();
    const dead = join(folder, 'slot-0');
    mkdirSync(dead);
    writeFileSync(join(dead, 'owner'), 'gone-container 7');
    const old = new Date(Date.now() - BROWSER_SLOT_STALE_MS - 1000);
    utimesSync(dead, old, old);
    const release = await takeBrowserSlot({ ROAM_BROWSER_SLOTS: folder, ROAM_BROWSER_SLOT_COUNT: '1' }, quiet);
    expect(readFileSync(join(dead, 'owner'), 'utf8')).not.toBe('gone-container 7');
    release();
    expect(existsSync(dead)).toBe(false);
  });

  it('refuses a slot count that is not a whole number above 0', async () => {
    await expect(takeBrowserSlot({ ROAM_BROWSER_SLOTS: slotFolder(), ROAM_BROWSER_SLOT_COUNT: '0' }, quiet)).rejects.toThrow('ROAM_BROWSER_SLOT_COUNT');
  });
});

describe('browser launches', () => {
  it('go through gpu.mjs, so every browser takes a slot', () => {
    const scripts = join(__dirname, '../../scripts');
    const raw = readdirSync(scripts).filter((file) => file.endsWith('.mjs') && file !== 'gpu.mjs' && readFileSync(join(scripts, file), 'utf8').includes('chromium.launch('));
    expect(raw).toEqual([]);
  });
});
