import { mkdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';

const BEAT_MS = 5000;
const STALE_MS = 30000;
const POLL_MS = 1000;

export const BROWSER_SLOT_STALE_MS = STALE_MS;

function slotCount(raw) {
  const count = Number(raw);
  if (!Number.isInteger(count) || count < 1) throw new Error(`ROAM_BROWSER_SLOT_COUNT must be a whole number above 0, not "${raw}"`);
  return count;
}

function ownerOf(dir) {
  try {
    return readFileSync(join(dir, 'owner'), 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function dropStale(dir) {
  const seen = statSync(dir, { throwIfNoEntry: false });
  if (seen === undefined || Date.now() - seen.mtimeMs < STALE_MS) return false;
  if (statSync(dir, { throwIfNoEntry: false })?.ino !== seen.ino) return false;
  rmSync(dir, { recursive: true, force: true });
  return true;
}

function tryTake(dir, me) {
  try {
    mkdirSync(dir);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    return dropStale(dir) && tryTake(dir, me);
  }
  writeFileSync(join(dir, 'owner'), me);
  return true;
}

function beat(dir, me) {
  if (ownerOf(dir) !== me) throw new Error(`Browser slot ${dir} was taken over while this process held it, since it missed its heartbeat for ${STALE_MS / 1000} s`);
  const now = new Date();
  utimesSync(dir, now, now);
}

function hold(dir, me) {
  const timer = setInterval(() => beat(dir, me), BEAT_MS);
  timer.unref();
  let held = true;
  const release = () => {
    if (!held) return;
    held = false;
    clearInterval(timer);
    process.off('exit', release);
    if (ownerOf(dir) === me) rmSync(dir, { recursive: true, force: true });
  };
  process.on('exit', release);
  return release;
}

function owners(folder, count) {
  return Array.from({ length: count }, (_, i) => ownerOf(join(folder, `slot-${i}`)) ?? 'a starting browser');
}

export async function takeBrowserSlot(env = process.env, log = console.log) {
  const folder = env.ROAM_BROWSER_SLOTS;
  if (!folder) return () => {};
  return waitForSlot(folder, slotCount(env.ROAM_BROWSER_SLOT_COUNT), log);
}

async function waitForSlot(folder, count, log) {
  mkdirSync(folder, { recursive: true });
  const me = `${hostname()} ${process.pid}`;
  for (let waited = false; ; waited = true) {
    const release = takeFree(folder, count, me);
    if (release) return release;
    if (!waited) log(`Waiting for a browser slot. All ${count} are held, by ${owners(folder, count).join(', ')}.`);
    await new Promise((done) => setTimeout(done, POLL_MS));
  }
}

function takeFree(folder, count, me) {
  for (let i = 0; i < count; i++) {
    const dir = join(folder, `slot-${i}`);
    if (tryTake(dir, me)) return hold(dir, me);
  }
  return null;
}
