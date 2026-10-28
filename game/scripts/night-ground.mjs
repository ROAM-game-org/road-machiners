import { chromium } from 'playwright';
import { playUrl } from './game-url.mjs';
import { emulateWebGL2Floor } from './gpu-floor.mjs';

export const MISSING_GROUND_GATE = 0.05;
export const NIGHT_TURNS = 3;
const NIGHT_HOUR = 3;
const LIT_NPCS = 6;
const SETTLE_MS = 1500;
const SETTLE_FRAMES = 3;
const SENTINEL = 0xff00ff;
const GROUND_SAMPLE = 0.22;
const NEW_GAME_SETTINGS = { damage: 1, fuelUse: 1, supplyUse: 1, enemyGearGrowth: 1 };

const isNight = (page) => page.evaluate(async () => {
  const { sunAt } = await import('/src/sim/sun.ts');
  return !sunAt(window.__ROAM__.state.turn);
});

const lightUpNight = (page) => page.evaluate(async ([hour, npcs]) => {
  const cheats = await import('/src/sim/cheats.ts');
  const { NPCS } = await import('/src/data/npcs.ts');
  const g = window.__ROAM__;
  const kinds = Object.keys(NPCS);
  let w = cheats.skipToHour(g.state, hour);
  for (let i = 0; i < npcs; i++) w = cheats.spawnNear(w, kinds[i % kinds.length], false);
  g.apply({ ...w, player: { ...w.player, headlights: true } });
}, [NIGHT_HOUR, LIT_NPCS]);

const unlinkedPrograms = (page) => page.evaluate(() => {
  const g = window.__ROAM__;
  const gl = g.renderer.getContext();
  const programs = g.renderer.info.programs;
  const problems = programs.filter((p) => !gl.getProgramParameter(p.program, gl.LINK_STATUS)).map((p) => `program ${p.name || p.cacheKey.slice(p.cacheKey.lastIndexOf('}') + 1)} did not link`);
  if (!programs.some((p) => p.cacheKey.includes('facets'))) problems.push('no ground program found');
  return problems;
});

const overFloor = (page) => page.evaluate(() => (window.__gpuFloor ?? []).splice(0).map((r) => `${r.ground ? 'ground' : 'a'} program needs ${r.units} texture units`));

export const missingGroundShare = (page) => page.evaluate(([sentinel, sample]) => {
  const g = window.__ROAM__;
  const canvas = g.renderer.domElement;
  const renderWithBackground = () => {
    const background = g.scene.background.getHex();
    g.scene.background.setHex(sentinel);
    const copy = new OffscreenCanvas(canvas.width, canvas.height);
    try {
      try { g.renderer.render(g.scene, g.rig.camera); } catch {}
      copy.getContext('2d').drawImage(canvas, 0, 0);
    } finally {
      g.scene.background.setHex(background);
    }
    return copy.getContext('2d').getImageData(0, 0, copy.width, copy.height);
  };
  const truckOnCanvas = () => {
    const v = g.state.vehicles.find((x) => x.id === g.state.player.vehicleId);
    const at = g.debugScreenOf(v.pos.x, v.pos.y);
    const rect = canvas.getBoundingClientRect();
    const scale = canvas.width / rect.width;
    return { x: (at.x - rect.left) * scale, y: (at.y - rect.top) * scale };
  };
  const isSentinel = (data, i) => data[i] > 200 && data[i + 1] < 60 && data[i + 2] > 200;
  const shareInEllipse = (image, c, r) => {
    let inside = 0;
    let hits = 0;
    for (let y = Math.max(0, Math.floor(c.y - r)); y < Math.min(image.height, c.y + r); y += 2) {
      for (let x = Math.max(0, Math.floor(c.x - r)); x < Math.min(image.width, c.x + r); x += 2) {
        if ((x - c.x) ** 2 + (y - c.y) ** 2 > r * r) continue;
        inside++;
        if (isSentinel(image.data, (y * image.width + x) * 4)) hits++;
      }
    }
    return inside === 0 ? 1 : hits / inside;
  };
  const image = renderWithBackground();
  return shareInEllipse(image, truckOnCanvas(), sample * image.height);
}, [SENTINEL, GROUND_SAMPLE]);

const settle = async (page) => {
  await page.waitForTimeout(SETTLE_MS);
  await page.evaluate((frames) => new Promise((done) => {
    let left = frames;
    const next = () => (--left > 0 ? requestAnimationFrame(next) : done());
    requestAnimationFrame(next);
  }), SETTLE_FRAMES);
};

const playNightTurns = async (page, turns, turnLimitMs) => {
  for (let i = 0; i < turns; i++) {
    if (await page.evaluate(() => window.__ROAM__.state.call !== null)) await page.keyboard.press('Escape');
    const next = await page.evaluate(() => {
      const g = window.__ROAM__;
      g.endTurn();
      return g.state.turn + 1;
    });
    await page.waitForFunction((turn) => {
      const g = window.__ROAM__;
      return g.state.turn >= turn && !g.travel.isPlaying(g.anim);
    }, next, { timeout: turnLimitMs, polling: 50 });
  }
};

const reloadPage = (page) => page.reload().catch((e) => (/ERR_ABORTED/.test(e.message) ? page.reload() : Promise.reject(e)));

const waitForGame = async (page, bootLimitMs) => {
  await page.waitForFunction(() => window.__ROAM__?.state, null, { timeout: bootLimitMs });
  await page.waitForSelector('#boot', { state: 'detached', timeout: bootLimitMs });
};

export async function startNewGame(page, mode, bootLimitMs) {
  await page.evaluate(async ([mode, settings]) => {
    const { SAVE_KEY } = await import('/src/three/save.ts');
    const { requestBoot } = await import('/src/three/save-slots.ts');
    requestBoot(sessionStorage, SAVE_KEY, { new: { mode, settings }, intro: false });
  }, [mode, NEW_GAME_SETTINGS]);
  await page.reload();
  await waitForGame(page, bootLimitMs);
}

export async function checkNightGround(page, { mode, shot, bootLimitMs, turnLimitMs, nightTurns }) {
  const problems = [];
  const check = async (step) => {
    await settle(page);
    const share = await missingGroundShare(page);
    console.log(`night ${mode} at ${step}: missing ground share ${share.toFixed(3)}`);
    if (share > MISSING_GROUND_GATE) problems.push(`ground missing in ${mode} at ${step}: magenta share ${share.toFixed(2)}`);
    for (const p of [...(await unlinkedPrograms(page)), ...(await overFloor(page))]) problems.push(`${mode} at ${step}: ${p}`);
  };
  await lightUpNight(page);
  await check('the night peak');
  if (nightTurns > 0) {
    await playNightTurns(page, nightTurns, turnLimitMs);
    await check('night turns');
  }
  await reloadPage(page);
  await waitForGame(page, bootLimitMs);
  if (!(await isNight(page))) await lightUpNight(page);
  await check('a reload at night');
  await page.screenshot({ path: shot });
  return problems;
}

export async function checkHighwayNightInSoftware(url, { shot, bootLimitMs }) {
  const browser = await chromium.launch({ args: ['--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  if (bootLimitMs === 0) page.setDefaultTimeout(0);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.stack ?? e.message));
  page.on('crash', () => errors.push('the software browser crashed in Chaos Highway'));
  try {
    await emulateWebGL2Floor(page);
    await page.goto(playUrl(url));
    await waitForGame(page, bootLimitMs);
    await startNewGame(page, 'chaosHighway', bootLimitMs);
    const problems = await checkNightGround(page, { mode: 'chaosHighway', shot, bootLimitMs, turnLimitMs: 0, nightTurns: 0 });
    return [...errors, ...problems];
  } catch (e) {
    return [...errors, `the Chaos Highway night check stopped: ${e.message}`];
  } finally {
    await browser.close();
  }
}
