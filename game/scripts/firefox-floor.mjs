import { firefox } from 'playwright';
import { playUrl } from './game-url.mjs';
import { lightUpNight, playNightTurns, startNewGame, waitForGame } from './night-ground.mjs';

const HARDENED_PREFS = { 'webgl.force-enabled': true, 'webgl.forbid-software': false, 'privacy.resistFingerprinting': true };
const SOFTWARE_GL = { MOZ_HEADLESS: '1', LIBGL_ALWAYS_SOFTWARE: '1', MOZ_WEBGL_FORCE_EGL: '1' };
const EXPECTED_VARYING_LIMIT = 8;
const SETTLE_MS = 20000;
const NIGHT_SETTLE_MS = 45000;
const DAY_TURNS = 1;
const TURN_LIMIT_MS = 600000;
const ATTEMPTS = 3;
const PAUSE_MS = 30000;
const CRASHED = /crashed|boot screen stayed up/;

const countLinks = () => {
  window.__links = { linked: 0, failed: [] };
  const context = WebGL2RenderingContext.prototype;
  const link = context.linkProgram;
  context.linkProgram = function (program) {
    link.call(this, program);
    if (this.getProgramParameter(program, this.LINK_STATUS)) window.__links.linked++;
    else window.__links.failed.push(this.getProgramInfoLog(program) ?? 'no log');
  };
};

const readLinks = (page) => page.evaluate(() => window.__links);

async function judge(page, step, seen) {
  const links = await readLinks(page);
  const problems = links.failed.slice(seen.failed).map((log) => `${step}: a program did not link: ${log}`);
  if (links.linked === seen.linked) problems.push(`${step}: no program linked since the last step`);
  seen.failed = links.failed.length;
  seen.linked = links.linked;
  return problems;
}

async function playHardened(page, url, bootLimitMs, errors) {
  const seen = { linked: 0, failed: 0 };
  const problems = [];
  await page.goto(playUrl(url));
  await waitForGame(page, bootLimitMs);
  const limit = await page.evaluate(() => {
    const gl = window.__ROAM__.renderer.getContext();
    return gl.getParameter(gl.MAX_VARYING_VECTORS);
  });
  console.log(`hardened Firefox reports ${limit} varying vectors`);
  if (limit > EXPECTED_VARYING_LIMIT) problems.push(`the hardened Firefox pass reports ${limit} varying vectors, not ${EXPECTED_VARYING_LIMIT}, so it does not test the low limit`);
  await page.waitForTimeout(SETTLE_MS);
  if (errors.length > 0) throw new Error('the game raised an error while it settled by day');
  await playNightTurns(page, DAY_TURNS, TURN_LIMIT_MS);
  problems.push(...(await judge(page, 'Roaming by day', seen)));
  await lightUpNight(page);
  await page.waitForTimeout(NIGHT_SETTLE_MS);
  problems.push(...(await judge(page, 'Roaming at night', seen)));
  await startNewGame(page, 'chaosHighway', bootLimitMs);
  await lightUpNight(page);
  await page.waitForTimeout(NIGHT_SETTLE_MS);
  problems.push(...(await judge(page, 'Chaos Highway at night', seen)));
  return problems;
}

async function tryHardenedFirefox(url, { bootLimitMs }) {
  const browser = await firefox.launch({ headless: true, env: { ...process.env, ...SOFTWARE_GL }, firefoxUserPrefs: HARDENED_PREFS });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  if (bootLimitMs === 0) page.setDefaultTimeout(0);
  const errors = [];
  page.on('pageerror', (e) => errors.push(`hardened Firefox page error: ${(e.stack ?? e.message).split('\n')[0]}`));
  page.on('crash', () => errors.push('hardened Firefox crashed'));
  await page.addInitScript(countLinks);
  try {
    return [...(await playHardened(page, url, bootLimitMs, errors)), ...errors];
  } catch (e) {
    return [...errors, `the hardened Firefox check stopped: ${e.message}`];
  } finally {
    await browser.close();
  }
}

export async function checkHardenedFirefox(url, options) {
  let problems = [];
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    problems = await tryHardenedFirefox(url, options);
    if (!problems.some((p) => CRASHED.test(p))) return problems;
    console.log(`Hardened Firefox crashed on attempt ${attempt}.`);
    await new Promise((done) => setTimeout(done, PAUSE_MS * attempt));
  }
  return problems;
}
